// Verificação da "Cópia no servidor" (PostgreSQL) no export web do app, a 390 px: desligada por padrão,
// ligar envia o estado com o token e mostra o código, servidor sem banco deixa o interruptor indisponível,
// conflito não sobrescreve o servidor e "Restaurar do servidor" traz a cópia e a reenvia por cima, e excluir
// tudo apaga antes a cópia (sem conseguir, nada é excluído). /api/status e /api/sync* são simulados; o banco
// de verdade é coberto por tests/state-sync.integration.ts. Só o export web é testado aqui: o alerta nativo
// (Alert do Android) e a seleção do código para copiar no aparelho não são validados.
// Uso (na pasta mobile; nunca junto com outra verificação na mesma porta):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/sync
//   node --import tsx scripts/sync-check.mjs dist/sync
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { SETTINGS_TAB } from "../../src/lib/copy.ts";
import { SERVER_SYNC_COPY } from "../../src/lib/server-sync.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/sync");
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "sync-seed-"));
const PORT = 3241;
const url = `http://127.0.0.1:${PORT}`;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.url === "/__blank") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Test setup</title>");
    return;
  }
  let file = path.resolve(target, "." + decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(target + path.sep) || !existsSync(file)) file = path.join(target, "index.html");
  try {
    res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const expect = baseExpect.configure({ timeout: 15000 });
const browser = await chromium.launch({ channel: "chrome" });
const TOKEN = "sync-check-token";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-webfit-token",
};
const SWITCH = "Guardar uma cópia no servidor";
const SYNC_ROUTE = /\/api\/sync(\/|\?|$)/;

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL: ${name}\n  ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n  ")}`);
  }
}

/** Simula /api/sync como o servidor (revisão só avança, force substitui) e guarda os pedidos. */
async function mockSync(page, server = {}) {
  const calls = [];
  let revision = server.revision ?? null;
  await page.route(SYNC_ROUTE, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const address = new URL(request.url());
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : null;
    calls.push({
      method: request.method(),
      path: address.pathname,
      search: address.search,
      token: request.headers()["x-webfit-token"] ?? null,
      body,
    });
    const reply = (status, json) => route.fulfill({ status, json, headers: CORS });
    if (address.pathname === "/api/sync/status") return reply(200, { configured: true, revision });
    if (address.pathname === "/api/sync/state")
      return server.copy ? reply(200, { state: server.copy }) : reply(404, { error: "sem cópia" });
    if (request.method() === "DELETE") return reply(server.deleteStatus ?? 200, { deleted: true });
    const force = address.searchParams.get("force") === "1";
    if (body && (force || revision === null || body.revision > revision)) {
      revision = body.revision;
      return reply(200, { revision });
    }
    return reply(409, { error: "conflito", serverRevision: revision });
  });
  return calls;
}

let seeds = 0;
/** Abre Meu espaço › Ajustes com o estado gravado no SQLite do navegador; /api/status informa `sync`. */
async function open(state, { sync = true, server = {} } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  // A última rota registrada vence: tudo recusado, menos o que cada cenário simula.
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  await page.route("**/api/status", (r) => r.fulfill({ json: { ready: false, token: TOKEN, sync }, headers: CORS }));
  const calls = await mockSync(page, server);
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible({ timeout: 30000 });
  await page.goto(url + "/__blank");
  await page.evaluate(async (bytes) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (!new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) continue;
      const writer = await handle.createWritable();
      const data = new Uint8Array(4096 + bytes.length);
      data.set(content.slice(0, 4096));
      data.set(bytes, 4096);
      await writer.write(data);
      await writer.close();
      return;
    }
    throw Error("Arquivo SQLite de teste não encontrado");
  }, [...readFileSync(seedFile)]);
  await page.goto(url + "/espaco");
  await page.getByRole("tab", { name: SETTINGS_TAB.ariaLabel, exact: true }).click({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: SERVER_SYNC_COPY.title, exact: true })).toBeVisible();
  return { page, context, errors, calls };
}

/** Lê o estado gravado no SQLite do navegador (sai da tela: use no fim de um bloco). */
async function readState(page, name) {
  await page.goto(url + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) return [...content.slice(4096)];
    }
    throw Error("SQLite ausente");
  });
  const file = path.join(seedsDir, `${name}.sqlite`);
  writeFileSync(file, Buffer.from(bytes));
  const db = new DatabaseSync(file);
  const state = JSON.parse(db.prepare("SELECT value FROM storage WHERE key=?").get("webfit-personal-v1").value);
  db.close();
  return state;
}

const noErrors = (errors) => {
  if (errors.length) throw Error(`erros no console: ${errors.slice(0, 3).join(" | ")}`);
};
const isPut = (request) => request.url().includes("/api/sync") && request.method() === "PUT";

{
  const state = stateFixture();
  const { page, context, errors, calls } = await open(state);
  await check("desligada por padrão: nada sai do aparelho e o texto de privacidade diz 'sem nuvem'", async () => {
    await expect(page.getByRole("switch", { name: SWITCH })).not.toBeChecked();
    await expect(page.getByText("Desligada", { exact: true })).toBeVisible();
    await expect(page.getByText("Tudo fica neste aparelho: sem conta, sem nuvem.", { exact: true })).toBeVisible();
    if (calls.length) throw Error(`pedidos inesperados: ${calls.map((c) => c.method + c.path).join(", ")}`);
  });
  await check("ligar envia o estado com o token, mostra 'Atualizada às' e o código de restauração", async () => {
    const put = page.waitForRequest(isPut, { timeout: 15000 });
    await page.getByRole("switch", { name: SWITCH }).click();
    await put;
    await expect(page.getByText(/^Atualizada às \d{2}:\d{2}$/)).toBeVisible();
    const sent = calls.find((call) => call.method === "PUT");
    if (sent.token !== TOKEN) throw Error(`token ${sent.token}`);
    if (sent.body?.userId !== state.userId || sent.body?.serverSync !== true) throw Error("corpo do envio inesperado");
    await expect(page.getByTestId("sync-code")).toHaveText(state.userId);
    await expect(page.getByText(/numa cópia no banco de dados do servidor/)).toBeVisible();
    noErrors(errors);
  });
  await check("o estado gravado no aparelho fica com a cópia ligada", async () => {
    if ((await readState(page, "ligada")).serverSync !== true) throw Error("serverSync não gravado");
  });
  await context.close();
}

{
  const { page, context, calls } = await open(stateFixture(), { sync: false });
  await check("servidor sem banco: interruptor indisponível, aviso e nenhum pedido de cópia", async () => {
    await expect(page.getByRole("switch", { name: SWITCH })).toBeDisabled();
    await expect(page.getByText(SERVER_SYNC_COPY.unavailable, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: SERVER_SYNC_COPY.restore, exact: true })).toHaveCount(0);
    if (calls.length) throw Error(`pedidos inesperados: ${calls.length}`);
  });
  await context.close();
}

{
  const local = { ...stateFixture(), serverSync: true, revision: 3 };
  const remote = { ...local, revision: 9, profile: { ...local.profile, name: "Pessoa Remota", consentAi: true } };
  const { page, context, errors, calls } = await open(local, { server: { revision: 9, copy: remote } });
  await check("conflito: 'Servidor mais novo' e nada é enviado por cima", async () => {
    await expect(page.getByText("Servidor mais novo", { exact: true })).toBeVisible();
    await expect(page.getByText(SERVER_SYNC_COPY.conflict, { exact: true })).toBeVisible();
    if (calls.some((call) => call.method === "PUT")) throw Error("enviou por cima do servidor");
  });
  await check("restaurar do servidor traz a cópia (IA desligada, mesmo código) e a reenvia com force", async () => {
    await page.getByRole("button", { name: SERVER_SYNC_COPY.restore, exact: true }).first().click();
    await expect(page.getByLabel(SERVER_SYNC_COPY.codeLabel, { exact: true })).toHaveValue(local.userId);
    const forced = page.waitForRequest((request) => isPut(request) && request.url().includes("force=1"));
    await page.getByRole("button", { name: "Substituir dados e restaurar", exact: true }).click();
    await forced;
    await expect(page.getByText(SERVER_SYNC_COPY.restored, { exact: true })).toBeVisible();
    noErrors(errors);
    const saved = await readState(page, "restaurada");
    if (saved.profile?.name !== "Pessoa Remota") throw Error(`nome ${saved.profile?.name}`);
    if (saved.profile?.consentAi !== false) throw Error("IA não ficou desligada");
    if (saved.userId !== local.userId) throw Error("o código do aparelho mudou");
  });
  await context.close();
}

{
  const state = { ...stateFixture(), serverSync: true };
  const { page, context, calls } = await open(state, { server: { revision: state.revision, deleteStatus: 503 } });
  const deleteAll = async () => {
    await page.getByRole("button", { name: "Excluir todos os meus dados", exact: true }).click();
    await expect(page.getByText(/e também a cópia no servidor/)).toBeVisible();
    await page.getByLabel("Digite EXCLUIR para confirmar", { exact: true }).fill("EXCLUIR");
    await page.getByRole("button", { name: "Excluir e recomeçar", exact: true }).click();
  };
  await check("excluir tudo sem conseguir apagar a cópia: aviso e nada é excluído", async () => {
    await deleteAll();
    await expect(page.getByText(SERVER_SYNC_COPY.deleteFailed, { exact: true })).toBeVisible();
    if (!calls.some((call) => call.method === "DELETE" && call.search === `?userId=${state.userId}`))
      throw Error("sem DELETE");
  });
  await check("com o servidor respondendo, a cópia sai e os dados do aparelho também", async () => {
    await page.unroute(SYNC_ROUTE);
    const ok = await mockSync(page, { revision: state.revision });
    await deleteAll();
    await expect(page.getByText("Dados locais excluídos.", { exact: true })).toBeVisible();
    if (ok.filter((call) => call.method === "DELETE").length !== 1) throw Error("DELETE não enviado uma vez");
  });
  await context.close();
}

await browser.close();
server.close();
console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
