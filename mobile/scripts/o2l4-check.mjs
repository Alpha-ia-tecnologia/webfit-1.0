// Verificação da Onda 2 · Lote 4 (Diário e Hoje) no export web do app, a 390 e 360 px (e a semana do
// Hoje a 320): faixa da semana (7 dias, anéis de presença, nomes acessíveis, deslizar ±7 dias,
// calendário, Hoje → Diário), Diário
// agrupado por refeição (subtotal só com 2+ registros, uma kcal por linha, "+" do grupo, pendentes,
// "⋯" com Repetir/Excluir + Desfazer), uma linha de água (expandir, Excluir Água + Desfazer), bem-estar,
// aplicações, busca em todo o histórico, faixa fixa do balanço, calorias ocultas, Hoje com linha do
// tempo e um único atalho pendente, "Comece seu dia" num dia em branco, registro rápido (grade 3×2,
// Aplicação só com caneta, Peso ±0,1 kg + Desfazer, Repetir + Desfazer, Foto do prato) e as datas
// (de volta ao Hoje, o registro rápido usa hoje). Fotografa as telas na pasta indicada.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l4
//   node --import tsx scripts/o2l4-check.mjs dist/o2l4 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { formatDate, localDate, localTime, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { dayPeriod, mealSummary, mealWord } from "../../src/lib/diary-day.ts";
import { fmtKcal } from "../../src/lib/format.ts";
import { injectionDetail, injectionTitle } from "../../src/lib/injection.ts";
import { defaultMealCategory } from "../../src/lib/meals.ts";
import { humanDate, longDate, weekDays } from "../../src/lib/today.ts";
import { palette } from "../../src/design/tokens.ts";
import { diarySchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l4");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l4-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o2l4-seed-"));
const PORT = 3219;
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
const old = shiftDate(today, -3);
/** Hoje mostra a semana de segunda a domingo: o dia anterior tocável é o primeiro desta semana (hoje, se for segunda). */
const weekPast = weekDays(today).find((d) => d < today) ?? today;
const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const food = (name) => {
  const found = taco.find((f) => f.name === name);
  if (!found) throw Error(`sem ${name} na TACO`);
  return found;
};
const ARROZ = food("Arroz, integral, cozido");
const FEIJAO = food("Feijão, carioca, cozido");
const ALFACE = food("Alface, crespa, crua");
const PAO = food("Pão, trigo, francês");
const OVO = food("Ovo, de galinha, inteiro, cozido/10minutos");
const FRANGO = food("Frango, peito, sem pele, grelhado");
/** PNG de 1 × 1 px para a "Foto do prato". */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function entry(fields) {
  return diarySchema.parse({
    userId: "local",
    createdAt: `${fields.date}T${fields.time}:00.000Z`,
    updatedAt: `${fields.date}T${fields.time}:00.000Z`,
    description: "",
    ...fields,
  });
}
const meal = (id, date, time, category, items) =>
  entry({ id, date, time, type: "refeicao", title: category, categoryTag: category, items, ...mealTotals(items) });
const water = (id, date, time, amountMl) => entry({ id, date, time, type: "agua", title: "Água", amountMl });
const MEALS = {
  cafe: meal("cafe", today, "07:30", "Café da manhã", [
    { food: PAO, grams: 50 },
    { food: OVO, grams: 50 },
  ]),
  almoco1: meal("almoco-1", today, "12:00", "Almoço", [
    { food: ARROZ, grams: 100 },
    { food: FEIJAO, grams: 100 },
    { food: ALFACE, grams: 30 },
  ]),
  almoco2: meal("almoco-2", today, "12:40", "Almoço", [{ food: ARROZ, grams: 50 }]),
  jantarAntigo: meal("jantar-antigo", old, "20:00", "Jantar", [
    { food: ARROZ, grams: 80 },
    { food: FRANGO, grams: 100 },
  ]),
};

/** Café e dois almoços hoje, jantar há 3 dias, 750 ml de água, bem-estar 4/5 e um combinado feito hoje. */
function richState(change = {}, extra = {}) {
  const state = stateFixture();
  const diary = [
    ...Object.values(MEALS),
    water("agua-1", today, "08:00", 250),
    water("agua-2", today, "10:00", 500),
    entry({ id: "bem-1", date: today, time: "09:00", type: "bem_estar", title: "Bem-estar", rating: 4, sleepHours: 7 }),
  ].map((e) => ({ ...e, userId: state.userId }));
  return {
    ...state,
    profile: { ...state.profile, ...change },
    diary,
    habits: [
      {
        id: "h1",
        title: "Caminhar depois do almoço",
        timeOfDay: "13:00",
        createdDate: shiftDate(today, -10),
        completedDates: [today],
      },
    ],
    ...extra,
  };
}
/** Sem nenhum registro hoje (o jantar de 3 dias atrás continua). */
const blankState = (change = {}) => {
  const state = richState(change);
  return { ...state, diary: state.diary.filter((e) => e.date !== today), habits: [] };
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
    console.log(`FAIL: ${name}\n  ${String(error?.message ?? error).split("\n").slice(0, 6).join("\n  ")}`);
  }
}

let seeds = 0;
/** Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. */
async function open(state, { width = 390, route = "/", ready } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // As chamadas ao agente são recusadas de propósito; o resto do console precisa ficar limpo.
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

/** Sem rolagem lateral: nem o documento nem elemento algum passa da largura da tela. */
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
    for (const el of document.querySelectorAll("div")) {
      const style = getComputedStyle(el);
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth - el.clientWidth > 1)
        return `rolagem interna ${el.scrollWidth - el.clientWidth}px`;
    }
    return "";
  });
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Nenhum "kcal"/"caloria" no texto visível nem nos nomes acessíveis. */
async function noKcal(page, where) {
  const found = await page.evaluate(() => {
    const text = document.body.innerText;
    const labels = [...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label")).join(" | ");
    const hit = (s) => {
      const m = /kcal|caloria/i.exec(s);
      return m ? s.slice(Math.max(0, m.index - 30), m.index + 10) : "";
    };
    return hit(text) || hit(labels);
  });
  if (found) throw Error(`${where}: calorias à vista ("${found}")`);
}
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
async function undo(page, message) {
  await toastWith(page, message).getByRole("button", { name: "Desfazer", exact: true }).click();
}
/** Rola o conteúdo da tela com a roda do mouse (dy > 0 = para baixo), como um gesto de rolagem. */
async function wheel(page, dy) {
  await page.mouse.move(195, 560);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(450);
}
/** Fecha o painel pelo "Fechar" do próprio cabeçalho e espera ele sumir (o esmaecimento leva 0,3 s). */
async function closeSheet(page, title) {
  const heading = page.getByRole("heading", { name: title, exact: true });
  await heading.locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(heading).toHaveCount(0);
}
/** Arrasta na horizontal sobre a faixa da semana (dx < 0 = para a esquerda). */
async function swipe(page, group, dx) {
  const box = await group.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + 1);
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/** Data do Diário no cabeçalho: a data longa acima do título ("Quinta, 24 de setembro"), como o web. */
const subtitle = (page, date) => page.getByText(longDate(date), { exact: true });
const diaryWeek = (page) => page.getByRole("group", { name: "Escolher o dia" });
const hojeWeek = (page) => page.getByRole("group", { name: "Esta semana" });
const fab = (page) => page.getByRole("button", { name: "Registro rápido", exact: true });
/** Fecha o menu "⋯" tocando fora dele (no canto, longe do menu). */
const closeMenu = (page) => page.getByRole("button", { name: "Fechar menu", exact: true }).click({ position: { x: 8, y: 8 } });
/** Aplicação de hoje para quem usa caneta. */
const INJECTION = {
  id: "inj-1",
  userId: "local",
  date: today,
  time: "08:30",
  createdAt: `${today}T08:30:00.000Z`,
  updatedAt: `${today}T08:30:00.000Z`,
  medication: "Semaglutida",
  concentrationMgPerMl: 5,
  syringeUnits: 100,
  units: 10,
  volumeMl: 0.1,
  doseMg: 0.5,
  site: "abdomen",
  notes: "",
};
const INJ_TITLE = injectionTitle(INJECTION);
const PEN = { weightLossPen: "sim", weightLossPenName: "Semaglutida", weightLossPenDose: "0,5 mg", weightLossPenPerMonth: 4 };
const sheetTitle = (page, title) => page.getByRole("heading", { name: title, exact: true });
async function shoot(page, file) {
  // Painéis e a faixa entram com esmaecimento: a foto espera a animação terminar.
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(shots, file) });
}

// ---------- Diário (390 px): semana, grupos, água, bem-estar, busca, faixa ----------
{
  const { page, context, errors } = await open(richState(), { route: "/diario", ready: diaryReady });
  await shoot(page, "390-diario-topo.png");
  await check("semana: 7 dias na faixa do Diário, hoje com aria-current=date", async () => {
    await expect(diaryWeek(page).getByRole("button")).toHaveCount(7);
    await expect(page.getByTestId(`week-chip-${today}`)).toHaveAttribute("aria-current", "date");
    await expect(page.getByTestId(`week-chip-${old}`)).not.toHaveAttribute("aria-current", "date");
  });
  await check('semana: nome acessível com "com água, refeição e combinado" e nunca só "Hoje"', async () => {
    await expect(page.getByTestId(`week-chip-${today}`)).toHaveAttribute("aria-label", /^Hoje, .+, com água, refeição e combinado$/);
    await expect(page.getByTestId(`week-chip-${old}`)).toHaveAttribute("aria-label", /^[a-zçá-]+, \d{1,2} de [a-zç]+, com refeição$/);
    await expect(page.getByTestId(`week-chip-${shiftDate(today, -1)}`)).toHaveAttribute("aria-label", /^[a-zçá-]+, \d{1,2} de [a-zç]+$/);
    await expect(diaryWeek(page).getByRole("button", { name: "Hoje", exact: true })).toHaveCount(0);
  });
  await check("semana (pontos do Diário): ponto verde só onde há registro, aro cinza nos outros dias, sem marca de falta", async () => {
    // Fidelidade visual (conceito 03): a faixa do Diário troca o anel de 3 segmentos por um ponto de 6 px.
    const dot = (date) => page.getByTestId(`week-dot-${date}`);
    const cssOf = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
    if ((await cssOf(dot(old), "backgroundColor")) !== rgb(palette.green500)) throw Error(`ponto do dia com refeição: ${await cssOf(dot(old), "backgroundColor")}`);
    const yesterday = shiftDate(today, -1);
    if ((await cssOf(dot(yesterday), "backgroundColor")) !== "rgba(0, 0, 0, 0)") throw Error("dia sem registro não deveria ter ponto cheio");
    if ((await cssOf(dot(yesterday), "borderTopColor")) !== rgb(palette.slate300)) throw Error(`aro: ${await cssOf(dot(yesterday), "borderTopColor")}`);
    const empty = await page.getByTestId(`week-chip-${yesterday}`).evaluate((el) => el.innerText);
    // Só símbolos de falta ou um "x" solto; "SEX" (sexta) não conta.
    if (/[×✕✗]|\bx\b/i.test(empty.replace(/\d/g, ""))) throw Error(`marca de falta: ${empty}`);
  });
  await check("semana: dia escolhido com aria-pressed=true na pílula azul-marinho; os outros false", async () => {
    await expect(page.getByTestId(`week-chip-${today}`)).toHaveAttribute("aria-pressed", "true");
    await expect(diaryWeek(page).locator('[aria-pressed="false"]')).toHaveCount(6);
    const pill = await page.getByTestId(`week-chip-${today}`).evaluate((el) => getComputedStyle(el).backgroundColor);
    if (pill !== rgb(palette.navy)) throw Error(`pílula ${pill}`);
  });
  await check("diário: grupos Café da manhã e Almoço como títulos, na ordem do dia", async () => {
    const titles = await page.getByTestId("diary-group").evaluateAll((els) => els.map((el) => el.querySelector('[role="heading"]')?.textContent));
    if (titles.join("|") !== "Café da manhã|Almoço") throw Error(titles.join("|"));
  });
  await check("diário: subtotal em todo grupo (conceito 03); o do Almoço soma os 2 registros", async () => {
    await expect(page.getByTestId("diary-subtotal")).toHaveCount(2);
    await expect(page.getByTestId("diary-subtotal").nth(0)).toHaveText(fmtKcal(MEALS.cafe.calories));
    await expect(page.getByTestId("diary-subtotal").nth(1)).toHaveText(fmtKcal(MEALS.almoco1.calories + MEALS.almoco2.calories));
  });
  await check("diário: kcal na linha só com 2 registros (com um, o subtotal já é o número dele)", async () => {
    for (const m of [MEALS.cafe, MEALS.almoco1, MEALS.almoco2])
      await expect(page.getByText(fmtKcal(m.calories), { exact: true })).toHaveCount(1);
  });
  await check('diário: tocar a linha edita ("Editar Almoço" ×2, "Editar Café da manhã" ×1)', async () => {
    await expect(page.getByRole("button", { name: "Editar Almoço", exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Editar Café da manhã", exact: true })).toHaveCount(1);
  });
  await check("diário: a refeição em frase (conceito 03, D6) e barra P/C/G de 5 px por linha (112×5)", async () => {
    const summary = mealSummary(MEALS.almoco1);
    await expect(page.getByText(summary.sentence, { exact: true })).toBeVisible();
    await expect(page.getByTestId("macro-split")).toHaveCount(3);
    const height = await page.getByTestId("macro-split").first().evaluate((el) => el.getBoundingClientRect().height);
    if (Math.round(height) !== 5) throw Error(`altura ${height}`);
  });
  await check('diário: "+" do grupo com "Adicionar ao almoço" e "Adicionar ao café da manhã"', async () => {
    await expect(page.getByRole("button", { name: "Adicionar ao almoço", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar ao café da manhã", exact: true })).toBeVisible();
  });
  await check('diário: pendentes só para refeições sem registro ("Adicionar lanche" e "Adicionar jantar")', async () => {
    const pending = page.getByRole("group", { name: "Adicionar refeição" }).getByRole("button");
    const names = await pending.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    if (names.join("|") !== "Adicionar lanche|Adicionar jantar") throw Error(names.join("|"));
  });
  await check("diário: sem as abas de filtro antigas nem a pílula do agente", async () => {
    await expect(page.getByText("Conversar com o agente")).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Filtrar registros" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Refeições", exact: true })).toHaveCount(0);
  });
  await check('água: "0,75 / 2 L" com os copos (3 de 10) e "+ 250 ml" soma no dia aberto', async () => {
    await expect(page.getByTestId("diary-water-total")).toHaveText("0,75");
    await expect(page.getByText("0,75 / 2 L", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "3 de 10 copos, 0,75 de 2 L", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Adicionar 250 ml de água", exact: true }).click();
    await expect(page.getByTestId("diary-water-total")).toHaveText("1");
    await expect(page.getByRole("img", { name: "5 de 10 copos, 1 de 2 L", exact: true })).toBeVisible();
    await expect(toastWith(page, "+250 ml registrados.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
  });
  await check('água: expandir mostra cada registro com o "⋯" (Editar e Excluir)', async () => {
    const toggle = page.getByRole("button", { name: "Registros de água (3)", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: /^Mais ações: Água das \d{2}:\d{2}$/ })).toHaveCount(3);
    await page.getByRole("button", { name: "Mais ações: Água das 08:00", exact: true }).click();
    for (const name of ["Editar", "Excluir"]) await expect(page.getByRole("menu").getByRole("menuitem", { name, exact: true })).toBeVisible();
    await closeMenu(page);
  });
  await check('água: "⋯" Excluir tira do total e "Desfazer" devolve', async () => {
    // O registro de 500 ml pelo id: a posição na lista depende da hora em que a checagem roda.
    await page.getByTestId("diary-entry-agua-2").getByRole("button", { name: "Mais ações: Água das 10:00", exact: true }).click();
    await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
    await expect(page.getByTestId("diary-water-total")).toHaveText("0,5");
    await undo(page, "Registro excluído; totais atualizados.");
    await expect(page.getByText("Registro restaurado.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("diary-water-total")).toHaveText("1");
  });
  await check('bem-estar: título "Bem" (sem anotação), barra "Humor 4 de 5", "7 h" de sono, "⋯" e "Registrar bem-estar"', async () => {
    const row = page.getByTestId("diary-entry-bem-1");
    await expect(row.getByText("Bem", { exact: true })).toBeVisible();
    await expect(row.getByRole("img", { name: "Humor 4 de 5, Bem", exact: true })).toBeVisible();
    await expect(row.getByText("7 h de sono", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Mais ações: Bem-estar das 09:00", exact: true }).click();
    for (const name of ["Editar", "Excluir"]) await expect(page.getByRole("menu").getByRole("menuitem", { name, exact: true })).toBeVisible();
    await closeMenu(page);
    await page.getByRole("button", { name: "Registrar bem-estar", exact: true }).click();
    await expect(sheetTitle(page, "Registrar bem-estar")).toBeVisible();
    await closeSheet(page, "Registrar bem-estar");
  });
  await check("diário: sem injeções para quem não usa caneta", async () => {
    await expect(page.getByRole("heading", { name: "Medicação injetável", exact: true })).toHaveCount(0);
  });
  await check('"⋯": Editar, "Repetir agora" (hoje) e Excluir', async () => {
    await page.getByRole("button", { name: "Mais ações: Almoço das 12:40", exact: true }).click();
    const menu = page.getByRole("menu");
    for (const name of ["Editar", "Repetir agora", "Excluir"]) await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    await closeMenu(page);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
  await check('"⋯" Excluir remove a linha e "Desfazer" devolve', async () => {
    await page.getByRole("button", { name: "Mais ações: Almoço das 12:40", exact: true }).click();
    await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Editar Almoço", exact: true })).toHaveCount(1);
    // O grupo continua com subtotal (agora o do registro que ficou).
    await expect(page.getByTestId("diary-subtotal")).toHaveCount(2);
    await expect(page.getByTestId("diary-subtotal").nth(1)).not.toHaveText(fmtKcal(MEALS.almoco1.calories + MEALS.almoco2.calories));
    await undo(page, "Registro excluído; totais atualizados.");
    await expect(page.getByRole("button", { name: "Editar Almoço", exact: true })).toHaveCount(2);
  });
  await check('"⋯" Repetir agora registra hoje em um toque e "Desfazer" tira', async () => {
    // Só os "⋯" das refeições (água e bem-estar também têm o seu). "Repetir agora" usa a categoria da
    // hora (defaultMealCategory): fora das janelas das refeições, à noite ou de madrugada, vira "Ceia".
    const rows = page.getByRole("button", { name: /^Mais ações: (Café da manhã|Almoço|Lanche|Jantar|Ceia) das / });
    await expect(rows).toHaveCount(3);
    await page.getByRole("button", { name: "Mais ações: Café da manhã das 07:30", exact: true }).click();
    await page.getByRole("menuitem", { name: "Repetir agora", exact: true }).click();
    const message = page.getByText(/^Refeição registrada: .+, hoje às \d{2}:\d{2}\.$/);
    await expect(message).toBeVisible();
    await expect(rows).toHaveCount(4);
    await message.locator("xpath=..").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(rows).toHaveCount(3);
  });
  await shoot(page, "390-diario.png");
  await check("balanço: [Meta] − [Consumido] = [Restam] com a frase para o leitor de tela", async () => {
    const consumed = MEALS.cafe.calories + MEALS.almoco1.calories + MEALS.almoco2.calories;
    const spoken = `Meta de 1.800 kcal menos ${consumed.toLocaleString("pt-BR")} kcal consumidas: restam ${(1800 - consumed).toLocaleString("pt-BR")} kcal.`;
    await expect(page.getByLabel(spoken, { exact: true })).toBeVisible();
    for (const word of ["Meta", "Consumido", "Restam"]) await expect(page.getByText(word, { exact: true })).toBeVisible();
  });
  await check('balanço: "(i) Como calculamos" abre o mesmo painel do Hoje', async () => {
    await page.getByRole("button", { name: "Como calculamos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Balanço energético", exact: true })).toBeVisible();
    await closeSheet(page, "Como calculamos");
    await expect(page.getByRole("heading", { name: "Balanço energético", exact: true })).toHaveCount(0);
  });
  await check("faixa: 56 px com kcal restantes e P/C/G aparece só depois de rolar", async () => {
    await expect(page.getByTestId("diary-band")).toHaveCount(0);
    await wheel(page, 700);
    const band = page.getByTestId("diary-band");
    await expect(band).toBeVisible();
    await expect(band).toContainText("kcal restantes");
    for (const part of ["Prot", "Carb", "Gord"]) await expect(band).toContainText(part);
    const box = await band.boundingBox();
    if (Math.round(box.height) !== 56) throw Error(`altura ${box.height}`);
  });
  await shoot(page, "390-diario-faixa.png");
  await check("faixa: some ao voltar ao topo", async () => {
    await wheel(page, -3000);
    await expect(page.getByTestId("diary-band")).toHaveCount(0);
  });
  await check('busca: a lupa busca em todo o histórico ("jantar arroz" → 1 resultado, agrupado pelo dia)', async () => {
    await page.getByRole("button", { name: "Buscar no diário", exact: true }).click();
    await expect(sheetTitle(page, "Buscar no diário")).toBeVisible();
    await page.getByLabel("Buscar em todo o diário", { exact: true }).fill("jantar arroz");
    await expect(page.getByRole("status").filter({ hasText: "1 resultado" })).toHaveCount(1);
    await expect(page.getByText(humanDate(old, today), { exact: true }).last()).toBeVisible();
  });
  await check("busca: escolher o resultado abre o dia dele e rola até o registro destacado", async () => {
    await page.getByRole("button", { name: /^Jantar, .+, às 20:00$/ }).click();
    await expect(sheetTitle(page, "Buscar no diário")).toHaveCount(0);
    await expect(subtitle(page, old)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jantar", exact: true })).toBeVisible();
    await expect(page.getByTestId("diary-entry-jantar-antigo")).toBeInViewport();
    await expect(page.getByTestId(`week-chip-${old}`)).toHaveAttribute("aria-pressed", "true");
  });
  await check('dia anterior: o "⋯" diz "Repetir hoje"', async () => {
    await page.getByRole("button", { name: "Mais ações: Jantar das 20:00", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Repetir hoje", exact: true })).toBeVisible();
    await closeMenu(page);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
  await check("semana: deslizar para a direita volta 7 dias; para a esquerda avança, sem passar de hoje", async () => {
    await swipe(page, diaryWeek(page), 140);
    await expect(subtitle(page, shiftDate(old, -7))).toBeVisible();
    await swipe(page, diaryWeek(page), -140);
    await expect(subtitle(page, old)).toBeVisible();
    await swipe(page, diaryWeek(page), -140);
    await expect(subtitle(page, today)).toBeVisible();
    await swipe(page, diaryWeek(page), -140);
    await expect(subtitle(page, today)).toBeVisible();
  });
  await check('semana: tocar um dia abre esse dia; "Escolher data no calendário" abre as rodas', async () => {
    await page.getByTestId(`week-chip-${old}`).click();
    await expect(subtitle(page, old)).toBeVisible();
    await page.getByRole("button", { name: "Escolher data no calendário", exact: true }).click();
    await expect(sheetTitle(page, "Data dos registros")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar data", exact: true })).toBeVisible();
    await closeSheet(page, "Data dos registros");
  });
  await check("registro rápido aberto no Diário usa o dia aberto (Água com a data dele)", async () => {
    await fab(page).click();
    await expect(sheetTitle(page, "Registro rápido")).toBeVisible();
    await page.getByRole("button", { name: "Água", exact: true }).click();
    // Data e horário ficam recolhidos em "Hoje · agora ▸ alterar" (HOJE-03).
    await page.getByRole("button", { name: "Alterar data e horário", exact: true }).click();
    await expect(page.getByRole("button", { name: `Data: ${formatDate(old)}`, exact: true })).toBeVisible();
    await expect(page.getByLabel("Volume (ml)", { exact: true })).toBeVisible();
    await closeSheet(page, "Registrar água");
  });
  await check('pendente "Adicionar jantar" (hoje) abre a refeição já como Jantar', async () => {
    await page.getByTestId(`week-chip-${today}`).click();
    await expect(subtitle(page, today)).toBeVisible();
    await page.getByRole("button", { name: "Adicionar jantar", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Jantar, Hoje, \d{2}:\d{2} — alterar tipo, data ou horário$/ })).toBeVisible({ timeout: 20000 });
  });
  await check("diário (390): sem rolagem lateral", async () => {
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    await noSideScroll(page);
  });
  await check("diário (390): sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Hoje (390 px): semana, linha do tempo, datas e registro rápido ----------
{
  const { page, context, errors } = await open(richState());
  await check('hoje: semana "Esta semana" (segunda a domingo) com 7 dias e o dia de hoje escolhido', async () => {
    await expect(hojeWeek(page).getByRole("button")).toHaveCount(7);
    await expect(hojeWeek(page).getByTestId(`week-chip-${today}`)).toHaveAttribute("aria-label", /^Hoje, .+, com água, refeição e combinado$/);
  });
  await check("hoje: com registros, o Resumo do dia aparece (não o \"Comece seu dia\")", async () => {
    await expect(page.getByRole("heading", { name: "Comece seu dia", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("next-step")).toBeVisible();
  });
  await check("hoje: linha do tempo com horário, tipo, resumo e kcal; editar pela linha", async () => {
    const timeline = page.getByTestId("meals-timeline");
    await timeline.scrollIntoViewIfNeeded();
    for (const m of [MEALS.cafe, MEALS.almoco1, MEALS.almoco2]) {
      await expect(timeline.getByText(m.time, { exact: true })).toBeVisible();
      await expect(timeline.getByText(mealSummary(m).sentence, { exact: true })).toBeVisible();
      // KcalStat do cartão (conceito 01): "223" sobre "kcal", com o nome acessível "223 kcal".
      await expect(timeline.getByLabel(fmtKcal(m.calories), { exact: true })).toBeVisible();
    }
    await expect(timeline.getByRole("button", { name: "Editar Almoço", exact: true })).toHaveCount(2);
    await expect(timeline.getByRole("button", { name: "Editar Café da manhã", exact: true })).toHaveCount(1);
  });
  await check('hoje: um único atalho pendente ("Jantar · 19:00 + Adicionar") e o atalho "Diário"', async () => {
    const timeline = page.getByTestId("meals-timeline");
    const slots = timeline.getByRole("button", { name: /^Adicionar / });
    await expect(slots).toHaveCount(1);
    await expect(slots).toHaveAttribute("aria-label", "Adicionar jantar");
    await expect(timeline.getByText("19:00", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver todas no Diário", exact: true })).toBeVisible();
  });
  await shoot(page, "390-hoje.png");
  await check("registro rápido: folha com Refeição, Foto do prato, Água, Bem-estar e Peso (sem Aplicação)", async () => {
    await fab(page).click();
    await expect(sheetTitle(page, "Registro rápido")).toBeVisible();
    for (const name of ["Refeição", "Foto do prato", "Água", "Bem-estar", "Peso"])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicação", exact: true })).toHaveCount(0);
  });
  await check("registro rápido: grade 3×2 (3 por linha, alvos ≥ 44 px)", async () => {
    const boxes = [];
    for (const name of ["Refeição", "Foto do prato", "Água", "Bem-estar", "Peso"])
      boxes.push(await page.getByRole("button", { name, exact: true }).boundingBox());
    if (!(Math.abs(boxes[0].y - boxes[2].y) < 2 && boxes[3].y > boxes[0].y + 40 && Math.abs(boxes[3].y - boxes[4].y) < 2))
      throw Error(boxes.map((b) => `${Math.round(b.x)},${Math.round(b.y)}`).join(" "));
    if (boxes.some((b) => b.width < 44 || b.height < 44)) throw Error("alvo menor que 44 px");
  });
  await check('registro rápido: "Repetir" com até 3 pratos ("Repetir agora: …, de …")', async () => {
    const cards = page.getByRole("button", { name: /^Repetir agora: / });
    const names = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    if (!names.length || names.length > 3) throw Error(`${names.length} pratos`);
    for (const name of names) if (!/^Repetir agora: .+, (de .+|favorito)$/.test(name)) throw Error(name);
  });
  await shoot(page, "390-registro-rapido.png");
  await check('registro rápido: "Repetir agora" registra hoje em um toque e "Desfazer" tira', async () => {
    // Refeições do dia na linha do tempo: um "Editar …" por registro (o conceito tirou a contagem "N registradas").
    const mealRows = page.getByTestId("meals-timeline").getByRole("button", { name: /^Editar / });
    await page.getByRole("button", { name: /^Repetir agora: / }).first().click();
    await expect(sheetTitle(page, "Registro rápido")).toHaveCount(0);
    const message = page.getByText(/^Refeição registrada: .+, hoje às \d{2}:\d{2}\.$/);
    await expect(message).toBeVisible();
    await expect(mealRows).toHaveCount(4);
    await message.locator("xpath=..").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(mealRows).toHaveCount(3);
  });
  await check("peso: começa no último peso (72), ±0,1 kg e mostra só o valor", async () => {
    await fab(page).click();
    await page.getByRole("button", { name: "Peso", exact: true }).click();
    const weight = page.getByLabel("Peso em kg", { exact: true });
    await expect(weight).toHaveValue("72");
    await page.getByRole("button", { name: "Aumentar 0,1 kg", exact: true }).click();
    await expect(weight).toHaveValue("72,1");
    await page.getByRole("button", { name: "Diminuir 0,1 kg", exact: true }).click();
    await page.getByRole("button", { name: "Aumentar 0,1 kg", exact: true }).click();
    await expect(weight).toHaveValue("72,1");
    const sheet = await page.getByRole("heading", { name: "Peso", exact: true }).locator("xpath=../..").innerText();
    if (/[+−]\s?\d|desde|tendência|IMC/i.test(sheet)) throw Error(`sheet mostra variação: ${sheet}`);
  });
  await shoot(page, "390-peso.png");
  await check('peso: "Salvar peso" → "Peso salvo: 72,1 kg." com "Desfazer"', async () => {
    await page.getByRole("button", { name: "Salvar peso", exact: true }).click();
    await expect(page.getByText("Peso salvo: 72,1 kg.", { exact: true })).toBeVisible();
    await undo(page, "Peso salvo: 72,1 kg.");
    await expect(page.getByText("Peso desfeito.", { exact: true })).toBeVisible();
  });
  await check("hoje: tocar um dia da semana abre o Diário nesse dia", async () => {
    await hojeWeek(page).getByTestId(`week-chip-${weekPast}`).click();
    await expect(diaryReady(page)).toBeVisible();
    await expect(subtitle(page, weekPast)).toBeVisible();
  });
  await check("datas: depois de ver um dia antigo, de volta ao Hoje, o registro rápido de água usa hoje", async () => {
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await expect(hojeWeek(page)).toBeVisible();
    await fab(page).click();
    await page.getByRole("button", { name: "Água", exact: true }).click();
    await page.getByRole("button", { name: "Alterar data e horário", exact: true }).click();
    await expect(page.getByRole("button", { name: `Data: ${formatDate(today)}`, exact: true })).toBeVisible();
    await closeSheet(page, "Registrar água");
  });
  await check("datas: voltar ao Hoje descarta o dia aberto no Diário (a aba Diário reabre em hoje)", async () => {
    await hojeWeek(page).getByTestId(`week-chip-${weekPast}`).click();
    await expect(subtitle(page, weekPast)).toBeVisible();
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await expect(hojeWeek(page)).toBeVisible();
    await page.getByRole("tab", { name: "Diário", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    await expect(subtitle(page, today)).toBeVisible();
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await expect(hojeWeek(page)).toBeVisible();
  });
  await check('datas: "Diário" (Ver todas no Diário) abre o Diário em hoje (o Diário não guarda o dia antigo)', async () => {
    await page.getByRole("button", { name: "Ver todas no Diário", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    await expect(subtitle(page, today)).toBeVisible();
  });
  await check("hoje (390): sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("peso: o SQLite volta a 72 kg depois do Desfazer", async () => {
    const state = await readState(page, "peso");
    const last = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (last?.weight !== 72) throw Error(`peso salvo ${last?.weight}`);
  });
  await context.close();
}

// ---------- Registro rápido: Foto do prato e Aplicação (caneta) ----------
{
  const { page, context, errors } = await open(richState(PEN, {
    injections: [INJECTION],
  }));
  await check('caneta: registro rápido com "Aplicação" (6 atalhos em 3×2)', async () => {
    await fab(page).click();
    await expect(page.getByRole("button", { name: "Aplicação", exact: true })).toBeVisible();
    const [peso, aplicacao] = [
      await page.getByRole("button", { name: "Peso", exact: true }).boundingBox(),
      await page.getByRole("button", { name: "Aplicação", exact: true }).boundingBox(),
    ];
    if (Math.abs(peso.y - aplicacao.y) > 2) throw Error("Aplicação fora da 2ª linha");
  });
  await check('caneta: "Aplicação" abre a calculadora "Seringa e dose"', async () => {
    await page.getByRole("button", { name: "Aplicação", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seringa e dose", exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
  });
  await check('caneta: Diário com a aplicação como título, detalhe e "Registrar aplicação"', async () => {
    await page.goto(url + "/diario");
    await expect(diaryReady(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Medicação injetável", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: INJ_TITLE, exact: true })).toBeVisible();
    await expect(page.getByText(injectionDetail(INJECTION), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Mais ações: aplicação ${INJ_TITLE}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar aplicação", exact: true })).toBeVisible();
  });
  await check('caneta: "⋯" Excluir a aplicação + "Desfazer"', async () => {
    await page.getByRole("button", { name: `Mais ações: aplicação ${INJ_TITLE}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
    await expect(page.getByRole("heading", { name: INJ_TITLE, exact: true })).toHaveCount(0);
    await undo(page, "Aplicação excluída.");
    await expect(page.getByRole("heading", { name: INJ_TITLE, exact: true })).toBeVisible();
  });
  await check('"Foto do prato" → Galeria abre uma refeição nova com a foto anexada', async () => {
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await fab(page).click();
    await page.getByRole("button", { name: "Foto do prato", exact: true }).click();
    await expect(sheetTitle(page, "Foto do prato")).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Galeria", exact: true }).click()]);
    await chooser.setFiles({ name: "prato.png", mimeType: "image/png", buffer: PHOTO });
    await expect(page.getByRole("img", { name: "Foto da refeição a registrar", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Foto do prato, toque para trocar a foto", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^.+, Hoje, \d{2}:\d{2} — alterar tipo, data ou horário$/ })).toBeVisible();
  });
  await check("caneta e foto: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Dia em branco: "Comece seu dia" ----------
{
  const { page, context, errors } = await open(blankState());
  const now = localTime();
  const period = dayPeriod(now);
  await check(`em branco: "Comece seu dia" com "${period.greeting}" e ilustração SVG local`, async () => {
    const card = page.getByTestId("start-card");
    await expect(card.getByRole("heading", { name: "Comece seu dia", exact: true })).toBeVisible();
    await expect(card.getByText(period.greeting, { exact: true })).toBeVisible();
    if ((await card.locator("svg").count()) < 1) throw Error("sem SVG");
    if (await card.locator("img").count()) throw Error("imagem externa");
    await expect(page.getByTestId("next-step")).toHaveCount(0);
  });
  await check("em branco: 3 atalhos de um toque (refeição do horário, +250 ml, bem-estar)", async () => {
    const category = defaultMealCategory(localTime(), stateFixture().profile);
    await expect(page.getByRole("button", { name: `Registrar ${mealWord(category)}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar 250 ml de água", exact: true })).toBeVisible();
    await expect(page.getByTestId("start-card").getByRole("button", { name: "Registrar bem-estar", exact: true })).toBeVisible();
  });
  await check('em branco: nada de "ainda não comeu"', async () => {
    const text = await page.locator("body").innerText();
    if (/ainda não comeu/i.test(text)) throw Error("cobrança na tela");
  });
  await shoot(page, "390-hoje-em-branco.png");
  await check("em branco: +250 ml registra em um toque e o cartão dá lugar ao próximo passo", async () => {
    // O cartão de água fica oculto por padrão (Editar Hoje): o total vem do tile "Água" do topo.
    await expect(page.getByRole("button", { name: /^Água: 0 L / })).toBeVisible();
    await page.getByRole("button", { name: "Registrar 250 ml de água", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Água: 0,25 L / })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comece seu dia", exact: true })).toHaveCount(0);
    await expect(toastWith(page, "+250 ml registrados.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
  });
  await check("em branco: a semana só acende os segmentos do que foi registrado (água hoje)", async () => {
    await expect(hojeWeek(page).getByTestId(`week-chip-${today}`)).toHaveAttribute("aria-label", /^Hoje, .+, com água$/);
  });
  await check("em branco: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context } = await open(blankState({ fluidRestriction: "sim" }));
  await check('restrição hídrica: o atalho vira "Água: informar volume" e abre o formulário de volume', async () => {
    await expect(page.getByRole("button", { name: "Registrar 250 ml de água", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Água: informar volume", exact: true }).click();
    await expect(sheetTitle(page, "Registrar água")).toBeVisible();
    await expect(page.getByLabel("Volume (ml)", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar registro", exact: true })).toBeVisible();
  });
  await context.close();
}

// ---------- Calorias ocultas ----------
{
  const { page, context, errors } = await open(richState({ hideCalories: true }), { route: "/diario", ready: diaryReady });
  await check('calorias ocultas: Diário sem equação, sem "(i)" e sem kcal no texto e nos nomes', async () => {
    await expect(page.getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Como calculamos" })).toHaveCount(0);
    await expect(page.getByText("Restam", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("diary-subtotal")).toHaveCount(0);
    await noKcal(page, "diário");
  });
  await check("calorias ocultas: a faixa mostra só P/C/G", async () => {
    await wheel(page, 700);
    await expect(page.getByTestId("diary-band")).toBeVisible();
    await expect(page.getByTestId("diary-band")).toContainText("Prot");
    await noKcal(page, "faixa");
  });
  await shoot(page, "390-diario-calorias-ocultas.png");
  await check("calorias ocultas: Hoje (linha do tempo) e registro rápido sem kcal", async () => {
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await expect(page.getByTestId("meals-timeline")).toBeVisible();
    await noKcal(page, "hoje");
    await fab(page).click();
    await expect(sheetTitle(page, "Registro rápido")).toBeVisible();
    await noKcal(page, "registro rápido");
  });
  await check("calorias ocultas: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- 360 px ----------
{
  const big = meal("almoco-grande", today, "13:00", "Almoço", [{ food: ARROZ, grams: 1500 }]);
  const state = richState({}, {});
  state.diary = [...state.diary, { ...big, userId: state.userId }];
  const { page, context, errors } = await open(state, { width: 360, route: "/diario", ready: diaryReady });
  await check("360: chips da semana com pelo menos 44 × 64 px", async () => {
    const sizes = await diaryWeek(page).getByRole("button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
    if (sizes.some(([w, h]) => w < 44 || h < 64)) throw Error(sizes.map(([w, h]) => `${w.toFixed(1)}×${h}`).join(" "));
  });
  await check('360 acima do planejado: "Acima do planejado" em cor neutra, nunca vermelho', async () => {
    const label = page.getByText("Acima do planejado", { exact: true });
    await expect(label).toBeVisible();
    const color = await label.locator("xpath=..").evaluate((el) => getComputedStyle(el.firstElementChild).color);
    if (color !== rgb(palette.slate700)) throw Error(`cor ${color}`);
    await expect(page.getByLabel(/kcal acima do planejado\.$/)).toHaveCount(1);
  });
  await check("360: sem rolagem lateral no Diário (semana, grupos, água)", async () => {
    await page.getByRole("button", { name: "Registros de água (2)", exact: true }).click();
    await noSideScroll(page);
  });
  await shoot(page, "360-diario.png");
  await check("360: sem rolagem lateral no Hoje (semana e linha do tempo)", async () => {
    await page.getByRole("tab", { name: "Hoje", exact: true }).click();
    await expect(hojeWeek(page)).toBeVisible();
    await noSideScroll(page);
  });
  await check("360: registro rápido sem rolagem lateral e com alvos ≥ 44 px", async () => {
    await fab(page).click();
    await expect(sheetTitle(page, "Registro rápido")).toBeVisible();
    await noSideScroll(page);
    for (const name of ["Refeição", "Foto do prato", "Água", "Bem-estar", "Peso"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      if (box.width < 44 || box.height < 44) throw Error(`${name} ${box.width}×${box.height}`);
    }
  });
  await shoot(page, "360-registro-rapido.png");
  await check("360: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context } = await open(blankState(), { width: 360 });
  await check('360: "Comece seu dia" empilha os atalhos sem rolagem lateral', async () => {
    const [a, b] = [
      await page.getByRole("button", { name: "Registrar 250 ml de água", exact: true }).boundingBox(),
      await page.getByTestId("start-card").getByRole("button", { name: "Registrar bem-estar", exact: true }).boundingBox(),
    ];
    if (!(b.y > a.y + 20)) throw Error("atalhos lado a lado a 360 px");
    await noSideScroll(page);
  });
  await shoot(page, "360-hoje-em-branco.png");
  await context.close();
}

// ---------- 320 px: a semana do Hoje cabe inteira (o web chegou a passar 2–3 px) ----------
{
  const { page, context, errors } = await open(richState(), { width: 320 });
  await check("320: semana do Hoje com 7 dias dentro da faixa, nada cortado e sem rolagem lateral", async () => {
    const fit = await hojeWeek(page).evaluate((strip) => {
      const box = strip.getBoundingClientRect();
      const chips = [...strip.querySelectorAll('[role="button"]')];
      const problems = [];
      if (box.left < 0 || box.right > window.innerWidth) problems.push(`faixa ${box.left.toFixed(1)}..${box.right.toFixed(1)}`);
      for (const chip of chips) {
        const c = chip.getBoundingClientRect();
        const name = chip.getAttribute("aria-label") ?? "";
        if (c.left < box.left - 0.5 || c.right > box.right + 0.5) problems.push(`${name}: ${c.left.toFixed(1)}..${c.right.toFixed(1)}`);
        if (chip.scrollWidth > chip.clientWidth) problems.push(`${name}: conteúdo mais largo que o dia`);
        // Anel e textos (dia da semana, número) dentro do dia, que corta o que passar.
        for (const part of chip.querySelectorAll("svg, div")) {
          const p = part.getBoundingClientRect();
          if (p.width && (p.left < c.left - 0.5 || p.right > c.right + 0.5))
            problems.push(`${name}: ${part.tagName} "${(part.textContent ?? "").slice(0, 8)}" fora do dia`);
        }
      }
      return { count: chips.length, problems };
    });
    if (fit.count !== 7) throw Error(`${fit.count} dias na faixa`);
    if (fit.problems.length) throw Error(fit.problems.join(" | "));
    await noSideScroll(page);
  });
  await shoot(page, "320-hoje-semana.png");
  await check("320: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
