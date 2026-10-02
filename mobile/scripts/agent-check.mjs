// Teste da jornada Expo com SQLite real em um contexto de navegador isolado.
// Executar da raiz, após exportar o app web (ver mobile/README.md):
//   node --import tsx mobile/scripts/agent-check.mjs mobile/dist/web
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { initialState, updateProfile } from "../../src/lib/domain.ts";
import { AGENT_STAGES, AGENT_UNAVAILABLE, NDJSON_TYPE } from "../../src/lib/agent-stream.ts";
import { profileFixture } from "../../tests/fixtures.ts";
import { SETTINGS_TAB } from "../../src/lib/copy.ts";
import { PROFILE_ANALYSIS_REQUEST } from "../../src/lib/agent-presentation.ts";
const target = path.resolve(process.argv[2] ?? "mobile/dist");
const output = path.join(target, "agent-check");
mkdirSync(output, { recursive: true });
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
  let file = path.resolve(
    target,
    "." + decodeURIComponent(req.url.split("?")[0]),
  );
  if (!file.startsWith(target + path.sep) || !existsSync(file))
    file = path.join(target, "index.html");
  try {
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] ?? "application/octet-stream",
    );
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(3211, "127.0.0.1", resolve));
const url = "http://127.0.0.1:3211";
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch({ channel: "chrome" });

const reply = {
  text: "Resposta de teste: vamos organizar sua rotina de refeições.",
  meta: {
    specialists: ["rotina"], reviewed: true, revisions: 0,
    urgency: "nenhuma", notes: [], llmCalls: 2,
  },
};
const scanReply = {
  text: "Itens reconhecidos na foto de teste.",
  meta: { ...reply.meta, specialists: [] },
  inventoryDraft: {
    items: [{ name: "Arroz", quantity: 1, unit: "kg", location: "despensa", expiresOn: null, notes: "" }],
    notes: "Confira as quantidades.",
  },
};
// Erro enviado dentro do fluxo NDJSON (o status HTTP já foi 200).
const STREAM_ERROR = "Falha de teste: revisão indisponível no momento.";
// PNG 1×1 válido para o seletor de fotos do web.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
let setupCount = 0;
async function setup({ consent = true, status = "offline", route = "/agente" } = {}) {
  const fixture = updateProfile(initialState(), { ...profileFixture(), consentAi: consent });
  const seedFile = path.join(output, "seed-" + ++setupCount + ".sqlite");
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(fixture));
  db.close();
  const control = { status, statusRequests: 0, requests: [], accepts: [], streamError: null };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/status") {
      control.statusRequests++;
      if (control.status === "offline") return route.abort("connectionrefused");
      return route.fulfill({
        json: {
          ready: control.status === "ready", token: "test-token",
          providers: { deepseek: true, openai: false },
        },
        headers: cors,
      });
    }
    if (pathname === "/api/agent") {
      const body = request.postDataJSON();
      const accept = (await request.allHeaders()).accept ?? "";
      control.requests.push(body);
      control.accepts.push(accept);
      // Como o servidor: fotos de despensa e compras sempre em JSON; os demais modos em NDJSON quando pedido.
      if (body.mode === "pantry_photo" || body.mode === "shopping_photo")
        return route.fulfill({ json: scanReply, headers: cors });
      if (!accept.includes(NDJSON_TYPE)) return route.fulfill({ json: reply, headers: cors });
      const events = [
        ...AGENT_STAGES.map((stage) => ({ type: "stage", stage, attempt: 1 })),
        control.streamError
          ? { type: "error", status: 502, error: control.streamError }
          : { type: "result", reply },
      ];
      return route.fulfill({
        status: 200,
        contentType: `${NDJSON_TYPE}; charset=utf-8`,
        headers: cors,
        body: events.map((event) => JSON.stringify(event) + "\n").join(""),
      });
    }
    // A regressão nunca acessa um servidor real nem uma API de IA.
    return route.abort("blockedbyclient");
  });
  await page.goto(url);
  // Primeira abertura (entrada da anamnese): o SQLite do app já foi criado.
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await page.goto(url + "/__blank");
  await page.evaluate(async (bytes) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(await (await entry.getFile()).arrayBuffer());
      const name = new TextDecoder().decode(content.slice(0, 512)).split("\0")[0];
      if (!name.endsWith("/ExpoSQLiteStorage")) continue;
      const writer = await entry.createWritable();
      const data = new Uint8Array(4096 + bytes.length);
      data.set(content.slice(0, 4096));
      data.set(bytes, 4096);
      await writer.write(data);
      await writer.close();
      return;
    }
    throw Error("Arquivo SQLite de teste não encontrado");
  }, [...readFileSync(seedFile)]);
  await page.goto(url + route);
  if (route === "/agente")
    await expect(page.getByLabel("Mensagem para o agente", { exact: true })).toBeVisible();
  return { page, context, control };
}
const inputFor = (page) => page.getByLabel("Mensagem para o agente", { exact: true });
const sendFor = (page) => page.getByRole("button", { name: "Enviar mensagem", exact: true });
const noticeFor = (page) => page.getByTestId("agent-send-notice");
const buttonFor = (page, name) => page.getByRole("button", { name, exact: true });

async function pickPhoto(page) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    buttonFor(page, "Galeria").click(),
  ]);
  await chooser.setFiles({ name: "despensa.png", mimeType: "image/png", buffer: PHOTO });
  await expect(buttonFor(page, "Reconhecer itens da foto")).toBeEnabled();
}

async function readState(page, name) {
  await page.goto(url + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(
        await (await entry.getFile()).arrayBuffer(),
      );
      if (
        new TextDecoder()
          .decode(content.slice(0, 512))
          .split("\0")[0]
          .endsWith("/ExpoSQLiteStorage")
      )
        return [...content.slice(4096)];
    }
    throw Error("SQLite ausente");
  });
  const file = path.join(output, name + ".sqlite");
  writeFileSync(file, Buffer.from(bytes));
  const db = new DatabaseSync(file);
  const state = JSON.parse(
    db
      .prepare("SELECT value FROM storage WHERE key=?")
      .get("webfit-personal-v1").value,
  );
  db.close();
  return state;
}

try {
  {
    const { page, context, control } = await setup();
    const draft = "Ajude-me a organizar as refeições de amanhã.";
    const input = inputFor(page);
    const send = sendFor(page);
    await expect(send).toBeDisabled();
    await input.fill(draft);
    await expect(send).toBeEnabled();
    const statusBefore = control.statusRequests;
    await send.click();
    await expect.poll(() => control.statusRequests).toBeGreaterThan(statusBefore);
    await expect(noticeFor(page)).toContainText(/conexão|servidor/i);
    await expect(noticeFor(page)).toBeInViewport();
    await expect(input).toHaveValue(draft);
    await expect(send).toBeEnabled();
    await expect(page.getByRole("button", { name: "Verificar conexão", exact: true })).toBeVisible();
    expect(control.requests).toHaveLength(0);
    await page.screenshot({ path: path.join(output, "offline-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    control.status = "ready";
    await send.click();
    await expect(page.getByText(reply.text, { exact: true })).toBeVisible();
    await expect(input).toHaveValue("");
    expect(control.requests).toHaveLength(1);
    expect(control.requests[0].mode).toBe("chat");
    expect(control.requests[0].text).toBe(draft);
    // O chat pede NDJSON e a resposta chega pelo evento `result`.
    expect(control.accepts[0]).toContain(NDJSON_TYPE);
    await page.reload();
    await expect(page.getByText(reply.text, { exact: true })).toBeVisible();
    const saved = await readState(page, "reconnected");
    expect(saved.messages.map((m) => ({ sender: m.sender, text: m.text, status: m.status }))).toEqual([
      { sender: "user", text: draft, status: "sent" },
      { sender: "ai", text: reply.text, status: "sent" },
    ]);
    await context.close();
    console.log("PASS: offline mantém texto, mostra aviso visível; reconexão envia uma vez (NDJSON) e persiste a conversa em SQLite");
  }
  {
    const { page, context, control } = await setup({ consent: false, status: "ready" });
    const draft = "Quero organizar minha rotina.";
    await inputFor(page).fill(draft);
    await expect(sendFor(page)).toBeEnabled();
    await sendFor(page).click();
    await expect(noticeFor(page)).toContainText(/compartilhamento|autorize/i);
    await expect(noticeFor(page)).toBeInViewport();
    await expect(inputFor(page)).toHaveValue(draft);
    expect(control.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Abrir preferências", exact: true }).click();
    await expect(page).toHaveURL(/\/espaco\?tab=preferencias/);
    // O link abre Meu espaço direto na aba "Ajustes" (nome acessível "Ajustes e dados") do controle segmentado.
    await expect(page.getByRole("tab", { name: SETTINGS_TAB.ariaLabel, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("switch", { name: /Permitir envio do contexto/ })).toBeVisible();
    const saved = await readState(page, "no-consent");
    expect(saved.messages).toHaveLength(0);
    expect(saved.profile.consentAi).toBe(false);
    await context.close();
    console.log("PASS: sem consentimento mostra orientação, preserva rascunho e abre preferências sem enviar dados");
  }
  {
    const { page, context, control } = await setup({ status: "unconfigured" });
    const draft = "Como organizar meus registros?";
    await inputFor(page).fill(draft);
    await expect(sendFor(page)).toBeEnabled();
    await sendFor(page).click();
    await expect(noticeFor(page)).toContainText(/configura|pendente/i);
    await expect(noticeFor(page)).toBeInViewport();
    await expect(inputFor(page)).toHaveValue(draft);
    expect(control.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Configurar conexão", exact: true }).click();
    await expect(page).toHaveURL(/\/espaco\?tab=preferencias/);
    const saved = await readState(page, "unconfigured");
    expect(saved.messages).toHaveLength(0);
    await context.close();
    console.log("PASS: servidor acessível sem IA informa configuração pendente e permite configurar conexão");
  }
  {
    const { page, context, control } = await setup({ status: "ready" });
    // O painel mostra o provedor informado por /api/status.
    await buttonFor(page, "O que o agente considera").click();
    await expect(page.getByText("Enviado só quando você pede uma resposta.", { exact: true })).toBeVisible();
    await expect(page.getByText("Processado por DeepSeek", { exact: true })).toBeVisible();
    await buttonFor(page, "Fechar").click();
    await expect(page.getByText("Processado por DeepSeek", { exact: true })).toHaveCount(0);
    const draft = "Posso trocar o jantar por um lanche?";
    control.streamError = STREAM_ERROR;
    await inputFor(page).fill(draft);
    await sendFor(page).click();
    await expect(noticeFor(page)).toContainText(STREAM_ERROR);
    await expect(noticeFor(page)).toBeInViewport();
    await expect(noticeFor(page)).not.toContainText(AGENT_UNAVAILABLE);
    await expect(page.getByText("A resposta não foi recebida.", { exact: true })).toBeVisible();
    expect(control.accepts).toHaveLength(1);
    expect(control.accepts[0]).toContain(NDJSON_TYPE);
    await page.screenshot({ path: path.join(output, "stream-error-mobile.png") });
    control.streamError = null;
    await buttonFor(page, "Tentar novamente").click();
    await expect(page.getByText(reply.text, { exact: true })).toBeVisible();
    await expect(noticeFor(page)).toHaveCount(0);
    expect(control.requests.map((r) => [r.mode, r.text])).toEqual([["chat", draft], ["chat", draft]]);
    const saved = await readState(page, "stream-error");
    expect(saved.messages.map((m) => ({ sender: m.sender, text: m.text, status: m.status }))).toEqual([
      { sender: "user", text: draft, status: "sent" },
      { sender: "ai", text: reply.text, status: "sent" },
    ]);
    await context.close();
    console.log("PASS: painel mostra o provedor; erro dentro do NDJSON chega à tela e a nova tentativa conclui a conversa");
  }
  {
    // "Analisar meu perfil" (folha do "+"): desativado sem consentimento; com o agente pronto envia o
    // pedido pronto pelo chat normal e a conversa mostra o chip no lugar do texto longo.
    const blocked = await setup({ consent: false, status: "ready" });
    await buttonFor(blocked.page, "Mais opções do chat").click();
    await expect(buttonFor(blocked.page, "Analisar meu perfil")).toBeDisabled();
    await blocked.context.close();
    const { page, context, control } = await setup({ status: "ready" });
    const typed = "rascunho que fica";
    await inputFor(page).fill(typed);
    await buttonFor(page, "Mais opções do chat").click();
    await buttonFor(page, "Analisar meu perfil").click();
    await expect(page.getByText(reply.text, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Você pediu uma análise do seu perfil/)).toBeVisible();
    await expect(page.getByText(PROFILE_ANALYSIS_REQUEST, { exact: true })).toHaveCount(0);
    await expect(inputFor(page)).toHaveValue(typed);
    expect(control.requests.map((r) => [r.mode, r.text])).toEqual([["chat", PROFILE_ANALYSIS_REQUEST]]);
    // A folha do "+" fecha antes do envio.
    await expect(page.getByText("Mais opções", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(output, "profile-analysis-mobile.png") });
    await context.close();
    console.log("PASS: Analisar meu perfil fica desativado sem consentimento; envia o pedido pronto pelo chat e mostra o chip");
  }
  {
    const { page, context, control } = await setup({ status: "ready", route: "/despensa" });
    // Conceito 06: o formulário de adicionar fica na folha do "+" do cabeçalho.
    await buttonFor(page, "Adicionar alimentos").click();
    await expect(buttonFor(page, "Galeria")).toBeVisible();
    await pickPhoto(page);
    await buttonFor(page, "Reconhecer itens da foto").click();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Arroz");
    await buttonFor(page, "Descartar revisão").click();
    // "O que está na foto?" é um grupo de rádios (AGENTE-10): o bloco da nota de compras.
    const shopping = page.getByRole("radio", { name: /compras realizadas/i });
    await shopping.click();
    await expect(shopping).toHaveAttribute("aria-checked", "true");
    await pickPhoto(page);
    await buttonFor(page, "Reconhecer itens da foto").click();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Arroz");
    // Fotos não passam pelo grafo em etapas: o pedido aceita só JSON.
    expect(control.requests.map((r) => r.mode)).toEqual(["pantry_photo", "shopping_photo"]);
    expect(control.requests.every((r) => /^data:image\/png;base64,/.test(r.file))).toBe(true);
    expect(control.accepts).toEqual(["application/json", "application/json"]);
    await context.close();
    console.log("PASS: fotos de despensa e de compras pedem só JSON e abrem a revisão dos itens");
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
