import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals } from "../../src/lib/domain";
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

function seedState(): AppState {
  const state = stateFixture();
  const items = [{ food: rice, grams: 150 }];
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
      description: "Arroz do teste (150 g)",
      items,
      ...mealTotals(items),
    }),
  ];
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

test("o anel alterna restantes e consumidas; a folha de água soma com ±50 ml", async ({ page }) => {
  await seed(page, seedState());
  const ring = page.getByRole("button", { name: /kcal, \d+% da meta\. Mostrar kcal consumidas/ });
  await expect(ring).toContainText("kcal restantes");
  await ring.click();
  await expect(page.getByRole("button", { name: /Mostrar kcal restantes/ })).toContainText("kcal consumidas");
  // O cartão de água começa oculto: o tile do topo abre a folha (o "+" registra um copo direto).
  await page.getByRole("button", { name: /^Água: .* Registrar água$/ }).click();
  await expect(page.getByLabel("Volume (ml)")).toHaveValue("250");
  await page.getByRole("button", { name: "Aumentar 50 ml", exact: true }).click();
  await expect(page.getByLabel("Volume (ml)")).toHaveValue("300");
  await expect(page.getByRole("button", { name: "300 ml", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Salvar registro", exact: true }).click();
  await expect(page.getByTestId("water-total")).toHaveText("300 ml");
  await page.getByRole("button", { name: "Adicionar 250 ml de água", exact: true }).click();
  await expect(page.getByTestId("water-total")).toHaveText("550 ml");
  await expect(page.getByRole("button", { name: /^Água: 0,55 de .* Registrar água$/ })).toBeVisible();
});

test("com restrição hídrica o tile de água não tem o '+' de um toque", async ({ page }) => {
  const state = seedState();
  state.profile = { ...state.profile!, fluidRestriction: "sim" };
  await seed(page, state);
  await expect(page.getByRole("button", { name: /^Água: .* Registrar água$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar 250 ml de água" })).toHaveCount(0);
});

test("bem-estar em rostos, sono em chips e marcadores; a busca do Diário acha o marcador", async ({ page }) => {
  await seed(page, seedState());
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
  // O toque é no rosto (rótulo do rádio).
  await page.getByRole("dialog").getByText("Muito bem", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Muito bem", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "8 h", exact: true }).click();
  await page.getByRole("button", { name: "Náusea", exact: true }).click();
  await page.getByRole("button", { name: "Salvar registro", exact: true }).click();
  await expect.poll(async () => (await saved(page)).diary.find((e) => e.type === "bem_estar")).toMatchObject({
    rating: 5,
    sleepHours: 8,
    tags: ["Náusea"],
  });
  await page.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();
  await expect(page.locator("main")).toContainText("Náusea");
  await page.getByRole("button", { name: "Buscar no diário", exact: true }).click();
  await page.getByLabel("Buscar em todo o diário").fill("nausea");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("1 resultado");
});

test("Editar Hoje reordena e mostra seções, e Desfazer devolve a ordem", async ({ page }) => {
  await seed(page, seedState());
  // Padrão do conceito: bem-estar e água começam ocultos.
  await expect(page.getByRole("heading", { name: "Como você está?" })).toHaveCount(0);
  await expect(page.locator("#hoje-agua")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Hoje", exact: true }).click();
  // Sem caneta e sem aplicações, a medicação não entra na lista.
  await expect(page.getByRole("checkbox", { name: "Mostrar Medicação injetável" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Mostrar Bem-estar", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Subir Bem-estar", exact: true }).click();
  await page.getByRole("checkbox", { name: "Mostrar Bem-estar", exact: true }).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(async () => (await saved(page)).profile?.homeLayout).toMatch(/(^|,)mood,pantry,-water/);
  await expect(page.getByRole("heading", { name: "Como você está?" })).toBeVisible();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect.poll(async () => (await saved(page)).profile?.homeLayout).toBe("");
  await expect(page.getByRole("heading", { name: "Como você está?" })).toHaveCount(0);
});

test("com calorias ocultas, o anel vira 'Seu dia' e o Diário mostra a rosca dos macros", async ({ page }) => {
  const state = seedState();
  state.profile = { ...state.profile!, hideCalories: true };
  await seed(page, state);
  await expect(page.getByRole("img", { name: /^Seu dia: 1 de 3 refeições/ })).toBeVisible();
  await expect(page.locator(".day-hero")).not.toContainText(/kcal/i);
  await page.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();
  await expect(page.getByRole("img", { name: /^Distribuição dos macros no dia: Proteína \d+%/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/kcal|caloria/i);
});
