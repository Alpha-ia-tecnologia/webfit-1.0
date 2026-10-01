// Capturas "agora" do app React Native (export web) nas telas que têm conceito na proposta visual, com o
// mesmo estado (scripts/ux-audit/concept-state.ts), o mesmo relógio (qui, 24 set 2026, São Paulo) e os
// mesmos cenários de scripts/ux-audit/capture-concepts.ts, a 390 px: <chave>.png (página inteira, sem a
// barra de abas) e <chave>-fold.png (primeira tela, 390×844), mais <chave>.txt e _log.txt (altura e
// palavras). Chaves: hoje, registro, diario, dieta, agente, despensa, anamnese-etapa (+ a extra
// anamnese-etapa-caneta, como no web), anamnese-plano, evolucao, seringa, espaco.
// Uso (na pasta mobile; cada execução com a sua porta e a sua pasta de export):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/fid-capture
//   node --import tsx scripts/capture-concepts-rn.mjs dist/fid-capture
// Variáveis:
//   PORT  porta do servidor estático do export (padrão 3239)
//   OUT   pasta das fotos (padrão <scratchpad>/proposta/agora-rn)
//   ONLY  só estas chaves, separadas por vírgula (ex.: ONLY=hoje,registro)
//   CHANNEL (padrão chrome) e AI_READY=0 (servidor sem IA configurada; o padrão é "pronto").
// Sem servidor nem IA: /api/status responde "pronto" e o resto da API é recusado (nenhuma chamada ao
// modelo). O estado entra no SQLite do navegador como nos scripts *-check.mjs.
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import {
  anamnesePlanState,
  anamneseStepState,
  CONCEPT_DAY,
  conceptState,
} from "../../scripts/ux-audit/concept-state.ts";

const SCRATCH =
  "C:/Users/naldo/AppData/Local/Temp/claude/d--projetos-dev1-webfit---sa-de---nutri--o/cfdc8c61-394e-4e30-a6e9-938615ce7618/scratchpad";
const target = path.resolve(process.argv[2] ?? "dist/fid-capture");
const OUT = path.resolve(process.env.OUT || path.join(SCRATCH, "proposta", "agora-rn"));
const PORT = Number(process.env.PORT || 3239);
const CHANNEL = process.env.CHANNEL ?? "chrome";
const AI_READY = process.env.AI_READY !== "0";
const ONLY_KEYS = (process.env.ONLY ?? "").split(",").map((key) => key.trim()).filter(Boolean);
/** ONLY vazio (ou ausente) = todas as chaves. */
const ONLY = ONLY_KEYS.length ? ONLY_KEYS : null;
const url = `http://127.0.0.1:${PORT}`;
/** Largura da tela (padrão 390, a dos conceitos); WIDTH=320 confere telas estreitas. */
const W = Number(process.env.WIDTH || 390);
const H = 844;
const TIME_ZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";
/** Horário padrão das capturas: "fim de tarde" do cartão Resumo do conceito Hoje. */
const AFTERNOON = "17:20";
const SETTLE_MS = 1500;
const SCROLL_MS = 300;
const STRETCH_MS = 600;
const MAX_STRETCHES = 8;
const BOOT_TIMEOUT_MS = 30000;
const STORAGE_KEY = "webfit-personal-v1";
const TOKEN = "0".repeat(64);
const STATUS = AI_READY
  ? { ready: true, token: TOKEN, providers: { deepseek: false, openai: true } }
  : { ready: false, token: TOKEN, providers: { deepseek: false, openai: false } };
const CORS = { "access-control-allow-origin": "*" };
/** Avisos passageiros não fazem parte da tela; na página inteira, a barra de abas marcada sai. */
const ALWAYS_CSS = '[data-testid^="toast-"] { display: none !important; }';
const FULL_PAGE_CSS = "[data-capture-hide] { display: none !important; }";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ---------- Telas (mesmos cenários do capture-concepts.ts, nas rotas do expo-router) ----------

const text = (content) => (page) => page.getByText(content).filter({ visible: true }).first();
const heading = (name) => (page) => page.getByRole("heading", { name }).filter({ visible: true }).first();
const greeting = heading(/^Olá,/);

/** Jantar com feijão e arroz integral no prato, a busca "arroz" aberta e o arroz em "Seus frequentes". */
async function openMealWithPlate(page) {
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  const search = page.getByLabel("Buscar alimento", { exact: true });
  await search.waitFor({ timeout: BOOT_TIMEOUT_MS });
  await search.fill("feijão");
  await page.getByRole("button", { name: "Adicionar Feijão, carioca, cozido", exact: true }).first().click();
  await search.fill("arroz");
  await page.getByRole("button", { name: "Adicionar Arroz, integral, cozido", exact: true }).first().click();
  await page.waitForTimeout(400);
  await search.focus();
}

const main = conceptState;
/**
 * `route` abre a tela direto (as de pilha e as abas); `ready` espera um texto do conteúdo; `open` segue o
 * caminho do app a partir dela; `opensAtEnd` fotografa a primeira tela sem voltar ao topo (o agente abre na
 * última mensagem); `keepFocus` mantém o foco (o Registro fica com a busca ativa, como no conceito).
 */
const SCENES = [
  { key: "hoje", time: AFTERNOON, state: main, route: "/", ready: greeting },
  { key: "registro", time: "19:31", state: main, route: "/", ready: greeting, open: openMealWithPlate, keepFocus: true },
  { key: "diario", time: AFTERNOON, state: main, route: "/diario", ready: text(/registros neste dia/) },
  { key: "dieta", time: AFTERNOON, state: main, route: "/dieta", ready: text("Seu plano de refeições") },
  { key: "agente", time: "18:14", state: main, route: "/agente", ready: text("Jantares rápidos"), opensAtEnd: true },
  { key: "despensa", time: AFTERNOON, state: main, route: "/despensa", ready: text("Frango ao forno com legumes") },
  // "Tem algum diagnóstico?" fica em "Cuidados importantes" (etapa 2 de 8)…
  {
    key: "anamnese-etapa",
    time: AFTERNOON,
    state: () => anamneseStepState(1),
    route: "/anamnese",
    ready: heading("Cuidados importantes"),
  },
  // …e "Usa caneta para emagrecer?" em "Histórico de saúde" (etapa 4 de 8): captura extra, como no web.
  {
    key: "anamnese-etapa-caneta",
    time: AFTERNOON,
    state: () => anamneseStepState(3),
    route: "/anamnese",
    ready: heading("Histórico de saúde"),
  },
  { key: "anamnese-plano", time: AFTERNOON, state: anamnesePlanState, route: "/anamnese", ready: heading(/Seu plano inicial/) },
  { key: "evolucao", time: AFTERNOON, state: main, route: "/evolucao", ready: text(/Sua jornada/i) },
  { key: "seringa", time: AFTERNOON, state: main, route: "/injecao", ready: text("Minha dose de sempre") },
  { key: "espaco", time: AFTERNOON, state: main, route: "/espaco", ready: text("Minhas metas diárias") },
];

// ---------- Entrada ----------

function fail(message) {
  console.error(message);
  process.exit(1);
}
if (!existsSync(path.join(target, "index.html"))) fail(`Sem export web em ${target} (rode o expo export antes).`);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail(`PORT inválida: ${process.env.PORT}`);
const unknown = ONLY_KEYS.filter((key) => !SCENES.some((scene) => scene.key === key));
if (unknown.length) fail(`Chave(s) desconhecida(s) em ONLY: ${unknown.join(", ")}. Válidas: ${SCENES.map((s) => s.key).join(", ")}`);
mkdirSync(OUT, { recursive: true });

// ---------- Servidor do export (o mesmo dos *-check.mjs) ----------

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
    res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});

// ---------- Estado no SQLite do navegador (o mesmo mecanismo dos *-check.mjs) ----------

const seedsDir = mkdtempSync(path.join(os.tmpdir(), "concepts-rn-seed-"));
let seeds = 0;

/** Banco do kv-store do expo-sqlite com o estado na chave do app. */
function seedFile(state) {
  const file = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run(STORAGE_KEY, JSON.stringify(state));
  db.close();
  return file;
}

/**
 * A primeira visita cria o arquivo do kv-store no OPFS (primeiro acesso); numa página vazia, o banco
 * de teste substitui o conteúdo dele, mantendo o cabeçalho de 4096 bytes do arquivo.
 */
async function seed(page, state) {
  const file = seedFile(state);
  await page.goto(url);
  await page.getByRole("button", { name: "Personalizar alimentação", exact: true }).waitFor({ timeout: BOOT_TIMEOUT_MS });
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
  }, [...readFileSync(file)]);
}

// ---------- Cena ----------

const log = [];

/** Celular de 390 px, como no capture-concepts.ts. */
const PHONE = {
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
  timezoneId: TIME_ZONE,
};

/** Relógio fixo no dia dos conceitos, a API simulada, o estado da cena e a tela aberta pela rota. */
async function openScene(page, scene) {
  page.on("pageerror", (error) => log.push(`${scene.key}: pageerror ${error.message}`));
  await page.clock.setFixedTime(new Date(`${CONCEPT_DAY}T${scene.time}:00${OFFSET}`));
  // A última rota registrada vence: toda a API recusada (sem IA), menos o estado do servidor.
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.route("**/api/status", (route) => route.fulfill({ json: STATUS, headers: CORS }));
  await seed(page, scene.state());
  await page.goto(url + scene.route);
  await scene.ready(page).waitFor({ timeout: BOOT_TIMEOUT_MS });
  await page.addStyleTag({ content: ALWAYS_CSS });
}

/** Áreas roláveis visíveis (a tela do RN rola dentro de uma ScrollView, não no documento). */
const scrollAreas = () =>
  [...document.querySelectorAll("body *")].filter((el) => {
    if (!el.getClientRects().length) return false;
    const { overflowY } = getComputedStyle(el);
    return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
  });

async function scrollTop(page) {
  await page.evaluate(`(${scrollAreas})().forEach((el) => { el.scrollTop = 0; })`);
  await page.waitForTimeout(SCROLL_MS);
}

/**
 * Quanto falta rolar nas áreas mais externas: uma lista de altura fixa dentro da tela não estica a
 * página (senão cada volta somaria o transbordo dela como espaço em branco).
 */
const OVERFLOW = `(() => {
  const areas = (${scrollAreas})();
  const outer = areas.filter((el) => !areas.some((other) => other !== el && other.contains(el)));
  return Math.max(0, ...outer.map((el) => el.scrollHeight - el.clientHeight));
})()`;

/** Estica a janela até a rolagem da tela caber inteira; devolve a altura final e o que sobrou rolável. */
async function stretch(page) {
  let height = H;
  let leftover = await page.evaluate(OVERFLOW);
  for (let i = 0; i < MAX_STRETCHES && leftover > 1; i++) {
    height += Math.ceil(leftover);
    await page.setViewportSize({ width: W, height });
    await page.waitForTimeout(STRETCH_MS);
    leftover = await page.evaluate(OVERFLOW);
  }
  return { height, leftover };
}

/** Página inteira: sem a barra de abas (a que tem o "Registro rápido"), a janela do tamanho do conteúdo. */
async function shootFull(page, file) {
  await scrollTop(page);
  const style = await page.addStyleTag({ content: FULL_PAGE_CSS });
  await page.evaluate(() => {
    for (const fab of document.querySelectorAll('[aria-label="Registro rápido"]'))
      fab.closest('[role="tablist"]')?.setAttribute("data-capture-hide", "");
  });
  await page.waitForTimeout(SCROLL_MS);
  const size = await stretch(page);
  await page.screenshot({ path: file, animations: "disabled" });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-capture-hide]")) el.removeAttribute("data-capture-hide");
  });
  await style.evaluate((node) => node.remove());
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(SCROLL_MS);
  return size;
}

/**
 * Primeira tela (com a barra de abas) e página inteira (sem ela), mais o texto visível para contar
 * palavras. A primeira tela parte do topo, exceto no agente, que abre na última mensagem.
 */
async function shoot(page, scene) {
  const { key } = scene;
  await page.waitForTimeout(SETTLE_MS);
  if (!scene.keepFocus) await page.evaluate(() => document.activeElement?.blur?.());
  if (!scene.opensAtEnd) await scrollTop(page);
  await page.screenshot({ path: path.join(OUT, `${key}-fold.png`), animations: "disabled" });
  const { height, leftover } = await shootFull(page, path.join(OUT, `${key}.png`));
  const content = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n"));
  writeFileSync(path.join(OUT, `${key}.txt`), content);
  // Depuração: PROBE é uma expressão JS avaliada na página; o resultado vai para <key>-probe.json.
  if (process.env.PROBE) writeFileSync(path.join(OUT, `${key}-probe.json`), JSON.stringify(await page.evaluate(process.env.PROBE), null, 1));
  const words = content.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  log.push(`${key}: altura ${height}px, ${words} palavras`);
  // Nada pode passar da largura da tela (rolagem lateral): avisa o primeiro elemento que passa.
  const side = await page.evaluate(() => {
    // Conteúdo de uma faixa que desliza de lado (ou é cortada) pode passar da borda: só o que escapa conta.
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || clipped(el)) continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  });
  if (side) log.push(`AVISO ${key}: passa da largura (${W}px): ${side}`);
  // A página inteira ficou cortada (o conteúdo cresce com a janela): avisa em vez de passar por completa.
  if (leftover > 1) log.push(`AVISO ${key}: ${Math.ceil(leftover)}px ainda roláveis na página inteira`);
}

/** Fotos antigas da chave saem antes: uma cena que falha nunca deixa a captura anterior passar por atual. */
function clearKey(key) {
  for (const suffix of [".png", "-fold.png", ".txt", "-erro.png"]) rmSync(path.join(OUT, key + suffix), { force: true });
}

async function capture(browser, scene) {
  clearKey(scene.key);
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  try {
    await openScene(page, scene);
    if (scene.open) await scene.open(page);
    await shoot(page, scene);
    return true;
  } catch (error) {
    log.push(`FALHOU ${scene.key}: ${String(error?.message ?? error).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, `${scene.key}-erro.png`) }).catch(() => undefined);
    return false;
  } finally {
    await context.close();
  }
}

// ---------- Execução ----------

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
} catch (error) {
  rmSync(seedsDir, { recursive: true, force: true });
  fail(`Não foi possível servir o export na porta ${PORT} (use outra PORT): ${error.message}`);
}
let browser;
let failures = 0;
try {
  browser = await chromium.launch({ channel: CHANNEL || undefined });
  for (const scene of SCENES.filter((s) => !ONLY || ONLY.includes(s.key))) {
    if (!(await capture(browser, scene))) failures++;
  }
} finally {
  await browser?.close();
  server.close();
  rmSync(seedsDir, { recursive: true, force: true });
  writeFileSync(path.join(OUT, "_log.txt"), log.join("\n"));
  console.log(log.join("\n"));
  console.log(`Fotos em ${OUT}`);
}
if (failures) process.exit(1);
