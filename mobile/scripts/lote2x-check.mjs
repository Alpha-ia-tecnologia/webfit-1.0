// Sobras do lote 2 no app (export web, 390 px): dica "Antes de medir", mapa de aplicação com "Local: …",
// contagem animada da água no Hoje (e sem animação com movimento reduzido) e o cartão "Sua jornada" da Evolução.
// Executar em mobile/, após exportar o app web:
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/lote2x
//   node --import tsx scripts/lote2x-check.mjs dist/lote2x
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { initialState, localDate, shiftDate, updateProfile } from "../../src/lib/domain.ts";
import { injectionSummary, siteLabel } from "../../src/lib/injection.ts";
import { profileFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/lote2x");
const output = path.join(target, "lote2x-check");
const shots = path.resolve(target, "..", "lote2x-shots");
mkdirSync(output, { recursive: true });
mkdirSync(shots, { recursive: true });
const PORT = 3214;
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
const url = `http://127.0.0.1:${PORT}`;
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch({ channel: "chrome" });

// Perfil completo com peso desejado e duas medições na semana (para a variação no período).
const today = localDate();
// A seção de água fica oculta no Hoje por padrão (Editar Hoje): o teste do total animado a deixa à vista.
const base = updateProfile(initialState(), { ...profileFixture(), targetWeight: 68, homeLayout: "water" });
const fixture = {
  ...base,
  measurements: [
    { id: "m-antes", date: shiftDate(today, -3), weight: 73.4, height: 165, method: "Balança em casa" },
    ...base.measurements,
  ],
};
const expectedSite = siteLabel(injectionSummary(fixture.injections, today).suggestedSite);

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

let setupCount = 0;
async function setup(route, options = {}) {
  const seedFile = path.join(output, `seed-${++setupCount}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(fixture));
  db.close();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Nenhuma chamada real ao servidor do agente.
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await page.goto(url + "/__blank");
  await page.evaluate(async (bytes) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(await (await entry.getFile()).arrayBuffer());
      const name = new TextDecoder().decode(content.slice(0, 512)).split("\0")[0];
      if (!name.endsWith("/ExpoSQLiteStorage")) continue;
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
  await page.goto(url + route);
  return { page, context, errors };
}

/** Registra cada texto distinto do total de água, quadro a quadro, enquanto `action` roda. */
async function sampleWater(page, action) {
  const sampling = page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = [];
        const start = performance.now();
        const tick = () => {
          const text = document.querySelector('[data-testid="water-total"]')?.textContent ?? "";
          if (seen.at(-1) !== text) seen.push(text);
          if (performance.now() - start < 2500) requestAnimationFrame(tick);
          else resolve(seen);
        };
        tick();
      }),
  );
  await action();
  return sampling;
}

// 1. Seringa e dose: dica fixa e mapa de aplicação.
{
  const { page, context, errors } = await setup("/injecao");
  await expect(page.getByText("Antes de medir", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(shots, "injecao-dica-390.png") });
  const indicator = page.getByTestId("injection-site-indicator");
  await check("injeção: título \"Antes de medir\" e texto sem aspas", async () => {
    await expect(page.getByText(/^Confira o tipo da seringa antes de ler as unidades: 100 UI equivalem a 1 ml\./)).toBeVisible();
    const body = await page.locator("body").innerText();
    if (/[“”]Confira/.test(body)) throw Error("texto ainda entre aspas");
  });
  await check("injeção: nenhum \"Assistente\" na tela", async () => {
    const body = await page.locator("body").innerText();
    if (/assistente/i.test(body)) throw Error("encontrado \"Assistente\"");
  });
  await check(`mapa: chip "Local: ${expectedSite}" no local sugerido`, async () => {
    await expect(indicator).toHaveText(`Local: ${expectedSite}`);
    const legacy = await page.getByText(/selecionad[oa]$/).count();
    if (legacy) throw Error(`${legacy} texto(s) "… selecionado" restantes`);
  });
  await check("mapa: zonas não escolhidas em cinza (#64748b) e halo só na escolhida", async () => {
    const colorsIn = await page.evaluate(() => {
      const circles = [...document.querySelectorAll("svg circle")];
      const fills = circles.map((c) => (c.getAttribute("fill") ?? "").toLowerCase());
      const halos = circles.filter((c) => (c.getAttribute("fill") ?? "").includes("-halo"));
      return {
        idle: fills.filter((f) => f === "#64748b").length,
        green: fills.filter((f) => f === "#047857" || f === "#10b981").length,
        halosVisible: halos.filter((c) => c.getAttribute("opacity") !== "0").length,
        halosHidden: halos.filter((c) => c.getAttribute("opacity") === "0").length,
        fadedGroups: [...document.querySelectorAll("svg g")].filter((g) => g.getAttribute("opacity") === "0.38").length,
      };
    });
    if (!(colorsIn.idle > 0 && colorsIn.green > 0)) throw Error(`pontos: ${JSON.stringify(colorsIn)}`);
    if (!(colorsIn.halosVisible > 0 && colorsIn.halosHidden > 0)) throw Error(`halos: ${JSON.stringify(colorsIn)}`);
    if (colorsIn.fadedGroups) throw Error(`zonas ainda apagadas com opacidade: ${colorsIn.fadedGroups}`);
    console.log(`  pontos cinza ${colorsIn.idle}, verdes ${colorsIn.green}; halos visíveis ${colorsIn.halosVisible}, ocultos ${colorsIn.halosHidden}`);
  });
  const map = page.getByTestId("injection-body-map");
  await map.scrollIntoViewIfNeeded();
  await map.screenshot({ path: path.join(shots, "injecao-mapa-390.png") });
  const other = expectedSite === "Coxa" ? "Braço" : "Coxa";
  await check(`mapa: escolher "${other}" nas opções atualiza para "Local: ${other}"`, async () => {
    await page.getByRole("radio", { name: other, exact: true }).click();
    await expect(indicator).toHaveText(`Local: ${other}`);
    await expect(page.getByRole("radio", { name: other, exact: true })).toHaveAttribute("aria-checked", "true");
  });
  await map.screenshot({ path: path.join(shots, `injecao-mapa-${other.toLowerCase()}-390.png`) });
  await check("mapa: o desenho só resume; tocar num ponto cinza não troca o local (a escolha fica nas opções)", async () => {
    const before = await indicator.textContent();
    // Revisão da Onda 3: pontos de ≈14 px (coxa e braço sobrepostos) deixaram de ser alvos de toque.
    await page.locator('svg circle[fill="#64748b"]').first().click({ force: true });
    await expect(indicator).toHaveText(before ?? "");
    await expect(indicator).toHaveText(/^Local: (Abdômen|Coxa|Braço)( .+)?$/);
  });
  await map.screenshot({ path: path.join(shots, "injecao-mapa-troca-390.png") });
  await page.screenshot({ path: path.join(shots, "injecao-topo-390.png") });
  await check("injeção: registrar a aplicação conclui e volta ao diário (vibração é ignorada no web)", async () => {
    // Lote 5: sem histórico a dose começa vazia e o registro passa pela folha "Confirmar aplicação".
    await page.getByRole("button", { name: "Dose de 0,50 mg", exact: true }).click();
    await page.getByRole("button", { name: /^Confirmar e registrar/ }).click();
    const sheet = page.getByRole("heading", { name: "Confirmar aplicação", exact: true }).locator("xpath=../..");
    await sheet.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
    // Onda 3 (SERINGA-10): a folha "Aplicação registrada" leva ao diário.
    const saved = page.getByRole("heading", { name: "Aplicação registrada", exact: true }).locator("xpath=../..");
    await saved.getByRole("button", { name: "Ver no diário", exact: true }).click();
    await expect(page).toHaveURL(/\/diario/);
  });
  await check("injeção: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// 2. Hoje: total de água conta até o novo valor.
{
  const { page, context, errors } = await setup("/");
  const water = page.getByTestId("water-total");
  await expect(water).toHaveText("0 L");
  await page.screenshot({ path: path.join(shots, "hoje-390.png") });
  await check("hoje: +250 ml anima o total de água até 0,25 L", async () => {
    const tap = page.getByRole("button", { name: "Copo +250 ml", exact: true });
    await tap.scrollIntoViewIfNeeded();
    const samples = await sampleWater(page, () => tap.click());
    console.log(`  quadros distintos: ${samples.join(" → ")}`);
    if (samples[0] !== "0 L") throw Error(`começou em ${samples[0]}`);
    if (samples.at(-1) !== "0,25 L") throw Error(`terminou em ${samples.at(-1)}`);
    if (samples.length < 4) throw Error("sem valores intermediários (não animou)");
    await expect(water).toHaveText("0,25 L");
    await expect(water).toHaveAttribute("aria-label", "0,25 L");
  });
  await check("hoje: atalho de água do topo também chega a 0,25 L", async () => {
    await expect(page.getByRole("button", { name: /^Água: 0,25 L/ })).toBeVisible();
  });
  await page.getByTestId("water-total").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, "hoje-agua-390.png") });
  await page.evaluate(() => window.scrollTo(0, 0));
  await check("hoje: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

// 3. Hoje com movimento reduzido: mostra o valor final direto.
{
  const { page, context } = await setup("/", { reducedMotion: "reduce" });
  await expect(page.getByTestId("water-total")).toHaveText("0 L");
  await check("hoje (movimento reduzido): +250 ml vai direto para 0,25 L", async () => {
    const tap = page.getByRole("button", { name: "Copo +250 ml", exact: true });
    await tap.scrollIntoViewIfNeeded();
    const samples = await sampleWater(page, () => tap.click());
    console.log(`  quadros distintos: ${samples.join(" → ")}`);
    if (samples.join("|") !== "0 L|0,25 L") throw Error(`esperado 0 L → 0,25 L, veio ${samples.join(" → ")}`);
  });
  await context.close();
}

// 4. Evolução: cartão "Sua jornada" (peso atual, variação desde o início e caminho até a meta).
{
  const { page, context, errors } = await setup("/evolucao");
  await expect(page.getByTestId("journey-card")).toBeVisible();
  await check("evolução: peso atual, variação desde o início e caminho até a meta", async () => {
    // Conceito 09: o destaque é o peso atual (a última pesagem, 72,0 kg); a tendência fica no gráfico de peso.
    await expect(page.getByTestId("journey-weight")).toHaveText("72,0 kg");
    await expect(page.getByTestId("journey-caption")).toContainText("Peso atual · pesado ");
    await expect(page.getByTestId("journey-delta")).toHaveText("1,4 kg");
    const content = await page.getByTestId("journey-card").evaluate((el) => el.textContent ?? "");
    for (const part of ["Início 73,4", "26% do caminho", "Meta 68"]) if (!content.includes(part)) throw Error(`sem "${part}" em: ${content}`);
  });
  await check("evolução: peso da jornada com algarismos tabulares", async () => {
    const variant = await page.getByTestId("journey-weight").evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    if (!variant.includes("tabular-nums")) throw Error(`font-variant-numeric: ${variant}`);
  });
  await page.screenshot({ path: path.join(shots, "evolucao-390.png") });
  await check("evolução: sem erros de página", async () => {
    if (errors.length) throw Error(errors.join(" | "));
  });
  await context.close();
}

await browser.close();
server.close();
console.log(`${passed} de ${passed + failed} verificações passaram`);
if (failed) process.exit(1);
