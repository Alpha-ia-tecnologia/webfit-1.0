// Verificação da Onda 3 · Lote 3 (Evolução e Seringa) no export web do app, a 390 px (e 360/320 onde indicado):
// pesagens em linhas na folha "Pesagens" (EVOL-08), folha "Registrar medidas" com o kit da anamnese, calendário
// "Seus registros" em anéis (EVOL-09), medidas com silhueta na folha "Medidas" (EVOL-10), aplicações dentro do
// gráfico de peso e "Medicação e locais" (EVOL-04; conceito 09), mapa de
// rodízio com lados e frente/costas (SERINGA-04), folha "Aplicação registrada" e histórico compacto (SERINGA-10)
// e o local sugerido com lado no Hoje. Só o export web pode ser testado aqui (sem aparelho).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l3
//   node --import tsx scripts/o3l3-check.mjs dist/o3l3 [pasta-das-fotos]
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
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o3l3");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o3l3-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o3l3-seed-"));
const PORT = 3225;
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
const yesterday = shiftDate(today, -1);

const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const ARROZ = taco.find((f) => f.name === "Arroz, integral, cozido");
if (!ARROZ) throw Error("sem arroz na TACO");
const TIRZ = { weightLossPen: "sim", weightLossPenName: "Tirzepatida", weightLossPenDose: "2,5 mg", weightLossPenPerMonth: 4 };
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr/i;
const NO_DOSE_ADVICE = /aument|reduz|ajust|mantenha|dobr|atrasad/i;
const NO_EFFICACY = /nível|concentração no sangue|eficaz|funcionou/i;
const WARM = [palette.rose400, palette.rose600, palette.rose700, palette.amber500, palette.amber600, palette.amber700].map((c) => c.toLowerCase());
const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

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
/** Braço esquerdo −16, coxa direita −9, abdômen à esquerda −2 (e, com `legacy`, um registro antigo sem lado). */
const rotationSeed = (legacy = false) => [
  ...(legacy ? [inj("r0", 23, { site: "coxa" })] : []),
  inj("r1", 16, { site: "braco", side: "esquerdo" }),
  inj("r2", 9, { site: "coxa", side: "direito" }),
  inj("r3", 2, { site: "abdomen", side: "esquerdo" }),
];
/** 2,5 mg em −49/−42/−35/−28 e 5 mg em −21/−14/−7/0, locais alternados. */
const doseSteps = () => {
  const sites = ["abdomen", "coxa", "braco"];
  return [
    ...[49, 42, 35, 28].map((d, i) => inj(`a${i}`, d, { site: sites[i % 3] })),
    ...[21, 14, 7, 0].map((d, i) => inj(`b${i}`, d, { site: sites[(i + 1) % 3], units: 100, volumeMl: 1, doseMg: 5 })),
  ];
};
/** Oito pesagens semanais de 76,4 a 72,4 kg (cintura 88→83,1, quadril 102→99,2), meta de 66 kg. */
function withJourney(change = {}, injections = []) {
  const state = stateFixture();
  const base = state.measurements[0];
  return {
    ...state,
    profile: { ...state.profile, targetWeight: 66, ...change },
    measurements: Array.from({ length: 8 }, (_, i) => ({
      ...base,
      id: `m${i}`,
      date: shiftDate(today, -7 * (7 - i)),
      weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
      waist: Number((88 - i * 0.7).toFixed(1)),
      hip: Number((102 - i * 0.4).toFixed(1)),
      bodyFat: null,
    })),
    injections: injections.map((e) => ({ ...e, userId: state.userId })),
  };
}
function stateWith(profile = {}, injections = []) {
  const state = stateFixture();
  return {
    ...state,
    profile: { ...state.profile, ...profile },
    injections: injections.map((e) => ({ ...e, userId: state.userId })),
  };
}
/** Consistência: refeição e água em todos os dias menos anteontem; 3 combinados há 30 dias, 5 conclusões. */
function consistencyState() {
  const state = stateFixture();
  const entry = (id, date, type) =>
    diarySchema.parse({
      id,
      userId: state.userId,
      date,
      time: "12:00",
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
      type,
      title: type === "agua" ? "Água" : "Almoço",
      description: "",
      ...(type === "agua"
        ? { amountMl: 250 }
        : { categoryTag: "Almoço", items: [{ food: ARROZ, grams: 100 }], ...mealTotals([{ food: ARROZ, grams: 100 }]) }),
    });
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6)).filter((d) => d !== shiftDate(today, -2));
  const created = shiftDate(today, -30);
  const habit = (id, completed) => ({ id, title: `Combinado ${id}`, timeOfDay: "08:00", createdDate: created, completedDates: completed.map((d) => shiftDate(today, -d)) });
  return {
    ...state,
    diary: days.flatMap((d, i) => [entry(`meal-${i}`, d, "refeicao"), entry(`water-${i}`, d, "agua")]),
    habits: [habit("h1", [0, 1]), habit("h2", [3, 4]), habit("h3", [5])],
  };
}

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
/** Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. */
async function open(state, { width = 390, route = "/", ready, reducedMotion } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
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
  await expect(ready ? ready(page) : page.getByRole("group", { name: "Esta semana" })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
}
const evolucaoReady = (page) => page.getByRole("heading", { name: EVOLUCAO_TITLE, exact: true });
const injecaoReady = (page) => page.getByRole("heading", { name: "Seringa e dose", exact: true });
const diaryReady = (page) => page.getByRole("heading", { name: "Meu diário", exact: true });

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

/** Sem rolagem lateral: nenhum elemento visível passa da janela. `ignore`: trechos com rolagem interna própria. */
async function noSideScroll(page, ignore = []) {
  const problem = await page.evaluate((skip) => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    for (const el of document.querySelectorAll("body *")) {
      if (skip && el.closest(skip)) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  }, ignore.join(", ") || null);
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Menor fonte de texto visível (px) dentro de `selector`, ignorando SVG e texto só para leitores de tela. */
async function smallestText(page, selector = "body") {
  return page.evaluate((sel) => {
    let min = Infinity;
    const root = document.querySelector(sel);
    if (!root) return -1;
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
    return min;
  }, selector);
}
async function touch44(locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.width < 44 - 0.5 || box.height < 44 - 0.5) throw Error(`${name}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
}
async function insideViewport(locator, width, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.x < -0.5 || box.x + box.width > width + 0.5) throw Error(`${name}: ${box.x.toFixed(1)}..${(box.x + box.width).toFixed(1)} fora de ${width}`);
}
async function shoot(page, file, locator) {
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file), fullPage: false });
}
const sheet = (page, title) => page.getByRole("heading", { name: title, exact: true }).locator("xpath=../..");
const button = (page, name) => page.getByRole("button", { name, exact: true });
/** Botão da receita (conceito 10): "Registrar aplicação de hoje" no dia estimado, senão "Registrar aplicação". */
const recipeRegister = (page) => page.getByTestId("injection-recipe").getByRole("button", { name: /^Registrar aplicação/ });
const radio = (page, name) => page.getByRole("radio", { name, exact: true });
const bar = (page) => page.getByTestId("injection-bar").getByRole("button");
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
/** Valor à vista da régua (o número grande e a unidade, acima da trilha): o react-native-web não expõe aria-valuetext. */
const rulerValue = async (slider) =>
  (await slider.locator("xpath=..").locator(":scope > div").first().innerText()).replace(/\s+/g, " ").trim();
/** Ignorados na varredura lateral: o carrossel "Por dose" e as réguas abertas rolam por dentro. */
const INNER_SCROLL = ['[data-testid="dose-carousel"]', '[role="slider"]'];

// ---------- (a) Pesagens em linhas ----------
{
  const { page, context, errors } = await open(withJourney(), { route: "/evolucao", ready: evolucaoReady });
  const rows = page.getByTestId("weigh-row");
  await check('(a) "8 pesagens no período" abre a folha "Pesagens" com 8 linhas; a primeira com 72,4 kg e a variação navy "−0,6 kg"', async () => {
    // Conceito 09: as pesagens saíram do cartão para a folha "Pesagens" (com a próxima pesagem no topo).
    const summary = button(page, "8 pesagens no período");
    await expect(summary).toHaveAttribute("aria-haspopup", "dialog");
    await summary.click();
    await expect(page.getByRole("heading", { name: "Pesagens", exact: true })).toBeVisible();
    await expect(page.getByTestId("journey-next")).toBeVisible();
    await expect(page.getByRole("list", { name: "Pesagens no período" })).toBeVisible();
    await expect(rows).toHaveCount(8);
    await expect(rows.first()).toContainText("72,4 kg");
    await expect(rows.first()).toContainText("Cintura 83,1 cm");
    const delta = rows.first().getByTestId("weigh-delta");
    await expect(delta).toHaveText("−0,6 kg");
    await expect(delta.locator("[aria-label]")).toHaveAttribute("aria-label", "−0,6 kg desde a pesagem anterior");
    const bg = await delta.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== "rgb(10, 25, 47)") throw Error(`fundo ${bg}`);
    await expect(page.getByRole("button", { name: /^Excluir medição \d{2}\/\d{2}\/\d{4}$/ })).toHaveCount(8);
  });
  await rows.first().scrollIntoViewIfNeeded();
  await shoot(page, "390-pesagens.png", page.getByRole("list", { name: "Pesagens no período" }));
  for (const width of [360, 320]) {
    await check(`(a) ${width} px: "Excluir medição" com 44 × 44 dentro da tela e sem rolagem lateral`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(400);
      const buttons = page.getByRole("button", { name: /^Excluir medição / });
      for (let i = 0; i < 8; i++) {
        await touch44(buttons.nth(i), `excluir ${i + 1}`);
        await insideViewport(buttons.nth(i), width, `excluir ${i + 1}`);
      }
      await noSideScroll(page);
    });
  }
  await shoot(page, "320-pesagens.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await check('(a) excluir a 2ª pesagem → aviso "Medição excluída." com "Desfazer" dentro da folha; "Desfazer" devolve a pesagem', async () => {
    await page.getByRole("button", { name: /^Excluir medição / }).nth(1).click();
    // A folha cobre o aviso da janela principal: a frase e o "Desfazer" aparecem dentro dela.
    const notice = page.getByTestId("sheet-notice");
    await expect(notice).toHaveText(/^Medição excluída\./);
    await expect(rows).toHaveCount(7);
    await notice.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(rows).toHaveCount(8);
    await expect(page.getByTestId("sheet-notice")).toHaveText("Medição restaurada.");
  });
  await check("(a, j) pesagens: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(withJourney({ eatingDisorder: "sim" }), { route: "/evolucao", ready: evolucaoReady });
  await check("(a) perfil sensível: 8 linhas, nenhuma variação e sem a próxima pesagem", async () => {
    await button(page, "8 pesagens no período").click();
    await expect(page.getByTestId("weigh-row")).toHaveCount(8);
    await expect(page.getByTestId("weigh-delta")).toHaveCount(0);
    await expect(page.getByTestId("journey-next")).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (b) Folha "Registrar medidas" com o kit da anamnese ----------
{
  const { page, context, errors } = await open(withJourney(), { route: "/evolucao", ready: evolucaoReady });
  const panel = () => sheet(page, "Registrar medidas");
  await check('(b) "Registrar medidas": régua "Peso (kg)" e "Aumentar 0,1 kg" muda o valor', async () => {
    await button(page, "Registrar medidas").click();
    await expect(page.getByRole("heading", { name: "Registrar medidas", exact: true })).toBeVisible();
    const weight = panel().getByRole("slider", { name: "Peso (kg)", exact: true });
    await expect(weight).toBeVisible();
    const before = await rulerValue(weight);
    if (!/^\d+,\d kg$/.test(before)) throw Error(`valor inicial ${before}`);
    await touch44(panel().getByRole("button", { name: "Aumentar 0,1 kg", exact: true }), "Aumentar 0,1 kg");
    await panel().getByRole("button", { name: "Aumentar 0,1 kg", exact: true }).click();
    await expect.poll(() => rulerValue(weight)).not.toBe(before);
    await expect.poll(() => rulerValue(weight)).toMatch(/^\d+,\d kg$/);
  });
  await check('(b) cintura, quadril e gordura começam recolhidas em "Informar", com a última medida como dica', async () => {
    for (const label of ["Cintura (cm)", "Quadril (cm)", "Gordura medida (%)"]) await expect(button(page, `Informar ${label}`)).toBeVisible();
    await expect(panel()).toContainText("Última: 83,1 cm em");
    await expect(panel().getByRole("slider", { name: "Cintura (cm)", exact: true })).toHaveCount(0);
  });
  await check('(b) "Informar Cintura (cm)" abre a régua e "Aumentar 0,5 cm" grava um valor', async () => {
    await button(page, "Informar Cintura (cm)").click();
    const waist = panel().getByRole("slider", { name: "Cintura (cm)", exact: true });
    await expect(waist).toBeVisible();
    await expect.poll(() => rulerValue(waist)).toBe("— cm");
    await panel().getByRole("button", { name: "Aumentar 0,5 cm", exact: true }).click();
    await expect.poll(() => rulerValue(waist)).toMatch(/^\d+,\d cm$/);
  });
  await check('(b) método em escolhas e data "Ontem"', async () => {
    const chip = panel().getByRole("button", { name: "Balança de academia ou farmácia", exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await panel().getByRole("button", { name: "Ontem", exact: true }).click();
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page, INNER_SCROLL);
  });
  await shoot(page, "390-folha-medidas.png");
  await check('(b) "Salvar medidas" fecha a folha e a nova pesagem aparece na lista', async () => {
    await panel().getByRole("button", { name: "Salvar medidas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Registrar medidas", exact: true })).toHaveCount(0);
    await expect(page.getByText("Medição salva e perfil atualizado.", { exact: true })).toBeVisible();
    await button(page, "9 pesagens no período").click();
    await expect(page.getByTestId("weigh-row")).toHaveCount(9);
  });
  await check("(b, j) folha: sem erros de página nem de console", () => noErrors(errors));
  await check("(b) medição gravada: ontem, peso, cintura, sem quadril e o método escolhido", async () => {
    const saved = await readState(page, "medidas");
    const m = saved.measurements.find((v) => v.date === yesterday);
    if (!m || m.method !== "Balança de academia ou farmácia" || typeof m.waist !== "number" || m.hip !== null || !(m.weight > 20))
      throw Error(JSON.stringify(m));
  });
  await context.close();
}

// ---------- (c) "Seus registros": calendário de 4 semanas em anéis (conceito 09) ----------
{
  const { page, context, errors } = await open(consistencyState(), { route: "/evolucao", ready: evolucaoReady });
  const card = page.getByTestId("consistency-card");
  const list = card.getByRole("list", { name: "Registros das últimas 4 semanas", exact: true });
  // Dias até hoje no calendário: as 3 semanas anteriores inteiras e a de hoje até hoje (de segunda a domingo).
  const elapsed = 21 + ((new Date(`${today}T12:00:00`).getDay() + 6) % 7) + 1;
  await card.scrollIntoViewIfNeeded();
  await shoot(page, "390-consistencia.png", card);
  await check('(c) "Seus registros · Últimas 4 semanas": um dia por item até hoje; hoje marcado; anteontem sem registro', async () => {
    await expect(card).toContainText("Seus registros");
    await expect(card).toContainText("Últimas 4 semanas");
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(elapsed);
    const todayCell = list.locator('[aria-current="date"]');
    await expect(todayCell).toHaveCount(1);
    await expect(todayCell).toHaveAttribute("aria-label", /: água, refeição e combinado$/);
    await expect(items.nth(elapsed - 3)).toHaveAttribute("aria-label", /: sem registro$/);
  });
  await check('(c) contagens: refeições 6, água 6 e combinados 5 de N dias (sem sequência)', async () => {
    const tiles = card.getByRole("list", { name: "Dias com registro nas 4 semanas", exact: true });
    for (const text of [`Refeições: 6 de ${elapsed} dias`, `Água: 6 de ${elapsed} dias`, `Combinados: 5 de ${elapsed} dias`]) await expect(tiles).toContainText(text);
  });
  await check("(c) sem sequência nem cobrança; anéis sem rosa ou âmbar (3 arcos por dia com registro)", async () => {
    const content = await card.innerText();
    if (NO_STREAK.test(content)) throw Error(content);
    const strokes = await list.evaluate((el) =>
      [...el.querySelectorAll("path")].map((p) => ({ attr: (p.getAttribute("stroke") ?? "").toLowerCase(), css: getComputedStyle(p).stroke })),
    );
    const warmRgb = WARM.map(rgbOf);
    const bad = strokes.filter((s) => WARM.includes(s.attr) || warmRgb.includes(s.css));
    if (bad.length || strokes.length !== 18) throw Error(`${strokes.length} arcos; quentes ${JSON.stringify(bad)}`);
  });
  await check("(c) 320 px: as 7 colunas cabem sem rolagem lateral e o texto tem 12 px ou mais", async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(400);
    await noSideScroll(page);
    const small = await smallestText(page, '[data-testid="consistency-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await card.scrollIntoViewIfNeeded();
  await shoot(page, "320-consistencia.png", card);
  await check("(c, j) consistência: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (d) Medidas com silhueta e mini tendências ----------
{
  const { page, context, errors } = await open(withJourney(), { route: "/evolucao", ready: evolucaoReady });
  const card = page.getByTestId("measures-card");
  await check('(d) "Medidas" em "Mais da sua evolução" (última cintura e quadril) abre a folha; um só "Registrar medidas" na tela', async () => {
    await expect(button(page, "Registrar medidas")).toHaveCount(1);
    await expect(card).toHaveCount(0);
    await button(page, "Medidas, Cintura 83,1 · Quadril 99,2 cm").click();
    // O título da folha e o do cartão dentro dela.
    await expect(page.getByRole("heading", { name: "Medidas", exact: true }).first()).toBeVisible();
    await expect(card).toBeVisible();
  });
  await shoot(page, "390-medidas.png", card);
  await check("(d) silhueta, tendência da cintura e pílulas IMC e cintura/quadril", async () => {
    await expect(card.getByTestId("measure-silhouette")).toHaveAttribute("aria-label", /^Silhueta: cintura 83,1 cm, quadril 99,2 cm/);
    await expect(card.getByRole("img", { name: /^Cintura: de 88,0 a 83,1 cm desde / })).toBeVisible();
    await expect(card.getByRole("img", { name: /^Quadril: de 102,0 a 99,2 cm desde / })).toBeVisible();
    await expect(card.getByText(/^IMC \d+,\d$/)).toBeVisible();
    await expect(card.getByText("Cintura/quadril 0,84", { exact: true })).toBeVisible();
    await expect(card.locator('[aria-label="Relação cintura/quadril 0,84"]')).toHaveCount(1);
    await expect(card).toContainText("Valores descritivos, sem classificação clínica automática.");
  });
  await check('(d) "Registrar" (nome "Registrar medidas de cintura e quadril") troca a folha "Medidas" pela "Registrar medidas"', async () => {
    const small = await smallestText(page, '[data-testid="measures-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    const register = button(page, "Registrar medidas de cintura e quadril");
    await touch44(register, "Registrar");
    await register.click();
    await expect(page.getByRole("heading", { name: "Registrar medidas", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Medidas", exact: true })).toHaveCount(0);
  });
  await check("(d, j) medidas: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(withJourney({ eatingDisorder: "sim" }), { route: "/evolucao", ready: evolucaoReady });
  await check('(d) perfil sensível: sem a linha "Medidas", sem cartão de medidas e sem "IMC"; um só "Registrar medidas"', async () => {
    await expect(page.getByRole("button", { name: /^Medidas/ })).toHaveCount(0);
    await expect(page.getByTestId("measures-card")).toHaveCount(0);
    await expect(page.getByText(/^IMC/)).toHaveCount(0);
    await expect(button(page, "Registrar medidas")).toHaveCount(1);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (e) Doses sobre o gráfico de peso e "Medicação injetável" ----------
{
  const { page, context, errors } = await open(withJourney(TIRZ, doseSteps()), { route: "/evolucao", ready: evolucaoReady });
  const band = page.getByTestId("dose-band");
  const NOTE = "Registro informativo: o peso varia por muitos motivos, e a dose é decidida com quem prescreveu.";
  await check('(e) aplicações dentro do gráfico (conceito 09): 2 chips "mg/sem", a pista "Aplicações" com 8 discos e a próxima estimada', async () => {
    await expect(band).toHaveAttribute(
      "aria-label",
      /^Doses registradas no período: Tirzepatida 2,50 mg de .+ \(4 aplicações\); Tirzepatida 5,00 mg desde .+ \(4 aplicações\); próxima aplicação estimada: .+$/,
    );
    await expect(page.getByTestId("weight-chart").getByTestId("dose-band")).toHaveCount(1);
    await expect(band.getByText(/^\d,\d\d mg\/sem$/)).toHaveCount(2);
    await expect(band.getByText("5,00 mg/sem", { exact: true })).toBeVisible();
    await expect(band.getByText("Aplicações", { exact: true })).toBeVisible();
    // 2 chips + "Aplicações" + 8 aplicações + a próxima (tracejada).
    await expect(band.locator(":scope > div")).toHaveCount(12);
    await expect(page.getByTestId("weight-chart").locator("rect")).toHaveCount(2);
    await expect(page.getByTestId("weight-card")).toContainText("Tirzepatida");
    // A nota informativa saiu do cartão e foi para "Como calculamos" ("Doses no gráfico").
    await expect(page.getByText(NOTE, { exact: true })).toHaveCount(0);
    await button(page, "Como calculamos").click();
    await expect(page.getByRole("heading", { name: "Doses no gráfico", exact: true })).toBeVisible();
    await expect(page.getByText(NOTE, { exact: true })).toBeVisible();
    await button(page, "Fechar").click();
    await expect(page.getByRole("heading", { name: "Como calculamos", exact: true })).toHaveCount(0);
  });
  await check('(e) o gráfico continua: último rótulo "hoje", a meta (66 kg, longe dos dados) só na legenda e nenhum texto de dose no SVG', async () => {
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-testid="weight-chart"] text')].map((t) => t.textContent));
    if (labels.at(-1) !== "hoje") throw Error(JSON.stringify(labels));
    if (labels.some((l) => /mg/.test(l ?? ""))) throw Error(`dose no texto do SVG: ${labels.join(" ")}`);
    const dashed = await page.evaluate(
      () => [...document.querySelectorAll('[data-testid="weight-chart"] line')].filter((l) => /^6[ ,]+5$/.test((l.getAttribute("stroke-dasharray") ?? "").trim())).length,
    );
    if (dashed !== 0) throw Error(`${dashed} linhas 6 5`);
    await expect(page.getByTestId("weight-card")).toContainText("Meta 66 kg");
  });
  await page.getByTestId("weight-card").scrollIntoViewIfNeeded();
  await shoot(page, "390-doses-no-peso.png", page.getByTestId("weight-card"));
  const treatment = page.getByTestId("evol-treatment-card");
  await check('(e) "Medicação e locais" abre a folha: 2 cartões "Por dose" (5,00 mg "Mais recente" primeiro) e a rosca dos locais', async () => {
    await page.getByRole("button", { name: /^Medicação e locais, 8 aplicações · / }).click();
    await expect(page.getByRole("heading", { name: "Medicação e locais", exact: true })).toBeVisible();
    const items = page.getByTestId("dose-carousel").getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("5,00 mg");
    await expect(items.first()).toContainText("Mais recente");
    await expect(items.first()).toContainText("desde");
    await expect(items.nth(1)).toContainText("2,50 mg");
    await expect(items.nth(1)).not.toContainText("Mais recente");
    await expect(page.getByTestId("site-donut")).toHaveAttribute("aria-label", /^Locais nos últimos 90 dias: Abdômen \d+, Coxa \d+, Braço \d+$/);
    const content = await treatment.innerText();
    if (/kg|kcal/.test(content)) throw Error(`peso ou kcal no cartão: ${content}`);
    const main = await page.locator("body").innerText();
    if (NO_EFFICACY.test(main)) throw Error("texto de eficácia ou nível estimado");
  });
  await treatment.scrollIntoViewIfNeeded();
  await shoot(page, "390-medicacao-injetavel.png", treatment);
  await check("(e) 320 px: sem rolagem lateral (o carrossel rola por dentro) e texto ≥ 12 px", async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(400);
    await noSideScroll(page, INNER_SCROLL);
    const small = await smallestText(page, '[data-testid="evol-treatment-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check("(e, j) doses: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
for (const [label, change] of [
  ["transtorno alimentar", { eatingDisorder: "sim" }],
  ["gestação", { pregnancy: "gestacao" }],
]) {
  const { page, context, errors } = await open(withJourney({ ...TIRZ, ...change }, doseSteps()), { route: "/evolucao", ready: evolucaoReady });
  await check(`(e) ${label}: sem faixa de doses no peso; "Medicação e locais" sem kg`, async () => {
    await expect(page.getByTestId("weight-chart")).toBeVisible();
    await expect(page.getByTestId("dose-band")).toHaveCount(0);
    await expect(page.getByTestId("weight-chart").locator("rect")).toHaveCount(0);
    await expect(page.getByTestId("weight-card")).not.toContainText("Tirzepatida");
    await page.getByRole("button", { name: /^Medicação e locais, / }).click();
    const treatment = page.getByTestId("evol-treatment-card");
    await expect(treatment).toBeVisible();
    if (/kg/.test(await treatment.innerText())) throw Error("kg no cartão");
    noErrors(errors);
  });
  await context.close();
}

// ---------- (f, g, h) Mapa de rodízio, "Aplicação registrada" e histórico ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, rotationSeed(true)), { route: "/injecao", ready: injecaoReady });
  const recentList = page.getByRole("list", { name: "Últimas aplicações", exact: true });
  await check("(h) faixa (conceito 10): as 3 últimas (data, há quanto tempo, miniatura, nome curto) e a próxima estimada", async () => {
    const items = recentList.getByRole("listitem");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText("há 16 dias");
    await expect(items.nth(0)).toContainText("Braço esq.");
    await expect(items.nth(0).getByTestId("injection-site-mini")).toHaveAttribute("aria-label", "Local: Braço esquerdo");
    await expect(items.nth(2)).toContainText("há 2 dias");
    await expect(items.nth(2).getByTestId("injection-site-mini")).toHaveAttribute("aria-label", "Local: Abdômen à esquerda");
    // A 4ª coluna é a próxima estimada (quem acompanha a frequência), com o local sugerido.
    await expect(items.nth(3)).toContainText("próxima estimada");
    await expect(items.nth(3).getByTestId("injection-site-mini")).toHaveAttribute("aria-label", /^Local sugerido: /);
    await expect(page.getByTestId("recent-strip")).toContainText("Todas com 2,50 mg · semanais");
    await expect(page.getByTestId("rotation-rank")).toHaveCount(0);
    // Tons: passado em cinza, a última em âmbar, a próxima em verde; nunca rosa.
    const fills = await recentList.evaluate((el) => [...el.querySelectorAll("circle")].map((c) => (c.getAttribute("fill") ?? "").toLowerCase()));
    for (const tone of [palette.amber500, palette.green600]) if (!fills.includes(tone.toLowerCase())) throw Error(`sem ${tone}: ${fills.join(" ")}`);
    const warm = [palette.rose400, palette.rose600, palette.rose700].map((c) => c.toLowerCase());
    if (fills.some((f) => warm.includes(f))) throw Error(`rosa na faixa: ${fills.join(" ")}`);
  });
  await check('(h) "Ver todas" com 44 px; a 320 px a faixa cabe sem rolagem lateral e com texto de 12 px ou mais', async () => {
    await touch44(button(page, "Ver todas"), "Ver todas");
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(400);
    await noSideScroll(page);
    const small = await smallestText(page, '[data-testid="recent-strip"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
  });
  await recentList.scrollIntoViewIfNeeded();
  await shoot(page, "390-historico.png", recentList);
  await check('(f) "Outra dose ou frasco novo": mapa com o nome completo do rodízio, Coxa e Esquerdo marcados', async () => {
    await button(page, "Outra dose ou frasco novo").click();
    await expect(page.getByTestId("injection-body-map").getByRole("img", { name: /^Mapa de rodízio./ })).toHaveAttribute(
      "aria-label",
      "Mapa de rodízio. Sugerido: Coxa esquerda. Últimas aplicações: 1, Abdômen à esquerda, há 2 dias; 2, Coxa direita, há 9 dias; 3, Braço esquerdo, há 16 dias.",
    );
    await expect(radio(page, "Coxa")).toHaveAttribute("aria-checked", "true");
    const sides = page.getByRole("radiogroup", { name: "Lado do corpo", exact: true });
    await expect(sides.getByRole("radio")).toHaveCount(2);
    await expect(radio(page, "Esquerdo")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Direito")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa esquerda");
    await expect(page.getByText("Última aplicação há 2 dias · Abdômen à esquerda.", { exact: true })).toBeVisible();
  });
  const map = page.getByTestId("injection-body-map");
  await map.scrollIntoViewIfNeeded();
  await shoot(page, "390-mapa-rodizio.png", map.locator("xpath=../../.."));
  await check("(f) 3 selos: o 1 à direita do centro da frente (lado esquerdo da pessoa), o 3 à esquerda do centro das costas", async () => {
    const badges = page.getByTestId("rotation-badge");
    await expect(badges).toHaveCount(3);
    const position = async (text) => {
      const badge = badges.filter({ hasText: new RegExp(`^${text}$`) });
      const [b, canvas] = [await badge.boundingBox(), await badge.locator("xpath=..").boundingBox()];
      return { badge: b.x + b.width / 2, center: canvas.x + canvas.width / 2 };
    };
    const one = await position("1");
    const three = await position("3");
    if (!(one.badge > one.center)) throw Error(`selo 1 ${one.badge} × frente ${one.center}`);
    if (!(three.badge < three.center)) throw Error(`selo 3 ${three.badge} × costas ${three.center}`);
  });
  await check("(f) pontos cinza (slate-500) e verdes, halos à vista e ocultos, nada apagado com opacidade", async () => {
    const colorsIn = await map.evaluate((el) => {
      const circles = [...el.querySelectorAll("svg circle")];
      const fills = circles.map((c) => (c.getAttribute("fill") ?? "").toLowerCase());
      const halos = circles.filter((c) => (c.getAttribute("fill") ?? "").includes("-halo"));
      return {
        idle: fills.filter((f) => f === "#64748b").length,
        green: fills.filter((f) => f === "#047857").length,
        halosVisible: halos.filter((c) => c.getAttribute("opacity") !== "0").length,
        halosHidden: halos.filter((c) => c.getAttribute("opacity") === "0").length,
        faded: [...el.querySelectorAll("svg g")].filter((g) => g.getAttribute("opacity") === "0.38").length,
      };
    });
    if (colorsIn.idle !== 5 || colorsIn.green !== 1 || colorsIn.halosVisible !== 1 || colorsIn.halosHidden !== 5 || colorsIn.faded)
      throw Error(JSON.stringify(colorsIn));
  });
  await check('(f) rádio "Direito" → "Local: Coxa direita"; o desenho só resume (tocar nele não troca nada); rádios trocam local e lado', async () => {
    await radio(page, "Direito").click();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa direita");
    await expect(radio(page, "Direito")).toHaveAttribute("aria-checked", "true");
    // Revisão Onda 3: os pontos (≈14 px, coxa e braço sobrepostos) deixaram de ser alvos; a escolha fica nos rádios de 44 px.
    await map.locator('svg circle[fill="#64748b"]').first().click({ force: true });
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa direita");
    await radio(page, "Abdômen").click();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText(/^Local: Abdômen à (esquerda|direita)$/);
    await expect(radio(page, "Abdômen")).toHaveAttribute("aria-checked", "true");
    await radio(page, "Coxa").click();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa esquerda");
    await radio(page, "Direito").click();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa direita");
  });
  await check("(f, j) rádios de local e lado com 44 px; texto ≥ 12 px", async () => {
    for (const name of ["Abdômen", "Coxa", "Braço", "Esquerdo", "Direito"]) await touch44(radio(page, name), name);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check("(f) 320 px: o mapa e os rádios cabem sem rolagem lateral (sem trecho ignorado)", async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(500);
    await map.scrollIntoViewIfNeeded();
    await noSideScroll(page);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await shoot(page, "320-mapa-rodizio.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const saved = () => sheet(page, "Aplicação registrada");
  const register = async () => {
    await bar(page).click();
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toBeVisible();
  };
  await check('(f) confirmação com "Local · Coxa direita"', async () => {
    await bar(page).click();
    await expect(sheet(page, "Confirmar aplicação")).toContainText("Local · Coxa direita");
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  });
  await check('(g) "Aplicação registrada": frase, quando e onde, próxima dose estimada e próximo local', async () => {
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/injecao/);
    await expect(saved().getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.", { exact: true })).toBeVisible();
    await expect(saved().getByText(/^Hoje, \d{2}:\d{2} · Coxa direita$/)).toBeVisible();
    await expect(saved().getByText(/^Próxima dose estimada: /)).toBeVisible();
    await expect(saved()).toContainText("Pela frequência informada no seu perfil.");
    await expect(saved().getByText("Próximo local sugerido: Braço direito", { exact: true })).toBeVisible();
    await expect(saved().getByTestId("saved-check")).toHaveAttribute("aria-hidden", "true");
    const content = await saved().innerText();
    if (NO_DOSE_ADVICE.test(content)) throw Error(content);
    await expect(page.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Voltar", exact: true, includeHidden: true })).toHaveCount(1);
    await expect(saved().getByRole("button", { name: "Ver no diário", exact: true })).toBeFocused({ timeout: 3000 });
    for (const name of ["Ver no diário", "Como você está? Registrar bem-estar", "Registrar medidas", "Desfazer"])
      await touch44(saved().getByRole("button", { name, exact: true }), name);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await shoot(page, "390-aplicacao-registrada.png");
  await check('(g) "Como você está?" abre "Registrar bem-estar" (a folha da aplicação fecha)', async () => {
    await saved().getByRole("button", { name: "Como você está? Registrar bem-estar", exact: true }).click();
    const mood = page.getByRole("heading", { name: "Registrar bem-estar", exact: true });
    await expect(mood).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toHaveCount(0);
    await mood.locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(mood).toHaveCount(0);
  });
  await check('(g) de novo: "Registrar medidas" abre a folha de medidas', async () => {
    await register();
    await saved().getByRole("button", { name: "Registrar medidas", exact: true }).click();
    const measures = page.getByRole("heading", { name: "Registrar medidas", exact: true });
    await expect(measures).toBeVisible();
    await expect(sheet(page, "Registrar medidas").getByRole("slider", { name: "Peso (kg)", exact: true })).toBeVisible();
    await measures.locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(measures).toHaveCount(0);
  });
  await check('(g) de novo: "Desfazer" → aviso "Registro da aplicação desfeito." e continua na Seringa', async () => {
    await register();
    await saved().getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByText("Registro da aplicação desfeito.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/injecao/);
  });
  await check('(g) fechar ("Fechar") fica na Seringa e devolve o foco a "Últimas aplicações"', async () => {
    await register();
    await saved().getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/injecao/);
    await expect(page.getByRole("heading", { name: "Últimas aplicações", exact: true })).toBeFocused({ timeout: 3000 });
  });
  await check('(g) de novo: "Ver no diário" leva ao Diário com "Coxa direita"', async () => {
    await register();
    await saved().getByRole("button", { name: "Ver no diário", exact: true }).click();
    await expect(page).toHaveURL(/\/diario/);
    await expect(diaryReady(page)).toBeVisible();
    await expect(page.getByText("50 UI · 0,50 ml · Coxa direita", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
  await check("(f, g, h, j) Seringa: sem erros de página nem de console", () => noErrors(errors));
  await check('(f) registros gravados com side "direito"; o desfeito saiu', async () => {
    const state = await readState(page, "rodizio");
    const todays = state.injections.filter((e) => e.date === today);
    if (state.injections.length !== 8 || todays.length !== 4 || todays.some((e) => e.site !== "coxa" || e.side !== "direito"))
      throw Error(JSON.stringify(state.injections.map((e) => [e.date, e.site, e.side])));
  });
  await context.close();
}
{
  const legacy = [inj("l1", 16, { site: "braco" }), inj("l2", 9, { site: "coxa" }), inj("l3", 2, { site: "abdomen" })];
  const { page, context, errors } = await open(stateWith({ ...TIRZ, pregnancy: "gestacao" }, legacy), { route: "/injecao", ready: injecaoReady });
  await check('(h) registros antigos sem lado (gestação): "Última aplicação" com "Local sugerido: Coxa", sem estimativa nem números', async () => {
    const next = page.getByTestId("next-application");
    await expect(next).toContainText("Local sugerido: Coxa");
    await expect(next).toContainText("Última aplicação");
    await expect(next).not.toContainText("estimada");
    await expect(page.getByTestId("next-application-ring")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Últimas aplicações", exact: true }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByTestId("rotation-rank")).toHaveCount(0);
  });
  await check('(g) gestação: sem "Próxima dose estimada" e sem "Registrar medidas"; "Como você está?" à vista', async () => {
    await recipeRegister(page).click();
    const confirm = sheet(page, "Confirmar aplicação");
    await expect(confirm.getByRole("radiogroup", { name: "Lado do corpo", exact: true })).toBeVisible();
    await expect(confirm.getByRole("radio", { name: "Esquerdo", exact: true })).toHaveAttribute("aria-checked", "false");
    await expect(confirm.getByRole("radio", { name: "Direito", exact: true })).toHaveAttribute("aria-checked", "false");
    await confirm.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    const panel = sheet(page, "Aplicação registrada");
    await expect(panel.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.", { exact: true })).toBeVisible();
    await expect(panel.getByText(/^Hoje, \d{2}:\d{2} · Coxa$/)).toBeVisible();
    await expect(panel).not.toContainText("Próxima dose estimada");
    await expect(panel.getByRole("button", { name: "Registrar medidas", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Como você está? Registrar bem-estar", exact: true })).toBeVisible();
    if (NO_DOSE_ADVICE.test(await panel.innerText())) throw Error("conselho de dose");
  });
  await shoot(page, "390-aplicacao-registrada-gestacao.png");
  await check("(g, j) gestação: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith(TIRZ, rotationSeed()), { route: "/injecao", ready: injecaoReady, reducedMotion: "reduce" });
  await check('(g) lado na folha da receita: "Esquerdo" sugerido e marcado; escolher "Direito" grava direito', async () => {
    await recipeRegister(page).click();
    const confirm = sheet(page, "Confirmar aplicação");
    await expect(confirm.getByRole("radio", { name: "Coxa", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(confirm.getByRole("radio", { name: "Esquerdo", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(confirm.getByRole("radio", { name: "Esquerdo", exact: true })).toContainText("sugerido");
    await confirm.getByRole("radio", { name: "Braço", exact: true }).click();
    await expect(confirm.getByRole("radio", { name: "Direito", exact: true })).toHaveAttribute("aria-checked", "true");
    await confirm.getByRole("radio", { name: "Coxa", exact: true }).click();
    await confirm.getByRole("radio", { name: "Direito", exact: true }).click();
    await confirm.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await expect(sheet(page, "Aplicação registrada").getByText(/· Coxa direita$/)).toBeVisible();
  });
  await check("(g) movimento reduzido: o visto já aparece desenhado (sem animação)", async () => {
    const offset = await page.getByTestId("saved-check").evaluate((el) => el.querySelector("path")?.getAttribute("stroke-dashoffset"));
    if (Number(offset) !== 0) throw Error(`stroke-dashoffset ${offset}`);
  });
  await check("(g, j) receita: sem erros de página nem de console", () => noErrors(errors));
  await check('(g) registro da receita gravado com side "direito"', async () => {
    const state = await readState(page, "receita");
    const e = state.injections.find((v) => v.date === today);
    if (!e || e.site !== "coxa" || e.side !== "direito") throw Error(JSON.stringify(e));
  });
  await context.close();
}

// ---------- (i) Hoje: local sugerido com lado ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, rotationSeed()));
  const card = page.getByTestId("injection-card");
  await card.scrollIntoViewIfNeeded();
  await shoot(page, "390-hoje-local.png", card);
  await check('(i) Hoje: "Local sugerido: Coxa esquerda" e "Última há 2 dias · abdômen à esquerda"', async () => {
    await expect(page.getByTestId("injection-site-mini")).toHaveAttribute("aria-label", "Local sugerido: Coxa esquerda");
    await expect(card).toContainText("Última há 2 dias · abdômen à esquerda");
    const small = await smallestText(page, '[data-testid="injection-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    noErrors(errors);
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
