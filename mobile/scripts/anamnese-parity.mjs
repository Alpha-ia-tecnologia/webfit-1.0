// Paridade visual da anamnese: preenche a etapa 1 e "Cuidados importantes", avança para as medidas e fotografa topo e régua,
// no app web (servidor em execução) ou no export web do app nativo. Usa o Chrome instalado via Playwright da raiz.
// Uso (na pasta mobile):
//   node scripts/anamnese-parity.mjs web http://127.0.0.1:3000/ ../dist/parity/web
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/web && node scripts/anamnese-parity.mjs rn dist/web ../dist/parity/rn
// Saída: <prefixo>-1-top.png, -1-filled.png, -2-top.png, -2-ruler-*.png e os valores lidos da régua (—, 71,0 e 73,0 esperados).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [mode, target, prefix] = process.argv.slice(2);
mkdirSync(path.dirname(prefix), { recursive: true });
let server;
let url = target;
if (mode === "rn") {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".wasm": "application/wasm", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
  server = createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(target, u);
    if (!existsSync(file) || u === "/") file = path.join(target, "index.html");
    try {
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(3209, "127.0.0.1", r));
  url = "http://127.0.0.1:3209/";
}
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const log = (...a) => console.log(`[${mode}]`, ...a);
const shot = (name) => page.screenshot({ path: `${prefix}-${name}.png` });
const clickText = async (text) => {
  const el = page.getByText(text, { exact: true }).first();
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(250);
  await el.click({ force: true });
};

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Personalizar alimentação", exact: true }).click();
await page.waitForTimeout(600);
await shot("1-top");

// Etapa 1: nome, data (ano 1990), sexo, ocupação, rotina e consentimento
await page.getByLabel("Como você se chama?").first().fill("Ana");
if (mode === "web") {
  await page.evaluate(() => {
    const input = document.querySelector("input[name=birthDate]");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "1990-01-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
} else {
  await clickText("1990");
}
await clickText("Masculino");
// Onda 3 · Lote 1: o objetivo mora na etapa 1.
await clickText("Manter meu peso");
await clickText("Estudante");
await clickText("Acordo cedo");
const checkbox = page.getByRole("checkbox").first();
if (await checkbox.count()) await checkbox.check({ force: true });
else await page.getByRole("switch").first().click();
await page.waitForTimeout(400);
await shot("1-filled");

await page.getByRole("button", { name: /Salvar e continuar/ }).first().click();
await page.waitForTimeout(1200);
const alerts = await page.locator(".field-error, [role=alert]").allInnerTexts();
log("erros de validação:", alerts.length ? alerts.join(" | ") : "nenhum");
await shot("1-after-submit");

// Etapa "Cuidados importantes" (triagem antes das medidas): gestação, transtorno, líquidos e condições.
await page.getByText("Cuidados importantes", { exact: true }).first().waitFor({ timeout: 15000 });
const pickRadio = async (group, option) => {
  const radio = page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: option, exact: true });
  await radio.evaluate((node) => node.scrollIntoView({ block: "center" }));
  if (mode === "web") await radio.check({ force: true });
  else await radio.click();
};
await pickRadio("Gestação ou amamentação", "Não / Não se aplica");
await pickRadio(/^Histórico de transtorno alimentar/, "Não");
await pickRadio("Possui orientação para restringir líquidos?", "Não");
await clickText("Nenhuma");
await page.waitForTimeout(400);
await shot("1b-care");
await page.getByRole("button", { name: /Salvar e continuar/ }).first().click();
await page.waitForTimeout(1200);
await page.getByText("Seu ponto de partida", { exact: true }).first().waitFor({ timeout: 15000 });
await page.waitForTimeout(900);
await shot("2-top");

const slider = page.locator('[role="slider"]').first();
await slider.waitFor({ timeout: 15000 });
await slider.evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.waitForTimeout(900);
const readValue = async () => (await slider.locator("xpath=..").innerText()).replace(/\s+/g, " ").slice(0, 70);
const clipAround = async () => {
  const box = await slider.boundingBox();
  const top = Math.max(0, box.y - 170);
  return { x: 0, y: top, width: 412, height: Math.min(915 - top, box.height + 270) };
};
await page.screenshot({ path: `${prefix}-2-ruler-initial.png`, clip: await clipAround() });
log("valor inicial:", await readValue());

// Ajuste fino: +0,5 kg duas vezes → o traço verde precisa ficar sob o marcador
const plus = page.getByRole("button", { name: /Aumentar 0,5 kg/ }).first();
await plus.click();
await page.waitForTimeout(300);
await plus.click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${prefix}-2-ruler-plus.png`, clip: await clipAround() });
log("após +1,0:", await readValue());

// Rolagem: 120 px na trilha (10 traços = 2 kg) e leitura do valor
const box = await slider.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(120, 0);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${prefix}-2-ruler-scrolled.png`, clip: await clipAround() });
log("após rolar 120px:", await readValue());
log("erros:", errors.length ? errors.join(" | ") : "nenhum");
await browser.close();
server?.close();
