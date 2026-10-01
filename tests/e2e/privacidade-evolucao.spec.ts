import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { BODY_PRIVACY_COPY, hiddenJourneyText } from "../../src/lib/body-privacy";
import { localDate, shiftDate, withMeasurements } from "../../src/lib/domain";
import { stateSchema, type AppState, type Measurement, type Profile } from "../../src/types";
import { contrastIssues } from "./contrast";
import { EVOLUCAO_TITLE } from "../../src/lib/copy";

/**
 * Onda 4 · Lote 4 · ESPACO-13 na Evolução (B3): com "Ocultar números do corpo" a jornada vira
 * "Números do corpo ocultos · N pesagens registradas", o peso vira "Pesagens" (sem gráfico nem
 * período), medidas e faixa de proteína somem, "Registrar medidas" usa campos vazios e o
 * "Relatório para consulta" abre no fim da tela. Só importa módulos que não carregam
 * src/data/foods.json (report.ts carrega; o carregador do Playwright exige o atributo de JSON).
 */
const REPORT_COPY = { title: "Relatório para consulta" } as const;
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
const BODY_NUMBER = /\d[\d.,]*\s*(kg|cm)\b|IMC|kg\/sem/;

/** Adulto com 3 pesagens (a última ontem) e cintura/quadril, que a tela completa mostraria. */
function evolutionState(change: Partial<Profile> = {}): AppState {
  const base = withMeasurements(
    stateFixture(),
    [
      { ...weighIn(shiftDate(today, -15), 74.2), waist: 88, hip: 102 },
      { ...weighIn(shiftDate(today, -8), 73.6), waist: 87, hip: 101 },
      { ...weighIn(shiftDate(today, -1), 72.9), waist: 86, hip: 100 },
    ],
    today,
  );
  return stateSchema.parse({
    ...base,
    profile: { ...base.profile!, targetWeight: 68, ...change },
  });
}

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

/**
 * Contraste medido com a tela parada: os botões animam cor e fundo (0,18 s), então logo depois de
 * trocar o tema (ou de um clique) a medida pegaria a cor no meio do caminho. Espera as transições
 * CSS em andamento terminarem e tira o ponteiro de cima de qualquer linha com hover.
 */
async function stableContrast(page: Page, root: string) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSTransition)
      .every((a) => a.playState !== "running"),
  );
  return contrastIssues(page, root);
}

async function openEvolucao(page: Page, state: AppState) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false } }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await putState(page, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(page.getByRole("heading", { name: EVOLUCAO_TITLE, level: 1 })).toBeVisible();
}

test("Evolução oculta: jornada sem números, pesagens sem valor e medidas com campos vazios", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(PHONE);
  await openEvolucao(page, evolutionState({ hideBodyNumbers: true }));
  const main = page.getByRole("main");
  await expect(page.getByTestId("journey-hidden")).toHaveText(hiddenJourneyText(3));
  await expect(main).not.toContainText(BODY_NUMBER);
  await expect(page.getByRole("group", { name: /^Peso:/ })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Período do gráfico de peso" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Medidas", exact: true })).toHaveCount(0);
  await expect(page.locator(".evol-more-list").getByRole("button", { name: /^Medidas/ })).toHaveCount(0);

  const history = page.locator(".evol-history");
  await expect(page.getByRole("heading", { name: BODY_PRIVACY_COPY.weighIns, exact: true })).toBeVisible();
  await history.locator("summary").click();
  await expect(history.locator("summary")).toHaveText("3 pesagens");
  await expect(history.getByText(BODY_PRIVACY_COPY.weighIn, { exact: true })).toHaveCount(3);
  await expect(main).not.toContainText(BODY_NUMBER);
  expect(await stableContrast(page, ".journey-card")).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("evolucao-oculta-claro.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await stableContrast(page, ".journey-card")).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("evolucao-oculta-escuro.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByRole("button", { name: "Registrar medidas", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Registrar medidas" });
  const weight = sheet.getByRole("textbox", { name: "Peso (kg)" });
  await expect(weight).toHaveValue("");
  await expect(sheet.getByRole("textbox", { name: "Cintura (cm)" })).toHaveValue("");
  await expect(sheet.getByRole("slider")).toHaveCount(0);
  await expect(sheet).not.toContainText(BODY_NUMBER);
  await weight.fill("72,5");
  await sheet.getByRole("button", { name: "Salvar medidas", exact: true }).click();
  await expect(
    page.getByText("Medição salva e perfil atualizado.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await savedState(page)).measurements.find((m) => m.date === today)?.weight)
    .toBe(72.5);
  await expect(page.getByTestId("journey-hidden")).toHaveText(hiddenJourneyText(4));
  await expect(main).not.toContainText(BODY_NUMBER);

  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  await page.getByRole("button", { name: REPORT_COPY.title, exact: true }).click();
  const report = page.getByRole("dialog", { name: REPORT_COPY.title });
  await expect(report).toBeVisible();
  await expect(report.getByRole("checkbox", { name: "Medidas", exact: true })).not.toBeChecked();
  await report.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByRole("button", { name: BODY_PRIVACY_COPY.adjust, exact: true }).click();
  await expect(
    page.getByRole("switch", { name: BODY_PRIVACY_COPY.switchLabel, exact: true }),
  ).toBeChecked();
});

test("Evolução oculta em perfil calmo (menor de 18): sem lembrete de pesagem na jornada", async ({
  page,
}) => {
  // Última pesagem há 10 dias: um adulto vê "Pesagem sugerida hoje" na jornada oculta.
  const overdue = (change: Partial<Profile>) =>
    stateSchema.parse(
      withMeasurements(
        evolutionState(change),
        [
          weighIn(shiftDate(today, -24), 74.2),
          weighIn(shiftDate(today, -17), 73.6),
          weighIn(shiftDate(today, -10), 72.9),
        ],
        today,
      ),
    );
  await openEvolucao(page, overdue({ hideBodyNumbers: true }));
  const card = page.locator(".journey-card");
  await expect(page.getByTestId("journey-hidden")).toHaveText(hiddenJourneyText(3));
  await expect(card.locator(".journey-next")).toHaveText("Pesagem sugerida hoje");

  const minor = `${Number(today.slice(0, 4)) - 16}${today.slice(4)}`;
  await putState(page, overdue({ hideBodyNumbers: true, birthDate: minor }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(page.getByTestId("journey-hidden")).toHaveText(hiddenJourneyText(3));
  await expect(card.locator(".journey-next")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/Pesagem sugerida|Próxima pesagem/);
  await expect(page.getByRole("main")).not.toContainText(BODY_NUMBER);
});

test("Evolução oculta na primeira pesagem: início só com a data", async ({ page }) => {
  const state = evolutionState({ hideBodyNumbers: true });
  await openEvolucao(page, { ...state, measurements: state.measurements.slice(-1) });
  await expect(page.getByRole("heading", { name: "Sua linha de partida" })).toBeVisible();
  await expect(page.locator(".start-flag")).toContainText("Início · ");
  await expect(page.getByRole("main")).not.toContainText(BODY_NUMBER);
});

test("Evolução completa segue com peso, medidas e o relatório no fim", async ({ page }) => {
  await openEvolucao(page, evolutionState());
  await expect(page.getByTestId("journey-hidden")).toHaveCount(0);
  await expect(page.getByRole("group", { name: /^Peso:/ })).toBeVisible();
  // Conceito 09: medidas e relatório em "Mais da sua evolução" (linhas que abrem folhas).
  await page.locator(".evol-more-list").getByRole("button", { name: /^Medidas/ }).click();
  const measures = page.getByRole("dialog", { name: "Medidas", exact: true });
  await expect(measures.getByRole("heading", { name: "Medidas", exact: true }).first()).toBeVisible();
  await expect(measures.getByTestId("measures-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(measures).toHaveCount(0);
  await page.getByRole("button", { name: REPORT_COPY.title, exact: true }).click();
  const report = page.getByRole("dialog", { name: REPORT_COPY.title });
  await expect(report.getByRole("checkbox", { name: "Medidas", exact: true })).toBeChecked();
});
