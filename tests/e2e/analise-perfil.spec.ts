import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { REPLY_META } from "../structured-fixtures";
import { renderChatText, type ChatSection } from "../../src/lib/agent-blocks";
import {
  PROFILE_ANALYSIS_REQUEST,
  PROFILE_REPORT_LABELS,
  PROFILE_REPORT_TITLES,
} from "../../src/lib/agent-presentation";
import type { AgentReply, AppState, Profile } from "../../src/types";

/**
 * "Analisar meu perfil" (Meu agente, "+"): envia o pedido pronto pelo modo chat, a conversa
 * mostra só o aviso "Você pediu uma análise do seu perfil" e a resposta, quando vem na estrutura
 * pedida (síntese + 4 listas + sugestões), vira o cartão-relatório; fora da estrutura, texto.
 * Sem consentimento ou sem conexão o item fica desabilitado e nada é enviado.
 */

type AgentRequest = { mode: string; text: string };

const list = (titulo: string, itens: string[]) => ({
  tipo: "lista" as const,
  titulo,
  ordenada: false,
  itens,
});
const SUMMARY = "Boa constância nos registros; vale um ajuste no lanche da tarde.";
const REPORT_SECTIONS: ChatSection[] = [
  {
    papel: null,
    blocos: [
      { tipo: "texto", texto: SUMMARY },
      list(PROFILE_REPORT_TITLES.well, ["Registros em 6 de 7 dias", "Água perto da meta"]),
      list(PROFILE_REPORT_TITLES.attention, ["Proteína baixa no café da manhã", "Sono curto em 3 noites"]),
      list(PROFILE_REPORT_TITLES.suggestions, ["Ovos ou iogurte no café", "Feijão e frango no almoço"]),
      list(PROFILE_REPORT_TITLES.talk, ["Cansaço à tarde nos últimos dias"]),
      { tipo: "sugestoes", itens: ["Quero ideias de café da manhã", "Como dormir melhor?"] },
    ],
  },
];
const REPORT_REPLY: AgentReply = {
  text: renderChatText(REPORT_SECTIONS[0].blocos),
  meta: REPLY_META,
  structured: { kind: "chat", sections: REPORT_SECTIONS },
};
const TEXT_REPLY: AgentReply = {
  text: "Você registra as refeições com regularidade e prefere comida caseira.",
  meta: REPLY_META,
};

/** /api/status pronto (ou não) e /api/agent em NDJSON, com os pedidos contados. */
async function mockApi(page: Page, reply: AgentReply, ready = true) {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready, token: "analise-e2e-token" } }),
  );
  await page.route("**/api/agent", (route: Route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "stage", stage: "contexto", attempt: 1 })}\n${JSON.stringify({ type: "result", reply })}\n`,
    });
  });
  return requests;
}

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "Personalizar alimentação", exact: true })
      .or(page.getByRole("heading", { name: "Olá, Pessoa." })),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("webfit-personal-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
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
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
}

function stateWith(changes: Partial<Profile>): AppState {
  const state = stateFixture();
  state.profile = { ...state.profile!, ...changes };
  return state;
}

async function openChat(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu agente", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem para o agente")).toBeVisible();
}

const analyzeItem = (page: Page) =>
  page.getByRole("menuitem", { name: "Analisar meu perfil", exact: true });

async function analyze(page: Page) {
  await page.getByRole("button", { name: "Mais opções do chat", exact: true }).click();
  await expect(analyzeItem(page)).toBeEnabled();
  await analyzeItem(page).click();
}

test("Analisar meu perfil envia o pedido pronto e a resposta na estrutura vira o cartão-relatório", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockApi(page, REPORT_REPLY);
  await seed(page, stateWith({ consentAi: true }));
  await openChat(page);
  // O rascunho da pessoa não se perde com o pedido pronto.
  await page.getByLabel("Mensagem para o agente").fill("Rascunho meu");
  await analyze(page);

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ mode: "chat", text: PROFILE_ANALYSIS_REQUEST });
  await expect(page.getByTestId("profile-request")).toContainText(
    "Você pediu uma análise do seu perfil",
  );
  // O texto técnico do pedido não aparece como bolha na conversa.
  await expect(page.getByText(PROFILE_ANALYSIS_REQUEST)).toHaveCount(0);
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue("Rascunho meu");

  // Cartão: selo com a hora, a síntese como título, a 1ª seção aberta e as outras recolhidas.
  const card = page.getByTestId("report-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Análise do perfil\s*· \d{2}:\d{2}/);
  await expect(card.getByRole("heading", { name: SUMMARY, exact: true })).toBeVisible();
  await expect(card.getByText("Registros em 6 de 7 dias", { exact: true })).toBeVisible();
  await expect(card.getByText("Proteína baixa no café da manhã", { exact: true })).toBeHidden();
  await expect(card.getByText("Ovos ou iogurte no café", { exact: true })).toBeHidden();
  // Rótulos curtos no cartão (os títulos longos do pedido nunca aparecem).
  for (const label of Object.values(PROFILE_REPORT_LABELS))
    await expect(card.getByText(label, { exact: true })).toBeVisible();
  await expect(card.getByText(PROFILE_REPORT_TITLES.suggestions, { exact: true })).toHaveCount(0);
  // A resposta em markdown cru não aparece: só o cartão.
  await expect(page.getByText(`**${PROFILE_REPORT_TITLES.well}**`)).toHaveCount(0);
  await expect(page.getByTestId("chat-blocks")).toHaveCount(0);

  // Abrir "Atenção" e "Sugestões": itens com ponto e chips.
  await card.getByText(PROFILE_REPORT_LABELS.attention, { exact: true }).click();
  await expect(card.getByText("Proteína baixa no café da manhã", { exact: true })).toBeVisible();
  await card.getByText(PROFILE_REPORT_LABELS.suggestions, { exact: true }).click();
  await expect(card.locator(".report-chip")).toHaveText([
    "Ovos ou iogurte no café",
    "Feijão e frango no almoço",
  ]);
  await expect(card.locator(".report-items li").first()).toHaveCSS("font-size", "13px");
  await expect(card).toContainText("Revisada automaticamente · apoio educativo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // As próximas perguntas são respostas rápidas: tocar envia.
  await page
    .getByRole("group", { name: "Sugestões do agente", exact: true })
    .getByRole("button", { name: "Como dormir melhor?", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ mode: "chat", text: "Como dormir melhor?" });
});

test("resposta fora da estrutura segue como texto, sem cartão", async ({ page }) => {
  const requests = await mockApi(page, TEXT_REPLY);
  await seed(page, stateWith({ consentAi: true }));
  await openChat(page);
  await analyze(page);
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByTestId("profile-request")).toBeVisible();
  await expect(page.getByText(TEXT_REPLY.text)).toBeVisible();
  await expect(page.getByTestId("report-card")).toHaveCount(0);
});

test("Analisar meu perfil fica desabilitado sem consentimento ou sem conexão", async ({ page }) => {
  for (const [consentAi, ready] of [
    [false, true],
    [true, false],
  ] as const) {
    await page.unrouteAll();
    const requests = await mockApi(page, REPORT_REPLY, ready);
    await seed(page, stateWith({ consentAi }));
    await openChat(page);
    await page.getByRole("button", { name: "Mais opções do chat", exact: true }).click();
    await expect(analyzeItem(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    expect(requests).toHaveLength(0);
  }
});
