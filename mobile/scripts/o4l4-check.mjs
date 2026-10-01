// Verificação da Onda 4 · Lote 4 (registro e privacidade) no export web do app, a 390 e 360 px:
// "Descrever refeição" com o agente simulado (DIARIO-07: rascunho, "Falta porção", confirmação ao
// salvar, sem ditado no web), "Qualidade do dia" no Diário (DIARIO-12), o cartão "Essencial" e o
// "Relatório para consulta" baixado como HTML local (ESPACO-08), "Ocultar números do corpo" no Meu
// espaço, no registro rápido e na Evolução (ESPACO-13). Correções da revisão: perguntas do relatório
// mascaradas com "Ocultar calorias", o resultado do relatório dentro da folha, passos do peso oculto que
// nunca partem do peso salvo e nenhuma próxima pesagem para menor de 18 com os números ocultos. Só o
// export web pode ser testado aqui: o ditado no aparelho (só Android), a folha de compartilhamento
// nativa, a limpeza do relatório no cache e o leitor de tela do aparelho não são validados.
// Uso (na pasta mobile; nunca junto com outra verificação na mesma porta):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o4l4
//   node --import tsx scripts/o4l4-check.mjs dist/o4l4 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { domainTone, palette } from "../../src/design/tokens.ts";
import { createDietPlan } from "../../src/lib/diet.ts";
import { localDate, shiftDate, withMeasurements } from "../../src/lib/domain.ts";
import { stateSchema } from "../../src/types.ts";
import { CALORIE_PATTERN } from "../../src/lib/text.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { LAB_EXAM, meal, water, weighIn } from "../../tests/report-fixtures.ts";
import { EXAM_RESULT, MEAL_TEXT_REPLY, MEAL_TEXT_SOURCE, REPLY_META } from "../../tests/structured-fixtures.ts";
import { SETTINGS_TAB } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o4l4");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o4l4-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o4l4-seed-"));
const PORT = 3237;
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
const CORS = { "access-control-allow-origin": "*" };
const READY_STATUS = { ready: true, token: "test-token", providers: { deepseek: true, openai: true } };
const URGENT_REPLY = {
  text: "Falta de ar pede atendimento agora: ligue 192 (SAMU) ou procure um pronto-socorro.",
  meta: { ...REPLY_META, urgency: "imediata", specialists: [], reviewed: false },
};
const TEXT_ONLY_REPLY = { text: "Arroz, feijão, frango grelhado e paçoca.", meta: REPLY_META };
const BODY_NUMBERS = /\d[\d.,]*\s*(kg|cm)\b|IMC|kg\/sem/;

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

let seeds = 0;
/**
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. /api/status
 * responde "pronto" e /api/agent responde com `agent(body)`; o resto da API é recusado.
 */
async function open(state, { width = 390, route = "/", ready, agent = null } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const agentCalls = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  // A última rota registrada vence: tudo recusado, menos o que cada cenário simula.
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  await page.route("**/api/status", (r) => r.fulfill({ json: READY_STATUS, headers: CORS }));
  await page.route("**/api/agent", (r) => {
    const body = r.request().postDataJSON();
    agentCalls.push(body);
    return agent ? r.fulfill({ json: agent(body), headers: CORS }) : r.abort("connectionrefused");
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
  await expect(ready(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors, agentCalls };
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

async function shoot(page, file, locator) {
  await page.waitForTimeout(300);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file) });
}
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/** Rosa e o tom de perigo: nunca na qualidade do dia nem em "Falta porção". */
const ROSE = [
  ...Object.entries(palette)
    .filter(([key, value]) => key.startsWith("rose") && /^#[0-9a-f]{6}$/i.test(value))
    .map(([, value]) => rgb(value)),
  ...Object.values(domainTone.danger).filter((value) => /^#[0-9a-f]{6}$/i.test(value)).map(rgb),
];
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const checkbox = (page, name) => page.getByRole("checkbox", { name, exact: true });
const toast = (page, text) => page.getByText(text, { exact: true });
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
async function touch44(locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.width < 44 - 0.5 || box.height < 44 - 0.5) throw Error(`${name}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
}
async function targets44(locator, name) {
  const count = await locator.count();
  if (!count) throw Error(`${name}: nenhum alvo`);
  for (let i = 0; i < count; i++) await touch44(locator.nth(i), `${name} ${i + 1}`);
}
/** Sem rolagem lateral no documento nem nas rolagens verticais (conteúdo mais largo que a tela). */
async function noSideScroll(page, where) {
  const over = await page.evaluate(() => {
    let worst = 0;
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX)) continue;
      worst = Math.max(worst, el.scrollWidth - el.clientWidth);
    }
    return { doc: document.documentElement.scrollWidth - window.innerWidth, worst };
  });
  if (over.doc > 0 || over.worst > 1) throw Error(`${where}: rolagem lateral (documento ${over.doc}, conteúdo ${over.worst})`);
}
async function noRose(locator, where) {
  const hits = await locator.evaluate((root, rose) => {
    const found = [];
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const s = getComputedStyle(el);
      for (const color of [s.color, s.backgroundColor, s.fill, s.stroke]) if (rose.includes(color)) found.push(`${el.tagName.toLowerCase()} ${color}`);
    }
    return found.slice(0, 5);
  }, ROSE);
  if (hits.length) throw Error(`${where}: tom rosa/perigo em ${hits.join(", ")}`);
}
/** Todo o texto visível e os nomes acessíveis da página (para barrar kcal ou números do corpo). */
async function pageText(page) {
  return page.evaluate(() =>
    [document.body.innerText, ...[...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"))].join("\n"),
  );
}

// ---------- Estados ----------
/** Registros do usuário da semente; valida como o app faria ao abrir (falha cedo com a semente errada). */
const valid = (state) => stateSchema.parse({ ...state, diary: state.diary.map((e) => ({ ...e, userId: state.userId })) });
/** Perfil de teste com o agente autorizado e alergia a amendoim declarada (stateFixture). */
function baseState(change = {}, extra = {}) {
  const state = stateFixture();
  return valid({ ...state, profile: { ...state.profile, consentAi: true, ...change }, ...extra });
}
/** Três pesagens (hoje−21, hoje−7, hoje); o perfil segue a mais recente (72,4 kg). */
function weighedState(change = {}, extra = {}) {
  const base = withMeasurements(
    stateFixture(),
    [weighIn(shiftDate(today, -21), 74), weighIn(shiftDate(today, -7), 73), weighIn(today, 72.4)],
    today,
  );
  return valid({ ...base, profile: { ...base.profile, consentAi: true, ...change }, ...extra });
}
const ESSENTIAL = {
  allergies: "sim",
  allergyDetails: "Amendoim, Camarão",
  conditions: "Hipertensão, Diabetes tipo 2",
  medications: "Anti-hipertensivo, Losartana 50 mg 1x ao dia",
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro (tirzepatida)",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
};
const reportState = (change = {}) =>
  weighedState({ ...ESSENTIAL, ...change }, { diary: [meal(today, ["taco-3", "taco-561", "taco-78", "taco-410"]), water(today, 1500)] });

// ---------- (1) Descrever refeição ----------
/** Atalho "Voz" (conceito 02): abre a folha "Descrever refeição"; o nome acessível começa com "Descrever". */
const describeTile = (page) => page.getByRole("button", { name: "Descrever por voz", exact: true });
const field = (page) => page.getByRole("textbox", { name: "O que você comeu?", exact: true });
const organize = (page) => button(page, "Organizar itens");
const draft = (page) => page.getByTestId("meal-text-draft");

for (const width of [390, 360]) {
  const { page, context, errors, agentCalls } = await open(baseState(), { width, route: "/refeicao", ready: describeTile, agent: () => MEAL_TEXT_REPLY });
  await check(`${width} (1) atalhos numa linha (conceito 02): "Foto do prato" larga, "Voz" e "Rótulo"; 44 px`, async () => {
    // Com o agente pronto e autorizado, a linha da foto é "a IA separa os itens".
    const photo = button(page, "Foto do prato, a IA separa os itens");
    const label = button(page, "Rótulo, novo alimento");
    const describe = describeTile(page);
    for (const [tile, name] of [[photo, "foto"], [label, "rótulo"], [describe, "voz"]]) await touch44(tile, name);
    await expect(describe).toHaveAttribute("aria-haspopup", "dialog");
    const [p, l, d] = await Promise.all([photo.boundingBox(), label.boundingBox(), describe.boundingBox()]);
    if (Math.abs(p.y - d.y) > 1 || Math.abs(p.y - l.y) > 1) throw Error(`linha: foto y=${p.y} voz y=${d.y} rótulo y=${l.y}`);
    if (!(p.x < d.x && d.x < l.x)) throw Error(`ordem: foto x=${p.x} voz x=${d.x} rótulo x=${l.x}`);
    if (p.width < 2 * d.width) throw Error(`foto ${p.width.toFixed(0)} x voz ${d.width.toFixed(0)}`);
    await noSideScroll(page, "refeição");
  });
  if (width === 390) await shoot(page, "390-atalhos.png");
  await check(`${width} (1) folha "Descrever refeição": sem "Ditar descrição" no web, dica do teclado e privacidade`, async () => {
    await describeTile(page).click();
    await expect(heading(page, "Descrever refeição")).toBeVisible();
    await expect(page.getByRole("button", { name: /Ditar descrição|Parar ditado/ })).toHaveCount(0);
    await expect(page.getByText(/^Para ditar, use o microfone do teclado/)).toBeVisible();
    await expect(page.getByText("O texto vai para o agente só quando você toca em Organizar itens.", { exact: true })).toBeVisible();
    await expect(organize(page)).toBeDisabled();
    await expect(page.getByText("0/600", { exact: true })).toBeVisible();
  });
  await check(`${width} (1) "Organizar itens": pedido meal_text com o texto, sem histórico nem anexo`, async () => {
    await field(page).fill(MEAL_TEXT_SOURCE);
    await expect(page.getByText(`${MEAL_TEXT_SOURCE.length}/600`, { exact: true })).toBeVisible();
    await touch44(organize(page), "Organizar itens");
    await organize(page).click();
    await expect(draft(page)).toBeVisible({ timeout: 20000 });
    const calls = agentCalls.filter((c) => c.mode === "meal_text");
    if (calls.length !== 1) throw Error(`${calls.length} pedidos meal_text`);
    const [call] = calls;
    if (call.text !== MEAL_TEXT_SOURCE) throw Error(`texto: ${call.text}`);
    if (!Array.isArray(call.history) || call.history.length) throw Error(`histórico: ${JSON.stringify(call.history)}`);
    if (call.file !== undefined) throw Error("anexo enviado");
  });
  await check(`${width} (1) rascunho: Paçoca desmarcada com "Possível alérgeno", Arroz marcado, porção dita e "Falta porção"`, async () => {
    await expect(heading(page, "Itens da descrição")).toBeVisible();
    await expect(checkbox(page, "Incluir Paçoca no prato")).toHaveAttribute("aria-checked", "false");
    await expect(checkbox(page, "Incluir Arroz branco no prato")).toHaveAttribute("aria-checked", "true");
    await expect(checkbox(page, "Incluir Feijão no prato")).toHaveAttribute("aria-checked", "true");
    await expect(checkbox(page, "Incluir Frango grelhado no prato")).toHaveAttribute("aria-checked", "true");
    await expect(draft(page).getByText("Possível alérgeno", { exact: true })).toBeVisible();
    await expect(draft(page).getByText("Porção dita: 4 colheres de sopa ≈ 100 g", { exact: true })).toBeVisible();
    await expect(draft(page).getByText("Falta porção: entra com a medida caseira padrão", { exact: true })).toBeVisible();
    await expect(draft(page).getByText("Não ficou claro se o frango tinha molho.", { exact: false })).toBeVisible();
    await targets44(draft(page).getByRole("checkbox"), "caixas");
    await targets44(draft(page).getByRole("radio"), "rádios");
    await touch44(button(page, "Adicionar 3 ao prato"), "Adicionar 3 ao prato");
    await noRose(draft(page), "rascunho");
    const text = await draft(page).innerText();
    if (/kcal|caloria/i.test(text)) throw Error("kcal no rascunho");
  });
  if (width === 390) await shoot(page, "390-rascunho.png");
  await check(`${width} (1) "Adicionar 3 ao prato": "Seu prato · 3 itens", "Falta porção" ×1 e "Falta porção em 1 item" na bandeja`, async () => {
    await button(page, "Adicionar 3 ao prato").click();
    await expect(heading(page, "Descrever refeição")).toHaveCount(0);
    await expect(heading(page, "Seu prato · 3 itens")).toBeVisible();
    await expect(heading(page, "Seu prato · 3 itens")).toBeFocused();
    await expect(page.getByText("3 itens adicionados ao prato. Falta porção em 1: confira.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Falta porção", { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("tray-pending")).toHaveText("Falta porção em 1 item");
    await expect(page.getByTestId("tray-dot")).toHaveCount(1);
    await touch44(button(page, "Manter porção de Peito de frango sem pele"), "Manter porção");
    await noSideScroll(page, "prato");
  });
  if (width === 390) {
    await shoot(page, "390-prato-falta-porcao.png");
    await check('390 (1) "Salvar refeição" pede confirmação; recusar fica na tela sem salvar', async () => {
      const messages = [];
      page.once("dialog", (dialog) => {
        messages.push(dialog.message());
        void dialog.dismiss();
      });
      await button(page, "Salvar refeição").click();
      await expect.poll(() => messages.length).toBe(1);
      if (!messages[0].startsWith("Salvar com a porção padrão?")) throw Error(messages[0]);
      if (!messages[0].includes("Falta porção em Peito de frango sem pele.")) throw Error(messages[0]);
      await expect(page).toHaveURL(/\/refeicao/);
      await expect(heading(page, "Seu prato · 3 itens")).toBeVisible();
    });
    await check('390 (1) aceitar "Salvar assim" grava arroz 100 g, feijão 200 g e frango 100 g', async () => {
      page.once("dialog", (dialog) => void dialog.accept());
      await button(page, "Salvar refeição").click();
      await expect(page).toHaveURL(/\/diario/, { timeout: 20000 });
    });
  } else {
    await check('360 (1) "Manter porção" tira o aviso e salva sem confirmação', async () => {
      await button(page, "Manter porção de Peito de frango sem pele").click();
      await expect(page.getByText("Falta porção", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("tray-pending")).toHaveCount(0);
      let asked = false;
      page.once("dialog", (dialog) => {
        asked = true;
        void dialog.dismiss();
      });
      await button(page, "Salvar refeição").click();
      await expect(page).toHaveURL(/\/diario/, { timeout: 20000 });
      if (asked) throw Error("pediu confirmação sem pendência");
    });
  }
  await check(`${width} (1) sem erros de página nem de console`, () => noErrors(errors));
  await check(`${width} (1) estado: refeição com taco-3 100 g, taco-561 200 g e taco-410 100 g`, async () => {
    const saved = await readState(page, `refeicao-${width}`);
    const meals = saved.diary.filter((e) => e.type === "refeicao");
    if (meals.length !== 1) throw Error(`${meals.length} refeições`);
    const grams = Object.fromEntries(meals[0].items.map((i) => [i.food.id, i.grams]));
    const expected = { "taco-3": 100, "taco-561": 200, "taco-410": 100 };
    if (JSON.stringify(grams) !== JSON.stringify(expected)) throw Error(JSON.stringify(grams));
  });
  await context.close();
}

// Sem autorização: "Organizar itens" desativado com o aviso e nenhum pedido ao agente.
{
  const { page, context, errors, agentCalls } = await open(baseState({ consentAi: false }), { width: 320, route: "/refeicao", ready: describeTile, agent: () => MEAL_TEXT_REPLY });
  await check('320 (1) sem autorização: "Voz" abre a folha com "Organizar itens" desativado e o aviso', async () => {
    // O atalho continua aberto; sem autorização, "Organizar itens" fica desativado com o aviso na folha.
    await expect(describeTile(page)).toBeVisible();
    await noSideScroll(page, "refeição 320");
    await describeTile(page).click();
    await field(page).fill(MEAL_TEXT_SOURCE);
    await expect(organize(page)).toBeDisabled();
    await expect(page.getByText("Organizar a descrição requer conexão com o agente e sua autorização em Meu espaço.", { exact: true })).toBeVisible();
    await noSideScroll(page, "folha 320");
    if (agentCalls.length) throw Error(`${agentCalls.length} pedidos ao agente`);
  });
  await shoot(page, "320-sem-autorizacao.png");
  await check("320 (1) sem autorização: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// Urgência, resposta só em texto e "Ocultar calorias".
for (const [name, reply, change] of [
  ["urgência", URGENT_REPLY, {}],
  ["só texto", TEXT_ONLY_REPLY, {}],
  ["calorias ocultas", MEAL_TEXT_REPLY, { hideCalories: true }],
]) {
  const { page, context, errors } = await open(baseState(change), { route: "/refeicao", ready: describeTile, agent: () => reply });
  await check(`390 (1) ${name}`, async () => {
    await describeTile(page).click();
    await field(page).fill("comi e fiquei com falta de ar");
    await organize(page).click();
    if (reply === URGENT_REPLY) {
      await expect(page.getByRole("alert").filter({ hasText: "192" })).toBeVisible({ timeout: 20000 });
      await expect(draft(page)).toHaveCount(0);
      await expect(heading(page, "Descrever refeição")).toBeVisible();
    } else if (reply === TEXT_ONLY_REPLY) {
      await expect(page.getByText("Confira os alimentos e busque cada um abaixo antes de salvar.", { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(draft(page)).toHaveCount(0);
    } else {
      await expect(draft(page)).toBeVisible({ timeout: 20000 });
      const text = await pageText(page);
      if (/kcal|caloria/i.test(text)) throw Error("kcal com calorias ocultas");
    }
    await touch44(button(page, "Voltar ao texto"), "Voltar ao texto");
    await button(page, "Voltar ao texto").click();
    await expect(field(page)).toHaveValue("comi e fiquei com falta de ar");
  });
  await check(`390 (1) ${name}: sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}

// ---------- (2) Qualidade do dia ----------
const quality = (page) => page.getByTestId("diary-quality");
for (const width of [390, 360]) {
  const state = baseState({}, { diary: [meal(today, ["taco-3", "taco-561", "taco-410"])] });
  const { page, context, errors } = await open(state, { width, route: "/diario", ready: (pg) => heading(pg, "Qualidade do dia") });
  await check(`${width} (2) anel "Variedade do dia: 3 de 7", legenda com 7 grupos (3 presentes), sem rosa`, async () => {
    await expect(page.getByRole("img", { name: /^Variedade do dia: 3 de 7 grupos de alimentos: / })).toBeVisible();
    const legend = page.getByRole("list", { name: "Grupos de alimentos do dia", exact: true });
    await expect(legend.getByRole("listitem")).toHaveCount(7);
    await expect(legend.getByTestId("quality-present")).toHaveCount(3);
    await noRose(quality(page), "qualidade do dia");
    const text = await quality(page).innerText();
    if (/kcal|caloria/i.test(text)) throw Error("calorias no cartão");
    await noSideScroll(page, "diário");
  });
  await check(`${width} (2) "Como contamos a variedade" (44 px) abre "Como contamos"`, async () => {
    const info = button(page, "Como contamos a variedade");
    await touch44(info, "Como contamos a variedade");
    await info.click();
    await expect(heading(page, "Como contamos")).toBeVisible();
    await expect(page.getByText(/^Contamos os grupos do Guia Alimentar/)).toBeVisible();
    await button(page, "Fechar").click();
  });
  if (width === 390) await shoot(page, "390-qualidade.png", quality(page));
  await check(`${width} (2) sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}
{
  const state = baseState({}, { diary: [meal(shiftDate(today, -1), ["taco-3"])] });
  const { page, context, errors } = await open(state, { route: "/diario", ready: (pg) => heading(pg, "Refeições") });
  await check('(2) dia sem refeições: sem "Qualidade do dia"', async () => {
    await expect(heading(page, "Qualidade do dia")).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (3) Essencial e relatório ----------
const essentialReady = (page) => page.getByTestId("health-mosaic");
/** "Relatório para consulta" no rodapé do cartão Próxima consulta (conceito 11), como no web. */
const reportButton = (page) => page.getByTestId("consulta-card").getByRole("button", { name: /^Relatório para consulta/ });
async function shareReport(page) {
  const [download] = await Promise.all([page.waitForEvent("download"), button(page, "Compartilhar relatório").click()]);
  if (download.suggestedFilename() !== `relatorio-webfit-${today}.html`) throw Error(download.suggestedFilename());
  return readFileSync(await download.path(), "utf8");
}
for (const width of [390, 360]) {
  const { page, context, errors } = await open(reportState(), { width, route: "/espaco", ready: essentialReady });
  await check(`${width} (3) Essencial: o mosaico nunca mostra condições nem remédios da anamnese; a folha mostra, sem dose`, async () => {
    const mosaic = essentialReady(page);
    await expect(mosaic).toContainText("Amendoim");
    for (const hidden of ["Losartana", "Hipertensão"]) await expect(mosaic).not.toContainText(hidden);
    const allergies = mosaic.getByRole("button", { name: "Alergias", exact: true });
    await touch44(allergies, "Alergias");
    await expect(allergies).toHaveAttribute("aria-haspopup", "dialog");
    await allergies.click();
    await expect(heading(page, "Essencial")).toBeVisible();
    const card = page.getByTestId("essential-card");
    await expect(page.getByTestId("essential-summary")).toHaveText("2 alergias · 2 condições · 3 medicamentos");
    for (const chip of ["Amendoim", "Camarão", "Hipertensão", "Losartana", "Mounjaro (tirzepatida)"])
      await expect(card.getByText(chip, { exact: true })).toBeVisible();
    await expect(card.getByText("Informativo, como você informou na anamnese; sem doses.", { exact: true })).toBeVisible();
    await expect(button(page, "Relatório para consulta")).toHaveAttribute("aria-haspopup", "dialog");
    const text = await card.innerText();
    if (/50 mg|1x|\d\s*mg/.test(text)) throw Error(`dose no cartão: ${text}`);
    await noRose(card, "Essencial");
    await noSideScroll(page, "Essencial");
  });
  if (width === 390) await shoot(page, "390-essencial.png", page.getByTestId("essential-card"));
  await check(`${width} (3) "Relatório para consulta": 30 dias, seções marcadas pelo padrão, alvos de 44 px`, async () => {
    await button(page, "Fechar").click();
    await expect(heading(page, "Essencial")).toHaveCount(0);
    const open = reportButton(page);
    await touch44(open, "Relatório para consulta");
    await open.click();
    await expect(heading(page, "Relatório para consulta")).toBeVisible();
    await expect(page.getByRole("tab", { name: "30 dias", exact: true })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Essencial", "Medidas", "Calorias", "Alimentação e água", "Perguntas para a consulta"])
      await expect(checkbox(page, name)).toHaveAttribute("aria-checked", "true");
    await expect(checkbox(page, "Exames")).toHaveAttribute("aria-checked", "false");
    await targets44(page.getByRole("checkbox"), "seções");
    await touch44(button(page, "Compartilhar relatório"), "Compartilhar relatório");
    await noSideScroll(page, "relatório");
  });
  if (width === 390) await shoot(page, "390-relatorio.png");
  await check(`${width} (3) "90 dias" → "Compartilhar relatório" baixa o HTML local e avisa`, async () => {
    await page.getByRole("tab", { name: "90 dias", exact: true }).click();
    const html = await shareReport(page);
    if (!html.startsWith("<!doctype html>")) throw Error(html.slice(0, 40));
    if (!html.includes("Relatório para consulta")) throw Error("sem título");
    if (/<script|\ssrc=|\shref=/.test(html)) throw Error("recurso externo ou script no HTML");
    if (!html.includes('class="wf-report-chart"')) throw Error("sem gráfico de peso");
    if (/\b(normal|alterad)/i.test(html)) throw Error("classificação no relatório");
    // O aviso anuncia; a folha aberta o cobre, então a frase também aparece dentro dela (aria-hidden no web).
    await expect(page.getByTestId("toast-success")).toHaveText("Relatório pronto para compartilhar.");
    await expect(page.getByTestId("sheet-notice")).toHaveText("Relatório pronto para compartilhar.");
    await expect(page.getByTestId("sheet-notice")).toHaveAttribute("aria-hidden", "true");
  });
  await check(`${width} (3) sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}
for (const [name, change, verify] of [
  [
    "calorias ocultas: sem a seção Calorias e sem kcal no HTML",
    { hideCalories: true },
    async (page, html) => {
      await expect(checkbox(page, "Calorias")).toHaveCount(0);
      if (/kcal|caloria/i.test(html)) throw Error("kcal no relatório");
    },
  ],
  [
    "perfil calmo: Medidas e Calorias desmarcadas; marcada, Medidas só com o peso",
    { eatingDisorder: "sim" },
    async (page, html) => {
      if (!html.includes("72,4 kg")) throw Error("sem o peso");
      if (/<svg|IMC|Variação/.test(html)) throw Error("gráfico, IMC ou variação em perfil calmo");
    },
  ],
  [
    "números ocultos: Medidas desmarcada com a nota",
    { hideBodyNumbers: true },
    async (page) => {
      await expect(page.getByText("Inclui os números do corpo que você ocultou nas telas.", { exact: true })).toBeVisible();
    },
  ],
]) {
  const { page, context, errors } = await open(reportState(change), { route: "/espaco", ready: essentialReady });
  await check(`390 (3) ${name}`, async () => {
    await reportButton(page).click();
    await expect(heading(page, "Relatório para consulta")).toBeVisible();
    if (change.eatingDisorder || change.hideBodyNumbers) {
      await expect(checkbox(page, "Medidas")).toHaveAttribute("aria-checked", "false");
      if (change.eatingDisorder) await expect(checkbox(page, "Calorias")).toHaveAttribute("aria-checked", "false");
      await checkbox(page, "Medidas").click();
      await expect(checkbox(page, "Medidas")).toHaveAttribute("aria-checked", "true");
    }
    await verify(page, await shareReport(page));
    noErrors(errors);
  });
  await context.close();
}

// "Ocultar calorias": a pergunta pendente do exame com kcal chega mascarada no campo "Suas perguntas".
{
  const exam = { ...LAB_EXAM, analysisStructured: { ...EXAM_RESULT, perguntas: ["Posso manter 1.500 kcal por dia?"] }, questionsDone: [] };
  const state = weighedState({ hideCalories: true }, { exams: [exam] });
  const { page, context, errors } = await open(state, { route: "/espaco", ready: essentialReady });
  await check("390 (3) calorias ocultas: a pergunta do exame aparece sem kcal em Suas perguntas", async () => {
    await reportButton(page).click();
    await expect(heading(page, "Relatório para consulta")).toBeVisible();
    const questions = page.getByRole("textbox", { name: "Suas perguntas (uma por linha)", exact: true });
    await expect(questions).toHaveValue("Posso manter calorias ocultas por dia?");
    const value = await questions.inputValue();
    if (new RegExp(CALORIE_PATTERN.source, "i").test(value)) throw Error(`calorias no campo: ${value}`);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (4) Ocultar números do corpo ----------
{
  const { page, context, errors } = await open(weighedState(), { route: "/espaco?tab=preferencias", ready: (pg) => heading(pg, "Suas escolhas") });
  await check('(4) "Ocultar números do corpo" grava com "Preferência salva."', async () => {
    const toggle = page.getByRole("switch", { name: "Ocultar números do corpo", exact: true });
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toast(page, "Preferência salva.")).toBeVisible();
  });
  await check('(4) Minha saúde: "Números do corpo ocultos", sem kg, cm nem IMC no cartão Corpo', async () => {
    await page.getByRole("tab", { name: "Minha saúde", exact: true }).click();
    await expect(page.getByTestId("body-hidden")).toBeVisible();
    await expect(page.getByTestId("body-hidden")).toContainText("Números do corpo ocultos");
    const text = await page.getByTestId("body-card").innerText();
    if (BODY_NUMBERS.test(text)) throw Error(`números no Corpo: ${text}`);
    await touch44(button(page, "Ajustar em Preferências"), "Ajustar em Preferências");
  });
  await shoot(page, "390-corpo-oculto.png", page.getByTestId("body-card"));
  await check('(4) "Ajustar em Preferências" volta à aba de preferências', async () => {
    await button(page, "Ajustar em Preferências").click();
    await expect(heading(page, "Suas escolhas")).toBeVisible();
  });
  await check('(4) registro rápido: peso vazio, passos desativados, "Peso salvo." sem o valor', async () => {
    await page.goto(url + "/");
    await button(page, "Registro rápido").click();
    await button(page, "Peso").click();
    const weight = page.getByLabel("Peso em kg", { exact: true });
    await expect(weight).toHaveValue("");
    await expect(button(page, "Aumentar 0,1 kg")).toBeDisabled();
    // "," ou "." sozinhos não são número: os passos continuam parados e nunca partem do peso salvo.
    for (const partial of [",", "."]) {
      await weight.fill(partial);
      await expect(button(page, "Aumentar 0,1 kg")).toBeDisabled();
      await expect(button(page, "Diminuir 0,1 kg")).toBeDisabled();
      await button(page, "Aumentar 0,1 kg").click({ force: true });
      await expect(weight).toHaveValue(partial);
    }
    await weight.fill("72,5");
    await expect(button(page, "Aumentar 0,1 kg")).toBeEnabled();
    await button(page, "Salvar peso").click();
    await expect(toast(page, "Peso salvo.")).toBeVisible();
  });
  await check("(4) sem erros de página nem de console", () => noErrors(errors));
  await check("(4) estado: hideBodyNumbers e a pesagem de hoje com 72,5 kg", async () => {
    const saved = await readState(page, "privacidade");
    if (saved.profile.hideBodyNumbers !== true) throw Error("preferência não gravada");
    const todayWeight = saved.measurements.find((m) => m.date === today)?.weight;
    if (todayWeight !== 72.5) throw Error(`peso de hoje ${todayWeight}`);
  });
  await context.close();
}

// ---------- (6) Evolução com os números ocultos ----------
for (const width of [390, 360]) {
  const { page, context, errors } = await open(weighedState({ hideBodyNumbers: true }), {
    width,
    route: "/evolucao",
    ready: (pg) => pg.getByTestId("journey-hidden"),
  });
  await check(`${width} (6) Evolução oculta: jornada sem números, sem gráfico de peso nem kg/cm/IMC`, async () => {
    await expect(page.getByTestId("journey-hidden")).toContainText("Números do corpo ocultos · 3 pesagens registradas");
    // Adulto: a próxima pesagem (só a data) continua na jornada oculta.
    await expect(page.getByTestId("journey-next")).toBeVisible();
    await expect(page.getByRole("group", { name: /^Peso:/ })).toHaveCount(0);
    await expect(heading(page, "Pesagens")).toBeVisible();
    const text = await pageText(page);
    const hit = BODY_NUMBERS.exec(text);
    if (hit) throw Error(`número do corpo à vista: "${hit[0]}"`);
    await noSideScroll(page, "evolução");
  });
  if (width === 390) await shoot(page, "390-evolucao-oculta.png");
  if (width === 390)
    await check(`390 (6) "Ajustar em Preferências" de novo, depois de trocar de aba à mão, volta a "${SETTINGS_TAB.ariaLabel}"`, async () => {
      const prefs = page.getByRole("tab", { name: SETTINGS_TAB.ariaLabel, exact: true });
      const adjust = () => page.getByTestId("journey-card").getByRole("button", { name: "Ajustar em Preferências", exact: true });
      await adjust().click();
      await expect(prefs).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "Minha saúde", exact: true }).click();
      await expect(prefs).toHaveAttribute("aria-selected", "false");
      await page.getByRole("tab", { name: "Evolução", exact: true }).click();
      await expect(page.getByTestId("journey-hidden")).toBeVisible();
      await adjust().click();
      await expect(prefs).toHaveAttribute("aria-selected", "true");
      await expect(heading(page, "Suas escolhas")).toBeVisible();
      await page.getByRole("tab", { name: "Evolução", exact: true }).click();
      await expect(page.getByTestId("journey-hidden")).toBeVisible();
    });
  await check(`${width} (6) "Registrar medidas": "Peso (kg)" vazio; 72,5 → "Medição salva e perfil atualizado."`, async () => {
    await button(page, "Registrar medidas").first().click();
    const weight = page.getByRole("textbox", { name: "Peso (kg)", exact: true });
    await expect(weight).toHaveValue("");
    await weight.fill("72,5");
    // Já há pesagem hoje: "Substituir a medição?" (window.confirm no export web) é aceito.
    const messages = [];
    page.once("dialog", (dialog) => {
      messages.push(dialog.message());
      void dialog.accept();
    });
    await button(page, "Salvar medidas").click();
    await expect.poll(() => messages.length).toBe(1);
    if (!messages[0].startsWith("Substituir a medição?")) throw Error(messages[0]);
    await expect(toast(page, "Medição salva e perfil atualizado.")).toBeVisible();
  });
  await check(`${width} (6) "Relatório para consulta" no fim da Evolução abre a folha`, async () => {
    const entry = button(page, "Relatório para consulta");
    await entry.scrollIntoViewIfNeeded();
    await touch44(entry, "Relatório para consulta");
    await expect(entry).toHaveAttribute("aria-haspopup", "dialog");
    await entry.click();
    await expect(heading(page, "Relatório para consulta")).toBeVisible();
    await expect(checkbox(page, "Medidas")).toHaveAttribute("aria-checked", "false");
  });
  await check(`${width} (6) sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}

// Menor de 18 anos com os números ocultos: perfil calmo, sem "Próxima pesagem" (nem "Pesagem sugerida hoje").
for (const [name, weighIns] of [
  ["próxima pesagem à frente", [[-21, 74], [-7, 73], [0, 72.4]]],
  ["última pesagem há 10 dias", [[-24, 74], [-10, 73]]],
]) {
  const minor = withMeasurements(
    stateFixture(),
    weighIns.map(([days, kg]) => weighIn(shiftDate(today, days), kg)),
    today,
  );
  const state = valid({ ...minor, profile: { ...minor.profile, birthDate: shiftDate(today, -16 * 365), hideBodyNumbers: true } });
  const { page, context, errors } = await open(state, { route: "/evolucao", ready: (pg) => pg.getByTestId("journey-hidden") });
  await check(`390 (6) menor de 18 com números ocultos (${name}): jornada sem a próxima pesagem`, async () => {
    await expect(page.getByTestId("journey-hidden")).toBeVisible();
    await expect(page.getByTestId("journey-next")).toHaveCount(0);
    const text = await page.getByTestId("journey-card").innerText();
    if (/pesagem sugerida|próxima pesagem/i.test(text)) throw Error(`lembrete de pesagem: ${text}`);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (7) Texto do agente salvo antes de ocultar os números do corpo ----------
const OLD_BODY_TEXT = "Seu último registro foi 72 kg, com cintura de 84 cm. Porções pensadas para seus 72 kg.";
{
  const at = new Date().toISOString();
  const messages = [
    { id: "m-1", sender: "user", text: "Como estou indo?", timestamp: at, status: "sent" },
    { id: "m-2", sender: "ai", text: OLD_BODY_TEXT, timestamp: at, status: "sent", meta: REPLY_META },
  ];
  const { page, context, errors } = await open(weighedState({ hideBodyNumbers: true }, { messages }), {
    route: "/agente",
    ready: (pg) => pg.getByLabel("Mensagem para o agente", { exact: true }),
  });
  await check('390 (7) números ocultos: resposta salva com "72 kg" e "84 cm" mostra "número oculto" no chat', async () => {
    await expect(page.getByText(/Seu último registro foi número oculto/)).toBeVisible();
    const text = await pageText(page);
    const hit = BODY_NUMBERS.exec(text);
    if (hit) throw Error(`número do corpo à vista: "${hit[0]}"`);
    noErrors(errors);
  });
  await context.close();
}
{
  const base = weighedState({ hideBodyNumbers: true });
  const dietPlan = createDietPlan({ text: `## Resumo\n${OLD_BODY_TEXT}`, meta: REPLY_META }, base.profile);
  const { page, context, errors } = await open(valid({ ...base, dietPlan }), {
    route: "/dieta",
    ready: (pg) => pg.getByTestId("diet-plan-text"),
  });
  await check('390 (7) números ocultos: plano salvo com "72 kg" mostra "número oculto" na Dieta', async () => {
    await expect(page.getByTestId("diet-plan-text")).toContainText("número oculto");
    const text = await pageText(page);
    const hit = BODY_NUMBERS.exec(text);
    if (hit) throw Error(`número do corpo à vista: "${hit[0]}"`);
    noErrors(errors);
  });
  await context.close();
}

await browser.close();
server.close();
console.log(`\n${passed} passaram, ${failed} falharam. Capturas em ${shots}`);
process.exit(failed ? 1 : 0);
