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
const sourceDate = shiftDate(localDate(), -2);
const targetDate = shiftDate(localDate(), -1);
function seedState() {
  const state = stateFixture();
  const items = [{ food: rice, grams: 125.5 }];
  state.diary = [
    diarySchema.parse({
      id: "source-meal",
      userId: state.userId,
      date: sourceDate,
      time: "12:00",
      createdAt: `${sourceDate}T12:00:00Z`,
      updatedAt: `${sourceDate}T12:00:00Z`,
      type: "refeicao",
      title: "Almoço",
      categoryTag: "Almoço",
      description: "Arroz do teste (125.5 g)",
      items,
      ...mealTotals(items),
      imageUrl: "data:image/png;base64,AAAA",
    }),
  ];
  return state;
}
async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: false, token: "test-token" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
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
  await openMealScreen(page);
}
/** Registrar refeição pelo "+" (Registro rápido → Refeição): o atalho do Hoje saiu no conceito 01. */
async function openMealScreen(page: Page) {
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeAttached();
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

test("repetir e favoritar preserva o original, exige salvar e usa a data e hora escolhidas", async ({
  page,
}) => {
  const state = seedState();
  await seed(page, state);
  // Tipo, data e horário ficam na pílula "Almoço · Hoje, 12:30".
  await page.getByRole("button", { name: /Hoje, \d{2}:\d{2}/ }).click();
  await page.getByLabel("Data", { exact: true }).fill(targetDate);
  await page.getByLabel("Horário", { exact: true }).fill("19:35");
  await page.getByRole("button", { name: "Pronto", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Repetir Almoço de ${sourceDate}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Porção de Arroz do teste em gramas", { exact: true }),
  ).toHaveValue("125,5");
  // Repetir um prato não troca a data nem o horário escolhidos.
  await expect(page.getByRole("button", { name: /Ontem, 19:35/ })).toBeVisible();
  await expect(page.getByAltText("Foto da refeição a registrar")).toHaveCount(
    0,
  );
  expect((await saved(page)).diary).toEqual(state.diary);
  await page
    .getByLabel("Nome do prato favorito", { exact: true })
    .fill("Meu prato de arroz");
  await page
    .getByRole("button", { name: "Salvar como favorito", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Usar favorito Meu prato de arroz",
      exact: true,
    }),
  ).toBeVisible();
  // O botão fica "disabled" enquanto salva; depois, o foco volta a ele (nunca fica no <body>).
  await expect(
    page.getByRole("button", { name: "Salvar como favorito", exact: true }),
  ).toBeFocused();
  expect((await saved(page)).diary).toEqual(state.diary);
  await page
    .getByLabel("Porção de Arroz do teste em gramas", { exact: true })
    .fill("200");
  await page
    .getByRole("button", { name: "Salvar refeição", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(2);
  const after = await saved(page);
  expect(after.diary[0]).toEqual(state.diary[0]);
  expect(after.diary[1]).toMatchObject({
    date: targetDate,
    time: "19:35",
    items: [{ grams: 200 }],
  });
  expect(after.diary[1].id).not.toBe("source-meal");
  expect(after.diary[1].imageUrl).toBeUndefined();
  expect(after.savedMeals[0].items[0].grams).toBe(125.5);
  await page.reload();
  await openMealScreen(page);
  await page
    .getByRole("button", {
      name: "Usar favorito Meu prato de arroz",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Porção de Arroz do teste em gramas", { exact: true }),
  ).toHaveValue("125,5");
  expect((await saved(page)).diary).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/meals-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Remover favorito Meu prato de arroz",
      exact: true,
    })
    .click();
  await expect.poll(async () => (await saved(page)).savedMeals.length).toBe(0);
  expect((await saved(page)).diary).toHaveLength(2);
});

test("duplo toque em favoritar e salvar grava uma vez só", async ({ page }) => {
  const state = seedState();
  await seed(page, state);
  await page
    .getByRole("button", { name: `Repetir Almoço de ${sourceDate}`, exact: true })
    .click();
  await page.getByLabel("Nome do prato favorito", { exact: true }).fill("Prato do duplo toque");
  // Dois cliques no mesmo tique (antes de qualquer render): só a trava síncrona segura o segundo.
  const doubleClick = (name: string) =>
    page
      .getByRole("button", { name, exact: true })
      .evaluate((button: HTMLElement) => {
        button.click();
        button.click();
      });
  await doubleClick("Salvar como favorito");
  await expect.poll(async () => (await saved(page)).savedMeals.length).toBe(1);
  await expect(page.getByRole("button", { name: "Salvar como favorito", exact: true })).toBeEnabled();
  await expect(page.locator(".field-error")).toHaveCount(0);
  await doubleClick("Salvar refeição");
  await expect(page.getByText("Refeição salva.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(2);
  // Uma segunda gravação iria logo atrás da primeira na fila: depois de o aviso aparecer, segue 2.
  await expect(page.getByRole("heading", { name: "Meu diário", exact: true })).toBeVisible();
  expect((await saved(page)).diary).toHaveLength(2);
  expect((await saved(page)).savedMeals).toHaveLength(1);
});

test("com calorias ocultas, a tela de refeição e o cadastro do rótulo não mostram kcal", async ({
  page,
}) => {
  const state = seedState();
  state.profile = { ...state.profile!, hideCalories: true };
  await seed(page, state);
  const main = page.locator("main");
  await page.getByLabel("Buscar alimento").fill("arroz");
  await page
    .getByRole("button", { name: "Adicionar Arroz, integral, cozido", exact: true })
    .click();
  await page.getByRole("button", { name: "Aumentar Arroz, integral, cozido" }).click();
  await expect(main).not.toContainText(/kcal|caloria/i);
  // O rótulo pede só os macros; a energia é calculada (4/4/9) e nunca aparece.
  await page.getByRole("button", { name: /Rótulo/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).not.toContainText(/kcal|energ/i);
  await dialog.getByLabel("Nome do alimento", { exact: true }).fill("Barra de cereal");
  await dialog.getByLabel("Fonte dos valores", { exact: true }).fill("Rótulo da marca");
  await dialog.getByLabel("Proteínas (g)", { exact: true }).fill("5");
  await dialog.getByLabel("Carboidratos (g)", { exact: true }).fill("60");
  await dialog.getByLabel("Gorduras totais (g)", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Salvar alimento", exact: true }).click();
  // O alimento novo entra no prato e o foco vai para o "Aumentar" dele.
  await expect(page.getByRole("button", { name: "Aumentar Barra de cereal" })).toBeFocused();
  await expect(
    page.getByLabel("Porção de Barra de cereal em gramas", { exact: true }),
  ).toHaveValue("100");
  await expect(main).not.toContainText(/kcal|caloria/i);
  await expect
    .poll(
      async () =>
        (await saved(page)).foods.find((f) => f.name === "Barra de cereal")?.caloriesPer100g,
    )
    .toBe(350);
});

test("trocar de editar para nova refeição pelo menu rápido começa um prato vazio", async ({
  page,
}) => {
  const state = seedState();
  const today = localDate();
  const items = [{ food: rice, grams: 80 }];
  state.diary = [
    diarySchema.parse({
      id: "today-meal",
      userId: state.userId,
      date: today,
      time: "12:00",
      createdAt: `${today}T12:00:00Z`,
      updatedAt: `${today}T12:00:00Z`,
      type: "refeicao",
      title: "Almoço",
      categoryTag: "Almoço",
      description: "Arroz do teste (80 g)",
      items,
      ...mealTotals(items),
    }),
  ];
  await seed(page, state);
  await page.getByRole("button", { name: "Diário", exact: true }).first().click();
  await page.getByRole("button", { name: "Editar Almoço", exact: true }).click();
  await expect(
    page.getByLabel("Porção de Arroz do teste em gramas", { exact: true }),
  ).toHaveValue("80");
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  // Sem o prato da edição: nenhuma porção herdada e nada para salvar.
  await expect(
    page.getByLabel("Porção de Arroz do teste em gramas", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Salvar refeição", exact: true }),
  ).toHaveCount(0);
  expect((await saved(page)).diary).toHaveLength(1);
});
