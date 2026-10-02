import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain";
import { diarySchema, type AppState, type FoodItem } from "../../src/types";

const rice: FoodItem = {
  id: "test-rice",
  name: "Arroz do teste",
  category: "Cereais",
  caloriesPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  source: "Tabela de teste",
};
const today = localDate();
const olderDate = shiftDate(today, -3);

function meal(id: string, date: string, time: string, category: string, grams: number) {
  const items = [{ food: rice, grams }];
  return diarySchema.parse({
    id,
    userId: "local",
    date,
    time,
    createdAt: `${date}T${time}:00Z`,
    updatedAt: `${date}T${time}:00Z`,
    type: "refeicao",
    title: category,
    categoryTag: category,
    description: `Arroz do teste (${grams} g)`,
    items,
    ...mealTotals(items),
  });
}
function seedState(): AppState {
  const state = stateFixture();
  state.diary = [
    meal("cafe", today, "07:30", "Café da manhã", 40),
    meal("almoco-1", today, "12:00", "Almoço", 100),
    meal("almoco-2", today, "12:40", "Almoço", 50),
    meal("jantar-antigo", olderDate, "20:00", "Jantar", 80),
  ].map((entry) => ({ ...entry, userId: state.userId }));
  return state;
}
async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: "test-token" } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("webfit-personal-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
}
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("webfit-personal-v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("state");
          const read = tx.objectStore("state").get("current");
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
const openDiary = (page: Page) =>
  page.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();

test("diário agrupa por refeição: subtotal em todo grupo, kcal na linha só com 2 registros e '+ Jantar' pendente", async ({
  page,
}) => {
  await seed(page, seedState());
  await openDiary(page);
  await expect(page.getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Café da manhã", exact: true })).toBeVisible();
  // Conceito 03: todo grupo tem subtotal; Almoço tem 2 registros (128 + 64 kcal).
  await expect(page.locator(".diary-subtotal")).toHaveCount(2);
  const lunch = page.locator(".diary-group").filter({
    has: page.getByRole("heading", { name: "Almoço", exact: true }),
  });
  await expect(lunch.locator(".diary-subtotal")).toHaveText("192 kcal");
  // kcal na linha só no grupo com 2 registros (com um, o subtotal já é o número dele).
  await expect(page.getByText("128 kcal", { exact: true })).toHaveCount(1);
  await expect(page.getByText("51 kcal", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Editar Almoço", exact: true })).toHaveCount(2);
  // Só as refeições sem registro no dia ganham o atalho.
  await expect(page.getByRole("button", { name: "Adicionar almoço", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar lanche", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar jantar", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Jantar, Hoje, \d{2}:\d{2}/ })).toBeVisible();
});

test("a lupa busca em todo o histórico e abre o dia do registro escolhido", async ({ page }) => {
  await seed(page, seedState());
  await openDiary(page);
  await page.getByRole("button", { name: "Buscar no diário", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar no diário" });
  await dialog.getByLabel("Buscar em todo o diário", { exact: true }).fill("jantar arroz");
  await expect(dialog.getByRole("status")).toHaveText("1 resultado");
  await dialog.getByRole("button", { name: /Jantar/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Data dos registros")).toHaveValue(olderDate);
  await expect(page.getByRole("heading", { name: "Jantar", exact: true })).toBeVisible();
});

test("registro rápido no desktop: popover sem o '+' flutuante, peso ±0,1 kg e repetir com Desfazer", async ({
  page,
}) => {
  await seed(page, seedState());
  await expect(page.locator(".quick-fab")).toBeHidden();
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Registro rápido" })).toBeVisible();
  // Sem caneta, a grade não oferece "Aplicação".
  await expect(page.getByRole("button", { name: "Aplicação", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Peso", exact: true }).click();
  const weight = page.getByLabel("Peso em kg", { exact: true });
  await expect(weight).toHaveValue("72");
  await page.getByRole("button", { name: "Aumentar 0,1 kg", exact: true }).click();
  await expect(weight).toHaveValue("72,1");
  await page.getByRole("button", { name: "Salvar peso", exact: true }).click();
  await expect(page.getByText("Peso salvo: 72,1 kg.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).measurements.at(-1)?.weight).toBe(72.1);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect.poll(async () => (await saved(page)).measurements.at(-1)?.weight).toBe(72);

  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: /^Repetir agora: Almoço/ }).first().click();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(5);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(4);
});

test("dia em branco no Hoje: 'Comece seu dia' registra água em um toque e a semana leva ao Diário", async ({
  page,
}) => {
  const state = seedState();
  state.diary = state.diary.filter((entry) => entry.date !== today);
  await seed(page, state);
  await expect(page.getByRole("heading", { name: "Comece seu dia", exact: true })).toBeVisible();
  await expect(page.getByTestId("water-total")).toHaveText("0 ml");
  await expect(page.locator("main")).not.toContainText(/ainda não comeu/i);
  await page.getByRole("button", { name: "Registrar 250 ml de água", exact: true }).click();
  await expect(page.getByTestId("water-total")).toHaveText("250 ml");
  // Com um registro, o dia deixa de estar em branco e o próximo passo volta.
  await expect(page.getByRole("heading", { name: "Comece seu dia", exact: true })).toHaveCount(0);
  // A semana do Hoje (seg–dom, conceito 01) leva ao Diário no dia tocado; hoje está sempre nela.
  const week = page.getByRole("group", { name: /^(Esta semana|Últimos 7 dias)$/ });
  await week.getByRole("button", { name: /^Hoje, / }).click();
  await expect(page.getByLabel("Data dos registros")).toHaveValue(today);
  // Um dia antigo pela faixa do próprio Diário.
  await page
    .locator(".header-strip")
    .getByRole("button", { name: new RegExp(`\\b${Number(olderDate.slice(8))} de `) })
    .click();
  await expect(page.getByLabel("Data dos registros")).toHaveValue(olderDate);
  // De volta ao Hoje, o registro rápido registra hoje (não no dia que estava aberto no Diário).
  await page.getByRole("navigation").getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Água", exact: true }).click();
  // Data e horário ficam recolhidos em "Hoje · agora ▸ alterar".
  await expect(page.getByRole("dialog")).toContainText("Hoje · agora");
  await page.getByRole("button", { name: "Alterar data e horário", exact: true }).click();
  await expect(page.getByLabel("Data", { exact: true })).toHaveValue(today);
});

/** Nome do elemento focado ("BODY" quando o foco caiu no <body>). */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "BODY";
    return active.getAttribute("aria-label") ?? active.textContent?.trim() ?? active.tagName;
  });
/** Espera alguns quadros: o efeito da tela, o aviso e a volta ao título já rodaram. */
const settleFrames = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))),
  );

test("'⋯' da refeição: Excluir leva o foco ao Desfazer e Editar ao título da tela, nunca ao <body>", async ({
  page,
}) => {
  await seed(page, seedState());
  await openDiary(page);
  // Menu da última linha: abre sobre "Água e bem-estar" e continua clicável.
  await page.getByRole("button", { name: "Mais ações: Almoço das 12:40", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect.poll(async () => (await saved(page)).diary.map((entry) => entry.id)).not.toContain("almoco-2");
  await expect(page.getByText("Registro excluído; totais atualizados.", { exact: true })).toBeVisible();
  await settleFrames(page);
  expect(await focusedName(page)).toBe("Desfazer");

  const trigger = page.getByRole("button", { name: "Mais ações: Café da manhã das 07:30", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Editar" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Editar refeição", exact: true })).toBeVisible();
  await settleFrames(page);
  await expect(page.getByRole("heading", { name: "Editar refeição", exact: true })).toBeFocused();
});

test("com calorias ocultas, o Diário não mostra kcal nem a equação do balanço", async ({ page }) => {
  const state = seedState();
  state.profile = { ...state.profile!, hideCalories: true };
  await seed(page, state);
  await openDiary(page);
  await expect(page.getByRole("heading", { name: "Almoço", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/kcal|caloria/i);
  await expect(page.getByRole("button", { name: "Como calculamos" })).toHaveCount(0);
});

test("ajuste da meta: chip de delta no Resumo do Hoje e no cabeçalho do balanço, que abre \"Como calculamos\"", async ({ page }) => {
  const state = seedState();
  // Metas automáticas (o ajuste não vale para metas manuais), vigentes desde antes de ontem.
  const profile = { ...state.profile!, manualCalories: null, manualProtein: null, manualCarbs: null, manualFat: null };
  state.profile = profile;
  state.goalHistory = [{ date: shiftDate(today, -10), profile }];
  // Ontem bem acima da meta-base (duas refeições grandes): hoje a meta fica um pouco menor.
  const yesterday = shiftDate(today, -1);
  state.diary = [
    ...state.diary,
    meal("ontem-1", yesterday, "12:00", "Almoço", 1200),
    meal("ontem-2", yesterday, "19:00", "Jantar", 1200),
  ].map((entry) => ({ ...entry, userId: state.userId }));
  await seed(page, state);

  // Hoje: o chip do ajuste é o 1º do Resumo; a folha traz a frase e leva a "Como calculamos".
  const hojeChip = page.getByTestId("next-step").locator('[data-chip="adjust"]');
  await expect(hojeChip).toHaveText(/^↓ −[\d.]+ kcal hoje$/);
  await expect(page.locator("main")).not.toContainText(/Hoje a meta está/);
  await hojeChip.click();
  const sheet = page.getByRole("dialog", { name: "Meta um pouco menor hoje" });
  await expect(sheet).toContainText("para equilibrar ontem");
  await sheet.getByRole("button", { name: "Como calculamos", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Como calculamos" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Diário: o delta no cabeçalho do balanço, sem parágrafo; o toque abre "Como calculamos".
  await openDiary(page);
  const delta = page.getByTestId("balance-delta");
  await expect(delta).toHaveText(/^↓ −[\d.]+ kcal · para equilibrar ontem$/);
  await expect(page.locator(".diary-balance")).not.toContainText(/Hoje a meta está/);
  await delta.click();
  await expect(page.getByRole("dialog", { name: "Como calculamos" })).toBeVisible();
});

test("no celular os 7 dias do Diário cabem na tela e o calendário fica no cabeçalho, sem rolar de lado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seed(page, seedState());
  await openDiary(page);
  const calendar = page
    .locator(".app-header .header-actions")
    .getByRole("button", { name: "Escolher data no calendário", exact: true });
  await expect(calendar).toBeVisible();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await settleFrames(page);
    const layout = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll<HTMLElement>(".header-strip .week-chip"));
      const rects = chips.map((chip) => chip.getBoundingClientRect());
      return {
        chips: chips.length,
        firstLeft: Math.min(...rects.map((r) => r.left)),
        lastRight: Math.max(...rects.map((r) => r.right)),
        viewport: document.documentElement.clientWidth,
        sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(layout.chips, `${width} px`).toBe(7);
    expect(layout.firstLeft, `${width} px`).toBeGreaterThanOrEqual(0);
    expect(layout.lastRight, `${width} px`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.sideScroll, `${width} px`).toBe(false);
  }
});
