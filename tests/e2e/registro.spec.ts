import { readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { MEAL_TEXT_REPLY, MEAL_TEXT_SOURCE, REPLY_META } from "../structured-fixtures";
import { domainTone, palette } from "../../src/design/tokens";
import { localDate, mealTotals } from "../../src/lib/domain";
import {
  diarySchema,
  type AgentReply,
  type AppState,
  type FoodItem,
  type Profile,
} from "../../src/types";

/**
 * Onda 4 · Lote 4 (web): "Descrever refeição" (DIARIO-07, modo "meal_text") e "Qualidade do dia"
 * (DIARIO-12). O /api/agent é simulado em NDJSON com as respostas de tests/structured-fixtures.ts;
 * nada é salvo sem a pessoa tocar em Salvar, e "Falta porção" pede confirmação antes.
 */

type AgentRequest = { mode: string; text: string; file?: string; history?: unknown[] };

const TACO = JSON.parse(readFileSync("src/data/foods.json", "utf8")) as FoodItem[];
const taco = (id: string) => TACO.find((food) => food.id === id)!;

const TEXT_REPLY: AgentReply = {
  text: "Arroz, feijão e frango parecem compor o almoço.",
  meta: REPLY_META,
};
const URGENT_REPLY: AgentReply = {
  text: "Mensagem automática de segurança: sua mensagem descreve uma situação que pode exigir atendimento imediato, e este aplicativo não consegue avaliar emergências. Procure agora um serviço de emergência ou ligue para o SAMU (192).",
  meta: { ...REPLY_META, urgency: "imediata", specialists: [], reviewed: false },
};

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
    route.fulfill({ json: { ready: true, token: "registro-e2e-token" } }),
  );
  await page.route("**/api/agent", (route) => {
    const body = route.request().postDataJSON() as AgentRequest;
    requests.push(body);
    return fulfillReply(route, reply(body, requests.length - 1));
  });
  return requests;
}

/** Grava o estado no IndexedDB e recarrega; vale no primeiro acesso e ao semear de novo no mesmo teste. */
async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "Personalizar alimentação", exact: true })
      .or(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })),
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
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
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

/** Almoço de hoje com arroz, feijão e frango da TACO (100 g cada): 3 dos 7 grupos. */
function lunchState(changes: Partial<Profile> = {}): AppState {
  const state = readyState(changes);
  const today = localDate();
  const items = ["taco-3", "taco-561", "taco-410"].map((id) => ({ food: taco(id), grams: 100 }));
  state.diary = [
    diarySchema.parse({
      id: "almoco",
      userId: state.userId,
      date: today,
      time: "12:00",
      createdAt: `${today}T12:00:00Z`,
      updatedAt: `${today}T12:00:00Z`,
      type: "refeicao",
      title: "Almoço",
      categoryTag: "Almoço",
      description: "Almoço",
      items,
      ...mealTotals(items),
    }),
  ];
  return state;
}

async function openMeal(page: Page) {
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
}

async function openDescribe(page: Page) {
  await page.getByRole("button", { name: /^Descrever/ }).click();
  const dialog = page.getByRole("dialog", { name: "Descrever refeição" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openDiary(page: Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Diário", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
}

const hasNoSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("descrever refeição: porção dita, alérgeno desmarcado e 'Falta porção' confirmado antes de salvar", async ({
  page,
}) => {
  const requests = await mockAgent(page, () => MEAL_TEXT_REPLY);
  await seed(page, readyState({ allergyDetails: "Amendoim" }));
  await openMeal(page);
  const dialog = await openDescribe(page);
  await dialog.getByLabel("O que você comeu?", { exact: true }).fill(MEAL_TEXT_SOURCE);
  await dialog.getByRole("button", { name: "Organizar itens", exact: true }).click();
  const draft = dialog.getByTestId("meal-text-draft");
  await expect(draft).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ mode: "meal_text", text: MEAL_TEXT_SOURCE, history: [] });
  expect(requests[0].file).toBeUndefined();

  await expect(draft.getByLabel("Incluir Paçoca no prato", { exact: true })).not.toBeChecked();
  await expect(draft.getByLabel("Incluir Arroz branco no prato", { exact: true })).toBeChecked();
  const row = (name: string) => draft.getByRole("listitem").filter({ hasText: name }).first();
  await expect(row("Paçoca").getByText("Possível alérgeno", { exact: true })).toBeVisible();
  await expect(row("Frango grelhado")).toContainText("Falta porção");
  await expect(row("Arroz branco")).toContainText("Porção dita: 4 colheres de sopa ≈ 100 g");
  await expect(draft).not.toContainText(/kcal|caloria/i);

  await draft.getByRole("button", { name: "Adicionar 3 ao prato", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const plate = page.getByRole("heading", { name: "Seu prato · 3 itens", exact: true });
  await expect(plate).toBeFocused();
  await expect(page.locator(".food-portion-flag")).toHaveCount(1);
  await expect(page.locator(".tray-pending")).toHaveText("Falta porção em 1 item");

  await page.getByRole("button", { name: "Salvar refeição", exact: true }).click();
  const confirmSheet = page.getByRole("dialog", { name: "Salvar com a porção padrão?" });
  await expect(confirmSheet).toContainText("Falta porção em Peito de frango sem pele.");
  await confirmSheet.getByRole("button", { name: "Conferir porções", exact: true }).click();
  await expect(confirmSheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect(plate).toBeFocused();
  expect((await savedState(page)).diary).toHaveLength(0);

  await page
    .getByRole("button", { name: "Manter porção de Peito de frango sem pele", exact: true })
    .click();
  await expect(page.locator(".food-portion-flag")).toHaveCount(0);
  await expect(page.locator(".tray-pending")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Aumentar Frango, peito, sem pele, grelhado", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Salvar refeição", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
  const saved = await savedState(page);
  expect(saved.diary).toHaveLength(1);
  const grams = Object.fromEntries((saved.diary[0].items ?? []).map((i) => [i.food.id, i.grams]));
  expect(grams).toEqual({ "taco-3": 100, "taco-561": 200, "taco-410": 100 });
});

test("descrever sem autorização: 'Organizar itens' desligado com o aviso e nada enviado; 320 px numa linha só", async ({
  page,
}) => {
  const requests = await mockAgent(page, () => MEAL_TEXT_REPLY);
  await seed(page, readyState({ consentAi: false }));
  await openMeal(page);
  await page.setViewportSize({ width: 320, height: 780 });
  // Conceito 02: Foto do prato (em destaque), Voz e Rótulo na mesma linha, acima da busca.
  const photo = (await page.locator(".capture-tile.photo").boundingBox())!;
  const label = (await page.getByRole("button", { name: /^Rótulo/ }).boundingBox())!;
  const voice = page.getByRole("button", { name: /^Descrever/ });
  await expect(voice).toHaveAccessibleName("Descrever por voz");
  await expect(voice).toContainText("Voz");
  const describe = (await voice.boundingBox())!;
  const search = (await page.getByRole("searchbox", { name: "Buscar alimento" }).boundingBox())!;
  expect(Math.abs(describe.y - photo.y)).toBeLessThan(2);
  expect(Math.abs(label.y - photo.y)).toBeLessThan(2);
  expect(photo.width).toBeGreaterThanOrEqual(1.8 * label.width);
  expect(search.y).toBeGreaterThan(photo.y + photo.height);
  expect(Math.min(describe.width, describe.height, label.width, label.height)).toBeGreaterThanOrEqual(
    44,
  );
  expect(await hasNoSideScroll(page)).toBe(true);

  const dialog = await openDescribe(page);
  await dialog.getByLabel("O que você comeu?", { exact: true }).fill(MEAL_TEXT_SOURCE);
  await expect(dialog.getByRole("button", { name: "Organizar itens", exact: true })).toBeDisabled();
  await expect(
    dialog.getByText(
      "Organizar a descrição requer conexão com o agente e sua autorização em Meu espaço.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await hasNoSideScroll(page)).toBe(true);
  expect(requests).toHaveLength(0);
});

test("descrever com alerta de urgência: aviso na folha, sem itens", async ({ page }) => {
  await mockAgent(page, () => URGENT_REPLY);
  await seed(page, readyState());
  await openMeal(page);
  const dialog = await openDescribe(page);
  await dialog.getByLabel("O que você comeu?", { exact: true }).fill(MEAL_TEXT_SOURCE);
  await dialog.getByRole("button", { name: "Organizar itens", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("192");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("meal-text-draft")).toHaveCount(0);
});

test("descrever com resposta só em texto: aviso para buscar os alimentos", async ({ page }) => {
  await mockAgent(page, () => TEXT_REPLY);
  await seed(page, readyState());
  await openMeal(page);
  const dialog = await openDescribe(page);
  await dialog.getByLabel("O que você comeu?", { exact: true }).fill(MEAL_TEXT_SOURCE);
  await dialog.getByRole("button", { name: "Organizar itens", exact: true }).click();
  await expect(
    dialog.getByText("Confira os alimentos e busque cada um abaixo antes de salvar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByText(TEXT_REPLY.text)).toBeVisible();
  await expect(page.getByTestId("meal-text-draft")).toHaveCount(0);
});

/** Cores que o cartão nunca usa: todos os rosas da paleta e o tom de perigo. */
const FORBIDDEN_COLORS = [
  ...Object.entries(palette)
    .filter(([key]) => key.startsWith("rose"))
    .map(([, hex]) => hex),
  ...Object.values(domainTone.danger),
].map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
});

test("qualidade do dia: anel com 3 de 7 grupos, legenda, sem vermelho e sem calorias", async ({
  page,
}) => {
  await mockAgent(page, () => TEXT_REPLY);
  for (const hideCalories of [false, true]) {
    await page.setViewportSize({ width: 1365, height: 950 });
    await seed(page, lunchState({ hideCalories }));
    await openDiary(page);
    await expect(page.getByRole("heading", { name: "Qualidade do dia", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Variedade do dia: 3 de 7/ })).toBeVisible();
    const legend = page.getByRole("list", { name: "Grupos de alimentos do dia", exact: true });
    await expect(legend.getByRole("listitem")).toHaveCount(7);
    await expect(legend.locator("li.is-present")).toHaveCount(3);
    const colors = await page.locator(".diary-quality").evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll("*"))].flatMap((el) => {
        const style = getComputedStyle(el);
        return [style.color, style.backgroundColor, style.fill, style.stroke];
      }),
    );
    expect(colors.filter((color) => FORBIDDEN_COLORS.includes(color))).toEqual([]);
    if (hideCalories) await expect(page.locator("main")).not.toContainText(/kcal|caloria/i);
    await page.getByRole("button", { name: "Como contamos a variedade", exact: true }).click();
    const info = page.getByRole("dialog", { name: "Como contamos" });
    await expect(info).toContainText("Guia Alimentar para a População Brasileira");
    await page.keyboard.press("Escape");
    await expect(info).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 780 });
    await expect(page.getByRole("img", { name: /^Variedade do dia: 3 de 7/ })).toBeVisible();
    expect(await hasNoSideScroll(page)).toBe(true);
  }
});

test("qualidade do dia: some num dia sem refeições", async ({ page }) => {
  await mockAgent(page, () => TEXT_REPLY);
  await seed(page, readyState());
  await openDiary(page);
  await expect(page.getByRole("heading", { name: "Refeições", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qualidade do dia" })).toHaveCount(0);
});
