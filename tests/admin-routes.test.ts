import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import type pg from "pg";
import { registerAdmin } from "../server/auth/admin-routes";
import type { Account } from "../server/auth/repo";

/**
 * As recusas do painel de administração sem banco de dados (rodam sempre, no `npm test`): a sessão é
 * simulada pelo cabeçalho x-teste-papel e qualquer uso do banco é contado — recusa não pode chegar nele.
 */
const OWNER: Account = { id: "0b8f2c1e-5d7a-4c3b-9e21-7f6a5d4c3b2a", email: "dono@exemplo.com", name: "Dono", role: "owner" };
const MEMBER: Account = { ...OWNER, id: "6a1d9e0f-3b2c-4d5e-8f70-1a2b3c4d5e6f", email: "membro@exemplo.com", role: "member" };
const OTHER = "4b2a6c1d-8e9f-4a0b-9c1d-2e3f4a5b6c7d";
const INVITE = "a".repeat(64);

async function startServer() {
  let poolUses = 0;
  const pool = {
    connect: async () => {
      poolUses++;
      throw new Error("banco não disponível no teste");
    },
  } as unknown as pg.Pool;
  const app = express();
  const requireAccount: express.RequestHandler = (req, res, next) => {
    const role = req.get("x-teste-papel");
    if (!role) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    res.locals.account = role === "owner" ? OWNER : MEMBER;
    next();
  };
  registerAdmin(app, { getPool: () => pool, requireAccount, publicOrigin: "https://webfit.exemplo.com.br" });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, role?: "owner" | "member", body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(role ? { "x-teste-papel": role } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: (await response.json()) as { error?: string } };
  };
  return { call, uses: () => poolUses, close: () => server.close() };
}

const ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/admin/invites"],
  ["POST", "/api/admin/invites", { note: "x", days: 3 }],
  ["DELETE", `/api/admin/invites/${INVITE}`],
  ["GET", "/api/admin/accounts"],
  ["POST", `/api/admin/accounts/${OTHER}/reset`],
  ["POST", `/api/admin/accounts/${OTHER}/status`, { disabled: true }],
  ["POST", `/api/admin/accounts/${OTHER}/role`, { role: "owner" }],
];

test("sem sessão (401) ou como conta comum (403), nenhuma rota de administração chega ao banco", async () => {
  const server = await startServer();
  try {
    for (const [method, path, body] of ROUTES) {
      assert.equal((await server.call(method, path, undefined, body)).status, 401, `${method} ${path} sem sessão`);
      const member = await server.call(method, path, "member", body);
      assert.equal(member.status, 403, `${method} ${path} como membro`);
      assert.equal(member.data.error, "Só quem administra o WebFit pode fazer isso.");
    }
    assert.equal(server.uses(), 0);
  } finally {
    server.close();
  }
});

test("como dono, pedidos inválidos são recusados antes do banco", async () => {
  const server = await startServer();
  try {
    const bad: [string, string, unknown?][] = [
      ["DELETE", "/api/admin/invites/nao-e-hash"],
      ["POST", "/api/admin/invites", { days: 0 }],
      ["POST", "/api/admin/invites", { days: 366 }],
      ["POST", "/api/admin/invites", { days: 2.5 }],
      ["POST", "/api/admin/invites", { note: "x".repeat(121) }],
      ["POST", "/api/admin/accounts/nao-e-uuid/reset"],
      ["POST", `/api/admin/accounts/${OTHER}/status`, { disabled: "sim" }],
      ["POST", `/api/admin/accounts/${OTHER}/role`, { role: "admin" }],
    ];
    for (const [method, path, body] of bad)
      assert.equal((await server.call(method, path, "owner", body)).status, 400, `${method} ${path} ${JSON.stringify(body)}`);
    // A própria conta: nem bloquear nem tirar o papel de dono.
    const self = await server.call("POST", `/api/admin/accounts/${OWNER.id}/status`, "owner", { disabled: true });
    assert.deepEqual([self.status, self.data.error], [400, "Você não pode bloquear a própria conta."]);
    const demote = await server.call("POST", `/api/admin/accounts/${OWNER.id}/role`, "owner", { role: "member" });
    assert.deepEqual([demote.status, demote.data.error], [400, "Você não pode tirar o próprio acesso de administração."]);
    assert.equal(server.uses(), 0);
  } finally {
    server.close();
  }
});

test("cada dono tem até 60 pedidos por minuto no painel", async () => {
  const server = await startServer();
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await server.call("DELETE", "/api/admin/invites/x", "owner")).status);
    assert.deepEqual([statuses[0], statuses[59], statuses[60]], [400, 400, 429]);
  } finally {
    server.close();
  }
});
