import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { REPLY_META } from "../structured-fixtures";
import { DAILY_COMMENT_KEY, DAILY_COMMENT_PREFIX } from "../../src/lib/daily-comment";
import { localDate, shiftDate } from "../../src/lib/domain";
import type { AgentReply, AppState, DiaryEntry, Profile } from "../../src/types";

/**
 * IA proativa: o comentário automático do dia (uma vez por dia, ao abrir o Hoje, pelo envio do chat)
 * e os sinais do app (cartão pequeno por tela, dispensável por 3 dias). /api/status e /api/agent são
 * simulados; nenhuma chamada real ao provedor.
 */

type AgentRequest = { mode: string; text: string };

const COMMENT_REPLY: AgentReply = {
  text: "Você tem registrado as refeições com constância. Hoje, inclua uma fruta no lanche da tarde.",
  meta: REPLY_META,
};

/** /api/status pronto e /api/agent em NDJSON (ou com erro), com os pedidos contados. */
async function mockApi(page: Page, { fail = false } = {}) {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: true, token: "proativa-e2e-token" } }));
  await page.route("**/api/agent", (route: Route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    if (fail) return route.fulfill({ status: 502, json: { error: "Provedor indisponível." } });
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "stage", stage: "contexto", attempt: 1 })}\n${JSON.stringify({ type: "result", reply: COMMENT_REPLY })}\n`,
    });
  });
  return requests;
}

async function writeState(page: Page, state: AppState) {
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
}

async function savedState(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const request = indexedDB.open("webfit-personal-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("state", "readonly");
          const value = tx.objectStore("state").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(value.result as AppState);
          };
        };
      }),
  );
}

const hoje = (page: Page) => page.getByRole("heading", { name: "Olá, Pessoa.", exact: true });

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true }).or(hoje(page))).toBeVisible();
  await writeState(page, state);
  await Promise.all([page.waitForResponse("**/api/status"), page.reload()]);
  await expect(hoje(page)).toBeVisible();
}

const today = localDate();
const day = (n: number) => shiftDate(today, -n);

/** Estado com a meta vigente desde antes dos últimos dias (os sinais olham dias passados). */
function stateWith(changes: Partial<Profile> = {}, extra: Partial<AppState> = {}): AppState {
  const state = stateFixture();
  const profile = { ...state.profile!, ...changes };
  const diary = (extra.diary ?? []).map((e) => ({ ...e, userId: state.userId }));
  // stateFixture desliga o comentário do dia; aqui ele volta ao padrão (ligado).
  return { ...state, aiDailyComment: true, profile, goalHistory: [{ date: day(30), profile }], ...extra, diary };
}

const FOOD = {
  id: "taco-arroz",
  name: "Arroz, tipo 1, cozido",
  category: "Cereais e derivados",
  caloriesPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  source: "TACO 4ª edição",
};
function entry(date: string, time: string, fields: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: `${date}-${time}-${fields.type ?? "refeicao"}`,
    userId: "",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    description: "",
    ...fields,
  };
}
const meal = (date: string, time: string, calories: number): DiaryEntry =>
  entry(date, time, { calories, macros: { protein: 30, carbs: 100, fat: 20 }, items: [{ food: FOOD, grams: 200 }] });
const water = (date: string, ml: number): DiaryEntry => entry(date, "10:00", { type: "agua", title: "Água", amountMl: ml });

test("comentário do dia: roda uma vez ao abrir o Hoje, vira cartão e aviso na conversa", async ({ page }) => {
  const requests = await mockApi(page);
  await seed(page, stateWith({ consentAi: true }));

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mode).toBe("chat");
  expect(requests[0].text.startsWith(DAILY_COMMENT_PREFIX)).toBe(true);
  const card = page.getByTestId("daily-comment");
  await expect(card).toContainText("Seu agente comentou");
  await expect(card).toContainText(COMMENT_REPLY.text);
  await expect.poll(async () => (await savedState(page)).aiDailyCommentDate).toBe(today);

  // Na conversa: o pedido técnico vira o aviso; a resposta aparece normal.
  await card.getByRole("button", { name: "Abrir a conversa", exact: true }).click();
  await expect(page.getByTestId("daily-request")).toContainText("Comentário automático do dia");
  await expect(page.getByText(COMMENT_REPLY.text)).toBeVisible();
  await expect(page.getByText(DAILY_COMMENT_PREFIX, { exact: false })).toHaveCount(0);

  // De volta ao Hoje e depois de recarregar: nenhum pedido novo no mesmo dia.
  await page.getByRole("navigation").getByRole("button", { name: "Hoje", exact: true }).click();
  await Promise.all([page.waitForResponse("**/api/status"), page.reload()]);
  await expect(hoje(page)).toBeVisible();
  await expect(page.getByTestId("daily-comment")).toBeVisible();
  expect(requests).toHaveLength(1);

  // Dispensar some com o cartão de hoje (a conversa continua).
  await page.getByRole("button", { name: "Dispensar o comentário de hoje", exact: true }).click();
  await expect(page.getByTestId("daily-comment")).toHaveCount(0);
  await expect.poll(async () => (await savedState(page)).signalDismissals[DAILY_COMMENT_KEY]).toBe(today);
  expect((await savedState(page)).messages).toHaveLength(2);
});

test("comentário do dia: não roda com a preferência desligada, sem consentimento ou em perfil calmo", async ({ page }) => {
  const requests = await mockApi(page);
  for (const state of [
    stateWith({ consentAi: true }, { aiDailyComment: false }),
    stateWith({ consentAi: false }),
    stateWith({ consentAi: true, eatingDisorder: "sim" }),
    stateWith({ consentAi: true }, { aiDailyCommentDate: today }),
  ]) {
    await seed(page, state);
    // Um ciclo completo do Hoje com o agente pronto: nada sai.
    await page.waitForTimeout(500);
    expect(requests).toHaveLength(0);
    await expect(page.getByTestId("daily-comment")).toHaveCount(0);
  }
});

test("comentário do dia: falha em silêncio, sem nova tentativa no mesmo dia", async ({ page }) => {
  const requests = await mockApi(page, { fail: true });
  await seed(page, stateWith({ consentAi: true }));
  await expect.poll(() => requests.length).toBe(1);
  await expect.poll(async () => (await savedState(page)).aiDailyCommentDate).toBe(today);
  await expect(page.getByTestId("daily-comment")).toHaveCount(0);
  await expect(page.getByText("Provedor indisponível.")).toHaveCount(0);
  expect((await savedState(page)).messages).toHaveLength(0);
  await Promise.all([page.waitForResponse("**/api/status"), page.reload()]);
  await expect(hoje(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(1);
});

test("sinais: cartão no Hoje e no Diário, pergunta pronta para o agente e pausa de 3 dias", async ({ page }) => {
  await mockApi(page);
  const diary = [1, 2, 3].flatMap((n) => [water(day(n), 500), meal(day(n), "08:00", 1100), meal(day(n), "13:00", 1100)]);
  // Sem consentimento: só os sinais (nenhum comentário automático).
  await seed(page, stateWith({ consentAi: false }, { diary }));

  const hojeSignal = page.getByTestId("signal-card");
  await expect(hojeSignal).toHaveAttribute("data-signal", "agua-baixa");
  await expect(hojeSignal).toContainText("Observado nos seus registros");
  await expect(hojeSignal).toContainText("A água ficou mais baixa");
  await hojeSignal.getByRole("button", { name: "Dispensar por 3 dias", exact: true }).click();
  await expect(page.getByTestId("signal-card")).toHaveCount(0);
  await expect.poll(async () => (await savedState(page)).signalDismissals["agua-baixa"]).toBe(today);

  // Diário (hoje): três dias acima da meta; a ação abre o agente com a pergunta pronta.
  await page.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();
  const diarySignal = page.getByTestId("signal-card");
  await expect(diarySignal).toHaveAttribute("data-signal", "energia-acima");
  await expect(diarySignal).toContainText("Alguns dias acima da meta");
  await diarySignal.getByRole("button", { name: "Ideias que saciam mais", exact: true }).click();
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue(/sem pular refeições/);
});

test("sinais: nada de energia com calorias ocultas e nada para perfil calmo", async ({ page }) => {
  await mockApi(page);
  const diary = [1, 2, 3].flatMap((n) => [water(day(n), 500), meal(day(n), "08:00", 1100), meal(day(n), "13:00", 1100)]);
  await seed(page, stateWith({ hideCalories: true }, { diary }));
  await page.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meu diário" })).toBeVisible();
  await expect(page.locator('[data-signal="energia-acima"]')).toHaveCount(0);

  await seed(page, stateWith({ pregnancy: "gestacao" }, { diary }));
  await expect(page.getByTestId("signal-card")).toHaveCount(0);
});

test("comentário do dia: com a cópia no servidor ligada, espera a comparação antes de rodar", async ({ page }) => {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true, sync: true, token: "proativa-e2e-token" } }),
  );
  await page.route("**/api/agent", (route: Route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "result", reply: COMMENT_REPLY })}\n`,
    });
  });
  // A comparação fica pendente até o teste responder (a cópia do servidor ainda não chegou).
  let answer: (revision: number) => void = () => undefined;
  const serverRevision = new Promise<number>((resolve) => (answer = resolve));
  await page.route("**/api/sync/status**", async (route) =>
    route.fulfill({ json: { configured: true, revision: await serverRevision } }),
  );
  await page.route("**/api/sync", (route) => route.fulfill({ status: 409, json: { error: "conflito" } }));
  // Aparelho com o estado de ontem (o outro aparelho pode já ter rodado o comentário de hoje).
  const state = stateWith({ consentAi: true }, { serverSync: true, aiDailyCommentDate: day(1) });
  await seed(page, state);
  await page.waitForTimeout(800);
  expect(requests).toHaveLength(0);
  // Servidor à frente (conflito): continua sem pedido até a pessoa escolher a versão.
  answer(state.revision + 1);
  await page.waitForTimeout(800);
  expect(requests).toHaveLength(0);
  await expect(page.getByTestId("daily-comment")).toHaveCount(0);
});

test("comentário do dia: cópia no servidor igual à do aparelho libera o pedido", async ({ page }) => {
  const requests: AgentRequest[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true, sync: true, token: "proativa-e2e-token" } }),
  );
  await page.route("**/api/agent", (route: Route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "result", reply: COMMENT_REPLY })}\n`,
    });
  });
  const state = stateWith({ consentAi: true }, { serverSync: true, aiDailyCommentDate: day(1) });
  await page.route("**/api/sync/status**", (route) =>
    route.fulfill({ json: { configured: true, revision: state.revision } }),
  );
  await page.route("**/api/sync", (route) => route.fulfill({ json: { revision: state.revision + 1, updatedAt: new Date().toISOString() } }));
  await seed(page, state);
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByTestId("daily-comment")).toContainText(COMMENT_REPLY.text);
});
