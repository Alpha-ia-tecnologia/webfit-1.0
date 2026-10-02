// Verificação da anamnese (Lote 6; etapas da Onda 3 · Lote 1) no export web do app nativo, a 390 e 360 px de largura:
// barra única sem corte, sem rolagem lateral, um só "voltar", régua opcional recolhida,
// eco acolhedor, termos completos em folha e o selo "Salvo". Fotografa as etapas 1, 2, 3, 7 e 8.
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/lote6
//   node --import tsx scripts/anamnese-check.mjs dist/lote6
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import { MILESTONE_MESSAGES } from "../../src/components/anamnese/progress.ts";
import { CONDITION_COPY } from "../../src/components/anamnese/condition-choice.ts";
import { initialState } from "../../src/lib/domain.ts";
import { profileFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/lote6");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "lote6-shots"));
mkdirSync(shots, { recursive: true });
const PORT = 3211;
const url = `http://127.0.0.1:${PORT}`;
// Onda 3 · Lote 1: a triagem ("Cuidados importantes") vem antes das medidas; objetivos e metas numa etapa só.
const TITLES = [
  "Vamos conhecer você",
  "Cuidados importantes",
  "Seu ponto de partida",
  "Histórico de saúde",
  "Sua alimentação",
  "Sono, movimento e bem-estar",
  "Objetivos e metas",
  "Revise sua anamnese",
];
const EATING_LABEL =
  "Histórico de transtorno alimentar ou acompanhamento por dificuldades com a alimentação";
const BACK_NAMES = /^(Voltar|Salvar e voltar|Início da anamnese)/;
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

// Rascunho completo na etapa 1, sem perfil concluído (primeiro acesso), sem cintura informada e
// sem detalhes de condições (pessoa nova: o campo só abre ao marcar uma condição).
const fixture = {
  ...initialState(),
  draft: { ...profileFixture(), conditionTags: "nenhuma", conditions: "", waist: "" },
  draftStep: 0,
};
const seedFile = path.join(shots, "seed.sqlite");
const db = new DatabaseSync(seedFile);
db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(fixture));
db.close();
const seedBytes = [...readFileSync(seedFile)];

const results = [];
const check = (condition, label) => results.push(`${condition ? "PASS" : "FAIL"} ${label}`);
const browser = await chromium.launch({ channel: "chrome" });

async function open(width) {
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
  }, seedBytes);
  await page.goto(url + "/anamnese");
  await page.getByRole("heading", { name: TITLES[0], exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
}

/** Rola o conteúdo da anamnese até o topo (a rolagem é da ScrollView, não do documento). */
const scrollTop = (page) => page.getByTestId("anamnese-scroll").evaluate((el) => el.scrollTo(0, 0));

async function commonChecks(page, width, step) {
  const bar = await page.getByTestId("anamnese-bar-text").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, text: el.textContent }));
  check(bar.sw <= bar.cw + 1, `${width} etapa ${step}: barra sem corte ("${bar.text}")`);
  const overflow = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="anamnese-scroll"]');
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      scroll: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
    };
  });
  check(overflow.doc <= 0 && overflow.scroll <= 1, `${width} etapa ${step}: sem rolagem lateral (doc ${overflow.doc}, conteúdo ${overflow.scroll})`);
  const backs = await page.getByRole("button", { name: BACK_NAMES }).count();
  check(backs === 1, `${width} etapa ${step}: um único controle de voltar (${backs})`);
  const progress = await page.getByRole("progressbar", { name: "Etapas da anamnese" }).getAttribute("aria-valuetext");
  check((progress ?? "").startsWith(`Etapa ${step} de 8: ${TITLES[step - 1]}`), `${width} etapa ${step}: progresso anunciado ("${progress}")`);
}

async function next(page, step) {
  await page.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await page.getByRole("heading", { name: TITLES[step], exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

try {
  for (const width of [390, 360]) {
    const { page, context, errors } = await open(width);
    for (let step = 1; step <= 8; step++) {
      await commonChecks(page, width, step);
      if (step === 1) {
        // Marco de 100%: apagar e reescrever o nome cruza o marco de novo e mostra o aviso.
        const nameField = page.getByLabel("Como você se chama?", { exact: true });
        await nameField.fill("");
        await page.waitForTimeout(250);
        await nameField.fill("Pessoa Teste");
        const milestone = page.getByText(MILESTONE_MESSAGES[100], { exact: true });
        await milestone.waitFor({ timeout: 5000 }).catch(() => undefined);
        check(await milestone.isVisible(), `${width}: aviso do marco de 100% ao completar`);
        const back = page.getByRole("button", { name: "Início da anamnese", exact: true });
        check(await back.isDisabled(), `${width}: voltar desativado no início da anamnese`);
        // Conceito 07: "ⓘ Por quê?" na linha de ajuda (nome acessível com o texto visível, como no web).
        const about = page.getByRole("button", { name: "Por quê? Mais sobre esta etapa", exact: true });
        await about.click();
        check((await about.getAttribute("aria-expanded")) === "true", `${width}: "Por quê?" com aria-expanded`);
        check(await page.getByText("Este é seu espaço individual.", { exact: false }).isVisible(), `${width}: "Por quê?" mostra a descrição completa`);
        await about.click();
        check(await page.getByText("Já usou o WebFit? Traga seu backup.", { exact: true }).isVisible(), `${width}: restaurar backup no fim da etapa 1`);
        await page.getByRole("button", { name: "Ler termos completos" }).first().click();
        const terms = page.getByRole("heading", { name: "Termos completos", exact: true });
        await terms.waitFor({ timeout: 5000 });
        check(await terms.isVisible(), `${width}: "Ler termos completos" abre a folha`);
        await page.getByRole("button", { name: "Entendi", exact: true }).click();
        await terms.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
        check((await terms.count()) === 0, `${width}: "Entendi" fecha a folha`);
        // Ao fechar, o foco volta ao link (que rola até ele); espera antes de subir para a foto.
        await page.waitForTimeout(1000);
        await scrollTop(page);
        await page.waitForTimeout(400);
        await scrollTop(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, `${width}-step1.png`) });
        await page.getByText("Ler termos completos").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, `${width}-step1-consent.png`) });
      }
      if (step === 2) {
        // A triagem sensível vem antes das medidas: o eco de transtorno alimentar mora aqui agora.
        const group = page.getByRole("radiogroup", { name: EATING_LABEL });
        await group.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await group.getByRole("radio", { name: "Sim", exact: true }).click();
        const echo = page.getByText(/^Obrigado por confiar/);
        await echo.waitFor({ timeout: 5000 });
        check(await echo.isVisible(), `${width}: eco de transtorno alimentar aparece`);
        await page.waitForTimeout(300);
        if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-step2-echo.png`) });
        await group.getByRole("radio", { name: "Não", exact: true }).click();
        await echo.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
        check((await echo.count()) === 0, `${width}: eco some ao voltar para "Não"`);
        // Detalhes das condições (como no web): recolhidos com "Nenhuma"; qualquer condição marcada
        // abre o campo, opcional (obrigatório só com "Outra"); "Nenhuma" recolhe de novo.
        const tags = page.getByTestId("anamnese-field-conditionTags");
        const details = page.getByTestId("anamnese-field-conditions");
        check((await details.count()) === 0, `${width}: detalhes das condições recolhidos com "Nenhuma"`);
        const more = tags.getByRole("button", { name: "Mostrar outras opções", exact: true });
        await more.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await more.click();
        const diabetes = tags.getByText("Diabetes tipo 2", { exact: true }).first();
        await diabetes.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await diabetes.click();
        await details.waitFor({ timeout: 5000 }).catch(() => undefined);
        check(await details.isVisible(), `${width}: detalhes aparecem ao marcar "Diabetes tipo 2"`);
        check(
          await details.getByText(CONDITION_COPY.detailsOptional, { exact: true }).isVisible(),
          `${width}: detalhes opcionais sem "Outra"`,
        );
        await tags.getByText("Nenhuma", { exact: true }).first().click();
        await details.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
        check((await details.count()) === 0, `${width}: "Nenhuma" recolhe os detalhes`);
      }
      if (step === 3) {
        const saved = page.locator('[aria-label="Salvo neste aparelho"]');
        check(await saved.isVisible(), `${width}: selo "Salvo" com nome acessível`);
        // Conceito 07: o selo mostra "Salvo" em texto (só abaixo de 340 px vira o ícone).
        check(await page.getByText("Salvo", { exact: true }).isVisible(), `${width}: selo "Salvo" com texto`);
        const waist = page.getByTestId("anamnese-field-waist");
        await waist.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        const collapsed = await waist.boundingBox();
        check(collapsed.height <= 64, `${width}: cintura opcional recolhida (${Math.round(collapsed.height)}px)`);
        await page.getByRole("button", { name: "Informar Cintura (cm)", exact: true }).click();
        const slider = page.getByRole("slider", { name: "Cintura (cm)" });
        await slider.waitFor({ timeout: 5000 });
        check(await slider.isVisible(), `${width}: "Informar" abre a régua`);
        const reading = (await waist.innerText()).replace(/\s+/g, " ");
        check(/—/.test(reading), `${width}: régua aberta vazia ("${reading.slice(0, 40)}")`);
        const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
        check(focused === "Cintura (cm)", `${width}: foco vai para a régua (${focused})`);
        await waist.getByRole("button", { name: "Não informar", exact: true }).click();
        await page.getByRole("button", { name: "Informar Cintura (cm)", exact: true }).waitFor({ timeout: 5000 });
        check((await slider.count()) === 0, `${width}: "Não informar" recolhe a régua`);
        const refocused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
        check(refocused === "Informar Cintura (cm)", `${width}: foco volta para "Informar" (${refocused})`);
        await scrollTop(page);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(shots, `${width}-step3.png`) });
      }
      if (step === 7) {
        await scrollTop(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, `${width}-step7.png`) });
        const providers = page.getByRole("list", { name: "Provedores de IA" });
        await providers.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        check(await providers.getByText("DeepSeek", { exact: true }).isVisible(), `${width}: caminho dos dados da IA com provedores`);
        await page.screenshot({ path: path.join(shots, `${width}-step7-consent.png`) });
      }
      if (step === 8) {
        check(await page.getByRole("button", { name: "Adicionar exame: escolher arquivo", exact: true }).isVisible(), `${width}: área "Adicionar exame"`);
        check(await page.getByText("Os laudos ficam neste aparelho. A IA só lê os que você marcar.", { exact: true }).isVisible(), `${width}: dica dos exames`);
        await scrollTop(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, `${width}-step8.png`) });
        // Conceito 08: as respostas por etapa ficam na folha "Ajustar" (a 1ª etapa já aberta).
        await page.getByRole("button", { name: "Ajustar", exact: true }).click();
        await page.getByRole("heading", { name: "Ajustar respostas", exact: true }).waitFor({ timeout: 5000 });
        const birth = page.getByText("15/06/1992", { exact: true });
        await birth.evaluate((el) => el.scrollIntoView({ block: "center" }));
        check(await birth.isVisible(), `${width}: data da revisão em dd/mm/aaaa (folha "Ajustar")`);
        break;
      }
      await next(page, step);
    }
    check(errors.length === 0, `${width}: sem erros de página ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`${results.length - failed} de ${results.length} verificações passaram`);
if (failed) process.exitCode = 1;
