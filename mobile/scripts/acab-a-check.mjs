// Verificação do lote "acabamento A" (espelho do web no app) no export web, a 390 px: anel do Hoje que
// alterna restantes/consumidas, "Seu dia" com calorias ocultas e a rosca P/C/G do Diário, folha de água
// (±50 ml, volumes comuns, "Alterar data e horário"), folha de bem-estar (rostos em rádio, sono, marcadores,
// gravados no SQLite e mostrados no Diário), "Editar Hoje" (subir, ocultar, Desfazer, persistência e os
// atalhos do topo com seções ocultas), gráfico da água com a linha da meta e o check, celebração ao bater a
// meta, aria-selected na barra de abas e nenhum erro de página ou console. Fotografa as telas.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/acab-a
//   node --import tsx scripts/acab-a-check.mjs dist/acab-a [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { diarySchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/acab-a");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "acab-a-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "acab-a-seed-"));
const PORT = 3233;
const WIDTH = 390;
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
const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const food = (name) => {
  const found = taco.find((f) => f.name === name);
  if (!found) throw Error(`sem ${name} na TACO`);
  return found;
};
const ARROZ = food("Arroz, integral, cozido");
const FEIJAO = food("Feijão, carioca, cozido");
const PAO = food("Pão, trigo, francês");
const OVO = food("Ovo, de galinha, inteiro, cozido/10minutos");

function entry(fields) {
  return diarySchema.parse({
    userId: "local",
    createdAt: `${fields.date}T${fields.time}:00.000Z`,
    updatedAt: `${fields.date}T${fields.time}:00.000Z`,
    description: "",
    ...fields,
  });
}
const meal = (id, time, category, items) =>
  entry({ id, date: today, time, type: "refeicao", title: category, categoryTag: category, items, ...mealTotals(items) });
const water = (id, time, amountMl, date = today) => entry({ id, date, time, type: "agua", title: "Água", amountMl });

/** Café e almoço hoje, 750 ml de água, nenhum bem-estar e um combinado ainda por fazer. */
/** Bem-estar e Água ficam ocultos por padrão no Hoje: as seções que testam os dois cartões os deixam à vista. */
const VISIBLE_MOOD_WATER = "mood,water";
function baseState(change = {}, { waterMl = [250, 500] } = {}) {
  const state = stateFixture();
  const diary = [
    meal("cafe", "07:30", "Café da manhã", [
      { food: PAO, grams: 50 },
      { food: OVO, grams: 50 },
    ]),
    meal("almoco", "12:00", "Almoço", [
      { food: ARROZ, grams: 100 },
      { food: FEIJAO, grams: 100 },
    ]),
    ...waterMl.map((ml, i) => water(`agua-${i + 1}`, `0${8 + i}:00`, ml)),
  ].map((e) => ({ ...e, userId: state.userId }));
  return {
    ...state,
    profile: { ...state.profile, ...change },
    diary,
    habits: [
      { id: "h1", title: "Caminhar depois do almoço", timeOfDay: "13:00", createdDate: shiftDate(today, -10), completedDates: [] },
    ],
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

/** Grava `bytes` no arquivo SQLite do expo-sqlite (OPFS), mantendo o cabeçalho de 4 KB. */
async function writeSqlite(page, bytes) {
  await page.evaluate(async (data) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (!new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) continue;
      const writer = await handle.createWritable();
      const next = new Uint8Array(4096 + data.length);
      next.set(content.slice(0, 4096));
      next.set(data, 4096);
      await writer.write(next);
      await writer.close();
      return;
    }
    throw Error("Arquivo SQLite de teste não encontrado");
  }, bytes);
}

let seeds = 0;
/** Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. */
async function open(state, { route = "/", ready } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  // 2x: as fotos servem para julgar detalhes pequenos (segmentos do anel, linha da meta).
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
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
  await writeSqlite(page, [...readFileSync(seedFile)]);
  await page.goto(url + route);
  await expect(ready ? ready(page) : hojeWeek(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
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
const hojeWeek = (page) => page.getByRole("group", { name: "Esta semana" });
const diaryReady = (page) => page.getByRole("heading", { name: "Meu diário", exact: true });
const fab = (page) => page.getByRole("button", { name: "Registro rápido", exact: true });
const sheetTitle = (page, title) => page.getByRole("heading", { name: title, exact: true });
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const ring = (page) => page.getByTestId("calories-total");
const moodPrompt = (page) => page.getByRole("heading", { name: "Como você está?", exact: true });
/** Topo (y) de um elemento na página, para comparar a ordem das seções. */
const top = async (locator) => (await locator.boundingBox())?.y ?? Number.NaN;
async function closeSheet(page, title) {
  const heading = sheetTitle(page, title);
  await heading.locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(heading).toHaveCount(0);
}
async function shoot(page, file, locator) {
  // Painéis entram com esmaecimento: a foto espera a animação terminar.
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file) });
}

// ---------- Hoje: anel, abas, água, celebração e bem-estar ----------
{
  const { page, context, errors } = await open(baseState({ homeLayout: VISIBLE_MOOD_WATER }));
  await check("anel: botão que alterna restantes ↔ consumidas (nome acessível acompanha)", async () => {
    await expect(ring(page)).toHaveAttribute("role", "button");
    await expect(ring(page)).toHaveAttribute("aria-label", /kcal, \d+% da meta\. Mostrar kcal consumidas$/);
    await expect(ring(page).getByText("kcal restantes", { exact: true })).toBeVisible();
    await ring(page).click();
    await expect(ring(page).getByText("kcal consumidas", { exact: true })).toBeVisible();
    await expect(ring(page)).toHaveAttribute("aria-label", /\. Mostrar kcal restantes$/);
    await shoot(page, "390-anel-consumidas.png", page.getByTestId("calories-total"));
    await ring(page).click();
    await expect(ring(page).getByText("kcal restantes", { exact: true })).toBeVisible();
  });
  await check('anel: "Como calculamos" aparece com o anel de energia', async () => {
    await expect(page.getByRole("button", { name: "Como calculamos", exact: true })).toBeVisible();
  });
  await shoot(page, "390-hoje-topo.png");
  await check('abas: a aba ativa expõe aria-selected="true" (as outras "false")', async () => {
    await expect(page.getByRole("tab", { name: "Hoje", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Diário", exact: true })).toHaveAttribute("aria-selected", "false");
  });
  await check('água: gráfico de 72 px com a linha tracejada da meta e a legenda "Meta 2 L"', async () => {
    await expect(page.getByTestId("water-goal-line")).toHaveCount(1);
    await expect(page.getByText("Meta 2 L", { exact: true })).toBeVisible();
    await expect(page.getByTestId("water-chart")).toHaveAttribute("aria-label", /; meta de 2 L por dia, atingida em 0 dias$/);
    const plot = await page.getByTestId("water-goal-line").locator("xpath=..").boundingBox();
    if (Math.round(plot.height) !== 72) throw Error(`altura do gráfico ${plot.height}`);
  });
  await check("folha de água: número grande, −/+ 50 ml, volume comum pressionado", async () => {
    await page.getByRole("button", { name: "Registrar água", exact: true }).click();
    await expect(sheetTitle(page, "Registrar água")).toBeVisible();
    const volume = page.getByLabel("Volume (ml)", { exact: true });
    await expect(volume).toHaveValue("250");
    await page.getByRole("button", { name: "Aumentar 50 ml", exact: true }).click();
    await expect(volume).toHaveValue("300");
    await page.getByRole("button", { name: "Diminuir 50 ml", exact: true }).click();
    await page.getByRole("button", { name: "Diminuir 50 ml", exact: true }).click();
    await expect(volume).toHaveValue("200");
    await expect(page.getByRole("button", { name: "200 ml", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "500 ml", exact: true }).click();
    await expect(volume).toHaveValue("500");
    await expect(page.getByRole("button", { name: "500 ml", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "200 ml", exact: true })).toHaveAttribute("aria-pressed", "false");
    const fontSize = await volume.evaluate((el) => getComputedStyle(el).fontSize);
    if (fontSize !== "44px") throw Error(`fonte ${fontSize}`);
    for (const name of ["Diminuir 50 ml", "Aumentar 50 ml"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      if (Math.round(box.width) !== 48 || Math.round(box.height) !== 48) throw Error(`${name} ${box.width}×${box.height}`);
    }
  });
  await check('folha de água: "Hoje · agora" e "Alterar data e horário" revela Data e Horário', async () => {
    await expect(page.getByText("Hoje · agora", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Data: / })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Alterar data e horário", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.getByRole("button", { name: "Recolher data e horário", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: /^Data: \d{2}\/\d{2}\/\d{4}$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Horário: \d{2}:\d{2}$/ })).toBeVisible();
  });
  await shoot(page, "390-folha-agua.png");
  await check('folha de água: "Salvar registro" soma 500 ml ao total ("Registro salvo.")', async () => {
    await page.getByRole("button", { name: "Salvar registro", exact: true }).click();
    await expect(sheetTitle(page, "Registrar água")).toHaveCount(0);
    await expect(page.getByText("Registro salvo.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("water-total")).toHaveText("1,25 L");
  });
  await check('celebração: cruzar a meta de água acende o brilho no cartão e "meta alcançada"', async () => {
    const card = page.getByTestId("water-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId("celebration-glow")).toHaveCount(0);
    await page.getByRole("button", { name: "Garrafa +500 ml", exact: true }).click();
    await expect(page.getByTestId("water-total")).toHaveText("1,75 L");
    await expect(card.getByTestId("celebration-glow")).toHaveCount(0);
    await page.getByRole("button", { name: "Garrafa +500 ml", exact: true }).click();
    await expect(card.getByTestId("celebration-glow")).toHaveCount(1);
    await expect(card.getByText("de 2 L · meta alcançada", { exact: true })).toBeVisible();
    // O brilho fica por fora do cartão: a foto leva uma margem e o cartão sobe para longe do aviso.
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(350);
    const box = await card.boundingBox();
    await page.screenshot({
      path: path.join(shots, "390-agua-celebra.png"),
      clip: { x: Math.max(0, box.x - 14), y: Math.max(0, box.y - 14), width: box.width + 28, height: box.height + 28 },
    });
    await expect(card.getByTestId("celebration-glow")).toHaveCount(0, { timeout: 4000 });
  });
  await check("gráfico: dia que bateu a meta ganha o check (e o nome acessível conta 1 dia)", async () => {
    await expect(page.getByTestId("water-met-check")).toHaveCount(1);
    await expect(page.getByTestId("water-chart")).toHaveAttribute("aria-label", /atingida em 1 dia$/);
    await shoot(page, "390-agua-grafico.png", page.getByTestId("water-chart"));
  });
  await check("celebração: marcar o último combinado acende o brilho em Combinados", async () => {
    const card = page.getByTestId("habits-card");
    await card.scrollIntoViewIfNeeded();
    // Nome acessível como no web: título, horário e a semana ("…, às 13:00, 0 de 3 dias nesta semana").
    await page.getByRole("checkbox", { name: /^Caminhar depois do almoço, / }).click();
    await expect(card.getByTestId("celebration-glow")).toHaveCount(1);
    await expect(card.getByText("Tudo feito hoje", { exact: true })).toBeVisible();
  });
  await check("folha de bem-estar: rostos em radiogroup, sono em chips, \"Outro valor\" e marcadores", async () => {
    await fab(page).click();
    await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
    await expect(sheetTitle(page, "Registrar bem-estar")).toBeVisible();
    const group = page.getByRole("radiogroup", { name: "Como você se sente?" });
    await expect(group.getByRole("radio")).toHaveCount(5);
    await expect(group.getByRole("radio", { name: "Regular", exact: true })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "Muito bem", exact: true }).click();
    await expect(group.getByRole("radio", { name: "Muito bem", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(group.getByRole("radio", { name: "Regular", exact: true })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Outro valor", exact: true }).click();
    await expect(page.getByLabel("Horas de sono", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "8 h", exact: true }).click();
    await expect(page.getByLabel("Horas de sono", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "8 h", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const tag of ["Calma", "Disposição"]) {
      await page.getByRole("button", { name: tag, exact: true }).click();
      await expect(page.getByRole("button", { name: tag, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByRole("group", { name: "Marcadores (opcional)" })).toBeVisible();
    const face = await group.getByRole("radio").first().boundingBox();
    if (face.height < 44) throw Error(`rosto com ${face.height} px de altura`);
  });
  await shoot(page, "390-folha-bem-estar.png");
  await check('folha de bem-estar: salvar mostra o rosto, o sono e até 2 marcadores no cartão do Hoje', async () => {
    await page.getByRole("button", { name: "Salvar registro", exact: true }).click();
    await expect(sheetTitle(page, "Registrar bem-estar")).toHaveCount(0);
    await expect(page.getByText("Registro salvo.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Muito bem", exact: true })).toBeVisible();
    await expect(page.getByText("Sono 8 h", { exact: true })).toBeVisible();
    for (const tag of ["Calma", "Disposição"]) await expect(page.getByText(tag, { exact: true })).toBeVisible();
  });
  await shoot(page, "390-hoje-bem-estar.png", page.getByRole("heading", { name: "Muito bem", exact: true }).locator("xpath=../.."));
  await check('diário: linha "Muito bem" (conceito 03) com o rosto 😄, a barra 5 de 5, o sono e marcadores em rosa', async () => {
    await page.getByRole("tab", { name: "Diário", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Diário", exact: true })).toHaveAttribute("aria-selected", "true");
    const row = page.getByTestId(/^diary-entry-/).filter({ has: page.getByRole("img", { name: "Humor 5 de 5, Muito bem", exact: true }) });
    await expect(row.getByText("Muito bem", { exact: true })).toBeVisible();
    await expect(row.getByText("8 h de sono", { exact: true })).toBeVisible();
    await expect(row.getByText("😄", { exact: true })).toBeVisible();
    const chip = row.getByText("Calma", { exact: true });
    await expect(chip).toBeVisible();
    await expect(row.getByText("Disposição", { exact: true })).toBeVisible();
    const bg = await chip.locator("xpath=..").evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== "rgb(253, 242, 248)") throw Error(`fundo do marcador ${bg}`);
    await row.scrollIntoViewIfNeeded();
    await shoot(page, "390-diario-bem-estar.png", row);
  });
  await check("hoje e diário: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("SQLite: bem-estar com rating 5, sono 8 h e marcadores; água com o registro de 500 ml", async () => {
    const state = await readState(page, "bem-estar");
    const mood = state.diary.find((e) => e.type === "bem_estar" && e.date === today);
    if (!mood || mood.rating !== 5 || mood.sleepHours !== 8 || mood.tags?.join("|") !== "Calma|Disposição")
      throw Error(JSON.stringify(mood));
    const total = state.diary.filter((e) => e.type === "agua" && e.date === today).reduce((sum, e) => sum + e.amountMl, 0);
    if (total !== 2250) throw Error(`água ${total}`);
  });
  await context.close();
}

// ---------- Calorias ocultas: "Seu dia" e a rosca P/C/G ----------
{
  const { page, context, errors } = await open(baseState({ hideCalories: true }));
  await check('calorias ocultas: anel "Seu dia" (imagem) com refeições, água e combinados', async () => {
    await expect(ring(page)).toHaveAttribute("role", "img");
    await expect(ring(page)).toHaveAttribute("aria-label", /^Seu dia: 2 de 3 refeições, água em \d+% e combinados em 0%$/);
    await expect(ring(page).getByText("Seu dia", { exact: true })).toBeVisible();
    await expect(ring(page).getByText("2 de 3 refeições", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Como calculamos" })).toHaveCount(0);
    await shoot(page, "390-anel-seu-dia.png", ring(page));
  });
  await check("calorias ocultas: nenhum kcal no Hoje (texto e nomes acessíveis)", async () => {
    await noKcal(page, "hoje");
  });
  await shoot(page, "390-hoje-seu-dia.png");
  await check('calorias ocultas: Diário com a rosca "Distribuição dos macros no dia" e sem kcal', async () => {
    await page.getByRole("tab", { name: "Diário", exact: true }).click();
    await expect(diaryReady(page)).toBeVisible();
    await expect(
      page.getByRole("img", { name: /^Distribuição dos macros no dia: Proteína \d+%, Carboidratos \d+%, Gorduras \d+%$/ }),
    ).toBeVisible();
    for (const label of ["Proteína", "Carboidratos", "Gorduras"])
      await expect(page.getByTestId("macro-donut").getByText(label, { exact: true })).toBeVisible();
    await noKcal(page, "diário");
  });
  await shoot(page, "390-diario-rosca.png", page.getByTestId("diary-balance"));
  await check("calorias ocultas: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Editar Hoje ----------
const EDITED = "water,-mood,meals,habits,diet,pantry,injection";
{
  const { page, context, errors } = await open(baseState({ homeLayout: VISIBLE_MOOD_WATER }));
  const editHome = async () => {
    await page.getByRole("button", { name: "Editar Hoje", exact: true }).click();
    await expect(sheetTitle(page, "Editar Hoje")).toBeVisible();
  };
  const moveWaterAndHideMood = async () => {
    await page.getByRole("button", { name: "Subir Água", exact: true }).click();
    await expect(page.getByRole("button", { name: "Subir Água", exact: true })).toBeDisabled();
    await page.getByRole("switch", { name: "Mostrar Bem-estar", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Mostrar Bem-estar", exact: true })).not.toBeChecked();
  };
  await check("editar hoje: ordem salva com Bem-estar e Água à vista (Bem-estar, Água, Refeições)", async () => {
    await expect(moodPrompt(page)).toBeVisible();
    const [mood, waterCard, meals] = [await top(moodPrompt(page)), await top(page.getByTestId("water-card")), await top(page.getByTestId("meals-timeline"))];
    if (!(mood < waterCard && waterCard < meals)) throw Error(`${mood} ${waterCard} ${meals}`);
  });
  await check("editar hoje: folha com interruptores e subir/descer (pontas desativadas, sem medicação sem caneta)", async () => {
    await editHome();
    await expect(page.getByRole("switch")).toHaveCount(6);
    await expect(page.getByRole("switch", { name: "Mostrar Medicação injetável" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Subir Bem-estar", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Descer Despensa", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Descer Bem-estar", exact: true })).toBeEnabled();
    await moveWaterAndHideMood();
  });
  await shoot(page, "390-editar-hoje.png");
  await check('editar hoje: "Salvar" reordena (Água primeiro) e oculta o Bem-estar', async () => {
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(sheetTitle(page, "Editar Hoje")).toHaveCount(0);
    await expect(page.getByText("Hoje reorganizado.", { exact: true })).toBeVisible();
    await expect(moodPrompt(page)).toHaveCount(0);
    const [waterCard, meals] = [await top(page.getByTestId("water-card")), await top(page.getByTestId("meals-timeline"))];
    if (!(waterCard < meals)) throw Error(`${waterCard} ${meals}`);
  });
  await check('editar hoje: "Desfazer" devolve a ordem anterior', async () => {
    await toastWith(page, "Hoje reorganizado.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByText("Ordem anterior restaurada.", { exact: true })).toBeVisible();
    await expect(moodPrompt(page)).toBeVisible();
    if (!((await top(moodPrompt(page))) < (await top(page.getByTestId("water-card"))))) throw Error("Bem-estar fora do topo");
  });
  await check('editar hoje: "Ordem padrão" volta à ordem original (Refeições primeiro; Bem-estar e Água ocultos)', async () => {
    await editHome();
    await moveWaterAndHideMood();
    await page.getByRole("button", { name: "Ordem padrão", exact: true }).click();
    await expect(page.getByRole("button", { name: "Subir Refeições de hoje", exact: true })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "Mostrar Bem-estar", exact: true })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Mostrar Água", exact: true })).not.toBeChecked();
    // Fechar sem salvar descarta o rascunho; a ordem salva (Bem-estar, Água…) continua.
    await closeSheet(page, "Editar Hoje");
    await editHome();
    await moveWaterAndHideMood();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Hoje reorganizado.", { exact: true })).toBeVisible();
  });
  await check("editar hoje: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check(`editar hoje: profile.homeLayout gravado ("${EDITED}") e mantido ao reabrir`, async () => {
    const state = await readState(page, "layout");
    if (state.profile.homeLayout !== EDITED) throw Error(state.profile.homeLayout);
    await page.goto(url);
    await expect(hojeWeek(page)).toBeVisible({ timeout: 30000 });
    await expect(moodPrompt(page)).toHaveCount(0);
    if (!((await top(page.getByTestId("water-card"))) < (await top(page.getByTestId("meals-timeline"))))) throw Error("ordem perdida");
  });
  await context.close();
}
{
  const { page, context, errors } = await open(baseState({ homeLayout: "-water,-habits" }));
  await check("seções ocultas: Água e Combinados somem do Hoje", async () => {
    await expect(page.getByTestId("water-card")).toHaveCount(0);
    await expect(page.getByTestId("habits-card")).toHaveCount(0);
  });
  await check("atalho de água com a seção oculta abre a folha de água", async () => {
    await page.getByRole("button", { name: /^Água: / }).click();
    await expect(sheetTitle(page, "Registrar água")).toBeVisible();
    await closeSheet(page, "Registrar água");
  });
  await check("atalho de combinados com a seção oculta avisa como mostrá-los", async () => {
    await page.getByRole("button", { name: /^Combinados: / }).click();
    await expect(page.getByText("Os combinados estão ocultos. Use “Editar Hoje” para mostrá-los.", { exact: true })).toBeVisible();
  });
  await check("seções ocultas: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
