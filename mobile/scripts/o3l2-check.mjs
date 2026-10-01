// Verificação da Onda 3 · Lote 2 ("Meu espaço") no export web do app nativo, a 390 e 360 px: hub
// "Seu perfil de saúde" com o editor de uma seção (descartar, perfil calmo), "Precisa de atenção",
// cartão "Corpo", exames com resultados estruturados e alerta urgente (agente simulado), consultas
// como agenda com "Lembrar-me" (.ics), preferências em lista com folhas e "Avançado: servidor do
// agente", e o início visual do primeiro acesso. Alvos de 44 px, sem rolagem lateral, sem rosa em
// valores de exame ou corpo, sem erros de página. Só o export web do app pode ser testado aqui.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l2
//   node --import tsx scripts/o3l2-check.mjs dist/o3l2 [pasta-das-fotos]
import { deepStrictEqual } from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { HABIT_SUGGESTIONS } from "../../src/data/habit-suggestions.ts";
import { questionnaire } from "../../src/data/questionnaire.ts";
import { domainTone, palette } from "../../src/design/tokens.ts";
import { appointmentWhen } from "../../src/lib/appointments.ts";
import { goalsFor, initialState, localDate, shiftDate, uid, updateProfile } from "../../src/lib/domain.ts";
import { fmtNumber } from "../../src/lib/format.ts";
import { sectionIndexOf } from "../../src/lib/profile-summary.ts";
import { bodySummary, fmtInterval } from "../../src/lib/space.ts";
import { startWithHabits } from "../../src/lib/starter.ts";
import { appointmentSchema, profileSchema } from "../../src/types.ts";
import { profileFixture } from "../../tests/fixtures.ts";
import { EXAM_REPLY, EXAM_RESULT, EXAM_URGENT_REPLY } from "../../tests/structured-fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o3l2");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o3l2-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o3l2-seed-"));
const PORT = 3224;
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
const TITLES = questionnaire.slice(0, -1).map((s) => s.title);
const CORS = { "access-control-allow-origin": "*" };
const READY_STATUS = { ready: true, token: "test-token", providers: { deepseek: true, openai: true } };
/** PNG de 1 × 1 px e um PDF mínimo para os laudos. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

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
/**
 * Abre o app com o estado gravado no SQLite do navegador e vai para a rota pedida. /api/status
 * responde "pronto" (DeepSeek e OpenAI) ou falha; /api/agent responde com `agent(body)` ou falha.
 */
async function open(state, { width = 390, route = "/espaco", ready, status = "ready", agent = null } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const agentCalls = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  // A última rota registrada vence: tudo recusado, menos o que cada cenário simula.
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  if (status === "ready") await page.route("**/api/status", (r) => r.fulfill({ json: READY_STATUS, headers: CORS }));
  await page.route("**/api/agent", (r) => {
    const body = r.request().postDataJSON();
    agentCalls.push(body);
    return agent ? r.fulfill({ json: agent(body), headers: CORS }) : r.abort("connectionrefused");
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
  return { page, context, errors, agentCalls };
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

async function shoot(page, file, locator) {
  await page.waitForTimeout(300);
  if (locator) await locator.screenshot({ path: path.join(shots, file) });
  else await page.screenshot({ path: path.join(shots, file) });
}
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/** Rosa e o tom de perigo: nunca em valor de exame, corpo ou meta. */
const ROSE = [
  ...Object.entries(palette)
    .filter(([key, value]) => key.startsWith("rose") && /^#[0-9a-f]{6}$/i.test(value))
    .map(([, value]) => rgb(value)),
  ...Object.values(domainTone.danger).filter((value) => /^#[0-9a-f]{6}$/i.test(value)).map(rgb),
];
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const hub = (page) => page.getByTestId("profile-hub");
const hubCard = (page, title) => hub(page).getByRole("button", { name: new RegExp(`^${esc(title)}\\.`) });
const toastWith = (page, message) => page.getByText(message, { exact: true }).locator("xpath=..");
/** Conceito 11: as etapas ficam na linha "Anamnese completa" do mosaico "Perfil de saúde" (recolhida ao abrir). */
const hubReady = (page) => page.getByTestId("health-hub-toggle");
async function openHub(page) {
  const toggle = hubReady(page);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(hub(page)).toBeVisible();
}
const noErrors = (errors) => {
  if (errors.length) throw Error(errors.join(" | "));
};
async function touch44(locator, name) {
  const box = await locator.boundingBox();
  if (!box) throw Error(`${name}: sem caixa`);
  if (box.width < 44 - 0.5 || box.height < 44 - 0.5) throw Error(`${name}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
}
/** Sem rolagem lateral no documento nem nas rolagens verticais (conteúdo mais largo que a tela). */
async function noSideScroll(page, where) {
  const over = await page.evaluate(() => {
    let worst = 0;
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX)) continue;
      worst = Math.max(worst, el.scrollWidth - el.clientWidth);
    }
    return { doc: document.documentElement.scrollWidth - window.innerWidth, worst };
  });
  if (over.doc > 0 || over.worst > 1) throw Error(`${where}: rolagem lateral (documento ${over.doc}, conteúdo ${over.worst})`);
}
async function noRose(locator, where) {
  const hits = await locator.evaluate((root, rose) => {
    const found = [];
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const s = getComputedStyle(el);
      for (const color of [s.color, s.backgroundColor, s.fill, s.stroke]) if (rose.includes(color)) found.push(`${el.tagName.toLowerCase()} ${color}`);
    }
    return found.slice(0, 5);
  }, ROSE);
  if (hits.length) throw Error(`${where}: tom rosa/perigo em ${hits.join(", ")}`);
}
/** Estado com perfil salvo (medição e meta do dia gravadas como na anamnese). */
const stateWith = (change = {}) => updateProfile(initialState(), profileSchema.parse({ ...profileFixture(), ...change }));
/** Metas automáticas (sem calorias manuais): a prévia da meta aparece ao editar o objetivo. */
const AUTO = { manualCalories: null };

// ---------- (1) Hub "Seu perfil de saúde" e editor de uma seção ----------
for (const width of [390, 360]) {
  const before = profileSchema.parse({ ...profileFixture(), ...AUTO });
  const after = { ...before, goal: "perder" };
  const preview = `Sua meta passa de ${fmtNumber(goalsFor(before, today).calories)} para ${fmtNumber(goalsFor(after, today).calories)} kcal por dia.`;
  const { page, context, errors } = await open(stateWith(AUTO), { width, ready: hubReady });
  await openHub(page);
  await check(`${width} (1) hub: 7 cartões "^{título}" (sem a revisão), cada um alvo de 44 px com aria-haspopup`, async () => {
    if (TITLES.length !== 7) throw Error(`${TITLES.length} seções`);
    await expect(hub(page).getByRole("listitem")).toHaveCount(7);
    for (const title of TITLES) {
      const card = hubCard(page, title);
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("aria-haspopup", "dialog");
      await touch44(card, title);
    }
    await expect(hubCard(page, questionnaire.at(-1).title)).toHaveCount(0);
  });
  await check(`${width} (1) "Vamos conhecer você" traz "Manter o peso"; a folha mostra "Objetivo principal" / "Manter meu peso"`, async () => {
    await expect(hubCard(page, TITLES[0])).toHaveAttribute("aria-label", /Manter o peso/);
    await hubCard(page, TITLES[0]).click();
    await expect(heading(page, TITLES[0])).toBeVisible();
    await expect(page.getByText("Objetivo principal", { exact: true })).toBeVisible();
    await expect(page.getByText("Manter meu peso", { exact: true })).toBeVisible();
    await expect(page.getByText("15/06/1992", { exact: true })).toBeVisible();
    await touch44(button(page, "Editar esta seção"), "Editar esta seção");
    if (width === 390) await shoot(page, "390-secao-folha.png");
    // O fundo escurecido fecha a folha (canto de cima, fora do painel).
    await page.getByRole("button", { name: "Fechar painel", exact: true }).click({ position: { x: 12, y: 12 } });
    await expect(heading(page, TITLES[0])).toHaveCount(0);
  });
  await check(`${width} (1) hub e Corpo: sem rolagem lateral`, () => noSideScroll(page, "Meu espaço"));
  if (width === 390) await shoot(page, "390-hub.png", hub(page));
  await check(`${width} (1) "Editar esta seção" abre só a seção: "Editar seção", sem barra de etapas nem "Salvar e continuar"`, async () => {
    await hubCard(page, TITLES[0]).click();
    await button(page, "Editar esta seção").click();
    await expect(page).toHaveURL(/\/anamnese\?secao=0$/);
    await expect(heading(page, TITLES[0])).toBeVisible();
    await expect(page.getByTestId("anamnese-bar-text")).toHaveText("Editar seção");
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(button(page, "Salvar e continuar")).toHaveCount(0);
    await expect(button(page, "Salvar alterações")).toBeVisible();
    await expect(button(page, "Voltar para Meu espaço")).toBeVisible();
    await touch44(button(page, "Cancelar"), "Cancelar");
    await touch44(button(page, "Salvar alterações"), "Salvar alterações");
    await noSideScroll(page, "editor de seção");
  });
  await check(`${width} (1) escolher "Reduzir meu peso" mostra a prévia exata da meta`, async () => {
    await page.getByRole("radio", { name: /^Reduzir meu peso com acompanhamento/ }).click();
    await expect(page.getByTestId("goal-preview")).toHaveText(preview);
    if (width === 390) await shoot(page, "390-editor-secao.png");
  });
  await check(`${width} (1) "Salvar alterações" volta ao Meu espaço com o aviso e o cartão "Reduzir o peso"`, async () => {
    await button(page, "Salvar alterações").click();
    await expect(page.getByText(`Alterações salvas: ${TITLES[0]}.`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/espaco/);
    await openHub(page);
    await expect(hubCard(page, TITLES[0])).toHaveAttribute("aria-label", /Reduzir o peso/);
  });
  await check(`${width} (1) sem erros de página nem de console`, () => noErrors(errors));
  await check(`${width} (1) estado: objetivo "perder", meta do dia com "perder" e sem rascunho`, async () => {
    const saved = await readState(page, `hub-${width}`);
    if (saved.profile.goal !== "perder") throw Error(`objetivo ${saved.profile.goal}`);
    const snapshot = saved.goalHistory.find((h) => h.date === today);
    if (snapshot?.profile.goal !== "perder") throw Error("meta do dia sem o objetivo novo");
    if (saved.draft !== null) throw Error("rascunho criado pelo editor de seção");
  });
  await context.close();
}

// ---------- (2) Descartar alterações e perfil sensível ----------
{
  const sleep = sectionIndexOf("sleepQuality");
  const { page, context, errors } = await open(stateWith({ ...AUTO, eatingDisorder: "sim" }), { ready: hubReady });
  await openHub(page);
  await check('(2) sensível: "Objetivo definido" e nenhum cartão fala de peso, kg ou IMC', async () => {
    await expect(hubCard(page, TITLES[0])).toHaveAttribute("aria-label", /Objetivo definido/);
    const labels = await hub(page).getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent));
    const bad = labels.filter((label) => /\bpeso\b|\bkg\b|IMC/i.test(label ?? ""));
    if (bad.length) throw Error(bad.join(" | "));
    const text = await hub(page).innerText();
    if (/\bpeso\b|\bkg\b|IMC/i.test(text)) throw Error(`hub: ${text.slice(0, 120)}`);
  });
  await check(`(2) "Sono, movimento e bem-estar" abre /anamnese?secao=${sleep}`, async () => {
    if (sleep !== 5) throw Error(`seção do sono = ${sleep}`);
    await hubCard(page, "Sono, movimento e bem-estar").click();
    await button(page, "Editar esta seção").click();
    await expect(page).toHaveURL(/\/anamnese\?secao=5$/);
    await expect(heading(page, "Sono, movimento e bem-estar")).toBeVisible();
  });
  await check('(2) mudar o sono e "Voltar": "Descartar alterações?"; recusar fica, aceitar volta sem gravar', async () => {
    await page.getByRole("radiogroup", { name: "Qualidade do sono" }).getByRole("radio", { name: /^Ruim/ }).click();
    const messages = [];
    page.once("dialog", (dialog) => {
      messages.push(dialog.message());
      void dialog.dismiss();
    });
    await button(page, "Voltar para Meu espaço").click();
    await expect.poll(() => messages.length).toBe(1);
    if (!messages[0].startsWith("Descartar alterações?")) throw Error(messages[0]);
    await expect(heading(page, "Sono, movimento e bem-estar")).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await button(page, "Cancelar").click();
    await openHub(page);
  });
  await check('(2) sensível: editar o objetivo não mostra "Sua meta passa de"', async () => {
    await hubCard(page, TITLES[0]).click();
    await button(page, "Editar esta seção").click();
    await page.getByRole("radio", { name: /^Reduzir meu peso com acompanhamento/ }).click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("goal-preview")).toHaveCount(0);
    await expect(page.getByText(/Sua meta/)).toHaveCount(0);
    page.once("dialog", (dialog) => void dialog.accept());
    await button(page, "Cancelar").click();
    await openHub(page);
  });
  await check("(2) sem erros de página nem de console", () => noErrors(errors));
  await check("(2) estado: sono e objetivo sem mudança depois de descartar", async () => {
    const saved = await readState(page, "discard");
    if (saved.profile.sleepQuality !== "boa") throw Error(`sono ${saved.profile.sleepQuality}`);
    if (saved.profile.goal !== "manter") throw Error(`objetivo ${saved.profile.goal}`);
  });
  await context.close();
}

// ---------- (3) "Precisa de atenção" ----------
{
  const old = { allergies: "nao_sei", allergyDetails: "", fluidRestriction: "nao_sei", measurementDate: shiftDate(today, -90) };
  const { page, context, errors } = await open(stateWith(old), { ready: hubReady });
  await openHub(page);
  const attention = page.getByTestId("profile-attention");
  await check('(3) atenção: alergias, líquidos e "Última medição", em tom âmbar (nunca rosa)', async () => {
    await expect(attention).toContainText("Alergias estão como “não sei”.");
    await expect(attention).toContainText("Restrição de líquidos está como “não sei”.");
    await expect(attention).toContainText("Última medição");
    const bg = await attention.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== rgb(domainTone.attention.bg)) throw Error(`fundo ${bg}`);
    await noRose(attention, "atenção");
    for (const name of ["Revisar alergias", "Revisar restrição de líquidos", "Registrar medidas na Evolução"])
      await touch44(attention.getByRole("button", { name, exact: true }), name);
  });
  await shoot(page, "390-atencao.png", attention);
  await check('(3) "Revisar alergias" abre o editor de "Sua alimentação"; voltar sem mudanças não pergunta', async () => {
    const dialogs = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await attention.getByRole("button", { name: "Revisar alergias", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/anamnese\\?secao=${sectionIndexOf("allergies")}$`));
    await expect(heading(page, "Sua alimentação")).toBeVisible();
    await button(page, "Voltar para Meu espaço").click();
    await openHub(page);
    if (dialogs.length) throw Error(`diálogo inesperado: ${dialogs[0]}`);
  });
  await check('(3) "Registrar medidas na Evolução" do hub abre Evolução', async () => {
    await attention.getByRole("button", { name: "Registrar medidas na Evolução", exact: true }).click();
    await expect(page).toHaveURL(/\/evolucao/);
  });
  await check("(3) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}
{
  const { page, context } = await open(stateWith({ allergies: "nao_sei", allergyDetails: "", eatingDisorder: "sim", measurementDate: shiftDate(today, -90) }), { ready: hubReady });
  await openHub(page);
  await check('(3) sensível: sem "Última medição" nem "Registrar medidas" na atenção', async () => {
    const attention = page.getByTestId("profile-attention");
    await expect(attention).toContainText("Alergias estão como “não sei”.");
    await expect(attention).not.toContainText("Última medição");
    await expect(attention.getByRole("button", { name: "Registrar medidas na Evolução", exact: true })).toHaveCount(0);
  });
  await context.close();
}

// ---------- (4) Corpo ----------
/** Oito pesagens semanais de 76,4 a 72,4 kg, a última hoje. */
function withJourney(change = {}) {
  const state = stateWith({ weight: 72.4, ...change });
  state.measurements = Array.from({ length: 8 }, (_, i) => ({
    ...state.measurements[0],
    id: uid(),
    date: shiftDate(today, -7 * (7 - i)),
    weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
  }));
  return state;
}
for (const width of [390, 360]) {
  const state = withJourney();
  const s = bodySummary(state, today);
  const { page, context, errors } = await open(state, { width, ready: (p) => p.getByTestId("body-card") });
  const card = page.getByTestId("body-card");
  await check(`${width} (4) Corpo: peso "${s.weight} kg", chip "${s.trend?.chip}" (o "desde" na fala), mini tendência e IMC ${s.bmi?.value}`, async () => {
    if (!s.trend || !s.bmi) throw Error("resumo sem tendência ou IMC");
    await expect(page.getByTestId("body-weight")).toHaveText(`${s.weight} kg`);
    // Chip neutro do conceito 11 (como o web); o "desde" segue no texto para leitor de tela.
    await expect(page.getByTestId("body-trend")).toHaveText(s.trend.chip);
    await expect(page.getByTestId("body-sparkline")).toBeVisible();
    // Rótulo e número em linhas próprias no bloco do IMC (conceito 11): o texto junta sem espaço.
    await expect(page.getByTestId("body-bmi")).toContainText(new RegExp(`IMC\\s*${s.bmi.value}`));
    await expect(page.getByTestId("body-bmi")).toContainText("Referência: 18,5 a 24,9");
    await expect(page.getByTestId("body-height")).toHaveText("165 cm");
    await expect(card.getByText(s.trend.speech, { exact: true })).toHaveCount(1);
  });
  await check(`${width} (4) régua do IMC: ponto navy na posição da faixa, sem categoria nem rosa`, async () => {
    const dot = page.getByTestId("body-bmi-dot");
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== rgb(palette.navy)) throw Error(`ponto ${bg}`);
    const text = await card.innerText();
    if (/sobrepeso|obesidade|normal|adequado|abaixo do peso/i.test(text)) throw Error(`categoria no cartão: ${text}`);
    await noRose(card, "Corpo");
    await touch44(card.getByRole("button", { name: "Registrar medidas na Evolução", exact: true }), "Registrar medidas");
  });
  if (width === 390) await shoot(page, "390-corpo.png", card);
  await check(`${width} (4) Corpo: sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}
{
  const year = Number(today.slice(0, 4)) - 16;
  const { page, context, errors } = await open(withJourney({ birthDate: `${year}-01-15` }), { ready: (p) => p.getByTestId("body-card") });
  await check("(4) menor de 18: só o peso, medidas e \"Medido\"; sem tendência, IMC nem peso nos cartões", async () => {
    await expect(page.getByTestId("body-weight")).toHaveText("72,4 kg");
    for (const id of ["body-trend", "body-sparkline", "body-bmi"]) await expect(page.getByTestId(id)).toHaveCount(0);
    const text = await page.getByTestId("body-card").innerText();
    if (/IMC/.test(text)) throw Error("IMC no cartão");
    await expect(page.getByTestId("profile-attention")).toHaveCount(0);
    const labels = await hub(page).getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    const bad = labels.filter((label) => /\bpeso\b|\bkg\b|IMC/i.test(label));
    if (bad.length) throw Error(bad.join(" | "));
  });
  await check("(4) menor de 18: sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (5) Exames com resultados estruturados ----------
const HEMOGRAMA = { id: "exame-novo", name: "Hemograma", date: "2026-08-10", fileName: "hemograma.pdf", mimeType: "application/pdf", data: PDF, notes: "" };
const MARCO = {
  id: "exame-marco",
  name: "Glicemia de março",
  date: "2026-03-12",
  fileName: "glicemia.png",
  mimeType: "image/png",
  data: PNG,
  notes: "",
  analysis: "Glicose: 95 mg/dL.",
  analysisStructured: {
    data: "2026-03-12",
    resultados: [{ grupo: null, nome: "Glicose", valor: "95", unidade: "mg/dL", referencia: "70 a 99 mg/dL", marcacao: null }],
    ilegiveis: [],
    perguntas: [],
    observacoes: [],
  },
};
const examState = (exams) => {
  const state = stateWith({ consentAi: true });
  state.exams = exams;
  return state;
};
const examsReady = (page) => heading(page, "Meus exames");
const examCard = (page, name) => page.getByTestId("exam-card").filter({ hasText: name });
{
  const reply = (body) => (body.mode === "exam" ? EXAM_REPLY : { error: "modo inesperado" });
  const { page, context, errors, agentCalls } = await open(examState([MARCO, HEMOGRAMA]), {
    route: "/espaco?tab=documentos",
    ready: examsReady,
    agent: reply,
  });
  const card = examCard(page, "Hemograma");
  await check('(5) laudo como documento: "10/08/2026 · PDF", miniatura e "⋯" com 44 px', async () => {
    await expect(card).toContainText("10/08/2026 · PDF");
    await expect(examCard(page, "Glicemia de março")).toContainText("12/03/2026 · Imagem · Resultados transcritos");
    await touch44(button(page, "Mais ações: Hemograma"), "Mais ações");
    await expect(page.getByText(/^2 de 30 exames · /)).toBeVisible();
  });
  await check('(5) "Analisar com o agente" envia mode "exam" e mostra as contagens neutras', async () => {
    await card.getByRole("button", { name: "Analisar com o agente", exact: true }).click();
    const counters = card.getByRole("list", { name: "Resumo da análise", exact: true });
    for (const text of ["5 resultados", "1 marcado pelo laboratório", "1 trecho ilegível"])
      await expect(counters.getByText(text, { exact: true })).toBeVisible();
    if (agentCalls.length !== 1 || agentCalls[0].mode !== "exam") throw Error(JSON.stringify(agentCalls.map((c) => c.mode)));
    if (!String(agentCalls[0].file).startsWith("data:application/pdf;base64,")) throw Error("arquivo não enviado");
  });
  await check('(5) "Ver resultados (5)" vai de aria-expanded false a true e mostra "Bioquímica"', async () => {
    const toggle = card.getByRole("button", { name: "Ver resultados (5)", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await touch44(toggle, "Ver resultados");
    await toggle.click();
    await expect(card.getByRole("button", { name: "Ocultar resultados", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(card.getByRole("heading", { name: "Bioquímica", exact: true })).toBeVisible();
  });
  const glicose = card.getByTestId("biomarker").filter({ hasText: "Glicose" });
  await check('(5) Glicose: "Referência do laudo: 70 a 99 mg/dL" e "Laudo: H"; ponto navy e faixa menta', async () => {
    await expect(glicose).toContainText("Referência do laudo: 70 a 99 mg/dL");
    await expect(glicose).toContainText("Laudo: H");
    const dot = await glicose.getByTestId("biomarker-dot").evaluate((el) => getComputedStyle(el).backgroundColor);
    const zone = await glicose.getByTestId("biomarker-zone").evaluate((el) => getComputedStyle(el).backgroundColor);
    if (dot !== rgb(palette.navy)) throw Error(`ponto ${dot}`);
    if (zone !== rgb(palette.slate300)) throw Error(`faixa ${zone}`);
  });
  await check("(5) Triglicerídeos (referência por meta) fica só em texto, sem barra", async () => {
    const row = card.getByTestId("biomarker").filter({ hasText: "Triglicerídeos" });
    await expect(row).toContainText("Referência do laudo: Desejável: < 150");
    await expect(row.getByTestId("biomarker-bar")).toHaveCount(0);
  });
  await check("(5) histórico da glicose: mini tendência e leitura com as duas datas", async () => {
    await expect(glicose.getByTestId("biomarker-history")).toBeVisible();
    // Leitura única: o histórico é texto só para leitores de tela e a linha não tem aria-label (que duplicaria o texto).
    await expect(glicose.getByText(/^Histórico nos seus exames: 95 mg\/dL em 12\/03\/2026; 102 mg\/dL em 10\/08\/2026\.$/)).toHaveCount(1);
    if ((await glicose.getAttribute("aria-label")) !== null) throw Error("linha com aria-label");
  });
  await check('(5) resultados sem rosa e sem "normal"/"alterado"', async () => {
    const results = card.getByTestId("exam-results");
    await noRose(results, "resultados");
    const text = await results.innerText();
    if (/\bnormal|alterad|\bacima\b|\babaixo\b/i.test(text)) throw Error(`classificação no texto: ${text.slice(0, 80)}`);
  });
  await shoot(page, "390-exame-resultados.png", card);
  await check("(5) perguntas: caixa de 44 px; marcar a primeira grava questionsDone [0]", async () => {
    const question = card.getByRole("checkbox", { name: EXAM_RESULT.perguntas[0], exact: true });
    await touch44(question, "pergunta");
    await expect(question).toHaveAttribute("aria-checked", "false");
    await question.click();
    await expect(question).toHaveAttribute("aria-checked", "true");
  });
  await check('(5) "⋯": baixar, analisar de novo e remover; "Remover exame" tem "Desfazer"', async () => {
    await button(page, "Mais ações: Hemograma").click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(3);
    await expect(page.getByRole("menuitem", { name: "Analisar de novo", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: "Remover exame", exact: true }).click();
    await expect(examCard(page, "Hemograma")).toHaveCount(0);
    await toastWith(page, "Exame removido.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(page.getByText("Exame restaurado.", { exact: true })).toBeVisible();
    await expect(examCard(page, "Hemograma")).toHaveCount(1);
  });
  await check("(5) recarregar mantém a pergunta marcada", async () => {
    await page.reload();
    await expect(examsReady(page)).toBeVisible({ timeout: 30000 });
    await expect(examCard(page, "Hemograma").getByRole("checkbox", { name: EXAM_RESULT.perguntas[0], exact: true })).toHaveAttribute("aria-checked", "true");
  });
  await check("(5) sem erros de página nem de console", () => noErrors(errors));
  await check("(5) estado: texto renderizado, resultado estruturado igual ao laudo e questionsDone [0]", async () => {
    const saved = await readState(page, "exam");
    const exam = saved.exams.find((e) => e.id === "exame-novo");
    if (exam.analysis !== EXAM_REPLY.text) throw Error("texto da análise diferente");
    deepStrictEqual(exam.analysisStructured, EXAM_RESULT);
    deepStrictEqual(exam.questionsDone, [0]);
  });
  await context.close();
}
{
  const { page, context, errors } = await open(examState([HEMOGRAMA]), {
    route: "/espaco?tab=documentos",
    ready: examsReady,
    agent: () => EXAM_URGENT_REPLY,
  });
  await check("(6) alerta urgente: role=alert com o texto dentro do cartão; nada salvo como análise", async () => {
    const card = examCard(page, "Hemograma");
    await card.getByRole("button", { name: "Analisar com o agente", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText(EXAM_URGENT_REPLY.text);
    await expect(card.getByTestId("exam-results")).toHaveCount(0);
    await noRose(card.getByRole("alert"), "alerta");
  });
  await check("(6) sem erros de página nem de console", () => noErrors(errors));
  await check("(6) estado: sem análise", async () => {
    const saved = await readState(page, "urgent");
    if (saved.exams[0].analysis !== undefined || saved.exams[0].analysisStructured !== undefined) throw Error("análise salva");
  });
  await context.close();
}
{
  const done = { ...HEMOGRAMA, analysis: EXAM_REPLY.text, analysisStructured: EXAM_RESULT };
  const { page, context, errors } = await open(examState([MARCO, done]), {
    width: 360,
    status: "offline",
    route: "/espaco?tab=documentos",
    ready: examsReady,
  });
  await check('360 (5) resultados abertos: sem rolagem lateral; "Analisar de novo" desativado sem agente', async () => {
    const card = examCard(page, "Hemograma");
    await card.getByRole("button", { name: "Ver resultados (5)", exact: true }).click();
    await expect(card.getByRole("heading", { name: "Lipídios", exact: true })).toBeVisible();
    await noSideScroll(page, "exames a 360");
    await button(page, "Mais ações: Hemograma").click();
    await expect(page.getByRole("menuitem", { name: "Analisar de novo", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
  });
  await shoot(page, "360-exame-resultados.png");
  await check("360 (5) sem erros de página nem de console", () => noErrors(errors));
  await context.close();
}

// ---------- (7) Consultas como agenda ----------
const appointment = (id, professional, days, time, extra = {}) =>
  appointmentSchema.parse({
    id,
    professional,
    registration: "",
    date: shiftDate(today, days),
    time,
    url: "https://consulta.example.com/sala",
    notes: "",
    ...extra,
  });
for (const width of [390, 360]) {
  const next = appointment("c-proxima", "Dra. Ana Lima", 2, "10:00", { registration: "CRN 12345", notes: "Levar os exames." });
  const later = appointment("c-depois", "Dr. Bruno Reis", 10, "15:00");
  const past = appointment("c-passada", "Dra. Carla Souza", -3, "09:00");
  const state = stateWith();
  state.appointments = [later, past, next];
  const { page, context, errors } = await open(state, { width, route: "/espaco?tab=documentos", ready: (p) => heading(p, "Minhas consultas") });
  const box = page.getByTestId("next-appointment");
  await check(`${width} (7) "Próxima consulta": ${appointmentWhen(next, today)}, registro informado, sem "não informado"`, async () => {
    await expect(box).toContainText("Próxima consulta");
    await expect(box).toContainText(appointmentWhen(next, today));
    await expect(box).toContainText("CRN 12345");
    await expect(page.getByText("Registro profissional não informado")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Registrar consulta" })).toHaveCount(1);
    await expect(page.getByTestId("appointment-row").filter({ hasText: "Dr. Bruno Reis" })).toContainText(appointmentWhen(later, today));
  });
  await check(`${width} (7) alvos de 44 px: "Abrir link", "Lembrar-me" e os menus`, async () => {
    await touch44(button(page, "Abrir link da consulta"), "Abrir link");
    await touch44(button(page, "Lembrar-me: salvar a consulta com Dra. Ana Lima na agenda"), "Lembrar-me");
    await touch44(button(page, "Mais ações: consulta com Dra. Ana Lima"), "menu da próxima");
    await touch44(button(page, "Mais ações: consulta com Dr. Bruno Reis"), "menu da seguinte");
    await noSideScroll(page, "consultas");
  });
  if (width === 390) {
    await check('(7) "Lembrar-me" baixa consulta-{data}.ics com alarme de 1 hora', async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        button(page, "Lembrar-me: salvar a consulta com Dra. Ana Lima na agenda").click(),
      ]);
      if (download.suggestedFilename() !== `consulta-${next.date}.ics`) throw Error(download.suggestedFilename());
      const ics = readFileSync(await download.path(), "utf8");
      for (const line of ["BEGIN:VCALENDAR", "TRIGGER:-PT1H", "SUMMARY:Consulta com Dra. Ana Lima"])
        if (!ics.includes(line)) throw Error(`sem ${line}`);
      await expect(page.getByText("Arquivo de agenda baixado. Abra-o para salvar o lembrete.", { exact: true })).toBeVisible();
    });
    await check('(7) "Consultas anteriores (1)" fica recolhida até o toque', async () => {
      const toggle = button(page, "Consultas anteriores (1)");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByText("Dra. Carla Souza", { exact: true })).toHaveCount(0);
      await touch44(toggle, "Consultas anteriores");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText("Dra. Carla Souza", { exact: true })).toBeVisible();
    });
    await shoot(page, "390-consultas.png");
    await check('(7) "⋯ → Remover consulta" mostra "Consulta removida." com "Desfazer"', async () => {
      await button(page, "Mais ações: consulta com Dra. Ana Lima").click();
      await page.getByRole("menuitem", { name: "Remover consulta", exact: true }).click();
      await expect(toastWith(page, "Consulta removida.").getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
      await expect(page.getByTestId("next-appointment")).toContainText("Dr. Bruno Reis");
    });
  }
  await check(`${width} (7) sem erros de página nem de console`, () => noErrors(errors));
  await context.close();
}
{
  const { page, context } = await open(stateWith(), { route: "/espaco?tab=documentos", ready: (p) => heading(p, "Minhas consultas") });
  await check('(7) sem consultas: "Nenhuma consulta registrada." e um único "Registrar consulta"', async () => {
    await expect(page.getByText("Nenhuma consulta registrada.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar consulta" })).toHaveCount(1);
    await page.getByRole("button", { name: "Registrar consulta" }).click();
    await expect(page.getByLabel("Nome do profissional", { exact: true })).toBeVisible();
  });
  await context.close();
}

// ---------- (8) Preferências em lista ----------
for (const width of [390, 360]) {
  const state = stateWith({ consentAi: true });
  const p = state.profile;
  const { page, context, errors } = await open(state, { width, route: "/espaco?tab=preferencias", ready: (pg) => heading(pg, "Suas escolhas") });
  const advanced = button(page, "Avançado: servidor do agente");
  await check(`${width} (8) interruptores com o nome exato; linhas de 52 px; sem rolagem lateral`, async () => {
    await expect(page.getByRole("switch", { name: "Ocultar calorias nas telas e respostas", exact: true })).toHaveCount(1);
    await expect(page.getByRole("switch", { name: "Lembretes dentro do aplicativo", exact: true })).toHaveCount(1);
    await expect(page.getByRole("switch", { name: /Permitir envio do contexto/ })).toBeVisible();
    const heights = await page.getByTestId("setting-row").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    // 8 linhas desde "Ocultar números do corpo" (Onda 4 · L4, ESPACO-13); cada uma com 52 px.
    if (heights.length !== 8 || heights.some((h) => h < 52 - 0.5)) throw Error(heights.join(" "));
    await noSideScroll(page, "preferências");
  });
  await check(`${width} (8) agente pronto: "Pronto · DeepSeek e OpenAI"; "Avançado" recolhido sem "npm run dev:lan"`, async () => {
    await expect(page.getByTestId("agent-status")).toHaveAttribute("aria-label", "Agente: Pronto · DeepSeek e OpenAI");
    await expect(advanced).toHaveAttribute("aria-expanded", "false");
    await touch44(advanced, "Avançado");
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes("npm run dev:lan")) throw Error("comando à vista com o grupo fechado");
  });
  if (width === 390) {
    await shoot(page, "390-preferencias.png");
    await check('(8) "Horário de silêncio" abre a folha; "23:00" e "Salvar" gravam e atualizam a linha', async () => {
      const row = page.getByRole("button", { name: /^Horário de silêncio: / });
      await expect(row).toHaveAttribute("aria-haspopup", "dialog");
      await touch44(row, "Horário de silêncio");
      await row.click();
      await expect(heading(page, "Horário de silêncio")).toBeVisible();
      await button(page, "23:00").click();
      await button(page, "Salvar").click();
      await expect(page.getByText("Horário de silêncio salvo.", { exact: true })).toBeVisible();
      await expect(button(page, `Horário de silêncio: 23:00 às ${p.quietEnd}`)).toBeVisible();
    });
    await check(`(8) "Lembretes de água": "Aumentar 15 min" e "Salvar" → "${fmtInterval(p.hydrationInterval + 15)}"`, async () => {
      await page.getByRole("button", { name: /^Lembretes de água: / }).click();
      await expect(heading(page, "Lembretes de água")).toBeVisible();
      await button(page, "Aumentar 15 min").click();
      await button(page, "Salvar").click();
      await expect(page.getByText("Lembretes de água salvos.", { exact: true })).toBeVisible();
      await expect(button(page, `Lembretes de água: ${fmtInterval(p.hydrationInterval + 15)}`)).toBeVisible();
    });
    await check('(8) "Ocultar calorias" grava com "Preferência salva."', async () => {
      const toggle = page.getByRole("switch", { name: "Ocultar calorias nas telas e respostas", exact: true });
      await toggle.click();
      await expect(toggle).toBeChecked();
      await expect(page.getByText("Preferência salva.", { exact: true })).toBeVisible();
    });
    await check('(8) "Metas de alimentação" e "Horários das refeições" abrem as seções da anamnese', async () => {
      await button(page, "Metas de alimentação: Na anamnese").click();
      await expect(page).toHaveURL(new RegExp(`/anamnese\\?secao=${sectionIndexOf("manualCalories")}$`));
      await expect(heading(page, "Objetivos e metas")).toBeVisible();
      await button(page, "Voltar para Meu espaço").click();
      await button(page, "Horários das refeições: Na anamnese").click();
      await expect(page).toHaveURL(new RegExp(`/anamnese\\?secao=${sectionIndexOf("breakfastTime")}$`));
      await expect(heading(page, "Sono, movimento e bem-estar")).toBeVisible();
      await button(page, "Voltar para Meu espaço").click();
      await expect(heading(page, "Suas escolhas")).toBeVisible();
    });
    await check('(8) abrir "Avançado" mostra o endereço e a linha "npm run dev:lan"', async () => {
      await advanced.click();
      await expect(advanced).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByLabel("Endereço do servidor do agente", { exact: true })).toBeVisible();
      await expect(page.getByText("Para quem configura: no computador, rode npm run dev:lan.", { exact: true })).toBeVisible();
    });
  }
  await check(`${width} (8) sem erros de página nem de console`, () => noErrors(errors));
  if (width === 390) {
    await check("(8) estado: silêncio 23:00, água a cada 135 min, calorias ocultas", async () => {
      const saved = await readState(page, "settings");
      if (saved.profile.quietStart !== "23:00") throw Error(`silêncio ${saved.profile.quietStart}`);
      if (saved.profile.hydrationInterval !== p.hydrationInterval + 15) throw Error(`água ${saved.profile.hydrationInterval}`);
      if (saved.profile.hideCalories !== true) throw Error("calorias visíveis");
    });
  }
  await context.close();
}
{
  const { page, context } = await open(stateWith({ consentAi: true }), { status: "offline", route: "/espaco?tab=preferencias", ready: (pg) => heading(pg, "Suas escolhas") });
  await check('(8) sem servidor: "Sem conexão com o servidor do agente" e "Avançado" aberto sozinho', async () => {
    await expect(page.getByTestId("agent-status")).toHaveAttribute("aria-label", "Agente: Sem conexão com o servidor do agente");
    await expect(button(page, "Avançado: servidor do agente")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Endereço do servidor do agente", { exact: true })).toBeVisible();
    await noRose(page.getByTestId("agent-status"), "situação do agente");
  });
  await context.close();
}

// ---------- (9) Início visual do primeiro acesso ----------
const HABIT = HABIT_SUGGESTIONS[0].title;
for (const width of [390, 360]) {
  const state = startWithHabits(initialState(), { name: "Ana", goal: "organizar", consentLocal: true, habitIndex: 0 }, today, "habit-1");
  const { page, context, errors, agentCalls } = await open(state, { width, route: "/anamnese", ready: (p) => heading(p, "Olá, Ana.") });
  const total = page.getByTestId("starter-water-total");
  const cups = page.getByTestId("starter-cup");
  await check(`${width} (9) combinado: caixa nativa com o título, círculo de 32 px e alvo de 44 px`, async () => {
    const habit = page.getByRole("checkbox", { name: HABIT, exact: true });
    await touch44(habit, "combinado");
    const box = await page.getByTestId("starter-check").first().boundingBox();
    if (Math.round(box.width) !== 32 || Math.round(box.height) !== 32) throw Error(`${box.width}×${box.height}`);
    await habit.click();
    await expect(habit).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Feito hoje", { exact: true })).toBeVisible();
  });
  await check(`${width} (9) água: um copo por 250 ml (sem copos vazios); "Desfazer" tira o último`, async () => {
    await expect(cups).toHaveCount(0);
    await button(page, "Registrar 250 ml").click();
    await expect(total).toHaveText("250 ml");
    await expect(cups).toHaveCount(1);
    await button(page, "Registrar 250 ml").click();
    await expect(total).toHaveText("500 ml");
    await expect(cups).toHaveCount(2);
    // O aviso anterior some com uma animação: espera sobrar só o "Desfazer" do último registro.
    const undo = toastWith(page, "250 ml registrados.").getByRole("button", { name: "Desfazer", exact: true });
    await expect(undo).toHaveCount(1);
    await undo.click();
    await expect(total).toHaveText("250 ml");
    await expect(cups).toHaveCount(1);
  });
  await check(`${width} (9) "O que você libera" com 4 itens; "Seus dados" continua na tela`, async () => {
    await expect(page.getByRole("list", { name: "O que você libera", exact: true }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByText("Seus dados", { exact: true })).toBeVisible();
    await noSideScroll(page, "início");
  });
  if (width === 390) await shoot(page, "390-inicio.png");
  await check(`${width} (9) "Backup e dados": exportar, restaurar e recomeçar numa folha`, async () => {
    await button(page, "Backup e dados").click();
    await expect(heading(page, "Backup e dados")).toBeVisible();
    for (const name of ["Exportar backup", "Restaurar backup", "Excluir dados e recomeçar"]) await expect(button(page, name)).toBeVisible();
    await expect(page.getByText("Nenhum backup exportado ainda", { exact: true })).toBeVisible();
    await button(page, "Fechar").click();
    await expect(heading(page, "Backup e dados")).toHaveCount(0);
  });
  await check(`${width} (9) "⋯ → Remover" no registro de água zera e "Desfazer" devolve`, async () => {
    const menu = page.getByRole("button", { name: /^Mais ações: água de / });
    await expect(menu).toHaveCount(1);
    await touch44(menu, "menu da água");
    await menu.click();
    await page.getByRole("menuitem", { name: "Remover", exact: true }).click();
    await expect(total).toHaveText("0 ml");
    await expect(cups).toHaveCount(0);
    await toastWith(page, "Registro removido.").getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(total).toHaveText("250 ml");
  });
  await check(`${width} (9) nenhum pedido ao agente; sem erros de página nem de console`, () => {
    if (agentCalls.length) throw Error(`${agentCalls.length} pedidos ao agente`);
    noErrors(errors);
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
