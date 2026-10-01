// Verificação da Onda 3 · Lote 4 · NOTIF-01 (Central de lembretes) no export web do app, com o relógio
// fixo às 13:00 de hoje, a 390 e 360 px: seções "Agora" / "Hoje" / "Próximos", atalhos "+250 ml",
// "Concluir" e "Registrar" (com "Desfazer" e o foco de volta em "Agora"), "Marcar como lido", "Tudo em
// dia", estado desligado com "Como ficaria hoje" e "Ativar lembretes", horário de silêncio e as regras de
// saúde (perfil sensível sem medidas, aplicação sem atalho e "estimado", nada na gestação, sem "+250 ml"
// com restrição de líquidos, sem calorias). O aviso do export é o texto do web (Platform.OS === "web");
// o texto do aparelho ("mesmo com o app fechado") é coberto pelo teste unitário. Alvos ≥ 44 px, sem
// rolagem lateral e sem erros de página ou console. Só o export web pode ser testado aqui (sem aparelho).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l4n
//   node --import tsx scripts/o3l4n-check.mjs dist/o3l4n [pasta-das-fotos]
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { REMINDER_COPY } from "../../src/lib/reminder-center.ts";
import { INJECTION_REMINDER_BODY, INJECTION_REMINDER_TITLE } from "../../src/lib/treatment.ts";
import { stateSchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { SETTINGS_TAB } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o3l4n");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o3l4n-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o3l4n-seed-"));
const PORT = 3226;
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
/** Instante local de hoje (relógio fixo da página). */
const at = (time) => `${today}T${time}:00`;
const TIRZ = { weightLossPen: "sim", weightLossPenName: "Tirzepatida", weightLossPenDose: "2,5 mg", weightLossPenPerMonth: 4 };
const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const ARROZ = taco.find((f) => f.name === "Arroz, integral, cozido");
if (!ARROZ) throw Error("sem arroz na TACO");
/** Itens e totais do café registrado (uma refeição precisa de ao menos um alimento). */
const BREAKFAST = { items: [{ food: ARROZ, grams: 100 }], ...mealTotals([{ food: ARROZ, grams: 100 }]) };
/** "Amanhã · 08:30" ou "Qui, 1 out · 08:30" (inclui "Sáb"); nunca "em N dias". */
const DATE_WHEN = /^(Amanhã|\p{Lu}\p{Ll}{2}, \d{1,2} \p{Ll}{3}) · \d{2}:\d{2}$/u;
const NO_DRUG = /\bmg\b|Tirzepatida|Semaglutida|Mounjaro|Ozempic/;

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

/**
 * Estado da central (o mesmo de tests/reminder-center.test.ts, datado de hoje): café registrado às
 * 08:10, 500 ml de água às 10:00, dois combinados (12:00 e 21:30) e nenhuma medida nos últimos 7 dias.
 * Às 13:00: "Agora" = almoço, "Caminhar 20 minutos", água e medidas.
 */
function centerState(profile = {}, extra = {}) {
  const base = stateFixture();
  const entry = (fields) => ({
    userId: base.userId,
    type: "agua",
    date: today,
    createdAt: `${today}T10:00:00.000Z`,
    updatedAt: `${today}T10:00:00.000Z`,
    description: "",
    ...fields,
  });
  return {
    ...base,
    profile: { ...base.profile, remindersEnabled: true, ...profile },
    measurements: [],
    diary: [
      entry({ id: "cafe1", type: "refeicao", time: "08:10", title: "Café da manhã", categoryTag: "Café da manhã", ...BREAKFAST }),
      entry({ id: "agua1", time: "10:00", title: "Água", amountMl: 500 }),
    ],
    habits: [
      { id: "h1", title: "Caminhar 20 minutos", timeOfDay: "12:00", createdDate: shiftDate(today, -3), completedDates: [] },
      { id: "h2", title: "Chá calmante", timeOfDay: "21:30", createdDate: shiftDate(today, -3), completedDates: [] },
    ],
    ...extra,
  };
}
/** Aplicação de Tirzepatida `daysAgo` dias atrás (frasco e seringa, 2,5 mg). */
function inj(id, daysAgo, fields = {}) {
  const date = shiftDate(today, -daysAgo);
  const time = fields.time ?? "08:30";
  return {
    id,
    userId: stateFixture().userId,
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
/** Aplicação estimada para hoje (a última há 7 dias, às 00:00) e sem horário de silêncio. */
const penDueState = (profile = {}) =>
  centerState({ ...TIRZ, quietStart: "00:00", quietEnd: "00:00", ...profile }, { injections: [inj("n1", 7, { time: "00:00" })] });

let seeds = 0;
/** Abre o app com o estado gravado no SQLite do navegador, o relógio fixo e a rota pedida. */
async function open(state, { width = 390, route = "/notificacoes", ready, clock = at("13:00") } = {}) {
  // Um estado inválido abriria a tela de recuperação: falha aqui com o motivo.
  const valid = stateSchema.safeParse(state);
  if (!valid.success) throw Error(`estado de teste inválido: ${JSON.stringify(valid.error.issues.slice(0, 3))}`);
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(clock);
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
  await goTo(page, route, ready);
  return { page, context, errors };
}
/** Navega dentro do app já semeado e espera a tela ficar pronta. */
async function goTo(page, route = "/notificacoes", ready) {
  await page.goto(url + route);
  await expect(ready ? ready(page) : screenReady(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
}
const screenReady = (page) => section(page, "agora").or(page.getByTestId("reminders-off"));

/** Lê o estado gravado no SQLite do navegador (sai da tela: use no fim de um bloco ou volte com goTo). */
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
/** Todos os botões de `scope` com área de toque real ≥ 44 × 44. */
async function allTouch44(scope) {
  const buttons = scope.getByRole("button");
  const count = await buttons.count();
  if (!count) throw Error("nenhum botão");
  for (let i = 0; i < count; i++) {
    const item = buttons.nth(i);
    await touch44(item, (await item.getAttribute("aria-label")) ?? (await item.innerText()));
  }
  return count;
}
async function shoot(page, file, locator) {
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file), fullPage: true });
}
/**
 * Nenhum "kcal"/"caloria" no texto visível nem nos nomes acessíveis visíveis (a tela de baixo da pilha,
 * como o Hoje depois do sino, fica montada e oculta: não conta).
 */
async function noCalories(page) {
  const found = await page.evaluate(() => {
    const pattern = /kcal|caloria/i;
    if (pattern.test(document.body.innerText)) return `texto: ${document.body.innerText.match(/.{0,40}(kcal|caloria).{0,20}/i)?.[0]}`;
    const label = [...document.querySelectorAll("[aria-label]")].find(
      (el) => el.checkVisibility() && pattern.test(el.getAttribute("aria-label") ?? ""),
    );
    return label ? `nome: ${label.getAttribute("aria-label")}` : "";
  });
  if (found) throw Error(`caloria à vista: ${found}`);
}
const section = (page, key) => page.getByTestId(`reminder-section-${key}`);
const cards = (page, key) => section(page, key).getByTestId("reminder-card");
const rows = (page, key) => section(page, key).getByTestId("reminder-row");
const cardTitled = (page, key, title) =>
  cards(page, key).filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const button = (page, name) => page.getByRole("button", { name, exact: true });
/** Última coluna de uma linha planejada (o "quando"). */
const rowWhen = (row) => row.evaluate((el) => [...el.children].at(-1)?.textContent ?? "");
const agoraFocused = (page) =>
  expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? ""), { timeout: 5000 }).toBe("Agora");
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
const AGORA_TITLES = ["Registrar almoço", "Caminhar 20 minutos", "Pausa para hidratação", "Atualizar medidas"];

// ---------- (1) Seções, a partir do sino do Hoje ----------
{
  const { page, context, errors } = await open(centerState(), {
    route: "/",
    ready: (p) => p.getByRole("button", { name: /^Notificações, 4 não lidas$/ }),
  });
  await check('(1) o sino "Notificações, 4 não lidas" do Hoje abre Lembretes, sem sino na própria tela', async () => {
    await page.getByRole("button", { name: /^Notificações, 4 não lidas$/ }).click();
    await expect(section(page, "agora")).toBeVisible();
    await expect(page).toHaveURL(/\/notificacoes/);
    await expect(page.getByRole("button", { name: /^Notificações/ })).toHaveCount(0);
  });
  await check('(1) "Agora": 4 cartões na ordem almoço, combinado, água, medidas, com 4 pontos de não lido', async () => {
    await expect(cards(page, "agora")).toHaveCount(4);
    await expect(cards(page, "agora").getByRole("heading")).toHaveText(AGORA_TITLES);
    await expect(section(page, "agora").getByTestId("reminder-unread-dot")).toHaveCount(4);
    await expect(cards(page, "agora").nth(0)).toContainText("Desde 12:00");
    await expect(cards(page, "agora").nth(3)).toContainText("Agora");
  });
  await check('(1) água: "500 de 2.000 ml hoje" com a barra; atalhos com nomes próprios; medidas sem atalho', async () => {
    const water = cardTitled(page, "agora", "Pausa para hidratação");
    await expect(water).toContainText("500 de 2.000 ml hoje");
    await expect(water.getByTestId("reminder-progress")).toHaveCount(1);
    await expect(water.getByRole("button", { name: "Somar 250 ml de água", exact: true })).toHaveText("+250 ml");
    await expect(button(page, "Registrar almoço agora")).toHaveText("Registrar");
    await expect(button(page, "Concluir combinado: Caminhar 20 minutos")).toHaveText("Concluir");
    const measure = cardTitled(page, "agora", "Atualizar medidas");
    await expect(measure.getByRole("button")).toHaveText(["Abrir registro", ""]);
    await expect(measure.getByRole("button", { name: "Marcar como lido: Atualizar medidas", exact: true })).toHaveCount(1);
  });
  await check('(1) "Hoje": 4 linhas às 15:00, 19:30, 21:00 e 21:30, sem ações', async () => {
    await expect(rows(page, "hoje")).toHaveCount(4);
    const whens = [];
    for (let i = 0; i < 4; i++) whens.push(await rowWhen(rows(page, "hoje").nth(i)));
    if (whens.join("|") !== "Às 15:00|Às 19:30|Às 21:00|Às 21:30") throw Error(whens.join("|"));
    await expect(section(page, "hoje").getByRole("button")).toHaveCount(0);
  });
  await check('(1) "Próximos": 6 linhas, a primeira "Amanhã · 08:30" café, sem "Atualizar medidas" (devida hoje)', async () => {
    await expect(rows(page, "proximos")).toHaveCount(6);
    await expect(rows(page, "proximos").first()).toContainText("Registrar café da manhã");
    if ((await rowWhen(rows(page, "proximos").first())) !== "Amanhã · 08:30") throw Error(await rowWhen(rows(page, "proximos").first()));
    await expect(section(page, "proximos").getByText("Atualizar medidas")).toHaveCount(0);
    await expect(rows(page, "proximos").last()).toContainText("Registrar jantar");
  });
  await check('(1) aviso do export = texto do web (sem "com o aplicativo aberto") e "Ajustar preferências"', async () => {
    await expect(page.getByText(REMINDER_COPY.noticeWeb, { exact: true })).toBeVisible();
    await expect(page.getByText(/com o aplicativo aberto/)).toHaveCount(0);
    await expect(button(page, "Ajustar preferências")).toBeVisible();
    await expect(button(page, "Marcar todos como lidos")).toHaveCount(1);
  });
  await check("(1) sem calorias no texto nem nos nomes; textos ≥ 12 px", async () => {
    await noCalories(page);
    const small = await smallestText(page, '[data-testid^="reminder-section-"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await shoot(page, "390-lembretes.png");
  await shoot(page, "390-secao-hoje.png", section(page, "hoje"));
  await shoot(page, "390-secao-proximos.png", section(page, "proximos"));
  await check("(1) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (2) Atalho da água ----------
{
  const { page, context, errors } = await open(centerState());
  const chip = () => button(page, "Somar 250 ml de água");
  await check('(2) "+250 ml" registra, avisa "+250 ml registrados.", tira a água de "Agora" e devolve o foco', async () => {
    await chip().click();
    await expect(page.getByText("+250 ml registrados.", { exact: true })).toBeVisible();
    await expect(cards(page, "agora")).toHaveCount(3);
    await expect(cardTitled(page, "agora", "Pausa para hidratação")).toHaveCount(0);
    await agoraFocused(page);
  });
  await check('(2) "Desfazer" devolve o cartão da água', async () => {
    await button(page, "Desfazer").click();
    await expect(cards(page, "agora")).toHaveCount(4);
    await expect(cardTitled(page, "agora", "Pausa para hidratação")).toHaveCount(1);
  });
  await check("(2) gravado: um registro novo de 250 ml de água hoje (e nada mais)", async () => {
    await chip().click();
    await expect(cards(page, "agora")).toHaveCount(3);
    const state = await readState(page, "agua");
    const added = state.diary.filter((e) => e.type === "agua" && e.date === today && e.amountMl === 250);
    if (added.length !== 1 || state.diary.length !== 3) throw Error(JSON.stringify(state.diary.map((e) => [e.type, e.amountMl])));
  });
  await check("(2) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (3) Atalho do combinado ----------
{
  const { page, context, errors } = await open(centerState());
  const chip = () => button(page, "Concluir combinado: Caminhar 20 minutos");
  await check('(3) "Concluir" avisa "Combinado concluído.", tira o cartão e devolve o foco', async () => {
    await chip().click();
    await expect(page.getByText(REMINDER_COPY.habitDone, { exact: true })).toBeVisible();
    await expect(cardTitled(page, "agora", "Caminhar 20 minutos")).toHaveCount(0);
    await expect(cards(page, "agora")).toHaveCount(3);
    await agoraFocused(page);
  });
  await check('(3) "Desfazer" → "Conclusão desfeita.", o cartão volta e o combinado fica em aberto', async () => {
    await button(page, "Desfazer").click();
    await expect(page.getByText(REMINDER_COPY.habitUndone, { exact: true })).toBeVisible();
    await expect(cardTitled(page, "agora", "Caminhar 20 minutos")).toHaveCount(1);
    const state = await readState(page, "combinado-desfeito");
    const h1 = state.habits.find((h) => h.id === "h1");
    if (h1.completedDates.includes(today)) throw Error(JSON.stringify(h1));
  });
  await check("(3) gravado: concluir de novo põe hoje em completedDates", async () => {
    await goTo(page);
    await chip().click();
    await expect(cardTitled(page, "agora", "Caminhar 20 minutos")).toHaveCount(0);
    const state = await readState(page, "combinado");
    const h1 = state.habits.find((h) => h.id === "h1");
    if (!h1.completedDates.includes(today)) throw Error(JSON.stringify(h1));
  });
  await check("(3) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (4) Marcar como lido ----------
{
  const { page, context, errors } = await open(centerState());
  await check('(4) "Marcar como lido: Atualizar medidas" leva o cartão para "Hoje" com "Agora · Lido"', async () => {
    await button(page, "Marcar como lido: Atualizar medidas").click();
    await expect(cards(page, "agora")).toHaveCount(3);
    await expect(cardTitled(page, "agora", "Atualizar medidas")).toHaveCount(0);
    const read = cardTitled(page, "hoje", "Atualizar medidas");
    await expect(read).toHaveCount(1);
    await expect(read).toContainText("Agora · Lido");
    await expect(read.getByTestId("reminder-unread-dot")).toHaveCount(0);
    await expect(read.getByRole("button", { name: /^Marcar como lido/ })).toHaveCount(0);
    await expect(read.getByRole("button", { name: "Abrir registro", exact: true })).toHaveCount(1);
    await expect(section(page, "agora").getByTestId("reminder-unread-dot")).toHaveCount(3);
    await agoraFocused(page);
  });
  await check('(4) gravado: readNotifications com "{hoje}:medicao"', async () => {
    const state = await readState(page, "lido");
    if (!state.readNotifications.includes(`${today}:medicao`)) throw Error(JSON.stringify(state.readNotifications));
  });
  await check('(4) "Abrir registro" do cartão lido de medidas leva à Evolução', async () => {
    await goTo(page);
    await cardTitled(page, "hoje", "Atualizar medidas").getByRole("button", { name: "Abrir registro", exact: true }).click();
    await expect(page).toHaveURL(/\/evolucao/);
  });
  await check("(4) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (5) Atalho da refeição ----------
{
  const { page, context, errors } = await open(centerState());
  await check('(5) "Registrar almoço agora" abre Registrar refeição com "Almoço" escolhido', async () => {
    await button(page, "Registrar almoço agora").click();
    await expect(page).toHaveURL(/\/refeicao/);
    await expect(page.getByRole("button", { name: /^Almoço, Hoje, \d{2}:\d{2}/ })).toBeVisible({ timeout: 20000 });
  });
  await check('(5) gravado: "{hoje}:Almoço" lido e nenhuma refeição registrada', async () => {
    const state = await readState(page, "refeicao");
    if (!state.readNotifications.includes(`${today}:Almoço`)) throw Error(JSON.stringify(state.readNotifications));
    if (state.diary.length !== 2) throw Error(`diário com ${state.diary.length} registros`);
  });
  await check("(5) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (6) Tudo em dia ----------
{
  const { page, context, errors } = await open(centerState());
  await check('(6) "Marcar todos como lidos" → aviso, "Tudo em dia" e "Próximo: 15:00 · Pausa para hidratação"', async () => {
    await button(page, "Marcar todos como lidos").click();
    await expect(page.getByText(REMINDER_COPY.markedAll, { exact: true })).toBeVisible();
    const clear = page.getByTestId("reminders-all-clear");
    await expect(clear.getByRole("heading", { name: "Tudo em dia", exact: true })).toBeVisible();
    await expect(clear).toContainText("Próximo: 15:00 · Pausa para hidratação");
    await expect(button(page, "Marcar todos como lidos")).toHaveCount(0);
    await expect(page.getByTestId("reminder-unread-dot")).toHaveCount(0);
    await expect(cards(page, "hoje")).toHaveCount(4);
    await expect(rows(page, "hoje")).toHaveCount(4);
    await agoraFocused(page);
  });
  await shoot(page, "390-tudo-em-dia.png");
  await check("(6) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (7) Desligados: "Como ficaria hoje" e "Ativar lembretes" ----------
{
  const { page, context, errors } = await open(centerState({ remindersEnabled: false }));
  const off = page.getByTestId("reminders-off");
  await check('(7) "Lembretes desligados" com a prévia de 8 horários (a primeira "09:00 Água") e o silêncio', async () => {
    await expect(off.getByRole("heading", { name: REMINDER_COPY.offTitle, exact: true })).toBeVisible();
    await expect(off).toContainText(REMINDER_COPY.offText);
    const chips = page.getByTestId("reminders-preview").getByRole("listitem");
    await expect(chips).toHaveCount(8);
    await expect(chips.first()).toHaveText("09:00 Água");
    await expect(chips.last()).toHaveText("21:30 Chá calmante");
    await expect(page.getByText("Silêncio 22:00–07:00", { exact: true })).toBeVisible();
    await expect(section(page, "agora")).toHaveCount(0);
    await expect(button(page, "Marcar todos como lidos")).toHaveCount(0);
    await expect(page.getByText(REMINDER_COPY.noticeWeb, { exact: true })).toHaveCount(0);
  });
  await check('(7) "Ativar lembretes" e "Ajustar horários" com toque de 44 px', async () => {
    await touch44(button(page, REMINDER_COPY.enable), REMINDER_COPY.enable);
    await touch44(button(page, REMINDER_COPY.adjust), REMINDER_COPY.adjust);
    const small = await smallestText(page, '[data-testid="reminders-off"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page);
  });
  await shoot(page, "390-desligados.png");
  await check(`(7) "Ajustar horários" abre Meu espaço em "${SETTINGS_TAB.ariaLabel}"`, async () => {
    await button(page, REMINDER_COPY.adjust).click();
    await expect(page).toHaveURL(/\/espaco\?tab=preferencias/);
    await expect(page.getByRole("tab", { name: SETTINGS_TAB.ariaLabel, exact: true })).toHaveAttribute("aria-selected", "true");
  });
  await check("(7) sem erros de página nem de console (prévia)", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(centerState({ remindersEnabled: false }));
  await check('(7) "Ativar lembretes" → "Lembretes ativados.", 4 cartões em "Agora" e o foco no título', async () => {
    await button(page, REMINDER_COPY.enable).click();
    await expect(page.getByText(REMINDER_COPY.enabled, { exact: true })).toBeVisible();
    await expect(cards(page, "agora")).toHaveCount(4);
    await agoraFocused(page);
    const state = await readState(page, "ativados");
    if (state.profile.remindersEnabled !== true) throw Error("remindersEnabled não gravado");
  });
  await check("(7) sem erros de página nem de console (ativar)", () => noErrors(errors));
  await context.close();
}

// ---------- (8) Regras de saúde ----------
{
  const { page, context, errors } = await open(centerState({ eatingDisorder: "sim" }));
  await check('(8a) perfil sensível: nenhum "Atualizar medidas" em nenhuma seção', async () => {
    await expect(cards(page, "agora")).toHaveCount(3);
    await expect(page.getByText("Atualizar medidas")).toHaveCount(0);
    await expect(page.getByText(/medidas/i)).toHaveCount(0);
  });
  await context.close();
  const off = await open(centerState({ eatingDisorder: "sim", remindersEnabled: false }));
  await check('(8a) perfil sensível desligado: a prévia não tem "Medidas"', async () => {
    await expect(off.page.getByTestId("reminders-preview").getByRole("listitem")).toHaveCount(7);
    await expect(off.page.getByTestId("reminders-preview")).not.toContainText("Medidas");
  });
  await check("(8a) sem erros de página nem de console", () => noErrors([...errors, ...off.errors]));
  await off.context.close();
}
{
  const { page, context, errors } = await open(penDueState());
  const card = () => cardTitled(page, "agora", INJECTION_REMINDER_TITLE);
  await check('(8b) "Dia da aplicação (estimado)": sem atalho, sem remédio nem dose, só "Abrir registro" e marcar lido', async () => {
    await expect(card()).toHaveCount(1);
    await expect(card()).toContainText(INJECTION_REMINDER_BODY);
    await expect(card().getByRole("button", { name: /^(Somar|Concluir|Registrar)/ })).toHaveCount(0);
    await expect(card().getByRole("button")).toHaveCount(2);
    await expect(card().getByRole("button", { name: `Marcar como lido: ${INJECTION_REMINDER_TITLE}`, exact: true })).toHaveCount(1);
    const text = await card().innerText();
    if (NO_DRUG.test(text)) throw Error(`lembrete com medicação/dose: ${text}`);
    if (/em \d+ dias?|atrasad/i.test(text)) throw Error(`contagem ou cobrança: ${text}`);
  });
  await shoot(page, "390-aplicacao.png", card());
  await check('(8b) "Abrir registro" leva a Seringa e dose sem registrar nada', async () => {
    await card().getByRole("button", { name: "Abrir registro", exact: true }).click();
    await expect(page).toHaveURL(/\/injecao/);
    await expect(page.getByRole("heading", { name: "Seringa e dose", exact: true })).toBeVisible();
    const state = await readState(page, "aplicacao");
    if (state.injections.length !== 1) throw Error(`${state.injections.length} aplicações`);
    if (!state.readNotifications.includes(`${today}:injecao`)) throw Error(JSON.stringify(state.readNotifications));
  });
  await check("(8b) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(centerState(TIRZ, { injections: [inj("n1", 3)] }));
  await check('(8b) aplicação futura em "Próximos": uma data ("Qui, 1 out · 08:30"), nunca "em N dias"', async () => {
    const row = rows(page, "proximos").filter({ hasText: INJECTION_REMINDER_TITLE });
    await expect(row).toHaveCount(1);
    const when = await rowWhen(row);
    if (!DATE_WHEN.test(when) || /em \d+ dias?/.test(when)) throw Error(`quando: ${when}`);
    await expect(section(page, "proximos").getByRole("button")).toHaveCount(0);
  });
  await check("(8b) aplicação futura: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const on = await open(penDueState({ pregnancy: "gestacao" }));
  await check('(8c) gestação: nenhum "Dia da aplicação" nem medidas com os lembretes ligados', async () => {
    const text = await on.page.locator("body").innerText();
    if (/Dia da aplicação|Aplicação \(estimada\)|Atualizar medidas/.test(text)) throw Error(text.slice(0, 300));
  });
  await on.context.close();
  const off = await open(penDueState({ pregnancy: "gestacao", remindersEnabled: false }));
  await check('(8c) gestação desligada: a prévia não tem "Aplicação (estimada)" nem "Medidas"', async () => {
    await expect(off.page.getByTestId("reminders-preview")).toBeVisible();
    const text = await off.page.locator("body").innerText();
    if (/Aplicação \(estimada\)|Dia da aplicação|Medidas/.test(text)) throw Error(text.slice(0, 300));
  });
  await check("(8c) sem erros de página nem de console", () => noErrors([...on.errors, ...off.errors]));
  await off.context.close();
}
{
  const { page, context, errors } = await open(centerState({ fluidRestriction: "sim" }));
  await check('(8d) restrição de líquidos: sem "+250 ml", "500 ml registrados hoje" e sem barra de meta', async () => {
    const water = cardTitled(page, "agora", "Pausa para hidratação");
    await expect(water).toContainText("500 ml registrados hoje");
    await expect(button(page, "Somar 250 ml de água")).toHaveCount(0);
    await expect(page.getByTestId("reminder-progress")).toHaveCount(0);
  });
  await check("(8d) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(centerState({ hideCalories: true }));
  await check("(8e) calorias ocultas: nenhum kcal no texto nem nos nomes acessíveis", async () => {
    await expect(cards(page, "agora")).toHaveCount(4);
    await noCalories(page);
  });
  await check("(8e) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (9) Silêncio e 360 px ----------
{
  const { page, context, errors } = await open(centerState(), { clock: at("23:30") });
  await check('(9) 23:30: "Horário de silêncio até 07:00…" e "Tudo em dia" com o próximo lembrete', async () => {
    await expect(page.getByTestId("reminders-quiet")).toContainText(REMINDER_COPY.quietNow("07:00"));
    await expect(page.getByTestId("reminders-quiet").getByRole("status")).toHaveText(REMINDER_COPY.quietNow("07:00"));
    const clear = page.getByTestId("reminders-all-clear");
    await expect(clear).toBeVisible();
    // Às 23:30 o próximo é amanhã: o dia vem junto com a hora.
    await expect(clear).toContainText("Próximo: Amanhã · 08:30 · Registrar café da manhã");
    await expect(button(page, "Marcar todos como lidos")).toHaveCount(0);
  });
  await check("(9) silêncio: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
for (const width of [390, 360]) {
  const { page, context, errors } = await open(centerState(), { width });
  await check(`(9) ${width} px: sem rolagem lateral; atalhos, "Abrir registro" e marcar lido com 44 px`, async () => {
    await noSideScroll(page);
    const total = await allTouch44(section(page, "agora"));
    if (total !== 4 + 3 + 4) throw Error(`${total} botões em "Agora"`);
    await touch44(button(page, "Marcar todos como lidos"), "Marcar todos como lidos");
    await touch44(button(page, "Ajustar preferências"), "Ajustar preferências");
    const small = await smallestText(page, '[data-testid^="reminder-section-"]');
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check(`(9) ${width} px: sem erros de página nem de console`, () => noErrors(errors));
  if (width === 360) await shoot(page, "360-lembretes.png");
  await context.close();
}
{
  const { page, context, errors } = await open(centerState({ remindersEnabled: false }), { width: 360 });
  await check("(9) 360 px desligados: sem rolagem lateral e botões com 44 px", async () => {
    await noSideScroll(page);
    await allTouch44(page.getByTestId("reminders-off"));
    noErrors(errors);
  });
  await shoot(page, "360-desligados.png");
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
