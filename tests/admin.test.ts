import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_COPY,
  createInviteCode,
  createResetCode,
  fetchAccounts,
  fetchInvites,
  fmtAdminDate,
  inviteMessage,
  inviteStatusLabel,
  revokeInvite,
  setAccountDisabled,
  setAccountRole,
  type AdminAccount,
  type AdminInvite,
} from "../src/lib/admin";
import type { SyncRequest } from "../src/lib/server-sync";

const ACCOUNT = "0b8f2c1e-5d7a-4c3b-9e21-7f6a5d4c3b2a";
const HASH = "a".repeat(64);
// Meio-dia UTC: a mesma data em qualquer fuso do Brasil (e de quase todo o mundo).
const EXPIRES = "2026-10-15T12:00:00.000Z";

const INVITE: AdminInvite = {
  id: HASH,
  note: "Ana",
  createdAt: "2026-10-01T12:00:00.000Z",
  expiresAt: EXPIRES,
  usedAt: null,
  usedBy: null,
  status: "pending",
};
const MEMBER: AdminAccount = {
  id: ACCOUNT,
  email: "ana@exemplo.com",
  name: "Ana",
  role: "member",
  disabled: false,
  createdAt: "2026-09-30T12:00:00.000Z",
  aiToday: 3,
};

type Call = { path: string; method: string; body?: unknown };

/** Servidor falso: guarda os pedidos e responde sempre o mesmo. */
function fake(status: number, data: unknown) {
  const calls: Call[] = [];
  const request: SyncRequest = async (path, init) => {
    calls.push({ path, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return { status, data };
  };
  return { calls, request };
}
const offline: SyncRequest = async () => {
  throw new Error("rede");
};

test("lista os convites com GET /api/admin/invites", async () => {
  const { calls, request } = fake(200, { invites: [INVITE] });
  assert.deepEqual(await fetchInvites(request), [INVITE]);
  assert.deepEqual(calls, [{ path: "/api/admin/invites", method: "GET", body: undefined }]);
});

test("gera convite com nota aparada e 14 dias por padrão; validade fora de 1..365 nem chega ao servidor", async () => {
  const { calls, request } = fake(200, { code: "ABCD-EFGH-JKLM-NPQR", invite: INVITE });
  const result = await createInviteCode(request, { note: "  Ana  " });
  assert.equal(result.code, "ABCD-EFGH-JKLM-NPQR");
  assert.deepEqual(calls[0], { path: "/api/admin/invites", method: "POST", body: { note: "Ana", days: 14 } });
  await createInviteCode(request, { days: 365 });
  assert.deepEqual(calls[1].body, { note: "", days: 365 });

  for (const days of [0, 366, 2.5, Number.NaN]) {
    await assert.rejects(createInviteCode(request, { days }), { message: ADMIN_COPY.invalidDays });
  }
  await assert.rejects(createInviteCode(request, { note: "x".repeat(121) }), { message: ADMIN_COPY.longNote });
  assert.equal(calls.length, 2);
});

test("revoga pelo id com DELETE; convite já usado traz a frase do servidor", async () => {
  const ok = fake(200, { ok: true });
  await revokeInvite(ok.request, HASH);
  assert.deepEqual(ok.calls, [{ path: `/api/admin/invites/${HASH}`, method: "DELETE", body: undefined }]);
  const used = fake(409, { error: "Este convite já foi usado." });
  await assert.rejects(revokeInvite(used.request, HASH), { message: "Este convite já foi usado." });
});

test("lista as contas com GET /api/admin/accounts", async () => {
  const { calls, request } = fake(200, { accounts: [MEMBER] });
  assert.deepEqual(await fetchAccounts(request), [MEMBER]);
  assert.equal(calls[0].path, "/api/admin/accounts");
  assert.equal(calls[0].method, "GET");
});

test("código de senha, bloqueio e papel vão para a rota da conta", async () => {
  const reset = fake(200, { code: "RSET-CODE-0000-1111", expiresAt: EXPIRES });
  assert.deepEqual(await createResetCode(reset.request, ACCOUNT), { code: "RSET-CODE-0000-1111", expiresAt: EXPIRES });
  assert.deepEqual(reset.calls, [{ path: `/api/admin/accounts/${ACCOUNT}/reset`, method: "POST", body: undefined }]);

  const ok = fake(200, { ok: true });
  await setAccountDisabled(ok.request, ACCOUNT, true);
  await setAccountRole(ok.request, ACCOUNT, "owner");
  assert.deepEqual(ok.calls, [
    { path: `/api/admin/accounts/${ACCOUNT}/status`, method: "POST", body: { disabled: true } },
    { path: `/api/admin/accounts/${ACCOUNT}/role`, method: "POST", body: { role: "owner" } },
  ]);
});

test("erros: frase do servidor, reserva sem frase, resposta inválida e falta de conexão", async () => {
  const self = fake(400, { error: "Você não pode bloquear a própria conta." });
  await assert.rejects(setAccountDisabled(self.request, ACCOUNT, true), {
    message: "Você não pode bloquear a própria conta.",
  });
  await assert.rejects(setAccountRole(fake(403, { error: "Só quem administra o WebFit pode fazer isso." }).request, ACCOUNT, "member"), {
    message: "Só quem administra o WebFit pode fazer isso.",
  });
  await assert.rejects(createResetCode(fake(500, null).request, ACCOUNT), { message: ADMIN_COPY.failed });
  await assert.rejects(fetchInvites(fake(200, { invites: "não" }).request), { message: ADMIN_COPY.failed });
  await assert.rejects(fetchAccounts(fake(200, null).request), { message: ADMIN_COPY.failed });
  const expected = "Sem conexão com o servidor. Confira a internet e tente de novo.";
  assert.equal(ADMIN_COPY.offline, expected);
  for (const run of [
    () => fetchInvites(offline),
    () => createInviteCode(offline),
    () => revokeInvite(offline, HASH),
    () => fetchAccounts(offline),
    () => createResetCode(offline, ACCOUNT),
    () => setAccountDisabled(offline, ACCOUNT, false),
    () => setAccountRole(offline, ACCOUNT, "member"),
  ]) {
    await assert.rejects(run(), { message: expected });
  }
});

test("mensagem do convite: código, endereço sem barra final e validade dd/mm/aaaa", () => {
  assert.equal(
    inviteMessage("ABCD-EFGH-JKLM-NPQR", "https://webfit.exemplo.com/", EXPIRES),
    "Seu convite para o WebFit: ABCD-EFGH-JKLM-NPQR. Acesse https://webfit.exemplo.com, toque em Criar conta e use este código. Ele vale até 15/10/2026, para uma conta.",
  );
  assert.equal(fmtAdminDate("2026-01-05T12:00:00.000Z"), "05/01/2026");
  assert.equal(fmtAdminDate("não é data"), "");
});

test("selo do convite: pendente, usado por quem e vencido", () => {
  assert.equal(inviteStatusLabel(INVITE), "Pendente");
  assert.equal(inviteStatusLabel({ status: "used", usedBy: "ana@exemplo.com" }), "Usado por ana@exemplo.com");
  assert.equal(inviteStatusLabel({ status: "used", usedBy: null }), "Usado");
  assert.equal(inviteStatusLabel({ status: "expired", usedBy: null }), "Vencido");
});
