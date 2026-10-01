import { test, expect, type Page, type Route } from "@playwright/test";
import { profileFixture, stateFixture } from "../fixtures";
import {
  CHAT_REPLY,
  CHAT_REPLY_INVALID,
  CHAT_REPLY_KCAL,
  CHAT_REPLY_SENSITIVE_LEAK,
  DIET_PLAN_V2,
  DIET_REPLY,
  DIET_REPLY_KCAL,
  DIET_REPLY_SENSITIVE,
  PHOTO_REPLY,
  REPLY_META,
} from "../structured-fixtures";
import { createDietPlan } from "../../src/lib/diet";
import { initialState, localDate } from "../../src/lib/domain";
import type { AgentReply, AppState, Profile } from "../../src/types";
import { ANAMNESE_FINISH_LABEL, DESPENSA_TITLE } from "../../src/lib/copy";

/**
 * IA estruturada (Onda 2 · Lote 6): blocos do chat (SIS-02), dieta estruturada (AGENTE-02) e
 * rascunho da foto do prato (DIARIO-04). O /api/agent é simulado em NDJSON com as respostas de
 * tests/structured-fixtures.ts; nada é registrado sem a pessoa tocar em Salvar.
 */

type AgentRequest = { mode: string; text: string; file?: string };

const TEXT_REPLY: AgentReply = {
  text: "Frutas com iogurte formam um lanche simples.",
  meta: REPLY_META,
};
const PHOTO = {
  name: "prato.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};
/** 10:40 de hoje: o café (07:30) já passou da janela e o almoço (12:00) é daqui a 1 h 20 min. */
const MORNING = `${localDate()}T10:40:00`;

function fulfillReply(route: Route, reply: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    body: `${JSON.stringify({ type: "stage", stage: "contexto", attempt: 1 })}\n${JSON.stringify({ type: "result", reply })}\n`,
  });
}

/** Simula o agente: cada pedido recebe a resposta devolvida por `reply` (na ordem dos pedidos). */
async function mockAgent(page: Page, reply: (request: AgentRequest, index: number) => unknown) {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true, token: "structured-e2e-token" } }),
  );
  await page.route("**/api/agent", (route) => {
    const body = route.request().postDataJSON() as AgentRequest;
    requests.push(body);
    return fulfillReply(route, reply(body, requests.length - 1));
  });
  return requests;
}

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, state);
  await Promise.all([page.waitForResponse("**/api/status"), page.reload()]);
  await expect(
    page.getByRole("heading", {
      name: state.profile ? "Olá, Pessoa." : "Revise sua anamnese",
      exact: true,
    }),
  ).toBeVisible();
}

async function savedState(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const req = indexedDB.open("webfit-personal-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("state", "readonly");
          const value = tx.objectStore("state").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(value.result as AppState);
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

function readyState(changes: Partial<Profile> = {}): AppState {
  const state = stateFixture();
  state.profile = { ...state.profile!, consentAi: true, ...changes };
  return state;
}

/** Perfil com dieta estruturada já salva (atual: mesma assinatura do perfil). */
function stateWithDiet(reply: AgentReply, changes: Partial<Profile> = {}): AppState {
  const state = readyState(changes);
  state.dietPlan = createDietPlan(reply, state.profile!);
  return state;
}

async function openChat(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu agente", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem para o agente")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByLabel("Mensagem para o agente").fill(text);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("chat por blocos: opções com estimativa TACO, gráfico local, combinado com desfazer e sugestões", async ({
  page,
}) => {
  const requests = await mockAgent(page, (_, index) => (index === 0 ? CHAT_REPLY : TEXT_REPLY));
  await seed(page, readyState());
  const habitsBefore = (await savedState(page)).habits.length;
  await openChat(page);
  await ask(page, "Ideias de jantar?");

  const blocks = page.getByTestId("chat-blocks");
  await expect(blocks).toBeVisible();
  // Opções em cartões selecionáveis (conceito 05): a primeira já marcada, kcal e proteína da TACO.
  const options = page.getByTestId("meal-options");
  await expect(options).toHaveAccessibleName("Opções de jantar");
  const cards = options.getByRole("radio");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeChecked();
  const estimate = options.getByTestId("macro-estimate").first();
  await expect(estimate).toBeVisible();
  await expect(estimate).toContainText("Estimativa TACO");
  // Os números exatos da estimativa ficam em tests/taco-match.test.ts: importar taco-match aqui traria o
  // foods.json por import, que o carregador do Playwright recusa no Node 24 (como no registro.spec).
  await expect(estimate).toContainText(/\d[\d.]* kcal/);
  await expect(estimate).toContainText(/\d[\d,]* g prot\./);
  await expect(blocks.getByRole("list", { name: "O que considerei" })).toContainText("Sem amendoim");
  await expect(blocks.getByRole("img", { name: /^Água por dia/ })).toBeVisible();

  // Combinado proposto: só entra quando a pessoa confirma, e pode ser desfeito. Um duplo toque
  // no mesmo tique (antes de qualquer render) grava uma vez só: uma revisão, um combinado.
  await expect.poll(async () => (await savedState(page)).messages.length).toBe(2);
  const revisionBefore = (await savedState(page)).revision;
  await page
    .getByRole("button", { name: "Criar combinado: Beber água ao acordar" })
    .evaluate((button: HTMLElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText("Combinado criado.", { exact: true })).toBeVisible();
  await expect(page.getByText("Já está nos seus combinados")).toBeFocused();
  await expect
    .poll(async () => (await savedState(page)).habits.map((h) => h.title))
    .toContain("Beber água ao acordar");
  const created = await savedState(page);
  expect(created.revision).toBe(revisionBefore + 1);
  expect(created.habits.filter((h) => h.title === "Beber água ao acordar")).toHaveLength(1);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect
    .poll(async () => (await savedState(page)).habits.length)
    .toBe(habitsBefore);
  await expect(
    page.getByRole("button", { name: "Criar combinado: Beber água ao acordar" }),
  ).toBeVisible();

  const saved = await savedState(page);
  expect(saved.messages[1]).toMatchObject({ sender: "ai", text: CHAT_REPLY.text });
  expect(saved.messages[1].blocks).toEqual(
    CHAT_REPLY.structured?.kind === "chat" ? CHAT_REPLY.structured.sections : null,
  );
  expect(requests[0].mode).toBe("chat");

  // Depois de recarregar, os blocos continuam desenhados a partir do que foi salvo.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await openChat(page);
  await expect(page.getByTestId("chat-blocks")).toBeVisible();
  await expect(page.getByTestId("meal-options")).toBeVisible();
  expect(await fitsWidth(page)).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await fitsWidth(page)).toBe(true);

  // Sugestão de próxima pergunta: envia o próprio texto do chip.
  await page.setViewportSize({ width: 1365, height: 950 });
  await page
    .getByRole("group", { name: "Sugestões do agente" })
    .getByRole("button", { name: "Quero ideias de lanche", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ mode: "chat", text: "Quero ideias de lanche" });
  await expect(page.getByText(TEXT_REPLY.text, { exact: true })).toBeVisible();
  // Os chips só aparecem na última resposta.
  await expect(page.getByRole("group", { name: "Sugestões do agente" })).toHaveCount(0);
});

test("chat: a opção escolhida vai para Seus pratos e 'Registrar no jantar' abre o prato sem salvar", async ({
  page,
}) => {
  await mockAgent(page, () => CHAT_REPLY);
  await seed(page, readyState());
  await openChat(page);
  await ask(page, "Ideias de jantar?");
  // Escolher outra opção muda o botão único; voltar para a primeira também.
  await page.getByRole("radio", { name: /^Cuscuz com ovo/ }).check();
  await expect(
    page.getByRole("button", { name: /^Registrar no jantar: Cuscuz com ovo$/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Frango com arroz e salada/ }).check();
  await page
    .getByRole("button", { name: "Salvar Frango com arroz e salada em Seus pratos", exact: true })
    .click();
  await expect(page.getByText("Salvo em Seus pratos.", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await savedState(page)).savedMeals.map((m) => m.name))
    .toEqual(["Frango com arroz e salada"]);
  await page
    .getByRole("button", { name: /^Registrar no jantar: Frango com arroz e salada$/ })
    .click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Jantar, Hoje/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Seu prato · 3 itens", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".notice")
      .filter({ hasText: "Itens sugeridos no prato. Confira as porções e toque em Salvar refeição." }),
  ).toBeVisible();
  expect((await savedState(page)).diary).toHaveLength(0);
});

test("chat em perfil sensível: sem peso, prato em vez de macros, sem combinado de pesagem nem chip de perda de peso", async ({
  page,
}) => {
  await mockAgent(page, () => CHAT_REPLY_SENSITIVE_LEAK);
  await seed(page, readyState({ eatingDisorder: "sim" }));
  await openChat(page);
  await ask(page, "Ideias de jantar?");
  const blocks = page.getByTestId("chat-blocks");
  await expect(blocks).toBeVisible();
  await expect(blocks.getByText("Alimentação e hidratação", { exact: true })).toBeVisible();
  await expect(blocks.getByText("Rotina, sono e combinados", { exact: true })).toBeVisible();
  await expect(page.getByText("Peso nas últimas 8 semanas")).toHaveCount(0);
  await expect(blocks.getByText(/^Prato com/).first()).toBeVisible();
  await expect(page.getByTestId("macro-estimate")).toHaveCount(0);
  await expect(blocks).not.toContainText(/kcal/);
  await expect(
    page.getByRole("button", { name: "Criar combinado: Beber água ao acordar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar combinado: Pesar-se toda manhã" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Como perder peso rápido?" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Quero ideias de lanche", exact: true }),
  ).toBeVisible();
});

test("chat com calorias ocultas: pílula no texto e nenhum kcal em nomes, rótulos ou aria", async ({
  page,
}) => {
  await mockAgent(page, () => CHAT_REPLY_KCAL);
  await seed(page, readyState({ hideCalories: true }));
  await openChat(page);
  await ask(page, "Ideia de lanche?");
  const blocks = page.getByTestId("chat-blocks");
  await expect(blocks).toBeVisible();
  await expect(blocks.getByText("calorias ocultas", { exact: true }).first()).toBeVisible();
  await expect(blocks.getByRole("radio", { name: /^Prato de calorias ocultas/ })).toBeVisible();
  await expect(blocks).not.toContainText(/kcal/);
  await expect(page.getByText(/500 kcal/)).toHaveCount(0);
  await expect(page.locator('[aria-label*="kcal"]')).toHaveCount(0);
});

test("chat com blocos inválidos mostra a resposta em texto", async ({ page }) => {
  await mockAgent(page, () => CHAT_REPLY_INVALID);
  await seed(page, readyState());
  await openChat(page);
  await ask(page, "Olá");
  await expect(page.getByText(CHAT_REPLY_INVALID.text, { exact: true })).toBeVisible();
  await expect(page.getByTestId("chat-blocks")).toHaveCount(0);
  const saved = await savedState(page);
  expect(saved.messages[1]?.text).toBe(CHAT_REPLY_INVALID.text);
  expect(saved.messages[1]).not.toHaveProperty("blocks");
});

test("dieta estruturada: próxima refeição, linha do tempo com trocas, estimativas e 'Do seu plano' no Hoje", async ({
  page,
}) => {
  await page.clock.setFixedTime(MORNING);
  await mockAgent(page, () => DIET_REPLY);
  await seed(page, {
    ...initialState(),
    draft: { ...profileFixture(), consentAi: true },
    draftStep: 7,
  });
  await page.getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();

  const next = page.getByTestId("next-meal");
  await expect(next).toBeVisible();
  await expect(next.getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
  // O horário fica no trilho da linha do tempo, ao lado do cartão.
  await expect(page.getByTestId("diet-timeline").locator(":scope > li").nth(1)).toContainText("12:00");
  await expect(next.getByText("em 1 h 20 min", { exact: true })).toBeVisible();
  await expect(page.getByTestId("diet-timeline").locator(":scope > li")).toHaveCount(4);
  const swaps = page.getByRole("button", { name: "Trocar arroz branco cozido: 2 opções" });
  await expect(swaps).toHaveAttribute("aria-expanded", "false");
  await swaps.click();
  await expect(swaps).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("arroz integral cozido", { exact: true })).toBeVisible();
  // Almoço (a próxima, destacada na linha do tempo) e lanche da tarde têm cobertura TACO; café e jantar, não.
  await expect(page.getByTestId("macro-estimate")).toHaveCount(2);
  await expect(page.getByTestId("diet-plan-text")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver plano em texto", exact: true }).click();
  await expect(page.getByTestId("diet-plan-text")).toBeVisible();

  const saved = await savedState(page);
  expect(saved.dietPlan?.structured).toEqual(DIET_PLAN_V2);
  expect(saved.dietPlan?.text).toBe(DIET_REPLY.text);
  expect(saved.messages[1]?.text).toBe(DIET_REPLY.text);

  await page.getByRole("navigation").getByRole("button", { name: "Hoje", exact: true }).click();
  const card = page.getByTestId("plan-next-meal");
  await expect(card.getByRole("heading", { name: "Do seu plano", exact: true })).toBeVisible();
  await expect(card).toContainText("Próxima refeição · Almoço · 12:00 · em 1 h 20 min");
  await expect(page.getByRole("button", { name: "Ver minha dieta", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Conferir e registrar: Almoço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Almoço, Hoje/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Seu prato · 4 itens", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).diary).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await fitsWidth(page)).toBe(true);
});

test("dieta estruturada em perfil sensível: prato no lugar das macros, sem gramas e sem contagem regressiva", async ({
  page,
}) => {
  await page.clock.setFixedTime(MORNING);
  await mockAgent(page, () => TEXT_REPLY);
  await seed(page, stateWithDiet(DIET_REPLY_SENSITIVE, { eatingDisorder: "sim" }));
  const card = page.getByTestId("plan-next-meal");
  await expect(card).toContainText("Próxima refeição · Almoço · 12:00");
  await expect(page.getByText(/em 1 h 20 min/)).toHaveCount(0);
  await card.getByRole("button", { name: "Ver minha dieta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();
  await expect(page.getByTestId("next-meal")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Prato com/ }).first()).toBeVisible();
  await expect(page.getByTestId("macro-estimate")).toHaveCount(0);
  await expect(page.getByText(/em 1 h 20 min/)).toHaveCount(0);
  await page.getByRole("button", { name: "Ver plano em texto", exact: true }).click();
  await expect(page.getByTestId("diet-plan-text")).toBeVisible();
  await expect(page.getByText(/≈ \d+ g/)).toHaveCount(0);
});

test("plano salvo antes do perfil atual: troca alérgena ganha selo e o texto sensível sai sem gramas", async ({
  page,
}) => {
  await page.clock.setFixedTime(MORNING);
  await mockAgent(page, () => TEXT_REPLY);
  // O texto salvo traz "(≈ 100 g)" e a troca "lentilha cozida"; o perfil agora é sensível e alérgico a lentilha.
  expect(DIET_REPLY.text).toMatch(/≈ \d+ g/);
  await seed(
    page,
    stateWithDiet(DIET_REPLY, { eatingDisorder: "sim", allergyDetails: "Tenho alergia a lentilha" }),
  );
  await page
    .getByTestId("plan-next-meal")
    .getByRole("button", { name: "Ver minha dieta", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trocar feijão carioca cozido: 1 opção", exact: true }).click();
  const lentil = page.locator(".diet-swaps li", { hasText: "lentilha cozida" });
  await expect(lentil.getByText("Possível alérgeno", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trocar arroz branco cozido: 2 opções", exact: true }).click();
  await expect(
    page.locator(".diet-swaps li", { hasText: "batata cozida" }).getByText("Possível alérgeno"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver plano em texto", exact: true }).click();
  const text = page.getByTestId("diet-plan-text");
  await expect(text).toContainText("feijão carioca cozido");
  await expect(text).not.toContainText(/≈ \d+ g/);
});

test("dieta estruturada com calorias ocultas: dicas sem kcal em texto e aria", async ({
  page,
}) => {
  await page.clock.setFixedTime(MORNING);
  await mockAgent(page, () => TEXT_REPLY);
  await seed(page, stateWithDiet(DIET_REPLY_KCAL, { hideCalories: true }));
  await page.getByRole("button", { name: "Ver minha dieta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();
  await expect(
    page.getByText("Evite passar de calorias ocultas no lanche", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver plano em texto", exact: true }).click();
  await expect(
    page.getByTestId("diet-plan-text").getByText("calorias ocultas", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/500 kcal/)).toHaveCount(0);
  await expect(page.locator('[aria-label*="kcal"]')).toHaveCount(0);
});

test("foto do prato: rascunho com confiança, alérgeno desmarcado e itens adicionados ao prato", async ({
  page,
}) => {
  const requests = await mockAgent(page, () => PHOTO_REPLY);
  await seed(page, readyState());
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await page.getByLabel("Foto do prato", { exact: true }).setInputFiles(PHOTO);
  await expect(page.getByAltText("Foto da refeição a registrar")).toBeVisible();
  await page.getByRole("button", { name: "Pedir análise ao agente" }).click();
  const draft = page.getByTestId("photo-draft");
  await expect(draft).toBeVisible();
  expect(requests[0].mode).toBe("photo");
  await expect(draft.getByText("Confiança alta", { exact: true })).toBeVisible();
  const pacoca = draft.getByRole("listitem").filter({ hasText: "Paçoca" }).first();
  await expect(pacoca.getByText("Possível alérgeno", { exact: true })).toBeVisible();
  await expect(draft.getByLabel("Incluir Paçoca", { exact: true })).not.toBeChecked();
  await expect(draft.getByLabel("Incluir Arroz branco", { exact: true })).toBeChecked();
  await expect(draft.getByRole("group", { name: "Alimento da TACO para Feijão" })).toBeVisible();
  await draft.getByRole("button", { name: "Adicionar 2 à refeição", exact: true }).click();
  const plate = page.getByRole("heading", { name: "Seu prato · 2 itens", exact: true });
  await expect(plate).toBeVisible();
  await expect(plate).toBeFocused();
  await expect(page.getByAltText("Foto da refeição a registrar")).toBeVisible();
  expect((await savedState(page)).diary).toHaveLength(0);
});

test("chat '+': menu acima do botão, foto do prato com análise automática, despensa e exames", async ({
  page,
}) => {
  const requests = await mockAgent(page, (request) =>
    request.mode === "photo" ? PHOTO_REPLY : TEXT_REPLY,
  );
  await seed(page, readyState());
  const trigger = page.getByRole("button", { name: "Mais opções do chat", exact: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await openChat(page);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Mede depois da entrada (fade-up desloca o menu alguns pixels durante a animação).
    await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const menuBox = (await menu.boundingBox())!;
    const triggerBox = (await trigger.boundingBox())!;
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
    expect(await fitsWidth(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }

  // Foto do prato: vai para Registrar refeição e a análise é pedida sozinha.
  await trigger.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Foto do prato" }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect.poll(() => requests.filter((r) => r.mode === "photo").length).toBe(1);
  await expect(page.getByTestId("photo-draft")).toBeVisible();
  expect((await savedState(page)).messages).toHaveLength(0);

  await openChat(page);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Despensa" }).click();
  await expect(page.getByRole("heading", { name: DESPENSA_TITLE, exact: true, level: 1 })).toBeVisible();

  await openChat(page);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Exame" }).click();
  await expect(page.getByRole("heading", { name: "Meu espaço", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exames e consultas" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(requests.filter((r) => r.mode === "photo")).toHaveLength(1);
});
