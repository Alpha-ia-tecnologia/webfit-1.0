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
