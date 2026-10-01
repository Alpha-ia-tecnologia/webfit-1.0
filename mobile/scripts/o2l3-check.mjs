// Verificação da Onda 2 · Lote 3 (Registrar refeição) no export web do app, a 390 e 360 px: pílula
// de tipo/data/horário, busca com nomes amigáveis, preparos e sinônimos, medidas caseiras, bandeja
// fixa (com o erro de salvar), "Seus pratos" (carregar, juntar/substituir, foto que fica, registrar
// agora), desfazer, favoritos, rótulo (inclusive com calorias ocultas: energia pelos macros),
// resultados parciais, porções ínfimas ("< 0,1") e rolagem lateral. Fotografa a tela a 390 px na
// pasta indicada.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l3
//   node --import tsx scripts/o2l3-check.mjs dist/o2l3 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, mealTotals, shiftDate, uid } from "../../src/lib/domain.ts";
import { MONTHS_PT } from "../../src/components/anamnese/inputs.ts";
import { longDate } from "../../src/lib/today.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l3");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l3-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o2l3-seed-"));
const PORT = 3218;
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
const twoDaysAgo = shiftDate(today, -2);
const taco = JSON.parse(readFileSync(new URL("../../src/data/foods.json", import.meta.url), "utf8"));
const food = (name) => {
  const found = taco.find((f) => f.name === name);
  if (!found) throw Error(`sem ${name} na TACO`);
  return found;
};
const ARROZ = "Arroz, integral, cozido";
const PARTIAL = "Nenhum alimento tem todas essas palavras. Estes têm parte delas: adicione um de cada vez.";
const LOADED = "Itens no prato. Confira as porções e toque em Salvar refeição.";
const ZERO_PORTION = "Confira as porções: cada alimento precisa ter mais de 0 g.";
const LABEL_SAVED = "Alimento cadastrado e colocado no prato (100 g).";
const MINE = "Seus alimentos cadastrados";
/** PNG de 1 × 1 px para anexar como foto da refeição. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Jantar de ontem, almoço e café de anteontem e o favorito "Almoço de casa". */
function richState(change = {}) {
  const state = stateFixture();
  const meal = (date, time, category, items) => ({
    id: uid(),
    userId: state.userId,
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type: "refeicao",
    title: category,
    categoryTag: category,
    description: "",
    items,
    ...mealTotals(items),
  });
  const lunch = [
    { food: food(ARROZ), grams: 90 },
    { food: food("Feijão, carioca, cozido"), grams: 150 },
    { food: food("Alface, crespa, crua"), grams: 30 },
  ];
  return {
    ...state,
    profile: { ...state.profile, ...change },
    diary: [
      meal(yesterday, "19:30", "Jantar", [
        { food: food(ARROZ), grams: 100 },
        { food: food("Feijão, carioca, cozido"), grams: 100 },
        { food: food("Frango, peito, sem pele, grelhado"), grams: 100 },
      ]),
      meal(twoDaysAgo, "12:30", "Almoço", lunch),
      meal(twoDaysAgo, "08:00", "Café da manhã", [
        { food: food("Pão, trigo, francês"), grams: 50 },
        { food: food("Ovo, de galinha, inteiro, cozido/10minutos"), grams: 100 },
      ]),
    ],
    savedMeals: [{ id: "fav1", name: "Almoço de casa", categoryTag: "Almoço", items: lunch }],
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
  await page.goto(url + "/refeicao");
  await expect(page.getByLabel("Buscar alimento")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(700);
  return { page, context, errors };
}

/** Lê o estado gravado no SQLite do navegador (sai da tela: use no fim de um bloco). */
async function readState(page, name) {
  await page.goto(url + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(await (await entry.getFile()).arrayBuffer());
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

/**
 * Sem rolagem lateral: nem o documento nem elemento algum passa da largura da tela, exceto o
 * conteúdo dos carrosséis horizontais de propósito ("Seus pratos" e os itens da bandeja).
 */
async function noSideScroll(page) {
  const problem = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    const scrollers = [...document.querySelectorAll('[data-testid="dish-scroller"], [data-testid="tray-chips"], [data-testid="portion-units"]')];
    for (const el of document.querySelectorAll("body *")) {
      if (scrollers.some((s) => s !== el && s.contains(el))) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        // Filhos do carrossel ficam fora da tela de propósito; o resto não.
        const style = getComputedStyle(el);
        if (style.position === "absolute" && style.opacity === "0") continue;
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
      }
    }
    for (const el of document.querySelectorAll("div")) {
      const style = getComputedStyle(el);
      if (scrollers.includes(el)) continue;
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth - el.clientWidth > 1)
        return `rolagem interna ${el.scrollWidth - el.clientWidth}px`;
    }
    return "";
  });
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}

const PILL_SUFFIX = " — alterar tipo, data ou horário";
const pill = (page) => page.getByRole("button", { name: /^(Café da manhã|Almoço|Lanche|Jantar|Ceia), (Hoje|Ontem|\d{2}\/\d{2}), \d{2}:\d{2} — alterar tipo, data ou horário$/ });
/** "Refeição registrada: Almoço, hoje às 12:30." a partir da pílula (dia de hoje). */
async function loggedMessage(page) {
  const [, category, time] = /^(.+), Hoje, (\d{2}:\d{2}) — /.exec((await pill(page).getAttribute("aria-label")) ?? "") ?? [];
  if (!category) throw Error("pílula sem o dia de hoje");
  return `Refeição registrada: ${category}, hoje às ${time}.`;
}
const grams = (page, name) => page.getByLabel(`Porção de ${name} em gramas`, { exact: true });
const tray = (page) => page.getByRole("region", { name: "Resumo do prato" });
/** O aviso visível de itens carregados (não a região de status do leitor de tela). */
const loadedNotice = (page) => page.getByText(LOADED, { exact: true }).and(page.locator(':not([role="status"])'));
const save = (page) => page.getByRole("button", { name: "Salvar refeição", exact: true });
/** O aviso com esta mensagem (o anterior pode ainda estar sumindo na tela). */
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
async function undo(page, message) {
  await toastWith(page, message).getByRole("button", { name: "Desfazer", exact: true }).click();
}
async function search(page, text) {
  await page.getByLabel("Buscar alimento").fill(text);
  await page.waitForTimeout(250);
}
/** Topo da lista (a busca fixa fica logo abaixo do cabeçalho). */
async function toTop(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("div")) if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible") el.scrollTop = 0;
  });
  await page.waitForTimeout(200);
}
async function shoot(page, file, top = true) {
  if (top) await toTop(page);
  await page.screenshot({ path: path.join(shots, file) });
}
async function noKcal(page, where) {
  const found = await page.evaluate(() => {
    const text = document.body.innerText;
    const labels = [...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label")).join(" | ");
    const hit = (s) => (/kcal|caloria/i.exec(s) ? s.slice(Math.max(0, /kcal|caloria/i.exec(s).index - 30), /kcal|caloria/i.exec(s).index + 10) : "");
    return hit(text) || hit(labels);
  });
  if (found) throw Error(`${where}: calorias à vista ("${found}")`);
}

// ---------- Pílula, busca, porção, bandeja e desfazer (390 px) ----------
{
  const { page, context, errors } = await open(richState());
  /** Dia escolhido na pílula: o diário abre nele depois de salvar. */
  let pillDay = today;
  await check("390 inicial: pílula, atalhos, Seus pratos e busca; sem bandeja", async () => {
    await expect(pill(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Foto do prato, fica junto do registro", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Descrever por voz", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rótulo, novo alimento", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seus pratos", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Repetir Jantar de ${yesterday}`, exact: true })).toBeVisible();
    await expect(save(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Seus frequentes", exact: true })).toBeVisible();
  });
  await check("390 inicial: cartões com \"ontem · 3 itens\" e kcal; favorito primeiro", async () => {
    const scroller = page.getByTestId("dish-scroller");
    const content = await scroller.evaluate((el) => el.textContent ?? "");
    // DIARIO-03: os ícones de categoria são SVG (sem texto); o cartão começa pelo nome do prato.
    if (!content.startsWith("Almoço de casa")) throw Error(content.slice(0, 80));
    for (const part of ["ontem · 3 itens", "kcal"]) if (!content.includes(part)) throw Error(`sem "${part}" em: ${content}`);
  });
  await check("390: sem rolagem lateral (inicial)", () => noSideScroll(page));
  await shoot(page, "390-idle.png");

  await check('390 pílula: abre "Quando foi a refeição?", troca tipo, data e horário e atualiza a pílula', async () => {
    const before = (await pill(page).getAttribute("aria-label")) ?? "";
    const [, minute] = /(\d{2}):(\d{2}) — /.exec(before).slice(1);
    const hour = Number(/(\d{2}):\d{2} — /.exec(before)[1]);
    await pill(page).click();
    await expect(page.getByRole("heading", { name: "Quando foi a refeição?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Almoço", exact: true }).click();
    await expect(page.getByRole("button", { name: "Almoço", exact: true })).toHaveAttribute("aria-pressed", "true");
    // Data: a roda do dia mostra ontem logo acima de hoje (no dia 1, o mês anterior acima do atual).
    await page.getByRole("button", { name: /^Data: / }).click();
    let expectedDay = yesterday;
    pillDay = today;
    if (Number(today.slice(8, 10)) > 1) {
      await page.locator('[aria-label="Dia"]').getByText(yesterday.slice(8, 10), { exact: true }).click();
    } else if (Number(today.slice(5, 7)) > 1) {
      await page.locator('[aria-label="Mês"]').getByText(MONTHS_PT[Number(today.slice(5, 7)) - 2], { exact: true }).click();
      expectedDay = `${today.slice(0, 5)}${String(Number(today.slice(5, 7)) - 1).padStart(2, "0")}-01`;
    } else expectedDay = today;
    await page.getByRole("button", { name: "Confirmar data", exact: true }).click();
    const nextHour = hour === 0 ? 1 : hour - 1;
    await page.getByRole("button", { name: /^Horário: / }).click();
    await page.locator('[aria-label="Hora"]').getByText(String(nextHour).padStart(2, "0"), { exact: true }).click();
    await page.getByRole("button", { name: "Confirmar horário", exact: true }).click();
    await page.getByRole("button", { name: "Pronto", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quando foi a refeição?", exact: true })).toHaveCount(0);
    const label = expectedDay === yesterday ? "Ontem" : expectedDay === today ? "Hoje" : `${expectedDay.slice(8, 10)}/${expectedDay.slice(5, 7)}`;
    await expect(pill(page)).toHaveAttribute("aria-label", `Almoço, ${label}, ${String(nextHour).padStart(2, "0")}:${minute}${PILL_SUFFIX}`);
    pillDay = expectedDay;
  });

  // Conceito 02: a linha fechada diz o preparo no nome ("Arroz integral, cozido"); os preparos aparecem na bandeja.
  await check('390 busca "arroz": "Arroz integral, cozido" com o trecho em negrito e a porção numa linha', async () => {
    await search(page, "arroz");
    const title = page.getByRole("heading", { name: "Arroz integral, cozido", exact: true }).first();
    await expect(title).toBeVisible();
    const bold = await title.evaluate((el) => [...el.querySelectorAll("*")].filter((c) => getComputedStyle(c).fontFamily.includes("ExtraBold")).map((c) => c.textContent).join("|"));
    if (bold !== "Arroz") throw Error(`negrito: ${bold}`);
    await expect(page.getByRole("group", { name: "Preparo de Arroz integral", exact: true })).toHaveCount(0);
    await expect(page.getByText("4 col. de sopa ≈ 100 g", { exact: true }).first()).toBeVisible();
  });
  await check('390 busca: seções "Seus frequentes" e "Tabela TACO" com (i), contagem e "Branco (tipo 1)"', async () => {
    await expect(page.getByRole("heading", { name: "Seus frequentes", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tabela TACO", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tabela TACO", exact: true }).locator("xpath=..")).toContainText(/\d+ resultados?$/);
    await expect(page.getByRole("heading", { name: "Arroz branco (tipo 1), cozido", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sobre a Tabela TACO e as medidas caseiras", exact: true }).click();
    await expect(page.getByRole("heading", { name: "De onde vêm os valores", exact: true })).toBeVisible();
    await expect(page.getByText("TACO · NEPA/UNICAMP, 4ª edição (2011)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "De onde vêm os valores", exact: true })).toHaveCount(0);
  });
  await check("390: sem rolagem lateral (busca)", () => noSideScroll(page));
  await shoot(page, "390-search.png");

  await check(`390 adicionar "${ARROZ}": editor com gramas, "Na bandeja", foco no Aumentar e bandeja`, async () => {
    await page.getByRole("button", { name: `Adicionar ${ARROZ}`, exact: true }).click();
    await expect(grams(page, ARROZ)).toHaveValue("100");
    await expect(page.getByText("Na bandeja", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Aumentar ${ARROZ}`, exact: true })).toBeFocused();
    await expect(save(page)).toBeVisible();
    await expect(tray(page)).toContainText("1 item");
    await expect(tray(page)).toContainText("4 col.");
  });
  await check("390 na bandeja: trocar o preparo (cozido → cru) mantém a porção e troca o alimento; volta a cozido", async () => {
    const preps = page.getByRole("group", { name: "Preparo de Arroz integral", exact: true });
    await expect(preps.getByRole("button", { name: "cozido", exact: true })).toHaveAttribute("aria-pressed", "true");
    await preps.getByRole("button", { name: "cru", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remover Arroz, integral, cru", exact: true })).toBeVisible();
    await expect(grams(page, "Arroz, integral, cru")).toHaveValue("100");
    await expect(tray(page)).toContainText("1 item");
    await preps.getByRole("button", { name: "cozido", exact: true }).click();
    await expect(page.getByRole("button", { name: `Remover ${ARROZ}`, exact: true })).toBeVisible();
    await expect(grams(page, ARROZ)).toHaveValue("100");
  });
  await check("390 Aumentar soma uma colher de sopa (100 → 125 g); gramas digitados não trocam a medida", async () => {
    await page.getByRole("button", { name: `Aumentar ${ARROZ}`, exact: true }).click();
    await expect(grams(page, ARROZ)).toHaveValue("125");
    // O primeiro é o valor à vista; o segundo, o anúncio para o leitor de tela.
    await expect(page.getByText("5 colheres de sopa", { exact: true }).first()).toBeVisible();
    await grams(page, ARROZ).fill("150");
    await expect(page.getByRole("group", { name: `Medida de ${ARROZ}`, exact: true }).getByRole("button", { name: "Col. de sopa", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(tray(page)).toContainText("6 col.");
    await grams(page, ARROZ).fill("12,5");
    await expect(tray(page)).toContainText("½ col.");
    await grams(page, ARROZ).fill("150");
  });
  await check("390 medida Gramas: − / + anda de 10 g e o campo vira o valor principal", async () => {
    const units = page.getByRole("group", { name: `Medida de ${ARROZ}`, exact: true });
    await units.getByRole("button", { name: "Gramas", exact: true }).click();
    await expect(units.getByRole("button", { name: "Gramas", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: `Diminuir ${ARROZ}`, exact: true }).click();
    await expect(grams(page, ARROZ)).toHaveValue("140");
    await units.getByRole("button", { name: "Col. de sopa", exact: true }).click();
    await grams(page, ARROZ).fill("150");
  });
  await check("390 gramas digitados: acima de 5 kg vale 5 kg; negativo não muda a porção", async () => {
    await grams(page, ARROZ).fill("12000");
    await expect(tray(page)).toContainText("200 col.");
    await grams(page, ARROZ).fill("-5");
    await expect(tray(page)).toContainText("200 col.");
    await grams(page, ARROZ).fill("150");
    await expect(tray(page)).toContainText("6 col.");
  });
  await check('390 porção ínfima: 1 g em colher de sopa mostra "< 0,1" (editor e bandeja); − não zera, + vai a 1 colher', async () => {
    await grams(page, ARROZ).fill("1");
    await expect(tray(page)).toContainText("< 0,1 col.");
    await expect(page.getByText("< 0,1", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: `Diminuir ${ARROZ}`, exact: true }).click();
    await expect(grams(page, ARROZ)).toHaveValue("1");
    await page.getByRole("button", { name: `Aumentar ${ARROZ}`, exact: true }).click();
    await expect(grams(page, ARROZ)).toHaveValue("25");
    await grams(page, ARROZ).fill("1.000");
    await expect(tray(page)).toContainText("40 col.");
    await grams(page, ARROZ).fill("150");
    await expect(tray(page)).toContainText("6 col.");
  });
  await check('390 busca "feijoada" encontra Feijoada', async () => {
    await search(page, "feijoada");
    await expect(page.getByRole("heading", { name: "Feijoada", exact: true }).first()).toBeVisible();
    await expect(page.getByText(PARTIAL, { exact: true })).toHaveCount(0);
  });
  await check('390 busca "cafe com leite": aviso de resultados parciais acima da lista', async () => {
    await search(page, "cafe com leite");
    const hint = page.getByText(PARTIAL, { exact: true });
    await expect(hint).toBeVisible();
    const [note, first] = [await hint.boundingBox(), await page.getByRole("button", { name: /^Adicionar / }).first().boundingBox()];
    if (note.y > first.y) throw Error(`aviso abaixo dos resultados: ${note.y} > ${first.y}`);
  });
  await shoot(page, "390-partial-search.png");
  await check('390 sinônimo "macaxeira" encontra Mandioca (cozida · frita · crua)', async () => {
    await search(page, "macaxeira");
    // O preparo vai no nome da linha ("Mandioca, cozida"); os três preparos aparecem na bandeja.
    await expect(page.getByRole("heading", { name: /^Mandioca, (cozida|frita|crua)$/ }).first()).toBeVisible();
  });
  await check('390 sem resultado: "Nada encontrado" e "Cadastrar alimento do rótulo"', async () => {
    await search(page, "xyzw");
    await expect(page.getByText("Nada encontrado para “xyzw”.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cadastrar alimento do rótulo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cadastrar alimento do rótulo", exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome do alimento", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  });
  await check('390 "Ver prato" limpa a busca e mostra "Seu prato · 1 item" abaixo da busca', async () => {
    await page.getByRole("button", { name: "Ver prato", exact: true }).click();
    await expect(page.getByLabel("Buscar alimento")).toHaveValue("");
    const heading = page.getByRole("heading", { name: "Seu prato · 1 item", exact: true });
    await expect(heading).toBeInViewport();
    const [head, box] = [await heading.boundingBox(), await page.getByLabel("Buscar alimento").boundingBox()];
    if (head.y < box.y + box.height) throw Error(`título sob a busca: ${head.y} < ${box.y + box.height}`);
    await expect(grams(page, ARROZ)).toHaveValue("150");
  });
  await check("390 frequente sem busca: adicionar Feijão move o foco para o editor no prato", async () => {
    const name = "Feijão, carioca, cozido";
    await page.getByRole("button", { name: `Adicionar ${name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Aumentar ${name}`, exact: true })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Seu prato · 2 itens", exact: true })).toBeVisible();
    const adds = await page.getByRole("button", { name: /^Adicionar / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    if (new Set(adds).size !== adds.length) throw Error(`"Adicionar" repetido: ${adds.join(", ")}`);
  });
  await check("390 bandeja: 2 itens, kcal, barra P/C/G e aviso acima dela", async () => {
    await expect(tray(page)).toContainText("kcal · 2 itens");
    const bar = tray(page).getByRole("img", { name: /^Proteínas / });
    const label = await bar.getAttribute("aria-label");
    if (!/^Proteínas [\d,]+ g, carboidratos [\d,]+ g, gorduras [\d,]+ g$/.test(label ?? "")) throw Error(label);
  });
  await check("390 bandeja: leitor de tela ouve a porção por extenso, não a abreviação", async () => {
    await expect(tray(page).getByText("6 colheres de sopa de Arroz integral", { exact: true })).toHaveCount(1);
    const hidden = await tray(page).getByText("6 col.", { exact: true }).getAttribute("aria-hidden");
    if (hidden !== "true") throw Error(`"6 col." sem aria-hidden: ${hidden}`);
  });
  await check('390 salvar com porção de 0 g: "Confira as porções…" dentro da bandeja; some ao corrigir', async () => {
    await grams(page, ARROZ).fill("0");
    await save(page).click();
    await expect(tray(page).getByText(ZERO_PORTION, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toHaveCount(0);
    await shoot(page, "390-plate-tray-error.png", false);
    await grams(page, ARROZ).fill("150");
    await expect(page.getByText(ZERO_PORTION, { exact: true })).toHaveCount(0);
  });
  await shoot(page, "390-plate-tray.png", false);
  await check('390 remover do prato: aviso "Item removido do prato: Arroz integral." acima da bandeja; "Desfazer" devolve', async () => {
    await page.getByRole("button", { name: `Remover ${ARROZ}`, exact: true }).click();
    const message = page.getByText("Item removido do prato: Arroz integral.", { exact: true });
    const toast = message.locator("xpath=..");
    await expect(message).toBeVisible();
    await expect(grams(page, ARROZ)).toHaveCount(0);
    await expect(tray(page)).toContainText("1 item");
    await page.waitForTimeout(400);
    const [note, box] = [await toast.boundingBox(), await tray(page).boundingBox()];
    if (note.y + note.height > box.y) throw Error(`aviso sobre a bandeja: ${note.y + note.height} > ${box.y}`);
    await undo(page, "Item removido do prato: Arroz integral.");
    await expect(grams(page, ARROZ)).toHaveValue("150");
    await expect(page.getByRole("heading", { name: "Seu prato · 2 itens", exact: true })).toBeVisible();
    const order = await page.getByRole("list", { name: "Seu prato", exact: true }).getByRole("button", { name: /^Remover / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    if (order[0] !== `Remover ${ARROZ}`) throw Error(`ordem: ${order.join(", ")}`);
    await expect(page.getByRole("button", { name: `Aumentar ${ARROZ}`, exact: true })).toBeFocused();
  });
  await check("390: sem rolagem lateral (prato e bandeja)", () => noSideScroll(page));
  await check('390 salvar refeição: vai para o diário no dia da refeição, com "Refeição salva."', async () => {
    await save(page).click();
    await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
    await expect(page.getByText("Refeição salva.", { exact: true })).toBeVisible();
    // O Diário mostra a data longa acima do título (como o web): "Quinta, 24 de setembro".
    await expect(page.getByText(longDate(pillDay), { exact: true })).toBeVisible();
  });
  await check("390 fluxo principal: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Seus pratos: carregar, juntar/substituir, registrar agora e favoritos ----------
{
  const { page, context, errors } = await open(richState());
  const before = await pill(page).getAttribute("aria-label");
  await check("pratos: carregar com o prato vazio não pergunta e mantém a pílula", async () => {
    await page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Juntar ou substituir?", exact: true })).toHaveCount(0);
    await expect(loadedNotice(page)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: LOADED })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Seu prato · 3 itens", exact: true })).toBeVisible();
    await expect(grams(page, ARROZ)).toHaveValue("90");
    await expect(pill(page)).toHaveAttribute("aria-label", before);
  });
  await check("pratos: o aviso de itens carregados some quando o prato muda", async () => {
    await page.getByRole("button", { name: `Aumentar ${ARROZ}`, exact: true }).click();
    await expect(loadedNotice(page)).toHaveCount(0);
    await grams(page, ARROZ).fill("90");
  });
  await check('pratos: com itens, "Juntar aos itens" soma as porções (90 + 100 g) e mantém a medida do prato', async () => {
    await page.getByRole("group", { name: `Medida de ${ARROZ}`, exact: true }).getByRole("button", { name: "Gramas", exact: true }).click();
    await page.getByRole("button", { name: `Repetir Jantar de ${yesterday}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Juntar ou substituir?", exact: true })).toBeVisible();
    await expect(page.getByText("Seu prato já tem 3 itens. Quer juntar “Jantar” ao que já está no prato ou substituir os itens?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Juntar aos itens", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seu prato · 4 itens", exact: true })).toBeVisible();
    await expect(grams(page, ARROZ)).toHaveValue("190");
    await expect(page.getByRole("group", { name: `Medida de ${ARROZ}`, exact: true }).getByRole("button", { name: "Gramas", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  await check('pratos: com foto anexada, "Substituir itens" troca tudo e a foto continua', async () => {
    await toTop(page);
    await page.getByRole("button", { name: "Foto do prato, fica junto do registro", exact: true }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Galeria", exact: true }).click()]);
    await chooser.setFiles({ name: "prato.png", mimeType: "image/png", buffer: PHOTO });
    await expect(page.getByRole("button", { name: "Foto do prato, toque para trocar a foto", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true }).click();
    await expect(page.getByText("Seu prato já tem 4 itens. Quer juntar “Almoço de casa” ao que já está no prato ou substituir os itens? A foto anexada continua.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Substituir itens", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seu prato · 3 itens", exact: true })).toBeVisible();
    await expect(grams(page, ARROZ)).toHaveValue("90");
    await expect(page.getByRole("img", { name: "Foto da refeição a registrar", exact: true })).toHaveCount(1);
  });
  await check('pratos: "+" registra na hora ("Refeição registrada: tipo, hoje às hh:mm.") e, com itens no prato, fica na tela', async () => {
    const message = await loggedMessage(page);
    await page.getByRole("button", { name: "Registrar Almoço de casa agora", exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(toastWith(page, message).getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    await expect(save(page)).toBeVisible();
  });
  await check('favorito: salvar "Meu teste" cria o cartão depois dos outros favoritos', async () => {
    await page.getByLabel("Nome do prato favorito", { exact: true }).fill("Meu teste");
    await page.getByRole("button", { name: "Salvar como favorito", exact: true }).click();
    await expect(page.getByText("Prato guardado em Seus pratos. A refeição ainda precisa ser salva.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar favorito Meu teste", exact: true })).toBeVisible();
    await expect(page.getByLabel("Nome do prato favorito", { exact: true })).toHaveValue("");
  });
  await check('favorito: remover é imediato; "Desfazer" devolve na mesma posição', async () => {
    await page.getByRole("button", { name: "Remover favorito Almoço de casa", exact: true }).click();
    await expect(page.getByText("Favorito removido.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true })).toHaveCount(0);
    await undo(page, "Favorito removido.");
    await expect(page.getByText("Favorito restaurado.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true })).toBeFocused();
    const order = await page.getByRole("button", { name: /^Usar favorito / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    if (order.join() !== "Usar favorito Almoço de casa,Usar favorito Meu teste") throw Error(order.join());
    await page.getByRole("button", { name: "Remover favorito Meu teste", exact: true }).click();
    await expect(page.getByRole("button", { name: "Usar favorito Meu teste", exact: true })).toHaveCount(0);
  });
  await check("pratos: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(richState());
  await check('pratos: "+" com o prato vazio registra e abre o diário', async () => {
    const message = await loggedMessage(page);
    await page.getByRole("button", { name: `Registrar Jantar de ${yesterday} agora`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  });
  await check("registrar agora: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Rótulo e "Desfazer" depois de fechar a tela ----------
{
  const { page, context, errors } = await open(richState());
  await check('rótulo (a partir de uma busca sem resultado): "Salvar alimento" cadastra, limpa a busca e põe 100 g no prato', async () => {
    await search(page, "xyzw");
    await page.getByRole("button", { name: "Cadastrar alimento do rótulo", exact: true }).click();
    await expect(page.getByText("Transcreva os valores por 100 g, mesmo se o rótulo também mostrar outra porção.", { exact: true })).toBeVisible();
    await page.getByLabel("Nome do alimento", { exact: true }).fill("Barra teste");
    await page.getByLabel("Fonte dos valores", { exact: true }).fill("Rótulo da embalagem, 2026");
    for (const [label, value] of [["Valor energético (kcal)", "380"], ["Proteínas (g)", "8,5"], ["Carboidratos (g)", "62"], ["Gorduras totais (g)", "11"]])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Salvar alimento", exact: true }).click();
    await expect(page.getByText(LABEL_SAVED, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cadastrar alimento do rótulo", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Buscar alimento")).toHaveValue("");
    await expect(grams(page, "Barra teste")).toHaveValue("100");
    await expect(page.getByRole("heading", { name: "Seu prato · 1 item", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Medida de Barra teste", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aumentar Barra teste", exact: true })).toBeFocused();
  });
  await check(`rótulo: fora do prato, o alimento aparece em "${MINE}"`, async () => {
    await page.getByRole("button", { name: "Remover Barra teste", exact: true }).click();
    await expect(page.getByText("Item removido do prato: Barra teste.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: MINE, exact: true })).toBeVisible();
  });
  await check('desfazer depois de sair da tela: "Não dá mais para desfazer depois de sair da tela…"', async () => {
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
    await undo(page, "Item removido do prato: Barra teste.");
    await expect(page.getByText("Não dá mais para desfazer depois de sair da tela. Se quiser, adicione o alimento de novo.", { exact: true })).toBeVisible();
  });
  await check(`busca: alimento cadastrado em "${MINE}"; "Limpar busca" devolve o foco à busca`, async () => {
    await page.goto(url + "/refeicao");
    await expect(page.getByLabel("Buscar alimento")).toBeVisible({ timeout: 30000 });
    await search(page, "barra");
    await expect(page.getByRole("heading", { name: MINE, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar Barra teste", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca", exact: true }).click();
    await expect(page.getByLabel("Buscar alimento")).toHaveValue("");
    await expect(page.getByLabel("Buscar alimento")).toBeFocused();
  });
  await check("rótulo e desfazer: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Calorias ocultas: nenhum número de calorias na tela ----------
{
  const { page, context, errors } = await open(richState({ hideCalories: true }));
  await check("calorias ocultas: sem kcal nos cartões de pratos e frequentes", () => noKcal(page, "inicial"));
  await check("calorias ocultas: sem kcal no prato, no editor e na bandeja (só itens e barra)", async () => {
    await page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true }).click();
    await expect(tray(page)).toContainText("3 itens");
    await noKcal(page, "prato");
  });
  await shoot(page, "390-hide-calories.png");
  await check("calorias ocultas: sem kcal na busca", async () => {
    await search(page, "arroz");
    await expect(page.getByRole("heading", { name: "Arroz branco (tipo 1), cozido", exact: true })).toBeVisible();
    await noKcal(page, "busca");
  });
  await check('calorias ocultas: rótulo sem "Valor energético" nem kcal, só proteínas, carboidratos e gorduras', async () => {
    await page.getByRole("button", { name: "Limpar busca", exact: true }).click();
    await page.getByRole("button", { name: "Rótulo, novo alimento", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cadastrar alimento do rótulo", exact: true })).toBeVisible();
    await expect(page.getByText("Transcreva proteínas, carboidratos e gorduras por 100 g, mesmo se o rótulo também mostrar outra porção.", { exact: true })).toBeVisible();
    await expect(page.getByText("Valor energético", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("Valor energético (kcal)", { exact: true })).toHaveCount(0);
    await noKcal(page, "rótulo");
    await page.getByLabel("Nome do alimento", { exact: true }).fill("Barra oculta");
    await page.getByLabel("Fonte dos valores", { exact: true }).fill("Rótulo da embalagem, 2026");
    for (const [label, value] of [["Proteínas (g)", "10"], ["Carboidratos (g)", "20"], ["Gorduras totais (g)", "5"]])
      await page.getByLabel(label, { exact: true }).fill(value);
  });
  // O painel entra com um esmaecimento de 0,25 s: a foto espera ele terminar.
  await page.waitForTimeout(400);
  await shoot(page, "390-hide-calories-label.png", false);
  await check("calorias ocultas: salvar só com macros grava a energia por 4/4/9 kcal por grama (165 kcal)", async () => {
    await page.getByRole("button", { name: "Salvar alimento", exact: true }).click();
    await expect(page.getByText(LABEL_SAVED, { exact: true })).toBeVisible();
    await expect(grams(page, "Barra oculta")).toHaveValue("100");
    await noKcal(page, "depois do rótulo");
    const stored = (await readState(page, "hide-calories")).foods.find((f) => f.name === "Barra oculta");
    if (stored?.caloriesPer100g !== 10 * 4 + 20 * 4 + 5 * 9) throw Error(`energia gravada: ${stored?.caloriesPer100g}`);
  });
  await check("calorias ocultas: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- 360 px: sem rolagem lateral em nenhum estado ----------
{
  const { page, context, errors } = await open(richState(), 360);
  await check("360: sem rolagem lateral (inicial)", () => noSideScroll(page));
  await check("360: sem rolagem lateral (busca com preparos)", async () => {
    await search(page, "frango");
    // O preparo vai no nome da linha ("Peito de frango sem pele, grelhado").
    await expect(page.getByRole("heading", { name: /^Peito de frango sem pele, / }).first()).toBeVisible();
    await noSideScroll(page);
  });
  await check("360: sem rolagem lateral (prato, editor e bandeja)", async () => {
    // O grelhado do jantar de ontem é o preparo sugerido (reforço dos frequentes).
    await page.getByRole("button", { name: "Adicionar Frango, peito, sem pele, grelhado", exact: true }).click();
    // "Seus pratos" fica sob a busca vazia (conceito 02): limpa a busca antes de usar o favorito.
    await search(page, "");
    await page.getByRole("button", { name: "Usar favorito Almoço de casa", exact: true }).click();
    await page.getByRole("button", { name: "Juntar aos itens", exact: true }).click();
    await expect(tray(page)).toContainText("4 itens");
    await noSideScroll(page);
    const [button, box] = [await save(page).boundingBox(), await tray(page).boundingBox()];
    if (button.x + button.width > box.x + box.width) throw Error("botão de salvar fora da bandeja");
  });
  await check("360: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
