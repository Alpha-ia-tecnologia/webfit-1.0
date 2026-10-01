// Capturas "agora" das 11 telas que têm conceito na proposta visual, com o estado dos conceitos
// (concept-state.ts) e o relógio do navegador no dia deles (qui, 24 set 2026), a 390 px:
// <chave>.png (página inteira, sem a barra de abas fixa) e <chave>-fold.png (primeira tela, 390×844).
// Uso, com o servidor de produção em execução e sem chave de IA (nenhuma chamada ao modelo):
//   BASE=http://127.0.0.1:3150 OUT=<pasta> node --import tsx scripts/ux-audit/capture-concepts.ts
// AI_READY=0 mostra o app como sem provedor configurado; o padrão responde "pronto" só em /api/status
// (o app fica "Online", como com a chave configurada) e /api/agent é bloqueado.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { AppState } from "../../src/types";
import {
  anamnesePlanState,
  anamneseStepState,
  CONCEPT_DAY,
  conceptState,
} from "./concept-state";

const BASE = process.env.BASE ?? "http://127.0.0.1:3150";
const OUT = process.env.OUT ?? "test-results/ux-audit/concepts";
const CHANNEL = process.env.CHANNEL ?? "chrome";
const AI_READY = process.env.AI_READY !== "0";
/** Largura da tela (padrão 390, a dos conceitos); WIDTH=320 confere telas estreitas. */
const W = Number(process.env.WIDTH || 390);
const H = 844;
const TIME_ZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";
/** Horário padrão das capturas: "fim de tarde" do cartão Resumo do conceito Hoje. */
const AFTERNOON = "17:20";
const SETTLE_MS = 1500;
const SCROLL_MS = 300;
/** Barras fixas: na página inteira, a de abas sai e as de ação voltam ao fluxo (senão cobrem o meio). */
const FULL_PAGE_CSS = `
  .navigation { display: none !important; }
  .meal-tray, .inj-bar, .agent-screen .chat-dock, .anamnese-form-footer { position: static !important; }
`;
/** Avisos passageiros não fazem parte da tela. */
const ALWAYS_CSS = ".toast { display: none !important; }";

mkdirSync(OUT, { recursive: true });
const log: string[] = [];

type Scene = {
  key: string;
  time: string;
  state: () => AppState;
  /** Leva da tela inicial até a tela do conceito e espera ela aparecer. */
  open: (page: Page) => Promise<void>;
  /** A tela abre rolada até o fim (o agente abre na última mensagem). */
  opensAtEnd?: boolean;
  /** Mantém o foco (o Registro fica com a busca ativa, como no conceito). */
  keepFocus?: boolean;
};

async function seed(page: Page, state: AppState) {
  await page.goto(BASE + "/");
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, state);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/** Contexto de celular com o relógio fixo no dia dos conceitos e a IA sem chamadas reais. */
async function openScene(browser: Browser, scene: Scene) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    timezoneId: TIME_ZONE,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log.push(`${scene.key}: pageerror ${e.message}`));
  await page.clock.setFixedTime(new Date(`${CONCEPT_DAY}T${scene.time}:00${OFFSET}`));
  await page.route("**/api/agent", (route) => route.abort());
  if (AI_READY)
    await page.route("**/api/status", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ json: { ...body, ready: true, providers: { deepseek: false, openai: true } } });
    });
  await seed(page, scene.state());
  await page.addStyleTag({ content: ALWAYS_CSS });
  return { ctx, page };
}

const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true }).click();

async function home(page: Page) {
  await page.getByRole("heading", { name: /^Olá,/ }).first().waitFor({ timeout: 15000 });
}

const scrollTop = async (page: Page) => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(SCROLL_MS);
};

/**
 * Primeira tela (com a barra de abas) e página inteira (sem ela), mais o texto visível para contar
 * palavras. A primeira tela é a que a pessoa vê ao abrir: o topo, exceto no agente, que abre na
 * última mensagem. A página inteira sempre parte do topo (o cabeçalho fixo fica no alto).
 */
async function shoot(page: Page, scene: Scene) {
  const { key } = scene;
  // Telas carregadas sob demanda rolam ou mudam depois de aparecer: espera antes de medir.
  await page.waitForTimeout(SETTLE_MS);
  if (!scene.keepFocus) await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // O ponteiro fica num canto vazio: um :hover da última interação não pinta nenhuma linha na foto.
  await page.mouse.move(0, 0);
  if (!scene.opensAtEnd) await scrollTop(page);
  await page.screenshot({ path: `${OUT}/${key}-fold.png`, animations: "disabled" });
  await scrollTop(page);
  const style = await page.addStyleTag({ content: FULL_PAGE_CSS });
  await page.waitForTimeout(SCROLL_MS);
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: true, animations: "disabled" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await style.evaluate((node) => (node as Element).remove());
  const text = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n"));
  writeFileSync(`${OUT}/${key}.txt`, text);
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  log.push(`${key}: altura ${height}px, ${words} palavras`);
}

/** Jantar com feijão e arroz integral no prato, a busca "arroz" aberta e o arroz em "Seus frequentes". */
async function openMealWithPlate(page: Page) {
  await home(page);
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Buscar alimento" });
  await search.waitFor();
  await search.fill("feijão");
  await page.getByRole("button", { name: "Adicionar Feijão, carioca, cozido" }).first().click();
  await search.fill("arroz");
  await page.getByRole("button", { name: "Adicionar Arroz, integral, cozido" }).first().click();
  await page.waitForTimeout(400);
  await search.focus();
}

/** Abre a tela pela navegação do app e espera um texto do conteúdo (as telas carregam sob demanda). */
const via =
  (go: (page: Page) => Promise<void>, content: string | RegExp) =>
  async (page: Page) => {
    await home(page);
    await go(page);
    await page.getByText(content).first().waitFor({ timeout: 15000 });
  };
const tab = (name: string) => (page: Page) => nav(page, name);
const button = (name: string | RegExp) => (page: Page) =>
  page.getByRole("button", { name }).first().click();
/** Anamnese em andamento: abre direto na etapa gravada no rascunho. */
const step = (title: string | RegExp) => async (page: Page) => {
  await page.getByRole("heading", { name: title }).first().waitFor({ timeout: 15000 });
};

const main = conceptState;
const SCENES: Scene[] = [
  { key: "hoje", time: AFTERNOON, state: main, open: home },
  { key: "registro", time: "19:31", state: main, open: openMealWithPlate, keepFocus: true },
  { key: "diario", time: AFTERNOON, state: main, open: via(tab("Diário"), /registros neste dia/) },
  { key: "dieta", time: AFTERNOON, state: main, open: via(button(/Ver minha dieta/), "Seu plano de refeições") },
  {
    key: "agente",
    time: "18:14",
    state: main,
    open: via(tab("Meu agente"), "Jantares rápidos"),
    opensAtEnd: true,
  },
  {
    key: "despensa",
    time: AFTERNOON,
    state: main,
    open: via(button("Abrir despensa e receitas"), "Frango ao forno com legumes"),
  },
  // "Tem algum diagnóstico?" fica hoje em "Cuidados importantes" (etapa 2 de 8)…
  { key: "anamnese-etapa", time: AFTERNOON, state: () => anamneseStepState(1), open: step("Cuidados importantes") },
  // …e "Usa caneta para emagrecer?" em "Histórico de saúde" (etapa 4 de 8): captura extra.
  {
    key: "anamnese-etapa-caneta",
    time: AFTERNOON,
    state: () => anamneseStepState(3),
    open: step("Histórico de saúde"),
  },
  { key: "anamnese-plano", time: AFTERNOON, state: anamnesePlanState, open: step(/Seu plano inicial/) },
  { key: "evolucao", time: AFTERNOON, state: main, open: via(tab("Evolução"), /Sua jornada/i) },
  { key: "seringa", time: AFTERNOON, state: main, open: via(button("Calcular dose e registrar"), "Minha dose de sempre") },
  { key: "espaco", time: AFTERNOON, state: main, open: via(tab("Meu espaço"), "Minhas metas diárias") },
];

const only = process.env.ONLY?.split(",").filter(Boolean);
const browser = await chromium.launch({ channel: CHANNEL || undefined });
try {
  for (const scene of SCENES.filter((s) => !only || only.includes(s.key))) {
    const { ctx, page } = await openScene(browser, scene);
    try {
      await scene.open(page);
      await shoot(page, scene);
      // Depuração: PROBE é uma expressão JS avaliada na página; o resultado vai para <key>-probe.json.
      if (process.env.PROBE)
        writeFileSync(`${OUT}/${scene.key}-probe.json`, JSON.stringify(await page.evaluate(process.env.PROBE), null, 1));
    } catch (e) {
      log.push(`FALHOU ${scene.key}: ${(e as Error).message.split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/${scene.key}-erro.png` }).catch(() => undefined);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${OUT}/_log.txt`, log.join("\n"));
  console.log(log.join("\n"));
}
