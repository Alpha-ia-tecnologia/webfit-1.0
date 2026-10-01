// Verificação da Onda 3 · Lote 1 (anamnese) no export web do app nativo, a 390 e 360 px (e 320 no
// percurso completo): "O que você já contou", "Cuidados importantes" antes das medidas, IMC neutro e
// silhueta, caneta configurada com registro confirmado, linha do dia, "Recomendado para você",
// projeção em faixa e a revelação do plano. Texto ≥ 12 px, alvos de 44 px, sem rolagem lateral.
// Só o export web do app pode ser testado aqui (o aparelho não roda no Playwright).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l1
//   node --import tsx scripts/o3l1-check.mjs dist/o3l1
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import { questionnaire } from "../../src/data/questionnaire.ts";
import { weightProjection, PROJECTION_CAPTION } from "../../src/lib/body-metrics.ts";
import { goalsFor, initialState, localDate } from "../../src/lib/domain.ts";
import { fmtNumber } from "../../src/lib/format.ts";
import { profileFixture } from "../../tests/fixtures.ts";
import { ANAMNESE_FINISH_LABEL } from "../../src/lib/copy.ts";

const target = path.resolve(process.argv[2] ?? "dist/o3l1");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o3l1-shots"));
mkdirSync(shots, { recursive: true });
const PORT = 3223;
const url = `http://127.0.0.1:${PORT}`;
const TITLES = questionnaire.map((s) => s.title);
const CONSENT = "Concordo em salvar minhas respostas e registros neste aparelho.";
const EATING_LABEL = /^Histórico de transtorno alimentar/;
const DAY_SLIDERS = [
  ["Acordar", "07:00"],
  ["Café da manhã", "08:00"],
  ["Almoço", "12:00"],
  ["Jantar", "19:00"],
  ["Dormir", "23:00"],
];
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

// ---------- Estados semeados ----------
const today = localDate();
const base = { ...profileFixture() };
const draftState = (draft, step, marker = true) => ({
  ...initialState(),
  draft: marker ? { ...draft, anamneseFlow: 2 } : draft,
  draftStep: step,
});
const PEN = {
  ...base,
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro (tirzepatida)",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
  medications: "Não uso medicamentos",
};
const PROJECTION = { ...base, goal: "perder", weight: 80, targetWeight: 75 };
const SEEDS = {
  legacy: draftState({ ...base, waist: "" }, 0, false),
  edMeasures: draftState({ ...base, eatingDisorder: "sim" }, 2),
  pen: draftState(PEN, 3),
  day: draftState(base, 5),
  // Silêncio já igual ao sono semeado: o silêncio acompanha o sono ao mudar os horários (applyAnswer).
  goals: draftState({ ...base, manualCalories: null, manualWater: null, usualWater: 1500, quietStart: "23:00", quietEnd: "07:00" }, 6),
  goalsHidden: draftState({ ...base, hideCalories: true }, 6),
  projection: draftState(PROJECTION, 6),
  projectionEd: draftState({ ...PROJECTION, eatingDisorder: "sim" }, 6),
  plan: draftState(base, 6),
  planHidden: draftState({ ...base, hideCalories: true }, 7),
  planEd: draftState({ ...base, eatingDisorder: "sim" }, 7),
};
function seedBytes(name) {
  const file = path.join(shots, `seed-${name}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(SEEDS[name]));
  db.close();
  return [...readFileSync(file)];
}

const results = [];
const check = (condition, label) => results.push(`${condition ? "PASS" : "FAIL"} ${label}`);
/** Roda uma verificação que pode lançar (espera expirada): registra FAIL com o motivo e segue. */
async function attempt(label, fn) {
  try {
    await fn();
  } catch (error) {
    check(false, `${label}: ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
const browser = await chromium.launch({ channel: "chrome" });

async function open(seed, width, expectStep) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "Personalizar alimentação", exact: true }).waitFor({ timeout: 30000 });
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
  }, seedBytes(seed));
  await page.goto(url + "/anamnese");
  await heading(page, TITLES[expectStep]).waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
  return { page, context, errors };
}

const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const center = (locator) => locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
const activeLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");
async function next(page, step) {
  await button(page, "Salvar e continuar").click();
  await heading(page, TITLES[step]).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}
async function scrollTop(page) {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("anamnese-scroll").evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(300);
  }
}
/** Menor fonte de texto visível (fora de svg), como no acab-b-check. */
function smallestText(page) {
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
async function noSideScroll(page, width, where) {
  const overflow = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="anamnese-scroll"]');
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      scroll: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
    };
  });
  check(overflow.doc <= 0 && overflow.scroll <= 1, `${width} ${where}: sem rolagem lateral (doc ${overflow.doc}, conteúdo ${overflow.scroll})`);
}
/** Caixa de toque ≥ 44 × 44 (o react-native-web ignora hitSlop). */
async function isTarget(locator) {
  const box = await locator.boundingBox();
  return !!box && Math.round(box.width) >= 44 && Math.round(box.height) >= 44;
}
async function allTargets(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) if (!(await isTarget(locator.nth(i)))) return false;
  return count > 0;
}

// ---------- (a)(b)(c)(i)(k) Percurso completo a partir de um rascunho antigo na etapa 1 ----------
async function walkthrough(width) {
  const { page, context, errors } = await open("legacy", width, 0);
  const w = `${width} percurso`;
  // (a) O que você já contou
  await attempt(`${w} (a)`, async () => {
    check(await heading(page, "O que você já contou").isVisible(), `${w} (a): "O que você já contou"`);
    const known = page.getByTestId("anamnese-known");
    const text = await known.innerText();
    check(text.includes("Manter meu peso") && text.includes("Respostas salvas neste aparelho"), `${w} (a): objetivo e consentimento no cartão`);
    check((await page.getByRole("switch", { name: CONSENT }).count()) === 0, `${w} (a): sem o interruptor de consentimento`);
    check((await page.getByLabel("Como você se chama?", { exact: true }).inputValue()) === "Pessoa Teste", `${w} (a): nome continua como caixa de texto`);
    const change = button(page, "Alterar objetivo");
    check((await change.getAttribute("aria-expanded")) === "false", `${w} (a): "Alterar objetivo" recolhido`);
    check(await isTarget(change), `${w} (j): "Alterar objetivo" com 44 px`);
    await change.click();
    await page.waitForTimeout(300);
    check((await change.getAttribute("aria-expanded")) === "true", `${w} (a): "Alterar objetivo" expandido`);
    const keep = page.getByRole("radio", { name: "Manter meu peso", exact: true });
    check((await keep.getAttribute("aria-checked")) === "true", `${w} (a): rádio "Manter meu peso" marcado`);
    check((await activeLabel(page)) === "Manter meu peso", `${w} (a): foco no objetivo marcado (${await activeLabel(page)})`);
    await change.click();
    await button(page, "Ler termos completos").first().click();
    const terms = heading(page, "Termos completos");
    await terms.waitFor({ timeout: 5000 });
    check(await terms.isVisible(), `${w} (a): "Ler termos completos" abre a folha`);
    await button(page, "Entendi").click();
    await terms.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    check((await terms.count()) === 0, `${w} (a): "Entendi" fecha a folha`);
    if (width === 390) {
      await page.waitForTimeout(800);
      await scrollTop(page);
      await page.screenshot({ path: path.join(shots, `${width}-a-known.png`) });
    }
  });
  const minFont = {};
  minFont[1] = await smallestText(page);
  // (b) Cuidados importantes
  await next(page, 1);
  await attempt(`${w} (b)`, async () => {
    for (const name of ["Gestação ou amamentação", EATING_LABEL, "Possui orientação para restringir líquidos?", "Como prefere ver números?"])
      check((await page.getByRole("radiogroup", { name }).count()) === 1, `${w} (b): grupo de rádios "${name}"`);
    check((await page.getByTestId("anamnese-field-conditions").getByRole("button", { name: "Nenhuma", exact: true }).count()) === 1, `${w} (b): condições em pílulas`);
    check((await page.getByRole("radio", { name: "Mostrar calorias", exact: true }).getAttribute("aria-checked")) === "true", `${w} (b): "Mostrar calorias" marcado`);
    await noSideScroll(page, width, "etapa 2");
    if (width === 390) {
      await scrollTop(page);
      await page.screenshot({ path: path.join(shots, `${width}-b-care.png`) });
    }
  });
  minFont[2] = await smallestText(page);
  // (c) Medidas
  await next(page, 2);
  await attempt(`${w} (c)`, async () => {
    const bmi = page.getByRole("img", { name: /^IMC estimado 26,4/ });
    await center(bmi);
    check(await bmi.isVisible(), `${w} (c): IMC neutro com nome acessível`);
    check((await page.getByTestId("measure-figure").count()) === 1, `${w} (c): silhueta com as medidas`);
    check((await page.getByText("referência de 18,5 a 24,9").count()) === 0, `${w} (c): sem o IMC antigo na régua`);
    const waist = await page.getByTestId("anamnese-field-waist").boundingBox();
    check(waist && waist.height <= 64, `${w} (c): cintura recolhida continua ≤ 64 px (${Math.round(waist?.height ?? 0)})`);
    await noSideScroll(page, width, "etapa 3");
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-c-bmi.png`) });
    await center(page.getByTestId("measure-figure"));
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-c-figure.png`) });
  });
  minFont[3] = await smallestText(page);
  // Etapas 4 a 8: rolagem lateral e texto mínimo.
  for (let step = 3; step <= 7; step++) {
    await next(page, step);
    await scrollTop(page);
    minFont[step + 1] = await smallestText(page);
    if ([3, 5, 6, 7].includes(step)) await noSideScroll(page, width, `etapa ${step + 1}`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-walk-step${step + 1}.png`) });
  }
  const smallest = Math.min(...Object.values(minFont));
  check(smallest >= 12, `${w} (i): nenhum texto < 12 px nas etapas 1–8 (${smallest})`);
  check(errors.length === 0, `${w} (k): sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

// ---------- (c) Perfil sensível: sem IMC nem silhueta ----------
async function sensitiveMeasures(width) {
  const { page, context, errors } = await open("edMeasures", width, 2);
  check((await page.getByTestId("anamnese-bmi").count()) === 0, `${width} (c) sensível: sem IMC`);
  check((await page.getByTestId("measure-figure").count()) === 0, `${width} (c) sensível: sem silhueta`);
  check(errors.length === 0, `${width} (c) sensível: sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

// ---------- (d) Caneta ----------
async function penFlow(width) {
  const { page, context, errors } = await open("pen", width, 3);
  const w = `${width} caneta`;
  await attempt(`${w} (d)`, async () => {
    // Conceito 07: caneta, dose e frequência moram em "Caneta e dose", recolhido quando já respondido.
    const penHead = page.getByTestId("pen-details").getByRole("button").first();
    await center(penHead);
    check((await penHead.getAttribute("aria-expanded")) === "false", `${w} (d): "Caneta e dose" recolhido com as respostas completas`);
    check((await page.getByTestId("pen-details").innerText()).includes("Mounjaro · 5 mg · semanal"), `${w} (d): resumo "Mounjaro · 5 mg · semanal"`);
    await penHead.click();
    const frequency = page.getByRole("radiogroup", { name: "Com que frequência?" });
    await center(frequency);
    check((await frequency.getByRole("radio", { name: "Semanal", exact: true }).getAttribute("aria-checked")) === "true", `${w} (d): "Semanal" marcado`);
    check(await allTargets(frequency.getByRole("radio")), `${w} (j): rádios de frequência com 44 px`);
    const weekdays = page.getByRole("radiogroup", { name: "Dia da aplicação" }).getByRole("radio");
    check((await weekdays.count()) === 8, `${w} (d): 7 dias e "Varia" (${await weekdays.count()})`);
    check(await allTargets(weekdays), `${w} (j): rádios dos dias com 44 × 44`);
    await page.getByRole("radio", { name: "Quinta-feira", exact: true }).click();
    check((await page.getByRole("radio", { name: "Quinta-feira", exact: true }).getAttribute("aria-checked")) === "true", `${w} (d): "Quinta-feira" marcada`);
    // Frequência: diária esconde o dia; "Outra" mostra o seletor de aplicações por mês.
    await frequency.getByRole("radio", { name: "Diária", exact: true }).click();
    await page.waitForTimeout(200);
    check((await page.getByRole("radiogroup", { name: "Dia da aplicação" }).count()) === 0, `${w} (d): "Diária" esconde o dia`);
    await frequency.getByRole("radio", { name: "Outra", exact: true }).click();
    check((await page.getByRole("slider", { name: "Aplicações por mês" }).count()) === 1, `${w} (d): "Outra" mostra "Aplicações por mês"`);
    await frequency.getByRole("radio", { name: "Semanal", exact: true }).click();
    await page.waitForTimeout(200);
    // Aviso de coerência com "Não uso medicamentos".
    const conflict = page.getByText(/^Você marcou “Não uso medicamentos”/);
    await center(conflict);
    check(await conflict.isVisible(), `${w} (d): aviso "Não uso medicamentos" com caneta`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-d-conflict.png`) });
    await button(page, "Incluir nos medicamentos").click();
    await conflict.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    check((await conflict.count()) === 0, `${w} (d): "Incluir nos medicamentos" resolve o aviso`);
    // Registro da última aplicação, só com confirmação.
    const disclosure = button(page, "Registrar a última aplicação");
    await center(disclosure);
    check((await disclosure.getAttribute("aria-expanded")) === "false", `${w} (d): registro recolhido`);
    await disclosure.click();
    check((await disclosure.getAttribute("aria-expanded")) === "true", `${w} (d): registro expandido`);
    await page.getByRole("radiogroup", { name: "Quando foi?" }).getByRole("radio", { name: "Hoje", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Local" }).getByRole("radio", { name: "Abdômen", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Tipo de caneta" }).getByRole("radio", { name: "Caneta com seletor", exact: true }).click();
    const preview = page.getByTestId("pen-last-preview");
    const text = await preview.innerText();
    check(/^Vamos registrar: Tirzepatida 5,00 mg · Caneta · Abdômen · hoje, \d{2}:\d{2}$/.test(text), `${w} (d): pré-visualização ("${text}")`);
    check((await page.getByRole("radio", { name: "Quinta-feira", exact: true }).getAttribute("aria-checked")) === "true", `${w} (d): a data não troca o dia escolhido`);
    await button(page, "Confirmar para registrar").click();
    const confirmed = page.getByText("Será registrada no diário ao concluir a anamnese.", { exact: true });
    await confirmed.waitFor({ timeout: 5000 });
    check(await confirmed.isVisible(), `${w} (d): confirmação explícita`);
    await page.waitForTimeout(200);
    check((await activeLabel(page)).includes("Não registrar"), `${w} (d): foco vai para "Não registrar" (${await activeLabel(page)})`);
    check((await page.locator("main, body").first().innerText()).match(/aumente|reduza|próxima dose/i) === null, `${w} (d): nenhuma sugestão de dose`);
    await noSideScroll(page, width, "etapa 4");
    if (width === 390) {
      await center(preview);
      await page.screenshot({ path: path.join(shots, `${width}-d-pen.png`) });
    }
    // Até a revisão e conclusão: o registro entra no diário.
    for (const step of [4, 5, 6, 7]) await next(page, step);
    const skip = button(page, "Pular e ver o plano");
    if (await skip.count()) await skip.click();
    const pending = page.getByText(/^Ao concluir, registramos no diário: Tirzepatida 5,00 mg/);
    await pending.waitFor({ timeout: 8000 });
    check(await pending.isVisible(), `${w} (d): revisão avisa o registro`);
    await button(page, ANAMNESE_FINISH_LABEL).click();
    const toast = page.getByText("Anamnese salva. Aplicação registrada no diário.", { exact: true });
    await toast.waitFor({ timeout: 10000 });
    check(await toast.isVisible(), `${w} (d): aviso "Aplicação registrada no diário"`);
    await page.waitForTimeout(1200);
    await page.goto(url + "/diario");
    const title = page.getByText("Tirzepatida 5,00 mg", { exact: true }).first();
    await title.waitFor({ timeout: 20000 });
    check(await title.isVisible(), `${w} (d): diário mostra "Tirzepatida 5,00 mg"`);
    check((await page.getByText("Caneta · Abdômen", { exact: true }).count()) >= 1, `${w} (d): diário mostra "Caneta · Abdômen"`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-d-diario.png`) });
  });
  check(errors.length === 0, `${w}: sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

// ---------- (e) Linha do dia ----------
async function dayFlow(width) {
  const { page, context, errors } = await open("day", width, 5);
  const w = `${width} linha do dia`;
  await attempt(`${w} (e)`, async () => {
    const timeline = page.getByTestId("day-timeline");
    await center(timeline);
    for (const [name, time] of DAY_SLIDERS) {
      const slider = page.getByRole("slider", { name, exact: true });
      check((await slider.getAttribute("aria-valuetext")) === time, `${w} (e): "${name}" em ${time}`);
    }
    check(await allTargets(page.getByRole("slider", { name: /^(Acordar|Café da manhã|Almoço|Jantar|Dormir)$/ })), `${w} (j): pontos com 44 px`);
    check(await allTargets(page.getByRole("button", { name: /, (alterar|escolher) horário$/ })), `${w} (j): legenda com 44 px`);
    const summary = page.getByTestId("sleep-summary");
    check((await summary.innerText()) === "Sono: 8 h (23:00 às 07:00)", `${w} (e): resumo do sono`);
    const chip = page.getByTestId("sleep-coherence");
    check((await chip.innerText()).includes("Você informou 7 h de sono; pelos horários são 8 h."), `${w} (e): aviso de sono informado × horários`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-e-timeline.png`) });
    await button(page, "Usar 8 h").click();
    await chip.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    check((await chip.count()) === 0, `${w} (e): "Usar 8 h" resolve o aviso`);
    await button(page, "Dormir 23:00, alterar horário").click();
    const sheet = heading(page, "Dormir");
    await sheet.waitFor({ timeout: 5000 });
    await button(page, "00:00").click();
    await button(page, "Concluir").click();
    await sheet.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    check((await summary.innerText()) === "Sono: 7 h (00:00 às 07:00)", `${w} (e): folha de horário muda o sono ("${await summary.innerText()}")`);
    // Teclado no export web: seta para a direita = +15 min.
    const wake = page.getByRole("slider", { name: "Acordar", exact: true });
    await wake.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    let value = await wake.getAttribute("aria-valuetext");
    if (value !== "07:15") {
      // Sem onKeyDown repassado: arrasta o ponto com o mouse (registrado como alternativa).
      const box = await wake.boundingBox();
      const track = await page.getByTestId("day-timeline").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + ((track.width - 44) * 15) / 1200, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      value = await wake.getAttribute("aria-valuetext");
      check(value === "07:15", `${w} (e): arrasto (alternativa ao teclado) leva a 07:15 (${value})`);
    } else check(true, `${w} (e): seta para a direita leva "Acordar" a 07:15`);
    const quality = page.getByRole("radiogroup", { name: "Qualidade do sono" });
    for (const name of ["Boa", "Regular", "Ruim", "Prefiro não informar"])
      check((await quality.getByRole("radio", { name, exact: true }).count()) === 1, `${w} (e): qualidade do sono "${name}"`);
    const light = page.getByRole("radio", { name: /^Leve — exercícios/ });
    await center(light);
    check((await light.innerText()).includes("Sugerido"), `${w} (e): "Leve" sugerido pelos dias de treino`);
    await noSideScroll(page, width, "etapa 6");
    if (width === 390) {
      await center(quality);
      await page.screenshot({ path: path.join(shots, `${width}-e-faces.png`) });
    }
  });
  check(errors.length === 0, `${w}: sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

// ---------- (f) Metas ----------
async function goalsFlow(width) {
  const { page, context, errors } = await open("goals", width, 6);
  const w = `${width} metas`;
  await attempt(`${w} (f)`, async () => {
    const card = page.getByTestId("goals-recommended");
    await center(card);
    const expected = fmtNumber(goalsFor({ ...base, manualCalories: null, manualWater: null }).calories);
    const text = await card.innerText();
    check(text.includes(expected) && text.includes("Pela sua anamnese"), `${w} (f): recomendação ${expected} kcal pela anamnese`);
    const personalize = button(page, "Personalizar");
    check((await personalize.getAttribute("aria-expanded")) === "false", `${w} (f): "Personalizar" recolhido`);
    check(await isTarget(personalize), `${w} (j): "Personalizar" com 44 px`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-f-card.png`) });
    await personalize.click();
    await page.waitForTimeout(300);
    check((await personalize.getAttribute("aria-expanded")) === "true", `${w} (f): "Personalizar" expandido`);
    check((await activeLabel(page)) === "Meta calórica informada (kcal/dia)", `${w} (f): foco na meta calórica (${await activeLabel(page)})`);
    const splits = page.getByRole("slider", { name: /^Divisão entre/ });
    check((await splits.count()) === 2, `${w} (f): duas alças da divisão`);
    check(await allTargets(splits), `${w} (j): alças da divisão com 44 px`);
    const first = splits.first();
    const before = await first.getAttribute("aria-valuetext");
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const after = await first.getAttribute("aria-valuetext");
    check(before !== after && /%/.test(after ?? ""), `${w} (f): seta muda a divisão ("${before}" → "${after}")`);
    check((await card.innerText()).includes("Definida por você"), `${w} (f): origem "Definida por você"`);
    const back = button(page, "Voltar ao recomendado");
    await center(back);
    await back.click();
    await page.waitForTimeout(300);
    check((await card.innerText()).includes("Pela sua anamnese"), `${w} (f): "Voltar ao recomendado" limpa as metas`);
    // Água em copos.
    const water = page.getByTestId("water-glasses");
    await center(water);
    await button(page, "Usar 6 copos (1,5 L)").click();
    await page.waitForTimeout(200);
    check((await water.innerText()).includes("6 copos · 1,5 L"), `${w} (f): sugestão vira 6 copos`);
    await button(page, "Menos um copo").click();
    await page.waitForTimeout(200);
    check((await water.innerText()).includes("5 copos · 1,25 L"), `${w} (f): "Menos um copo" → 5 copos`);
    check(await allTargets(page.getByRole("button", { name: /^(Menos|Mais) um copo$/ })), `${w} (j): botões dos copos com 44 px`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-f-water.png`) });
    // Silêncio dos lembretes só com lembretes ligados.
    check((await page.getByText(/^Silêncio dos lembretes/).count()) === 0, `${w} (f): sem silêncio com lembretes desligados`);
    const reminders = page.getByRole("switch", { name: "Ativar lembretes dentro da plataforma" });
    await center(reminders);
    await reminders.click();
    const quiet = page.getByText("Silêncio dos lembretes: das 23:00 às 07:00, igual ao seu sono", { exact: true });
    await quiet.waitFor({ timeout: 5000 });
    check(await quiet.isVisible(), `${w} (f): silêncio igual ao sono`);
    await noSideScroll(page, width, "etapa 7");
  });
  check(errors.length === 0, `${w}: sem erros de página ${errors.join(" | ")}`);
  await context.close();
  // Calorias ocultas: sem régua de kcal e divisão em gramas.
  const hidden = await open("goalsHidden", width, 6);
  await attempt(`${w} ocultas`, async () => {
    const card = hidden.page.getByTestId("goals-recommended");
    await center(card);
    await button(hidden.page, "Personalizar").click();
    await hidden.page.waitForTimeout(300);
    check((await hidden.page.getByRole("slider", { name: "Meta calórica informada (kcal/dia)" }).count()) === 0, `${w} ocultas: sem régua de calorias`);
    check(!/kcal/i.test(await card.innerText()), `${w} ocultas: cartão sem kcal`);
    const text = await hidden.page.getByRole("slider", { name: /^Divisão entre proteína/ }).getAttribute("aria-valuetext");
    check(/ g/.test(text ?? "") && !/%/.test(text ?? ""), `${w} ocultas: divisão falada em gramas ("${text}")`);
  });
  check(hidden.errors.length === 0, `${w} ocultas: sem erros de página ${hidden.errors.join(" | ")}`);
  await hidden.context.close();
}

// ---------- (g) Projeção ----------
async function projectionFlow(width) {
  const expected = weightProjection({ current: 80, target: 75, height: 165, goal: "perder", today });
  const { page, context, errors } = await open("projection", width, 6);
  await attempt(`${width} (g)`, async () => {
    const box = page.getByTestId("weight-projection");
    await center(box);
    const text = await box.innerText();
    check(text.includes(expected.title) && text.includes(PROJECTION_CAPTION), `${width} (g): faixa "${expected.title}"`);
    check(!/\b\d{1,2}\/\d{1,2}\b/.test(text), `${width} (g): nunca uma data exata`);
    if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-g-projection.png`) });
  });
  check(errors.length === 0, `${width} (g): sem erros de página ${errors.join(" | ")}`);
  await context.close();
  const ed = await open("projectionEd", width, 6);
  check((await ed.page.getByTestId("weight-projection").count()) === 0, `${width} (g) sensível: sem projeção`);
  check((await ed.page.getByRole("slider", { name: "Peso desejado (kg)" }).count()) === 0, `${width} (g) sensível: sem peso desejado`);
  await ed.context.close();
}

// ---------- (h) Plano ----------
async function planFlow(width) {
  const { page, context, errors } = await open("plan", width, 6);
  await attempt(`${width} (h)`, async () => {
    await next(page, 7);
    const loader = page.getByTestId("plan-loader");
    check(await loader.isVisible(), `${width} (h): montagem do plano aparece`);
    check(await loader.getByText("Montando seu plano inicial…", { exact: true }).isVisible(), `${width} (h): "Montando seu plano inicial…"`);
    check(await button(page, ANAMNESE_FINISH_LABEL).isEnabled(), `${width} (h): concluir nunca bloqueado pela montagem`);
    if (width === 390) {
      await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(shots, `${width}-h-loader.png`) });
    }
    await button(page, "Pular e ver o plano").click();
    await loader.waitFor({ state: "detached", timeout: 5000 });
    // Conceito 08 (como o web): "Seu plano inicial, Nome"; a cascata mostra gasto e meta (o repouso fica em "Como calculamos").
    check(await page.getByRole("heading", { name: /^Seu plano inicial, / }).isVisible(), `${width} (h): "Seu plano inicial, Nome"`);
    check(await page.getByRole("img", { name: "Meta de 1.800 kcal por dia", exact: true }).isVisible(), `${width} (h): anel "Meta de 1.800 kcal por dia"`);
    check((await page.getByTestId("plan-cascade").getByRole("listitem").count()) === 2, `${width} (h): gasto estimado e sua meta`);
    check(await page.getByRole("img", { name: /^Meta de água: 8 copos/ }).isVisible(), `${width} (h): água em copos`);
    check(await page.getByTestId("plan-day").isVisible(), `${width} (h): linha do dia`);
    await noSideScroll(page, width, "etapa 8");
    if (width === 390) {
      await scrollTop(page);
      await page.screenshot({ path: path.join(shots, `${width}-h-plan.png`) });
    }
  });
  check(errors.length === 0, `${width} (h): sem erros de página ${errors.join(" | ")}`);
  await context.close();
  const hidden = await open("planHidden", width, 7);
  await attempt(`${width} (h) ocultas`, async () => {
    check(await hidden.page.getByTestId("plan-plate").isVisible(), `${width} (h) ocultas: prato de referência`);
    check(!/kcal/i.test(await hidden.page.getByTestId("plan-reveal").innerText()), `${width} (h) ocultas: plano sem kcal`);
    if (width === 390) await hidden.page.screenshot({ path: path.join(shots, `${width}-h-plate.png`) });
  });
  await hidden.context.close();
  const ed = await open("planEd", width, 7);
  await attempt(`${width} (h) sensível`, async () => {
    check(await ed.page.getByRole("heading", { name: /^Seu plano de hábitos, / }).isVisible(), `${width} (h) sensível: "Seu plano de hábitos, Nome"`);
    check(!/kcal/i.test(await ed.page.getByTestId("plan-reveal").innerText()), `${width} (h) sensível: sem kcal`);
    check((await ed.page.getByTestId("plan-ring").count()) === 0, `${width} (h) sensível: sem anel`);
    if (width === 390) await ed.page.screenshot({ path: path.join(shots, `${width}-h-habits.png`) });
  });
  await ed.context.close();
}

try {
  for (const width of [390, 360]) {
    await walkthrough(width);
    await sensitiveMeasures(width);
    await penFlow(width);
    await dayFlow(width);
    await goalsFlow(width);
    await projectionFlow(width);
    await planFlow(width);
  }
  await walkthrough(320);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`${results.length - failed} de ${results.length} verificações passaram`);
if (failed) process.exitCode = 1;
