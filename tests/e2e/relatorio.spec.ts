import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { EXAM_RESULT } from "../structured-fixtures";
import { localDate, mealTotals, shiftDate, withMeasurements } from "../../src/lib/domain";
import {
  diarySchema,
  stateSchema,
  type AppState,
  type DiaryEntry,
  type FoodItem,
  type Measurement,
  type Profile,
} from "../../src/types";
import { contrastIssues } from "./contrast";
import { SETTINGS_TAB } from "../../src/lib/copy";

/**
 * Onda 4 · Lote 4 · ESPACO-08: cartão "Essencial" (Meu espaço › Saúde) e "Relatório para consulta"
 * impresso pelo navegador (window.print simulado). O estado segue o reportState() dos testes de
 * unidade, deslocado para hoje: 5 pesagens (3 nos últimos 30 dias), almoço, água, bem-estar, uma
 * aplicação de caneta, um laudo com uma pergunta pendente e a consulta em 4 dias.
 * Só importa módulos que não carregam src/data/foods.json (o carregador do Playwright exige o
 * atributo `with { type: "json" }`): nada de report.ts nem de tests/report-fixtures.ts aqui.
 */
const REPORT_COPY = {
  title: "Relatório para consulta",
  intro:
    "Monte um resumo para levar à consulta. Ele é montado neste aparelho e não passa pela IA.",
  questions: "Suas perguntas (uma por linha)",
  print: "Imprimir ou salvar PDF",
  hiddenNote: "Inclui os números do corpo que você ocultou nas telas.",
} as const;
const today = localDate();
const D = (days: number) => shiftDate(today, days);

type Raw = Record<string, unknown>;
function entry(date: string, fields: Raw, time = "12:00"): DiaryEntry {
  return diarySchema.parse({
    id: `${String(fields.type)}-${date}-${time}`,
    userId: "seed",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    title: String(fields.type),
    description: "",
    ...fields,
  });
}
const food = (id: string, name: string, category: string): FoodItem => ({
  id,
  name,
  category,
  caloriesPer100g: 128,
  proteinPer100g: 8,
  carbsPer100g: 20,
  fatPer100g: 2,
  source: "Tabela de teste",
});
const LUNCH = [
  food("test-arroz", "Arroz do teste", "Cereais e derivados"),
  food("test-feijao", "Feijão do teste", "Leguminosas e derivados"),
  food("test-frango", "Frango do teste", "Carnes e derivados"),
].map((item) => ({ food: item, grams: 100 }));
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
const PHONE = { width: 390, height: 844 };
const SECTIONS = [
  "Essencial",
  "Medidas",
  "Calorias",
  "Alimentação e água",
  "Tratamento",
  "Exames",
  "Bem-estar e sono",
  "Perguntas para a consulta",
];
const ESSENTIAL_PROFILE: Partial<Profile> = {
  allergies: "sim",
  allergyDetails: "Amendoim, Camarão",
  conditions: "Hipertensão, Diabetes tipo 2",
  medications: "Anti-hipertensivo, Losartana 50 mg 1x ao dia",
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro (tirzepatida)",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
  targetWeight: 66,
};

function reportE2EState(change: Partial<Profile> = {}): AppState {
  const base = withMeasurements(
    stateFixture(),
    [
      weighIn(D(-56), 76.4),
      weighIn(D(-35), 75.1),
      weighIn(D(-21), 74.0),
      weighIn(D(-7), 73.0),
      weighIn(D(0), 72.4),
    ],
    today,
  );
  const injectionAt = `${D(-8)}T08:00:00.000Z`;
  // Validado aqui: um estado inválido faria o app abrir a anamnese e o erro ficaria escondido.
  return stateSchema.parse({
    ...base,
    profile: { ...base.profile!, ...ESSENTIAL_PROFILE, ...change },
    diary: [
      entry(D(-1), {
        type: "refeicao",
        title: "Almoço",
        categoryTag: "Almoço",
        items: LUNCH,
        ...mealTotals(LUNCH),
      }),
      entry(D(-1), { type: "agua", title: "Água", amountMl: 1500 }, "15:00"),
      entry(
        D(-2),
        { type: "bem_estar", title: "Bem-estar", rating: 4, sleepHours: 7, tags: ["Disposição"] },
        "21:00",
      ),
    ],
    injections: [
      {
        id: "inj-1",
        userId: "seed",
        date: D(-8),
        time: "08:00",
        createdAt: injectionAt,
        updatedAt: injectionAt,
        method: "caneta",
        medication: "Tirzepatida",
        concentrationMgPerMl: null,
        syringeUnits: null,
        units: null,
        volumeMl: null,
        doseMg: 5,
        site: "abdomen",
        side: "esquerdo",
        notes: "",
      },
    ],
    exams: [
      {
        id: "exam-1",
        name: "Exames de sangue",
        date: D(-18),
        fileName: "laudo.pdf",
        mimeType: "application/pdf",
        data: "data:application/pdf;base64,AAAA",
        notes: "Coleta em jejum.",
        analysisStructured: EXAM_RESULT,
        questionsDone: [0],
      },
    ],
    appointments: [
      {
        id: "a-1",
        professional: "Dra. Ana Lima",
        registration: "CRN 1234",
        date: D(4),
        time: "10:00",
        url: "https://example.com/consulta",
        notes: "",
      },
    ],
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

/** Grava o estado, recarrega e abre Meu espaço › Saúde. */
async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false } }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await putState(page, state);
  await page.reload();
  const espaco = page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true });
  await expect(espaco).toBeVisible();
  await espaco.click();
  await expect(page.getByTestId("health-mosaic")).toBeVisible();
}

/** "Relatório para consulta" no rodapé do cartão Próxima consulta (conceito 11). */
const reportButton = (page: Page) =>
  page.getByTestId("consulta-card").getByRole("button", { name: /^Relatório para consulta/ });

const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __printed: number }).__printed);

async function openReport(page: Page) {
  await reportButton(page).click();
  const dialog = page.getByRole("dialog", { name: REPORT_COPY.title });
  await expect(dialog).toBeVisible();
  return dialog;
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

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => {
      w.__printed++;
    };
  });
});

test("Essencial: o mosaico nunca mostra condições nem remédios da anamnese; a folha mostra, sem dose", async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seed(page, reportE2EState());
  const mosaic = page.getByTestId("health-mosaic");
  // Face: alergias e a caneta pelo registro; condições e remédios da anamnese nunca (só a contagem).
  await expect(mosaic).toContainText("Amendoim");
  await expect(mosaic).not.toContainText("Losartana");
  await expect(mosaic).not.toContainText("Hipertensão");
  await expect(mosaic).not.toContainText(/(?<![\d,])50 mg/);
  await mosaic.getByRole("button", { name: "Alergias", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Essencial" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("essential-summary")).toHaveText(
    "2 alergias · 2 condições · 3 medicamentos",
  );
  for (const chip of ["Amendoim", "Losartana", "Mounjaro (tirzepatida)", "Dra. Ana Lima · CRN 1234"])
    await expect(sheet.getByText(chip, { exact: true })).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Alergias" }).getByRole("listitem")).toHaveCount(2);
  await expect(sheet.getByRole("list", { name: "Medicamentos" })).toBeVisible();
  await expect(
    sheet.getByText("Informativo, como você informou na anamnese; sem doses.", { exact: true }),
  ).toBeVisible();
  await expect(sheet).not.toContainText("50 mg");
  await expect(sheet).not.toContainText(/\d[\d.,]*\s*(kg|kcal)\b/);
  // O pino de Exames e consultas continua único.
  await expect(page.getByRole("button", { name: "Registrar consulta" })).toHaveCount(0);

  // Contraste AA da folha nos dois temas (e capturas para conferir o visual).
  expect(await stableContrast(page, '[role="dialog"]')).toEqual([]);
  await sheet.screenshot({ path: testInfo.outputPath("essencial-claro.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await stableContrast(page, '[role="dialog"]')).toEqual([]);
  await sheet.screenshot({ path: testInfo.outputPath("essencial-escuro.png") });
  await page.emulateMedia({ colorScheme: "light" });

  await page.setViewportSize({ width: 360, height: 780 });
  expect(await fitsWidth(page)).toBe(true);

  await sheet.getByRole("button", { name: "Editar na anamnese", exact: true }).click();
  await expect(page.getByText("Editar seção", { exact: true })).toBeVisible();
});

test("Relatório: seções marcadas, pergunta pendente, imprime só o relatório e sai no afterprint", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(PHONE);
  await seed(page, reportE2EState());
  const dialog = await openReport(page);
  await expect(dialog).toContainText(REPORT_COPY.intro);
  await expect(dialog.getByRole("button", { name: "30 dias", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const label of SECTIONS)
    await expect(dialog.getByRole("checkbox", { name: label, exact: true })).toBeChecked();
  const questions = dialog.getByLabel(REPORT_COPY.questions);
  await expect(questions).toHaveValue(EXAM_RESULT.perguntas[1]!);
  expect(await stableContrast(page, '[role="dialog"]')).toEqual([]);
  expect(await fitsWidth(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("relatorio-folha.png"), fullPage: true });

  await dialog.getByRole("button", { name: REPORT_COPY.print, exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  const root = page.locator(".report-print-root");
  await expect(root.locator(".wf-report h1")).toHaveText("Relatório para consulta");
  await expect(root).toContainText("Próxima consulta: ");
  await expect(root).toContainText("Dra. Ana Lima");
  await expect(root).toContainText("3 pesagens no período");
  await expect(root).toContainText(EXAM_RESULT.perguntas[1]!);
  await expect(root.locator("svg.wf-report-chart")).toHaveCount(1);
  expect((await root.textContent()) ?? "").not.toMatch(/\b(normal|alterad)/i);

  // Na impressão, só o relatório aparece; o app e a folha somem.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(dialog).toBeHidden();
  await expect(root).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("relatorio-impresso.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".report-print-root")).toHaveCount(0);
  await expect(page.locator("html.is-printing-report")).toHaveCount(0);

  // Sem seção marcada, não há o que imprimir.
  for (const label of SECTIONS)
    await dialog.getByRole("checkbox", { name: label, exact: true }).uncheck();
  await expect(dialog.getByRole("button", { name: REPORT_COPY.print, exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Relatório com calorias ocultas: sem a seção Calorias e sem kcal no papel", async ({ page }) => {
  await seed(page, reportE2EState({ hideCalories: true }));
  const dialog = await openReport(page);
  await expect(dialog.getByRole("checkbox", { name: "Calorias", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: REPORT_COPY.print, exact: true }).click();
  const root = page.locator(".report-print-root");
  await expect(root.locator(".wf-report h1")).toBeAttached();
  expect((await root.textContent()) ?? "").not.toMatch(/kcal|caloria/i);
});

test("Relatório em perfil calmo: Medidas e Calorias desmarcadas; Medidas só com o peso", async ({
  page,
}) => {
  await seed(page, reportE2EState({ eatingDisorder: "sim" }));
  const dialog = await openReport(page);
  const measures = dialog.getByRole("checkbox", { name: "Medidas", exact: true });
  await expect(measures).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Calorias", exact: true })).not.toBeChecked();
  await expect(dialog).toContainText("Pesagens do período");
  await measures.check();
  await dialog.getByRole("button", { name: REPORT_COPY.print, exact: true }).click();
  const root = page.locator(".report-print-root");
  await expect(root).toContainText("72,4 kg");
  await expect(root.locator("svg")).toHaveCount(0);
  await expect(root).not.toContainText("IMC");
  await expect(root).not.toContainText("Variação");
  await expect(root).not.toContainText("Peso desejado");
});

test("Relatório: nome com HTML fica como texto, sem elemento nem script", async ({ page }) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => {
    alerts.push(d.message());
    void d.dismiss();
  });
  await seed(page, reportE2EState({ name: "Ana <img src=x onerror=alert(1)>" }));
  const dialog = await openReport(page);
  await dialog.getByRole("button", { name: REPORT_COPY.print, exact: true }).click();
  const root = page.locator(".report-print-root");
  await expect(root.locator(".wf-report h1")).toBeAttached();
  await expect(root.locator("img")).toHaveCount(0);
  expect((await root.textContent()) ?? "").toContain("Ana <img src=x onerror=alert(1)>");
  expect(alerts).toEqual([]);
});

test("Relatório com números do corpo ocultos: Medidas desmarcada com o aviso", async ({ page }) => {
  await seed(page, reportE2EState({ hideBodyNumbers: true }));
  const dialog = await openReport(page);
  await expect(dialog.getByRole("checkbox", { name: "Medidas", exact: true })).not.toBeChecked();
  await expect(dialog.getByText(REPORT_COPY.hiddenNote, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Calorias", exact: true })).toBeChecked();
});

test("Relatório sob demanda: o arquivo só chega ao abrir; se não chega, aviso e Meu espaço segue de pé", async ({
  page,
}) => {
  const REPORT_CHUNK = /\/assets\/ReportSheet-[^/]+\.js$/;
  const requested: string[] = [];
  page.on("request", (request) => {
    if (REPORT_CHUNK.test(request.url())) requested.push(request.url());
  });
  await seed(page, reportE2EState());
  // Meu espaço (aquecido no ocioso) abre sem baixar o modelo nem o desenho do relatório.
  expect(requested).toEqual([]);
  // Arquivo de uma versão anterior (ou conexão caída): o pedaço do relatório não chega.
  await page.route(REPORT_CHUNK, (route) => route.abort());
  await reportButton(page).click();
  await expect(page.locator(".toast")).toContainText("Não foi possível abrir o relatório.");
  expect(requested.length).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: REPORT_COPY.title })).toHaveCount(0);
  await expect(page.getByText("Esta tela não abriu", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("health-mosaic")).toBeVisible();
});

test("Relatório sob demanda: a folha recebe o foco ao abrir e o devolve ao botão ao fechar", async ({ page }) => {
  await seed(page, reportE2EState());
  const button = reportButton(page);
  const dialog = await openReport(page);
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});
