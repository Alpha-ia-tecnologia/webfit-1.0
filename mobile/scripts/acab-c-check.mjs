// Verificação dos acabamentos (ACAB-C) no export web do app, a 390 px: "Ajustar metas" no Meu espaço
// (salvar grava perfil e meta do dia, "Desfazer" devolve, "Voltar ao automático", sem kcal com calorias
// ocultas, perfil sensível sem ajuste), "Sua jornada" com o peso atual e a "Próxima pesagem" na folha
// "Pesagens" (perfil sensível vê só o valor), ícones de categoria nos alimentos com os filtros da busca e o
// contador de exames. Fotografa as telas na pasta indicada.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/acab-c
//   node --import tsx scripts/acab-c-check.mjs dist/acab-c [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { goalsFor, localDate, mealTotals, shiftDate, uid } from "../../src/lib/domain.ts";
import { nextWeighIn, weightTrend } from "../../src/lib/evolution.ts";
import { categoriesIn, foodCategoryOf } from "../../src/lib/food-categories.ts";
import { searchFoods } from "../../src/lib/food-search.ts";
import { domainTone, palette } from "../../src/design/tokens.ts";
import { diarySchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/acab-c");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "acab-c-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "acab-c-seed-"));
const PORT = 3231;
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
const ALFACE = food("Alface, crespa, crua");
/** PNG de 1 × 1 px para os exames. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
  await expect(ready(page)).toBeVisible({ timeout: 30000 });
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
async function shoot(page, file) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, file) });
}
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const kg1 = (n) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const goalsReady = (page) => heading(page, "Minhas metas diárias");
const stepperButton = (page, group, name) =>
  page.getByRole("group", { name: group, exact: true }).getByRole("button", { name, exact: true });
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};

// ---------- Metas: salvar com "Desfazer" ----------
{
  const state = stateFixture();
  const auto = goalsFor({ ...state.profile, manualProtein: null });
  const expectedProtein = Math.round(auto.protein / 5) * 5;
  const { page, context, errors } = await open(state, { route: "/espaco", ready: goalsReady });
  await check('metas: origem "Definida por você" e botão "Editar" (nome "Editar metas") que abre a folha', async () => {
    await expect(page.getByTestId("goal-origin")).toHaveText("Definida por você");
    await expect(page.getByRole("button", { name: "Editar metas", exact: true })).toBeVisible();
  });
  await check("ajustar metas: folha com os passos de calorias, água, proteína, carboidratos e gorduras", async () => {
    await page.getByRole("button", { name: "Editar metas", exact: true }).click();
    await expect(heading(page, "Ajustar metas")).toBeVisible();
    for (const group of ["Calorias por dia", "Água por dia", "Proteína", "Carboidratos", "Gorduras"])
      await expect(page.getByRole("group", { name: group, exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Salvar metas", exact: true })).toBeDisabled();
  });
  await check('ajustar metas: "+" na proteína em branco parte da estimativa; salvar mostra "Desfazer"', async () => {
    await stepperButton(page, "Proteína", "Aumentar 5 g").click();
    await expect(page.getByRole("group", { name: "Proteína", exact: true }).getByText(String(expectedProtein), { exact: true })).toBeVisible();
    await shoot(page, "390-ajustar-metas.png");
    await page.getByRole("button", { name: "Salvar metas", exact: true }).click();
    await expect(heading(page, "Ajustar metas")).toHaveCount(0);
    await expect(toastWith(page, "Metas atualizadas.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    await expect(page.getByLabel(new RegExp(`^Proteína: ${expectedProtein} gramas`))).toBeVisible();
  });
  await check('"Desfazer" devolve o perfil e o histórico de metas de antes', async () => {
    await toastWith(page, "Metas atualizadas.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByText("Metas anteriores restauradas.", { exact: true })).toBeVisible();
    const saved = await readState(page, "undo");
    if (saved.profile.manualProtein !== null) throw Error(`proteína ${saved.profile.manualProtein}`);
    if (JSON.stringify(saved.goalHistory) !== JSON.stringify(state.goalHistory)) throw Error("histórico diferente do original");
  });
  await check("metas: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- Metas: salvar grava o perfil e a meta do dia; voltar ao automático ----------
{
  const state = stateFixture();
  const { page, context, errors } = await open(state, { route: "/espaco", ready: goalsReady });
  await check("salvar metas grava o perfil e a meta de hoje, sem mexer nas medições", async () => {
    await page.getByRole("button", { name: "Editar metas", exact: true }).click();
    await stepperButton(page, "Calorias por dia", "Diminuir 50 kcal").click();
    await stepperButton(page, "Gorduras", "Aumentar 5 g").click();
    await page.getByRole("button", { name: "Salvar metas", exact: true }).click();
    await expect(page.getByText("Metas atualizadas.", { exact: true })).toBeVisible();
    await expect(page.getByText("1.750", { exact: true })).toBeVisible();
    const saved = await readState(page, "saved");
    const snapshot = saved.goalHistory.find((h) => h.date === today);
    if (saved.profile.manualCalories !== 1750) throw Error(`calorias ${saved.profile.manualCalories}`);
    if (saved.profile.manualFat === null) throw Error("gorduras não gravadas");
    if (snapshot?.profile.manualCalories !== 1750 || snapshot.profile.manualFat !== saved.profile.manualFat)
      throw Error("meta do dia não registrada");
    if (JSON.stringify(saved.measurements) !== JSON.stringify(state.measurements)) throw Error("medições mudaram");
  });
  await check("salvar metas: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context, errors } = await open(stateFixture(), { route: "/espaco", ready: goalsReady });
  await check('"Voltar ao automático" limpa energia e macros, mantém a água e troca o selo', async () => {
    await page.getByRole("button", { name: "Editar metas", exact: true }).click();
    await page.getByRole("button", { name: "Voltar ao automático", exact: true }).click();
    await expect(toastWith(page, "Metas de volta ao automático.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    await expect(page.getByTestId("goal-origin")).toHaveText("Automática");
    await shoot(page, "390-metas-automaticas.png");
    const saved = await readState(page, "auto");
    const p = saved.profile;
    if ([p.manualCalories, p.manualProtein, p.manualCarbs, p.manualFat].some((v) => v !== null)) throw Error("sobrou meta manual");
    if (p.manualWater !== 2000) throw Error(`água ${p.manualWater}`);
  });
  await check("voltar ao automático: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- Metas com calorias ocultas e perfil sensível ----------
{
  const state = stateFixture();
  state.profile = { ...state.profile, hideCalories: true };
  const { page, context, errors } = await open(state, { route: "/espaco", ready: goalsReady });
  await check("calorias ocultas: folha sem o passo de calorias e sem kcal em texto ou nomes acessíveis", async () => {
    await noKcal(page, "Meu espaço");
    await page.getByRole("button", { name: "Editar metas", exact: true }).click();
    await expect(heading(page, "Ajustar metas")).toBeVisible();
    await expect(page.getByRole("group", { name: "Calorias por dia", exact: true })).toHaveCount(0);
    await noKcal(page, "folha Ajustar metas");
    await shoot(page, "390-ajustar-metas-sem-kcal.png");
  });
  await check("calorias ocultas: salvar a água mantém a meta calórica escondida e o aviso sem kcal", async () => {
    await stepperButton(page, "Água por dia", "Aumentar 250 ml").click();
    await page.getByRole("button", { name: "Salvar metas", exact: true }).click();
    await expect(page.getByText("Metas atualizadas.", { exact: true })).toBeVisible();
    await noKcal(page, "aviso de metas");
    const saved = await readState(page, "hidden");
    if (saved.profile.manualWater !== 2250) throw Error(`água ${saved.profile.manualWater}`);
    if (saved.profile.manualCalories !== 1800) throw Error(`calorias ${saved.profile.manualCalories}`);
  });
  await check("calorias ocultas: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const state = stateFixture();
  state.profile = { ...state.profile, eatingDisorder: "sim" };
  const { page, context } = await open(state, { route: "/espaco", ready: goalsReady });
  await check('perfil sensível: card calmo; "Editar metas" leva à anamnese (sem a folha "Ajustar metas")', async () => {
    const edit = page.getByRole("button", { name: "Editar metas", exact: true });
    await expect(edit).toBeVisible();
    // Sem folha: o botão não anuncia um diálogo e o toque abre a anamnese.
    await expect(edit).not.toHaveAttribute("aria-haspopup", "dialog");
    await edit.click();
    await expect(page.getByRole("heading", { name: "Ajustar metas", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/anamnese/);
  });
  await context.close();
}

// ---------- Sua jornada (conceito 09): peso atual; a próxima pesagem na folha "Pesagens" ----------
/** Oito pesagens semanais de 76,4 a 72,4 kg, a última há `ago` dias, com meta de 66 kg. */
function withJourney(change = {}, ago = 0) {
  const state = stateFixture();
  state.profile = { ...state.profile, targetWeight: 66, ...change };
  state.measurements = Array.from({ length: 8 }, (_, i) => ({
    ...state.measurements[0],
    id: uid(),
    date: shiftDate(today, -7 * (7 - i) - ago),
    weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
  }));
  return state;
}
const journeyReady = (page) => page.getByTestId("journey-card");
{
  const state = withJourney();
  const trend = weightTrend(state.measurements).at(-1).trend;
  const next = nextWeighIn(state, today);
  const { page, context, errors } = await open(state, { route: "/evolucao", ready: journeyReady });
  await check("jornada: o número grande é o peso atual (a última pesagem); a tendência não entra no cartão", async () => {
    if (kg1(trend) === "72,4 kg") throw Error("tendência igual ao peso: o teste não diferencia");
    await expect(page.getByTestId("journey-weight")).toHaveText("72,4 kg");
    await expect(page.getByTestId("journey-caption")).toHaveText("Peso atual · pesado hoje");
    await expect(page.getByTestId("journey-card")).not.toContainText(kg1(trend));
    await expect(page.getByTestId("journey-card").getByTestId("journey-next")).toHaveCount(0);
  });
  await check('pesagens: pílula "Próxima pesagem" em tom de água (nunca vermelho) na folha "Pesagens"', async () => {
    if (!next.label.startsWith("Próxima pesagem: ")) throw Error(next.label);
    await page.getByRole("button", { name: "8 pesagens no período", exact: true }).click();
    const pill = page.getByTestId("journey-next");
    await expect(pill).toHaveText(next.label);
    const bg = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== rgb(domainTone.water.bg)) throw Error(`fundo ${bg}`);
    const color = await pill.getByText(next.label, { exact: true }).evaluate((el) => getComputedStyle(el).color);
    if ([palette.rose600, palette.rose700].map(rgb).includes(color)) throw Error(`texto ${color}`);
  });
  await shoot(page, "390-jornada.png");
  await check("jornada: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context } = await open(withJourney({}, 10), { route: "/evolucao", ready: journeyReady });
  await check('jornada: pesagem de 10 dias atrás; na folha "Pesagens", "Pesagem sugerida hoje"', async () => {
    await expect(page.getByTestId("journey-caption")).toHaveText("Peso atual · pesado há 10 dias");
    await page.getByRole("button", { name: "8 pesagens no período", exact: true }).click();
    await expect(page.getByTestId("journey-next")).toHaveText("Pesagem sugerida hoje");
  });
  await context.close();
}
{
  const { page, context, errors } = await open(withJourney({ eatingDisorder: "sim" }), { route: "/evolucao", ready: journeyReady });
  await check("jornada em perfil sensível: só o peso pesado, sem tendência, variação, trilha, ritmo nem pílula", async () => {
    const card = page.getByTestId("journey-card");
    await expect(page.getByTestId("journey-weight")).toHaveText("72,4 kg");
    await expect(page.getByTestId("journey-caption")).toHaveText("Peso atual · pesado hoje");
    for (const id of ["journey-next", "journey-delta", "journey-track"]) await expect(page.getByTestId(id)).toHaveCount(0);
    const text = await card.innerText();
    for (const word of ["tendência", "Próxima pesagem", "Ritmo", "caminho"]) if (text.includes(word)) throw Error(`"${word}" no card`);
  });
  await shoot(page, "390-jornada-sensivel.png");
  await check("jornada sensível: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- Registrar refeição: ícones de categoria e filtro da busca ----------
{
  const state = stateFixture();
  const yesterday = shiftDate(today, -1);
  const items = [
    { food: ARROZ, grams: 100 },
    { food: FEIJAO, grams: 100 },
    { food: ALFACE, grams: 30 },
  ];
  state.diary = [
    diarySchema.parse({
      id: "almoco-ontem",
      userId: state.userId,
      date: yesterday,
      time: "12:00",
      type: "refeicao",
      title: "Almoço",
      categoryTag: "Almoço",
      description: "",
      items,
      ...mealTotals(items),
      createdAt: `${yesterday}T12:00:00.000Z`,
      updatedAt: `${yesterday}T12:00:00.000Z`,
    }),
  ];
  const search = (p) => p.getByLabel("Buscar alimento", { exact: true });
  const { page, context, errors } = await open(state, { route: "/refeicao", ready: search });
  await check("seus pratos: um bloco de 36 px por categoria (arroz, feijão e alface), sem emoji", async () => {
    const tiles = page.getByTestId("dish-tiles").first().getByTestId("food-tile");
    await expect(tiles).toHaveCount(3);
    const colors = await tiles.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    const expected = [ARROZ, FEIJAO, ALFACE].map((f) => rgb(domainTone[foodCategoryOf(f).tone].bg));
    if (colors.join() !== expected.join()) throw Error(`${colors} ≠ ${expected}`);
    const box = await tiles.first().boundingBox();
    if (Math.round(box.width) !== 36 || Math.round(box.height) !== 36) throw Error(`${box.width}×${box.height}`);
    const text = await page.getByTestId("dish-scroller").innerText();
    if (/\p{Extended_Pictographic}/u.test(text)) throw Error(`emoji no cartão: ${text.slice(0, 40)}`);
  });
  // Conceito 02: o filtro por categoria só aparece quando a lista passa de uma página (20); "arroz" cabe numa
  // página, então o filtro é conferido com a primeira busca comum que passa disso (e tem 2 categorias ou mais).
  const FILTER_PAGE = 20;
  const filterQuery = ["carne", "queijo", "leite", "frango", "banana", "feijão"].find((q) => {
    const found = searchFoods([...state.foods, ...taco], q, { limit: Infinity }).groups;
    return found.length > FILTER_PAGE && categoriesIn(found, (g) => g.selected).length >= 2;
  });
  if (!filterQuery) throw Error("nenhuma busca comum passa de 20 resultados com 2 categorias");
  const groups = searchFoods([...state.foods, ...taco], filterQuery, { limit: Infinity }).groups;
  const categories = categoriesIn(groups, (g) => g.selected);
  const chips = page.getByRole("group", { name: "Filtrar por categoria", exact: true });
  await check('busca curta ("arroz", uma página): sem o filtro por categoria, como no conceito 02', async () => {
    await search(page).fill("arroz");
    await expect(page.getByRole("heading", { name: "Tabela TACO", exact: true })).toBeVisible();
    await expect(chips).toHaveCount(0);
  });
  await check('busca longa: "Todos" e as categorias dos resultados, com alvo de 44 px e "Todos" marcado', async () => {
    await search(page).fill(filterQuery);
    await expect(chips).toBeVisible();
    const names = await chips.getByRole("button").allInnerTexts();
    const expected = ["Todos", ...categories.map((c) => c.label)];
    if (names.map((n) => n.trim()).join("|") !== expected.join("|")) throw Error(`${names} ≠ ${expected}`);
    await expect(chips.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
    const heights = await chips.getByRole("button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    if (heights.some((h) => h < 44)) throw Error(heights.join(" "));
  });
  const foodNames = async () =>
    (await page.getByRole("button", { name: /^Adicionar / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))
      .map((label) => label.replace(/^Adicionar /, ""))
      .filter((name) => taco.some((f) => f.name === name));
  await check("busca: escolher uma categoria mostra só os alimentos dela (seleção única)", async () => {
    const all = await foodNames();
    const chosen = categories[1];
    await chips.getByRole("button", { name: chosen.label, exact: true }).click();
    await expect(chips.getByRole("button", { name: chosen.label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "false");
    const shown = await foodNames();
    if (!shown.length) throw Error("nenhum alimento na categoria");
    const wrong = shown.filter((name) => foodCategoryOf(food(name)).key !== chosen.key);
    if (wrong.length) throw Error(`fora de ${chosen.label}: ${wrong.join(", ")}`);
    if (shown.length >= all.length) throw Error(`filtro não reduziu (${shown.length} de ${all.length})`);
    await shoot(page, "390-busca-filtrada.png");
    await chips.getByRole("button", { name: "Todos", exact: true }).click();
    await expect.poll(async () => (await foodNames()).length).toBe(all.length);
  });
  await check("lista: cada alimento com o emoji (ou o ícone da categoria) num bloco de 44 px (conceito 02)", async () => {
    await search(page).fill("arroz");
    const first = (await foodNames())[0];
    const row = page.getByRole("button", { name: `Adicionar ${first}`, exact: true }).locator("xpath=ancestor::div[.//*[@data-testid='food-tile']][1]");
    const tile = row.getByTestId("food-tile").first();
    const box = await tile.boundingBox();
    if (Math.round(box.width) !== 44) throw Error(`largura ${box.width}`);
    const bg = await tile.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== rgb(palette.slate50)) throw Error(`fundo ${bg}`);
  });
  await check("bandeja: o item adicionado leva o emoji redondo de 28 px", async () => {
    await page.getByRole("button", { name: `Adicionar ${ARROZ.name}`, exact: true }).click();
    const tile = page.getByTestId("tray-chips").getByTestId("food-tile").first();
    await expect(tile).toBeVisible();
    const box = await tile.boundingBox();
    if (Math.round(box.width) !== 28) throw Error(`largura ${box.width}`);
  });
  await check("refeição: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- Exames: contador e limite ----------
const exam = (i) => ({
  id: `exame-${i}`,
  name: `Exame ${i}`,
  date: today,
  fileName: `exame-${i}.png`,
  mimeType: "image/png",
  data: PNG,
  notes: "",
});
for (const count of [2, 30]) {
  const state = stateFixture();
  state.exams = Array.from({ length: count }, (_, i) => exam(i + 1));
  const { page, context, errors } = await open(state, { route: "/espaco", ready: goalsReady });
  await check(`exames: "${count} de 30 exames" ${count === 30 ? 'e "Adicionar exame" desativado' : 'e "Adicionar exame" ativo'}`, async () => {
    await page.getByRole("tab", { name: "Exames e consultas", exact: true }).click();
    await expect(page.getByText(new RegExp(`^${count} de 30 exames · `))).toBeVisible();
    const add = page.getByRole("button", { name: "Adicionar exame", exact: true });
    if (count === 30) await expect(add).toBeDisabled();
    else await expect(add).toBeEnabled();
  });
  if (count === 30) await shoot(page, "390-exames-limite.png");
  await check(`exames (${count}): sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
