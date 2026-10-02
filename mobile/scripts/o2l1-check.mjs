// Verificação da Onda 2 · Lote 1 no export web do app nativo, a 390 e 360 px de largura:
// primeiro acesso em 3 telas (Começar → Sobre você → Seu primeiro passo) e pílulas da anamnese
// (excludentes no topo, recolher/mostrar, "Ver mais N" com busca). Fotografa as 3 telas e as
// etapas 2, 4 e 5 da anamnese a 390 px (ordem da Onda 3 · Lote 1).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o2l1
//   node --import tsx scripts/o2l1-check.mjs dist/o2l1
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import { initialState } from "../../src/lib/domain.ts";
import { profileFixture } from "../../tests/fixtures.ts";

const target = path.resolve(process.argv[2] ?? "dist/o2l1");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o2l1-shots"));
mkdirSync(shots, { recursive: true });
const PORT = 3216;
const url = `http://127.0.0.1:${PORT}`;
const CONSENT = "Concordo em salvar minhas respostas e registros neste aparelho.";
const ROUTINE = "Como é um dia típico para você?";
const TITLES = ["Sua rotina começa aqui", "Sobre você", "Seu primeiro passo"];
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

// Rascunho completo na etapa 1 com rotina e condições vazias e um histórico familiar antigo
// que mistura a excludente com uma opção comum ("Nenhum conhecido, Diabetes").
const fixture = {
  ...initialState(),
  draft: { ...profileFixture(), waist: "", routine: "", conditions: "", familyHistory: "Nenhum conhecido, Diabetes" },
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

async function newPage(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, context, errors };
}

async function noSideScroll(page, width, where) {
  const overflow = await page.evaluate(() => {
    let inner = 0;
    for (const el of document.querySelectorAll("div")) {
      const style = getComputedStyle(el);
      if (style.overflowX === "auto" || style.overflowX === "scroll")
        inner = Math.max(inner, el.scrollWidth - el.clientWidth);
    }
    return { doc: document.documentElement.scrollWidth - window.innerWidth, inner };
  });
  check(overflow.doc <= 0 && overflow.inner <= 1, `${width} ${where}: sem rolagem lateral (doc ${overflow.doc}, conteúdo ${overflow.inner})`);
}

const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent ?? "");
/** Topo da etapa (a rolagem é da ScrollView da anamnese); repete porque o foco pode rolar de volta. */
async function scrollToTop(page) {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("anamnese-scroll").evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(400);
  }
}

async function starterChecks(width) {
  const { page, context, errors } = await newPage(width);
  await page.goto(url);
  await heading(page, TITLES[0]).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  // Tela 1: valor, "Começar", "Personalizar alimentação" e um único restaurar backup.
  check(await page.getByRole("list", { name: "Tela 1 de 3: Boas-vindas", exact: true }).isVisible(), `${width} tela 1: progresso anunciado`);
  check((await page.getByRole("button", { name: "Voltar para a tela anterior" }).count()) === 0, `${width} tela 1: sem voltar`);
  check(await page.getByText("Seus dados ficam neste aparelho, sem conta.", { exact: true }).isVisible(), `${width} tela 1: valor com "neste aparelho"`);
  check(await page.getByRole("button", { name: "Personalizar alimentação", exact: true }).isVisible(), `${width} tela 1: "Personalizar alimentação"`);
  check(await page.getByText("Já usou o WebFit?", { exact: true }).isVisible(), `${width} tela 1: "Já usou o WebFit?"`);
  const restores = await page.getByRole("button", { name: "Restaurar backup", exact: true }).count();
  check(restores === 1, `${width} tela 1: exatamente um restaurar backup (${restores})`);
  check((await page.getByText("Seus dados", { exact: true }).count()) === 0, `${width} tela 1: sem o cartão "Seus dados"`);
  await noSideScroll(page, width, "tela 1");
  if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-starter-1.png`), fullPage: true });

  // Tela 2: nome e objetivo; Enter e "Continuar" sem objetivo mostram o erro.
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await heading(page, TITLES[1]).waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  check(await page.getByRole("list", { name: "Tela 2 de 3: Sobre você", exact: true }).isVisible(), `${width} tela 2: progresso anunciado`);
  check((await focusedText(page)) === TITLES[1], `${width} tela 2: foco no título ("${await focusedText(page)}")`);
  const nameField = page.getByLabel("Como você se chama?", { exact: true });
  await nameField.press("Enter");
  const alert = page.getByRole("alert");
  check((await alert.innerText().catch(() => "")) === "Informe seu nome.", `${width} tela 2: Enter sem nome pede o nome`);
  await nameField.fill("Ana");
  check((await alert.count()) === 0, `${width} tela 2: o erro some ao digitar o nome`);
  await nameField.press("Enter");
  check((await alert.innerText().catch(() => "")) === "Escolha seu objetivo.", `${width} tela 2: Enter sem objetivo pede o objetivo`);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  check((await alert.innerText().catch(() => "")) === "Escolha seu objetivo.", `${width} tela 2: "Continuar" sem objetivo pede o objetivo`);
  check((await heading(page, TITLES[1]).count()) === 1, `${width} tela 2: continua na tela sem objetivo`);
  const goals = page.getByRole("radiogroup", { name: "O que você quer melhorar?" }).getByRole("radio");
  check((await goals.count()) === 4, `${width} tela 2: 4 objetivos com semântica de rádio`);
  const goal = page.getByRole("radio", { name: "Organizar minha alimentação e rotina", exact: true });
  await goal.click();
  check((await goal.getAttribute("aria-checked")) === "true", `${width} tela 2: objetivo marcado (aria-checked)`);
  check((await alert.count()) === 0, `${width} tela 2: o erro some ao escolher o objetivo`);
  const [first, second] = [await goals.nth(0).boundingBox(), await goals.nth(1).boundingBox()];
  const twoColumns = Math.abs(first.y - second.y) < 2;
  check(width > 360 ? twoColumns : !twoColumns && first.width > width - 40, `${width} tela 2: objetivos em ${width > 360 ? "2 colunas" : "1 coluna"}`);
  await noSideScroll(page, width, "tela 2");
  if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-starter-2.png`), fullPage: true });

  // Tela 3, voltar mantém o objetivo e o nome.
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await heading(page, TITLES[2]).waitFor({ timeout: 5000 });
  check(await page.getByRole("list", { name: "Tela 3 de 3: Primeiro passo", exact: true }).isVisible(), `${width} tela 3: progresso anunciado`);
  await page.getByRole("button", { name: "Voltar para a tela anterior", exact: true }).click();
  await heading(page, TITLES[1]).waitFor({ timeout: 5000 });
  check((await goal.getAttribute("aria-checked")) === "true", `${width}: voltar mantém o objetivo`);
  check((await nameField.inputValue()) === "Ana", `${width}: voltar mantém o nome`);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await heading(page, TITLES[2]).waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  check((await focusedText(page)) === TITLES[2], `${width} tela 3: foco no título`);
  const later = page.getByRole("radio", { name: "Escolher depois", exact: true });
  check((await later.getAttribute("aria-checked")) === "true", `${width} tela 3: "Escolher depois" marcado por padrão`);
  const habit = page.getByRole("radio", { name: /^Planejar a próxima refeição/ });
  await habit.click();
  check((await habit.getAttribute("aria-checked")) === "true", `${width} tela 3: combinado escolhido`);
  await page.getByRole("button", { name: "Começar com combinados", exact: true }).click();
  check((await alert.innerText().catch(() => "")) === "Autorize o armazenamento para começar.", `${width} tela 3: sem consentimento mostra o erro`);
  const consent = page.getByRole("switch", { name: CONSENT });
  await consent.click();
  check(await consent.isChecked(), `${width} tela 3: interruptor de consentimento ligado`);
  await noSideScroll(page, width, "tela 3");
  if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-starter-3.png`), fullPage: true });

  // Começar: tela dos combinados com o nome.
  await page.getByRole("button", { name: "Começar com combinados", exact: true }).click();
  await heading(page, "Olá, Ana.").waitFor({ timeout: 10000 });
  check(await heading(page, "Olá, Ana.").isVisible(), `${width}: começar abre "Olá, Ana."`);
  check(await page.getByText("Planejar a próxima refeição", { exact: true }).isVisible(), `${width}: combinado escolhido aparece`);
  check(await page.getByText("Seus dados", { exact: true }).isVisible(), `${width}: "Seus dados" depois de começar`);
  check(errors.length === 0, `${width} primeiro acesso: sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

async function openAnamnese(width) {
  const opened = await newPage(width);
  const { page } = opened;
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
  await heading(page, "Vamos conhecer você").waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  return opened;
}

async function next(page, title) {
  await page.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
  await heading(page, title).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

const pillNames = (field) => field.locator("[aria-pressed]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

async function anamneseChecks(width) {
  const { page, context, errors } = await openAnamnese(width);
  // Etapa 1: rotina com 10 opções → 8 à vista e "Ver mais 2" (conceito 07) com busca.
  const routine = page.getByTestId("anamnese-field-routine");
  await routine.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const more = routine.getByRole("button", { name: "Ver mais 2", exact: true });
  check(await more.isVisible(), `${width} rotina: "Ver mais 2"`);
  // "Outros" também é uma pílula de alternância; as opções do catálogo são as demais.
  const shown = (await pillNames(routine)).filter((name) => name !== "Outros");
  check(shown.length === 8 && !shown.includes("Estudo ou trabalho à noite"), `${width} rotina: 8 opções à vista (${shown.length})`);
  check((await routine.getByRole("button", { name: "Outros", exact: true }).count()) === 1, `${width} rotina: "Outros" como pílula`);
  if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-step1-routine.png`) });
  await more.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("heading", { name: ROUTINE, exact: true }).waitFor({ timeout: 5000 });
  if (width === 390) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, `${width}-step1-sheet.png`) });
  }
  check((await sheet.locator("[aria-pressed]").count()) === 10, `${width} folha: 10 opções`);
  const search = sheet.getByLabel(`Buscar em ${ROUTINE}`, { exact: true });
  check((await search.getAttribute("placeholder")) === "Buscar opção", `${width} folha: busca "Buscar opção"`);
  await search.fill("xyz");
  check(await sheet.getByText('Nenhuma opção encontrada. Use "Outros".', { exact: true }).isVisible(), `${width} folha: aviso sem resultado`);
  await search.fill("noite");
  const found = await sheet.locator("[aria-pressed]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  check(found.length === 1 && found[0] === "Estudo ou trabalho à noite", `${width} folha: "noite" deixa 1 opção (${found.join(", ")})`);
  const night = sheet.getByRole("button", { name: "Estudo ou trabalho à noite", exact: true });
  await night.click();
  check((await night.getAttribute("aria-pressed")) === "true", `${width} folha: opção marcada (aria-pressed)`);
  await sheet.getByRole("button", { name: "Concluir", exact: true }).click();
  await sheet.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
  check((await page.getByRole("dialog").count()) === 0, `${width} folha: "Concluir" fecha`);
  const kept = routine.getByRole("button", { name: "Estudo ou trabalho à noite", exact: true });
  check((await kept.isVisible()) && (await kept.getAttribute("aria-pressed")) === "true", `${width} rotina: opção escolhida continua à vista`);

  // Onda 3 · Lote 1: condições e transtorno alimentar ficam em "Cuidados importantes" (etapa 2).
  await next(page, "Cuidados importantes");
  // Etapa 2: excludentes no topo; "Nenhuma" recolhe e "Mostrar outras opções" reabre.
  if (width === 390) {
    await scrollToTop(page);
    await page.screenshot({ path: path.join(shots, `${width}-step2.png`) });
  }
  // Condições (lista fechada, 2026-10-01): 13 pílulas; "Nenhuma" é excludente e recolhe as demais;
  // "Outra" abre os detalhes, que guardam o texto como digitado.
  const conditions = page.getByTestId("anamnese-field-conditionTags");
  await conditions.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const none = conditions.getByRole("button", { name: "Nenhuma", exact: true });
  check((await none.getAttribute("aria-pressed")) === "true", `${width} condições: "Nenhuma" do rascunho marcada`);
  check((await conditions.getByRole("button", { name: "Hipertensão (pressão alta)" }).count()) === 0, `${width} condições: "Nenhuma" recolhe as demais`);
  const expand = conditions.getByRole("button", { name: "Mostrar outras opções", exact: true });
  check(await expand.isVisible(), `${width} condições: "Mostrar outras opções"`);
  if (width === 390) await page.screenshot({ path: path.join(shots, `${width}-step3-none.png`) });
  await expand.click();
  await page.waitForTimeout(200);
  const names = await pillNames(conditions);
  check(names.length === 13, `${width} condições: 13 opções da lista (${names.length})`);
  check(await conditions.getByRole("button", { name: "Hipertensão (pressão alta)" }).isVisible(), `${width} condições: "Mostrar outras opções" reabre`);
  const otherChip = conditions.getByRole("button", { name: "Outra", exact: true });
  await otherChip.click();
  check((await none.getAttribute("aria-pressed")) === "false", `${width} condições: "Outra" desmarca "Nenhuma"`);
  const otherField = page.getByLabel("Detalhes ou outra condição", { exact: true });
  await otherField.pressSequentially("asma leve");
  check((await otherField.inputValue()) === "asma leve", `${width} condições: detalhes aceitam espaços ao digitar ("${await otherField.inputValue()}")`);
  await none.click();
  check((await none.getAttribute("aria-pressed")) === "true", `${width} condições: "Nenhuma" marcada de novo`);
  check((await conditions.getByRole("button", { name: "Outra", exact: true }).count()) === 0, `${width} condições: "Nenhuma" limpa "Outra"`);
  // Enum sem descrições vira pílula de rádio.
  const eating = page.getByRole("radiogroup", { name: /^Histórico de transtorno alimentar/ });
  check((await eating.getByRole("radio", { name: "Não", exact: true }).getAttribute("aria-checked")) !== null, `${width} enum em pílulas com aria-checked`);
  // Teclado no export web: Espaço marca o rádio (como o Enter); depois volta ao "Não".
  const eatingYes = eating.getByRole("radio", { name: "Sim", exact: true });
  await eatingYes.focus();
  await page.keyboard.press(" ");
  check((await eatingYes.getAttribute("aria-checked")) === "true", `${width} Espaço marca o rádio`);
  await eating.getByRole("radio", { name: "Não", exact: true }).click();
  // A dica do cartão ("Metas e registros com calorias") é a descrição acessível do rádio.
  const showCalories = page.getByRole("radio", { name: "Mostrar calorias", exact: true });
  const describedBy = await showCalories.getAttribute("aria-describedby");
  const description = describedBy ? await page.locator(`[id="${describedBy}"]`).innerText() : "";
  check(description === "Metas e registros com calorias", `${width} dica do cartão como descrição ("${description}")`);
  await noSideScroll(page, width, "etapa 2");

  await next(page, "Seu ponto de partida");
  await next(page, "Histórico de saúde");
  // Etapa 4: resposta antiga com excludente e opção comum: a comum nunca fica escondida.
  if (width === 390) {
    await scrollToTop(page);
    await page.screenshot({ path: path.join(shots, `${width}-step4-health.png`) });
  }
  const family = page.getByTestId("anamnese-field-familyHistory");
  await family.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const diabetes = family.getByRole("button", { name: "Diabetes", exact: true });
  check((await diabetes.isVisible()) && (await diabetes.getAttribute("aria-pressed")) === "true", `${width} histórico familiar: "Diabetes" antiga continua à vista`);
  check((await family.getByRole("button", { name: "Mostrar outras opções" }).count()) === 0, `${width} histórico familiar: não recolhe com opção comum marcada`);
  await noSideScroll(page, width, "etapa 4");

  await next(page, "Sua alimentação");
  // Etapa 5: emoji decorativo fora do nome acessível.
  const favorite = page.getByTestId("anamnese-field-favoriteFoods");
  await favorite.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const rice = favorite.getByRole("button", { name: "Arroz e feijão", exact: true });
  check((await rice.getAttribute("aria-pressed")) === "true" && (await rice.innerText()).includes("🍚"), `${width} alimentação: emoji antes do texto, fora do nome`);
  await noSideScroll(page, width, "etapa 5");
  if (width === 390) {
    await scrollToTop(page);
    await page.screenshot({ path: path.join(shots, `${width}-step5.png`) });
    await favorite.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, `${width}-step5-foods.png`) });
  }
  check(errors.length === 0, `${width} anamnese: sem erros de página ${errors.join(" | ")}`);
  await context.close();
}

try {
  for (const width of [390, 360]) {
    await starterChecks(width);
    await anamneseChecks(width);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`${results.length - failed} de ${results.length} verificações passaram`);
if (failed) process.exitCode = 1;
