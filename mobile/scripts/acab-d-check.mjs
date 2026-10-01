// Verificação do acabamento D (SIS-03, parte RN) no export web do app, a 390 px: nas abas com título
// grande (Meu espaço, Evolução, Meu diário), o título de 28 px encolhe para 17 px conforme a
// rolagem (escala a partir da esquerda, sem animar a fonte nem o layout), continua um único título
// para o leitor de tela e volta a 28 px no topo; com "reduzir movimento", troca de uma vez num limiar.
// A faixa do balanço do Diário continua, a saudação do Hoje não muda e a barra inferior segue
// desenhada (no web, com o fundo sólido; o vidro nativo só existe no iOS 26+). Fotografa as telas.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/acab-d
//   node --import tsx scripts/acab-d-check.mjs dist/acab-d [pasta-das-fotos]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { localDate } from "../../src/lib/domain.ts";
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";
import { longDate } from "../../src/lib/today.ts";
import { stateFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/acab-d");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "acab-d-shots"));
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "acab-d-seed-"));
const PORT = 3232;
const url = `http://127.0.0.1:${PORT}`;
/** Escala do título compacto: 17 px a partir dos 28 px do título grande. */
const COMPACT = 17 / 28;
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
async function open(state, { width = 390, route = "/", ready, reducedMotion = "no-preference" } = {}) {
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion });
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

const heading = (page, name) => page.getByRole("heading", { name, exact: true });
/** Escala visual do título: altura desenhada (com transform) ÷ altura de layout. */
const titleScale = (page, name) => heading(page, name).evaluate((el) => el.getBoundingClientRect().height / el.offsetHeight);
/** Põe a rolagem da tela em y px (a ScrollView mais próxima acima do elemento-âncora). */
async function scrollTo(anchor, y) {
  await anchor.evaluate((el, top) => {
    let node = el.parentElement;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) break;
      node = node.parentElement;
    }
    if (!node) throw Error("sem área rolável acima da âncora");
    node.scrollTop = top;
  }, y);
  await anchor.page().waitForTimeout(300);
}
/** Rola o conteúdo com a roda do mouse (dy > 0 = para baixo), como um gesto de rolagem. */
async function wheel(page, dy) {
  await page.mouse.move(195, 560);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(450);
}
/** Exatamente um título com esse nome na árvore de acessibilidade e nenhuma cópia do texto no DOM. */
async function singleHeading(page, name) {
  await expect(heading(page, name)).toHaveCount(1);
  // Fora da barra inferior: a aba "Evolução" tem o mesmo texto curto e não é uma cópia do título.
  const texts = await page.getByText(name, { exact: true }).evaluateAll((els) => els.filter((el) => !el.closest('[role="tablist"]')).length);
  if (texts !== 1) throw Error(`${texts} textos "${name}" fora da barra inferior`);
  const tree = await page.locator("body").ariaSnapshot();
  const count = tree.split("\n").filter((line) => line.includes(`heading "${name}"`)).length;
  if (count !== 1) throw Error(`${count} títulos "${name}" na árvore de acessibilidade`);
}
async function shoot(page, file) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, file) });
}

// ---------- Meu espaço (390 px): título grande → compacto conforme a rolagem ----------
{
  const name = "Meu espaço";
  const { page, context, errors } = await open(stateFixture(), { route: "/espaco", ready: (p) => heading(p, name) });
  const anchor = page.getByRole("tablist", { name: "Seções do Meu espaço" });
  await check("espaço: no topo, título grande de 28 px visível e sem escala", async () => {
    await expect(heading(page, name)).toBeInViewport();
    const size = await heading(page, name).evaluate((el) => getComputedStyle(el).fontSize);
    if (size !== "28px") throw Error(`fonte ${size}`);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
  });
  await shoot(page, "390-espaco-topo.png");
  await check("espaço: metade da altura do título rolada (16 px) = título no meio do caminho", async () => {
    await scrollTo(anchor, 16);
    const scale = await titleScale(page, name);
    if (!(scale > 0.75 && scale < 0.85)) throw Error(`escala ${scale.toFixed(3)} (esperado ~0,80)`);
  });
  await check("espaço: depois de rolar, título compacto de 17 px na barra (escala, sem mudar a fonte)", async () => {
    await scrollTo(anchor, 300);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(COMPACT, 2);
    const box = await heading(page, name).boundingBox();
    if (Math.abs(box.height - 32 * COMPACT) > 0.5) throw Error(`altura ${box.height} (esperado ~19,4 px = 17 px de fonte)`);
    if (Math.abs(box.x - 16) > 1) throw Error(`título saiu da margem esquerda: x=${box.x}`);
    await expect(heading(page, name)).toBeInViewport();
    const size = await heading(page, name).evaluate((el) => getComputedStyle(el).fontSize);
    if (size !== "28px") throw Error(`a fonte mudou (${size}); o encolhimento deve ser por transform`);
  });
  await check('espaço: um único título "Meu espaço" (sem cópia para o leitor de tela)', () => singleHeading(page, name));
  await shoot(page, "390-espaco-compacto.png");
  await check("espaço: de volta ao topo, o título volta a 28 px", async () => {
    await scrollTo(anchor, 0);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
  });
  await check("barra inferior: 5 abas + Registro rápido, com o fundo sólido no web, de ponta a ponta", async () => {
    const bar = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Hoje", exact: true }) });
    await expect(bar.getByRole("tab")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Registro rápido", exact: true })).toBeVisible();
    const bg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== "rgb(255, 255, 255)") throw Error(`fundo ${bg}`);
    await expect(bar).toBeInViewport({ ratio: 1 });
    // Fidelidade visual: barra cheia (sem a pílula recuada de antes), encostada nas duas bordas da tela.
    const box = await bar.boundingBox();
    const width = page.viewportSize().width;
    if (Math.abs(box.x) > 0.5 || Math.abs(box.width - width) > 0.5) throw Error(`barra em x=${box.x}, largura ${box.width} de ${width}`);
  });
  await check("espaço: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Evolução (390 px): mesma tela <Screen>, sem nada a fazer na tela ----------
{
  const name = EVOLUCAO_TITLE;
  const { page, context, errors } = await open(stateFixture(), { route: "/evolucao", ready: (p) => heading(p, name) });
  await check("evolução: título grande no topo e compacto ao rolar a roda do mouse", async () => {
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
    await wheel(page, 400);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(COMPACT, 2);
    await singleHeading(page, name);
  });
  await shoot(page, "390-evolucao-compacto.png");
  await check("evolução: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Reduzir movimento: troca de uma vez no limiar (metade da altura do título) ----------
{
  const name = "Meu espaço";
  const { page, context, errors } = await open(stateFixture(), {
    route: "/espaco",
    ready: (p) => heading(p, name),
    reducedMotion: "reduce",
  });
  const anchor = page.getByRole("tablist", { name: "Seções do Meu espaço" });
  await check("movimento reduzido: 10 px de rolagem não mexe no título", async () => {
    await scrollTo(anchor, 10);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
  });
  await check("movimento reduzido: passar de 16 px troca direto para 17 px, sem passo intermediário", async () => {
    await scrollTo(anchor, 20);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(COMPACT, 2);
    await scrollTo(anchor, 12);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
  });
  await check("movimento reduzido: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Diário (390 px): mesmo encolhimento com a rolagem própria; a faixa do balanço continua ----------
{
  const name = "Meu diário";
  const { page, context, errors } = await open(stateFixture(), { route: "/diario", ready: (p) => heading(p, name) });
  // Fidelidade visual (conceito 03, como o web): a data longa ("Quinta, 24 de setembro") fica ACIMA do título.
  const kicker = page.getByText(longDate(today), { exact: true });
  await check("diário: no topo, título de 28 px, data longa visível acima dele e sem faixa", async () => {
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
    await expect(kicker).toBeVisible();
    const [title, date] = [await heading(page, name).boundingBox(), await kicker.boundingBox()];
    if (date.y + date.height > title.y + 1) throw Error(`a data (${date.y}) não está acima do título (${title.y})`);
    await expect(page.getByTestId("diary-band")).toHaveCount(0);
  });
  await check("diário: ao rolar, título compacto, a data colada acima dele e a faixa do balanço aparece", async () => {
    await wheel(page, 700);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(COMPACT, 2);
    const band = page.getByTestId("diary-band");
    await expect(band).toBeVisible();
    const bandBox = await band.boundingBox();
    if (Math.round(bandBox.height) !== 56) throw Error(`faixa com ${bandBox.height} px`);
    await expect(kicker).toBeInViewport();
    const [title, date] = [await heading(page, name).boundingBox(), await kicker.boundingBox()];
    const gap = title.y - (date.y + date.height);
    if (gap < 0 || gap > 4) throw Error(`distância data → título ${gap.toFixed(1)} px`);
    await singleHeading(page, name);
  });
  await shoot(page, "390-diario-compacto.png");
  await check("diário: de volta ao topo, a faixa some e o título volta a 28 px", async () => {
    await wheel(page, -3000);
    await expect(page.getByTestId("diary-band")).toHaveCount(0);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
  });
  await check("diário: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// ---------- Hoje (390 px): a saudação não muda com a rolagem ----------
{
  const name = `Olá, ${stateFixture().profile.name.trim().split(/\s+/)[0]}.`;
  const { page, context, errors } = await open(stateFixture(), { ready: (p) => heading(p, name) });
  await check("hoje: saudação sem escala antes e depois de rolar", async () => {
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
    await wheel(page, 600);
    await expect.poll(() => titleScale(page, name)).toBeCloseTo(1, 2);
    await expect(heading(page, name)).toHaveCount(1);
  });
  await check("hoje: sem erros de página nem de console", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
rmSync(seedsDir, { recursive: true, force: true });
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
