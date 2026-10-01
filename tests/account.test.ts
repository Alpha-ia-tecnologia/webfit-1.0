import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adoptIntoAccount,
  AUTH_COPY,
  fetchMe,
  freshAccountState,
  hasPersonalData,
  logIn,
  logOut,
  prepareSignIn,
  quotaLabel,
  signInPlan,
} from "../src/lib/account";
import { initialState } from "../src/lib/domain";
import type { SyncRequest } from "../src/lib/server-sync";
import { stateFixture } from "./fixtures";

const ACCOUNT = "0b8f2c1e-5d7a-4c3b-9e21-7f6a5d4c3b2a";

test("estado novo não tem dados pessoais; anamnese, diário ou hábitos têm", () => {
  assert.equal(hasPersonalData(initialState()), false);
  assert.equal(hasPersonalData(stateFixture()), true);
  assert.equal(hasPersonalData({ ...initialState(), habits: stateFixture().habits }), stateFixture().habits.length > 0);
});

test("adotar na conta troca o userId de tudo e liga a cópia, sem mexer no conteúdo", () => {
  const before = stateFixture();
  const after = adoptIntoAccount(before, ACCOUNT);
  assert.equal(after.userId, ACCOUNT);
  assert.equal(after.serverSync, true);
  assert.ok(after.diary.every((entry) => entry.userId === ACCOUNT));
  assert.ok(after.injections.every((entry) => entry.userId === ACCOUNT));
  assert.deepEqual(after.profile, before.profile);
  assert.equal(after.diary.length, before.diary.length);
  assert.equal(after.revision, before.revision);
  // O original não muda.
  assert.notEqual(before.userId, ACCOUNT);
});

test("ao entrar: aparelho da conta segue, conta sem cópia adota, aparelho vazio baixa e os dois com dados perguntam", () => {
  const empty = initialState();
  const full = stateFixture();
  assert.equal(signInPlan({ ...full, userId: ACCOUNT }, ACCOUNT, 7), "keep");
  assert.equal(signInPlan(full, ACCOUNT, null), "adopt");
  assert.equal(signInPlan(empty, ACCOUNT, null), "adopt");
  assert.equal(signInPlan(empty, ACCOUNT, 4), "download");
  assert.equal(signInPlan(full, ACCOUNT, 4), "choose");
});

test("dados de outra conta neste aparelho nunca vão para a conta que entra", () => {
  const other = "6a1d9e0f-3b2c-4d5e-8f70-1a2b3c4d5e6f";
  const previous = { ...stateFixture(), userId: other };
  assert.equal(signInPlan(previous, ACCOUNT, 3, other), "download");
  assert.equal(signInPlan(previous, ACCOUNT, null, other), "fresh");
  // A mesma conta de antes, ou nenhuma registrada: segue a regra normal.
  assert.equal(signInPlan(previous, ACCOUNT, null, ACCOUNT), "adopt");
  assert.equal(signInPlan(previous, ACCOUNT, 3, null), "choose");
  // Sem a lembrança do navegador (apagada ou bloqueada), o próprio estado diz que é de outra conta.
  const bound = { ...previous, accountBound: true };
  assert.equal(signInPlan(bound, ACCOUNT, null, null), "fresh");
  assert.equal(signInPlan(bound, ACCOUNT, 3, null), "download");
  assert.equal(adoptIntoAccount(stateFixture(), ACCOUNT).accountBound, true);
  const fresh = freshAccountState(ACCOUNT);
  assert.equal(fresh.userId, ACCOUNT);
  assert.equal(fresh.serverSync, true);
  assert.equal(hasPersonalData(fresh), false);
});

test("login manda e-mail, senha e o tipo de cliente; erros do servidor e falta de rede viram frases", async () => {
  const calls: { path: string; body?: string }[] = [];
  const ok: SyncRequest = async (path, init) => {
    calls.push({ path, body: init.body });
    return { status: 200, data: { account: { id: ACCOUNT, email: "a@b.co", name: "", role: "member" }, token: "t" } };
  };
  const result = await logIn(ok, "a@b.co", "segredo123", "app");
  assert.equal(result.token, "t");
  assert.deepEqual(JSON.parse(calls[0].body!), { email: "a@b.co", password: "segredo123", client: "app" });
  assert.equal(calls[0].path, "/api/auth/login");

  const refused: SyncRequest = async () => ({ status: 401, data: { error: "E-mail ou senha não conferem." } });
  await assert.rejects(logIn(refused, "a@b.co", "x"), { message: "E-mail ou senha não conferem." });
  const offline: SyncRequest = async () => {
    throw new Error("rede");
  };
  await assert.rejects(logIn(offline, "a@b.co", "x"), { message: AUTH_COPY.offline });
  // Sair sem rede não é erro para a pessoa.
  await logOut(offline);
});

test("fetchMe devolve a conta e o uso de IA, ou null sem sessão", async () => {
  const me = { account: { id: ACCOUNT, email: "a@b.co", name: "A", role: "member" }, ai: { used: 3, limit: 30 } };
  assert.deepEqual(await fetchMe(async () => ({ status: 200, data: me })), me);
  assert.equal(await fetchMe(async () => ({ status: 401, data: { error: "x" } })), null);
  assert.equal(
    await fetchMe(async () => {
      throw new Error("rede");
    }),
    null,
  );
});

test("prepareSignIn: adota sem cópia, baixa a da conta, pergunta quando os dois têm dados e falha sem servidor", async () => {
  const full = stateFixture();
  const remote = { ...stateFixture(), userId: ACCOUNT, revision: 9, profile: { ...full.profile!, name: "Da conta" } };
  const server =
    (revision: number | null): SyncRequest =>
    async (path) =>
      path.startsWith("/api/sync/status")
        ? { status: 200, data: { configured: true, revision } }
        : { status: 200, data: { state: remote } };
  const never = async () => {
    throw new Error("não devia perguntar");
  };

  const adopted = await prepareSignIn(server(null), full, ACCOUNT, null, never);
  assert.equal(adopted.next?.userId, ACCOUNT);
  assert.equal(adopted.next?.profile?.name, full.profile?.name);

  const downloaded = await prepareSignIn(server(9), initialState(), ACCOUNT, null, never);
  assert.equal(downloaded.next?.profile?.name, "Da conta");
  assert.equal(downloaded.next?.revision, 9);
  assert.equal(downloaded.next?.serverSync, true);

  // Os dois com dados: "usar os da conta" baixa; "enviar os deste aparelho" adota à frente da conta.
  assert.equal((await prepareSignIn(server(9), full, ACCOUNT, null, async () => true)).next?.profile?.name, "Da conta");
  const mine = await prepareSignIn(server(9), full, ACCOUNT, null, async () => false);
  assert.equal(mine.next?.profile?.name, full.profile?.name);
  assert.ok(mine.next!.revision > 9);

  assert.deepEqual(await prepareSignIn(server(3), { ...full, userId: ACCOUNT }, ACCOUNT, ACCOUNT, never), { next: null });
  const offline: SyncRequest = async () => {
    throw new Error("rede");
  };
  await assert.rejects(prepareSignIn(offline, full, ACCOUNT, null, never), { message: AUTH_COPY.offline });
});

test("uso de IA em Ajustes", () => {
  assert.equal(quotaLabel({ used: 3, limit: 30 }), "3 de 30 hoje");
  assert.equal(quotaLabel({ used: 12, limit: null }), "12 hoje · sem limite");
});
