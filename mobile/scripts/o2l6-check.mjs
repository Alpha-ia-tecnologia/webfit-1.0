// Verificação da Onda 2 · Lote 6 (IA estruturada) no export web do app, a 390 e 412 px: blocos do chat
// (opções de refeição com estimativa TACO, gráfico de água, combinado proposto + Desfazer, sugestões que
// enviam), "Conferir e registrar" abrindo Registrar refeição preenchida (nunca registra sozinho), perfil
// sensível (sem peso, prato em vez de barras, sem combinados/sugestões de peso), calorias ocultas, blocos
// inválidos em texto, dieta estruturada (próxima refeição, linha do tempo, trocas, texto completo, "Do seu
// plano" no Hoje), foto do prato pelo "+" do chat (análise automática, rascunho com caixas e rádios) e
// "+ → Exame / Despensa". Alvos de toque ≥ 44 px, sem rolagem lateral e sem erros de página ou console.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l6
//   node --import tsx scripts/o2l6-check.mjs dist/o2l6 [pasta-das-fotos]
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { AGENT_STAGES, NDJSON_TYPE } from "../../src/lib/agent-stream.ts";
import { createDietPlan } from "../../src/lib/diet.ts";
import { renderDietText } from "../../src/lib/diet-plan.ts";
import { localDate } from "../../src/lib/domain.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { DESPENSA_TITLE } from "../../src/lib/copy.ts";
import {
  CHAT_REPLY,
  CHAT_REPLY_INVALID,
  CHAT_REPLY_KCAL,
  CHAT_REPLY_SENSITIVE_LEAK,
  DIET_PLAN_V2,
  DIET_REPLY,
  DIET_REPLY_KCAL,
  DIET_REPLY_META,
  DIET_REPLY_SENSITIVE,
  PHOTO_REPLY,
  REPLY_META,
} from "../../tests/structured-fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l6");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l6-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o2l6-seed-"));
const PORT = 3221;
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
const today = localDate();
/** Relógio fixo das verificações da dieta: 10:40, antes do almoço das 12:00 ("em 1 h 20 min"). */
const DIET_NOW = new Date(`${today}T10:40:00`);
/** PNG de 1 × 1 px para a "Foto do prato". */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const TEXT_REPLY = { text: "Resposta de teste em texto, sem blocos.", meta: REPLY_META };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL: ${name}\n  ${String(error?.message ?? error).split("\n").slice(0, 8).join("\n  ")}`);
  }
}

/** Perfil de teste com o agente autorizado (alergia declarada: amendoim). */
function baseState(change = {}, extra = {}) {
  const state = stateFixture();
  return { ...state, profile: { ...state.profile, consentAi: true, ...change }, ...extra };
}
const withDiet = (reply, change = {}) => {
  const state = baseState(change);
  return { ...state, dietPlan: createDietPlan(reply, state.profile) };
};

let seeds = 0;
/**
 * Abre o app com o estado gravado no SQLite do navegador, o agente "conectado" (respostas de
 * `control.replies` por modo, em NDJSON quando pedido) e, se pedido, o relógio fixo.
 */
async function open(state, { width = 390, route = "/agente", ready, clock = null, replies = {} } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const control = { replies: { chat: CHAT_REPLY, photo: PHOTO_REPLY, diet: DIET_REPLY, ...replies }, requests: [], accepts: [] };
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  if (clock) await page.clock.setFixedTime(clock);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/api/**", async (r) => {
    const request = r.request();
    if (request.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/status")
      return r.fulfill({ json: { ready: true, token: "test-token", providers: { deepseek: true, openai: false } }, headers: cors });
    if (pathname === "/api/agent") {
      const body = request.postDataJSON();
      const accept = (await request.allHeaders()).accept ?? "";
      control.requests.push(body);
      control.accepts.push(accept);
      const reply = control.replies[body.mode] ?? TEXT_REPLY;
      if (!accept.includes(NDJSON_TYPE)) return r.fulfill({ json: reply, headers: cors });
      const events = [...AGENT_STAGES.map((stage) => ({ type: "stage", stage, attempt: 1 })), { type: "result", reply }];
      return r.fulfill({
        status: 200,
        contentType: `${NDJSON_TYPE}; charset=utf-8`,
        headers: cors,
        body: events.map((event) => JSON.stringify(event) + "\n").join(""),
      });
    }
    return r.abort("blockedbyclient");
  });
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
  await page.goto(url + route);
  await expect(ready ? ready(page) : input(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
  return { page, context, errors, control };
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

const input = (page) => page.getByLabel("Mensagem para o agente", { exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const plus = (page) => page.locator('[aria-label="Mais opções do chat"]');
async function ask(page, text) {
  await input(page).fill(text);
  await button(page, "Enviar mensagem").click();
}
/** Itens diretos de uma lista (os itens das listas aninhadas ficam de fora). */
const directItems = (locator) => locator.locator(":scope > [role=listitem]");
/** Aviso visível na tela e a mesma frase na região role="status" que o leitor de tela anuncia. */
async function noticeAndStatus(page, message) {
  await expect(page.getByText(message, { exact: true }).and(page.locator(":not([role=status])"))).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: message })).toHaveCount(1);
}

/** Sem rolagem lateral: o documento cabe e nada sai da tela, exceto dentro de uma lista que rola de lado. */
async function noSideScroll(page) {
  const problem = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    const inSideScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll") return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !inSideScroller(el))
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  });
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Nenhum número de kcal no texto visível e nenhum "kcal" nos nomes acessíveis. */
async function noKcal(page, where) {
  const found = await page.evaluate(() => {
    const text = /\d[\d.,]*\s*kcal/i.exec(document.body.innerText)?.[0];
    const label = [...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label")).find((l) => /kcal/i.test(l));
    return text ?? label ?? "";
  });
  if (found) throw Error(`${where}: calorias à vista ("${found}")`);
}
/** Todo alvo do localizador mede pelo menos 44 × 44 px (o web ignora hitSlop). */
async function targets44(locator, what) {
  const boxes = await locator.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
  if (!boxes.length) throw Error(`${what}: nenhum alvo encontrado`);
  const small = boxes.filter(([w, h]) => w < 43.5 || h < 43.5);
  if (small.length) throw Error(`${what}: ${small.map(([w, h]) => `${w.toFixed(1)}×${h.toFixed(1)}`).join(" ")}`);
}
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.slice(0, 5).join(" | "));
};
async function shoot(page, file) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, file) });
}

// ---------- 1–2. Blocos no chat, combinado, sugestão, "Conferir e registrar" ----------
for (const width of [390, 412]) {
  const { page, context, errors, control } = await open(baseState(), { width });
  const blocks = page.getByTestId("chat-blocks");
  await check(`${width} chat: resposta estruturada vira blocos (uma chamada em NDJSON)`, async () => {
    await ask(page, "Quero ideias de jantar");
    await expect(blocks).toBeVisible({ timeout: 20000 });
    expect(control.requests.map((r) => r.mode)).toEqual(["chat"]);
    expect(control.accepts[0]).toContain(NDJSON_TYPE);
    await expect(blocks.getByText("Aqui vão duas ideias de jantar rápidas", { exact: false })).toBeVisible();
  });
  await check(`${width} chat: "Opções de jantar" em cartões selecionáveis (a primeira marcada) com kcal e proteína da TACO`, async () => {
    // Conceito 05: opções na vertical como rádios, "O que considerei" em cima e um só "Registrar no jantar".
    const options = page.getByTestId("meal-options");
    await expect(options).toHaveAttribute("aria-label", "Opções de jantar");
    const cards = options.getByRole("radio");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute("aria-checked", "true");
    const estimate = options.getByTestId("macro-estimate").first();
    await expect(estimate).toContainText("Estimativa TACO");
    await expect(estimate).toContainText(/[0-9][0-9.]* kcal/);
    await expect(estimate).toContainText(/[0-9][0-9,]* g prot\./);
    await expect(options.getByText("Preparo de cerca de 20 min", { exact: false }).first()).toBeAttached();
    await expect(button(page, "Registrar no jantar: Frango com arroz e salada")).toBeVisible();
  });
  await check(`${width} chat: gráfico de água dos registros locais (role img "Água por dia…")`, async () => {
    await expect(page.getByTestId("block-chart")).toHaveCount(1);
    await expect(page.getByRole("img", { name: /^Água por dia/ })).toBeVisible();
  });
  await shoot(page, `${width}-chat-blocos.png`);
  await check(`${width} chat: sem rolagem lateral (a lista de opções rola só por dentro)`, async () => {
    await noSideScroll(page);
  });
  await check(`${width} chat: "Criar combinado" → aviso com Desfazer e foco no "Já está nos seus combinados"`, async () => {
    await button(page, "Criar combinado: Beber água ao acordar").click();
    await expect(toastWith(page, "Combinado criado.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    await expect(page.getByText("Já está nos seus combinados", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? "")).toContain("Já está nos seus combinados");
    await expect(button(page, "Criar combinado: Beber água ao acordar")).toHaveCount(0);
  });
  await check(`${width} chat: "Desfazer" remove o combinado e o botão volta`, async () => {
    await toastWith(page, "Combinado criado.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(button(page, "Criar combinado: Beber água ao acordar")).toBeVisible();
    await button(page, "Criar combinado: Beber água ao acordar").click();
    await expect(page.getByText("Já está nos seus combinados", { exact: true })).toBeVisible();
  });
  await check(`${width} chat: alvos de 44 px (sugestões, Registrar no jantar, +)`, async () => {
    await targets44(page.getByRole("group", { name: "Sugestões do agente", exact: true }).getByRole("button"), "sugestões");
    await targets44(page.getByRole("button", { name: /^Registrar no jantar: / }), "Registrar no jantar");
    await targets44(plus(page), "Mais opções do chat");
  });
  await check(`${width} chat: a sugestão envia exatamente o texto do chip`, async () => {
    control.replies.chat = TEXT_REPLY;
    await page.getByRole("group", { name: "Sugestões do agente", exact: true }).getByRole("button", { name: "Quero ideias de lanche", exact: true }).click();
    await expect(page.getByText(TEXT_REPLY.text, { exact: true })).toBeVisible({ timeout: 20000 });
    expect(control.requests.at(-1).mode).toBe("chat");
    expect(control.requests.at(-1).text).toBe("Quero ideias de lanche");
    // Só a última resposta oferece sugestões.
    await expect(page.getByRole("group", { name: "Sugestões do agente", exact: true })).toHaveCount(0);
  });
  await check(`${width} chat: depois de recarregar, os blocos continuam`, async () => {
    await page.reload();
    await expect(blocks).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("meal-options")).toBeVisible();
    await expect(page.getByText("Já está nos seus combinados", { exact: true })).toBeVisible();
  });
  await check(`${width} "Registrar no jantar: Frango com arroz e salada" abre Registrar refeição preenchida`, async () => {
    await button(page, "Registrar no jantar: Frango com arroz e salada").click();
    await expect(page).toHaveURL(/\/refeicao/);
    await expect(page.getByRole("button", { name: /^Jantar, Hoje, \d{2}:\d{2} — alterar tipo, data ou horário$/ })).toBeVisible({ timeout: 20000 });
    await expect(heading(page, "Seu prato · 3 itens")).toBeVisible();
    await noticeAndStatus(page, "Itens sugeridos no prato. Confira as porções e toque em Salvar refeição.");
  });
  await shoot(page, `${width}-conferir-e-registrar.png`);
  await check(`${width} chat: sem erros de página nem de console`, async () => noErrors(errors));
  await check(`${width} SQLite: blocos salvos, texto igual, um combinado e nada registrado sozinho`, async () => {
    const saved = await readState(page, `chat-${width}`);
    expect(saved.messages[1].sender).toBe("ai");
    expect(saved.messages[1].text).toBe(CHAT_REPLY.text);
    expect(saved.messages[1].blocks).toEqual(CHAT_REPLY.structured.sections);
    expect(saved.messages[3].blocks).toBeUndefined();
    expect(saved.habits.filter((h) => h.title === "Beber água ao acordar")).toHaveLength(1);
    expect(saved.diary).toHaveLength(0);
  });
  await context.close();
}

// ---------- 3. Perfil sensível ----------
{
  const { page, context, errors } = await open(baseState({ eatingDisorder: "sim" }), {
    replies: { chat: CHAT_REPLY_SENSITIVE_LEAK },
  });
  await ask(page, "Ideias para o jantar?");
  await expect(page.getByTestId("chat-blocks")).toBeVisible({ timeout: 20000 });
  await check("sensível: seções com rótulos (Alimentação e hidratação; Rotina, sono e combinados)", async () => {
    await expect(heading(page, "Alimentação e hidratação")).toBeVisible();
    await expect(heading(page, "Rotina, sono e combinados")).toBeVisible();
  });
  await check("sensível: sem gráfico de peso; água continua", async () => {
    await expect(page.getByText("Peso nas últimas 8 semanas", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("block-chart")).toHaveCount(1);
    await expect(page.getByRole("img", { name: /^Água por dia/ })).toBeVisible();
  });
  await check('sensível: prato ("Prato com…") no lugar das pílulas de kcal e proteína', async () => {
    await expect(page.getByTestId("chat-blocks").getByText(/^Prato com/).first()).toBeVisible();
    await expect(page.getByText("Prato com verduras e frutas, proteínas e cereais e pães", { exact: true })).toBeVisible();
    await expect(page.getByTestId("macro-estimate")).toHaveCount(0);
  });
  await check('sensível: sem "Pesar-se toda manhã" e sem a sugestão "Como perder peso rápido?"', async () => {
    await expect(button(page, "Criar combinado: Pesar-se toda manhã")).toHaveCount(0);
    await expect(button(page, "Criar combinado: Beber água ao acordar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Como perder peso rápido?" })).toHaveCount(0);
    await expect(button(page, "Quero ideias de lanche")).toBeVisible();
  });
  await check("sensível: sem gramas na tela", async () => {
    const grams = await page.evaluate(() => /≈\s*\d+\s*g\b/.test(document.body.innerText));
    if (grams) throw Error("gramas à vista");
  });
  await shoot(page, "390-chat-sensivel.png");
  await check("sensível: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

// ---------- 4. Calorias ocultas no chat ----------
{
  const { page, context, errors } = await open(baseState({ hideCalories: true }), { replies: { chat: CHAT_REPLY_KCAL } });
  await ask(page, "Um lanche?");
  await expect(page.getByTestId("chat-blocks")).toBeVisible({ timeout: 20000 });
  await check('calorias ocultas: pílula "calorias ocultas" e nenhum "500 kcal" no texto ou nos nomes', async () => {
    await expect(page.getByLabel("calorias ocultas", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Prato de calorias ocultas/ })).toBeVisible();
    await expect(page.locator('[aria-label*="kcal"]')).toHaveCount(0);
    await noKcal(page, "chat");
  });
  await check("calorias ocultas: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

// ---------- 5. Blocos inválidos: texto de sempre ----------
{
  const { page, context, errors } = await open(baseState(), { replies: { chat: CHAT_REPLY_INVALID } });
  await ask(page, "Oi");
  await check("inválido: tipo desconhecido cai no texto da resposta", async () => {
    await expect(page.getByText(CHAT_REPLY_INVALID.text, { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("chat-blocks")).toHaveCount(0);
  });
  await check("inválido: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

// ---------- 6. Dieta estruturada (gerada no app), Hoje e "Conferir e registrar" ----------
for (const width of [390, 412]) {
  const { page, context, errors, control } = await open(baseState(), {
    width,
    route: "/dieta",
    clock: DIET_NOW,
    ready: (p) => button(p, "Gerar minha dieta"),
  });
  await check(`${width} dieta: "Gerar minha dieta" salva o plano estruturado e mostra a próxima refeição`, async () => {
    await button(page, "Gerar minha dieta").click();
    const next = page.getByTestId("next-meal");
    await expect(next).toBeVisible({ timeout: 30000 });
    expect(control.requests.map((r) => r.mode)).toEqual(["diet"]);
    // Conceito 04: a próxima é o cartão destacado na linha do tempo; o horário fica no trilho ao lado.
    await expect(next.getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
    await expect(page.getByTestId("diet-timeline").locator(":scope > [role=listitem]").nth(1)).toContainText("12:00");
    await expect(next.getByText("em 1 h 20 min", { exact: true })).toBeVisible();
    await expect(next.getByRole("button", { name: "Registrar Almoço", exact: true })).toBeVisible();
  });
  await check(`${width} dieta: linha do tempo com 4 refeições, 2 estimativas TACO à vista e a nota dos horários no (i)`, async () => {
    const timeline = page.getByTestId("diet-timeline");
    await expect(directItems(timeline)).toHaveCount(4);
    await expect(timeline.getByText("Horário flexível", { exact: true })).toHaveCount(0);
    // Almoço (a próxima) e lanche da tarde têm cobertura TACO; o café passou (recolhido) e o jantar não tem.
    await expect(page.getByTestId("macro-estimate")).toHaveCount(2);
    await expect(page.getByText("Os horários são sugestões; ajuste à sua rotina.", { exact: true })).toHaveCount(0);
    await button(page, "Sobre esta dieta").click();
    await expect(page.getByText("Os horários são sugestões; ajuste à sua rotina.", { exact: true })).toBeVisible();
    await button(page, "Sobre esta dieta").click();
  });
  await check(`${width} dieta: "Trocar arroz branco cozido: 2 opções" alterna aria-expanded e mostra as trocas`, async () => {
    const chip = button(page, "Trocar arroz branco cozido: 2 opções");
    await expect(chip).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("arroz integral cozido", { exact: true })).toHaveCount(0);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("arroz integral cozido", { exact: true })).toBeVisible();
    await expect(page.getByText("Troque por:", { exact: true })).toBeVisible();
    await expect(button(page, "Trocar feijão carioca cozido: 1 opção")).toBeVisible();
  });
  await check(`${width} dieta: "Ver plano em texto" mostra o texto completo`, async () => {
    await expect(page.getByTestId("diet-plan-text")).toHaveCount(0);
    const toggle = button(page, "Ver plano em texto");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("diet-plan-text")).toBeVisible();
    await expect(page.getByTestId("diet-plan-text")).toContainText("Seu dia de alimentação");
  });
  await check(`${width} dieta: alvos de 44 px (trocas, texto, responder, registrar)`, async () => {
    await targets44(page.getByRole("button", { name: /^Trocar .+: \d+ opç(ão|ões)$/ }), "trocas");
    await targets44(button(page, "Ver plano em texto"), "Ver plano em texto");
    await targets44(button(page, "Responder no chat"), "Responder no chat");
    await targets44(button(page, "Registrar Almoço"), "Registrar");
  });
  await check(`${width} dieta: sem rolagem lateral`, async () => noSideScroll(page));
  await shoot(page, `${width}-dieta-estruturada.png`);
  await check(`${width} Hoje: "Do seu plano" em linha compacta com a próxima refeição, "Registrar" e "Ver minha dieta"`, async () => {
    await page.goto(url + "/");
    const card = page.getByTestId("plan-next-meal");
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card.getByRole("heading", { name: "Do seu plano", exact: true })).toBeVisible();
    await expect(card.getByText("Próxima refeição · Almoço · 12:00 · em 1 h 20 min", { exact: true })).toBeVisible();
    // Linha compacta do conceito 01 (como o web): os itens ficam na Dieta e no "Registrar"; aqui só a próxima refeição.
    await expect(card.getByRole("list", { name: "Itens: Almoço", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Ver minha dieta", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Conferir e registrar: Almoço", exact: true })).toHaveText("Registrar");
    await targets44(card.getByRole("button"), "botões do Hoje");
    await noSideScroll(page);
  });
  await shoot(page, `${width}-hoje-do-seu-plano.png`);
  await check(`${width} Hoje: "Conferir e registrar: Almoço" abre o prato com 4 itens (sem registrar)`, async () => {
    await page.getByTestId("plan-next-meal").getByRole("button", { name: "Conferir e registrar: Almoço", exact: true }).click();
    await expect(page).toHaveURL(/\/refeicao/);
    await expect(page.getByRole("button", { name: /^Almoço, Hoje, \d{2}:\d{2} — alterar tipo, data ou horário$/ })).toBeVisible({ timeout: 20000 });
    await expect(heading(page, "Seu prato · 4 itens")).toBeVisible();
  });
  await check(`${width} dieta: sem erros de página nem de console`, async () => noErrors(errors));
  await check(`${width} SQLite: dietPlan.structured igual ao plano, mensagem com o texto, diário vazio`, async () => {
    const saved = await readState(page, `dieta-${width}`);
    expect(saved.dietPlan.structured).toEqual(DIET_PLAN_V2);
    expect(saved.dietPlan.text).toBe(DIET_REPLY.text);
    expect(saved.messages[1].text).toBe(DIET_REPLY.text);
    expect(saved.diary).toHaveLength(0);
  });
  await context.close();
}

// ---------- 7. Dieta em perfil sensível ----------
{
  const state = withDiet(DIET_REPLY_SENSITIVE, { eatingDisorder: "sim" });
  const { page, context, errors } = await open(state, { route: "/dieta", clock: DIET_NOW, ready: (p) => p.getByTestId("next-meal") });
  await check("dieta sensível: pratos no lugar das barras, sem gramas e sem contagem", async () => {
    await expect(page.getByRole("img", { name: /^Prato com/ }).first()).toBeVisible();
    await expect(page.getByTestId("macro-estimate")).toHaveCount(0);
    await expect(page.getByText("em 1 h 20 min", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("next-meal").getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
    await button(page, "Ver plano em texto").click();
    await expect(page.getByTestId("diet-plan-text")).toBeVisible();
    const grams = await page.evaluate(() => /≈\s*\d+\s*g\b/.test(document.body.innerText));
    if (grams) throw Error("gramas à vista");
  });
  await check('dieta sensível: Hoje sem "em 1 h 20 min"', async () => {
    await page.goto(url + "/");
    const card = page.getByTestId("plan-next-meal");
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card.getByText("Próxima refeição · Almoço · 12:00", { exact: true })).toBeVisible();
    await expect(page.getByText(/em 1 h 20 min/)).toHaveCount(0);
  });
  await shoot(page, "390-hoje-sensivel.png");
  await check("dieta sensível: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

// ---------- 7b. Plano de antes (com gramas e troca com amendoim) visto hoje: perfil sensível e alergia declarada ----------
{
  const plan = structuredClone(DIET_PLAN_V2);
  const almoco = plan.refeicoes.find((meal) => meal.slot === "almoco");
  almoco.itens.find((i) => i.alimento === "feijão carioca cozido").trocas = ["lentilha cozida", "pasta de amendoim"];
  const reply = { text: renderDietText(plan), meta: DIET_REPLY_META, structured: { kind: "diet", plan } };
  if (!/≈ \d+ g/.test(reply.text)) throw Error("o texto salvo de teste deveria ter gramas");
  const { page, context, errors } = await open(withDiet(reply, { eatingDisorder: "sim" }), {
    route: "/dieta",
    clock: DIET_NOW,
    ready: (p) => p.getByTestId("next-meal"),
  });
  await check('plano antigo em perfil sensível: "Ver plano em texto" sem "≈ … g" (texto refeito sem gramas)', async () => {
    await button(page, "Ver plano em texto").click();
    const text = page.getByTestId("diet-plan-text");
    await expect(text).toBeVisible();
    await expect(text).toContainText("Seu dia de alimentação");
    await expect(text).toContainText("feijão carioca cozido");
    const grams = await text.evaluate((el) => /≈\s*\d+\s*g\b/.test(el.innerText));
    if (grams) throw Error("gramas no texto do plano");
  });
  await check('troca com amendoim (alergia declarada agora) ganha "Possível alérgeno"; a outra não', async () => {
    await button(page, "Trocar feijão carioca cozido: 2 opções").click();
    const swaps = page.getByRole("list", { name: "Trocas para feijão carioca cozido", exact: true });
    await expect(swaps).toBeVisible();
    await expect(swaps.getByRole("listitem").filter({ hasText: "pasta de amendoim" })).toContainText("Possível alérgeno");
    await expect(swaps.getByRole("listitem").filter({ hasText: "lentilha cozida" })).not.toContainText("Possível alérgeno");
    await expect(swaps.getByText("Possível alérgeno", { exact: true })).toHaveCount(1);
  });
  await shoot(page, "390-troca-alergeno.png");
  await check("plano antigo: sem rolagem lateral nem erros de página ou console", async () => {
    await noSideScroll(page);
    noErrors(errors);
  });
  await context.close();
}

// ---------- 8. Dieta com calorias ocultas ----------
{
  const state = withDiet(DIET_REPLY_KCAL, { hideCalories: true });
  const { page, context, errors } = await open(state, { route: "/dieta", clock: DIET_NOW, ready: (p) => p.getByTestId("next-meal") });
  await check('dieta com calorias ocultas: "calorias ocultas" e nenhum "500 kcal" (também no texto completo)', async () => {
    await expect(page.getByText("Evite passar de calorias ocultas no lanche", { exact: true })).toBeVisible();
    await noKcal(page, "dieta");
    await button(page, "Ver plano em texto").click();
    await expect(page.getByTestId("diet-plan-text").getByLabel("calorias ocultas", { exact: true })).toBeVisible();
    await noKcal(page, "texto da dieta");
    await expect(page.locator('[aria-label*="kcal"]')).toHaveCount(0);
  });
  await check("dieta com calorias ocultas: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

// ---------- 9. Foto do prato pelo "+" do chat ----------
for (const width of [390, 412]) {
  const { page, context, errors, control } = await open(baseState(), { width });
  await check(`${width} "+": "Mais opções do chat" abre o painel com aria-expanded`, async () => {
    await expect(plus(page)).toHaveAttribute("aria-expanded", "false");
    await plus(page).click();
    await expect(heading(page, "Mais opções")).toBeVisible();
    await expect(plus(page)).toHaveAttribute("aria-expanded", "true");
    await targets44(page.getByRole("button", { name: /^(Câmera|Galeria|Exame|Despensa)$/ }), "opções do painel");
  });
  await shoot(page, `${width}-chat-mais-opcoes.png`);
  await check(`${width} foto: Galeria → Registrar refeição com a foto e a análise automática (uma vez)`, async () => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, "Galeria").click()]);
    await chooser.setFiles({ name: "prato.png", mimeType: "image/png", buffer: PHOTO });
    await expect(page).toHaveURL(/\/refeicao/, { timeout: 20000 });
    await expect(page.getByRole("img", { name: "Foto da refeição a registrar", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("photo-draft")).toBeVisible({ timeout: 20000 });
    const photos = control.requests.filter((r) => r.mode === "photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].file).toMatch(/^data:image\//);
  });
  await check(`${width} foto: rascunho com confiança, alérgeno desmarcado e rádios da TACO`, async () => {
    const draft = page.getByTestId("photo-draft");
    await expect(draft.getByText("Confiança alta", { exact: true })).toBeVisible();
    await expect(draft.getByText("Possível alérgeno", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Incluir Paçoca", exact: true })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("checkbox", { name: "Incluir Arroz branco", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("checkbox", { name: "Incluir Feijão", exact: true })).toHaveAttribute("aria-checked", "true");
    const radios = page.getByRole("radiogroup", { name: "Alimento da TACO para Arroz branco", exact: true }).getByRole("radio");
    await expect(radios.first()).toHaveAttribute("aria-checked", "true");
    await targets44(page.getByRole("checkbox"), "caixas");
    await targets44(page.getByRole("radio"), "rádios");
    await expect(button(page, "Adicionar 2 à refeição")).toBeEnabled();
  });
  await check(`${width} foto: marcar e desmarcar muda o total do botão`, async () => {
    await page.getByRole("checkbox", { name: "Incluir Feijão", exact: true }).click();
    await expect(button(page, "Adicionar 1 à refeição")).toBeVisible();
    await page.getByRole("checkbox", { name: "Incluir Feijão", exact: true }).click();
    await expect(button(page, "Adicionar 2 à refeição")).toBeVisible();
  });
  await shoot(page, `${width}-foto-rascunho.png`);
  await check(`${width} foto: "Adicionar 2 à refeição" → "Seu prato · 2 itens" com foco, foto mantida`, async () => {
    await button(page, "Adicionar 2 à refeição").click();
    const plate = heading(page, "Seu prato · 2 itens");
    await expect(plate).toBeVisible();
    await expect(plate).toBeFocused();
    await noticeAndStatus(page, "2 itens adicionados ao prato. Confira as porções.");
    await expect(page.getByText("Itens da foto adicionados ao prato.", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Foto da refeição a registrar", exact: true })).toHaveCount(1);
    await noSideScroll(page);
  });
  await check(`${width} foto: sem erros de página nem de console`, async () => noErrors(errors));
  await check(`${width} foto: nada registrado sem "Salvar refeição"`, async () => {
    const saved = await readState(page, `foto-${width}`);
    expect(saved.diary).toHaveLength(0);
  });
  await context.close();
}

// ---------- 10. "+ → Exame" e "+ → Despensa" ----------
{
  const { page, context, errors } = await open(baseState());
  await check('"+ → Exame" abre Meu espaço na aba "Exames e consultas"', async () => {
    await plus(page).click();
    await button(page, "Exame").click();
    await expect(page).toHaveURL(/\/espaco\?tab=documentos/);
    await expect(page.getByRole("tab", { name: "Exames e consultas", exact: true })).toHaveAttribute("aria-selected", "true");
  });
  await check(`"+ → Despensa" abre a tela ${DESPENSA_TITLE}`, async () => {
    await page.goto(url + "/agente");
    await expect(input(page)).toBeVisible({ timeout: 30000 });
    await plus(page).click();
    await button(page, "Despensa").click();
    await expect(page).toHaveURL(/\/despensa/);
    await expect(page.getByRole("heading", { name: DESPENSA_TITLE, exact: true }).first()).toBeVisible();
  });
  await check("atalhos: sem erros de página nem de console", async () => noErrors(errors));
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
