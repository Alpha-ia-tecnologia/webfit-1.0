// Verificação da Onda 2 · Lote 5 (Seringa e GLP-1) no export web do app, a 390 px (e 360/320 onde indicado):
// formulário sem histórico (modo, dose num único valor, seringa com escala em texto e lupa, régua da bula,
// estouro sem grampear), folha "Confirmar aplicação" (só "Cancelar", um único "Voltar"), dose de sempre em
// dois toques com "Desfazer", "Outra dose ou frasco novo", modo caneta, guia rápido, card do Hoje (anel da
// próxima dose estimada, ciclo, promoção no dia, "Como você está?"), "Meu tratamento" no Espaço e o lembrete
// "Dia da aplicação (estimado)". Onda 3 · Lote 3: registrar pela Seringa abre "Aplicação registrada" (com
// "Ver no diário" e "Desfazer") em vez do aviso. Só o export web pode ser testado aqui (sem aparelho).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l5
//   node --import tsx scripts/o2l5-check.mjs dist/o2l5 [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate, shiftDate } from "../../src/lib/domain.ts";
import { domainTone, palette } from "../../src/design/tokens.ts";
import { questionnaire } from "../../src/data/questionnaire.ts";
import { STALE_RECIPE_TEXT } from "../../src/lib/injection.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l5");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l5-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o2l5-seed-"));
const PORT = 3220;
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

const SEMA = { weightLossPen: "sim", weightLossPenName: "Semaglutida", weightLossPenDose: "0,5 mg", weightLossPenPerMonth: 4 };
const TIRZ = { weightLossPen: "sim", weightLossPenName: "Tirzepatida", weightLossPenDose: "2,5 mg", weightLossPenPerMonth: 4 };
/** Aplicação de Tirzepatida 5 mg/ml, 50 UI na seringa de 100 UI (2,5 mg), `daysAgo` dias atrás. */
function inj(id, daysAgo, fields = {}) {
  const date = shiftDate(today, -daysAgo);
  const time = fields.time ?? "08:30";
  return {
    id,
    userId: "local",
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
/** Três aplicações iguais (braço, coxa, abdômen); a do meio sem `method` (registro antigo). */
function threeTirz() {
  const middle = inj("t2", 9, { site: "coxa" });
  delete middle.method;
  return [inj("t1", 16, { site: "braco" }), middle, inj("t3", 2, { site: "abdomen" })];
}
function stateWith(profile = {}, injections = []) {
  const state = stateFixture();
  return {
    ...state,
    profile: { ...state.profile, ...profile },
    injections: injections.map((e) => ({ ...e, userId: state.userId })),
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
const injecaoReady = (page) => page.getByRole("heading", { name: "Seringa e dose", exact: true });
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

/**
 * Sem rolagem lateral. `ignore`: trecho de outro dono com transbordo recortado conhecido (a legenda do
 * body-map.tsx, que este lote não pode mudar, é cortada pelo próprio cartão a 320 px).
 */
async function noSideScroll(page, ignore = null) {
  const problem = await page.evaluate((skip) => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    for (const el of document.querySelectorAll("body *")) {
      if (skip && el.closest(skip)) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  }, ignore);
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
/** Menor fonte de texto visível (px) dentro de `selector`, ignorando SVG e texto só para leitores de tela. */
async function smallestText(page, selector = "body") {
  return page.evaluate((sel) => {
    let min = Infinity;
    const root = document.querySelector(sel);
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
/** Rótulos da escala (texto de verdade): caixas do texto, tamanho da fonte e o topo do cilindro. */
async function scaleGeometry(page) {
  return page.evaluate(() => {
    const scale = document.querySelector('[data-testid="syringe-scale"]');
    const barrel = document.querySelector('[data-testid="syringe-barrel"]');
    if (!scale || !barrel) return null;
    const labels = [...scale.querySelectorAll("*")]
      .filter((el) => el.childNodes.length && [...el.childNodes].every((n) => n.nodeType === 3) && el.textContent.trim())
      .map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const box = range.getBoundingClientRect();
        // Largura do próprio elemento: menor que o texto = número cortado (ex.: max-width 0 do numberOfLines).
        const own = el.getBoundingClientRect().width;
        return { text: el.textContent.trim(), left: box.left, right: box.right, bottom: box.bottom, own, size: parseFloat(getComputedStyle(el).fontSize) };
      })
      .sort((a, b) => a.left - b.left);
    return { labels, barrelTop: barrel.getBoundingClientRect().top };
  });
}
async function scaleOk(page, where) {
  const geo = await scaleGeometry(page);
  if (!geo) throw Error(`${where}: sem escala ou cilindro`);
  const { labels, barrelTop } = geo;
  if (labels.length < 5) throw Error(`${where}: ${labels.length} rótulos`);
  for (const l of labels) {
    if (l.size < 12) throw Error(`${where}: rótulo ${l.text} com ${l.size}px`);
    if (l.own + 0.5 < l.right - l.left) throw Error(`${where}: rótulo ${l.text} cortado (${l.own.toFixed(1)} px de ${(l.right - l.left).toFixed(1)})`);
    if (l.bottom > barrelTop + 0.5) throw Error(`${where}: rótulo ${l.text} abaixo do topo do cilindro`);
  }
  for (let i = 1; i < labels.length; i++)
    if (labels[i].left < labels[i - 1].right - 0.5) throw Error(`${where}: ${labels[i - 1].text} e ${labels[i].text} se sobrepõem`);
  return labels.map((l) => l.text).join(" ");
}
async function shoot(page, file, locator) {
  await page.waitForTimeout(450);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file), fullPage: false });
}
const sheet = (page, title) => page.getByRole("heading", { name: title, exact: true }).locator("xpath=../..");
/** SERINGA-10: depois do registro pela Seringa, a folha "Aplicação registrada" leva ao diário. */
async function openDiaryFromSaved(page) {
  await sheet(page, "Aplicação registrada").getByRole("button", { name: "Ver no diário", exact: true }).click();
}
const bar = (page) => page.getByTestId("injection-bar").getByRole("button");
const radio = (page, name) => page.getByRole("radio", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
/** Botão da receita (conceito 10): "Registrar aplicação de hoje" no dia estimado, senão "Registrar aplicação". */
const recipeRegister = (page) => page.getByTestId("injection-recipe").getByRole("button", { name: /^Registrar aplicação/ });
const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
async function wheel(page, dy) {
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(450);
}

// ---------- (a, b, c, e, m) Formulário sem histórico: 0,50 mg, ajuste manual, confirmação e registro ----------
{
  const { page, context, errors } = await open(stateWith(SEMA), { route: "/injecao", ready: injecaoReady });
  await shoot(page, "390-form-vazio.png");
  await check("(a) sem histórico: 3 modos com \"Frasco e seringa\", dose \"—\" e barra aria-disabled", async () => {
    await expect(page.getByRole("radiogroup", { name: "Como você aplica?" }).getByRole("radio")).toHaveCount(3);
    await expect(radio(page, "Frasco e seringa")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Caneta com seletor")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("injection-dose")).toHaveText("—");
    await expect(page.getByTestId("injection-volume")).toHaveText("—");
    await expect(bar(page)).toHaveAttribute("aria-label", "Informe a dose para registrar");
    await expect(bar(page)).toHaveAttribute("aria-disabled", "true");
  });
  await check("(a) tocar a barra sem dose avisa e não abre a confirmação", async () => {
    // aria-disabled: o Playwright só clica forçando (o toque de verdade continua respondendo).
    await bar(page).click({ force: true });
    await expect(page.getByText("Informe a dose prescrita antes de registrar.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirmar aplicação", exact: true })).toHaveCount(0);
  });
  await check("(m) formulário: nenhum texto abaixo de 12 px e sem rolagem lateral", async () => {
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page);
  });
  await check('(a) "Dose de 0,50 mg" → 0,50 mg, 0,37 ml, seringa de 50 UI e "37 UI" no destaque', async () => {
    await button(page, "Dose de 0,50 mg").click();
    await expect(page.getByTestId("injection-dose")).toHaveText("0,50");
    await expect(page.getByTestId("injection-volume")).toHaveText("0,37");
    await expect(radio(page, "Seringa de 50 UI")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("injection-hero")).toContainText("37 UI");
    await expect(button(page, "Dose de 0,50 mg")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Aspire até 37 UI, 0,37 ml" })).toHaveCount(1);
  });
  await check("(a) escala em texto ≥ 12 px, acima do cilindro e sem sobreposição; sem lupa na de 50 UI", async () => {
    const labels = await scaleOk(page, "390");
    console.log(`  rótulos (50 UI): ${labels}`);
    await expect(page.getByTestId("syringe-lens")).toHaveCount(0);
    await expect(page.getByTestId("syringe-marker")).toContainText("37 UI");
    await expect(page.getByRole("img", { name: "Seringa de 50 UI: aspire até 37 UI, 0,37 ml", exact: true })).toBeVisible();
  });
  await page.getByTestId("injection-hero").scrollIntoViewIfNeeded();
  await shoot(page, "390-seringa-37.png");
  await check('(a) régua da bula: "Faixa da bula: Titulação (0,50 mg)" só na trilha', async () => {
    const track = page.getByTestId("injection-ruler").getByRole("img", { name: /^Faixa da bula/ });
    await expect(track).toHaveAttribute("aria-label", "Faixa da bula: Titulação (0,50 mg)");
  });
  await check('(b) "Ajuste manual" vai de aria-expanded false a true; "Aumentar 1 UI" → 0,38 ml', async () => {
    const toggle = button(page, "Ajuste manual");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Unidades na seringa", { exact: true })).toBeVisible();
    await button(page, "Aumentar 1 UI").click();
    await expect(page.getByTestId("injection-volume")).toHaveText("0,38");
  });
  await check("(c) Frasco, data e horário e observação expõem aria-expanded", async () => {
    for (const name of ["Alterar a concentração do frasco", "Alterar data e horário", "Adicionar observação"]) {
      const toggle = button(page, name);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
    await expect(page.getByLabel("Observação", { exact: true })).toBeVisible();
    await expect(button(page, "Diminuir 0,1 mg/ml")).toBeVisible();
    await expect(page.getByTestId("injection-concentration")).toHaveCount(1);
  });
  await check("(m) alvos de toque de 44 px no formulário", async () => {
    await touch44(radio(page, "Frasco e seringa"), "modo");
    await touch44(radio(page, "Semaglutida"), "medicação");
    await touch44(radio(page, "Seringa de 50 UI"), "seringa");
    await touch44(button(page, "Aumentar 0,05 mg"), "+0,05 mg");
    await touch44(button(page, "Dose de 0,50 mg"), "atalho");
    await touch44(page.getByRole("button", { name: /^Dose prescrita: / }), "valor da dose");
    await touch44(button(page, "Alterar a concentração do frasco"), "frasco");
    await touch44(button(page, "5 mg/ml"), "concentração rápida");
    await touch44(button(page, "Alterar data e horário"), "quando");
    await touch44(button(page, "Adicionar observação"), "observação");
    await touch44(button(page, "Guia rápido e segurança"), "(i)");
    await touch44(radio(page, "Coxa"), "local");
    await touch44(bar(page), "barra");
  });
  await check("(e) a barra fica fixa no rodapé enquanto a tela rola", async () => {
    const before = await page.getByTestId("injection-bar").boundingBox();
    await wheel(page, 900);
    const after = await page.getByTestId("injection-bar").boundingBox();
    if (Math.abs(before.y - after.y) > 1) throw Error(`barra ${before.y} → ${after.y}`);
    if (after.y + after.height > 844 + 0.5) throw Error("barra fora da tela");
  });
  await check('(e) "Confirmar e registrar 38 UI" abre "Confirmar aplicação" (Frasco, Seringa, Dose), um só "Voltar"', async () => {
    await radio(page, "Coxa").click();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa");
    await page.getByRole("button", { name: /^Confirmar e registrar 38 UI/ }).click();
    const panel = sheet(page, "Confirmar aplicação");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Frasco Semaglutida · 1,34 mg/ml");
    await expect(panel).toContainText("Seringa 50 UI · aspire até 38 UI (0,38 ml)");
    await expect(panel).toContainText("Dose 0,51 mg");
    await expect(panel).toContainText("Local · Coxa");
    await expect(page.getByRole("button", { name: "Voltar", exact: true, includeHidden: true })).toHaveCount(1);
    await expect(panel.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
    await touch44(panel.getByRole("button", { name: "Registrar aplicação", exact: true }), "Registrar aplicação");
    await touch44(panel.getByRole("button", { name: "Cancelar", exact: true }), "Cancelar");
  });
  await shoot(page, "390-confirmar-form.png");
  await check('(e) "Registrar aplicação" → "Aplicação registrada" → "Ver no diário" com "38 UI · 0,38 ml · Coxa"', async () => {
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await openDiaryFromSaved(page);
    await expect(page).toHaveURL(/\/diario/);
    await expect(diaryReady(page)).toBeVisible();
    await expect(page.getByText("38 UI · 0,38 ml · Coxa", { exact: true }).filter({ visible: true })).toBeVisible();
  });
  await check("(m) formulário e registro: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("registro gravado: frasco, 38 UI, 0,51 mg, coxa", async () => {
    const saved = await readState(page, "form");
    const e = saved.injections.at(-1);
    if (saved.injections.length !== 1 || e.method !== "frasco" || e.units !== 38 || e.site !== "coxa" || Math.abs(e.doseMg - 0.509) > 0.001)
      throw Error(JSON.stringify(e));
  });
  await context.close();
}

// ---------- (a) Lupa na seringa de 100 UI a 390/360/320 e (d) estouro sem grampear ----------
{
  const { page, context, errors } = await open(stateWith(SEMA), { route: "/injecao", ready: injecaoReady });
  await check('(a) "Seringa de 100 UI" + "Dose de 1,00 mg": lupa, um cilindro, rótulos sem sobreposição', async () => {
    await radio(page, "Seringa de 100 UI").click();
    await button(page, "Dose de 1,00 mg").click();
    await expect(page.getByTestId("injection-hero")).toContainText("75 UI");
    await expect(page.getByTestId("syringe-lens")).toBeVisible();
    await expect(page.getByTestId("syringe-lens")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByTestId("syringe-barrel")).toHaveCount(1);
    await expect(page.getByTestId("syringe-marker")).toHaveCount(1);
    const lensLabels = await page.getByTestId("syringe-lens").evaluate((el) =>
      [...el.querySelectorAll("*")]
        .filter((n) => n.childNodes.length && [...n.childNodes].every((c) => c.nodeType === 3) && /^\d+$/.test(n.textContent.trim()))
        .map((n) => ({ t: n.textContent.trim(), own: n.getBoundingClientRect().width })),
    );
    if (lensLabels.length < 3 || lensLabels.some((l) => l.own < 6)) throw Error(`lupa: ${JSON.stringify(lensLabels)}`);
    console.log(`  lupa: ${lensLabels.map((l) => l.t).join(" ")}`);
    console.log(`  rótulos 390: ${await scaleOk(page, "390")}`);
  });
  await page.getByTestId("syringe-lens").scrollIntoViewIfNeeded();
  await shoot(page, "390-lupa-75.png");
  for (const width of [360, 320]) {
    await check(`(a) ${width} px: escala sem sobreposição, lupa à vista e sem rolagem lateral`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(500);
      console.log(`  rótulos ${width}: ${await scaleOk(page, String(width))}`);
      await expect(page.getByTestId("syringe-lens")).toBeVisible();
      await noSideScroll(page, width < 360 ? '[data-testid="injection-body-map"]' : null);
    });
    await page.getByTestId("syringe-lens").scrollIntoViewIfNeeded();
    await shoot(page, `${width}-lupa-75.png`);
  }
  await check("(a) 320 px: rótulos da régua sem sobreposição (linhas alternadas)", async () => {
    const boxes = await page.getByTestId("injection-ruler").evaluate((el) =>
      [...el.querySelectorAll("*")]
        .filter((n) => n.childNodes.length && [...n.childNodes].every((c) => c.nodeType === 3) && /^(Inicial|Titulação|Manutenção|Acima)$/.test(n.textContent.trim()))
        .map((n) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          const b = r.getBoundingClientRect();
          return { t: n.textContent.trim(), l: b.left, r: b.right, top: b.top, bottom: b.bottom, own: n.getBoundingClientRect().width };
        }),
    );
    if (boxes.length !== 4) throw Error(`${boxes.length} rótulos`);
    for (const b of boxes) if (b.own + 0.5 < b.r - b.l) throw Error(`${b.t} cortado`);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.l < b.r && b.l < a.r && a.top < b.bottom && b.top < a.bottom) throw Error(`${a.t} × ${b.t}`);
      }
    if (Math.min(...boxes.map((b) => b.l)) < 0 || Math.max(...boxes.map((b) => b.r)) > 320) throw Error("rótulo fora da tela");
  });
  await page.getByTestId("injection-ruler").scrollIntoViewIfNeeded();
  await shoot(page, "320-regua.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await check('(d) digitar "3" a 1,34 mg/ml: 3,00 mg, volume "—", aviso de 224 UI, barra aria-disabled', async () => {
    await page.getByRole("button", { name: /^Dose prescrita: / }).click();
    const input = page.getByLabel("Dose prescrita em mg", { exact: true });
    await expect(input).toBeFocused();
    await input.fill("3");
    await input.press("Enter");
    await expect(page.getByTestId("injection-dose")).toHaveText("3,00");
    await expect(page.getByTestId("injection-volume")).toHaveText("—");
    await expect(page.getByRole("status").filter({ hasText: "precisaria de 224 UI" })).toBeVisible();
    await expect(bar(page)).toHaveAttribute("aria-label", "Confira a concentração do frasco para registrar");
    await expect(bar(page)).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("heading", { name: "Confirmar aplicação", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Dose prescrita: 3,00 mg/ })).toBeFocused();
  });
  await check("(d) estouro: tocar a barra mostra o aviso da concentração, sem abrir a confirmação", async () => {
    // aria-disabled: o Playwright só clica forçando (o toque de verdade continua respondendo).
    await bar(page).click({ force: true });
    await expect(page.getByText("3,00 mg a 1,34 mg/ml precisaria de 224 UI, mais que a seringa de 100 UI. Confira a concentração do frasco.", { exact: true }).last()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirmar aplicação", exact: true })).toHaveCount(0);
  });
  await page.getByTestId("injection-dose").scrollIntoViewIfNeeded();
  await shoot(page, "390-estouro.png");
  await check('(d) "5 mg/ml" no frasco: 60 UI, régua "Acima" com o aviso fora da trilha e barra ativa', async () => {
    await button(page, "Alterar a concentração do frasco").click();
    await button(page, "5 mg/ml").click();
    await expect(page.getByTestId("injection-hero")).toContainText("60 UI");
    await expect(page.getByTestId("injection-volume")).toHaveText("0,60");
    const track = page.getByTestId("injection-ruler").getByRole("img", { name: /^Faixa da bula/ });
    await expect(track).toHaveAttribute("aria-label", /Acima/);
    await expect(track.getByText(/Acima das doses habituais/)).toHaveCount(0);
    const alert = page.getByRole("status").filter({ hasText: "Acima das doses habituais" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("2,40 mg");
    await expect(bar(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /^Confirmar e registrar 60 UI/ })).toBeVisible();
  });
  await page.getByTestId("injection-ruler").scrollIntoViewIfNeeded();
  await shoot(page, "390-acima-da-bula.png");
  await check("(d) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Marca mais próxima: atalhos, régua pela dose prescrita, dica da marca; "+0,05 mg" em 100 UI ----------
{
  const { page, context, errors } = await open(stateWith(SEMA), { route: "/injecao", ready: injecaoReady });
  const track = () => page.getByTestId("injection-ruler").getByRole("img", { name: /^Faixa da bula/ });
  await check('"Dose de 0,25 mg" a 1,34 mg/ml: 19 UI, dose "0,25", atalho ligado e régua "Inicial" (sem dica)', async () => {
    await button(page, "Dose de 0,25 mg").click();
    await expect(page.getByTestId("injection-hero")).toContainText("19 UI");
    await expect(page.getByTestId("injection-dose")).toHaveText("0,25");
    await expect(button(page, "Dose de 0,25 mg")).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, "Dose de 0,50 mg")).toHaveAttribute("aria-pressed", "false");
    await expect(track()).toHaveAttribute("aria-label", "Faixa da bula: Inicial (0,25 mg)");
    await expect(page.getByTestId("injection-nearest-mark")).toHaveCount(0);
    await expect(bar(page)).toHaveAttribute("aria-label", "Confirmar e registrar 19 UI (0,25 mg)");
  });
  await check('"Dose de 1,00 mg" (75 UI = 1,005 mg): atalho ligado e régua "Titulação (1,00 mg)", não "Manutenção"', async () => {
    await button(page, "Dose de 1,00 mg").click();
    await expect(page.getByTestId("injection-hero")).toContainText("75 UI");
    await expect(button(page, "Dose de 1,00 mg")).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, "Dose de 0,25 mg")).toHaveAttribute("aria-pressed", "false");
    await expect(track()).toHaveAttribute("aria-label", "Faixa da bula: Titulação (1,00 mg)");
  });
  await check('digitar "0,3": 22 UI, dose real "0,29" e a dica de 12 px da marca mais próxima', async () => {
    await page.getByRole("button", { name: /^Dose prescrita: / }).click();
    const input = page.getByLabel("Dose prescrita em mg", { exact: true });
    await input.fill("0,3");
    await input.press("Enter");
    await expect(page.getByTestId("injection-hero")).toContainText("22 UI");
    await expect(page.getByTestId("injection-dose")).toHaveText("0,29");
    const hint = page.getByTestId("injection-nearest-mark");
    await expect(hint).toHaveText("22 UI é a marca mais próxima de 0,30 mg na seringa (0,29 mg).");
    const size = await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (size !== 12) throw Error(`dica com ${size} px`);
    await expect(track()).toHaveAttribute("aria-label", "Faixa da bula: Titulação (0,30 mg)");
  });
  await page.getByTestId("injection-dose").scrollIntoViewIfNeeded();
  await shoot(page, "390-marca-mais-proxima.png");
  const overflow = "1,39 mg a 1,34 mg/ml precisaria de 104 UI, mais que a seringa de 100 UI. Confira a concentração do frasco.";
  await check('100 UI: "Aumentar 0,05 mg" vira 1,39 mg com o aviso de 104 UI (nunca fica calado)', async () => {
    await page.getByRole("button", { name: /^Dose prescrita: / }).click();
    const input = page.getByLabel("Dose prescrita em mg", { exact: true });
    await input.fill("1,34");
    await input.press("Enter");
    await expect(page.getByTestId("injection-hero")).toContainText("100 UI");
    await expect(page.getByTestId("injection-volume")).toHaveText("1,00");
    await button(page, "Aumentar 0,05 mg").click();
    await expect(page.getByTestId("injection-dose")).toHaveText("1,39");
    await expect(page.getByTestId("injection-volume")).toHaveText("—");
    await expect(page.getByRole("status").filter({ hasText: overflow })).toBeVisible();
    await expect(bar(page)).toHaveAttribute("aria-disabled", "true");
    await expect(button(page, "Dose de 1,00 mg")).toHaveAttribute("aria-pressed", "false");
  });
  await check("estouro: ±1/±5 UI com aria-disabled; tocar avisa e não troca a dose prescrita", async () => {
    await button(page, "Ajuste manual").click();
    for (const name of ["Diminuir 5 UI", "Diminuir 1 UI", "Aumentar 1 UI", "Aumentar 5 UI"])
      await expect(button(page, name)).toHaveAttribute("aria-disabled", "true");
    // aria-disabled: o Playwright só clica forçando (o toque de verdade continua respondendo).
    await button(page, "Aumentar 1 UI").click({ force: true });
    await expect(page.getByTestId("toast-warning")).toContainText(overflow);
    await expect(page.getByTestId("injection-dose")).toHaveText("1,39");
    await expect(page.getByTestId("injection-volume")).toHaveText("—");
    await button(page, "Diminuir 5 UI").click({ force: true });
    await expect(page.getByTestId("injection-dose")).toHaveText("1,39");
  });
  await check('"Diminuir 0,05 mg" volta a 1,34 mg / 100 UI e libera os botões de UI', async () => {
    await button(page, "Diminuir 0,05 mg").click();
    await expect(page.getByTestId("injection-dose")).toHaveText("1,34");
    await expect(page.getByTestId("injection-volume")).toHaveText("1,00");
    await expect(button(page, "Aumentar 1 UI")).not.toHaveAttribute("aria-disabled", "true");
    await expect(bar(page)).not.toHaveAttribute("aria-disabled", "true");
  });
  await check("marca mais próxima e estouro: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- (f, m) Dose de sempre: 3× Tirzepatida, Cancelar não grava, registro + Desfazer ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, threeTirz()), { route: "/injecao", ready: injecaoReady });
  await shoot(page, "390-dose-de-sempre.png");
  await check('(f) "Minha dose de sempre" com 2,50 mg, 5 mg/ml, seringa de 100 UI; local sugerido Coxa no cartão "Próxima aplicação"', async () => {
    // Conceito 10: a receita é o cartão "Minha dose de sempre" com a seringa; o local sugerido fica no cartão navy.
    await expect(page.getByRole("heading", { name: "Minha dose de sempre", exact: true })).toBeVisible();
    await expect(page.getByTestId("injection-recipe-dose")).toHaveText("2,50");
    const hero = page.getByTestId("injection-recipe");
    for (const text of ["igual a ", "5 mg/ml", "Seringa de 100 UI", "50 UI", "0,50 ml", "Aspire até aqui · 50 UI"]) await expect(hero).toContainText(text);
    await expect(page.getByTestId("next-application")).toContainText("Local sugerido: Coxa");
    await expect(page.getByTestId("next-application")).toContainText("Próxima aplicação estimada");
    // O aviso de aplicação recente saiu da tela da receita: fica na folha de confirmação (recalculado pela data).
    await expect(page.getByText("Você registrou Tirzepatida 2,50 mg há 2 dias.", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("injection-bar")).toHaveCount(0);
  });
  await check("(m) dose de sempre: nenhum texto abaixo de 12 px, sem rolagem lateral", async () => {
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
    await noSideScroll(page);
  });
  await check('(f) "Registrar aplicação" da receita → confirmação com o aviso recente; "Cancelar" fecha sem gravar', async () => {
    await recipeRegister(page).click();
    const panel = sheet(page, "Confirmar aplicação");
    await expect(panel).toContainText("Frasco Tirzepatida · 5 mg/ml");
    await expect(panel).toContainText("Seringa 100 UI · aspire até 50 UI (0,50 ml)");
    await expect(panel).toContainText("Dose 2,50 mg");
    await expect(panel).toContainText("Você registrou Tirzepatida 2,50 mg há 2 dias.");
    await expect(panel.getByRole("radio", { name: "Coxa", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(panel.getByRole("button", { name: "Alterar data e horário", exact: true })).toBeVisible();
    await shoot(page, "390-confirmar-receita.png");
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirmar aplicação", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Minha dose de sempre", exact: true })).toBeVisible();
  });
  await check('(f) "Registrar aplicação" → "Aplicação registrada" com a frase e "Desfazer"; desfazer fica na Seringa', async () => {
    await recipeRegister(page).click();
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    const panel = sheet(page, "Aplicação registrada");
    await expect(panel.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/injecao/);
    await panel.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByText("Registro da aplicação desfeito.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aplicação registrada", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/injecao/);
  });
  await check('(f) registrar de novo → "Ver no diário": um único registro de hoje com "50 UI · 0,50 ml · Coxa"', async () => {
    await recipeRegister(page).click();
    await sheet(page, "Confirmar aplicação").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await openDiaryFromSaved(page);
    await expect(page).toHaveURL(/\/diario/);
    await expect(page.getByRole("heading", { name: "Tirzepatida 2,50 mg", exact: true })).toHaveCount(1);
    await expect(page.getByText("50 UI · 0,50 ml · Coxa", { exact: true }).filter({ visible: true })).toBeVisible();
  });
  await check("(f) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("(f) Cancelar não gravou e o Desfazer tirou o 1º registro: ficam 3 + 1 aplicações", async () => {
    const saved = await readState(page, "recipe");
    if (saved.injections.length !== 4) throw Error(`${saved.injections.length} aplicações`);
  });
  await context.close();
}

// ---------- (g, i) "Outra dose ou frasco novo" e o guia rápido ----------
{
  const { page, context, errors } = await open(stateWith(TIRZ, threeTirz()), { route: "/injecao", ready: injecaoReady });
  await check('(g) "Outra dose ou frasco novo": frasco aberto e focado, 5 mg/ml, 100 UI, 2,50 mg e 0,50 ml', async () => {
    await button(page, "Outra dose ou frasco novo").click();
    const toggle = button(page, "Alterar a concentração do frasco");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toBeFocused();
    await expect(page.getByTestId("injection-concentration")).toHaveText("5");
    await expect(button(page, "Diminuir 0,1 mg/ml")).toBeVisible();
    await expect(radio(page, "Tirzepatida")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Seringa de 100 UI")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("injection-dose")).toHaveText("2,50");
    await expect(page.getByTestId("injection-volume")).toHaveText("0,50");
    await expect(page.getByTestId("syringe-lens")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByTestId("syringe-barrel")).toHaveCount(1);
    await expect(page.getByTestId("syringe-marker")).toHaveCount(1);
  });
  await shoot(page, "390-outra-dose.png");
  await check("(i) guia: (i) de 44 × 44, 4 cartões, próximo/anterior e sem \"Informações de segurança\"", async () => {
    await expect(button(page, "Informações de segurança")).toHaveCount(0);
    const info = button(page, "Guia rápido e segurança");
    const box = await info.boundingBox();
    if (Math.round(box.width) !== 44 || Math.round(box.height) !== 44) throw Error(`(i) ${box.width}×${box.height}`);
    await info.click();
    const panel = sheet(page, "Guia rápido");
    await expect(panel).toBeVisible();
    for (const title of ["Confira o frasco", "Leia a seringa certa", "Troque o local", "Quem orienta a dose"])
      await expect(panel.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(panel).toContainText("dor abdominal forte");
    await expect(panel).toContainText("O registro fica no diário, neste aparelho.");
    await expect(panel.getByText("1 de 4", { exact: true })).toBeVisible();
    await touch44(panel.getByRole("button", { name: "Próximo cartão", exact: true }), "Próximo cartão");
    await panel.getByRole("button", { name: "Próximo cartão", exact: true }).click();
    await expect(panel.getByText("2 de 4", { exact: true })).toBeVisible();
    await shoot(page, "390-guia-2.png");
    await panel.getByRole("button", { name: "Cartão anterior", exact: true }).click();
    await expect(panel.getByText("1 de 4", { exact: true })).toBeVisible();
    const small = await smallestText(page);
    if (small < 12) throw Error(`texto de ${small} px`);
  });
  await check("(g, i) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- (h) Caneta com seletor (calorias ocultas) ----------
{
  const { page, context, errors } = await open(stateWith({ ...TIRZ, hideCalories: true }), { route: "/injecao", ready: injecaoReady });
  await check('(h) "Caneta com seletor": sem seringa nem concentração; 5,00 mg e régua "Titulação"', async () => {
    await radio(page, "Caneta com seletor").click();
    await expect(radio(page, "Caneta com seletor")).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, "Seringa de 30 UI")).toHaveCount(0);
    await expect(page.getByTestId("injection-concentration")).toHaveCount(0);
    await expect(radio(page, "Tirzepatida")).toHaveAttribute("aria-checked", "true");
    await button(page, "Dose de 5,00 mg").click();
    await expect(page.getByTestId("injection-dose")).toHaveText("5,00");
    await expect(page.getByTestId("injection-ruler").getByRole("img", { name: /^Faixa da bula/ })).toHaveAttribute("aria-label", /^Faixa da bula: Titulação/);
    // Onda 3: o mapa de rodízio serve aos dois modos (a miniatura só leitura saiu do formulário da caneta).
    await expect(page.getByTestId("injection-body-map")).toBeVisible();
    await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Abdômen");
    const body = await page.locator("body").innerText();
    if (/kcal|caloria/i.test(body)) throw Error("calorias à vista");
  });
  await page.getByTestId("injection-dose").scrollIntoViewIfNeeded();
  await shoot(page, "390-caneta.png");
  await check('(h) "Confirmar e registrar 5,00 mg" → confirmação sem "Seringa" → "Ver no diário" → "Caneta · Abdômen"', async () => {
    await page.getByRole("button", { name: /^Confirmar e registrar 5,00 mg/ }).click();
    const panel = sheet(page, "Confirmar aplicação");
    await expect(panel).toContainText("Caneta Tirzepatida · Caneta com seletor");
    await expect(panel).not.toContainText("Seringa");
    await panel.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await openDiaryFromSaved(page);
    await expect(page).toHaveURL(/\/diario/);
    await expect(page.getByRole("heading", { name: "Tirzepatida 5,00 mg", exact: true })).toBeVisible();
    await expect(page.getByText("Caneta · Abdômen", { exact: true }).filter({ visible: true })).toBeVisible();
  });
  await check("(h) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await check("(h) registro da caneta: method caneta e campos da seringa nulos", async () => {
    const saved = await readState(page, "pen");
    const e = saved.injections.at(-1);
    if (e.method !== "caneta" || e.units !== null || e.volumeMl !== null || e.concentrationMgPerMl !== null || e.syringeUnits !== null || e.doseMg !== 5)
      throw Error(JSON.stringify(e));
  });
  await context.close();
}

// ---------- (j) Hoje: anel da próxima dose estimada, ciclo, promoção no dia e perfis sem contagem ----------
const card = (page) => page.getByTestId("injection-card");
{
  const { page, context, errors } = await open(stateWith(TIRZ, [inj("h1", 2, { site: "abdomen" })]));
  await card(page).scrollIntoViewIfNeeded();
  await shoot(page, "390-hoje-anel.png", card(page));
  // Conceito 01: o card do Hoje é um widget (anel, remédio, próxima, última e o mapa, que abre a calculadora); a faixa do ciclo saiu, como no web.
  await check('(j) aplicação há 2 dias: anel "em 5 dias", sem faixa do ciclo e o mapa "Calcular dose e registrar" com Coxa', async () => {
    await expect(page.getByTestId("next-dose-ring")).toHaveAttribute("aria-label", /^Próxima dose estimada em 5 dias/);
    await expect(page.getByTestId("dose-cycle-strip")).toHaveCount(0);
    await expect(page.getByTestId("injection-site-mini")).toHaveAttribute("aria-label", "Local sugerido: Coxa");
    await expect(card(page).getByRole("button", { name: "Calcular dose e registrar · local sugerido: Coxa", exact: true })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Registrar aplicação", exact: true })).toHaveCount(0);
    await expect(card(page)).toContainText("Última há 2 dias · abdômen");
    const text = await page.locator("body").innerText();
    if (/atrasad/i.test(text)) throw Error("\"atrasad…\" na tela");
  });
  await check("(m) card do Hoje: texto ≥ 12 px e \"Como você está?\" com 44 px", async () => {
    const small = await smallestText(page, '[data-testid="injection-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    await touch44(button(page, "Como você está? Registrar bem-estar"), "Como você está?");
    await touch44(card(page).getByRole("button", { name: /^Calcular dose e registrar/ }), "Calcular dose e registrar");
  });
  await check('(j) "Como você está?" abre "Registrar bem-estar" (o título "Como você está?" do Hoje não muda)', async () => {
    await button(page, "Como você está? Registrar bem-estar").click();
    const title = page.getByRole("heading", { name: "Registrar bem-estar", exact: true });
    await expect(title).toBeVisible();
    await title.locator("xpath=..").getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(title).toHaveCount(0);
  });
  await check("(j) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith(TIRZ, [inj("h7", 7, { site: "braco" })]));
  await shoot(page, "390-hoje-promovido.png");
  // A Água fica oculta por padrão (Editar Hoje): a referência é a linha do tempo das refeições, que vem antes da caneta.
  await check("(j) no dia estimado o card sobe acima das Refeições e oferece \"Registrar aplicação\"", async () => {
    const [inj7, meals] = [await card(page).boundingBox(), await page.getByTestId("meals-timeline").boundingBox()];
    if (!(inj7.y < meals.y)) throw Error(`card ${inj7.y} x refeições ${meals.y}`);
    await expect(page.getByTestId("next-dose-ring")).toHaveAttribute("aria-label", "Próxima dose estimada para hoje");
  });
  await check('(j) "Registrar aplicação" → confirmação → aviso; o card desce, o anel lê 7 e o título recebe o foco', async () => {
    await card(page).getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    const panel = sheet(page, "Confirmar aplicação");
    await expect(panel).toContainText("Dose 2,50 mg");
    await expect(panel.getByRole("button", { name: "Outra dose ou frasco novo", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    await expect(page.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirmar aplicação", exact: true })).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Registrar aplicação", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("next-dose-ring")).toHaveAttribute("aria-label", /^Próxima dose estimada em 7 dias/);
    const [injBox, meals] = [await card(page).boundingBox(), await page.getByTestId("meals-timeline").boundingBox()];
    if (!(injBox.y > meals.y)) throw Error("o card continuou promovido");
    await expect(page.getByRole("heading", { name: /^Medicação injetável: / })).toBeFocused({ timeout: 3000 });
  });
  await check("(j) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
{
  const { page, context, errors } = await open(stateWith(TIRZ, [inj("h9", 9)]));
  await card(page).scrollIntoViewIfNeeded();
  await shoot(page, "390-hoje-estimada-passou.png", card(page));
  await check("(j) passou do dia: \"estimada\", nada de \"atrasad…\" e anel no tom da medicação", async () => {
    const ring = page.getByTestId("next-dose-ring");
    await expect(ring).toHaveAttribute("aria-label", /estimada/);
    const text = await page.locator("body").innerText();
    if (/atrasad/i.test(text)) throw Error("\"atrasad…\" na tela");
    await expect(card(page)).toContainText("Se já aplicou, registre para atualizar a estimativa.");
    const strokes = await ring.evaluate((el) => [...el.querySelectorAll("path, circle")].map((n) => (n.getAttribute("stroke") ?? "").toLowerCase()));
    if (!strokes.includes(domainTone.medication.fg.toLowerCase())) throw Error(`traços ${strokes.join(" ")}`);
    const warm = [palette.rose400, palette.rose600, palette.rose700, palette.amber500, palette.amber600, palette.amber700].map((c) => c.toLowerCase());
    if (strokes.some((s) => warm.includes(s))) throw Error(`traço rosa/âmbar: ${strokes.join(" ")}`);
    const fill = await ring.evaluate((el) => getComputedStyle(el.querySelector("path")).stroke);
    if (fill !== rgbOf(domainTone.medication.fg)) throw Error(`traço calculado ${fill}`);
  });
  await check("(j) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}
for (const [label, profile, list] of [
  ["gestação", { ...TIRZ, pregnancy: "gestacao" }, [inj("g1", 7)]],
  ["amamentação", { ...TIRZ, pregnancy: "amamentacao" }, [inj("a1", 7)]],
  ["receita velha (30 dias)", TIRZ, [inj("v1", 30)]],
]) {
  const { page, context, errors } = await open(stateWith(profile, list));
  await check(`(j) ${label}: sem anel, sem ciclo e sem promoção; "Calcular dose e registrar" à vista`, async () => {
    await card(page).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("next-dose-ring")).toHaveCount(0);
    await expect(page.getByTestId("dose-cycle-strip")).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Registrar aplicação", exact: true })).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: /^Calcular dose e registrar/ })).toBeVisible();
    await expect(card(page)).toContainText("Próximo local: Coxa");
    if (errors.length) throw Error(errors.join(" | "));
  });
  if (label.startsWith("receita")) {
    await check("(j) receita velha: a calculadora abre o formulário com o aviso e a dose vazia", async () => {
      await card(page).getByRole("button", { name: /^Calcular dose e registrar/ }).click();
      await expect(injecaoReady(page)).toBeVisible();
      await expect(page.getByTestId("injection-recipe")).toHaveCount(0);
      await expect(page.getByText(STALE_RECIPE_TEXT, { exact: true })).toBeVisible();
      await expect(page.getByTestId("injection-dose")).toHaveText("—");
      await expect(radio(page, "Tirzepatida")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("injection-concentration")).toHaveText("5");
    });
  }
  await context.close();
}

// ---------- (k) Espaço: "Meu tratamento" com os degraus de dose ----------
{
  const steps = [inj("s1", 20), inj("s2", 13), inj("s3", 6, { units: 100, volumeMl: 1, doseMg: 5 })];
  const { page, context, errors } = await open(stateWith(TIRZ, steps), {
    route: "/espaco",
    ready: (p) => p.getByTestId("health-mosaic"),
  });
  // Conceito 11 (como o web): "Meu tratamento" é uma folha aberta pela linha Medicação do mosaico.
  const treatmentTitle = page.getByRole("heading", { name: "Meu tratamento", exact: true });
  const openTreatment = async () => {
    await page.getByTestId("health-mosaic").getByRole("button", { name: "Medicação", exact: true }).click();
    await expect(treatmentTitle).toBeVisible();
  };
  await check('(k) "Meu tratamento" (linha Medicação): Tirzepatida · semanal · Frasco e seringa e os degraus de dose', async () => {
    await openTreatment();
    const treatment = page.getByTestId("treatment-card");
    await treatment.scrollIntoViewIfNeeded();
    await expect(treatment).toContainText("Tirzepatida · semanal · Frasco e seringa");
    await expect(treatment).toContainText("Próxima dose estimada:");
    await expect(page.getByTestId("dose-steps")).toHaveAttribute("aria-label", /^Degraus de dose: 2,50 mg desde .+ \(2 aplicações\); 5,00 mg desde .+ \(1 aplicação\)$/);
    const small = await smallestText(page, '[data-testid="treatment-card"]');
    if (small < 12) throw Error(`texto de ${small} px`);
    await shoot(page, "390-meu-tratamento.png", treatment);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(treatmentTitle).toHaveCount(0);
  });
  await check('(k) "Anamnese completa" abre as seções: cada uma é um alvo real de 44 px que abre as respostas', async () => {
    const toggle = page.getByTestId("health-hub-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const card = (title) => page.getByRole("button", { name: new RegExp(`^${escape(title)}`) });
    for (const section of questionnaire.slice(0, -1)) {
      await expect(card(section.title)).toHaveCount(1);
      await touch44(card(section.title), section.title);
    }
    const first = questionnaire[0].title;
    await card(first).click();
    await expect(page.getByRole("heading", { name: first, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar esta seção", exact: true })).toBeVisible();
    // O fundo escurecido ("Fechar painel") fecha a folha: toque no canto de cima, fora do painel.
    await page.getByRole("button", { name: "Fechar painel", exact: true }).click({ position: { x: 12, y: 12 } });
    await expect(page.getByRole("heading", { name: first, exact: true })).toHaveCount(0);
  });
  await check('(k) "Abrir Seringa e dose" fecha a folha e leva à calculadora', async () => {
    await openTreatment();
    await page.getByTestId("treatment-card").getByRole("button", { name: "Abrir Seringa e dose", exact: true }).click();
    await expect(injecaoReady(page)).toBeVisible();
    await expect(treatmentTitle).toHaveCount(0);
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- (l) Lembretes: "Dia da aplicação (estimado)" abre Seringa e dose ----------
{
  const profile = { ...TIRZ, remindersEnabled: true, quietStart: "00:00", quietEnd: "00:00" };
  const { page, context, errors } = await open(stateWith(profile, [inj("n1", 7, { time: "00:00" })]), {
    route: "/notificacoes",
    ready: (p) => p.getByText("Dia da aplicação (estimado)", { exact: true }),
  });
  await check('(l) "Dia da aplicação (estimado)" sem nome nem dose; "Abrir registro" do item → /injecao', async () => {
    const title = page.getByText("Dia da aplicação (estimado)", { exact: true });
    const item = title.locator("xpath=ancestor::*[.//button[@aria-label='Abrir registro']][1]");
    await expect(item).toContainText("Pela frequência informada, a próxima aplicação é estimada para hoje.");
    const text = await item.innerText();
    if (/mg|Tirzepatida|Semaglutida/.test(text)) throw Error(`lembrete com medicação/dose: ${text}`);
    await item.getByRole("button", { name: "Abrir registro", exact: true }).click();
    await expect(page).toHaveURL(/\/injecao/);
    await expect(injecaoReady(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Minha dose de sempre", exact: true }).or(page.getByRole("heading", { name: "Minha última dose", exact: true }))).toBeVisible();
  });
  await check("(l) sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
