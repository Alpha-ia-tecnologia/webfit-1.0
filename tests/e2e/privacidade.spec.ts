import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { CHAT_REPLY_SENSITIVE_LEAK, DIET_PLAN_V2, DIET_REPLY } from "../structured-fixtures";
import { questionnaire } from "../../src/data/questionnaire";
import { FLOW_KEY, FLOW_VERSION } from "../../src/lib/anamnese-flow";
import { profileToDraft } from "../../src/components/anamnese/condition-choice";
import { BODY_PRIVACY_COPY } from "../../src/lib/body-privacy";
import { createDietPlan } from "../../src/lib/diet";
import { localDate, shiftDate, withMeasurements } from "../../src/lib/domain";
import { sectionIndexOf } from "../../src/lib/profile-summary";
import { stateSchema, type AppState, type Measurement, type Profile } from "../../src/types";
import { SETTINGS_TAB } from "../../src/lib/copy";

/**
 * Onda 4 · Lote 4 · ESPACO-13 "Ocultar números do corpo" (web, Meu espaço e registro): a
 * preferência em "Suas escolhas", o cartão Corpo, as respostas do perfil, a equação das metas, o
 * peso rápido, Minha dieta, o gráfico de peso do chat, a anamnese (aviso, sem IMC nem figura) e o
 * contexto do agente. A Evolução fica em privacidade-evolucao.spec.ts. Só importa módulos que não
 * carregam src/data/foods.json (o carregador do Playwright exige o atributo de JSON).
 */
const weighIn = (date: string, weight: number): Measurement => ({
  id: `m-${date}`,
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança em casa",
});
const today = localDate();
const PHONE = { width: 390, height: 844 };
const BODY_NUMBER = /\d[\d.,]*\s*(kg|cm)\b|IMC/;
const WEIGHT_SECTION = questionnaire[sectionIndexOf("weight")]!.title;

type AgentRequest = { mode: string; context: { anamnese: Record<string, unknown> } };

/** Adulto com 3 pesagens (a última hoje, 72,4 kg); `change` troca campos do perfil. */
function privacyState(change: Partial<Profile> = {}): AppState {
  const base = withMeasurements(
    stateFixture(),
    [weighIn(shiftDate(today, -14), 73.6), weighIn(shiftDate(today, -7), 73), weighIn(today, 72.4)],
    today,
  );
  return stateSchema.parse({ ...base, profile: { ...base.profile!, ...change } });
}
const hidden = (change: Partial<Profile> = {}) =>
  privacyState({ hideBodyNumbers: true, ...change });

async function putState(page: Page, state: AppState) {
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
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

/** Grava o estado e recarrega no Hoje (agente pronto quando `ready`). */
async function seed(page: Page, state: AppState, ready = false) {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: ready
        ? { ready: true, token: "privacidade-e2e", providers: { deepseek: true, openai: true } }
        : { ready: false },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await putState(page, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
}

const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true });

async function openEspaco(page: Page, tab?: string) {
  await nav(page, "Meu espaço").click();
  if (tab) await page.getByRole("button", { name: tab, exact: true }).click();
}

/** As etapas da anamnese ficam atrás da linha "Anamnese completa · 7 seções" do mosaico. */
async function openSections(page: Page) {
  const toggle = page.locator(".profile-hub").getByRole("button", { name: /^Anamnese completa/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** Simula o agente com uma resposta fixa e guarda os pedidos. */
async function mockAgent(page: Page, reply: unknown) {
  const requests: AgentRequest[] = [];
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

test("interruptor salva a preferência; Minha saúde fica sem números do corpo", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, privacyState());
  await openEspaco(page, SETTINGS_TAB.ariaLabel);
  const toggle = page.getByRole("switch", { name: BODY_PRIVACY_COPY.switchLabel, exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByText("Preferência salva.", { exact: true })).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect.poll(async () => (await savedState(page)).profile?.hideBodyNumbers).toBe(true);

  await page.getByRole("button", { name: "Minha saúde", exact: true }).click();
  const body = page.getByTestId("body-card");
  await expect(page.getByTestId("body-hidden")).toContainText(BODY_PRIVACY_COPY.hiddenTitle);
  await expect(page.getByTestId("body-hidden")).toContainText("Medido hoje · Balança em casa");
  await expect(body).not.toContainText(BODY_NUMBER);
  await expect(page.getByTestId("body-weight")).toHaveCount(0);
  await expect(body.getByRole("button", { name: "Registrar medidas na Evolução" })).toBeVisible();

  // As respostas da etapa do corpo mostram "Oculto" no lugar do peso e da altura.
  await openSections(page);
  await page
    .locator(".profile-hub")
    .getByRole("button", { name: WEIGHT_SECTION, exact: true })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  expect(await sheet.getByText("Oculto", { exact: true }).count()).toBeGreaterThanOrEqual(2);
  await expect(sheet).not.toContainText(/\d[\d.,]*\s*(kg|cm)\b/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const goals = page.locator(".goals-card");
  await goals.getByRole("button", { name: "Como calculamos?", exact: true }).click();
  await expect(goals).toContainText("Mifflin–St Jeor com seu peso, altura, idade e sexo");
  await expect(goals).not.toContainText(/\bkg\b/);

  // "Ajustar em Preferências" leva ao próprio interruptor.
  await body.getByRole("button", { name: BODY_PRIVACY_COPY.adjust, exact: true }).click();
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeFocused();

  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("peso rápido começa vazio, passos esperam o valor e o aviso não repete o peso", async ({
  page,
}) => {
  await seed(page, hidden());
  await page.getByRole("button", { name: "Registro rápido", exact: true }).first().click();
  const grid = page.getByRole("dialog", { name: "Registro rápido" });
  await grid.getByRole("button", { name: "Peso", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Peso em kg" });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", BODY_PRIVACY_COPY.weightPlaceholder);
  await expect(page.getByRole("button", { name: "Aumentar 0,1 kg" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Diminuir 0,1 kg" })).toBeDisabled();
  // Só a vírgula ou o ponto: os passos seguem esperando (nunca partem do peso salvo).
  for (const partial of [",", "."]) {
    await input.fill(partial);
    await expect(page.getByRole("button", { name: "Aumentar 0,1 kg" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Diminuir 0,1 kg" })).toBeDisabled();
  }
  await expect(input).toHaveValue(".");
  await input.fill("72,5");
  await expect(page.getByRole("button", { name: "Aumentar 0,1 kg" })).toBeEnabled();
  await page.getByRole("button", { name: "Salvar peso", exact: true }).click();
  await expect(page.getByText(BODY_PRIVACY_COPY.weightSaved, { exact: true })).toBeVisible();
  await expect(page.getByText(/Peso salvo: /)).toHaveCount(0);
  await expect
    .poll(async () => (await savedState(page)).measurements.find((m) => m.date === today)?.weight)
    .toBe(72.5);
});

test("Minha dieta e o agente sem números do corpo; o contexto leva a preferência", async ({
  page,
}) => {
  const state = hidden({ consentAi: true });
  const withDiet = { ...state, dietPlan: createDietPlan(DIET_REPLY, state.profile!) };
  const requests = await mockAgent(page, CHAT_REPLY_SENSITIVE_LEAK);
  await seed(page, withDiet, true);

  await page.getByRole("button", { name: "Ver minha dieta", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();
  const chips = page.getByRole("list", { name: "Personalização da dieta" });
  await expect(chips.getByText("Manter o peso", { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/\d\s*kg/);

  await nav(page, "Meu agente").click();
  await page.getByLabel("Mensagem para o agente").fill("Ideias de jantar?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  const blocks = page.getByTestId("chat-blocks");
  await expect(blocks).toBeVisible();
  await expect(blocks.getByText("Alimentação e hidratação", { exact: true })).toBeVisible();
  await expect(page.getByText("Peso nas últimas 8 semanas")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.mode).toBe("chat");
  expect(requests[0]!.context.anamnese.hideBodyNumbers).toBe(true);
});

test("texto salvo do agente (dieta e chat) com o peso aparece como 'número oculto'", async ({
  page,
}) => {
  const state = hidden();
  // Plano e conversa de antes de ligar a preferência: os dois citam números do corpo.
  const plan = {
    ...DIET_PLAN_V2,
    resumo: { destaques: ["Porções pensadas para seus 72 kg.", DIET_PLAN_V2.resumo.destaques[1]!] },
  };
  const saved: AppState = {
    ...state,
    dietPlan: createDietPlan({ ...DIET_REPLY, structured: { kind: "diet", plan } }, state.profile!),
    messages: [
      {
        id: "m-ai",
        sender: "ai",
        text: "Seu último registro foi 72,4 kg e a cintura está em 84 cm.",
        timestamp: `${today}T09:00:00.000Z`,
        status: "sent",
      },
    ],
  };
  await seed(page, saved);
  await page.getByRole("button", { name: "Ver minha dieta", exact: true }).first().click();
  await expect(page.locator(".diet-highlights")).toContainText(
    "Porções pensadas para seus número oculto.",
  );
  await expect(page.getByRole("main")).not.toContainText(/72\s*kg/);

  await nav(page, "Meu agente").click();
  const thread = page.getByRole("log", { name: "Conversa com o agente" });
  await expect(thread).toContainText(
    "Seu último registro foi número oculto e a cintura está em número oculto.",
  );
  await expect(thread).not.toContainText(BODY_NUMBER);
});

test("anamnese: aviso antes do peso, sem IMC nem figura; a revisão também avisa", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seed(page, hidden({ waist: 84, hip: 100 }));
  await openEspaco(page);
  await openSections(page);
  await page
    .locator(".profile-hub")
    .getByRole("button", { name: WEIGHT_SECTION, exact: true })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Editar esta seção" }).click();
  await expect(page.getByText("Editar seção", { exact: true })).toBeVisible();
  await expect(page.getByText(BODY_PRIVACY_COPY.anamneseNotice, { exact: true })).toBeVisible();
  await expect(page.getByTestId("anamnese-bmi")).toHaveCount(0);
  await expect(page.getByTestId("measure-figure")).toHaveCount(0);
  await expect(page.getByTestId("weight-projection")).toHaveCount(0);

  // "Revisar tudo" com o rascunho na última etapa: o aviso fica no topo da revisão.
  const state = hidden();
  const lastStep = questionnaire.length - 1;
  await putState(page, {
    ...state,
    draft: { ...profileToDraft(state.profile!), [FLOW_KEY]: FLOW_VERSION },
    draftStep: lastStep,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await openEspaco(page);
  await openSections(page);
  await page.locator(".profile-hub").getByRole("button", { name: "Revisar tudo" }).click();
  await expect(
    page.getByRole("heading", { name: questionnaire[lastStep]!.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(BODY_PRIVACY_COPY.anamneseNotice, { exact: true })).toBeVisible();
});
