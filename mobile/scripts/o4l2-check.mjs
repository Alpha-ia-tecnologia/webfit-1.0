// Verificação da Onda 4 · Lote 2 (Evolução e semana) no export web do app, a 390 px (e 360/320 onde indicado):
// destaques calculados nos mini gráficos e "Como calculamos" (EVOL-06), bem-estar e sono com leitura cruzada
// (EVOL-07), o cartão "Sua semana" no Hoje (só às segundas, dispensável neste aparelho) e na Evolução, os stories
// de 5 partes e o compartilhamento do resumo em texto (EVOL-05 + SIS-13). Só o export web pode ser testado aqui.
// Uso (na pasta mobile; nunca junto com outra verificação na mesma porta):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o4l2
//   node --import tsx scripts/o4l2-check.mjs dist/o4l2 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { weekdayOf } from "../../src/lib/dates.ts";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { fmtShortDate } from "../../src/lib/format.ts";
import { RECAP_DISMISS_KEY, lastCompleteWeek } from "../../src/lib/week-recap.ts";
import { diarySchema, stateSchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o4l2");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o4l2-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o4l2-seed-"));
const PORT = 3235;
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
/** Próxima segunda a partir de hoje (hoje, se já for segunda): o relógio da página fica nela. */
const MONDAY = shiftDate(today, (8 - weekdayOf(today)) % 7);
/** W(0) = segunda da semana resumida … W(6) = domingo. */
const W = (i) => shiftDate(MONDAY, i - 7);
const AT_MONDAY = `${MONDAY}T10:00:00`;
const AT_TUESDAY = `${shiftDate(MONDAY, 1)}T10:00:00`;

const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const ARROZ = taco.find((f) => f.name === "Arroz, integral, cozido");
if (!ARROZ) throw Error("sem arroz na TACO");
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr|melhor semana/i;
const CAUSAL = /porque|por causa|causou|faz bem|faz mal|melhora|piora|deveria|você deve|precisa|recomend|diagn|depress|insôni|distúrbio|transtorno|tratamento/i;
const SHARE_UNSAFE = /kcal|calori|\bkg\b|peso|pesagem|dose|\bmg\b|humor|sono/i;
const NOTE = "Leitura dos seus registros, sem relação de causa: humor e sono mudam por muitos motivos.";
const MOVED = "Ausência de registro não significa ausência de consumo.";

// ---------- Estados ----------
let seq = 0;
function entry(date, type, extra = {}, time = "12:00") {
  seq += 1;
  return diarySchema.parse({
    id: `d-${seq}`,
    userId: "local",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type,
    title: type === "agua" ? "Água" : type === "bem_estar" ? "Bem-estar" : "Almoço",
    description: "",
    ...(type === "refeicao"
      ? { categoryTag: "Almoço", items: [{ food: ARROZ, grams: 100 }], ...mealTotals([{ food: ARROZ, grams: 100 }]) }
      : {}),
    ...extra,
  });
}
const meal = (date, time = "12:00") => entry(date, "refeicao", {}, time);
const water = (date, amountMl) => entry(date, "agua", { amountMl });
const feeling = (date, rating, sleepHours, time = "12:00") =>
  entry(date, "bem_estar", { rating, ...(sleepHours === undefined ? {} : { sleepHours }) }, time);
/** Registros do usuário da semente; valida como o app faria ao abrir (falha cedo com a semente errada). */
const valid = (state) => stateSchema.parse({ ...state, diary: state.diary.map((e) => ({ ...e, userId: state.userId })) });

/** §6.3-7: água [2000,1500,0,1750,2000,2250,1750] de hoje−6 a hoje e refeições em 6 dias; meta 2 L há 30 dias. */
function insightsState(change = {}) {
  const state = stateFixture();
  const profile = { ...state.profile, ...change };
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
  const waters = [2000, 1500, 0, 1750, 2000, 2250, 1750];
  const diary = days.flatMap((d, i) => [...(waters[i] ? [water(d, waters[i])] : []), ...(i === 2 ? [] : [meal(d)])]);
  return valid({ ...state, profile, goalHistory: [{ date: shiftDate(today, -30), profile }], diary });
}

/** Semente do bem-estar (§3.5, 22–28 set) deslocada para hoje−6 … hoje. */
function wellbeingState(empty = false) {
  const state = stateFixture();
  const d = (i) => shiftDate(today, i - 6);
  const diary = empty
    ? [meal(d(4))]
    : [
        feeling(d(0), 4, 8, "08:00"),
        feeling(d(1), 2, 5.5),
        feeling(d(2), 5, 7.5),
        feeling(d(3), 3, 6),
        meal(d(4)),
        feeling(d(5), 4, undefined, "20:00"),
        feeling(d(6), 4, 7, "09:00"),
        feeling(d(6), 2, undefined, "21:00"),
        feeling(shiftDate(today, -7), 1, 3),
      ];
  return valid({ ...state, diary });
}

const weighIn = (base, id, date, weight) => ({ ...base, id, date, weight, height: 165, waist: null, hip: null, bodyFat: null, method: "Balança em casa" });
const habit = (id, timeOfDay, createdDate, completedDates) => ({ id, title: `Combinado ${id}`, timeOfDay, createdDate, completedDates });
/** Fixture do resumo (§3.5) deslocada para a semana W(0)…W(6); `onlyW1` deixa registros só em W(1). */
function recapState(change = {}, { onlyW1 = false } = {}) {
  const state = stateFixture();
  const profile = { ...state.profile, ...change };
  const base = state.measurements[0];
  const diary = onlyW1
    ? [meal(W(1)), water(W(1), 1500)]
    : [
        meal(W(0)),
        meal(W(1), "12:00"),
        meal(W(1), "19:00"),
        meal(W(2)),
        meal(W(4)),
        meal(W(5)),
        water(W(0), 2000),
        water(W(1), 1500),
        water(W(2), 2500),
        water(W(3), 1000),
        water(W(4), 2000),
        water(W(5), 1800),
        feeling(W(1), 4, 7),
        feeling(W(3), 3, 6.5),
        feeling(W(5), 5),
        water(MONDAY, 500),
        meal(shiftDate(W(0), -1)),
      ];
  return valid({
    ...state,
    profile,
    goalHistory: [{ date: shiftDate(MONDAY, -30), profile }],
    measurements: [
      weighIn(base, "m1", shiftDate(MONDAY, -21), 74),
      weighIn(base, "m2", shiftDate(MONDAY, -14), 73.4),
      weighIn(base, "m3", W(3), 72.6),
    ],
    diary,
    habits: onlyW1
      ? []
      : [habit("h1", "08:00", shiftDate(MONDAY, -27), [W(0), W(1), W(2), W(4)]), habit("h2", "09:00", W(3), [W(2), W(3), W(5)])],
  });
}

// ---------- Harness (o3l3-check) ----------
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
 * Abre o app com o estado (e linhas extras da chave-valor) no SQLite do navegador e vai para a rota pedida.
 * `clock` fixa a data da página (o app lê a data local); `initScript` roda antes do app em cada página.
 */
async function open(state, { width = 390, route = "/", ready, reducedMotion, clock, kv = [], initScript } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  for (const [key, value] of kv) db.prepare("INSERT INTO storage VALUES (?, ?)").run(key, value);
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  if (clock) await page.clock.setFixedTime(clock);
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
  await expect((ready ?? hojeReady)(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
}
/** Semana do Hoje: segunda a domingo ("Esta semana", conceito 01). */
const hojeReady = (page) => page.getByRole("group", { name: "Esta semana" });
const evolucaoReady = (page) => page.getByRole("heading", { name: EVOLUCAO_TITLE, exact: true });

/** Lê uma chave da chave-valor do app no SQLite do navegador (sai da tela: use no fim de um bloco). */
async function readKv(page, key, name) {
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
  const row = db.prepare("SELECT value FROM storage WHERE key=?").get(key);
  db.close();
  return row?.value ?? null;
}

/** Sem rolagem lateral: nenhum elemento visível passa da janela. */
async function noSideScroll(page) {
  const problem = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  });
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Menor fonte de texto visível (px) dentro de `selector` (o último que casar), ignorando SVG e texto só para leitores de tela. */
async function smallestText(page, selector = "body") {
  return page.evaluate((sel) => {
    let min = Infinity;
    const all = document.querySelectorAll(sel);
    const root = all[all.length - 1];
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
async function shoot(page, file, locator) {
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file), fullPage: false });
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const part = (page, n, title) => page.getByRole("group", { name: `${n} de 5: ${title}`, exact: true });
const recapCard = (page) => page.getByTestId("week-recap");
/** "Ver sua semana": o botão do cartão do Hoje ou a linha da Evolução ("Ver sua semana, <semana>"). */
const weekButton = (page) => page.getByRole("button", { name: /^Ver sua semana/ });
const tiles = (page) => recapCard(page).getByRole("list", { name: "Resumo da semana", exact: true }).getByRole("listitem");
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
/** Arrasta na horizontal sobre `locator` (dx < 0 = para a esquerda), com o mouse (como o o2l4-check). */
async function swipe(page, locator, dx) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 120);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + 1);
  await page.mouse.up();
  await page.waitForTimeout(300);
}
/** Texto da parte à vista dos stories. */
const storyText = (page) => page.getByTestId("story-slide").innerText();
/** Abre a folha de detalhes de um mini gráfico (ou da linha "Proteína") e devolve o cartão dela. */
async function openSeries(page, name, testId) {
  await page.getByRole("button", { name, exact: typeof name === "string" }).click();
  const card = page.getByTestId(testId);
  await expect(card).toBeVisible();
  return card;
}
/** Fecha a folha aberta (`title`) pelo "Fechar" do cabeçalho. */
async function closeSheet(page, title) {
  await expect(heading(page, title).first()).toBeVisible();
  await button(page, "Fechar").click();
  await expect(button(page, "Fechar")).toHaveCount(0);
}
/** As pílulas de destaque não passam da borda do cartão. */
async function chipsInside(card, id) {
  const box = await card.boundingBox();
  for (const chip of await card.getByRole("listitem").all()) {
    const c = await chip.boundingBox();
    if (c.x < box.x || c.x + c.width > box.x + box.width + 0.5)
      throw Error(`${id}: pílula ${c.x.toFixed(1)}..${(c.x + c.width).toFixed(1)} fora de ${box.x.toFixed(1)}..${(box.x + box.width).toFixed(1)}`);
  }
}

// ---------- (a) Destaques nos mini gráficos e "Como calculamos" ----------
{
  const { page, context, errors } = await open(insightsState(), { route: "/evolucao", ready: evolucaoReady });
  // Conceito 09: o mini gráfico mostra a média e "média/dia · meta …"; os destaques (EVOL-06) ficam na folha de detalhes.
  await check('(a) mini gráficos: "média/dia" com a meta; sem pílulas na tela', async () => {
    await expect(page.getByTestId("mini-water")).toContainText("média/dia · meta");
    await expect(page.getByTestId("mini-food")).toContainText("média/dia · meta");
    await expect(page.getByTestId("mini-grid").getByRole("listitem")).toHaveCount(0);
  });
  await check('(a) folha Água: "94% da meta" e "6 de 7 dias" em "Destaques de Água"; unidade "L/dia"', async () => {
    const card = await openSeries(page, "Água: ver detalhes", "series-water");
    const list = card.getByRole("list", { name: "Destaques de Água", exact: true });
    await expect(list).toContainText("94% da meta");
    await expect(list).toContainText("6 de 7 dias");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(card).toContainText("L/dia");
    await expect(card).not.toContainText("média/dia");
    await chipsInside(card, "series-water");
    await closeSheet(page, "Água");
  });
  await check('(a) folhas Calorias ("kcal/dia" e os destaques) e Proteína ("Referência ")', async () => {
    const food = await openSeries(page, "Calorias: ver detalhes", "series-food");
    await expect(food).toContainText("kcal/dia");
    await expect(food.getByRole("list", { name: "Destaques de Calorias", exact: true })).toContainText("6 de 7 dias");
    await chipsInside(food, "series-food");
    await closeSheet(page, "Calorias");
    const protein = await openSeries(page, /^Proteína, /, "series-protein");
    await expect(protein).toContainText("Referência ");
    await chipsInside(protein, "series-protein");
    await closeSheet(page, "Proteína");
  });
  await shoot(page, "390-mini-destaques.png", page.getByTestId("mini-grid"));
  await check('(a) "Como calculamos" (44 px) abre a folha com a frase que saiu da consistência', async () => {
    await touch44(button(page, "Como calculamos"), "Como calculamos");
    await expect(page.getByTestId("consistency-card")).not.toContainText(MOVED);
    await button(page, "Como calculamos").click();
    await expect(heading(page, "Como calculamos")).toBeVisible();
    for (const title of ["Médias", "Porcentagem da meta", "Dias com registro", "Peso de tendência", "Bem-estar e sono", "Sua semana"])
      await expect(heading(page, title).last()).toBeVisible();
    await expect(page.getByText(MOVED, { exact: true })).toBeVisible();
    await noSideScroll(page);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await shoot(page, "390-como-calculamos.png");
    await heading(page, "Como calculamos").locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(heading(page, "Como calculamos")).toHaveCount(0);
  });
  await check("(a) sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(insightsState({ hideCalories: true }), { route: "/evolucao", ready: evolucaoReady });
  await check("(a) calorias ocultas: mini gráficos e folha sem kcal nem calorias", async () => {
    const grid = await page.getByTestId("mini-grid").innerText();
    if (/kcal|calori/i.test(grid)) throw Error(grid);
    await button(page, "Como calculamos").click();
    const sheet = await heading(page, "Como calculamos").locator("xpath=../..").innerText();
    if (/kcal|calori/i.test(sheet)) throw Error(sheet);
    await expect(heading(page, "Porcentagem da meta de água")).toBeVisible();
  });
  await check("(a) calorias ocultas: sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(insightsState({ eatingDisorder: "sim" }), { route: "/evolucao", ready: evolucaoReady });
  await check('(a) perfil calmo: Calorias sem meta nem "% da meta"; sem Proteína; "Como calculamos" sem peso, ritmo e proteína', async () => {
    await expect(page.getByTestId("mini-food")).toContainText("média/dia");
    await expect(page.getByTestId("mini-food")).not.toContainText("meta");
    await expect(page.getByRole("button", { name: /^Proteína/ })).toHaveCount(0);
    const food = await openSeries(page, "Calorias: ver detalhes", "series-food");
    await expect(food).toContainText("6 de 7 dias");
    await expect(food).not.toContainText("% da meta");
    await closeSheet(page, "Calorias");
    const water = await openSeries(page, "Água: ver detalhes", "series-water");
    await expect(water).toContainText("94% da meta");
    await closeSheet(page, "Água");
    await button(page, "Como calculamos").click();
    await expect(heading(page, "Como calculamos")).toBeVisible();
    for (const title of ["Peso de tendência", "Ritmo", "Proteína"]) await expect(heading(page, title)).toHaveCount(0);
  });
  await check("(a) perfil calmo: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (b) Bem-estar e sono ----------
{
  const { page, context, errors } = await open(wellbeingState(), { route: "/evolucao", ready: evolucaoReady });
  const card = page.getByTestId("wellbeing-card");
  const week = card.getByRole("list", { name: "Bem-estar e sono dos últimos 7 dias", exact: true });
  await check('(b) "Bem-estar e sono" em "Mais da sua evolução" (humor da semana) abre a folha com o cartão', async () => {
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: /^Bem-estar e sono, Humor em 6 de 7 dias/ }).click();
    await expect(heading(page, "Bem-estar e sono").first()).toBeVisible();
    await expect(card).toBeVisible();
  });
  await check("(b) 7 dias com rótulos por dia; hoje com aria-current", async () => {
    await expect(week.getByRole("listitem")).toHaveCount(7);
    await expect(week.getByRole("listitem").first()).toHaveAttribute("aria-label", `${fmtShortDate(shiftDate(today, -6))}: humor Bem, sono 8 h`);
    await expect(week.getByRole("listitem").nth(4)).toHaveAttribute("aria-label", `${fmtShortDate(shiftDate(today, -2))}: sem registro de bem-estar`);
    await expect(week.getByRole("listitem").nth(5)).toHaveAttribute("aria-label", `${fmtShortDate(shiftDate(today, -1))}: humor Bem, sono não informado`);
    await expect(week.getByRole("listitem").last()).toHaveAttribute("aria-current", "date");
    await expect(week.getByRole("listitem").last()).toHaveAttribute("aria-label", `${fmtShortDate(today)}: humor Mal, sono 7 h`);
  });
  await check('(b) destaques "Humor em 6 de 7 dias" · "Sono médio 6,8 h"', async () => {
    const stats = card.getByRole("list", { name: "Destaques de bem-estar", exact: true });
    await expect(stats).toContainText("Humor em 6 de 7 dias");
    await expect(stats).toContainText("Sono médio 6,8 h");
  });
  await check("(b) leitura cruzada descritiva com o aviso; nada causal", async () => {
    const cross = card.getByTestId("wellbeing-cross");
    await expect(cross).toContainText("Nos dias com mais sono, seu humor foi melhor em média.");
    await expect(cross).toContainText("Com 7 h ou mais de sono: humor 3,7 de 5 (3 dias) · com menos: 2,5 de 5 (2 dias)");
    await expect(cross).toContainText(NOTE);
    const content = await card.innerText();
    if (CAUSAL.test(content)) throw Error(content.match(CAUSAL)[0]);
  });
  await shoot(page, "390-bem-estar.png", card);
  await check('(b) "28 dias": mapa com 28 dias', async () => {
    await page.getByRole("tab", { name: "28 dias", exact: true }).click();
    const heat = card.getByRole("list", { name: "Bem-estar e sono dos últimos 28 dias", exact: true });
    await expect(heat.getByRole("listitem")).toHaveCount(28);
    await expect(heat.getByRole("listitem").last()).toHaveAttribute("aria-current", "date");
  });
  await shoot(page, "390-bem-estar-28.png", card);
  await check("(b) sem erros de página", async () => noErrors(errors));
  await context.close();
}
for (const width of [360, 320]) {
  const { page, context, errors } = await open(wellbeingState(), { width, route: "/evolucao", ready: evolucaoReady });
  await check(`(b) ${width} px: bem-estar sem rolagem lateral e texto de 12 px ou mais`, async () => {
    await touch44(button(page, "Como calculamos"), "Como calculamos");
    await page.getByRole("button", { name: /^Bem-estar e sono, / }).click();
    await page.getByTestId("wellbeing-card").scrollIntoViewIfNeeded();
    await noSideScroll(page);
    const small = await smallestText(page, '[data-testid="wellbeing-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  if (width === 320) await shoot(page, "320-bem-estar.png", page.getByTestId("wellbeing-card"));
  await check(`(b) ${width} px: sem erros de página`, async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(wellbeingState(true), { route: "/evolucao", ready: evolucaoReady });
  await check('(b) vazio: "Registrar bem-estar" abre a folha de bem-estar', async () => {
    await page.getByRole("button", { name: /^Bem-estar e sono/ }).click();
    const card = page.getByTestId("wellbeing-card");
    await expect(card).toContainText("Registre como você está para ver o humor e o sono aqui.");
    await expect(card.getByRole("list")).toHaveCount(0);
    await touch44(button(page, "Registrar bem-estar"), "Registrar bem-estar");
    await button(page, "Registrar bem-estar").click();
    await expect(heading(page, "Registrar bem-estar")).toBeVisible();
  });
  await check("(b) vazio: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (c) Hoje às segundas: cartão, dispensar e "Desfazer" ----------
{
  const { page, context, errors } = await open(recapState(), { clock: AT_MONDAY });
  await check('(c) segunda: "Sua semana" no Hoje com 4 blocos (6 de 7, 73,0 kg, −0,7 kg, 1,8 L/dia, Bem)', async () => {
    await expect(recapCard(page)).toBeVisible();
    await expect(recapCard(page)).toContainText(`Sua semana ${lastCompleteWeek(MONDAY).label}`);
    await expect(tiles(page)).toHaveCount(4);
    for (const text of ["6 de 7", "73,0 kg", "−0,7 kg na semana", "1,8 L/dia", "Bem", "Sono 6,8 h"]) await expect(recapCard(page)).toContainText(text);
    const content = await recapCard(page).innerText();
    if (/kcal|calori/i.test(content)) throw Error(content);
  });
  await shoot(page, "390-hoje-semana.png", recapCard(page));
  await check('(c) "Dispensar resumo da semana" (44 px) some com o cartão; "Desfazer" traz de volta', async () => {
    await touch44(button(page, "Dispensar resumo da semana"), "Dispensar resumo da semana");
    await touch44(weekButton(page), "Ver sua semana");
    await button(page, "Dispensar resumo da semana").click();
    await expect(recapCard(page)).toHaveCount(0);
    const toast = page.getByTestId("toast-info");
    await expect(toast).toContainText("Resumo da semana dispensado.");
    await toast.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(recapCard(page)).toBeVisible();
  });
  await check("(c) dispensado de novo: continua fora depois de recarregar; chave local = início da semana", async () => {
    await button(page, "Dispensar resumo da semana").click();
    await expect(recapCard(page)).toHaveCount(0);
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(hojeReady(page)).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await expect(recapCard(page)).toHaveCount(0);
    const value = await readKv(page, RECAP_DISMISS_KEY, "dispensa");
    if (value !== W(0)) throw Error(`chave ${value} (esperado ${W(0)})`);
  });
  await check("(c) sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(recapState(), { clock: AT_MONDAY, kv: [[RECAP_DISMISS_KEY, W(0)]] });
  await check("(c) semana já dispensada neste aparelho: sem cartão no Hoje", async () => {
    await page.waitForTimeout(1200);
    await expect(recapCard(page)).toHaveCount(0);
  });
  await check("(c) dispensada: sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(recapState(), { clock: AT_TUESDAY });
  await check('(c) terça: sem cartão no Hoje; a Evolução mantém a linha "Sua semana" sem dispensar', async () => {
    await page.waitForTimeout(1200);
    await expect(recapCard(page)).toHaveCount(0);
    await page.goto(url + "/evolucao");
    await expect(evolucaoReady(page)).toBeVisible({ timeout: 30000 });
    await expect(recapCard(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ver sua semana, / })).toBeVisible();
    await expect(button(page, "Dispensar resumo da semana")).toHaveCount(0);
  });
  await check("(c) terça: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (d) Stories ----------
{
  const { page, context, errors } = await open(recapState(), { route: "/evolucao", ready: evolucaoReady, clock: AT_MONDAY, reducedMotion: "reduce" });
  await check('(d) movimento reduzido: a linha "Ver sua semana" abre "Sua semana" na parte 1, sem pausar', async () => {
    await page.getByRole("button", { name: /^Ver sua semana, / }).click();
    await expect(heading(page, "Sua semana")).toBeVisible();
    await expect(part(page, 1, "Sua semana")).toBeVisible();
    await expect(part(page, 1, "Sua semana")).toContainText("6 de 7");
    await expect(button(page, "Pausar avanço automático")).toHaveCount(0);
    await expect(button(page, "Anterior")).toBeDisabled();
  });
  await shoot(page, "390-stories-1.png");
  await check('(d) "Próximo" → parte 2 com as refeições; "Anterior" → parte 1', async () => {
    await button(page, "Próximo").click();
    await expect(part(page, 2, "Água e refeições")).toBeVisible();
    await expect(part(page, 2, "Água e refeições")).toContainText("6 refeições registradas em 5 dias");
    await expect(part(page, 2, "Água e refeições").getByRole("img")).toHaveAttribute("aria-label", /^Água por dia de .+: Seg 2\.000 ml, Ter 1\.500 ml/);
    await button(page, "Anterior").click();
    await expect(part(page, 1, "Sua semana")).toBeVisible();
  });
  await check("(d) arrastar para a esquerda (−150 px) vai para a parte 2", async () => {
    await swipe(page, part(page, 1, "Sua semana"), -150);
    await expect(part(page, 2, "Água e refeições")).toBeVisible();
  });
  await check("(d) partes 3 a 5: bem-estar, combinados e peso, conquistas gentis (4)", async () => {
    await button(page, "Próximo").click();
    await expect(part(page, 3, "Bem-estar e sono")).toBeVisible();
    await expect(page.getByTestId("story-slide").getByTestId("wellbeing-cross")).toBeVisible();
    await button(page, "Próximo").click();
    await expect(part(page, 4, "Combinados e peso")).toBeVisible();
    for (const text of ["6 de 11 combinados cumpridos", "Combinado h1", "4 de 7 dias", "Combinado h2", "2 de 4 dias", "73,0 kg", "−0,7 kg na semana"])
      await expect(part(page, 4, "Combinados e peso")).toContainText(text);
    await button(page, "Próximo").click();
    const wins = part(page, 5, "Conquistas gentis").getByRole("list", { name: "Conquistas gentis", exact: true }).getByRole("listitem");
    await expect(wins).toHaveCount(4);
    const texts = (await wins.allInnerTexts()).map((t) => t.trim());
    const expected = ["Refeições registradas em 5 dias", "Água registrada em 6 dias", "Meta de água alcançada em 3 dias", "6 combinados cumpridos"];
    if (texts.join("|") !== expected.join("|")) throw Error(texts.join(" | "));
    await expect(button(page, "Próximo")).toHaveCount(0);
  });
  await shoot(page, "390-stories-5.png");
  await check('(d) sem dias seguidos nem calorias; "Concluir" fecha', async () => {
    const content = await page.getByRole("dialog").last().innerText();
    if (NO_STREAK.test(content) || /kcal|calori/i.test(content)) throw Error(content);
    await touch44(button(page, "Concluir"), "Concluir");
    await touch44(button(page, "Fechar"), "Fechar");
    await touch44(button(page, "Compartilhar resumo"), "Compartilhar resumo");
    await button(page, "Concluir").click();
    await expect(heading(page, "Sua semana")).toHaveCount(0);
    await expect(weekButton(page)).toBeVisible();
  });
  await check("(d) movimento reduzido: sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(recapState(), { route: "/evolucao", ready: evolucaoReady, clock: AT_MONDAY });
  await check('(d) movimento normal: "Pausar avanço automático" alterna para "Retomar avanço automático"', async () => {
    await weekButton(page).click();
    await expect(part(page, 1, "Sua semana")).toBeVisible();
    await touch44(button(page, "Pausar avanço automático"), "Pausar avanço automático");
    await button(page, "Pausar avanço automático").click();
    await expect(button(page, "Retomar avanço automático")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(part(page, 1, "Sua semana")).toBeVisible();
    await button(page, "Retomar avanço automático").click();
    await expect(button(page, "Pausar avanço automático")).toBeVisible();
  });
  await check("(d) movimento normal: avança sozinho para a parte 2 (6 s por parte)", async () => {
    await expect(part(page, 2, "Água e refeições")).toBeVisible({ timeout: 9000 });
  });
  await check("(d) movimento normal: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (e) Compartilhar em texto ----------
/** Vai até a parte 5 e abre "Compartilhar resumo". */
async function openShare(page) {
  await weekButton(page).click();
  for (let i = 0; i < 4; i++) await button(page, "Próximo").click();
  await button(page, "Compartilhar resumo").click();
  await expect(heading(page, "Compartilhar resumo")).toBeVisible();
}
{
  const stub = () => {
    window.__shared = [];
    navigator.share = (data) => {
      window.__shared.push(data);
      return Promise.resolve();
    };
  };
  const { page, context, errors } = await open(recapState(), { route: "/evolucao", ready: evolucaoReady, clock: AT_MONDAY, reducedMotion: "reduce", initScript: stub });
  await check('(e) "Compartilhar" envia o texto seguro da semana (sem peso, humor, sono ou calorias)', async () => {
    await openShare(page);
    await expect(page.getByText("Minha semana no WebFit (", { exact: false }).last()).toBeVisible();
    await touch44(button(page, "Compartilhar"), "Compartilhar");
    await button(page, "Compartilhar").click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const shared = await page.evaluate(() => window.__shared[0]);
    if (!shared.text.startsWith("Minha semana no WebFit (")) throw Error(shared.text);
    if (SHARE_UNSAFE.test(shared.text)) throw Error(shared.text.match(SHARE_UNSAFE)[0]);
    if (shared.title !== "Minha semana no WebFit") throw Error(shared.title);
    for (const line of ["• 6 de 7 dias com registro", "• 6 de 11 combinados cumpridos", "Gerado no meu aparelho pelo WebFit."])
      if (!shared.text.includes(line)) throw Error(`sem "${line}"`);
    await expect(heading(page, "Compartilhar resumo")).toHaveCount(0);
  });
  await shoot(page, "390-compartilhado.png");
  await check("(e) sem erros de página", async () => noErrors(errors));
  await context.close();
}
{
  const unsupported = () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  };
  const { page, context, errors } = await open(recapState(), { route: "/evolucao", ready: evolucaoReady, clock: AT_MONDAY, reducedMotion: "reduce", initScript: unsupported });
  await check("(e) sem compartilhamento no navegador: aviso de que não foi possível", async () => {
    await openShare(page);
    await shoot(page, "390-compartilhar.png");
    await button(page, "Compartilhar").click();
    await expect(page.getByTestId("toast-warning")).toContainText("Não foi possível abrir o compartilhamento neste aparelho.");
    await expect(heading(page, "Compartilhar resumo")).toBeVisible();
  });
  await check("(e) sem compartilhamento: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (f) Perfil calmo ----------
{
  // Os blocos da semana ficam no cartão do Hoje (segunda); na Evolução, "Sua semana" é uma linha.
  const { page, context, errors } = await open(recapState({ eatingDisorder: "sim" }), { clock: AT_MONDAY, reducedMotion: "reduce" });
  await check("(f) calmo: blocos sem peso (6 de 7, 1,8 L/dia, Bem, 6 de 11)", async () => {
    await expect(tiles(page)).toHaveCount(4);
    for (const text of ["6 de 7", "1,8 L/dia", "Bem", "6 de 11"]) await expect(recapCard(page)).toContainText(text);
    await expect(recapCard(page)).not.toContainText("Peso de tendência");
  });
  await check('(f) calmo: parte 4 "Combinados", parte 5 "Sua semana em registros"; nada de kg nem meta', async () => {
    await weekButton(page).click();
    const seen = [];
    for (let i = 1; i <= 5; i++) {
      seen.push(await storyText(page));
      if (i < 5) await button(page, "Próximo").click();
    }
    await expect(part(page, 5, "Sua semana em registros")).toBeVisible();
    await button(page, "Anterior").click();
    await expect(part(page, 4, "Combinados")).toBeVisible();
    const all = seen.join("\n");
    if (/\bkg\b|meta|pesagem/i.test(all)) throw Error(all.match(/\bkg\b|meta|pesagem/i)[0]);
  });
  await check("(f) calmo: sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (g) Poucos registros ----------
{
  const { page, context, errors } = await open(recapState({}, { onlyW1: true }), { clock: AT_MONDAY });
  await check("(g) só 1 dia com registro na semana: nenhum cartão no Hoje nem na Evolução", async () => {
    await page.waitForTimeout(1200);
    await expect(recapCard(page)).toHaveCount(0);
    await page.goto(url + "/evolucao");
    await expect(evolucaoReady(page)).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(600);
    await expect(recapCard(page)).toHaveCount(0);
  });
  await check("(g) sem erros de página", async () => noErrors(errors));
  await context.close();
}

// ---------- (h) 360 e 320 px ----------
for (const width of [360, 320]) {
  const { page, context, errors } = await open(recapState(), { width, clock: AT_MONDAY, reducedMotion: "reduce" });
  await check(`(h) ${width} px: cartão sem rolagem lateral, botões de 44 px e texto de 12 px ou mais`, async () => {
    await recapCard(page).scrollIntoViewIfNeeded();
    await noSideScroll(page);
    await touch44(button(page, "Dispensar resumo da semana"), "Dispensar resumo da semana");
    await touch44(weekButton(page), "Ver sua semana");
    const small = await smallestText(page, '[data-testid="week-recap"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  if (width === 320) await shoot(page, "320-hoje-semana.png", recapCard(page));
  await check(`(h) ${width} px: stories sem rolagem lateral em todas as partes, controles de 44 px`, async () => {
    await weekButton(page).click();
    for (let i = 1; i <= 5; i++) {
      await page.waitForTimeout(250);
      await noSideScroll(page);
      const small = await smallestText(page, '[data-testid="story-slide"]');
      if (small < 12) throw Error(`parte ${i}: texto de ${small} px`);
      await touch44(button(page, "Anterior"), "Anterior");
      await touch44(button(page, "Fechar"), "Fechar");
      if (width === 320) await shoot(page, `320-stories-${i}.png`);
      if (i < 5) {
        await touch44(button(page, "Próximo"), "Próximo");
        await button(page, "Próximo").click();
      }
    }
    await touch44(button(page, "Compartilhar resumo"), "Compartilhar resumo");
  });
  await check(`(h) ${width} px: sem erros de página`, async () => noErrors(errors));
  await context.close();
}

await browser.close();
server.close();
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
