// Verificação da Onda 2 · Lote 7 (Despensa e receitas, conceito 06) no export web do app, a 390, 360 e 320 px:
// "Use primeiro" no topo, atalhos da lista e da foto, receitas em carrossel e os alimentos por local (Geladeira,
// Despensa) com o vencido no topo, "Por validade"/"Por nome", busca pela lupa do cabeçalho, linhas de 48–96 px com
// emoji e pílula compacta (âmbar perto do fim, menta em dia, rosa só no vencido, com "Ainda está bom?"), "⋯" →
// Remover + Desfazer (foco fora do <body>), folha "Adicionar alimentos" (captura em rádios, "Digitar", revisão
// compacta salva no SQLite, "Adicionar foto"), linha do "escaneando" (parada com movimento reduzido), calorias
// ocultas, folha "Novas receitas" com os básicos, receita estruturada (cartão, "Modo preparo", painel), receita
// antiga em texto, alvos de 44 px, texto ≥ 12 px e nenhuma rolagem lateral. Fotografa as telas na pasta indicada.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l7
//   node --import tsx scripts/o2l7-check.mjs dist/o2l7 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createDietPlan, dietProfileSignature } from "../../src/lib/diet.ts";
import { pantryTileText } from "../../src/lib/diet-week.ts";
import { formatDate, localDate, shiftDate } from "../../src/lib/domain.ts";
import { KITCHEN_BASICS, KITCHEN_BASICS_NONE_HINT } from "../../src/lib/kitchen-basics.ts";
import { pantrySignature } from "../../src/lib/pantry.ts";
import { expiryPill, groupByLocation, pantryEmoji } from "../../src/lib/pantry-view.ts";
import {
  coverageCount,
  RECIPE_EXPIRED_ITEM,
  RECIPE_REMOVED_ITEM,
  RECIPE_STALE_NOTICE,
  recipeCoverage,
  recipeSealLabel,
  renderRecipeSetText,
} from "../../src/lib/recipe-set.ts";
import { USE_FIRST_COPY } from "../../src/lib/use-first.ts";
import { CALORIE_PATTERN } from "../../src/lib/text.ts";
import { palette } from "../../src/design/tokens.ts";
import { stateSchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l7");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l7-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o2l7-seed-"));
const PORT = 3222;
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
/** PNG de 1 × 1 px para a foto da despensa. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const CALORIES = new RegExp(CALORIE_PATTERN.source, "i");
const META = { specialists: ["nutricionista"], reviewed: true, revisions: 0, urgency: "nenhuma", notes: [], llmCalls: 2 };

// ---------- Estado de teste ----------
const item = (id, name, location, days, quantity = 1, unit = "un") => ({
  id,
  name,
  quantity,
  unit,
  location,
  expiresOn: days === null ? null : shiftDate(today, days),
  notes: "",
  source: "manual",
  updatedAt: new Date().toISOString(),
});
/** Arroz sem validade, Iogurte e Tomate vencem em 2 dias, Queijo em 10, Leite venceu ontem. */
const PANTRY = [
  item("p-arroz", "Arroz", "despensa", null, 1, "kg"),
  item("p-iogurte", "Iogurte", "geladeira", 2),
  item("p-leite", "Leite", "geladeira", -1, 1, "l"),
  item("p-queijo", "Queijo", "geladeira", 10, 0.5, "kg"),
  item("p-tomate", "Tomate", "geladeira", 2, 3),
];
const recipeSet = (nome = "Arroz com tomate", compatibilidade = "Carboidrato e legumes, como no almoço da sua dieta.") => ({
  version: 2,
  receitas: [
    {
      nome,
      refeicao: "Almoço",
      porcoes: 2,
      tempoMin: 20,
      compatibilidade,
      ingredientesCasa: [
        { pantryItemId: "p-arroz", nome: "Arroz", quantidade: "1 xícara" },
        { pantryItemId: "p-tomate", nome: "Tomate", quantidade: "2 unidades" },
      ],
      basicos: [{ basico: "sal", quantidade: "a gosto" }],
      faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade" }],
      passos: [
        { texto: "Refogue o tomate.", timerMin: null, temperaturaC: null },
        { texto: "Junte o arroz e asse.", timerMin: 25, temperaturaC: 200 },
      ],
      porcao: "Sirva 1 porção e complete o prato com salada.",
    },
  ],
  perguntas: [],
});
const LEGACY_TEXT = "## Omelete de legumes\n**Refeição:** Jantar\n### Modo de preparo\n1. Bata os ovos.\n2. Cozinhe em fogo baixo.";

/** Perfil com IA autorizada, dieta atual, a despensa acima e as receitas (estruturada nova + texto antigo). */
function pantryState({ profile = {}, basics = [], set = recipeSet(), pantry = PANTRY } = {}) {
  const base = stateFixture();
  const fullProfile = { ...base.profile, consentAi: true, ...profile };
  const dietPlan = createDietPlan({ text: "## Almoço\n- Arroz e legumes", meta: META }, fullProfile);
  const common = {
    meta: META,
    dietPlanId: dietPlan.id,
    profileSignature: dietProfileSignature(fullProfile),
    pantrySignature: pantrySignature(pantry, basics),
  };
  const recipes = [
    { id: "r-old", text: LEGACY_TEXT, createdAt: new Date(Date.now() - 86_400_000).toISOString(), ...common },
    { id: "r-new", text: renderRecipeSetText(set), createdAt: new Date().toISOString(), recipeSet: set, ...common },
  ];
  // Mesmo esquema do app: um estado inválido seria recusado na abertura.
  return stateSchema.parse({ ...base, profile: fullProfile, dietPlan, pantry, kitchenBasics: basics, recipes });
}

// ---------- Harness ----------
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
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const inventoryReady = (page) => page.getByText("Meus alimentos", { exact: true });

let seeds = 0;
/**
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. Sem `agent`, as
 * chamadas ao servidor são recusadas; com ele, o servidor responde pronto e `agent(route, body)`
 * atende /api/agent.
 */
async function open(state, { width = 390, route = "/despensa", ready = inventoryReady, agent, reducedMotion } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, ...(reducedMotion ? { reducedMotion } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/api/**", async (r) => {
    const request = r.request();
    if (!agent) return r.abort("connectionrefused");
    if (request.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/status")
      return r.fulfill({ json: { ready: true, token: "test-token", providers: { deepseek: true, openai: false } }, headers: cors });
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
/** Menor fonte de texto visível na tela (px). */
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
/** Nenhuma menção numérica a calorias no texto visível, nos nomes acessíveis nem nos campos. */
async function noCalories(page, where) {
  const found = await page.evaluate((source) => {
    const re = new RegExp(source, "i");
    const texts = [
      document.body.innerText,
      ...[...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") ?? ""),
      ...[...document.querySelectorAll("input, textarea")].map((el) => el.value),
    ];
    for (const text of texts) {
      const m = re.exec(text);
      if (m) return text.slice(Math.max(0, m.index - 30), m.index + 12);
    }
    return "";
  }, CALORIE_PATTERN.source);
  if (found) throw Error(`${where}: calorias à vista ("${found}")`);
}
/** Todos os alvos do seletor com pelo menos 44 × 44 px. */
async function minTargets(locator, what) {
  const boxes = await locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return [el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", r.width, r.height];
    }),
  );
  if (!boxes.length) throw Error(`${what}: nenhum alvo`);
  const small = boxes.filter(([, w, h]) => w < 43.5 || h < 43.5);
  if (small.length) throw Error(`${what}: ${small.map(([n, w, h]) => `${n} ${w.toFixed(1)}×${h.toFixed(1)}`).join(" | ")}`);
}
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const ROSES = [palette.rose50, palette.rose200, palette.rose400, palette.rose600, palette.rose700, palette.rose800].map(rgb);
/** Nenhum tom rosa (vermelho) em cor, fundo ou borda dentro do seletor. */
async function noRose(page, selector) {
  const hits = await page.locator(selector).evaluateAll(
    (els, roses) =>
      els
        .flatMap((el) => [el, ...el.querySelectorAll("*")])
        .flatMap((el) => {
          const s = getComputedStyle(el);
          return [s.color, s.backgroundColor, s.borderTopColor].filter((c) => roses.includes(c));
        }),
    ROSES,
  );
  if (hits.length) throw Error(`vermelho: ${hits.join(" ")}`);
}
/** Foto da tela; uma foto que falha (máquina ocupada) só avisa, sem derrubar as verificações. */
async function shoot(page, file) {
  await page.waitForTimeout(450);
  try {
    await page.screenshot({ path: path.join(shots, file), timeout: 45000 });
  } catch (error) {
    console.log(`AVISO: foto ${file} não tirada (${String(error?.message ?? error).split("\n")[0]})`);
  }
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const heading = (scope, name) => scope.getByRole("heading", { name, exact: true });
/** A folha "Adicionar alimentos" abre pelo "+" do cabeçalho (conceito 06: o formulário saiu da tela). */
async function openAdd(page) {
  await button(page, "Adicionar alimentos").click();
  await expect(heading(page, "Adicionar alimentos")).toBeVisible();
}
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
const rowNames = (page) =>
  page.getByTestId("pantry-row").evaluateAll((els) => els.map((el) => el.querySelector('[role="heading"]')?.textContent ?? ""));
const focusedIsBody = (page) => page.evaluate(() => !document.activeElement || document.activeElement === document.body);

// ---------- Inventário por local, receitas e básicos (390 px) ----------
{
  const state = pantryState();
  const { page, context, errors } = await open(state);
  await shoot(page, "390-despensa.png");
  const listNames = (name) =>
    page
      .getByRole("list", { name, exact: true })
      .getByTestId("pantry-row")
      .evaluateAll((els) => els.map((el) => el.querySelector('[role="heading"]')?.textContent ?? ""));
  const expectGroups = async (sort) => {
    for (const group of groupByLocation(PANTRY, sort, today))
      await expect.poll(() => listNames(group.label)).toEqual(group.items.map((i) => i.name));
  };
  await check('ordem da tela: "Use primeiro", atalhos, receitas e "Meus alimentos" (sem o resumo nem o filtro por local)', async () => {
    const card = page.getByTestId("use-first-card");
    const cardBox = await card.boundingBox();
    const shortcutBox = await page.getByRole("button", { name: /^Lista de compras/ }).boundingBox();
    const recipeBox = await page.getByTestId("recipe-card").boundingBox();
    const inventoryBox = await page.getByRole("list", { name: "Geladeira", exact: true }).boundingBox();
    if (shortcutBox.y < cardBox.y + cardBox.height) throw Error("atalhos antes do Use primeiro");
    if (recipeBox.y < shortcutBox.y + shortcutBox.height) throw Error("receitas antes dos atalhos");
    if (inventoryBox.y < recipeBox.y + recipeBox.height) throw Error("alimentos antes das receitas");
    await expect(page.getByTestId("pantry-summary")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Filtrar por local", exact: true })).toHaveCount(0);
    await expect(page.getByText(`${PANTRY.length} itens`, { exact: true })).toBeVisible();
  });
  await check('Use primeiro: Iogurte e Tomate em blocos e "Receitas com eles" (desligado com o agente offline)', async () => {
    const card = page.getByTestId("use-first-card");
    await expect(card.getByTestId("use-first-chip")).toHaveCount(2);
    const go = button(card, USE_FIRST_COPY.create);
    await expect(go).toContainText(USE_FIRST_COPY.recipes);
    await expect(go).toBeDisabled();
  });
  await check('locais: "Geladeira" e "Despensa" (listas nomeadas), o vencido no topo e depois pela validade', async () => {
    await expectGroups("validade");
  });
  await check('ordem: "Ordenar alimentos: Por validade" → "Por nome" reordena; o vencido continua no topo', async () => {
    await button(page, "Ordenar alimentos: Por validade").click();
    const options = page.getByRole("radiogroup", { name: "Ordenar alimentos", exact: true });
    await expect(options.getByRole("radio", { name: "Por validade", exact: true })).toHaveAttribute("aria-checked", "true");
    await options.getByRole("radio", { name: "Por nome", exact: true }).click();
    await expectGroups("nome");
    await button(page, "Ordenar alimentos: Por nome").click();
    await page.getByRole("radiogroup", { name: "Ordenar alimentos", exact: true }).getByRole("radio", { name: "Por validade", exact: true }).click();
    await expectGroups("validade");
  });
  await check('busca: a lupa "Buscar alimentos" abre "Buscar nos meus alimentos", acha sem acento ("IOGUR") e fecha', async () => {
    const toggle = button(page, "Buscar alimentos");
    await expect(page.getByLabel("Buscar nos meus alimentos", { exact: true })).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const search = page.getByLabel("Buscar nos meus alimentos", { exact: true });
    await search.fill("IOGUR");
    await expect.poll(() => rowNames(page)).toEqual(["Iogurte"]);
    await toggle.click();
    await expect(search).toHaveCount(0);
    await expect.poll(async () => (await rowNames(page)).length).toBe(PANTRY.length);
  });
  await check("linhas: 48–96 px de altura, cada uma com o emoji de pantryEmoji", async () => {
    const rows = page.getByTestId("pantry-row");
    const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    if (heights.some((h) => h < 47.5 || h > 96)) throw Error(heights.join(" "));
    for (const p of PANTRY) {
      const row = rows.filter({ has: page.getByRole("heading", { name: p.name, exact: true }) });
      await expect(row).toContainText(pantryEmoji(p.name));
    }
  });
  await check('linhas: a quantidade sem o local ("0,5 kg") e pílulas compactas ("2 dias") com o texto completo no aria-label', async () => {
    await expect(page.getByText("0,5 kg", { exact: true })).toBeVisible();
    await expect(page.getByText(/ · (Geladeira|Despensa)$/)).toHaveCount(0);
    for (const p of PANTRY.filter((i) => i.expiresOn && i.expiresOn >= today)) {
      const pill = expiryPill(p.expiresOn, today);
      const row = page.getByTestId("pantry-row").filter({ has: page.getByRole("heading", { name: p.name, exact: true }) });
      const el = row.getByTestId(`pantry-expiry-${pill.tone}`);
      await expect(el).toHaveText(pill.compact);
      await expect(el).toHaveAttribute("aria-label", pill.full);
    }
  });
  await check('validade: âmbar perto do fim, menta em dia e rosa só na pílula do vencido, com "Ainda está bom?"', async () => {
    const lookOf = (locator) =>
      locator.evaluate((el) => {
        const text = [...el.querySelectorAll("*")].find((n) => n.childNodes[0]?.nodeType === 3);
        return { color: getComputedStyle(text).color, background: getComputedStyle(el).backgroundColor };
      });
    const soon = await lookOf(page.getByTestId("pantry-expiry-soon").first());
    if (soon.color !== rgb(palette.amber900) || soon.background !== rgb(palette.amber100)) throw Error(`perto do fim: ${soon.color} em ${soon.background}`);
    const ok = await lookOf(page.getByTestId("pantry-expiry-ok"));
    if (ok.color !== rgb(palette.green700) || ok.background !== rgb(palette.mint50)) throw Error(`em dia: ${ok.color} em ${ok.background}`);
    const expired = page.getByTestId("pantry-expired-pill");
    await expect(expired).toHaveText(expiryPill(shiftDate(today, -1), today).compact);
    await expect(expired).toHaveAttribute("aria-label", /— não usado nas receitas$/);
    const rose = await lookOf(expired);
    if (rose.color !== rgb(palette.rose700) || rose.background !== rgb(palette.rose50)) throw Error(`vencido: ${rose.color} em ${rose.background}`);
    const meta = page.getByTestId("pantry-expired-meta");
    await expect(meta).toContainText("Ainda está bom?");
    await expect(button(meta, "Atualizar Leite")).toBeVisible();
    await expect(button(meta, "Remover Leite")).toBeVisible();
  });
  await check("sem rosa fora da pílula do vencido (Use primeiro, pílulas em dia e perto do fim, receita)", async () => {
    await noRose(page, '[data-testid="use-first-card"], [data-testid="pantry-expiry-soon"], [data-testid="pantry-expiry-ok"], [data-testid="recipe-card"]');
  });
  await check('receita: título, "Almoço · 20 min · 2 porções", selo "Usa o tomate", cobertura com os básicos e "Falta: cebola"', async () => {
    const card = page.getByTestId("recipe-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("heading", { name: "Arroz com tomate", exact: true })).toBeVisible();
    for (const chip of ["Almoço", "20 min", "2 porções"]) await expect(card.getByText(chip, { exact: true })).toBeVisible();
    const seal = card.getByTestId("recipe-seal");
    const pill = expiryPill(shiftDate(today, 2), today);
    await expect(seal).toHaveText(recipeSealLabel("Tomate"));
    await expect(seal).toHaveAttribute("aria-label", `Usa Tomate, que ${pill.full.toLocaleLowerCase("pt-BR")}`);
    // Nenhum básico marcado: o sal da receita conta como falta ("2 de 4").
    const coverage = recipeCoverage(recipeSet().receitas[0], PANTRY, today, []);
    await expect(card.getByTestId("recipe-coverage")).toHaveText(`${coverageCount(coverage)} ingredientes em casa`);
    await expect(card.getByText("Falta: cebola", { exact: true })).toBeVisible();
    await expect(button(card, "Lista: incluir o que falta de Arroz com tomate")).toBeVisible();
    await expect(button(card, "Modo preparo: Arroz com tomate")).toBeVisible();
  });
  await shoot(page, "390-receita-cartao.png");
  await check("alvos de 44 px: cabeçalho, atalhos, Novas, Receitas com eles, receita, ordenar, ⋯ e Atualizar/Remover", async () => {
    await minTargets(page.getByRole("button", { name: /^(Buscar alimentos|Adicionar alimentos)$/ }), "cabeçalho");
    await minTargets(page.getByRole("button", { name: /^(Lista de compras|Adicionar foto)/ }), "atalhos");
    await minTargets(button(page, "Criar novas receitas"), "Novas");
    await minTargets(button(page, USE_FIRST_COPY.create), "Receitas com eles");
    await minTargets(page.getByRole("button", { name: /^(Modo preparo|Lista: incluir)/ }), "receita");
    await minTargets(page.getByRole("button", { name: /^Ordenar alimentos: / }), "ordenar");
    await minTargets(page.getByRole("button", { name: /^Mais ações: / }), "⋯");
    await minTargets(page.getByRole("button", { name: /^(Atualizar|Remover) Leite$/ }), "vencido");
  });
  await check('receita: "Modo preparo: Arroz com tomate" abre o painel com as seções, a lista do preparo e 25 min / 200 °C', async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    const sheet = page.getByTestId("recipe-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arroz com tomate", exact: true })).toHaveCount(2);
    const home = sheet.getByRole("list", { name: "Na sua cozinha", exact: true });
    await expect(home.getByRole("listitem")).toHaveCount(2);
    await expect(home).toContainText("Arroz");
    await expect(home).toContainText("Tomate");
    await expect(sheet.getByRole("list", { name: "Básicos da cozinha", exact: true })).toContainText("Sal");
    await expect(sheet.getByRole("list", { name: "Falta comprar", exact: true })).toContainText("Cebola");
    await expect(sheet.getByRole("list", { name: "Modo de preparo", exact: true }).getByRole("listitem")).toHaveCount(2);
    await expect(sheet.getByText("25 min", { exact: true })).toBeVisible();
    await expect(sheet.getByText("200 °C", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Porção", exact: true })).toBeVisible();
  });
  await shoot(page, "390-receita-painel.png");
  await check('modo preparo: "Passo 1 de 2" com foco → "Próximo passo" → "Concluir preparo" volta com foco em "Começar modo preparo"', async () => {
    await button(page, "Começar modo preparo").click();
    await expect(page.getByTestId("recipe-step-mode")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Passo 1 de 2", exact: true })).toBeFocused();
    await expect(button(page, "Passo anterior")).toBeDisabled();
    await expect(page.getByText("Refogue o tomate.", { exact: true })).toBeVisible();
    await button(page, "Próximo passo").click();
    await expect(page.getByRole("heading", { name: "Passo 2 de 2", exact: true })).toBeFocused();
    await expect(page.getByTestId("recipe-step-mode").getByText("25 min", { exact: true })).toBeVisible();
    await shoot(page, "390-modo-preparo.png");
    await button(page, "Concluir preparo").click();
    await expect(page.getByTestId("recipe-step-mode")).toHaveCount(0);
    await expect(button(page, "Começar modo preparo")).toBeFocused();
    await button(page, "Fechar").click();
    await expect(page.getByTestId("recipe-sheet")).toHaveCount(0);
  });
  await check('receita antiga: "Receitas anteriores (1)" com aria-expanded e o texto em RichText', async () => {
    const toggle = button(page, "Receitas anteriores (1)");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("recipe-legacy")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("recipe-legacy")).toBeVisible();
    await expect(page.getByTestId("recipe-legacy")).toContainText("Omelete de legumes");
    await expect(page.getByTestId("recipe-legacy")).toContainText("Bata os ovos.");
  });
  await check('"Criar novas receitas" abre "Novas receitas" com os 12 básicos nomeados só pelo rótulo e a dica de nenhum marcado', async () => {
    await button(page, "Criar novas receitas").click();
    await expect(heading(page, "Novas receitas")).toBeVisible();
    const chips = page.getByTestId("kitchen-basics").getByRole("button");
    const names = await chips.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    if (names.join("|") !== KITCHEN_BASICS.map((b) => b.label).join("|")) throw Error(names.join("|"));
    await expect(page.getByText(KITCHEN_BASICS_NONE_HINT, { exact: true })).toBeVisible();
    await expect(page.getByText("0 marcados", { exact: true })).toBeVisible();
    await minTargets(chips, "básicos");
    // Agente offline: gerar fica desligado.
    await expect(button(page, "Criar receitas com meus alimentos")).toBeDisabled();
  });
  await check("texto: nada abaixo de 12 px na Despensa (com a folha de receitas aberta)", async () => {
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check('básicos: "Sal" marca (aria-pressed), some a dica e, fechada a folha, a receita vira "Estoque alterado"', async () => {
    const sal = button(page.getByTestId("kitchen-basics"), "Sal");
    await sal.click();
    await expect(sal).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(KITCHEN_BASICS_NONE_HINT, { exact: true })).toHaveCount(0);
    await expect(page.getByText("1 marcado", { exact: true })).toBeVisible();
    await button(page, "Fechar").click();
    await expect(heading(page, "Novas receitas")).toHaveCount(0);
    await expect(page.getByText("Estoque alterado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(RECIPE_STALE_NOTICE, { exact: true }).first()).toBeVisible();
    // A geração mais nova vem primeiro (a antiga, aberta acima, também ficou desatualizada).
    const consult = button(page, "Consultar receitas").first();
    await expect(consult).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("recipe-card")).toHaveCount(0);
    await consult.click();
    await expect(button(page, "Ocultar receitas").first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("recipe-card")).toHaveCount(1);
  });
  await shoot(page, "390-basicos.png");
  await check("sem rolagem lateral e sem erros de página nem de console (390)", async () => {
    await noSideScroll(page);
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check('básicos: "Sal" persiste no SQLite', async () => {
    const saved = await readState(page, "basicos");
    if (JSON.stringify(saved.kitchenBasics) !== '["sal"]') throw Error(JSON.stringify(saved.kitchenBasics));
    if (saved.pantry.length !== PANTRY.length) throw Error(`despensa com ${saved.pantry.length}`);
  });
  await context.close();
}

// ---------- "⋯" → Remover, foco e Desfazer ----------
{
  const { page, context, errors } = await open(pantryState());
  const menuFor = (name) => button(page, `Mais ações: ${name}`);
  await check('"⋯" → Remover tira a linha, o foco não cai no <body> e "Desfazer" devolve', async () => {
    await menuFor("Queijo").click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Editar", exact: true })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Remover", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Queijo", exact: true })).toHaveCount(0);
    await page.waitForTimeout(800);
    if (await focusedIsBody(page)) throw Error("foco no <body>");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent);
    if (!/^Mais ações: |Meus alimentos/.test(focused ?? "")) throw Error(`foco em ${focused}`);
    await toastWith(page, "Queijo removido.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Queijo", exact: true })).toBeVisible();
  });
  await check('"⋯" → Editar abre "Editar alimento" com o nome no campo', async () => {
    await menuFor("Arroz").click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Editar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar alimento", exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Arroz");
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toBeFocused({ timeout: 3000 });
    await expect(page.getByLabel("Quantidade do item 1", { exact: true })).toHaveValue("1");
    // Na edição, descartar fecha a folha.
    await button(page, "Descartar revisão").click();
    await expect(heading(page, "Editar alimento")).toHaveCount(0);
    await expect(button(page, "Adicionar alimentos")).toBeVisible();
  });
  await check('vencido: "Atualizar Leite" abre "Editar alimento" com o Leite; "Remover Leite" tira a linha com Desfazer', async () => {
    await button(page, "Atualizar Leite").click();
    await expect(heading(page, "Editar alimento")).toBeVisible();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Leite");
    await button(page, "Fechar").click();
    await expect(heading(page, "Editar alimento")).toHaveCount(0);
    // Com a revisão guardada (folha fechada), editar e remover ficam travados; "+" reabre a revisão para descartar.
    await expect(button(page, "Remover Leite")).toBeDisabled();
    await button(page, "Adicionar alimentos").click();
    await button(page, "Descartar revisão").click();
    await expect(heading(page, "Editar alimento")).toHaveCount(0);
    await button(page, "Remover Leite").click();
    await expect(page.getByRole("heading", { name: "Leite", exact: true })).toHaveCount(0);
    await toastWith(page, "Leite removido.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Leite", exact: true })).toBeVisible();
  });
  await check("remover de novo grava a despensa sem o item (SQLite)", async () => {
    await menuFor("Queijo").click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Remover", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Queijo", exact: true })).toHaveCount(0);
    if (errors.length) throw Error(errors.join(" | "));
    const saved = await readState(page, "remover");
    const names = saved.pantry.map((i) => i.name).sort();
    if (names.join("|") !== "Arroz|Iogurte|Leite|Tomate") throw Error(names.join("|"));
  });
  await context.close();
}

// ---------- Captura e revisão compacta (390 px) ----------
{
  const { page, context, errors } = await open({ ...pantryState(), pantry: [], recipes: [] });
  await check('vazio: "Nenhum alimento cadastrado ainda…", sem "Use primeiro" e "Criar receitas" no lugar do carrossel', async () => {
    await expect(page.getByText("Nenhum alimento cadastrado ainda. Fotografe ou digite os alimentos que você tem.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("use-first-card")).toHaveCount(0);
    await expect(button(page, "Criar receitas")).toBeVisible();
  });
  await check('"Adicionar alimentos" (o + do cabeçalho) abre a folha com o formulário', async () => {
    await openAdd(page);
    await expect(page.getByText("Fotografe ou digite. Você revisa tudo antes de salvar.", { exact: true })).toBeVisible();
  });
  await check('captura: rádios "O que está na foto?" (2, aria-checked) com ≥ 104 px e "Digitar…"', async () => {
    const group = page.getByRole("radiogroup", { name: "O que está na foto?", exact: true });
    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(2);
    await expect(radios.first()).toHaveAttribute("aria-checked", "true");
    const shopping = group.getByRole("radio", { name: /compras realizadas/i });
    await shopping.click();
    await expect(shopping).toHaveAttribute("aria-checked", "true");
    await expect(radios.first()).toHaveAttribute("aria-checked", "false");
    const typeTile = button(page, "Digitar: cadastrar item manualmente");
    for (const el of [radios.first(), radios.last(), typeTile]) {
      const box = await el.boundingBox();
      if (box.height < 104 || box.width < 44) throw Error(`bloco ${box.width}×${box.height}`);
    }
    await expect(button(page, "Galeria")).toBeVisible();
    await expect(button(page, "Tirar foto")).toBeVisible();
  });
  await shoot(page, "390-adicionar.png");
  await check('"Digitar…" abre a revisão; "Diminuir" desativado sem quantidade; "Aumentar" 1 → 2 e o campo mostra "2"', async () => {
    await button(page, "Digitar: cadastrar item manualmente").click();
    await expect(page.getByRole("heading", { name: "Revise os itens antes de salvar", exact: true })).toBeVisible();
    await page.getByLabel("Nome do item 1", { exact: true }).fill("Ovos");
    const minus = button(page, "Diminuir quantidade do item 1");
    const plus = button(page, "Aumentar quantidade do item 1");
    const qty = page.getByLabel("Quantidade do item 1", { exact: true });
    await expect(qty).toHaveValue("");
    await expect(qty).toHaveAttribute("placeholder", "Não informada");
    await expect(minus).toBeDisabled();
    await plus.click();
    await expect(qty).toHaveValue("1");
    await expect(minus).toBeDisabled();
    await plus.click();
    await expect(qty).toHaveValue("2");
    await expect(minus).toBeEnabled();
  });
  const plus3 = shiftDate(today, 3);
  await check('"+3 dias de validade do item 1" marca (aria-pressed) e a data aparece no campo', async () => {
    const chip = button(page, "+3 dias de validade do item 1");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, "+7 dias de validade do item 1")).toHaveAttribute("aria-pressed", "false");
    await expect(button(page, `Validade: ${formatDate(plus3)}`)).toBeVisible();
    await expect(button(page, "Limpar validade")).toBeVisible();
  });
  await check('"Guardar item 1 em" (grupo com aria-pressed) escolhe Geladeira', async () => {
    const group = page.getByRole("group", { name: "Guardar item 1 em", exact: true });
    await button(group, "Geladeira").click();
    await expect(button(group, "Geladeira")).toHaveAttribute("aria-pressed", "true");
    await expect(button(group, "Despensa")).toHaveAttribute("aria-pressed", "false");
  });
  await check('"Observação do item 1": aria-expanded false → true e o campo aparece', async () => {
    const toggle = button(page, "Observação do item 1");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Observações do item 1", { exact: true })).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.getByLabel("Observações do item 1", { exact: true }).fill("Caipiras");
  });
  await check("alvos de 44 px na revisão: −/+, validade, unidades, local e remover", async () => {
    await button(page, "Adicionar outro item").click();
    await expect(page.getByLabel("Nome do item 2", { exact: true })).toBeFocused();
    await minTargets(page.getByRole("button", { name: /quantidade do item 1$/ }), "−/+");
    await minTargets(page.getByRole("button", { name: /dias de validade do item 1$/ }), "validade");
    await minTargets(page.getByRole("group", { name: "Unidade do item 1", exact: true }).getByRole("button"), "unidades");
    await minTargets(page.getByRole("group", { name: "Guardar item 1 em", exact: true }).getByRole("button"), "local");
    await minTargets(page.getByRole("button", { name: /^Remover item \d da revisão$/ }), "remover");
    await button(page, "Remover item 2 da revisão").click();
    await expect(page.getByTestId("pantry-draft-row")).toHaveCount(1);
    await expect(button(page, "Adicionar outro item")).toBeFocused();
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page);
  });
  await shoot(page, "390-revisao.png");
  await check('"Confirmar e salvar itens" → "Alimentos salvos." e a linha aparece no inventário', async () => {
    await button(page, "Confirmar e salvar itens").click();
    await expect(page.getByText("Alimentos salvos.", { exact: true })).toBeVisible();
    await expect(heading(page, "Adicionar alimentos")).toHaveCount(0);
    const fridge = page.getByRole("list", { name: "Geladeira", exact: true });
    await expect(fridge.getByRole("heading", { name: "Ovos", exact: true })).toBeVisible();
    await expect(fridge.getByText("2 unidades", { exact: true })).toBeVisible();
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("SQLite: Ovos com quantidade 2, validade +3 d, geladeira e observação", async () => {
    const saved = await readState(page, "revisao");
    const ovos = saved.pantry.find((i) => i.name === "Ovos");
    if (!ovos) throw Error("Ovos não salvo");
    const got = [ovos.quantity, ovos.unit, ovos.expiresOn, ovos.location, ovos.notes, ovos.source].join("|");
    const want = [2, "un", plus3, "geladeira", "Caipiras", "manual"].join("|");
    if (got !== want) throw Error(`${got} ≠ ${want}`);
  });
  await context.close();
}

// ---------- Reconhecimento por foto: linha do "escaneando" e calorias ocultas ----------
const SCAN_REPLY = {
  text: "Itens reconhecidos na foto de teste.",
  meta: { ...META, specialists: [] },
  inventoryDraft: {
    items: [{ name: "Barra de cereal 200 kcal", quantity: 2, unit: "un", location: "despensa", expiresOn: null, notes: "Cerca de 200 kcal cada" }],
    notes: "A embalagem informa 200 kcal por unidade.",
  },
};
/** Responde ao reconhecimento depois de `delay` ms (tempo para ver a linha do "escaneando"). */
const slowScan = (delay) => async (route) => {
  await new Promise((resolve) => setTimeout(resolve, delay));
  await route.fulfill({ json: SCAN_REPLY, headers: cors }).catch(() => undefined);
};
async function pickPhoto(page) {
  if (!(await button(page, "Galeria").isVisible())) await openAdd(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, "Galeria").click()]);
  await chooser.setFiles({ name: "despensa.png", mimeType: "image/png", buffer: PHOTO });
  await expect(page.getByRole("img", { name: "Foto selecionada", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(button(page, "Reconhecer itens da foto")).toBeEnabled();
}
/** O atalho "Adicionar foto" abre a galeria e, com a foto, a folha "Adicionar alimentos". */
async function pickPhotoFromShortcut(page) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, "Adicionar foto").click()]);
  await chooser.setFiles({ name: "despensa.png", mimeType: "image/png", buffer: PHOTO });
  await expect(heading(page, "Adicionar alimentos")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("img", { name: "Foto selecionada", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(button(page, "Reconhecer itens da foto")).toBeEnabled();
}
const overlayTransform = (page) => page.getByTestId("pantry-scan-overlay").evaluate((el) => getComputedStyle(el).transform);
{
  const { page, context, errors } = await open(pantryState({ profile: { hideCalories: true } }), { agent: slowScan(2500) });
  await check('reconhecer: "Adicionar foto" abre a folha com a foto; a linha do "escaneando" aparece e se move', async () => {
    await pickPhotoFromShortcut(page);
    await button(page, "Reconhecer itens da foto").click();
    const overlay = page.getByTestId("pantry-scan-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByText("Reconhecendo os alimentos da foto…", { exact: true })).toBeVisible();
    await expect(button(page, "Cancelar solicitação")).toBeVisible();
    const first = await overlayTransform(page);
    await page.waitForTimeout(400);
    const second = await overlayTransform(page);
    if (first === second) throw Error(`linha parada (${first})`);
  });
  await check("calorias ocultas: notas e rascunho do reconhecimento chegam mascarados (texto, nomes e campos)", async () => {
    await expect(page.getByRole("heading", { name: "Revise os itens antes de salvar", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pantry-scan-overlay")).toHaveCount(0);
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue(/^Barra de cereal calorias ocultas$/);
    await expect(page.getByText(/calorias ocultas por unidade/)).toBeVisible();
    await noCalories(page, "revisão do reconhecimento");
    if (errors.length) throw Error(errors.join(" | "));
  });
  await shoot(page, "390-reconhecimento-calorias-ocultas.png");
  await context.close();
}
{
  const { page, context } = await open(pantryState(), { agent: slowScan(2500), reducedMotion: "reduce" });
  await check('movimento reduzido: o "escaneando" é um véu parado (transform igual entre dois quadros)', async () => {
    await pickPhoto(page);
    await button(page, "Reconhecer itens da foto").click();
    await expect(page.getByTestId("pantry-scan-overlay")).toBeVisible();
    const first = await overlayTransform(page);
    await page.waitForTimeout(400);
    const second = await overlayTransform(page);
    if (first !== second) throw Error(`${first} → ${second}`);
  });
  await check('"Cancelar solicitação" mostra o aviso no cartão de adicionar (um só role="alert")', async () => {
    await button(page, "Cancelar solicitação").click();
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(page.getByRole("alert")).toContainText("Solicitação cancelada");
    await expect(page.getByTestId("pantry-scan-overlay")).toHaveCount(0);
  });
  await context.close();
}

// ---------- Receita estruturada com calorias ocultas ----------
{
  const set = recipeSet("Arroz 300 kcal com tomate", "Almoço leve, com 300 kcal, como na sua dieta.");
  const { page, context, errors } = await open(pantryState({ profile: { hideCalories: true }, set }));
  await check("calorias ocultas: cartão, nomes acessíveis e painel da receita sem calorias", async () => {
    await expect(page.getByTestId("recipe-card")).toHaveCount(1);
    await noCalories(page, "cartão");
    const openButton = page.getByRole("button", { name: /^Modo preparo: / });
    await expect(openButton).toHaveAttribute("aria-label", "Modo preparo: Arroz calorias ocultas com tomate");
    await openButton.click();
    await expect(page.getByTestId("recipe-sheet")).toBeVisible();
    await expect(page.getByTestId("recipe-sheet")).toContainText("Almoço leve, com calorias ocultas, como na sua dieta.");
    await noCalories(page, "painel");
    await button(page, "Começar modo preparo").click();
    await noCalories(page, "modo preparo");
    if (errors.length) throw Error(errors.join(" | "));
  });
  await shoot(page, "390-receita-calorias-ocultas.png");
  await context.close();
}

// ---------- Receita com um item da casa vencido (Leite) e outro removido (Canela) ----------
{
  const set = recipeSet("Arroz-doce", "Sobremesa simples, como no lanche da sua dieta.");
  set.receitas[0].ingredientesCasa = [
    { pantryItemId: "p-arroz", nome: "Arroz", quantidade: "1 xícara" },
    { pantryItemId: "p-leite", nome: "Leite", quantidade: "2 xícaras" },
    { pantryItemId: "p-canela", nome: "Canela", quantidade: "1 pitada" },
  ];
  const { page, context, errors } = await open(pantryState({ set }));
  await check(`painel: "Leite · ${RECIPE_EXPIRED_ITEM}" e "Canela · ${RECIPE_REMOVED_ITEM}"; o Arroz sem rótulo`, async () => {
    await button(page, "Modo preparo: Arroz-doce").click();
    const home = page.getByTestId("recipe-sheet").getByRole("list", { name: "Na sua cozinha", exact: true });
    const row = (name) => home.getByRole("listitem").filter({ hasText: name });
    await expect(row("Leite")).toContainText(`· ${RECIPE_EXPIRED_ITEM}`);
    await expect(row("Leite")).not.toContainText(RECIPE_REMOVED_ITEM);
    await expect(row("Canela")).toContainText(`· ${RECIPE_REMOVED_ITEM}`);
    await expect(row("Arroz")).not.toContainText(RECIPE_EXPIRED_ITEM);
    await expect(row("Arroz")).not.toContainText(RECIPE_REMOVED_ITEM);
  });
  await check('"Começar modo preparo" desativado com a dica de 12 px "Um ingrediente venceu: gere novas receitas."', async () => {
    const start = button(page, "Começar modo preparo");
    await expect(start).toBeDisabled();
    const hint = page.getByTestId("recipe-expired-hint");
    await expect(hint).toHaveText("Um ingrediente venceu: gere novas receitas.");
    const size = await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (size !== 12) throw Error(`dica com ${size} px`);
    await start.click({ force: true });
    await expect(page.getByTestId("recipe-step-mode")).toHaveCount(0);
  });
  await shoot(page, "390-receita-item-vencido.png");
  await check("receita com item vencido: texto ≥ 12 px, sem rolagem lateral nem erros", async () => {
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page);
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Editar item com calorias ocultas: nome e observação chegam mascarados ----------
{
  const barra = { ...item("p-barra", "Barra 200 kcal", "despensa", null, 2), notes: "Cerca de 200 kcal cada" };
  const { page, context, errors } = await open(pantryState({ profile: { hideCalories: true }, pantry: [...PANTRY, barra] }));
  await check('"⋯" → Editar com calorias ocultas: "Barra calorias ocultas" e a observação mascarada nos campos', async () => {
    await button(page, "Mais ações: Barra calorias ocultas").click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Editar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar alimento", exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Barra calorias ocultas");
    await expect(page.getByLabel("Observações do item 1", { exact: true })).toHaveValue("Cerca de calorias ocultas cada");
    await noCalories(page, "edição");
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Atalho da despensa na Dieta (conceito 04: "Para facilitar") ----------
{
  const { page, context } = await open(pantryState(), { route: "/dieta", ready: (p) => p.getByTestId("plan-pantry") });
  await check(`dieta: atalho "Despensa" com "${pantryTileText(PANTRY, today).text}" abre a despensa`, async () => {
    const tile = page.getByTestId("plan-pantry");
    await expect(tile.getByText(pantryTileText(PANTRY, today).text, { exact: true })).toBeVisible();
    await expect(tile.getByRole("button", { name: "Abrir despensa e receitas", exact: true })).toBeVisible();
  });
  await context.close();
}

// ---------- 360 px ----------
{
  const { page, context, errors } = await open(pantryState(), { width: 360 });
  await check("360: Despensa sem rolagem lateral (Use primeiro, atalhos, receita e linhas)", async () => {
    await noSideScroll(page);
    await button(page, "Receitas anteriores (1)").click();
    await noSideScroll(page);
  });
  await shoot(page, "360-despensa.png");
  await check("360: alvos de 44 px e texto ≥ 12 px", async () => {
    await minTargets(page.getByRole("button", { name: /^(Lista de compras|Adicionar foto)/ }), "atalhos");
    await minTargets(page.getByRole("button", { name: /^Mais ações: / }), "⋯");
    await minTargets(page.getByRole("button", { name: /^Ordenar alimentos: / }), "ordenar");
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check("360: painel da receita e revisão sem rolagem lateral", async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    await expect(page.getByTestId("recipe-sheet")).toBeVisible();
    await noSideScroll(page);
    await shoot(page, "360-receita-painel.png");
    await button(page, "Começar modo preparo").click();
    await noSideScroll(page);
    await button(page, "Fechar").click();
    await expect(page.getByTestId("recipe-sheet")).toHaveCount(0);
    await openAdd(page);
    await button(page, "Digitar: cadastrar item manualmente").click();
    await expect(page.getByTestId("pantry-draft-row")).toHaveCount(1);
    await noSideScroll(page);
    await shoot(page, "360-revisao.png");
  });
  await check("360: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- 320 px: pílula ao lado da quantidade, nomes e atalhos inteiros ----------
{
  const { page, context, errors } = await open(pantryState(), { width: 320 });
  await check("320: sem rolagem lateral; nomes inteiros, pílula na linha da quantidade e atalhos sem corte", async () => {
    await noSideScroll(page);
    const cut = await page
      .locator('[data-testid="pantry-row"] [role="heading"]')
      .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
    if (cut.length) throw Error(`nomes cortados: ${cut.join(", ")}`);
    const row = page.getByTestId("pantry-row").filter({ has: page.getByRole("heading", { name: "Iogurte", exact: true }) });
    const name = await row.getByRole("heading", { name: "Iogurte", exact: true }).boundingBox();
    const pill = await row.getByTestId("pantry-expiry-soon").boundingBox();
    if (pill.y < name.y + name.height - 1) throw Error("pílula na linha do nome");
    const clipped = await page.getByRole("button", { name: /^(Lista de compras|Adicionar foto)/ }).evaluateAll((els) =>
      els.map((el) => {
        const text = [...el.querySelectorAll("*")].find((n) => n.childNodes[0]?.nodeType === 3);
        return !!text && (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1);
      }),
    );
    if (clipped.some(Boolean)) throw Error("texto dos atalhos cortado");
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    if (errors.length) throw Error(errors.join(" | "));
  });
  await shoot(page, "320-despensa.png");
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
