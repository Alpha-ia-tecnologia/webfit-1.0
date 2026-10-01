import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";
import express from "express";
import type pg from "pg";
import { createPool, databaseTarget, withClient } from "../server/db/client";
import {
  consumeAiRequest,
  createInvite,
  createPasswordReset,
  setDisabled,
  setRole,
  type Account,
} from "../server/auth/repo";
import { registerAuth, SESSION_COOKIE } from "../server/auth/routes";
import { registerAdmin } from "../server/auth/admin-routes";
import { registerSync } from "../server/sync";
import { initialState } from "../src/lib/domain";
import type { AppState } from "../src/types";

config({ path: ".env.local", quiet: true });
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL não definida";

/** Domínio reservado (RFC 2606): nenhum e-mail de teste existe de verdade. */
const DOMAIN = "teste-webfit.invalid";
const PASSWORD = "senha de teste 123";
const withDb = <T>(work: (client: pg.Client) => Promise<T>) => withClient(databaseTarget().url, work);

/** Servidor só com contas e cópia (o mesmo arranjo do modo online em server/index.ts). */
async function startServer(aiDailyLimit = 2) {
  const pool = createPool(process.env.DATABASE_URL);
  const app = express();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = registerAuth(app, { publicOrigin: origin, aiDailyLimit, getPool: () => pool });
  registerAdmin(app, { getPool: () => pool, requireAccount: auth.requireAccount, publicOrigin: origin });
  registerSync(app, {
    getPool: () => pool,
    authorize: async (req) => {
      const found = await auth.accountFor(req);
      return found ? { accountId: found.account.id } : null;
    },
  });
  const call = async (
    path: string,
    {
      method = "GET",
      body,
      token,
      cookie,
      from = origin,
    }: { method?: string; body?: unknown; token?: string; cookie?: string; from?: string | null } = {},
  ) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
        ...(from && method !== "GET" ? { Origin: from } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    return { status: response.status, data: (await response.json()) as Record<string, unknown>, setCookie };
  };
  return {
    call,
    close: async () => {
      server.close();
      await pool.end();
    },
  };
}

async function cleanup() {
  await withDb(async (client) => {
    await client.query("delete from webfit.users where id in (select id from webfit.accounts where email like $1)", [
      `%@${DOMAIN}`,
    ]);
    await client.query("delete from webfit.accounts where email like $1", [`%@${DOMAIN}`]);
    await client.query("delete from webfit.invites where note = $1", ["teste automatizado"]);
  });
}

const email = (name: string) => `${name}-${Date.now()}@${DOMAIN}`;
const invite = () => withDb((client) => createInvite(client, "teste automatizado"));
const stateOf = (userId: string, revision = 1): AppState => ({ ...initialState(), userId, revision });

test("convite, cadastro, login e sessão (cookie no navegador, token no app)", { skip }, async () => {
  const server = await startServer();
  try {
    const code = await invite();
    const maria = email("maria");
    // Sem convite válido não há conta.
    const noInvite = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: "AAAA-BBBB-CCCC-DDDD", email: maria, password: PASSWORD },
    });
    assert.equal(noInvite.status, 400);
    const weak = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: code, email: maria, password: "curta" },
    });
    assert.equal(weak.status, 400);

    // Navegador: a sessão vem só no cookie HttpOnly/Secure/SameSite=Strict, nunca no corpo.
    const signup = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: code.toLowerCase(), email: maria.toUpperCase(), password: PASSWORD, name: "Maria" },
    });
    assert.equal(signup.status, 200);
    assert.equal((signup.data.account as Account).email, maria);
    assert.equal(signup.data.token, undefined);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api"]) assert.ok(signup.setCookie.includes(flag), flag);
    const cookie = /=([\w-]+);/.exec(signup.setCookie)![1];

    // O convite vale uma vez.
    const again = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: code, email: email("outra"), password: PASSWORD },
    });
    assert.equal(again.status, 400);
    // Mesmo e-mail com outro convite: conflito.
    const dup = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: await invite(), email: maria, password: PASSWORD },
    });
    assert.equal(dup.status, 409);

    const me = await server.call("/api/auth/me", { cookie });
    assert.equal(me.status, 200);
    assert.deepEqual(me.data.ai, { used: 0, limit: 2 });

    // App: o token volta no corpo e vale como Bearer.
    const wrong = await server.call("/api/auth/login", { method: "POST", body: { email: maria, password: "errada123" } });
    assert.equal(wrong.status, 401);
    const app = await server.call("/api/auth/login", {
      method: "POST",
      body: { email: maria, password: PASSWORD, client: "app" },
      from: null,
    });
    assert.equal(app.status, 200);
    assert.equal(typeof app.data.token, "string");
    assert.equal(app.setCookie, "");
    const appToken = app.data.token as string;
    assert.equal((await server.call("/api/auth/me", { token: appToken })).status, 200);

    // Sair encerra só aquela sessão.
    assert.equal((await server.call("/api/auth/logout", { method: "POST", token: appToken, from: null })).status, 200);
    assert.equal((await server.call("/api/auth/me", { token: appToken })).status, 401);
    assert.equal((await server.call("/api/auth/me", { cookie })).status, 200);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("cookie de outra origem não muda nada (CSRF) e e-mail inexistente não se distingue de senha errada", { skip }, async () => {
  const server = await startServer();
  try {
    const maria = email("csrf");
    const signup = await server.call("/api/auth/signup", {
      method: "POST",
      body: { invite: await invite(), email: maria, password: PASSWORD },
    });
    const cookie = /=([\w-]+);/.exec(signup.setCookie)![1];
    const evil = "https://site-malicioso.example";
    const forged = await server.call("/api/auth/change-password", {
      method: "POST",
      cookie,
      from: evil,
      body: { current: PASSWORD, password: "nova senha 456" },
    });
    assert.equal(forged.status, 401);
    const forgedLogin = await server.call("/api/auth/login", {
      method: "POST",
      from: evil,
      body: { email: maria, password: PASSWORD },
    });
    assert.equal(forgedLogin.status, 403);
    const unknown = await server.call("/api/auth/login", {
      method: "POST",
      body: { email: email("ninguem"), password: PASSWORD },
    });
    const wrong = await server.call("/api/auth/login", {
      method: "POST",
      body: { email: maria, password: "senha errada 9" },
    });
    assert.deepEqual([unknown.status, unknown.data], [wrong.status, wrong.data]);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("cópia no servidor por conta: só a própria, nunca a de outra pessoa", { skip }, async () => {
  const server = await startServer();
  try {
    const join = async (name: string) => {
      const res = await server.call("/api/auth/signup", {
        method: "POST",
        from: null,
        body: { invite: await invite(), email: email(name), password: PASSWORD, client: "app" },
      });
      return { token: res.data.token as string, id: (res.data.account as Account).id };
    };
    const ana = await join("ana");
    const bia = await join("bia");
    const put = (who: { token: string }, state: AppState) =>
      server.call("/api/sync", { method: "PUT", token: who.token, from: null, body: state });

    assert.equal((await put(ana, stateOf(ana.id))).status, 200);
    // Gravar, ler ou apagar com o id de outra conta: recusado, e nada muda na cópia dela.
    assert.equal((await put(bia, stateOf(ana.id, 9))).status, 403);
    assert.equal((await server.call(`/api/sync/status?userId=${ana.id}`, { token: bia.token })).status, 403);
    assert.equal((await server.call(`/api/sync/state?userId=${ana.id}`, { token: bia.token })).status, 403);
    const erase = await server.call(`/api/sync?userId=${ana.id}`, { method: "DELETE", token: bia.token, from: null });
    assert.equal(erase.status, 403);
    const own = await server.call(`/api/sync/status?userId=${ana.id}`, { token: ana.token });
    assert.deepEqual(own.data, { configured: true, revision: 1 });
    // Sem sessão, nem a situação.
    assert.equal((await server.call(`/api/sync/status?userId=${ana.id}`)).status, 401);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("limite diário de IA por conta; o dono do servidor não tem limite", { skip }, async () => {
  const server = await startServer(2);
  try {
    const signup = await server.call("/api/auth/signup", {
      method: "POST",
      from: null,
      body: { invite: await invite(), email: email("cota"), password: PASSWORD, client: "app" },
    });
    const account = signup.data.account as Account;
    const token = signup.data.token as string;
    const used = await withDb(async (client) => [
      await consumeAiRequest(client, account, 2),
      await consumeAiRequest(client, account, 2),
      await consumeAiRequest(client, account, 2),
    ]);
    assert.deepEqual(used, [true, true, false]);
    assert.deepEqual((await server.call("/api/auth/me", { token })).data.ai, { used: 2, limit: 2 });
    await withDb((client) => setRole(client, account.email, "owner"));
    assert.equal(await withDb((client) => consumeAiRequest(client, { ...account, role: "owner" }, 2)), true);
    assert.deepEqual((await server.call("/api/auth/me", { token })).data.ai, { used: 2, limit: null });
  } finally {
    await server.close();
    await cleanup();
  }
});

test("redefinição pelo dono, conta bloqueada e exclusão da conta com a cópia", { skip }, async () => {
  const server = await startServer();
  const NEW = "nova senha 456";
  try {
    const maria = email("reset");
    const signup = await server.call("/api/auth/signup", {
      method: "POST",
      from: null,
      body: { invite: await invite(), email: maria, password: PASSWORD, client: "app" },
    });
    const oldToken = signup.data.token as string;
    const id = (signup.data.account as Account).id;
    const code = await withDb((client) => createPasswordReset(client, maria));
    assert.ok(code);
    assert.equal(await withDb((client) => createPasswordReset(client, email("ninguem"))), null);
    const reset = await server.call("/api/auth/reset-password", { method: "POST", body: { code, password: NEW } });
    assert.equal(reset.status, 200);
    // A troca encerra as sessões antigas; o código vale uma vez.
    assert.equal((await server.call("/api/auth/me", { token: oldToken })).status, 401);
    const reuse = await server.call("/api/auth/reset-password", { method: "POST", body: { code, password: "outra 789xx" } });
    assert.equal(reuse.status, 400);
    const old = await server.call("/api/auth/login", { method: "POST", body: { email: maria, password: PASSWORD } });
    assert.equal(old.status, 401);
    const appLogin = (password: string) =>
      server.call("/api/auth/login", { method: "POST", from: null, body: { email: maria, password, client: "app" } });
    const token = (await appLogin(NEW)).data.token as string;

    // Bloqueada: a sessão cai na hora e o login é recusado.
    await withDb((client) => setDisabled(client, maria, true));
    assert.equal((await server.call("/api/auth/me", { token })).status, 401);
    assert.equal((await appLogin(NEW)).status, 401);
    await withDb((client) => setDisabled(client, maria, false));

    const fresh = (await appLogin(NEW)).data.token as string;
    const put = await server.call("/api/sync", { method: "PUT", token: fresh, from: null, body: stateOf(id) });
    assert.equal(put.status, 200);
    const wrongDelete = await server.call("/api/auth/delete-account", {
      method: "POST",
      token: fresh,
      from: null,
      body: { password: "errada 000" },
    });
    assert.equal(wrongDelete.status, 400);
    const deleted = await server.call("/api/auth/delete-account", {
      method: "POST",
      token: fresh,
      from: null,
      body: { password: NEW },
    });
    assert.equal(deleted.status, 200);
    const left = await withDb((client) =>
      client.query(
        "select (select count(*) from webfit.accounts where id = $1)::int as a, (select count(*) from webfit.users where id = $1)::int as u",
        [id],
      ),
    );
    assert.deepEqual(left.rows[0], { a: 0, u: 0 });
  } finally {
    await server.close();
    await cleanup();
  }
});

// ---------- Painel do administrador (/api/admin) ----------

type Server = Awaited<ReturnType<typeof startServer>>;
type Member = { token: string; id: string; email: string };
type InviteItem = { id: string; note: string; status: string; usedBy: string | null; createdAt: string; expiresAt: string };
type AccountItem = { id: string; email: string; role: string; disabled: boolean; createdAt: string; aiToday: number };
const NOTE = "teste automatizado";
const HEX_ID = "a".repeat(64);
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

/** Conta nova pelo app (token no corpo); com owner, vira dona do servidor direto no banco. */
async function joinAs(server: Server, name: string, owner = false): Promise<Member> {
  const address = email(name);
  const res = await server.call("/api/auth/signup", {
    method: "POST",
    from: null,
    body: { invite: await invite(), email: address, password: PASSWORD, client: "app" },
  });
  assert.equal(res.status, 200);
  if (owner) await withDb((client) => setRole(client, address, "owner"));
  return { token: res.data.token as string, id: (res.data.account as Account).id, email: address };
}

/** Pedido ao painel com o token de quem administra (sem Origin, como o app). */
const adminCall = (server: Server, who: Member, path: string, method = "GET", body?: unknown) =>
  server.call(`/api/admin${path}`, { method, token: who.token, from: null, body });

test("painel do administrador: conta comum recebe 403 em todas as rotas", { skip }, async () => {
  const server = await startServer();
  try {
    const member = await joinAs(server, "comum");
    const routes: Array<[string, string, unknown?]> = [
      ["/invites", "GET"],
      ["/invites", "POST", { note: NOTE }],
      [`/invites/${HEX_ID}`, "DELETE"],
      ["/accounts", "GET"],
      [`/accounts/${member.id}/reset`, "POST"],
      [`/accounts/${member.id}/status`, "POST", { disabled: true }],
      [`/accounts/${member.id}/role`, "POST", { role: "owner" }],
    ];
    for (const [path, method, body] of routes) {
      const res = await adminCall(server, member, path, method, body);
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.data.error, "Só quem administra o WebFit pode fazer isso.");
    }
    // Sem sessão, nem chega à conferência do papel.
    assert.equal((await server.call("/api/admin/invites")).status, 401);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("painel do administrador: convite gerado, usado no cadastro, listado e revogado", { skip }, async () => {
  const server = await startServer();
  try {
    const owner = await joinAs(server, "dono", true);
    for (const days of [0, 366, 1.5, "14"]) {
      const bad = await adminCall(server, owner, "/invites", "POST", { note: NOTE, days });
      assert.equal(bad.status, 400, `days=${String(days)}`);
    }
    const created = await adminCall(server, owner, "/invites", "POST", { note: `  ${NOTE}  `, days: 3 });
    assert.equal(created.status, 200);
    const code = created.data.code as string;
    const item = created.data.invite as InviteItem;
    assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.match(item.id, /^[0-9a-f]{64}$/);
    assert.deepEqual([item.note, item.status, item.usedBy], [NOTE, "pending", null]);
    // Pelo relógio do banco (o do teste pode estar alguns segundos atrás); 1 h de folga para horário de verão.
    const validity = Date.parse(item.expiresAt) - Date.parse(item.createdAt);
    assert.ok(Math.abs(validity - 3 * 86_400_000) <= 3_600_000, `validade ${validity}`);

    // O código gerado no painel abre o cadastro; depois aparece como usado, com o e-mail da conta.
    const guest = email("convidada");
    const signup = await server.call("/api/auth/signup", {
      method: "POST",
      from: null,
      body: { invite: code, email: guest, password: PASSWORD, client: "app" },
    });
    assert.equal(signup.status, 200);
    const listed = await adminCall(server, owner, "/invites");
    const used = (listed.data.invites as InviteItem[]).find((i) => i.id === item.id);
    assert.deepEqual([used?.status, used?.usedBy], ["used", guest]);
    assert.equal((await adminCall(server, owner, `/invites/${item.id}`, "DELETE")).status, 409);

    // Pendente: revogado some da lista e não abre cadastro.
    const spare = await adminCall(server, owner, "/invites", "POST", { note: NOTE });
    const spareId = (spare.data.invite as InviteItem).id;
    assert.equal((await adminCall(server, owner, `/invites/${spareId}`, "DELETE")).status, 200);
    const after = await adminCall(server, owner, "/invites");
    assert.ok(!(after.data.invites as InviteItem[]).some((i) => i.id === spareId));
    assert.equal((await adminCall(server, owner, `/invites/${spareId}`, "DELETE")).status, 404);
    const revokedSignup = await server.call("/api/auth/signup", {
      method: "POST",
      from: null,
      body: { invite: spare.data.code, email: email("revogada"), password: PASSWORD, client: "app" },
    });
    assert.equal(revokedSignup.status, 400);
    for (const bad of ["xyz", "A".repeat(64), `${HEX_ID}0`])
      assert.equal((await adminCall(server, owner, `/invites/${bad}`, "DELETE")).status, 400, bad);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("painel do administrador: cookie de outra origem não muda nada", { skip }, async () => {
  const server = await startServer();
  try {
    const owner = await joinAs(server, "dono-web", true);
    const login = await server.call("/api/auth/login", { method: "POST", body: { email: owner.email, password: PASSWORD } });
    const cookie = /=([\w-]+);/.exec(login.setCookie)![1];
    const evil = "https://site-malicioso.example";
    const body = { note: NOTE };
    const forged = await server.call("/api/admin/invites", { method: "POST", cookie, from: evil, body });
    assert.equal(forged.status, 401);
    const bearerForged = await server.call("/api/admin/invites", { method: "POST", token: owner.token, from: evil, body });
    assert.equal(bearerForged.status, 403);
    const own = await server.call("/api/admin/invites", { method: "POST", cookie, body });
    assert.equal(own.status, 200);
    assert.equal((await server.call("/api/admin/invites", { cookie })).status, 200);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("painel do administrador: contas, código de senha, bloqueio e papel", { skip }, async () => {
  const server = await startServer();
  const NEW = "nova senha 456";
  try {
    const owner = await joinAs(server, "dona", true);
    const member = await joinAs(server, "membro");
    const listed = await adminCall(server, owner, "/accounts");
    assert.equal(listed.status, 200);
    const accounts = listed.data.accounts as AccountItem[];
    const row = accounts.find((a) => a.id === member.id);
    assert.deepEqual(
      row && { email: row.email, role: row.role, disabled: row.disabled, aiToday: row.aiToday },
      { email: member.email, role: "member", disabled: false, aiToday: 0 },
    );
    assert.ok(!Number.isNaN(Date.parse(row!.createdAt)));
    assert.equal(accounts.find((a) => a.id === owner.id)?.role, "owner");

    // Código de senha pelo painel vale em "Esqueci minha senha" e encerra as sessões antigas.
    const reset = await adminCall(server, owner, `/accounts/${member.id}/reset`, "POST");
    assert.equal(reset.status, 200);
    const hoursLeft = (Date.parse(reset.data.expiresAt as string) - Date.now()) / 3_600_000;
    assert.ok(Math.abs(hoursLeft - 24) < 0.1, `validade ${hoursLeft}`);
    const changed = await server.call("/api/auth/reset-password", {
      method: "POST",
      body: { code: reset.data.code, password: NEW },
    });
    assert.equal(changed.status, 200);
    assert.equal((await server.call("/api/auth/me", { token: member.token })).status, 401);
    assert.equal((await adminCall(server, owner, `/accounts/${UNKNOWN_UUID}/reset`, "POST")).status, 404);
    assert.equal((await adminCall(server, owner, "/accounts/nao-e-uuid/reset", "POST")).status, 400);

    const appLogin = () =>
      server.call("/api/auth/login", {
        method: "POST",
        from: null,
        body: { email: member.email, password: NEW, client: "app" },
      });
    const token = (await appLogin()).data.token as string;

    // Bloquear derruba a sessão e o login; liberar devolve o acesso.
    const status = (id: string, disabled: unknown) =>
      adminCall(server, owner, `/accounts/${id}/status`, "POST", { disabled });
    assert.equal((await status(member.id, "sim")).status, 400);
    assert.equal((await status(member.id, true)).status, 200);
    assert.equal((await server.call("/api/auth/me", { token })).status, 401);
    assert.equal((await appLogin()).status, 401);
    assert.equal((await status(member.id, false)).status, 200);
    const fresh = (await appLogin()).data.token as string;
    assert.ok(fresh);
    const self = await status(owner.id, true);
    assert.deepEqual([self.status, self.data.error], [400, "Você não pode bloquear a própria conta."]);
    assert.equal((await status(UNKNOWN_UUID, true)).status, 404);

    // Papel: promover dá acesso ao painel; ninguém tira o próprio acesso.
    const role = (id: string, value: unknown) => adminCall(server, owner, `/accounts/${id}/role`, "POST", { role: value });
    assert.equal((await role(member.id, "admin")).status, 400);
    assert.equal((await role(member.id, "owner")).status, 200);
    assert.equal((await adminCall(server, { ...member, token: fresh }, "/accounts")).status, 200);
    assert.equal((await role(member.id, "member")).status, 200);
    assert.equal((await adminCall(server, { ...member, token: fresh }, "/accounts")).status, 403);
    const demote = await role(owner.id, "member");
    assert.deepEqual([demote.status, demote.data.error], [400, "Você não pode tirar o próprio acesso de administração."]);
    assert.equal((await role(owner.id, "owner")).status, 200);
    assert.equal((await role(UNKNOWN_UUID, "owner")).status, 404);
  } finally {
    await server.close();
    await cleanup();
  }
});

test("códigos de senha: o novo cancela o anterior, bloquear cancela os abertos e o único dono não se exclui", { skip }, async () => {
  const server = await startServer();
  try {
    const owner = await joinAs(server, "dono-regras", true);
    const member = await joinAs(server, "membro-codigos");
    const reset = async (id: string) => (await adminCall(server, owner, `/accounts/${id}/reset`, "POST")).data.code as string;
    const use = (code: string, password: string) =>
      server.call("/api/auth/reset-password", { method: "POST", body: { code, password } });
    const status = (id: string, disabled: boolean) => adminCall(server, owner, `/accounts/${id}/status`, "POST", { disabled });

    // Só o último código gerado vale.
    const first = await reset(member.id);
    const second = await reset(member.id);
    assert.equal((await use(first, "nova senha 111")).status, 400);
    // Bloquear a conta cancela o código que ainda estava aberto, mesmo depois de liberar.
    assert.equal((await status(member.id, true)).status, 200);
    assert.equal((await status(member.id, false)).status, 200);
    assert.equal((await use(second, "nova senha 222")).status, 400);
    const third = await reset(member.id);
    assert.equal((await use(third, "nova senha 333")).status, 200);

    // O único dono ativo não exclui a própria conta; com outro dono, pode.
    const others = await withDb((client) =>
      client.query<{ n: number }>(
        "select count(*)::int as n from webfit.accounts where role = 'owner' and not disabled and id <> $1",
        [owner.id],
      ),
    );
    const remove = () =>
      server.call("/api/auth/delete-account", { method: "POST", token: owner.token, from: null, body: { password: PASSWORD } });
    if (others.rows[0].n === 0) {
      const refused = await remove();
      assert.equal(refused.status, 409);
      assert.match(String(refused.data.error), /único dono/);
    }
    assert.equal((await adminCall(server, owner, `/accounts/${member.id}/role`, "POST", { role: "owner" })).status, 200);
    assert.equal((await remove()).status, 200);
  } finally {
    await server.close();
    await cleanup();
  }
});
