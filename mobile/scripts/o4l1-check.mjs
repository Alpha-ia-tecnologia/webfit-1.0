// Verificação da Onda 4 · Lote 1 (Cozinha) no export web do app, a 390 px (e 360/320 onde indicado): na Dieta,
// "Comi esta" (com Desfazer), "Ajustar", "Trocar", "Pedir outra opção", a faixa "1 de 4" e a semana do plano
// (AGENTE-09, IA-X5); a lista de compras montada do plano e das receitas, marcada, compartilhada em texto e
// guardada na despensa depois da revisão (AGENTE-08); o "Use primeiro" na Despensa e no Hoje (AGENTE-13); o modo
// preparo em tela cheia com timer, tela acesa e "Descontar da despensa" (AGENTE-11); calorias ocultas, alvos de
// 44 px, texto ≥ 12 px, sem rolagem lateral e sem erros. Correções da revisão: toque duplo em "Comi esta", timers
// parados ao fechar o modo preparo e a descrição (quantidade, observação, "Já tem na despensa") das linhas da
// lista. Só o export web pode ser testado aqui: a tela acesa (expo-keep-awake), o compartilhar nativo (Share),
// a vibração, o TalkBack/VoiceOver e a rolagem até a seção no aparelho não são validados.
// Uso (na pasta mobile; nunca junto com outra verificação na mesma porta):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o4l1
//   node --import tsx scripts/o4l1-check.mjs dist/o4l1 [pasta-das-fotos]
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { COOK_COPY } from "../../src/lib/cook-timer.ts";
import { createDietPlan, dietProfileSignature } from "../../src/lib/diet.ts";
import { planAnchor, planWeek, PLAN_DAY_COPY } from "../../src/lib/diet-week.ts";
import { localDate, shiftDate } from "../../src/lib/domain.ts";
import { pantrySignature } from "../../src/lib/pantry.ts";
import { pantryCardText } from "../../src/lib/pantry-view.ts";
import { renderRecipeSetText } from "../../src/lib/recipe-set.ts";
import { SHOPPING_COPY } from "../../src/lib/shopping-list.ts";
import { CALORIE_PATTERN } from "../../src/lib/text.ts";
import { firstUseModel, USE_FIRST_COPY } from "../../src/lib/use-first.ts";
import { stateSchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { DIET_PLAN_V2, DIET_REPLY } from "../../tests/structured-fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o4l1");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o4l1-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o4l1-seed-"));
const PORT = 3230;
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
/** Relógio das verificações da Dieta: 12:41, depois do almoço das 12:00 ainda sem registro. */
const AT_LUNCH = new Date(`${today}T12:41:00`);
const META = { specialists: ["nutricionista"], reviewed: true, revisions: 0, urgency: "nenhuma", notes: [], llmCalls: 2 };

// ---------- Estado de teste ----------
const item = (id, name, days, quantity = 1, unit = "un", location = "geladeira") => ({
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
const recipeSet = ({ nome = "Arroz com tomate", casa } = {}) => ({
  version: 2,
  receitas: [
    {
      nome,
      refeicao: "Almoço",
      porcoes: 2,
      tempoMin: 20,
      compatibilidade: "Carboidrato e legumes, como no almoço da sua dieta.",
      ingredientesCasa: casa ?? [
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

/**
 * Perfil com o agente autorizado, a dieta estruturada criada agora (dia 0 da semana do plano = o plano como
 * foi revisado), a despensa e, se pedido, a receita atual e a lista de compras. Mesmo esquema do app.
 */
function kitchenState({ profile = {}, pantry = [], set = null, shoppingList = [], diary = [] } = {}) {
  const base = stateFixture();
  const fullProfile = { ...base.profile, consentAi: true, ...profile };
  const dietPlan = createDietPlan(DIET_REPLY, fullProfile);
  const recipes = set
    ? [
        {
          id: "r-new",
          text: renderRecipeSetText(set),
          createdAt: new Date().toISOString(),
          recipeSet: set,
          meta: META,
          dietPlanId: dietPlan.id,
          profileSignature: dietProfileSignature(fullProfile),
          pantrySignature: pantrySignature(pantry, []),
        },
      ]
    : [];
  return stateSchema.parse({ ...base, profile: fullProfile, dietPlan, pantry, recipes, shoppingList, diary });
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
    console.log(`FAIL: ${name}\n  ${String(error?.message ?? error).split("\n").slice(0, 8).join("\n  ")}`);
  }
}
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

let seeds = 0;
/**
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. As chamadas ao servidor
 * são recusadas (e contadas em `requests`). `clock` fixa a hora; `install` instala o relógio controlável
 * (runFor/fastForward); `initScript` roda antes do app em cada página.
 */
async function open(state, { width = 390, route = "/dieta", ready, clock, install, initScript, reducedMotion } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, ...(reducedMotion ? { reducedMotion } : {}) });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  if (install) await page.clock.install({ time: install });
  if (clock) await page.clock.setFixedTime(clock);
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/api/**", async (r) => {
    const request = r.request();
    if (new URL(request.url()).pathname === "/api/agent" && request.method() === "POST") requests.push(request.postDataJSON());
    return r.abort("connectionrefused");
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
  await expect((ready ?? dietReady)(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors, requests };
}
const dietReady = (page) => page.getByTestId("diet-timeline");
const pantryReady = (page) => page.getByText("Meus alimentos", { exact: true });
const hojeReady = (page) => page.getByRole("group", { name: "Esta semana" });

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

/** Sem rolagem lateral: o documento cabe e nada sai da tela, exceto dentro de uma lista que rola de lado. */
async function noSideScroll(page) {
  const problem = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    const inSideScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll") return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !inSideScroller(el))
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
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
async function textAtLeast12(page, where) {
  const small = await smallestText(page);
  if (small < 12) throw Error(`${where}: texto de ${small} px`);
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
/** Todo alvo do localizador mede pelo menos `minW` × `minH` px (o web ignora hitSlop). */
async function targets(locator, what, minW = 44, minH = 44) {
  const boxes = await locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return [el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", r.width, r.height];
    }),
  );
  if (!boxes.length) throw Error(`${what}: nenhum alvo`);
  const small = boxes.filter(([, w, h]) => w < minW - 0.5 || h < minH - 0.5);
  if (small.length) throw Error(`${what}: ${small.map(([n, w, h]) => `${n} ${w.toFixed(1)}×${h.toFixed(1)}`).join(" | ")}`);
}
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.slice(0, 5).join(" | "));
};
/** Foto da tela; uma foto que falha (máquina ocupada) só avisa, sem derrubar as verificações. */
async function shoot(page, file) {
  await page.waitForTimeout(400);
  try {
    await page.screenshot({ path: path.join(shots, file), timeout: 45000 });
  } catch (error) {
    console.log(`AVISO: foto ${file} não tirada (${String(error?.message ?? error).split("\n")[0]})`);
  }
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const heading = (scope, name) => scope.getByRole("heading", { name, exact: true });
/** Texto do aviso (o primeiro nó com a frase exata). */
const toast = (page, text) => page.getByText(text, { exact: true }).first();
const diaryMeals = (state) => state.diary.filter((e) => e.type === "refeicao");

// ---------- (a) Dieta (conceito 04): "Registrar" com Desfazer, "Feita às", faixa "1 de 4" e a semana ----------
{
  const { page, context, errors, requests } = await open(kitchenState(), { clock: AT_LUNCH });
  await check('(a) semana do plano: 7 rádios em "Semana do plano", hoje marcado', async () => {
    const group = page.getByRole("radiogroup", { name: PLAN_DAY_COPY.week, exact: true });
    await expect(group).toBeVisible();
    await expect(page.getByTestId("diet-week-day")).toHaveCount(7);
    const todayRadio = group.getByRole("radio", { name: /, hoje, / });
    await expect(todayRadio).toHaveCount(1);
    await expect(todayRadio).toHaveAttribute("aria-checked", "true");
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
  });
  await check('(a) faixa "0 de 4 refeições hoje" e um só "Registrar Almoço" (a próxima, destacada)', async () => {
    await expect(page.getByTestId("plan-progress")).toContainText("0 de 4 refeições hoje");
    await expect(button(page, "Registrar Almoço")).toHaveCount(1);
    await expect(page.getByTestId("next-meal").getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
    await expect(page.getByTestId("diet-timeline").locator(":scope > [role=listitem]")).toHaveCount(4);
  });
  await check("(a) ações de hoje com alvos de 44 px (Registrar, Ajustar e registrar, Trocar, Pedir outra opção)", async () => {
    await targets(page.getByRole("button", { name: /^(Registrar|Ajustar e registrar|Trocar|Pedir outra opção)[: ]/ }), "ações da refeição");
    await targets(button(page, SHOPPING_COPY.build), "Montar lista de compras");
    await targets(page.getByTestId("diet-week-day"), "dias da semana", 36, 44);
  });
  await shoot(page, "390-dieta-hoje.png");
  await check('(a) "Registrar Almoço" registra com aviso e "Desfazer"; o almoço mostra "Feita às 12:41" e a faixa "1 de 4"', async () => {
    await button(page, "Registrar Almoço").click();
    await expect(toast(page, PLAN_DAY_COPY.logged("almoco", "12:41"))).toBeVisible();
    await expect(button(page, "Desfazer")).toBeVisible();
    await expect(page.getByTestId("diet-timeline").locator(":scope > [role=listitem]").nth(1)).toContainText(PLAN_DAY_COPY.registered("12:41"));
    await expect(button(page, "Registrar Almoço")).toHaveCount(0);
    await expect(page.getByTestId("plan-progress")).toContainText("1 de 4 refeições hoje");
  });
  await shoot(page, "390-dieta-registrar.png");
  await check("(a) texto ≥ 12 px, sem rolagem lateral e sem pedidos ao agente", async () => {
    await textAtLeast12(page, "dieta");
    await noSideScroll(page);
    if (requests.length) throw Error(`${requests.length} pedido(s) ao agente`);
  });
  await check("(a) sem erros de página nem de console", async () => noErrors(errors));
  await check('(a) SQLite: 1 refeição "Almoço" com os 4 itens do plano', async () => {
    const saved = await readState(page, "a-comi-esta");
    const meals = diaryMeals(saved);
    expect(meals).toHaveLength(1);
    expect(meals[0].categoryTag).toBe("Almoço");
    expect(meals[0].time).toBe("12:41");
    expect(meals[0].items.map((i) => i.food.id)).toEqual(["taco-3", "taco-561", "taco-410", "taco-78"]);
    expect(meals[0].items.map((i) => i.grams)).toEqual([100, 100, 100, 30]);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(kitchenState(), { clock: AT_LUNCH });
  await check('(a) "Desfazer" tira o registro e "Registrar Almoço" volta', async () => {
    await button(page, "Registrar Almoço").click();
    await button(page, "Desfazer").click();
    await expect(toast(page, "Registro desfeito.")).toBeVisible();
    await expect(button(page, "Registrar Almoço")).toBeVisible();
    noErrors(errors);
    const saved = await readState(page, "a-desfazer");
    expect(diaryMeals(saved)).toHaveLength(0);
  });
  await context.close();
}

{
  const { page, context, errors } = await open(kitchenState(), { clock: AT_LUNCH });
  await check('(a) toque duplo em "Registrar Almoço" registra uma refeição só', async () => {
    await button(page, "Registrar Almoço").dblclick();
    await expect(toast(page, PLAN_DAY_COPY.logged("almoco", "12:41"))).toBeVisible();
    await expect(button(page, "Registrar Almoço")).toHaveCount(0);
    await expect(page.getByTestId("plan-progress")).toContainText("1 de 4 refeições hoje");
    noErrors(errors);
    const saved = await readState(page, "a-toque-duplo");
    expect(diaryMeals(saved)).toHaveLength(1);
  });
  await context.close();
}

// ---------- (b) "Trocar refeição" e "Registrar" com item fora da TACO ----------
{
  const { page, context, errors } = await open(kitchenState(), { clock: AT_LUNCH });
  await check('(b) "Trocar refeição: almoço" usa as trocas revisadas: anúncio e "no lugar de arroz branco cozido"', async () => {
    await button(page, "Trocar refeição: almoço").click();
    await expect(page.getByText("Almoço com trocas: arroz integral cozido e lentilha cozida.", { exact: true })).toBeAttached();
    await expect(page.getByText("no lugar de arroz branco cozido", { exact: true })).toBeVisible();
    await expect(page.getByText("no lugar de feijão carioca cozido", { exact: true })).toBeVisible();
    await expect(page.getByTestId("next-meal")).toContainText("arroz integral cozido");
  });
  await shoot(page, "390-dieta-trocar.png");
  await check('(b) "Registrar Café da manhã" (café com leite fora da TACO) abre o prato com 2 itens, sem salvar', async () => {
    await button(page, "Registrar Café da manhã").click();
    await expect(page).toHaveURL(/\/refeicao/);
    await expect(heading(page, "Seu prato · 2 itens")).toBeVisible({ timeout: 20000 });
    noErrors(errors);
    const saved = await readState(page, "b-revisao");
    expect(diaryMeals(saved)).toHaveLength(0);
  });
  await context.close();
}

// ---------- (c) "Pedir outra opção" só preenche o chat ----------
{
  const { page, context, errors, requests } = await open(kitchenState(), { clock: AT_LUNCH });
  await check('(c) "Pedir outra opção: Café da manhã" (café recolhido: abrir antes) abre o agente com a pergunta pronta e nenhum pedido', async () => {
    await button(page, "Café da manhã").click();
    await button(page, "Pedir outra opção: Café da manhã").click();
    await expect(page).toHaveURL(/\/agente/);
    const input = page.getByLabel("Mensagem para o agente", { exact: true });
    await expect(input).toHaveValue(/^Sugira outra opção de café da manhã/, { timeout: 20000 });
    await page.waitForTimeout(500);
    if (requests.length) throw Error(`${requests.length} pedido(s) ao agente`);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (d) Prévia de um dia com variação; 320 px ----------
const WEEK = planWeek(DIET_PLAN_V2, { anchor: planAnchor(new Date().toISOString()), today, allergyDetails: stateFixture().profile.allergyDetails });
const VARIATION = WEEK.find((d) => d.hasVariation);
for (const width of [390, 320]) {
  const { page, context, errors } = await open(kitchenState(), { clock: AT_LUNCH, width });
  await check(`(d) ${width}: dia com variação mostra a prévia, sem "Registrar" nem a faixa`, async () => {
    if (!VARIATION) throw Error("semana sem variação no plano de teste");
    const radio = page.getByRole("radio", { name: VARIATION.aria, exact: true });
    await radio.click();
    await expect(radio).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(PLAN_DAY_COPY.preview(VARIATION.date), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Registrar (Café|Almoço|Lanche|Jantar|Ceia)/ })).toHaveCount(0);
    await expect(page.getByTestId("plan-progress")).toHaveCount(0);
    // Na prévia tudo fica aberto, sem destaque: a próxima só existe no dia de hoje.
    await expect(page.getByTestId("next-meal")).toHaveCount(0);
    await expect(heading(page, "Almoço")).toBeVisible();
  });
  await check(`(d) ${width}: setas do teclado movem o dia marcado`, async () => {
    const group = page.getByRole("radiogroup", { name: PLAN_DAY_COPY.week, exact: true });
    const checked = group.getByRole("radio", { checked: true });
    await checked.focus();
    const before = await checked.getAttribute("aria-label");
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { checked: true })).not.toHaveAttribute("aria-label", before ?? "");
    await expect(group.getByRole("radio", { checked: true })).toBeFocused();
  });
  await check(`(d) ${width}: sem rolagem lateral; dias ≥ 36 × 44 px`, async () => {
    await noSideScroll(page);
    await targets(page.getByTestId("diet-week-day"), "dias da semana", 36, 44);
    await textAtLeast12(page, "dieta");
    noErrors(errors);
  });
  await shoot(page, `${width}-dieta-previa.png`);
  await context.close();
}

// ---------- (e) Perfil sensível ----------
{
  const { page, context, errors } = await open(kitchenState({ profile: { eatingDisorder: "sim" } }), { clock: AT_LUNCH });
  await check('(e) perfil sensível: sem faixa "1 de 4" e sem gramas; "Registrar Almoço" presente', async () => {
    await expect(button(page, "Registrar Almoço")).toBeVisible();
    await expect(page.getByTestId("plan-progress")).toHaveCount(0);
    const grams = await page.evaluate(() => /≈\s*\d+\s*g\b/.test(document.body.innerText));
    if (grams) throw Error("gramas à vista");
    noErrors(errors);
  });
  await context.close();
}

// ---------- (f) Lista de compras: dieta + receita → lista → compartilhar → despensa ----------
const shareStub = () => {
  window.__shared = [];
  navigator.share = (data) => {
    window.__shared.push(data);
    return Promise.resolve();
  };
};
const LIST_PANTRY = [item("p-tomate", "Tomate", 2, 3), item("p-arroz", "Arroz", null, 1, "kg", "despensa")];
{
  const state = kitchenState({ pantry: LIST_PANTRY, set: recipeSet() });
  const { page, context, errors } = await open(state, { clock: AT_LUNCH, initScript: shareStub });
  let added = 0;
  await check('(f) Dieta: "Montar lista de compras" sugere o plano e a receita; o que já tem vem desmarcado', async () => {
    await button(page, SHOPPING_COPY.build).click();
    await expect(heading(page, SHOPPING_COPY.sheet).last()).toBeVisible();
    const tomato = page.getByRole("checkbox", { name: "Incluir Tomate", exact: true });
    await expect(tomato).toHaveAttribute("aria-checked", "false");
    await expect(tomato).toContainText(SHOPPING_COPY.inPantry);
    const onion = page.getByRole("checkbox", { name: "Incluir Cebola", exact: true });
    await expect(onion).toHaveAttribute("aria-checked", "true");
    await expect(onion).toContainText("Receita: Arroz com tomate");
    // O nome "Incluir X" cobre o conteúdo: origem e "Já tem na despensa" chegam como descrição.
    await expect(tomato).toHaveAccessibleDescription(new RegExp(`${SHOPPING_COPY.inPantry}$`));
    await expect(onion).toHaveAccessibleDescription(/Receita: Arroz com tomate/);
    await targets(page.getByRole("checkbox"), "sugestões");
    await noSideScroll(page);
  });
  await shoot(page, "390-lista-sugestoes.png");
  await check('(f) "Adicionar N itens" põe na lista com aviso; "Ver lista" abre a Despensa com o foco no título', async () => {
    const add = page.getByRole("button", { name: /^Adicionar \d+ ite(m|ns)$/ });
    added = Number((await add.textContent()).match(/\d+/)[0]);
    await add.click();
    await expect(toast(page, SHOPPING_COPY.added(added))).toBeVisible();
    // Conceito 04: o atalho "Compras" mostra "N itens na lista" e abre a lista (nome "Ver lista: N itens na lista").
    await page.getByRole("button", { name: /^Ver lista: [0-9]+ ite(m|ns) na lista$/ }).click();
    await expect(page).toHaveURL(/\/despensa\?secao=compras/);
    await expect(heading(page, SHOPPING_COPY.title)).toBeFocused({ timeout: 20000 });
    for (const section of ["Hortifrúti", "Mercearia"]) await expect(page.getByTestId("shopping-list").getByRole("heading", { name: section, exact: true })).toBeVisible();
  });
  await check('(f) marcar "Cebola" → "1 de N comprados"; caixas de 44 px', async () => {
    const onion = page.getByRole("checkbox", { name: "Cebola", exact: true });
    await onion.click();
    await expect(onion).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("shopping-summary")).toHaveText(`1 de ${added} comprados`);
    await targets(page.getByTestId("shopping-list").getByRole("checkbox"), "itens da lista");
    await targets(page.getByRole("button", { name: /^Remover .* da lista$/ }), "remover da lista");
    await targets(button(page, SHOPPING_COPY.shareLabel), "Compartilhar");
  });
  await check('(f) "Compartilhar lista de compras" envia só os pendentes, em texto', async () => {
    await button(page, SHOPPING_COPY.shareLabel).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const shared = await page.evaluate(() => window.__shared[0]);
    if (shared.title !== SHOPPING_COPY.title) throw Error(shared.title);
    if (!shared.text.startsWith("Lista de compras\n\n")) throw Error(shared.text);
    if (shared.text.includes("Cebola")) throw Error("item comprado no texto");
    if (/kcal/i.test(shared.text)) throw Error("calorias no texto");
  });
  await shoot(page, "390-lista-despensa.png");
  await check('(f) "Guardar comprados na despensa" → revisão com "Cebola" → salvar', async () => {
    await button(page, SHOPPING_COPY.store).click();
    await expect(heading(page, "Revise os itens antes de salvar")).toBeVisible();
    await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Cebola");
    await button(page, "Confirmar e salvar itens").click();
    await expect(toast(page, SHOPPING_COPY.stored)).toBeVisible();
    noErrors(errors);
  });
  await check('(f) SQLite: Cebola na despensa (source "shopping_list") e fora da lista', async () => {
    const saved = await readState(page, "f-lista");
    const onion = saved.pantry.find((p) => p.name === "Cebola");
    if (!onion) throw Error("Cebola não foi para a despensa");
    expect(onion.source).toBe("shopping_list");
    expect(saved.shoppingList.some((i) => i.name === "Cebola")).toBe(false);
    expect(saved.shoppingList).toHaveLength(added - 1);
  });
  await context.close();
}
{
  const list = ["Alface", "Tomate", "Arroz integral", "Sabão em pó"].map((name, i) => ({
    id: `s-${i}`,
    name,
    quantity: i === 2 ? "2 refeições na semana" : null,
    section: ["hortifruti", "hortifruti", "mercearia", "outros"][i],
    origin: "dieta",
    note: i === 2 ? "Almoço · Jantar" : "",
    checked: i === 1,
    addedAt: new Date(Date.now() + i).toISOString(),
  }));
  const { page, context, errors } = await open(kitchenState({ shoppingList: list }), { width: 320, route: "/despensa?secao=compras", ready: pantryReady });
  await check("(f) 320: lista na Despensa sem rolagem lateral; linhas de 44 px; texto ≥ 12 px", async () => {
    await expect(heading(page, SHOPPING_COPY.title)).toBeFocused({ timeout: 20000 });
    await noSideScroll(page);
    await targets(page.getByTestId("shopping-list").getByRole("checkbox"), "itens da lista");
    await textAtLeast12(page, "lista");
  });
  await check("(f) 320: o leitor de tela ouve a quantidade e a observação do item como descrição", async () => {
    const rice = page.getByRole("checkbox", { name: "Arroz integral", exact: true });
    await expect(rice).toHaveAccessibleDescription("2 refeições na semana · Almoço · Jantar");
  });
  await check('(f) remover "Alface" com Desfazer; incluir à mão', async () => {
    await button(page, "Remover Alface da lista").click();
    await expect(toast(page, SHOPPING_COPY.removed("Alface"))).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Alface", exact: true })).toHaveCount(0);
    await button(page, "Desfazer").click();
    await expect(page.getByRole("checkbox", { name: "Alface", exact: true })).toBeVisible();
    await page.getByLabel(SHOPPING_COPY.manualLabel, { exact: true }).fill("Detergente");
    await button(page, SHOPPING_COPY.manualAdd).click();
    await expect(page.getByRole("checkbox", { name: "Detergente", exact: true })).toBeVisible();
    noErrors(errors);
  });
  await shoot(page, "320-lista.png");
  await context.close();
}
{
  const unsupported = () => Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  const list = [{ id: "s-1", name: "Alface", quantity: null, section: "hortifruti", origin: "manual", note: "", checked: false, addedAt: new Date().toISOString() }];
  const { page, context, errors } = await open(kitchenState({ shoppingList: list }), { route: "/despensa", ready: pantryReady, initScript: unsupported });
  await check("(f) sem compartilhamento no navegador: aviso, nunca erro", async () => {
    // Conceito 06: a lista abre pelo atalho "Lista de compras", numa folha.
    await page.getByRole("button", { name: /^Lista de compras/ }).click();
    await button(page, SHOPPING_COPY.shareLabel).click();
    await expect(page.getByTestId("toast-warning")).toContainText(SHOPPING_COPY.shareFail);
    noErrors(errors);
  });
  await context.close();
}

// ---------- (g) "Use primeiro" no Hoje e na Despensa ----------
const USE_PANTRY = [
  item("p-iogurte", "Iogurte", 2),
  item("p-tomate", "Tomate", 2, 3),
  item("p-queijo", "Queijo", 10, 0.5, "kg"),
  item("p-leite", "Leite", -1, 1, "l"),
];
const USE_MODEL = firstUseModel(USE_PANTRY, today, false);
{
  const { page, context, errors } = await open(kitchenState({ pantry: USE_PANTRY }), { route: "/", ready: hojeReady });
  await check('(g) Hoje: "Use primeiro" dentro do cartão da despensa, com 2 chips e a data completa para o leitor', async () => {
    const strip = page.getByTestId("use-first-hoje");
    await expect(strip).toBeVisible();
    await expect(heading(strip, "Use primeiro")).toBeVisible();
    await expect(strip.getByTestId("use-first-chip")).toHaveCount(2);
    await expect(strip.getByText(USE_MODEL.chips[0].aria, { exact: true })).toBeAttached();
    await expect(page.getByText(pantryCardText(USE_PANTRY, today), { exact: true })).toBeVisible();
    await targets(strip.getByRole("button"), "botões do Use primeiro");
    await textAtLeast12(page, "Hoje");
  });
  await shoot(page, "390-hoje-use-primeiro.png");
  await check('(g) "Agora não" oculta até amanhã com Desfazer', async () => {
    await button(page, USE_FIRST_COPY.dismissLabel).click();
    await expect(toast(page, USE_FIRST_COPY.dismissed)).toBeVisible();
    await expect(page.getByTestId("use-first-hoje")).toHaveCount(0);
    await button(page, "Desfazer").click();
    await expect(page.getByTestId("use-first-hoje")).toBeVisible();
  });
  await check('(g) "Receitas com eles" abre a Despensa com o foco em "Use primeiro"; validade das linhas intacta', async () => {
    await button(page, USE_FIRST_COPY.recipes).click();
    await expect(page).toHaveURL(/\/despensa/);
    await expect(heading(page, "Use primeiro")).toBeFocused({ timeout: 20000 });
    const card = page.getByTestId("use-first-card");
    await expect(card.getByTestId("use-first-chip")).toHaveCount(2);
    // No cartão em destaque (conceito 06) a frase fica para o leitor de tela.
    await expect(card.getByText(USE_MODEL.lead, { exact: false })).toBeAttached();
    await expect(page.getByTestId("pantry-expiry-soon")).toHaveCount(2);
    await targets(button(card, USE_FIRST_COPY.create), "Criar receitas com eles");
    await noSideScroll(page);
    noErrors(errors);
  });
  await shoot(page, "390-despensa-use-primeiro.png");
  await context.close();
}
{
  const { page, context, errors } = await open(kitchenState({ pantry: USE_PANTRY }), { route: "/", ready: hojeReady });
  await check('(g) SQLite: "Agora não" grava o aviso do dia como lido', async () => {
    await button(page, USE_FIRST_COPY.dismissLabel).click();
    await expect(page.getByTestId("use-first-hoje")).toHaveCount(0);
    noErrors(errors);
    const saved = await readState(page, "g-agora-nao");
    expect(saved.readNotifications).toContain(`${today}:despensa`);
  });
  await context.close();
}

// ---------- (h) Modo preparo: tela cheia, timer, tela acesa e descontar da despensa ----------
const wakeStub = () => {
  window.__wake = 0;
  window.__wakeReleased = false;
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => {
        window.__wake++;
        return {
          released: false,
          type: "screen",
          onrelease: null,
          release: async () => {
            window.__wakeReleased = true;
          },
          addEventListener() {},
          removeEventListener() {},
        };
      },
    },
  });
};
const COOK_PANTRY = [item("p-arroz", "Arroz", null, 1, "kg", "despensa"), item("p-tomate", "Tomate", 2, 3)];
const INSTALL_AT = new Date(`${today}T12:00:00`);
{
  const { page, context, errors } = await open(kitchenState({ pantry: COOK_PANTRY, set: recipeSet() }), {
    route: "/despensa",
    ready: pantryReady,
    install: INSTALL_AT,
    initScript: wakeStub,
  });
  await check("(h) modo preparo em tela cheia azul-marinho, passo com foco, texto ≥ 24 px e tela acesa", async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    await button(page, "Começar modo preparo").click();
    const sheet = page.getByTestId("sheet-immersive");
    await expect(sheet).toBeVisible();
    const bg = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== "rgb(10, 25, 47)") throw Error(`fundo ${bg}`);
    await expect(heading(page, "Passo 1 de 2")).toBeFocused();
    const size = await page.getByTestId("recipe-step-text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (size < 24) throw Error(`texto do passo com ${size} px`);
    await expect(page.getByText(COOK_COPY.awake, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__wake)).toBe(1);
    await expect(button(page, "Fechar")).toHaveCount(1);
  });
  await shoot(page, "390-modo-preparo-passo1.png");
  await check('(h) timer do passo 2: "25:00" → Iniciar → 1 min → "24:00"; Pausar segura; Continuar até o fim anuncia', async () => {
    await button(page, "Próximo passo").click();
    const timer = page.getByTestId("cook-timer");
    await expect(timer.getByRole("timer")).toHaveText("25:00");
    await expect(page.getByTestId("recipe-step-mode").getByText("25 min", { exact: true })).toBeVisible();
    await button(page, COOK_COPY.startLabel(25)).click();
    await expect(page.getByText(COOK_COPY.started(2, 25), { exact: true })).toBeAttached();
    await page.clock.runFor(60_000);
    await expect(timer.getByRole("timer")).toHaveText("24:00");
    await button(page, COOK_COPY.pauseLabel).click();
    await page.clock.runFor(60_000);
    await expect(timer.getByRole("timer")).toHaveText("24:00");
    await button(page, COOK_COPY.resumeLabel).click();
    await page.clock.fastForward(24 * 60_000);
    await page.clock.runFor(2_000);
    await expect(timer.getByRole("timer")).toHaveText("0:00");
    await expect(page.getByText(COOK_COPY.done(2), { exact: true })).toBeAttached();
    await targets(timer.getByRole("button"), "botões do timer");
  });
  await shoot(page, "390-modo-preparo-timer.png");
  await check('(h) "Descontar da despensa": Tomate "Sobrou" 1 unidade, Arroz "Não mexer", "1 item será atualizado."', async () => {
    await button(page, COOK_COPY.deduct).click();
    await expect(heading(page, COOK_COPY.deduct)).toBeVisible();
    const tomato = page.getByRole("radiogroup", { name: "O que ficou de Tomate", exact: true });
    await expect(tomato.getByRole("radio", { name: COOK_COPY.deductChoices.left, exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("deduct-sheet").getByText("1 unidade", { exact: true })).toBeVisible();
    const rice = page.getByRole("radiogroup", { name: "O que ficou de Arroz", exact: true });
    await expect(rice.getByRole("radio", { name: COOK_COPY.deductChoices.keep, exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("deduct-summary")).toHaveText("1 item será atualizado.");
    await targets(page.getByTestId("deduct-sheet").getByRole("radio"), "opções");
    await targets(page.getByTestId("deduct-sheet").getByRole("button"), "−/+");
    expect(await page.evaluate(() => window.__wakeReleased)).toBe(true);
  });
  await shoot(page, "390-descontar.png");
  await check('(h) "Atualizar despensa" grava com aviso e "Desfazer"', async () => {
    await button(page, COOK_COPY.deductConfirm).click();
    await expect(toast(page, COOK_COPY.deducted)).toBeVisible();
    await expect(button(page, "Desfazer")).toBeVisible();
    noErrors(errors);
    const saved = await readState(page, "h-descontar");
    expect(saved.pantry.find((p) => p.id === "p-tomate").quantity).toBe(1);
    expect(saved.pantry.find((p) => p.id === "p-arroz").quantity).toBe(1);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(kitchenState({ pantry: COOK_PANTRY, set: recipeSet() }), {
    route: "/despensa",
    ready: pantryReady,
    install: INSTALL_AT,
  });
  await check('(h) "Desfazer" devolve o Tomate a 3 unidades', async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    await button(page, "Começar modo preparo").click();
    await button(page, "Próximo passo").click();
    await button(page, COOK_COPY.deduct).click();
    await button(page, COOK_COPY.deductConfirm).click();
    await button(page, "Desfazer").click();
    await expect(toast(page, COOK_COPY.deductUndone)).toBeVisible();
    noErrors(errors);
    const saved = await readState(page, "h-desfazer");
    expect(saved.pantry.find((p) => p.id === "p-tomate").quantity).toBe(3);
  });
  await context.close();
}
{
  // Conta os intervalos de 1 s ativos (o redesenho do timer do passo) sem mexer no relógio da página.
  const tickStub = () => {
    window.__ticks = new Set();
    const set = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => {
      const id = set(fn, ms, ...rest);
      if (ms === 1000) window.__ticks.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      window.__ticks.delete(id);
      return clear(id);
    };
  };
  const ticking = (page) => page.evaluate(() => window.__ticks.size);
  const { page, context, errors } = await open(kitchenState({ pantry: COOK_PANTRY, set: recipeSet() }), {
    route: "/despensa",
    ready: pantryReady,
    initScript: tickStub,
  });
  await check('(h) fechar com o timer contando encerra o redesenho de 1 s; ao reabrir, o timer volta a "25:00"', async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    await button(page, "Começar modo preparo").click();
    await button(page, "Próximo passo").click();
    const before = await ticking(page);
    await button(page, COOK_COPY.startLabel(25)).click();
    await expect(page.getByText(COOK_COPY.started(2, 25), { exact: true })).toBeAttached();
    await expect.poll(() => ticking(page)).toBe(before + 1);
    await button(page, "Fechar").click();
    await expect(page.getByTestId("recipe-sheet")).toHaveCount(0);
    await expect.poll(() => ticking(page)).toBe(before);
    await button(page, "Modo preparo: Arroz com tomate").click();
    await button(page, "Começar modo preparo").click();
    await button(page, "Próximo passo").click();
    await expect(page.getByTestId("cook-timer").getByRole("timer")).toHaveText("25:00");
    await expect(button(page, COOK_COPY.startLabel(25))).toBeVisible();
    await expect(page.getByText(COOK_COPY.done(2), { exact: true })).toHaveCount(0);
    noErrors(errors);
  });
  await context.close();
}
{
  const noWake = () => Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
  const { page, context, errors } = await open(kitchenState({ pantry: COOK_PANTRY, set: recipeSet() }), {
    width: 360,
    route: "/despensa",
    ready: pantryReady,
    initScript: noWake,
  });
  await check('(h) 360 sem Wake Lock: aviso de 12 px, sem rolagem lateral; um só "Fechar" fecha o painel', async () => {
    await button(page, "Modo preparo: Arroz com tomate").click();
    await button(page, "Começar modo preparo").click();
    const hint = page.getByTestId("cook-awake-hint");
    await expect(hint).toHaveText(COOK_COPY.awakeHint);
    const size = await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (size !== 12) throw Error(`aviso com ${size} px`);
    await noSideScroll(page);
    await textAtLeast12(page, "modo preparo");
    await expect(button(page, "Fechar")).toHaveCount(1);
    await button(page, "Fechar").click();
    await expect(page.getByTestId("recipe-sheet")).toHaveCount(0);
    noErrors(errors);
  });
  await shoot(page, "360-modo-preparo-sem-wake-lock.png");
  await context.close();
}

// ---------- (i) Calorias ocultas ----------
{
  const pantry = [item("p-barra", "Barra 90 kcal", 1, 2, "un", "despensa"), item("p-tomate", "Tomate", 2, 3)];
  const set = recipeSet({
    nome: "Arroz 300 kcal com tomate",
    casa: [
      { pantryItemId: "p-barra", nome: "Barra 90 kcal", quantidade: "1 unidade" },
      { pantryItemId: "p-tomate", nome: "Tomate", quantidade: "2 unidades" },
    ],
  });
  const shoppingList = [
    { id: "s-1", name: "Biscoito 120 kcal", quantity: null, section: "mercearia", origin: "manual", note: "", checked: false, addedAt: new Date().toISOString() },
  ];
  const state = kitchenState({ profile: { hideCalories: true }, pantry, set, shoppingList });
  const { page, context, errors } = await open(state, { clock: AT_LUNCH, initScript: shareStub });
  await check("(i) calorias ocultas: Dieta, sugestões da lista, Despensa (Use primeiro e lista), modo preparo e descontar", async () => {
    await noCalories(page, "Dieta");
    // Com itens na lista, o atalho "Compras" tem o "1 item na lista" por cima do texto: toca no lado do ícone.
    await button(page, SHOPPING_COPY.build).click({ position: { x: 24, y: 24 } });
    await expect(heading(page, SHOPPING_COPY.sheet).last()).toBeVisible();
    await noCalories(page, "sugestões");
    await button(page, "Cancelar").click();
    await page.goto(url + "/despensa");
    await expect(pantryReady(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("use-first-card")).toBeVisible();
    await noCalories(page, "Despensa");
    await page.getByRole("button", { name: /^Lista de compras/ }).click();
    await expect(page.getByRole("checkbox", { name: "Biscoito calorias ocultas", exact: true })).toBeVisible();
    await noCalories(page, "lista de compras");
    await button(page, SHOPPING_COPY.shareLabel).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const shared = await page.evaluate(() => window.__shared[0].text);
    if (/kcal/i.test(shared)) throw Error(`calorias no compartilhado: ${shared}`);
    await button(page, "Fechar").click();
    await page.getByRole("button", { name: /^Modo preparo: / }).click();
    await button(page, "Começar modo preparo").click();
    await noCalories(page, "modo preparo");
    await button(page, "Próximo passo").click();
    await button(page, COOK_COPY.deduct).click();
    await expect(heading(page, COOK_COPY.deduct)).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "O que ficou de Barra calorias ocultas", exact: true })).toBeVisible();
    await noCalories(page, "descontar");
    noErrors(errors);
  });
  await shoot(page, "390-descontar-calorias-ocultas.png");
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
