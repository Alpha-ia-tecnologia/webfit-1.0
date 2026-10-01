// Verificação da Onda 4 · Lote 3 (Tratamento) no export web do app, a 390 px (e 320 onde indicado):
// efeitos percebidos no bem-estar e "Como ficou?" no Diário (SERINGA-07), a grade "Seu ciclo" na Evolução,
// o estoque do frasco ou caneta (SERINGA-12), "Seu ciclo da semana" no Hoje e na "Aplicação registrada"
// (SERINGA-11) e a leitura do rótulo por foto com confirmação obrigatória (INJECAO-X2), inclusive a foto que
// chega depois de fechar a folha (descartada) e os botões desativados durante a escolha.
// Só o export web pode ser testado aqui: a câmera e a remoção dos arquivos do cache no aparelho não.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o4l3
//   node --import tsx scripts/o4l3-check.mjs dist/o4l3 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { palette } from "../../src/design/tokens.ts";
import { diarySchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { LABEL_READ, LABEL_READ_MULTI, LABEL_READ_NONE } from "../../tests/label-fixtures.ts";
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o4l3");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o4l3-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o4l3-seed-"));
const PORT = 3236;
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
const ddmm = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const ARROZ = taco.find((f) => f.name === "Arroz, integral, cozido");
if (!ARROZ) throw Error("sem arroz na TACO");
const TIRZ = { weightLossPen: "sim", weightLossPenName: "Tirzepatida", weightLossPenDose: "2,5 mg", weightLossPenPerMonth: 4 };
const SEMA = { weightLossPen: "sim", weightLossPenName: "Semaglutida", weightLossPenDose: "0,25 mg", weightLossPenPerMonth: 4 };
const NO_DOSE_ADVICE = /aument|reduz|ajust|mantenha|dobr|atrasad/i;
const NO_INTERPRETATION = /piora|melhora|aument|reduz/i;
const WARM = [palette.rose400, palette.rose600, palette.rose700, palette.amber500, palette.amber600, palette.amber700].map((c) => c.toLowerCase());
const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const WARM_RGB = WARM.map(rgbOf);
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const META = { specialists: ["analista_exames"], reviewed: true, revisions: 0, urgency: "nenhuma", notes: [], llmCalls: 2 };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

// ---------- Estado de teste ----------
/** Aplicação de Tirzepatida 5 mg/ml, 50 UI na seringa de 100 UI (2,5 mg), `daysAgo` dias atrás. */
function inj(id, daysAgo, fields = {}) {
  const date = shiftDate(today, -daysAgo);
  const time = fields.time ?? "08:30";
  return {
    id,
    userId: "local",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    method: "frasco",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
    notes: "",
    ...fields,
  };
}
const inj5 = (id, daysAgo) => inj(id, daysAgo, { units: 100, volumeMl: 1, doseMg: 5 });
/** Bem-estar com efeitos, `daysAgo` dias atrás. */
function wellbeing(id, daysAgo, symptoms) {
  const date = shiftDate(today, -daysAgo);
  return diarySchema.parse({
    id,
    userId: "local",
    date,
    time: "20:00",
    createdAt: `${date}T20:00:00.000Z`,
    updatedAt: `${date}T20:00:00.000Z`,
    type: "bem_estar",
    title: "Bem-estar",
    description: "",
    rating: 3,
    symptoms: symptoms.map(([key, intensity]) => ({ key, intensity })),
  });
}
/** Almoço de hoje às 12:40 (100 g de arroz). */
function lunch(id, daysAgo = 0) {
  const date = shiftDate(today, -daysAgo);
  const items = [{ food: ARROZ, grams: 100 }];
  return diarySchema.parse({
    id,
    userId: "local",
    date,
    time: "12:40",
    createdAt: `${date}T12:40:00.000Z`,
    updatedAt: `${date}T12:40:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    description: "",
    categoryTag: "Almoço",
    items,
    ...mealTotals(items),
  });
}
function stateWith(profile = {}, { injections = [], diary = [], extra = {} } = {}) {
  const state = stateFixture();
  return {
    ...state,
    profile: { ...state.profile, ...profile },
    injections: injections.map((e) => ({ ...e, userId: state.userId })),
    diary: diary.map((e) => ({ ...e, userId: state.userId })),
    ...extra,
  };
}
/** §5.3-3: 2,5 mg em −21/−14 e 5 mg em −7/0; efeitos em −23 (fora), −20, −13, −12 (forte), −6 e −3. */
const cycleSeed = () => ({
  injections: [inj("c1", 21), inj("c2", 14), inj5("c3", 7), inj5("c4", 0)],
  diary: [
    wellbeing("w1", 23, [["nausea", 1]]),
    wellbeing("w2", 20, [["nausea", 2]]),
    wellbeing("w3", 13, [["nausea", 1]]),
    wellbeing("w4", 12, [["nausea", 3]]),
    wellbeing("w5", 6, [["nausea", 2], ["cansaco", 1]]),
    wellbeing("w6", 3, [["intestino_preso", 1]]),
  ],
});
const vialStock = (openedDaysAgo, useBy) => ({ method: "frasco", volumeMl: 2, doses: null, openedOn: shiftDate(today, -openedDaysAgo), useBy });

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
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. Sem `agent`, as chamadas
 * ao servidor são recusadas; com ele, o servidor responde pronto e `agent(route, body)` atende /api/agent.
 * As confirmações (window.confirm do confirmAsync) são aceitas.
 */
async function open(state, { width = 390, route = "/", ready, agent } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await page.route("**/api/**", async (r) => {
    const request = r.request();
    if (!agent) return r.abort("connectionrefused");
    if (request.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/status")
      return r.fulfill({ json: { ready: true, token: "test-token", providers: { deepseek: false, openai: true } }, headers: cors });
    if (pathname === "/api/agent") return agent(r, request.postDataJSON());
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
  // Semana do Hoje: segunda a domingo ("Esta semana", conceito 01).
  await expect(ready ? ready(page) : page.getByRole("group", { name: "Esta semana" })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors, dialogs };
}
const evolucaoReady = (page) => page.getByRole("heading", { name: EVOLUCAO_TITLE, exact: true });
const injecaoReady = (page) => page.getByRole("heading", { name: "Seringa e dose", exact: true });
const diaryReady = (page) => page.getByRole("heading", { name: "Meu diário", exact: true });
/** Meu espaço (conceito 11): "Meu tratamento" abre como folha pela linha Medicação do mosaico. */
const espacoReady = (page) => page.getByTestId("health-mosaic");
async function openTreatmentSheet(page) {
  await espacoReady(page).getByRole("button", { name: "Medicação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meu tratamento", exact: true })).toBeVisible();
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
  const raw = db.prepare("SELECT value FROM storage WHERE key=?").get("webfit-personal-v1").value;
  db.close();
  return { state: JSON.parse(raw), raw };
}

/** Sem rolagem lateral: nenhum elemento visível passa da janela (o carrossel "Por dose" rola por dentro). */
async function noSideScroll(page, skip = '[data-testid="dose-carousel"]') {
  const problem = await page.evaluate((ignore) => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest(ignore)) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  }, skip);
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Menor fonte de texto visível (px) dentro de `selector`, ignorando SVG e texto só para leitores de tela. */
async function smallestText(page, selector = "body") {
  return page.evaluate((sel) => {
    let min = Infinity;
    for (const root of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const el = node.parentElement;
        const rect = el?.getBoundingClientRect();
        if (!el || !rect || rect.width <= 1 || rect.height <= 1) continue;
        const style = getComputedStyle(el);
        if (style.opacity === "0" || style.visibility === "hidden" || el.closest("svg")) continue;
        min = Math.min(min, parseFloat(style.fontSize));
      }
    }
    return min;
  }, selector);
}
async function touch44(locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.width < 44 - 0.5 || box.height < 44 - 0.5) throw Error(`${name}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
}
async function shoot(page, file, locator) {
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file), fullPage: false });
}
/** Nenhum fundo ou borda em rosa ou âmbar dentro de `selector`. */
async function noWarmColors(page, selector) {
  const found = await page.evaluate(
    ({ sel, warm }) => {
      const hits = [];
      for (const el of document.querySelectorAll(`${sel}, ${sel} *`)) {
        const style = getComputedStyle(el);
        for (const color of [style.backgroundColor, style.borderTopColor, style.color, style.fill])
          if (warm.includes(color)) hits.push(`${el.tagName} ${color}`);
      }
      return hits;
    },
    { sel: selector, warm: WARM_RGB },
  );
  if (found.length) throw Error(found.slice(0, 5).join(" | "));
}
const sheet = (page, title) => page.getByRole("heading", { name: title, exact: true }).locator("xpath=../..");
const button = (page, name) => page.getByRole("button", { name, exact: true });
/** Botão da receita (conceito 10): "Registrar aplicação de hoje" no dia estimado, senão "Registrar aplicação". */
const recipeRegister = (page) => page.getByTestId("injection-recipe").getByRole("button", { name: /^Registrar aplicação/ });
/** Evolução (conceito 09): abre a folha "Medicação e locais", onde fica o "Seu ciclo". */
async function openTreatment(page) {
  await page.getByRole("button", { name: /^Medicação e locais, / }).click();
  await expect(page.getByRole("heading", { name: "Medicação e locais", exact: true })).toBeVisible();
}
const radio = (page, name) => page.getByRole("radio", { name, exact: true });
const fab = (page) => button(page, "Registro rápido");
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
async function openWellbeing(page) {
  await fab(page).click();
  await button(page, "Bem-estar").click();
  await expect(page.getByRole("heading", { name: "Registrar bem-estar", exact: true })).toBeVisible();
}

// ---------- (a) Efeitos percebidos no bem-estar ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, { injections: [inj("a1", 1)] }));
  await check('(a) caneta: grupo "Efeitos percebidos (opcional)" logo após os rostos; um único "Náusea"', async () => {
    await openWellbeing(page);
    await expect(page.getByRole("group", { name: "Efeitos percebidos (opcional)" })).toBeVisible();
    await expect(button(page, "Náusea")).toHaveCount(1);
    for (const tag of ["Cansaço", "Dor de cabeça", "Intestino preso"]) await expect(button(page, tag)).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Marcadores (opcional)" })).toBeVisible();
    const mood = await page.getByRole("radiogroup", { name: "Como você se sente?" }).boundingBox();
    const effects = await page.getByRole("group", { name: "Efeitos percebidos (opcional)" }).boundingBox();
    const sleep = await page.getByRole("group", { name: "Horas de sono (opcional)" }).boundingBox();
    if (!(mood.y < effects.y && effects.y < sleep.y)) throw Error("ordem: rostos → efeitos → sono");
  });
  await check('(a) "Náusea" liga com "Leve"; "Forte" mostra a nota neutra; bolinhas com 44 × 44', async () => {
    await button(page, "Náusea").click();
    await expect(button(page, "Náusea")).toHaveAttribute("aria-pressed", "true");
    const group = page.getByRole("radiogroup", { name: "Intensidade de Náusea" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Leve", exact: true })).toHaveAttribute("aria-checked", "true");
    for (const name of ["Leve", "Moderada", "Forte"]) await touch44(group.getByRole("radio", { name, exact: true }), name);
    await expect(page.getByTestId("symptom-strong-note")).toHaveCount(0);
    await group.getByRole("radio", { name: "Forte", exact: true }).click();
    await expect(group.getByRole("radio", { name: "Forte", exact: true })).toHaveAttribute("aria-checked", "true");
    const note = page.getByTestId("symptom-strong-note");
    await expect(note).toContainText("Efeito forte");
    await expect(note).toContainText("converse com quem acompanha seu tratamento");
    await expect(note).toHaveAttribute("role", "note");
    const text = await note.innerText();
    if (/dose|\bmg\b|aument|reduz|suspend/i.test(text)) throw Error(text);
    await touch44(button(page, "Náusea"), "chip Náusea");
    await noWarmColors(page, '[data-testid="symptom-strong-note"]');
  });
  await shoot(page, "390-efeitos.png");
  await check('(a) salvar grava symptoms [{ nausea, 3 }] e o Diário mostra o chip "Náusea, intensidade forte"', async () => {
    await button(page, "Salvar registro").click();
    await expect(page.getByText("Registro salvo.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Diário", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    const chip = page.getByTestId("diary-symptom-chip");
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("Náusea");
    await expect(chip).toContainText("Náusea, intensidade forte");
    const small = await smallestText(page, '[data-testid="diary-symptom-chip"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    noErrors(errors);
  });
  await check("(a) estado gravado: bem-estar com symptoms [{ nausea, 3 }]", async () => {
    const { state } = await readState(page, "efeitos");
    const entry = state.diary.find((e) => e.type === "bem_estar");
    if (JSON.stringify(entry?.symptoms) !== JSON.stringify([{ key: "nausea", intensity: 3 }])) throw Error(JSON.stringify(entry));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith(TIRZ, { injections: [inj("a2", 1)] }), { width: 320 });
  await check('(a) 320 px: 6 efeitos marcados, o 7º fica aria-disabled com "Até 6 efeitos por registro." e sem rolagem lateral', async () => {
    await openWellbeing(page);
    for (const name of ["Náusea", "Vômito", "Azia ou refluxo", "Intestino preso", "Diarreia", "Dor na barriga"]) await button(page, name).click();
    await expect(page.getByText("Até 6 efeitos por registro.", { exact: true })).toBeVisible();
    await expect(button(page, "Cansaço")).toHaveAttribute("aria-disabled", "true");
    await button(page, "Cansaço").click({ force: true });
    await expect(button(page, "Cansaço")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("radiogroup", { name: /^Intensidade de / })).toHaveCount(6);
    await noSideScroll(page);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    noErrors(errors);
  });
  await shoot(page, "320-seis-efeitos.png");
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith());
  await check('(a) sem caneta: nenhum "Efeitos percebidos"; o marcador "Náusea" continua', async () => {
    await openWellbeing(page);
    await expect(page.getByRole("group", { name: "Marcadores (opcional)" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Efeitos percebidos (opcional)" })).toHaveCount(0);
    await expect(button(page, "Náusea")).toHaveCount(1);
    await expect(page.getByRole("radiogroup", { name: /^Intensidade de / })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (b) "Como ficou?" no Diário ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, { injections: [inj("b1", 2)], diary: [lunch("meal-b")] }), {
    route: "/diario",
    ready: diaryReady,
  });
  await check('(b) "Como ficou? Almoço das 12:40" (44 px) abre a folha com 5 opções na ordem', async () => {
    const ask = button(page, "Como ficou? Almoço das 12:40");
    await expect(ask).toBeVisible();
    await touch44(ask, "Como ficou?");
    await ask.click();
    const panel = sheet(page, "Como ficou?");
    await expect(panel.getByText("Almoço das 12:40", { exact: true })).toBeVisible();
    const options = panel.getByRole("group", { name: "Como ficou?" }).getByRole("button");
    await expect(options).toHaveText(["Ainda com fome", "Na medida", "Saciou rápido", "Pouca fome", "Desconforto"]);
    for (const name of ["Ainda com fome", "Desconforto"]) await touch44(panel.getByRole("button", { name, exact: true }), name);
  });
  await shoot(page, "390-como-ficou.png");
  await check('(b) "Na medida" grava, fecha e vira "Como ficou: Na medida. Alterar, Almoço das 12:40"', async () => {
    await sheet(page, "Como ficou?").getByRole("button", { name: "Na medida", exact: true }).click();
    await expect(page.getByText("Anotado: Na medida.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Como ficou?", exact: true })).toHaveCount(0);
    const chip = button(page, "Como ficou: Na medida. Alterar, Almoço das 12:40");
    await expect(chip).toBeVisible();
    // Mesmo texto do web (SATIETY_COPY.chip).
    await expect(chip).toHaveText("Como ficou: Na medida");
    await touch44(chip, "chip Na medida");
    await chip.click();
    await expect(sheet(page, "Como ficou?").getByRole("button", { name: "Na medida", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(sheet(page, "Como ficou?").getByRole("button", { name: "Limpar resposta", exact: true })).toBeVisible();
    await sheet(page, "Como ficou?").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Como ficou?", exact: true })).toHaveCount(0);
    noErrors(errors);
  });
  await check('(b) estado gravado: satiety "na_medida" no almoço', async () => {
    const { state } = await readState(page, "como-ficou");
    const meal = state.diary.find((e) => e.id === "meal-b");
    if (meal?.satiety !== "na_medida") throw Error(JSON.stringify(meal?.satiety));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(
    stateWith({ ...TIRZ, eatingDisorder: "sim" }, { injections: [inj("b2", 2)], diary: [lunch("meal-c")] }),
    { route: "/diario", ready: diaryReady },
  );
  await check('(b) transtorno alimentar "sim": 3 opções, sem "Pouca fome" e sem "Saciou rápido"', async () => {
    await button(page, "Como ficou? Almoço das 12:40").click();
    const options = sheet(page, "Como ficou?").getByRole("group", { name: "Como ficou?" }).getByRole("button");
    await expect(options).toHaveText(["Ainda com fome", "Na medida", "Desconforto"]);
    await expect(page.getByRole("button", { name: "Pouca fome", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Saciou rápido", exact: true })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith({}, { diary: [lunch("meal-d")] }), { route: "/diario", ready: diaryReady });
  await check('(b) sem caneta nem aplicação: nenhum "Como ficou?"', async () => {
    await expect(page.getByTestId("diary-entry-meal-d")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Como ficou/ })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (c) "Seu ciclo" na Evolução (folha "Medicação e locais") ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, cycleSeed()), { route: "/evolucao", ready: evolucaoReady });
  const card = page.getByTestId("cycle-grid-card");
  await check('(c) "Seu ciclo": 3 linhas (Náusea, Intestino preso, Cansaço) e as células com o nome acessível', async () => {
    await openTreatment(page);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("heading", { name: "Seu ciclo", exact: true })).toBeVisible();
    const rows = card.getByTestId("cycle-grid-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Náusea");
    await expect(rows.nth(1)).toContainText("Intestino preso");
    await expect(rows.nth(2)).toContainText("Cansaço");
    const d1 = card.getByRole("img", { name: "Náusea, 1 dia depois: 3 dias", exact: true });
    await expect(d1).toBeVisible();
    await expect(card.getByRole("img", { name: "Náusea, 2 dias depois: 1 dia, com registro forte", exact: true })).toBeVisible();
    await expect(card.getByRole("img", { name: "Náusea, no dia da aplicação: nenhum registro", exact: true })).toBeVisible();
    const square = await d1.locator(":scope > div").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    if (square !== rgbOf(palette.slate700)) throw Error(`D1 ${square}`);
    await expect(card).toContainText("Últimas 8 semanas: 6 registros com efeitos, 1 fora dos dias 0 a 6.");
    await noWarmColors(page, '[data-testid="cycle-grid-card"]');
    const text = await card.innerText();
    if (NO_INTERPRETATION.test(text)) throw Error(text);
    const small = await smallestText(page, '[data-testid="cycle-grid-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await shoot(page, "390-seu-ciclo.png", card);
  await check('(c) "Dose": Todas as doses, 5,00 mg e 2,50 mg; "5,00 mg" filtra a legenda', async () => {
    const dose = card.getByRole("radiogroup", { name: "Dose", exact: true });
    await expect(dose.getByRole("radio")).toHaveCount(3);
    await expect(dose.getByRole("radio", { name: "Todas as doses", exact: true })).toHaveAttribute("aria-checked", "true");
    await touch44(dose.getByRole("radio", { name: "5,00 mg", exact: true }), "5,00 mg");
    await dose.getByRole("radio", { name: "5,00 mg", exact: true }).click();
    await expect(dose.getByRole("radio", { name: "5,00 mg", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(card).toContainText("Últimas 8 semanas, dose 5,00 mg: 2 registros com efeitos.");
    await dose.getByRole("radio", { name: "Todas as doses", exact: true }).click();
  });
  await check("(c) 320 px: sem rolagem lateral", async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(500);
    await card.scrollIntoViewIfNeeded();
    await noSideScroll(page);
    noErrors(errors);
  });
  await shoot(page, "320-seu-ciclo.png", card);
  await context.close();
}
for (const [label, profile] of [
  ["gestação", { ...TIRZ, pregnancy: "gestacao" }],
  ["frequência mensal (30/mês)", { ...TIRZ, weightLossPenPerMonth: 30 }],
]) {
  const { page, context, errors } = await open(stateWith(profile, cycleSeed()), { route: "/evolucao", ready: evolucaoReady });
  await check(`(c) ${label}: nenhum "Seu ciclo"`, async () => {
    await openTreatment(page);
    await expect(page.getByTestId("evol-treatment-card")).toBeVisible();
    await expect(page.getByTestId("cycle-grid-card")).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith(TIRZ, { injections: [inj("e1", 7), inj("e2", 0)] }), {
    route: "/evolucao",
    ready: evolucaoReady,
  });
  await check('(c) caneta semanal sem efeitos: o texto vazio, sem grade', async () => {
    await openTreatment(page);
    const card = page.getByTestId("cycle-grid-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId("cycle-grid-empty")).toHaveText("Registre efeitos no bem-estar para vê-los por dia desde a aplicação.");
    await expect(card.getByTestId("cycle-grid-row")).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (d) Estoque do frasco ou caneta ----------
const vialApps = () => [inj("v1", 21), inj("v2", 14), inj("v3", 7)];
{
  const { page, context, errors, dialogs } = await open(stateWith(TIRZ, { injections: [inj("s1", 14), inj("s2", 7), inj("s3", 0)] }), {
    route: "/espaco",
    ready: espacoReady,
  });
  await openTreatmentSheet(page);
  const card = page.getByTestId("treatment-card");
  const expected = `Frasco: 1,50 ml de 2,00 ml, cerca de 3 doses iguais à última registrada, usar até ${ddmm(today)}.`;
  await check('(d) "Informar estoque do frasco ou caneta" → folha com "Frasco" marcado, volume 2 e "Usar até" → "Salvar estoque"', async () => {
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("heading", { name: "Estoque", exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Informar estoque do frasco ou caneta", exact: true }).click();
    const panel = sheet(page, "Estoque do frasco ou caneta");
    await expect(panel.getByRole("radiogroup", { name: "Tipo", exact: true })).toBeVisible();
    await expect(radio(page, "Frasco")).toHaveAttribute("aria-checked", "true");
    for (const name of ["Frasco", "Caneta", "Dose única"]) await touch44(radio(page, name), name);
    await button(page, "Salvar estoque").click();
    await expect(page.getByText("Informe o volume do frasco em ml (até 10 ml, com até 2 casas).", { exact: true })).toBeVisible();
    await page.getByLabel("Volume do frasco (ml)", { exact: true }).fill("2");
    await page.getByRole("button", { name: /^Usar até \(opcional\): / }).click();
    await button(page, "Confirmar data").click();
    await expect(page.getByRole("button", { name: /^Usar até \(opcional\): \d{2}\/\d{2}\/\d{4}$/ })).toBeVisible();
    await shoot(page, "390-folha-estoque.png");
    // "Limpar data de uso" some ao limpar e devolve o foco ao campo "Usar até"; depois a data volta.
    await button(page, "Limpar data de uso").click();
    await expect(button(page, "Usar até (opcional): não informada")).toBeFocused();
    await expect(button(page, "Limpar data de uso")).toHaveCount(0);
    await page.getByRole("button", { name: /^Usar até \(opcional\): / }).click();
    await button(page, "Confirmar data").click();
    await expect(page.getByRole("button", { name: /^Usar até \(opcional\): \d{2}\/\d{2}\/\d{4}$/ })).toBeVisible();
    await button(page, "Salvar estoque").click();
    await expect(page.getByText("Estoque salvo.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estoque do frasco ou caneta", exact: true })).toHaveCount(0);
    await expect(card.getByRole("img", { name: expected, exact: true })).toBeVisible();
    await expect(card.getByText("≈ 3 doses", { exact: true })).toBeVisible();
    await expect(card.getByText(`usar até ${ddmm(today)}`, { exact: true })).toBeVisible();
  });
  await shoot(page, "390-estoque.png", card);
  await check('(d) "Atualizar estoque" → "Remover estoque" (confirmação) → aviso com "Desfazer" que devolve o estoque', async () => {
    await card.getByRole("button", { name: "Atualizar estoque", exact: true }).click();
    await button(page, "Remover estoque").click();
    await expect(page.getByText("Estoque removido.", { exact: true })).toBeVisible();
    if (!dialogs.some((d) => d.startsWith("Remover estoque?"))) throw Error(`sem confirmação: ${dialogs.join(" | ")}`);
    await expect(card.getByRole("button", { name: "Informar estoque do frasco ou caneta", exact: true })).toBeVisible();
    await toastWith(page, "Estoque removido.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(card.getByRole("img", { name: expected, exact: true })).toBeVisible();
    noErrors(errors);
  });
  await check("(d) estado gravado: treatmentStock frasco de 2 ml, aberto e com uso até hoje", async () => {
    const { state } = await readState(page, "estoque");
    const want = JSON.stringify({ method: "frasco", volumeMl: 2, doses: null, openedOn: today, useBy: today });
    if (JSON.stringify(state.treatmentStock) !== want) throw Error(JSON.stringify(state.treatmentStock));
  });
  await context.close();
}
{
  const useBy = shiftDate(today, 17);
  const state = stateWith(TIRZ, { injections: vialApps(), extra: { treatmentStock: vialStock(21, useBy) } });
  const { page, context, errors } = await open(state, { route: "/espaco", ready: espacoReady });
  await openTreatmentSheet(page);
  const card = page.getByTestId("treatment-card");
  await check('(d) estoque de 3 semanas: "0,50 ml de 2,00 ml", "≈ 1 dose", o aviso de 1 dose e "Novo frasco"', async () => {
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("img", { name: /^Frasco: 0,50 ml de 2,00 ml, cerca de 1 dose igual à última registrada, usar até \d{2}\/\d{2}\.$/ })).toBeVisible();
    await expect(card.getByText("≈ 1 dose", { exact: true })).toBeVisible();
    await expect(card.getByText(/^Pelas aplicações registradas, este frasco tem cerca de 1 dose igual à última\./)).toBeVisible();
    await expect(card.getByRole("button", { name: "Novo frasco", exact: true })).toBeVisible();
    await touch44(card.getByRole("button", { name: "Novo frasco", exact: true }), "Novo frasco");
    const text = await card.innerText();
    if (NO_DOSE_ADVICE.test(text) || /\bmg\b(?!\/)/.test(text.replace(/\d+,\d+ mg/g, ""))) throw Error(text);
    const small = await smallestText(page, '[data-testid="treatment-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check('(d) Seringa: linha do estoque antes de "Últimas aplicações"', async () => {
    await card.getByRole("button", { name: "Abrir Seringa e dose", exact: true }).click();
    await expect(injecaoReady(page)).toBeVisible();
    const row = page.getByTestId("stock-row");
    await expect(row).toContainText("0,50 ml de 2,00 ml");
    await expect(row).toContainText("≈ 1 dose");
    await touch44(row.getByRole("button", { name: "Atualizar estoque", exact: true }), "Atualizar");
    const rowBox = await row.boundingBox();
    const recent = await page.getByRole("heading", { name: "Últimas aplicações", exact: true }).boundingBox();
    if (!(rowBox.y < recent.y)) throw Error("estoque depois do histórico");
  });
  await check('(d) registrar a dose: "Aplicação registrada" com "Estoque: 0,00 ml de 2,00 ml", o aviso de fim e "Para os próximos dias"', async () => {
    await recipeRegister(page).click();
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    const saved = sheet(page, "Aplicação registrada");
    await expect(saved.getByText("Estoque: 0,00 ml de 2,00 ml", { exact: true })).toBeVisible();
    await expect(saved).toContainText("o frasco pode ter acabado");
    await expect(saved).toContainText("Para os próximos dias");
    const text = await saved.innerText();
    if (NO_DOSE_ADVICE.test(text)) throw Error(text);
    await expect(saved.getByRole("button", { name: "Ver no diário", exact: true })).toBeFocused({ timeout: 3000 });
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    noErrors(errors);
  });
  await shoot(page, "390-aplicacao-estoque.png");
  await context.close();
}
{
  const state = stateWith({ ...TIRZ, pregnancy: "gestacao" }, { injections: vialApps(), extra: { treatmentStock: vialStock(21, shiftDate(today, -1)) } });
  const { page, context, errors } = await open(state, { route: "/espaco", ready: espacoReady });
  await openTreatmentSheet(page);
  await check('(d) gestação: volume sem "≈" e sem aviso de dose; o "usar até" vencido continua em âmbar', async () => {
    const card = page.getByTestId("treatment-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("img", { name: `Frasco: 0,50 ml de 2,00 ml, data de uso passou: ${ddmm(shiftDate(today, -1))}.`, exact: true })).toBeVisible();
    const text = await card.innerText();
    if (text.includes("≈") || /Pelas aplicações registradas/.test(text)) throw Error(text);
    const note = card.getByText("A data de uso informada já passou. Confira com a farmácia ou com quem prescreveu antes de usar.", { exact: true });
    await expect(note).toBeVisible();
    const bg = await note.locator("xpath=..").evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== rgbOf(palette.amber50)) throw Error(`fundo ${bg}`);
    await expect(card.getByRole("button", { name: /^Novo frasco|^Nova caneta/ })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (e) "Seu ciclo da semana" no Hoje ----------
{
  const { page, context, errors, dialogs } = await open(stateWith(TIRZ, { injections: [inj("h1", 1)] }));
  const card = page.getByTestId("injection-card");
  await check('(e) Hoje: "Seu ciclo da semana · Dias 0 a 2", "1 dia depois da aplicação" e a dica "Coma devagar…"', async () => {
    await card.scrollIntoViewIfNeeded();
    // Conceito 01 (como o web): o bloco fica recolhido numa linha de 44 px e abre ao tocar; o título vai no botão.
    const toggle = card.getByRole("button", { name: "Seu ciclo da semana · Dias 0 a 2", exact: true });
    await expect(card.getByTestId("cycle-tip")).toHaveCount(0);
    await touch44(toggle, "Seu ciclo da semana");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const tip = card.getByTestId("cycle-tip");
    await expect(tip).toHaveAttribute("aria-label", "Seu ciclo da semana · Dias 0 a 2");
    await expect(tip).toContainText("1 dia depois da aplicação");
    await expect(tip).toContainText("Coma devagar e faça pausas durante a refeição.");
    await expect(tip).toContainText("Combinado: Comer devagar no jantar · 19:30");
    const text = await tip.innerText();
    if (/dose|\bmg\b|aplicar|caneta|atrasad/i.test(text.replace("depois da aplicação", ""))) throw Error(text);
    const small = await smallestText(page, '[data-testid="injection-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    for (const name of ["Criar combinado: Comer devagar no jantar", "Ver as fases"]) await touch44(button(page, name), name);
  });
  await shoot(page, "390-hoje-ciclo.png", card);
  await check('(e) "Criar combinado" pede confirmação e cria; o cartão passa a dizer "Já está nos seus combinados."', async () => {
    await button(page, "Criar combinado: Comer devagar no jantar").click();
    await expect(page.getByText("Combinado criado.", { exact: true })).toBeVisible();
    if (!dialogs.some((d) => d.startsWith("Criar combinado?") && d.includes("“Comer devagar no jantar”, todos os dias às 19:30.")))
      throw Error(`confirmação: ${dialogs.join(" | ")}`);
    await expect(card.getByTestId("cycle-tip")).toContainText("Já está nos seus combinados.");
    await expect(button(page, "Criar combinado: Comer devagar no jantar")).toHaveCount(0);
  });
  await check('(e) "Ver as fases": 3 fases, "Agora" uma vez e a nota de dicas gerais', async () => {
    await button(page, "Ver as fases").click();
    const panel = sheet(page, "Seu ciclo da semana");
    for (const name of ["Dias 0 a 2", "Dias 3 a 5", "Dias 6 e 7"]) await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(panel.getByText("Agora", { exact: true })).toHaveCount(1);
    await expect(panel).toContainText("Dicas gerais para cada fase; não substituem a orientação de quem acompanha seu tratamento.");
    const text = await panel.innerText();
    if (NO_DOSE_ADVICE.test(text)) throw Error(text);
    await shoot(page, "390-fases.png");
    await panel.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seu ciclo da semana", exact: true })).toHaveCount(0);
    noErrors(errors);
  });
  await check("(e) estado gravado: combinado \"Comer devagar no jantar\" às 19:30", async () => {
    const { state } = await readState(page, "ciclo");
    const habit = state.habits.find((h) => h.title === "Comer devagar no jantar");
    if (!habit || habit.timeOfDay !== "19:30" || habit.createdDate !== today) throw Error(JSON.stringify(state.habits));
  });
  await context.close();
}
for (const [label, profile] of [
  ["gestação", { ...TIRZ, pregnancy: "gestacao" }],
  ["menor de 18", { ...TIRZ, birthDate: "2010-01-01" }],
  ["frequência mensal (30/mês)", { ...TIRZ, weightLossPenPerMonth: 30 }],
]) {
  const { page, context, errors } = await open(stateWith(profile, { injections: [inj("h2", 1)] }));
  await check(`(e) ${label}: nenhuma dica do ciclo no Hoje`, async () => {
    await page.getByTestId("injection-card").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("cycle-tip")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Seu ciclo da semana/ })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (f) Rótulo por foto ----------
/** Responde ao rótulo com `current()` (valor estruturado ou { error }) e guarda os corpos recebidos. */
function labelAgent(current, bodies) {
  return async (route, body) => {
    bodies.push(body);
    const value = current();
    if (value?.error) return route.fulfill({ status: 502, json: { error: value.error }, headers: cors });
    return route.fulfill({
      json: { text: "Leitura do rótulo (confira no frasco).", meta: META, structured: { kind: "rotulo", label: value } },
      headers: cors,
    });
  };
}
async function readLabel(page) {
  await button(page, "Ler rótulo por foto").click();
  await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, "Galeria").click()]);
  await chooser.setFiles({ name: "rotulo.png", mimeType: "image/png", buffer: PHOTO });
}
{
  let reply = LABEL_READ;
  const bodies = [];
  const { page, context, errors } = await open(stateWith({ ...SEMA, consentAi: true }), {
    route: "/injecao",
    ready: injecaoReady,
    agent: labelAgent(() => reply, bodies),
  });
  const concentration = page.getByTestId("injection-concentration");
  let before = "";
  await check('(f) "Ler rótulo por foto" no editor do frasco → "Galeria" → pedido rotulo com a foto JPEG, contexto {} e histórico []', async () => {
    await button(page, "Alterar a concentração do frasco").click();
    before = (await concentration.innerText()).trim();
    if (before === "5") throw Error("a concentração de partida já é 5");
    await touch44(button(page, "Ler rótulo por foto"), "Ler rótulo por foto");
    await readLabel(page);
    await expect(page.getByRole("heading", { name: "Confira: 5 mg/ml?", exact: true })).toBeVisible({ timeout: 20000 });
    const body = bodies.at(-1);
    if (body?.mode !== "rotulo") throw Error(`modo ${body?.mode}`);
    if (!String(body.file).startsWith("data:image/jpeg;base64,")) throw Error(String(body.file).slice(0, 40));
    if (JSON.stringify(body.context) !== "{}" || JSON.stringify(body.history) !== "[]") throw Error(JSON.stringify([body.context, body.history]));
  });
  await check('(f) conferência: foto, "No rótulo: “10 mg/2 mL”", aviso do medicamento; a calculadora ainda não mudou', async () => {
    const panel = sheet(page, "Ler rótulo do frasco");
    await expect(panel.getByRole("img", { name: "Foto do rótulo enviada para leitura", exact: true })).toBeVisible();
    await expect(panel.getByText("No rótulo: “10 mg/2 mL”", { exact: true })).toBeVisible();
    await expect(panel.getByText("Confiança alta", { exact: true })).toBeVisible();
    await expect(panel.getByText("Nome no rótulo: Tirzepatida", { exact: true })).toBeVisible();
    await expect(panel.getByText("O nome no rótulo parece ser Tirzepatida, e a calculadora está em Semaglutida. Confira antes de usar.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confira: 5 mg/ml?", exact: true })).toBeFocused({ timeout: 3000 });
    await expect(concentration).toHaveText(before);
    for (const name of ["Sim, usar 5 mg/ml", "Não é isso: digitar", "Tirar outra foto"]) await touch44(button(page, name), name);
    const text = await panel.innerText();
    if (/\bUI\b|aspir|aplique|aument|reduz|ajust/i.test(text)) throw Error(text);
  });
  await shoot(page, "390-rotulo-conferencia.png");
  await check('(f) "Sim, usar 5 mg/ml": concentração 5, aviso "conferida no rótulo" e foco em "Alterar"', async () => {
    await button(page, "Sim, usar 5 mg/ml").click();
    await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toHaveCount(0);
    await expect(concentration).toHaveText("5");
    await expect(page.getByText("Concentração do frasco: 5 mg/ml, conferida no rótulo.", { exact: true })).toBeVisible();
    await expect(button(page, "Alterar a concentração do frasco")).toBeFocused({ timeout: 3000 });
  });
  await check('(f) várias concentrações: nenhum rádio marcado, confirmar fica aria-disabled até escolher; "2,5 mg/ml" entra', async () => {
    reply = LABEL_READ_MULTI;
    await readLabel(page);
    const group = page.getByRole("radiogroup", { name: "Concentrações encontradas", exact: true });
    await expect(group).toBeVisible({ timeout: 20000 });
    await expect(group.getByRole("radio")).toHaveCount(2);
    for (const r of await group.getByRole("radio").all()) await expect(r).toHaveAttribute("aria-checked", "false");
    const use = button(page, "Usar a concentração escolhida");
    await expect(use).toHaveAttribute("aria-disabled", "true");
    await use.click({ force: true });
    await expect(page.getByText("Escolha a concentração que está no frasco.", { exact: true })).toBeVisible();
    await expect(concentration).toHaveText("5");
    await group.getByRole("radio", { name: "2,5 mg/ml, no rótulo “2,5 mg/mL”", exact: true }).click();
    await expect(use).not.toHaveAttribute("aria-disabled", "true");
    await use.click();
    await expect(concentration).toHaveText("2,5");
  });
  await check('(f) nenhuma concentração: frase, problemas e "Digitar a concentração" (volta ao "Alterar", nada muda)', async () => {
    reply = LABEL_READ_NONE;
    await readLabel(page);
    await expect(page.getByRole("heading", { name: "Não encontrei a concentração", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Não encontrei a concentração com segurança nesta foto.", { exact: true })).toBeVisible();
    await expect(page.getByText("A foto ficou desfocada.", { exact: true })).toBeVisible();
    await button(page, "Digitar a concentração").click();
    await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toHaveCount(0);
    await expect(concentration).toHaveText("2,5");
    await expect(button(page, "Alterar a concentração do frasco")).toBeFocused({ timeout: 3000 });
  });
  await check('(f) erro do agente: "Não foi possível ler o rótulo agora" e a concentração fica', async () => {
    reply = { error: "O agente não respondeu a tempo." };
    await readLabel(page);
    await expect(page.getByRole("heading", { name: "Não foi possível ler o rótulo agora", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("O agente não respondeu a tempo.", { exact: true })).toBeVisible();
    await expect(button(page, "Tentar de novo")).toBeVisible();
    await sheet(page, "Ler rótulo do frasco").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(concentration).toHaveText("2,5");
    noErrors(errors);
  });
  await check("(f) nenhuma foto gravada: estado e localStorage sem data:image", async () => {
    const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    if (local.includes("data:image")) throw Error("localStorage com data:image");
    const { raw } = await readState(page, "rotulo");
    if (raw.includes("data:image")) throw Error("estado com data:image");
    if (bodies.length < 4) throw Error(`${bodies.length} pedidos`);
  });
  await context.close();
}
{
  const bodies = [];
  const { page, context, errors } = await open(stateWith({ ...SEMA, consentAi: true }), {
    route: "/injecao",
    ready: injecaoReady,
    agent: labelAgent(() => LABEL_READ, bodies),
  });
  await check('(f) durante a escolha da foto, "Câmera" e "Galeria" ficam desativados; a foto que chega depois de fechar é descartada', async () => {
    await button(page, "Alterar a concentração do frasco").click();
    const concentration = page.getByTestId("injection-concentration");
    const before = (await concentration.innerText()).trim();
    await button(page, "Ler rótulo por foto").click();
    await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, "Galeria").click()]);
    await expect(button(page, "Galeria")).toBeDisabled();
    await expect(button(page, "Câmera")).toBeDisabled();
    await sheet(page, "Ler rótulo do frasco").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toHaveCount(0);
    // A foto chega depois (seletor ou redução lentos): nada vai ao agente e nada reabre.
    await chooser.setFiles({ name: "rotulo.png", mimeType: "image/png", buffer: PHOTO });
    await page.waitForTimeout(2500);
    if (bodies.length) throw Error(`${bodies.length} pedido(s) rotulo depois de fechar`);
    await expect(page.getByRole("heading", { name: "Ler rótulo do frasco", exact: true })).toHaveCount(0);
    await expect(page.getByText("Lendo o rótulo", { exact: true })).toHaveCount(0);
    await expect(concentration).toHaveText(before);
    noErrors(errors);
  });
  await check('(f) depois do descarte, "Ler rótulo por foto" funciona de novo', async () => {
    await readLabel(page);
    await expect(page.getByRole("heading", { name: "Confira: 5 mg/ml?", exact: true })).toBeVisible({ timeout: 20000 });
    if (bodies.length !== 1) throw Error(`${bodies.length} pedidos rotulo`);
    noErrors(errors);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith({ ...SEMA, consentAi: false }), {
    route: "/injecao",
    ready: injecaoReady,
    agent: labelAgent(() => LABEL_READ, []),
  });
  await check('(f) sem autorização de IA: nenhum "Ler rótulo por foto"', async () => {
    await button(page, "Alterar a concentração do frasco").click();
    await expect(page.getByText("Confira no rótulo (mg/ml)", { exact: true })).toBeVisible();
    await expect(button(page, "Ler rótulo por foto")).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
