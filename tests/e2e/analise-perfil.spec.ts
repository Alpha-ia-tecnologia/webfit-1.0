import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { REPLY_META } from "../structured-fixtures";
import { PROFILE_ANALYSIS_REQUEST } from "../../src/lib/agent-presentation";
import type { AgentReply, AppState, Profile } from "../../src/types";

/**
 * "Analisar meu perfil" (Meu agente, "+"): envia o pedido pronto pelo modo chat, a conversa
 * mostra só o aviso "Você pediu uma análise do seu perfil" e a resposta chega como texto.
 * Sem consentimento ou sem conexão o item fica desabilitado e nada é enviado.
 */

type AgentRequest = { mode: string; text: string };

const ANALYSIS_REPLY: AgentReply = {
  text: "Você registra as refeições com regularidade e prefere comida caseira.",
  meta: REPLY_META,
};

/** /api/status pronto (ou não) e /api/agent em NDJSON, com os pedidos contados. */
async function mockApi(page: Page, ready = true) {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready, token: "analise-e2e-token" } }),
  );
  await page.route("**/api/agent", (route: Route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "stage", stage: "contexto", attempt: 1 })}\n${JSON.stringify({ type: "result", reply: ANALYSIS_REPLY })}\n`,
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

test("Analisar meu perfil envia o pedido pronto no modo chat e mostra só o aviso", async ({ page }) => {
  const requests = await mockApi(page);
  await seed(page, stateWith({ consentAi: true }));
  await openChat(page);
  // O rascunho da pessoa não se perde com o pedido pronto.
  await page.getByLabel("Mensagem para o agente").fill("Rascunho meu");
  await page.getByRole("button", { name: "Mais opções do chat", exact: true }).click();
  await expect(analyzeItem(page)).toBeEnabled();
  await analyzeItem(page).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ mode: "chat", text: PROFILE_ANALYSIS_REQUEST });
  await expect(page.getByTestId("profile-request")).toContainText(
    "Você pediu uma análise do seu perfil",
  );
  await expect(page.getByText(ANALYSIS_REPLY.text)).toBeVisible();
  // O texto técnico do pedido não aparece como bolha na conversa.
  await expect(page.getByText(PROFILE_ANALYSIS_REQUEST)).toHaveCount(0);
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue("Rascunho meu");
});

test("Analisar meu perfil fica desabilitado sem consentimento ou sem conexão", async ({ page }) => {
  for (const [consentAi, ready] of [
    [false, true],
    [true, false],
  ] as const) {
    await page.unrouteAll();
    const requests = await mockApi(page, ready);
    await seed(page, stateWith({ consentAi }));
    await openChat(page);
    await page.getByRole("button", { name: "Mais opções do chat", exact: true }).click();
    await expect(analyzeItem(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    expect(requests).toHaveLength(0);
  }
});
