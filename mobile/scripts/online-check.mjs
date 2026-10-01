// Verificação do app no servidor ONLINE (contas), no export web, a 390 px: sem sessão só a tela de entrada,
// entrar manda o token Bearer em tudo, os dados do aparelho passam a ser da conta e sobem, Ajustes mostram
// a conta e "Sair" apaga os dados do aparelho. /api/status, /api/auth/* e /api/sync* são simulados (o
// servidor de verdade é coberto por tests/auth.integration.ts e scripts/online-check.ts). Só o export web
// é testado aqui: o alerta nativo do Android e o teclado do aparelho não são validados.
// Uso (na pasta mobile; nunca junto com outra verificação na mesma porta):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/sync
//   node --import tsx scripts/online-check.mjs dist/sync
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { SETTINGS_TAB } from "../../src/lib/copy.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/sync");
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "online-seed-"));
const PORT = 3243;
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
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-webfit-token, authorization",
};
const ACCOUNT = { id: "4b2a6c1d-8e9f-4a0b-9c1d-2e3f4a5b6c7d", email: "ana@exemplo.com", name: "Ana", role: "member" };
const SESSION = "token-de-sessao-do-app";

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

/** Servidor online simulado: só reconhece a sessão no cabeçalho Authorization; guarda os pedidos. */
async function mockOnline(page) {
  const calls = [];
  let revision = null;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const address = new URL(request.url());
    const auth = request.headers()["authorization"] ?? "";
    const signedIn = auth === `Bearer ${SESSION}`;
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ method: request.method(), path: address.pathname, auth, body });
    const reply = (status, json) => route.fulfill({ status, json, headers: CORS });
    switch (address.pathname) {
      case "/api/status":
        return reply(200, {
          mode: "online",
          ready: true,
          providers: { deepseek: true, openai: false },
          sync: true,
          account: signedIn ? ACCOUNT : null,
        });
      case "/api/auth/login":
        return body?.password === "frase secreta 1"
          ? reply(200, { account: ACCOUNT, token: SESSION })
          : reply(401, { error: "E-mail ou senha não conferem." });
      case "/api/auth/me":
        return signedIn ? reply(200, { account: ACCOUNT, ai: { used: 4, limit: 30 } }) : reply(401, { error: "x" });
      case "/api/auth/logout":
        return reply(200, { ok: true });
      case "/api/sync/status":
        return signedIn ? reply(200, { configured: true, revision }) : reply(401, { error: "x" });
      case "/api/sync":
        if (!signedIn) return reply(401, { error: "x" });
        if (body?.userId !== ACCOUNT.id) return reply(403, { error: "Esta cópia é de outra conta." });
        revision = body.revision;
        return reply(200, { revision });
      default:
        return reply(404, { error: "x" });
    }
  });
  return calls;
}

let seeds = 0;
async function open(state) {
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
  // No export web, o alerta nativo vira window.confirm: aceitar.
  page.on("dialog", (dialog) => void dialog.accept());
  const calls = await mockOnline(page);
  await page.goto(url);
  await expect(page.getByText("Entre na sua conta")).toBeVisible({ timeout: 30000 });
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
  await page.goto(url);
  return { page, context, errors, calls };
}

async function readState(page, name) {
  await page.goto(url + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage"))
        return [...content.slice(4096)];
    }
    throw Error("SQLite ausente");
  });
  const file = path.join(seedsDir, `${name}.sqlite`);
  writeFileSync(file, Buffer.from(bytes));
  const db = new DatabaseSync(file);
  const row = db.prepare("SELECT value FROM storage WHERE key=?").get("webfit-personal-v1");
  db.close();
  return row ? JSON.parse(row.value) : null;
}

{
  const { page, context, errors, calls } = await open(stateFixture());
  await check("sem sessão: só a tela de entrada, nenhum dado do aparelho e nenhuma cópia enviada", async () => {
    await expect(page.getByText("Entre na sua conta")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Olá, Pessoa.")).toHaveCount(0);
    if (calls.some((c) => c.path === "/api/sync")) throw Error("enviou cópia sem sessão");
  });
  await check("senha errada mostra o erro; a certa entra, adota os dados na conta e manda Bearer", async () => {
    await page.getByLabel("E-mail", { exact: true }).fill(ACCOUNT.email);
    await page.getByLabel("Senha", { exact: true }).fill("errada 123");
    await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await expect(page.getByText("E-mail ou senha não conferem.")).toBeVisible();
    await page.getByLabel("Senha", { exact: true }).fill("frase secreta 1");
    await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await expect(page.getByText("Olá, Pessoa.")).toBeVisible({ timeout: 30000 });
    const login = calls.find((c) => c.path === "/api/auth/login" && c.body?.password === "frase secreta 1");
    if (login?.body?.client !== "app") throw Error("login sem client=app");
    await expect
      .poll(() => calls.filter((c) => c.path === "/api/sync" && c.method === "PUT").length, { timeout: 20000 })
      .toBeGreaterThan(0);
    const put = calls.find((c) => c.path === "/api/sync" && c.method === "PUT");
    if (put.auth !== `Bearer ${SESSION}`) throw Error(`PUT sem Bearer: ${put.auth}`);
    if (put.body.userId !== ACCOUNT.id || put.body.serverSync !== true) throw Error("estado não adotado na conta");
    if (errors.length) throw Error(errors.slice(0, 3).join(" | "));
  });
  await check("Ajustes mostram a conta, o uso de IA e a cópia na conta", async () => {
    await page.goto(url + "/espaco");
    await page.getByRole("tab", { name: SETTINGS_TAB.ariaLabel, exact: true }).click({ timeout: 30000 });
    await expect(page.getByText("Sua conta", { exact: true })).toBeVisible();
    await expect(page.getByTestId("account-email")).toHaveText(ACCOUNT.email);
    await expect(page.getByText("4 de 30 hoje")).toBeVisible();
    await expect(page.getByText("Cópia na sua conta", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Guardar uma cópia no servidor" })).toHaveCount(0);
  });
  await check("sair encerra a sessão no servidor, apaga os dados do aparelho e volta à entrada", async () => {
    await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await expect(page.getByText("Entre na sua conta")).toBeVisible({ timeout: 30000 });
    const logout = calls.find((c) => c.path === "/api/auth/logout");
    if (logout?.auth !== `Bearer ${SESSION}`) throw Error("logout sem a sessão");
    const saved = await readState(page, "saiu");
    if (saved && saved.profile) throw Error("os dados continuaram no aparelho");
  });
  await context.close();
}

await browser.close();
server.close();
console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
