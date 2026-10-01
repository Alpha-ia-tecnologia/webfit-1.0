import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup, prepareRestore } from "../src/lib/backup";
import { initialState } from "../src/lib/domain";
import {
  compareWithServer,
  createSyncQueue,
  deleteServerCopy,
  fetchServerState,
  isRestoreCode,
  pushState,
  SERVER_SYNC_COPY,
  syncStatusLabel,
  type SyncRequest,
  type SyncStatus,
} from "../src/lib/server-sync";
import { stateSchema, type AppState } from "../src/types";

type Call = { path: string; method: string; body?: string };
/** Servidor de mentira: guarda os pedidos e responde na ordem dada. */
function fakeServer(...responses: Array<{ status: number; data?: unknown } | Error>) {
  const calls: Call[] = [];
  const request: SyncRequest = async (path, init) => {
    calls.push({ path, method: init.method, body: init.body });
    const next = responses.shift() ?? { status: 200, data: {} };
    if (next instanceof Error) throw next;
    return { status: next.status, data: next.data ?? null };
  };
  return { request, calls };
}
const withRevision = (revision: number): AppState => ({ ...initialState(), revision });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("o estado novo nasce com a cópia no servidor desligada e backups antigos também", () => {
  assert.equal(initialState().serverSync, false);
  const old: Record<string, unknown> = { ...initialState() };
  delete old.serverSync;
  assert.equal(stateSchema.parse(old).serverSync, false);
});

test("restaurar um backup não liga nem desliga a cópia no servidor deste aparelho", () => {
  const backup = parseBackup(JSON.stringify({ ...initialState(), serverSync: true }));
  assert.equal(prepareRestore(backup, withRevision(3)).serverSync, false);
  const on = { ...withRevision(3), serverSync: true };
  assert.equal(prepareRestore({ ...backup, serverSync: false }, on).serverSync, true);
});

test("pushState envia o estado com PUT e traduz as respostas do servidor", async () => {
  const state = withRevision(5);
  const ok = fakeServer({ status: 200, data: { revision: 5 } });
  assert.equal((await pushState(ok.request, state)).kind, "synced");
  assert.deepEqual(ok.calls.map((c) => [c.method, c.path]), [["PUT", "/api/sync"]]);
  assert.equal(JSON.parse(ok.calls[0].body!).revision, 5);

  const forced = fakeServer({ status: 200 });
  await pushState(forced.request, state, true);
  assert.equal(forced.calls[0].path, "/api/sync?force=1");

  const newer = await pushState(fakeServer({ status: 409, data: { serverRevision: 9 } }).request, state);
  assert.deepEqual(newer, { kind: "conflict", serverRevision: 9 });
  // A mesma revisão já está no servidor (resposta perdida e reenvio): está em dia, não é conflito.
  const same = await pushState(fakeServer({ status: 409, data: { serverRevision: 5 } }).request, state);
  assert.equal(same.kind, "synced");

  const sem = await pushState(fakeServer({ status: 503, data: { error: "x", configured: false } }).request, state);
  assert.equal(sem.kind, "unavailable");
  assert.deepEqual(await pushState(fakeServer(new Error("rede")).request, state), {
    kind: "error",
    message: SERVER_SYNC_COPY.offline,
    retry: true,
  });
});

test("pushState só pede nova tentativa para falhas passageiras; cópia recusada não volta sozinha", async () => {
  const state = withRevision(5);
  const push = (status: number, data: unknown = { error: "Recusado pelo servidor." }) =>
    pushState(fakeServer({ status, data }).request, state);
  // Banco fora do ar (503 com banco configurado), sessão trocada, limite, prazo e erro interno: tenta de novo.
  for (const status of [503, 401, 408, 429, 500, 502])
    assert.deepEqual(await push(status), { kind: "error", message: SERVER_SYNC_COPY.offline, retry: true }, String(status));
  // Corpo grande demais, dados recusados ou limite de cópias: não adianta reenviar os mesmos dados.
  for (const status of [400, 413, 422, 507])
    assert.deepEqual(await push(status), { kind: "error", message: "Recusado pelo servidor.", retry: false }, String(status));
  assert.equal(syncStatusLabel({ kind: "error", message: "x", retry: false }).label, "Cópia recusada");
});

test("compareWithServer diz se o aparelho está à frente, igual ou atrás do servidor", async () => {
  const state = withRevision(4);
  const compare = (status: number, data: unknown) => compareWithServer(fakeServer({ status, data }).request, state);
  assert.deepEqual(await compare(200, { configured: true, revision: null }), { relation: "behind", revision: null });
  assert.deepEqual(await compare(200, { configured: true, revision: 2 }), { relation: "behind", revision: 2 });
  assert.deepEqual(await compare(200, { configured: true, revision: 4 }), { relation: "same", revision: 4 });
  assert.deepEqual(await compare(200, { configured: true, revision: 7 }), { relation: "ahead", revision: 7 });
  const unavailable = { relation: "unavailable", revision: null };
  assert.deepEqual(await compare(200, { configured: false, revision: null }), unavailable);
  assert.deepEqual(await compare(401, { error: "Sessão inválida." }), unavailable);
  assert.deepEqual(await compareWithServer(fakeServer(new Error("rede")).request, state), unavailable);
  const { calls, request } = fakeServer({ status: 200, data: { configured: true, revision: 4 } });
  await compareWithServer(request, state);
  assert.equal(calls[0].path, `/api/sync/status?userId=${state.userId}`);
});

test("fetchServerState confere o código e a cópia como um backup em arquivo", async () => {
  const remote = { ...withRevision(8), serverSync: true };
  const { request, calls } = fakeServer({ status: 200, data: { state: remote } });
  assert.deepEqual(await fetchServerState(request, ` ${remote.userId.toUpperCase()} `), stateSchema.parse(remote));
  assert.equal(calls[0].path, `/api/sync/state?userId=${remote.userId}`);

  await assert.rejects(fetchServerState(fakeServer().request, "abc"), { message: SERVER_SYNC_COPY.invalidCode });
  await assert.rejects(fetchServerState(fakeServer({ status: 404 }).request, remote.userId), {
    message: SERVER_SYNC_COPY.notFound,
  });
  await assert.rejects(fetchServerState(fakeServer(new Error("rede")).request, remote.userId), {
    message: SERVER_SYNC_COPY.offline,
  });
  // Cópia com registro de outro perfil: recusada pelas mesmas regras do backup em arquivo.
  const now = new Date().toISOString();
  const foreign = {
    ...remote,
    diary: [
      {
        id: "d1",
        userId: crypto.randomUUID(),
        date: "2026-09-30",
        time: "08:00",
        createdAt: now,
        updatedAt: now,
        type: "agua",
        title: "Água",
        description: "",
        amountMl: 250,
      },
    ],
  };
  assert.equal(stateSchema.safeParse(foreign).success, true);
  await assert.rejects(fetchServerState(fakeServer({ status: 200, data: { state: foreign } }).request, remote.userId), {
    message: /perfis diferentes/,
  });
});

test("deleteServerCopy devolve se a cópia saiu do servidor", async () => {
  const id = crypto.randomUUID();
  const { request, calls } = fakeServer({ status: 200, data: { deleted: true } });
  assert.equal(await deleteServerCopy(request, id), true);
  assert.deepEqual(calls[0], { path: `/api/sync?userId=${id}`, method: "DELETE", body: undefined });
  assert.equal(await deleteServerCopy(fakeServer({ status: 503 }).request, id), false);
  assert.equal(await deleteServerCopy(fakeServer(new Error("rede")).request, id), false);
});

test("isRestoreCode aceita só o formato do código do aparelho", () => {
  assert.equal(isRestoreCode(crypto.randomUUID()), true);
  assert.equal(isRestoreCode("1234"), false);
  assert.equal(isRestoreCode("'; drop table x; --"), false);
});

test("a fila envia só a versão mais recente, depois do intervalo", async () => {
  const pushed: number[] = [];
  const statuses: SyncStatus["kind"][] = [];
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      return { kind: "synced", at: "2026-09-30T10:00:00.000Z" };
    },
    onStatus: (status) => statuses.push(status.kind),
    delayMs: 5,
  });
  queue.schedule(withRevision(1));
  queue.schedule(withRevision(2));
  queue.schedule(withRevision(3));
  await wait(30);
  assert.deepEqual(pushed, [3]);
  assert.deepEqual(statuses, ["pending", "synced"]);
});

test("a fila envia de novo a versão que chegou durante um envio", async () => {
  const pushed: number[] = [];
  let release: () => void = () => undefined;
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      if (state.revision === 1) await new Promise<void>((resolve) => (release = resolve));
      return { kind: "synced", at: "" };
    },
    onStatus: () => undefined,
    delayMs: 1000,
  });
  queue.schedule(withRevision(1));
  const first = queue.flush();
  await wait(0);
  queue.schedule(withRevision(2));
  release();
  await first;
  await queue.flush();
  assert.deepEqual(pushed, [1, 2]);
  queue.cancel();
});

test("cancelar durante um envio que falha não agenda nova tentativa nem muda a situação", async () => {
  const statuses: SyncStatus["kind"][] = [];
  const pushed: number[] = [];
  let fail: () => void = () => undefined;
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      await new Promise<void>((resolve) => (fail = resolve));
      return { kind: "error", message: "offline", retry: true };
    },
    onStatus: (status) => statuses.push(status.kind),
    delayMs: 1,
    retryMs: 5,
  });
  queue.schedule(withRevision(1));
  await wait(10);
  queue.cancel();
  fail();
  await queue.settle();
  await wait(30);
  assert.deepEqual(pushed, [1]);
  assert.deepEqual(statuses, ["pending"]);
});

test("cópia recusada para a fila até a próxima gravação", async () => {
  const pushed: number[] = [];
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      return { kind: "error", message: "Corpo grande demais.", retry: false };
    },
    onStatus: () => undefined,
    delayMs: 1,
    retryMs: 5,
  });
  queue.schedule(withRevision(1));
  await wait(40);
  assert.deepEqual(pushed, [1]);
  queue.schedule(withRevision(2));
  await wait(20);
  assert.deepEqual(pushed, [1, 2]);
});

test("a fila tenta de novo depois de falha de rede e para no conflito", async () => {
  const results: SyncStatus[] = [
    { kind: "error", message: "offline", retry: true },
    { kind: "synced", at: "" },
  ];
  const pushed: number[] = [];
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      return results.shift()!;
    },
    onStatus: () => undefined,
    delayMs: 1,
    retryMs: 5,
  });
  queue.schedule(withRevision(4));
  await wait(40);
  assert.deepEqual(pushed, [4, 4]);

  const conflicts: number[] = [];
  const stopped = createSyncQueue({
    push: async (state) => {
      conflicts.push(state.revision);
      return { kind: "conflict", serverRevision: 9 };
    },
    onStatus: () => undefined,
    delayMs: 1,
    retryMs: 5,
  });
  stopped.schedule(withRevision(5));
  await wait(40);
  assert.deepEqual(conflicts, [5]);
});

test("cancelar descarta o envio agendado e settle espera o que está em andamento", async () => {
  const pushed: number[] = [];
  let finished = false;
  const queue = createSyncQueue({
    push: async (state) => {
      pushed.push(state.revision);
      await wait(10);
      finished = true;
      return { kind: "synced", at: "" };
    },
    onStatus: () => undefined,
    delayMs: 5,
  });
  queue.schedule(withRevision(1));
  queue.cancel();
  await wait(20);
  assert.deepEqual(pushed, []);

  queue.schedule(withRevision(2));
  void queue.flush();
  await queue.settle();
  assert.equal(finished, true);
  assert.deepEqual(pushed, [2]);
});

test("o selo da situação nunca usa vermelho e mostra a hora local do último envio", () => {
  assert.deepEqual(syncStatusLabel({ kind: "off" }), { label: "Desligada", tone: "" });
  const at = new Date(2026, 8, 30, 7, 5).toISOString();
  assert.deepEqual(syncStatusLabel({ kind: "synced", at }), { label: "Atualizada às 07:05", tone: "ok" });
  assert.equal(syncStatusLabel({ kind: "unavailable" }).tone, "attention");
  assert.equal(syncStatusLabel({ kind: "conflict", serverRevision: 2 }).tone, "attention");
  assert.deepEqual(syncStatusLabel({ kind: "error", message: "x", retry: true }), {
    label: "Aguardando conexão",
    tone: "attention",
  });
});
