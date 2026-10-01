// Verificação da Onda 2 · Lote 2 (Evolução, conceito 09) no export web do app, a 390 e 360 px: cartão "Sua jornada"
// (peso atual em destaque), gráfico de peso com períodos, balão e a meta na legenda, "Pesagens" numa folha, dois mini
// gráficos compactos que abrem os detalhes (7/28 dias e destaques), proteína em "Mais da sua evolução", perfil
// sensível, primeira visita ("Sua linha de partida") e calorias ocultas. Fotografa a tela a 390 px.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l2
//   node --import tsx scripts/o2l2-check.mjs dist/o2l2
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, shiftDate, uid } from "../../src/lib/domain.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";
import { WEIGHT_RANGES } from "../../src/lib/evolution.ts";

/** Os períodos do gráfico de peso vêm da lib compartilhada (o 1A saiu na fidelidade visual, conceito 09). */
const RANGE_LABELS = WEIGHT_RANGES.map((range) => range.label);

const target = path.resolve(process.argv[2] ?? "dist/o2l2");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l2-shots"));
mkdirSync(shots, { recursive: true });
const PORT = 3217;
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

/** Mesmo estado da verificação do web: 8 pesagens semanais de 76,4 a 72,4 kg, meta 66 kg. */
function richState(change = {}, weighIns = 8) {
  const state = stateFixture();
  const base = state.measurements[0];
  return {
    ...state,
    profile: { ...state.profile, targetWeight: 66, ...change },
    measurements: Array.from({ length: weighIns }, (_, i) => ({
      ...base,
      id: uid(),
      date: shiftDate(today, -7 * (weighIns - 1 - i)),
      weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
      waist: 88 - i * 0.7,
      hip: 102 - i * 0.4,
    })),
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
async function open(state, width = 390) {
  const seedFile = path.join(shots, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible({ timeout: 30000 });
  await page.goto(url + "/__blank");
  await page.evaluate(async (bytes) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(await (await entry.getFile()).arrayBuffer());
      if (!new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) continue;
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
  await page.goto(url + "/evolucao");
  await expect(page.getByRole("heading", { name: EVOLUCAO_TITLE, exact: true })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(700);
  return { page, context, errors };
}

async function noSideScroll(page) {
  const overflow = await page.evaluate(() => {
    let inner = 0;
    for (const el of document.querySelectorAll("div")) {
      const style = getComputedStyle(el);
      if (style.overflowX === "auto" || style.overflowX === "scroll") inner = Math.max(inner, el.scrollWidth - el.clientWidth);
    }
    return { doc: document.documentElement.scrollWidth - window.innerWidth, inner };
  });
  if (overflow.doc > 0 || overflow.inner > 1) throw Error(`rolagem lateral: doc ${overflow.doc}, conteúdo ${overflow.inner}`);
}

const text = (locator) => locator.evaluate((el) => el.textContent ?? "");
/** Linhas tracejadas da meta (6 5) dentro do gráfico de peso. */
const targetLines = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="weight-chart"] line')].filter((l) =>
        /^6[ ,]+5$/.test((l.getAttribute("stroke-dasharray") ?? "").trim()),
      ).length,
  );
/** Rola a tela até o topo e fotografa; `full` estica a janela até o fim do conteúdo rolável. */
async function shoot(page, file, full = false) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("div")) if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible") el.scrollTop = 0;
  });
  if (full) {
    const height = await page.evaluate(() => {
      let extra = 0;
      for (const el of document.querySelectorAll("div")) {
        const style = getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") extra = Math.max(extra, el.scrollHeight - el.clientHeight);
      }
      return window.innerHeight + extra;
    });
    const { width } = page.viewportSize();
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, file) });
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(300);
  } else await page.screenshot({ path: path.join(shots, file) });
}

for (const width of [390, 360]) {
  const { page, context, errors } = await open(richState(), width);
  const journey = page.getByTestId("journey-card");
  await check(`${width} jornada: "Sua jornada · desde", 38% do caminho, início e meta`, async () => {
    const content = await text(journey);
    if (!content.includes("Sua jornada · desde ")) throw Error(content);
    for (const part of ["38% do caminho", "Início 76,4", "Meta 66", "Peso atual · pesado hoje"]) if (!content.includes(part)) throw Error(`sem "${part}" em: ${content}`);
  });
  await check(`${width} jornada: peso atual (72,4 kg) em algarismos tabulares`, async () => {
    const weight = page.getByTestId("journey-weight");
    // Conceito 09: o destaque é a última pesagem; a tendência fica no gráfico.
    await expect(weight).toHaveText("72,4 kg");
    const variant = await weight.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    if (!variant.includes("tabular-nums")) throw Error(variant);
  });
  await check(`${width} jornada: selo navy "4,0 kg" com nome "−4,0 kg desde …"`, async () => {
    const chip = page.getByTestId("journey-delta");
    await expect(chip).toHaveText("4,0 kg");
    const label = await chip.locator("[aria-label]").getAttribute("aria-label");
    if (!/^−4,0 kg desde \d+ \w+$/.test(label ?? "")) throw Error(`aria-label: ${label}`);
    const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== "rgb(10, 25, 47)") throw Error(`fundo ${bg}`);
  });
  await check(`${width} jornada: ritmo, cintura e quadril`, async () => {
    const content = await text(journey);
    for (const part of ["Ritmo", "kg/sem", "média 4 sem", "Cintura", "Quadril", "83,1 cm", "99,2 cm"]) if (!content.includes(part)) throw Error(`sem "${part}" em: ${content}`);
  });
  await check(`${width}: exatamente um "Registrar medidas" (o "+" da jornada)`, async () => {
    const count = await page.getByRole("button", { name: "Registrar medidas", exact: true }).count();
    if (count !== 1) throw Error(`${count} botões`);
  });
  await check(`${width}: sem rolagem lateral`, () => noSideScroll(page));
  await check(`${width} peso: "8 pesagens" e período inicial "Tudo"`, async () => {
    await expect(page.getByTestId("weight-card")).toContainText("8 pesagens");
    await expect(page.getByRole("tab", { name: "Tudo", exact: true })).toHaveAttribute("aria-selected", "true");
  });
  await check(`${width} peso: eixo termina em "hoje", rótulos com 12 px ou mais; meta longe dos dados só na legenda`, async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="weight-chart"] text')].map((t) => ({ text: t.textContent, size: parseFloat(getComputedStyle(t).fontSize) })),
    );
    if (labels.at(-1)?.text !== "hoje") throw Error(JSON.stringify(labels.map((l) => l.text)));
    const small = labels.filter((l) => l.size < 12);
    if (small.length) throw Error(`rótulos pequenos: ${JSON.stringify(small)}`);
    // Meta de 66 kg longe dos dados (72–76,4): fora da escala (a curva não achata) e em texto na legenda.
    if ((await targetLines(page)) !== 0) throw Error("linha da meta dentro da escala");
    await expect(page.getByTestId("weight-card")).toContainText("Meta 66 kg");
  });
  if (width === 390) {
    await shoot(page, "390-top.png");
    await shoot(page, "390-full.png", true);
  }
  const chart = page.getByTestId("weight-chart");
  const balloon = page.getByTestId("weight-balloon");
  await check(`${width} peso: tocar no gráfico mostra o balão (data, peso e tendência)`, async () => {
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    await chart.click({ position: { x: box.width * 0.45, y: box.height / 2 } });
    await expect(balloon).toBeVisible();
    // Ex.: "Qui, 10 set" + "73,6 kg" + "tend. 73,8".
    const content = (await text(balloon)).replace(/\s+/g, " ");
    if (!/^[A-ZÀ-Ú][a-zà-ú]{2}, \d{1,2} [a-z]{3}\d+,\d kg ?tend\. \d+,\d$/.test(content)) throw Error(content);
    await expect(page.getByTestId("weight-live")).toContainText("tendência");
  });
  if (width === 390) await chart.screenshot({ path: path.join(shots, "390-balloon.png") });
  await check(`${width} peso: setas do teclado movem o balão`, async () => {
    const before = await text(balloon);
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => text(balloon)).not.toBe(before);
  });
  await check(`${width} peso: ${RANGE_LABELS.join(", ")} sem rolagem lateral; trocar o período fecha o balão`, async () => {
    for (const label of RANGE_LABELS) {
      const tab = page.getByRole("tab", { name: new RegExp(`^${label}`) });
      const box = await tab.boundingBox();
      if (box.x < 0 || box.x + box.width > width) throw Error(`${label} fora da tela`);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(balloon).toHaveCount(0);
      await noSideScroll(page);
    }
  });
  await check(`${width} peso: "8 pesagens no período" abre a folha "Pesagens" com a próxima pesagem e exclusão por data`, async () => {
    await page.getByRole("button", { name: "8 pesagens no período", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pesagens", exact: true })).toBeVisible();
    await expect(page.getByTestId("journey-next")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Excluir medição \d{2}\/\d{2}\/\d{4}$/ })).toHaveCount(8);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pesagens", exact: true })).toHaveCount(0);
  });
  await check(`${width} dias: "Últimos 7 dias", "Ver diário" e dois mini gráficos por linha`, async () => {
    await expect(page.getByRole("heading", { name: "Últimos 7 dias", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver diário", exact: true })).toBeVisible();
    const [food, water] = [await page.getByTestId("mini-food").boundingBox(), await page.getByTestId("mini-water").boundingBox()];
    if (Math.abs(food.y - water.y) > 1 || food.width < 150) throw Error(`calorias ${JSON.stringify(food)} água ${JSON.stringify(water)}`);
    // Conceito 09: só Calorias e Água; a proteína vai para "Mais da sua evolução".
    const order = await page.getByTestId("mini-grid").evaluate((el) => [...el.children].map((c) => c.getAttribute("data-testid")));
    if (order.join() !== "mini-food,mini-water") throw Error(order.join());
    await expect(page.getByRole("button", { name: /^Proteína, / })).toBeVisible();
  });
  await check(`${width} dias: "Calorias: ver detalhes" abre a folha; 28 dias sem rolagem lateral`, async () => {
    await page.getByRole("button", { name: "Calorias: ver detalhes", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Calorias", exact: true }).last()).toBeVisible();
    await page.getByRole("tab", { name: "28 dias", exact: true }).click();
    await expect(page.getByRole("img", { name: /^Calorias por dia nos últimos 28 dias/ })).toBeVisible();
    await noSideScroll(page);
    if (width === 390) await shoot(page, "390-detalhes-28.png");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("tab", { name: "28 dias", exact: true })).toHaveCount(0);
  });
  await check(`${width}: "+" abre "Registrar medidas"`, async () => {
    await page.getByRole("button", { name: "Registrar medidas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Registrar medidas", exact: true })).toBeVisible();
  });
  await check(`${width}: sem erros de página`, async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// Perfil sensível: só o valor do peso.
{
  const { page, context, errors } = await open(richState({ eatingDisorder: "sim" }));
  await check("sensível: peso atual à vista, sem selo, meta, caminho ou ritmo", async () => {
    await expect(page.getByTestId("journey-weight")).toHaveText("72,4 kg");
    await expect(page.getByTestId("journey-delta")).toHaveCount(0);
    const content = await text(page.getByTestId("journey-card"));
    if (/caminho|Meta|Ritmo|kg\/sem/.test(content)) throw Error(content);
    if (/−\d/.test(content)) throw Error(`variação de medidas à vista: ${content}`);
  });
  await check("sensível: gráfico sem linha nem legenda de meta", async () => {
    if ((await targetLines(page)) !== 0) throw Error("linha da meta à vista");
    await expect(page.getByTestId("weight-card")).not.toContainText("Meta");
  });
  await check("sensível: sem Proteína (nem mini gráfico nem linha) e sem Medidas mais recentes (IMC)", async () => {
    await expect(page.getByTestId("mini-grid")).not.toContainText("Proteína");
    await expect(page.getByRole("button", { name: /^Proteína/ })).toHaveCount(0);
    await expect(page.getByText("Medidas mais recentes", { exact: true })).toHaveCount(0);
  });
  await shoot(page, "390-sensivel.png");
  await check("sensível: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// Primeira visita: uma pesagem só.
{
  const { page, context, errors } = await open(richState({}, 1));
  await check('primeira visita: "Sua linha de partida" com o início e o checklist', async () => {
    await expect(page.getByRole("heading", { name: "Sua linha de partida", exact: true })).toBeVisible();
    const content = await text(page.getByTestId("start-line"));
    for (const part of ["Início 76,4 kg · ", "Com alguns registros, os gráficos ganham vida aqui.", "Registrar a segunda pesagem", "1 de 2", "0 de 3"])
      if (!content.includes(part)) throw Error(`sem "${part}" em: ${content}`);
    await expect(page.getByRole("button", { name: "Registrar medidas", exact: true })).toHaveCount(1);
  });
  await check("primeira visita: sem jornada e sem gráfico de peso", async () => {
    await expect(page.getByTestId("journey-card")).toHaveCount(0);
    await expect(page.getByTestId("weight-chart")).toHaveCount(0);
  });
  await check("primeira visita: anel sem arco em 0 de 3", async () => {
    const arcs = await page.getByTestId("start-line").evaluate((el) => [...el.querySelectorAll('[role="listitem"]')].map((item) => item.querySelectorAll("svg path").length));
    if (arcs.join() !== "1,0,0") throw Error(`arcos por item: ${arcs.join()}`);
  });
  await shoot(page, "390-partida.png");
  await check("primeira visita: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// Calorias ocultas: "Refeições" por dia no lugar de calorias.
{
  const { page, context } = await open(richState({ hideCalories: true }));
  await check('calorias ocultas: "Refeições" por dia, sem "kcal" nem "Calorias"', async () => {
    const grid = page.getByTestId("mini-grid");
    await expect(grid).toContainText("Refeições");
    const content = await text(grid);
    if (/kcal|Calorias/.test(content)) throw Error(content);
    const body = await page.locator("body").innerText();
    if (/kcal/i.test(body)) throw Error("kcal na tela");
  });
  await context.close();
}

// Com registros: 6 dos 7 dias com refeição e água (anteontem sem nada), para ver as barras.
{
  const state = richState();
  const food = { id: "f-arroz", name: "Arroz", category: "Cereais", caloriesPer100g: 130, proteinPer100g: 2.5, carbsPer100g: 28, fatPer100g: 0.3, source: "TACO" };
  const entry = (date, type, extra) => ({
    id: uid(),
    userId: state.userId,
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    type,
    title: type === "agua" ? "Água" : "Almoço",
    description: "",
    ...extra,
  });
  const diary = [0, 1, 3, 4, 5, 6].flatMap((back, i) => {
    const date = shiftDate(today, -back);
    return [
      entry(date, "refeicao", { calories: 1200 + i * 120, macros: { protein: 70 + i * 6, carbs: 150, fat: 40 }, items: [{ food, grams: 100 }] }),
      entry(date, "agua", { amountMl: 1500 + i * 150 }),
    ];
  });
  const { page, context, errors } = await open({ ...state, diary });
  await check("com registros: média por dia e \"média/dia\" nos mini gráficos; destaques e referência nas folhas", async () => {
    // Conceito 09: o mini gráfico mostra a média e "média/dia · meta …"; os destaques (EVOL-06) ficam na folha.
    await expect(page.getByTestId("mini-food")).toContainText("kcal");
    await expect(page.getByTestId("mini-food")).toContainText("média/dia");
    await expect(page.getByTestId("mini-water")).toContainText("média/dia");
    await page.getByRole("button", { name: "Calorias: ver detalhes", exact: true }).click();
    await expect(page.getByRole("list", { name: "Destaques de Calorias", exact: true })).toContainText("6 de 7 dias");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: /^Proteína, / }).click();
    await expect(page.getByText(/^Referência /).first()).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    const label = await page.getByTestId("mini-food").locator('[role="img"]').getAttribute("aria-label");
    if (!/^Calorias por dia nos últimos 7 dias: .+ kcal; meta [\d.]+ kcal$/.test(label ?? "")) throw Error(label);
  });
  await check("com registros: 6 barras e 1 dia sem registro por mini gráfico", async () => {
    // Dia sem registro = cápsula tracejada; os demais têm barra preenchida.
    const dashed = await page
      .getByTestId("mini-food")
      .locator('[role="img"]')
      .evaluate((el) => [...el.querySelectorAll("div")].filter((d) => getComputedStyle(d).borderTopStyle === "dashed").length);
    if (dashed !== 1) throw Error(`${dashed} cápsulas tracejadas`);
  });
  await page.getByTestId("mini-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.getByTestId("mini-grid").screenshot({ path: path.join(shots, "390-mini-dados.png") });
  await check("com registros: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// Caneta (conceito 09: a persona do conceito usa caneta e vê só Calorias e Água; a proteína fica na lista).
{
  const { page, context } = await open(richState({ weightLossPen: "sim", weightLossPenName: "Mounjaro (tirzepatida)", weightLossPenDose: "5 mg", weightLossPenPerMonth: 4 }));
  await check("caneta: mini gráficos Calorias e Água; Proteína em \"Mais da sua evolução\"", async () => {
    const order = await page.getByTestId("mini-grid").evaluate((el) => [...el.children].map((c) => c.getAttribute("data-testid")));
    if (order.join() !== "mini-food,mini-water") throw Error(order.join());
    await expect(page.getByRole("button", { name: /^Proteína, / })).toBeVisible();
  });
  await context.close();
}

await browser.close();
server.close();
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
