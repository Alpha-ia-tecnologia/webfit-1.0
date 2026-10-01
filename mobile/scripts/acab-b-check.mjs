// Verificação do lote "acabamento B" (espelho do sistema visual do web no app) no export web, a 390 px:
// aviso v2 (mini anel na água e nos combinados, nunca em refeições; vermelho só na falha ao gravar),
// estados vazios ilustrados (Diário, Combinados, refeições), esqueleto de abertura, validade da Despensa
// (pílula curta de ok e perto do fim, vencido sem pílula e com o texto completo; laranja "warn" e nunca
// vermelho, desde a Onda 2 · Lote 7), campo de busca único ("Limpar busca"), rótulo
// "kcal consumidas" inteiro dentro do anel, alvos de toque de 44 px sem hitSlop e nenhuma celebração
// ao excluir um combinado pendente. Fotografa as telas na pasta indicada.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/acab-b
//   node --import tsx scripts/acab-b-check.mjs dist/acab-b [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { arcDash } from "../../src/lib/charts.ts";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain.ts";
import { expiryStatus } from "../../src/lib/pantry.ts";
import { expiryPill } from "../../src/lib/pantry-view.ts";
import { domainTone, palette, semantic } from "../../src/design/tokens.ts";
import { diarySchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/acab-b");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "acab-b-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "acab-b-seed-"));
const PORT = 3234;
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
const water = (id, time, amountMl) => entry({ id, date: today, time, type: "agua", title: "Água", amountMl });
const habit = (id, title, done) => ({
  id,
  title,
  timeOfDay: "13:00",
  createdDate: shiftDate(today, -10),
  completedDates: done ? [today] : [],
});
const WALK = "Caminhar depois do almoço";
const TEA = "Tomar um chá à noite";

/** Café e almoço hoje, 750 ml de água e os combinados pedidos (um pendente, por padrão). */
function baseState({ habits = [habit("h1", WALK, false)], diary = true, extra = {} } = {}) {
  const state = stateFixture();
  const entries = diary
    ? [
        meal("cafe", "07:30", "Café da manhã", [
          { food: PAO, grams: 50 },
          { food: OVO, grams: 50 },
        ]),
        meal("almoco", "12:00", "Almoço", [
          { food: ARROZ, grams: 100 },
          { food: FEIJAO, grams: 100 },
        ]),
        water("agua-1", "08:00", 250),
        water("agua-2", "09:00", 500),
      ].map((e) => ({ ...e, userId: state.userId }))
    : [];
  // Água à vista no Hoje (oculta por padrão em Editar Hoje): o copo +250 ml e "Registrar água" moram no cartão dela.
  return { ...state, profile: { ...state.profile, homeLayout: "water" }, diary: entries, habits, ...extra };
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

const hojeWeek = (page) => page.getByRole("group", { name: "Esta semana" });
const diaryReady = (page) => page.getByRole("heading", { name: "Meu diário", exact: true });

let seeds = 0;
/**
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. `beforeRoute` roda
 * depois da semente e antes da navegação final (ex.: atrasar o banco para ver o esqueleto).
 */
async function open(state, { route = "/", ready, beforeRoute } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  // 2x: as fotos servem para julgar detalhes pequenos (anel do aviso, desenhos dos estados vazios).
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
  if (beforeRoute) await beforeRoute(context, page);
  await page.goto(url + route);
  if (ready !== null) await expect(ready ? ready(page) : hojeWeek(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
}

const sheetTitle = (page, title) => page.getByRole("heading", { name: title, exact: true });
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const ring = (page) => page.getByTestId("calories-total");
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
async function shoot(page, file, locator) {
  // Avisos e painéis entram com esmaecimento: a foto espera a animação terminar.
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file) });
}
/** Alvo de toque com pelo menos 44 × 44 px de verdade (o react-native-web ignora hitSlop). */
async function touch44(locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.width < 44 - 0.5 || box.height < 44 - 0.5) throw Error(`${name}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
}
/** Sem rolagem lateral: nenhum elemento visível passa da largura da tela. */
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
/** Menor fonte de texto visível na página (px), ignorando o texto só para leitores de tela. */
async function smallestText(page) {
  return page.evaluate(() => {
    let min = Infinity;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
  });
}
/** Cor do traço do mini anel do aviso e o dasharray do arco. */
async function toastRing(toast) {
  return toast.getByTestId("toast-ring").evaluate((el) => {
    const arc = el.querySelector("path");
    return arc ? { stroke: getComputedStyle(arc).stroke, dash: arc.getAttribute("stroke-dasharray") } : null;
  });
}

// ---------- Esqueleto de abertura ----------
{
  const { page, context, errors } = await open(baseState(), {
    ready: null,
    // O banco abre num worker: atrasá-lo deixa a tela de abertura à vista por um instante.
    beforeRoute: (ctx) =>
      ctx.route(/worker-.*\.js$/, async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await r.continue();
      }),
  });
  await check("abertura: esqueleto com três cartões e o status para o leitor de tela", async () => {
    const boot = page.getByTestId("app-skeleton");
    await expect(boot).toBeVisible({ timeout: 5000 });
    // A foto vem primeiro: o banco atrasado só segura a abertura por uns 2,5 s.
    await page.screenshot({ path: path.join(shots, "390-abertura-esqueleto.png") });
    await expect(boot).toHaveAttribute("aria-busy", "true");
    await expect(boot.getByRole("status")).toHaveText("Abrindo seu espaço…");
    // Texto só para o leitor de tela (.sr-only): 1 px e transparente, fora da vista.
    const box = await boot.getByRole("status").boundingBox();
    if (!box || box.width > 1.5 || box.height > 1.5) throw Error(`status à vista: ${JSON.stringify(box)}`);
    // Três cartões: título, número grande e linhas (ou barras).
    const cards = await boot.evaluate((el) => [...el.children].filter((c) => getComputedStyle(c).borderTopWidth === "1px").length);
    if (cards !== 3) throw Error(`${cards} cartões`);
    await expect(boot).toBeVisible();
  });
  await check("abertura: o esqueleto dá lugar ao Hoje", async () => {
    await expect(hojeWeek(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("app-skeleton")).toHaveCount(0);
  });
  await check("abertura: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Hoje: aviso v2, anel, alvos de 44 px e celebração ----------
{
  const { page, context, errors } = await open(baseState({ habits: [habit("h1", WALK, true), habit("h2", TEA, false)] }));
  await check('aviso: "Copo +250 ml" mostra o mini anel azul em 50% no lugar do ícone', async () => {
    await page.getByRole("button", { name: "Copo +250 ml", exact: true }).click();
    const toast = toastWith(page, "+250 ml registrados.");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("data-testid", "toast-success");
    await expect(toast.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    const arc = await toastRing(toast);
    if (!arc) throw Error("sem arco no anel");
    if (arc.stroke !== rgb(palette.blue)) throw Error(`traço ${arc.stroke}`);
    if (arc.dash?.replace(/,/g, " ") !== arcDash(9, 50)) throw Error(`dasharray ${arc.dash} (esperado ${arcDash(9, 50)})`);
    const box = await toast.getByTestId("toast-ring").boundingBox();
    if (Math.round(box.width) !== 24 || Math.round(box.height) !== 24) throw Error(`anel ${box.width}×${box.height}`);
    await shoot(page, "390-aviso-agua.png", toast);
  });
  await check('aviso: "Desfazer" e "Fechar mensagem" com 44 × 44 px', async () => {
    const toast = toastWith(page, "+250 ml registrados.");
    await touch44(toast.getByRole("button", { name: "Desfazer", exact: true }), "Desfazer");
    await touch44(toast.getByRole("button", { name: "Fechar mensagem", exact: true }), "Fechar mensagem");
    await toast.getByRole("button", { name: "Fechar mensagem", exact: true }).click();
    await expect(page.getByText("+250 ml registrados.", { exact: true })).toHaveCount(0);
  });
  await check('toque de 44 px: "Como calculamos", "Opções dos combinados" e "Alterar data e horário"', async () => {
    await touch44(page.getByRole("button", { name: "Como calculamos", exact: true }), "Como calculamos");
    await touch44(page.getByRole("button", { name: "Opções dos combinados", exact: true }), "Opções dos combinados");
    await page.getByRole("button", { name: "Registrar água", exact: true }).click();
    await expect(sheetTitle(page, "Registrar água")).toBeVisible();
    await touch44(page.getByRole("button", { name: "Alterar data e horário", exact: true }), "Alterar data e horário");
    await sheetTitle(page, "Registrar água").locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(sheetTitle(page, "Registrar água")).toHaveCount(0);
  });
  await check('escala: "Como calculamos" com números da escala (32 px) e rótulos de 12 px, sem rolagem lateral', async () => {
    await page.getByRole("button", { name: "Como calculamos", exact: true }).click();
    await expect(sheetTitle(page, "Como calculamos")).toBeVisible();
    await noSideScroll(page);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await shoot(page, "390-como-calculamos.png");
    await sheetTitle(page, "Como calculamos").locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(sheetTitle(page, "Como calculamos")).toHaveCount(0);
  });
  await check("toque de 44 px: o \"⋯\" dos combinados desenha um círculo de 36 px (conceito 01) e o cabeçalho não cresce", async () => {
    const button = page.getByRole("button", { name: "Opções dos combinados", exact: true });
    const inner = await button.evaluate((el) => {
      const box = el.firstElementChild?.getBoundingClientRect();
      return box ? [box.width, box.height] : null;
    });
    if (!inner || Math.round(inner[0]) !== 36 || Math.round(inner[1]) !== 36) throw Error(`desenho ${inner}`);
  });
  await check('anel: "kcal consumidas" em duas linhas inteiras, dentro do anel de gordura', async () => {
    await ring(page).click();
    const caption = ring(page).getByText("kcal consumidas", { exact: true });
    await expect(caption).toBeVisible();
    const geometry = await caption.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = [...range.getClientRects()].filter((r) => r.width > 0);
      const svg = el.closest('[data-testid="calories-total"]').querySelector("svg").getBoundingClientRect();
      return {
        lines: lines.map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
        box: el.getBoundingClientRect().toJSON(),
        center: { x: svg.left + svg.width / 2, y: svg.top + svg.height / 2 },
        scale: svg.width / 164,
      };
    });
    const rows = [...new Set(geometry.lines.map((l) => Math.round(l.top)))];
    if (rows.length !== 2) throw Error(`${rows.length} linhas: ${JSON.stringify(geometry.lines)}`);
    // Anel de 164 px do web (DayHero): rótulo de até 80 px; borda interna do anel de gordura = raio 42 menos meio traço (3,5).
    if (geometry.box.width > 80.5) throw Error(`largura ${geometry.box.width}`);
    const inner = 38.5 * geometry.scale;
    for (const line of geometry.lines) {
      const dx = Math.max(Math.abs(line.left - geometry.center.x), Math.abs(line.right - geometry.center.x));
      const dy = Math.max(Math.abs(line.top - geometry.center.y), Math.abs(line.bottom - geometry.center.y));
      if (dx > inner || dy > inner) throw Error(`linha fora do anel: dx ${dx.toFixed(1)} dy ${dy.toFixed(1)} (raio ${inner})`);
    }
    await shoot(page, "390-anel-consumidas.png", ring(page));
    await ring(page).click();
  });
  await check("macros: MacroStat com o ponto na cor fixa de cada macro", async () => {
    for (const [key, hex] of [["protein", palette.green500], ["carbs", palette.blue], ["fat", palette.amber500]]) {
      const stat = page.getByTestId(`macro-stat-${key}`).first();
      await expect(stat).toBeVisible();
      const dot = await stat.evaluate((el) => {
        const found = [...el.querySelectorAll("div")].find((n) => {
          const box = n.getBoundingClientRect();
          return Math.round(box.width) === 8 && Math.round(box.height) === 8;
        });
        return found ? getComputedStyle(found).backgroundColor : "sem ponto";
      });
      if (dot !== rgb(hex)) throw Error(`${key}: ${dot}`);
    }
  });
  await check("celebração: excluir o combinado pendente fecha o dia sem brilho", async () => {
    const card = page.getByTestId("habits-card");
    await card.scrollIntoViewIfNeeded();
    // Como no web: "⋯" → "Editar combinados" mostra o "⋯" de cada linha; "Concluir" fecha a edição.
    await page.getByRole("button", { name: "Opções dos combinados", exact: true }).click();
    await page.getByRole("menuitem", { name: "Editar combinados", exact: true }).click();
    await page.getByRole("button", { name: `Opções de ${TEA}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Excluir combinado", exact: true }).click();
    await card.getByRole("button", { name: "Concluir", exact: true }).click();
    await expect(card.getByText("Tudo feito hoje", { exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await expect(card.getByTestId("celebration-glow")).toHaveCount(0);
  });
  await check("celebração: desfazer e marcar o combinado acende o brilho (controle)", async () => {
    const card = page.getByTestId("habits-card");
    await toastWith(page, "Combinado excluído.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await card.getByRole("button", { name: /^Tudo feito hoje\. Ver combinados$/ }).waitFor({ state: "detached" });
    await page.getByRole("checkbox", { name: new RegExp(`^${TEA}, `) }).click();
    await expect(card.getByTestId("celebration-glow")).toHaveCount(1);
  });
  await check('aviso: marcar o combinado mostra o anel esmeralda cheio ("Combinado concluído!")', async () => {
    const toast = toastWith(page, "Combinado concluído!");
    await expect(toast).toBeVisible();
    const arc = await toastRing(toast);
    if (arc?.stroke !== rgb(palette.emerald)) throw Error(`traço ${arc?.stroke}`);
    if (arc.dash?.replace(/,/g, " ") !== arcDash(9, 100)) throw Error(`dasharray ${arc.dash}`);
    await shoot(page, "390-aviso-combinado.png", toast);
  });
  await check("Hoje: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Refeição: aviso sem anel (seria uma pista de calorias) ----------
{
  const { page, context, errors } = await open(baseState(), { route: "/diario", ready: diaryReady });
  await check('aviso: "Repetir agora" de uma refeição mostra o ícone, nunca o anel', async () => {
    await page.getByRole("button", { name: "Mais ações: Café da manhã das 07:30", exact: true }).click();
    await page.getByRole("menuitem", { name: "Repetir agora", exact: true }).click();
    const message = page.getByText(/^Refeição registrada: .+, hoje às \d{2}:\d{2}\.$/);
    await expect(message).toBeVisible();
    const toast = message.locator("xpath=..");
    await expect(toast).toHaveAttribute("data-testid", "toast-success");
    await expect(toast.getByTestId("toast-ring")).toHaveCount(0);
    await expect(toast.locator("svg")).toHaveCount(2); // ícone de sucesso e o X de fechar
    await shoot(page, "390-aviso-refeicao.png", toast);
  });
  await check('busca: SearchField com lupa; "Limpar busca" (44 px) esvazia e devolve o foco', async () => {
    await page.getByRole("button", { name: "Buscar no diário", exact: true }).click();
    const field = page.getByLabel("Buscar em todo o diário", { exact: true });
    await expect(field).toBeFocused();
    await expect(page.getByRole("button", { name: "Limpar busca", exact: true })).toHaveCount(0);
    await field.fill("arroz");
    const clear = page.getByRole("button", { name: "Limpar busca", exact: true });
    await expect(clear).toBeVisible();
    await touch44(clear, "Limpar busca");
    await shoot(page, "390-busca-diario.png");
    await clear.click();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(clear).toHaveCount(0);
  });
  await check("Diário: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Falha ao gravar: aviso vermelho (rose-800) ----------
{
  const hundred = Array.from({ length: 100 }, (_, i) => habit(`hh${i}`, `Combinado ${i + 1}`, false));
  const { page, context, errors } = await open(baseState({ habits: hundred }));
  await check("aviso de erro: gravar além do limite mostra o aviso rose-800 com alerta", async () => {
    await page.getByRole("button", { name: "Opções dos combinados", exact: true }).click();
    await page.getByRole("menuitem", { name: "Novo combinado", exact: true }).click();
    await page.getByLabel("Nome do combinado", { exact: true }).fill("Alongar pela manhã");
    await page.getByRole("button", { name: "Salvar combinado", exact: true }).click();
    const toast = page.getByTestId("toast-error");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("role", "alert");
    // O erro do esquema não vira JSON na tela: a frase é a genérica.
    await expect(toast).toContainText("Não foi possível salvar.");
    const background = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (background !== rgb(palette.rose800)) throw Error(`fundo ${background}`);
    await expect(toast.getByTestId("toast-ring")).toHaveCount(0);
    await shoot(page, "390-aviso-erro.png", toast);
  });
  await check("falha: sem erros de página", async () => {
    // O console pode registrar o erro de validação; a página não pode quebrar.
    const pageErrors = errors.filter((e) => !/stateSchema|ZodError|too_big|Too big/i.test(e));
    if (pageErrors.length) throw Error(pageErrors.join(" | "));
  });
  await context.close();
}

// ---------- Estados vazios ilustrados ----------
{
  const { page, context, errors } = await open(baseState({ habits: [], diary: false }));
  await check("vazio: Combinados com o desenho de combinados e o texto de sempre", async () => {
    const card = page.getByTestId("habits-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId("empty-art-habits")).toBeVisible();
    await expect(card.getByText("Escolha um pequeno passo para começar.", { exact: true })).toBeVisible();
    const box = await card.getByTestId("empty-art-habits").boundingBox();
    if (Math.round(box.width) !== 88) throw Error(`desenho ${box.width}`);
    const fill = await card.getByTestId("empty-art-habits").evaluate((el) => el.querySelector("circle")?.getAttribute("fill"));
    if (fill?.toLowerCase() !== domainTone.habit.bg) throw Error(`fundo do desenho ${fill}`);
    await shoot(page, "390-vazio-combinados.png", card);
  });
  await check("vazio: Hoje sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(baseState({ habits: [], diary: false }), { route: "/diario", ready: diaryReady });
  await check("vazio: dia sem registros no Diário com o desenho do diário", async () => {
    await expect(page.getByTestId("empty-art-diary")).toBeVisible();
    await expect(
      page.getByText("Nenhum registro encontrado para este dia. Seus primeiros registros aparecerão aqui.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("empty-art-diary")).toHaveAttribute("aria-hidden", "true");
    await shoot(page, "390-vazio-diario.png");
  });
  await check("vazio: Diário sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Seringa e dose: escala tipográfica (antes 9–11,5 px) ----------
{
  const pen = { weightLossPen: "sim", weightLossPenName: "Semaglutida", weightLossPenDose: "0,5 mg", weightLossPenPerMonth: 4 };
  const state = baseState();
  const { page, context, errors } = await open({ ...state, profile: { ...state.profile, ...pen } }, {
    route: "/injecao",
    ready: (p) => p.getByTestId("injection-body-map"),
  });
  await check("escala: Seringa e dose sem texto abaixo de 12 px nem rolagem lateral", async () => {
    await noSideScroll(page);
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await shoot(page, "390-seringa-topo.png");
    await page.getByTestId("injection-body-map").scrollIntoViewIfNeeded();
    await noSideScroll(page);
    await shoot(page, "390-seringa-local.png");
  });
  await check("Seringa e dose: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Despensa: validade ----------
{
  const item = (id, name, days) => ({
    id,
    name,
    quantity: 1,
    unit: "un",
    location: "despensa",
    expiresOn: shiftDate(today, days),
    notes: "",
    source: "manual",
    updatedAt: new Date().toISOString(),
  });
  const pantry = [item("p-ok", "Arroz", 20), item("p-soon", "Iogurte", 2), item("p-old", "Pão de forma", -1)];
  const { page, context, errors } = await open(baseState({ extra: { pantry } }), {
    route: "/despensa",
    ready: (p) => p.getByText("Meus alimentos", { exact: true }),
  });
  await check("validade: pílula compacta (completa no aria-label); vencido com a frase inteira no aria-label e \"Ainda está bom?\"", async () => {
    for (const p of pantry.filter((i) => expiryStatus(i.expiresOn, today).tone !== "expired")) {
      const pill = expiryPill(p.expiresOn, today);
      const badge = page.getByTestId(`pantry-expiry-${pill.tone}`);
      await expect(badge).toHaveText(pill.compact);
      await expect(badge).toHaveAttribute("aria-label", pill.full);
    }
    await expect(page.getByTestId("pantry-expiry-expired")).toHaveCount(0);
    await expect(page.getByTestId("pantry-expired-pill")).toHaveAttribute("aria-label", /— não usado nas receitas$/);
    await expect(page.getByTestId("pantry-expired-meta")).toContainText("Ainda está bom?");
  });
  // Conceito 06: âmbar perto do fim, menta em dia; o rosa é só da pílula do vencido (é sobre o alimento, não o consumo).
  await check("validade: perto do fim em âmbar, em dia em menta; rosa só na pílula do vencido", async () => {
    const look = async (locator) =>
      locator.evaluate((el) => {
        const text = el.childNodes[0]?.nodeType === 3 ? el : [...el.querySelectorAll("*")].find((n) => n.childNodes[0]?.nodeType === 3);
        return { color: getComputedStyle(text).color, background: getComputedStyle(el).backgroundColor };
      });
    const soon = await look(page.getByTestId("pantry-expiry-soon"));
    if (soon.color !== rgb(palette.amber900)) throw Error(`soon: cor ${soon.color}`);
    if (soon.background !== rgb(palette.amber100)) throw Error(`soon: fundo ${soon.background}`);
    const expired = await look(page.getByTestId("pantry-expired-pill"));
    if (expired.color !== rgb(palette.rose700)) throw Error(`vencido: cor ${expired.color}`);
    const ok = await look(page.getByTestId("pantry-expiry-ok"));
    if (ok.color !== rgb(palette.green700)) throw Error(`ok: cor ${ok.color}`);
    const reds = [palette.rose600, palette.rose700, palette.rose800].map(rgb);
    const all = await page
      .locator('[data-testid^="pantry-expiry-"] *, [data-testid="pantry-expired-meta"] *')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    if (all.some((c) => reds.includes(c))) throw Error(`vermelho na validade: ${all.join(" ")}`);
    await shoot(page, "390-despensa-validade.png", page.getByTestId("pantry-expired-meta").locator("xpath=ancestor::*[@data-testid='pantry-row'][1]"));
  });
  await check("Despensa: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
