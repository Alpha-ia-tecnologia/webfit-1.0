import { test, expect, type Page } from "@playwright/test";
import { draftFixture, stateFixture } from "../fixtures";
import { initialState } from "../../src/lib/domain";
import type { AgentReply, AppState, Profile } from "../../src/types";
import { ANAMNESE_FINISH_LABEL } from "../../src/lib/copy";

const dietReply: AgentReply = {
  text: "Café da manhã às 08h: opção sem amendoim.\nAlmoço às 12h: arroz e feijão.\nJantar às 19h: opção de preparo rápido.\nEstimativa: 1800 kcal.",
  meta: {
    specialists: ["nutricionista", "rotina"],
    reviewed: true,
    revisions: 0,
    urgency: "nenhuma",
    notes: [],
    llmCalls: 4,
  },
};

type DietRequest = {
  mode: string;
  consent: boolean;
  context: {
    anamnese: Partial<Profile>;
    goals: { calories: number | null };
  };
};

async function mockStatus(page: Page, ready = true) {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready, token: "diet-e2e-token" } }),
  );
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
  return page.evaluate(async () => {
    return new Promise<AppState>((resolve, reject) => {
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
    });
  });
}

function completedDraft(changes: Partial<Profile> = {}): AppState {
  return {
    ...initialState(),
    // O comentário automático do dia (ia-proativa.spec.ts) mandaria um pedido extra ao abrir o Hoje.
    aiDailyComment: false,
    draft: draftFixture({ consentAi: true, ...changes }),
    draftStep: 7,
  };
}

async function expectDiet(page: Page, text = dietReply.text) {
  for (const line of text.split("\n")) {
    await expect(page.getByText(line, { exact: true })).toBeVisible();
  }
}

test("concluir anamnese cria dieta com respostas atuais e preserva plano e conversa ao recarregar", async ({
  page,
}) => {
  await mockStatus(page);
  const requests: DietRequest[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/agent", async (route) => {
    requests.push(route.request().postDataJSON() as DietRequest);
    expect(route.request().headers()["x-webfit-token"]).toBe("diet-e2e-token");
    await pending;
    await route.fulfill({ json: dietReply });
  });
  await seed(
    page,
    completedDraft({ favoriteFoods: "Arroz, feijão e abóbora" }),
  );
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minha dieta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Criando sua dieta", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    mode: "diet",
    consent: true,
    context: {
      anamnese: {
        allergyDetails: "Amendoim",
        avoidedFoods: "Camarão",
        favoriteFoods: "Arroz, feijão e abóbora",
        mealsPerDay: 3,
        mealRoutine: "Café às 8h, almoço às 12h e jantar às 19h.",
        foodBudget: "Orçamento semanal planejado",
        cookingTime: "30 minutos por dia",
      },
      goals: { calories: 1800 },
    },
  });
  expect(requests[0].context.anamnese).not.toHaveProperty("name");
  const pendingState = await savedState(page);
  expect(pendingState.profile?.favoriteFoods).toBe("Arroz, feijão e abóbora");
  expect(pendingState.draft).toBeNull();

  release();
  await expectDiet(page);
  const saved = await savedState(page);
  expect(saved.dietPlan).toMatchObject({
    text: dietReply.text,
    meta: dietReply.meta,
  });
  expect(saved.dietPlan?.id).toBeTruthy();
  expect(saved.dietPlan?.createdAt).toBeTruthy();
  expect(saved.dietPlan?.profileSignature).toBeTruthy();
  expect(saved.messages).toHaveLength(2);
  expect(saved.messages[0].sender).toBe("user");
  expect(saved.messages[1]).toMatchObject({
    sender: "ai",
    text: dietReply.text,
    meta: dietReply.meta,
  });

  await page.reload();
  await page
    .getByRole("button", { name: "Ver minha dieta", exact: true })
    .click();
  await expectDiet(page);
  expect((await savedState(page)).dietPlan).toEqual(saved.dietPlan);
  expect(requests).toHaveLength(1);
  await page.screenshot({
    path: "test-results/diet-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/diet-mobile.png",
    fullPage: true,
  });
});

test("falha na geração mantém a anamnese e permite tentar novamente", async ({
  page,
}) => {
  await mockStatus(page);
  let attempts = 0;
  await page.route("**/api/agent", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { error: "Agente temporariamente indisponível." },
        })
      : route.fulfill({ json: dietReply });
  });
  await seed(page, completedDraft());
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
    .click();
  await expect(
    page.getByText("Agente temporariamente indisponível.", { exact: true }),
  ).toBeVisible();
  const failed = await savedState(page);
  expect(failed.profile?.allergyDetails).toBe("Amendoim");
  expect(failed.draft).toBeNull();
  expect(failed.dietPlan).toBeNull();
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expectDiet(page);
  expect(attempts).toBe(2);
  expect((await savedState(page)).dietPlan?.text).toBe(dietReply.text);
});

for (const scenario of [
  { name: "sem consentimento", consentAi: false, ready: true },
  { name: "com agente desconectado", consentAi: true, ready: false },
]) {
  test(`anamnese ${scenario.name} fica salva e não envia contexto ao agente`, async ({
    page,
  }) => {
    await mockStatus(page, scenario.ready);
    let requests = 0;
    await page.route("**/api/agent", (route) => {
      requests++;
      return route.fulfill({ json: dietReply });
    });
    await seed(page, completedDraft({ consentAi: scenario.consentAi }));
    await page
      .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Olá, Pessoa.", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Criar minha dieta", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Minha dieta", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Gerar minha dieta", exact: true }),
    ).toBeDisabled();
    const saved = await savedState(page);
    expect(saved.profile?.consentAi).toBe(scenario.consentAi);
    expect(saved.draft).toBeNull();
    expect(saved.dietPlan).toBeNull();
    expect(requests).toBe(0);
  });
}

test("cancelamento descarta a resposta pendente e permite uma nova geração", async ({
  page,
}) => {
  await mockStatus(page);
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/agent", async (route) => {
    attempts++;
    if (attempts === 1) await pending;
    await route.fulfill({ json: dietReply });
  });
  await seed(page, completedDraft());
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
    .click();
  await expect.poll(() => attempts).toBe(1);
  await page
    .getByRole("button", { name: "Cancelar geração", exact: true })
    .click();
  release();
  await expect(
    page.getByText("Criando sua dieta", { exact: true }),
  ).not.toBeVisible();
  expect((await savedState(page)).dietPlan).toBeNull();
  await expect(
    page.getByText(dietReply.text.split("\n")[0], { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expectDiet(page);
  expect(attempts).toBe(2);
  expect(
    (await savedState(page)).messages.filter(
      (message) => message.sender === "ai",
    ),
  ).toHaveLength(1);
});

test("perfil existente pode criar dieta e a tela respeita calorias ocultas", async ({
  page,
}) => {
  await mockStatus(page);
  await page.route("**/api/agent", (route) =>
    route.fulfill({ json: dietReply }),
  );
  const state = stateFixture();
  state.profile = { ...state.profile!, consentAi: true, hideCalories: true };
  await seed(page, state);
  await page
    .getByRole("button", { name: "Criar minha dieta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gerar minha dieta", exact: true })
    .click();
  await expectDiet(
    page,
    dietReply.text.replace("1800 kcal", "calorias ocultas"),
  );
  await expect(page.getByText(/1800 kcal/)).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Ver minha dieta", exact: true })
    .click();
  await expect(
    page.getByText("calorias ocultas", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/\[calorias ocultas\]/)).toHaveCount(0);
  await expect(page.getByText(/1800 kcal/)).not.toBeVisible();
});

test("alterar medidas sinaliza plano antigo e falha ao atualizar preserva a dieta anterior", async ({
  page,
}) => {
  await mockStatus(page);
  const requests: DietRequest[] = [];
  const updatedReply = {
    ...dietReply,
    text: dietReply.text.replace("arroz e feijão", "arroz, feijão e abóbora"),
  };
  await page.route("**/api/agent", (route) => {
    requests.push(route.request().postDataJSON() as DietRequest);
    if (requests.length === 2)
      return route.fulfill({
        status: 503,
        json: { error: "Não foi possível atualizar a dieta." },
      });
    return route.fulfill({
      json: requests.length === 1 ? dietReply : updatedReply,
    });
  });
  await seed(page, completedDraft());
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
    .click();
  await expectDiet(page);
  const original = (await savedState(page)).dietPlan;
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar medidas", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Registrar medidas" });
  await expect(sheet.getByRole("slider", { name: "Peso (kg)", exact: true })).toBeVisible();
  await sheet.locator('input[name="weight"]').fill("73.5");
  await sheet.locator('input[name="method"]').fill("Balança em casa");
  await page
    .getByRole("button", { name: "Salvar medidas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Substituir medição", exact: true })
    .click();
  await expect
    .poll(async () => (await savedState(page)).profile?.weight)
    .toBe(73.5);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver minha dieta", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Seu plano precisa ser atualizado",
      exact: true,
    }),
  ).toBeVisible();
  // O plano anterior continua visível, marcado como versão anterior, sob a faixa de atualização.
  await expect(page.getByText("Versão anterior", { exact: true })).toBeVisible();
  await expectDiet(page);
  await page
    .getByRole("button", { name: "Atualizar dieta", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível atualizar a dieta.",
  );
  expect((await savedState(page)).dietPlan).toEqual(original);
  expect(requests[1].context.anamnese.weight).toBe(73.5);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expectDiet(page, updatedReply.text);
  await expect(
    page.getByRole("heading", {
      name: "Seu plano precisa ser atualizado",
      exact: true,
    }),
  ).not.toBeVisible();
  const updated = (await savedState(page)).dietPlan;
  expect(updated?.id).not.toBe(original?.id);
  expect(updated?.profileSignature).not.toBe(original?.profileSignature);
  expect(requests).toHaveLength(3);
});

test("anamnese: salva anexo, analisa selecionado antes da dieta e preserva análise", async ({
  page,
}) => {
  await mockStatus(page);
  const requests: any[] = [];
  const examReply = {
    ...dietReply,
    text: "Transcrição automática: conferir valores no laudo original.",
    meta: { ...dietReply.meta, specialists: ["analista_exames"] },
  };
  await page.route("**/api/agent", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({
      json: body.mode === "exam" ? examReply : dietReply,
    });
  });
  await seed(page, completedDraft());
  await page.getByLabel("Arquivo do exame", { exact: true }).setInputFiles({
    name: "Hemograma.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(
    page.getByRole("button", { name: ANAMNESE_FINISH_LABEL }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Salvar anexo", exact: true }).click();
  await expect.poll(async () => (await savedState(page)).exams.length).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".anamnese-exams")
    .screenshot({ path: "test-results/anamnese-exams-mobile.png" });
  await page
    .getByLabel("Analisar Hemograma ao concluir", { exact: true })
    .check();
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL })
    .click();
  await expectDiet(page);
  expect(requests.map((r) => r.mode)).toEqual(["exam", "diet"]);
  expect(requests[0].file).toContain("data:application/pdf;base64,");
  expect(requests[1].file).toBeUndefined();
  expect(requests[1].context.examAnalyses).toEqual([
    {
      name: "Hemograma",
      date: (await savedState(page)).exams[0].date,
      analysis: examReply.text,
    },
  ]);
  await page.reload();
  expect((await savedState(page)).exams[0].analysis).toBe(examReply.text);
});

test("anamnese: falha e cancelamento da análise preservam anexos sem gerar dieta", async ({
  page,
}) => {
  await mockStatus(page);
  const state = completedDraft();
  state.exams = [
    {
      id: "exame-teste",
      name: "Hemograma",
      date: "2026-01-01",
      fileName: "laudo.pdf",
      mimeType: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQ=",
      notes: "",
    },
  ];
  const requests: any[] = [];
  let retry = false;
  await page.route("**/api/agent", async (route) => {
    requests.push(route.request().postDataJSON());
    if (retry) {
      await new Promise<void>((resolve) => page.once("close", () => resolve()));
      return;
    }
    await route.fulfill({
      status: 502,
      json: { error: "Falha ao analisar o exame." },
    });
  });
  await seed(page, state);
  await page
    .getByLabel("Analisar Hemograma ao concluir", { exact: true })
    .check();
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL })
    .click();
  await expect(page.getByRole("alert")).toContainText("Falha ao analisar");
  expect((await savedState(page)).exams).toHaveLength(1);
  expect((await savedState(page)).dietPlan).toBeNull();
  retry = true;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Analisando exame" }),
  ).toContainText("Analisando exame 1 de 1");
  await expect.poll(() => requests.length).toBe(2);
  await page.getByRole("button", { name: "Cancelar geração" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelada");
  expect(requests.every((r) => r.mode === "exam")).toBe(true);
  expect((await savedState(page)).exams[0].analysis).toBeUndefined();
});

test("dieta chega em etapas (NDJSON) e aparece no chat como cartão-resumo", async ({
  page,
}) => {
  await mockStatus(page);
  const accepts: string[] = [];
  await page.route("**/api/agent", (route) => {
    accepts.push(route.request().headers()["accept"] ?? "");
    const events = [
      { type: "stage", stage: "contexto", attempt: 1 },
      { type: "stage", stage: "especialista", attempt: 1 },
      { type: "stage", stage: "seguranca", attempt: 1 },
      { type: "stage", stage: "revisao", attempt: 1 },
      { type: "result", reply: dietReply },
    ];
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
  await seed(page, completedDraft());
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
    .click();
  await expectDiet(page);
  expect(accepts[0]).toContain("application/x-ndjson");
  const saved = await savedState(page);
  expect(saved.messages.map((m) => m.text)).toEqual([
    saved.messages[0].text,
    dietReply.text,
  ]);

  await page.getByRole("button", { name: "Meu agente", exact: true }).click();
  await expect(page.getByText(/Você pediu uma nova dieta/)).toBeVisible();
  await expect(
    page.getByText("Dieta do dia criada", { exact: true }),
  ).toBeVisible();
  // Cartão compacto (conceito 05): os pontos do resumo abrem em "Ver resumo".
  const summary = page.getByRole("button", { name: "Ver resumo", exact: true });
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Café da manhã às 08h", { exact: true }),
  ).toBeVisible();
  // O pedido técnico e o plano integral não são despejados na conversa.
  await expect(page.getByText(/Crie minha dieta personalizada/)).toHaveCount(0);
  await expect(
    page.getByText(dietReply.text.split("\n")[0], { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver texto completo" }).click();
  await expect(
    page.getByText(dietReply.text.split("\n")[0], { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir dieta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minha dieta", exact: true }),
  ).toBeVisible();
});
