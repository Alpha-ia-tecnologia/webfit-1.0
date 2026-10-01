import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { createDietPlan, dietProfileSignature } from "../../src/lib/diet";
import { localDate, shiftDate } from "../../src/lib/dates";
import { KITCHEN_BASICS_NONE_HINT } from "../../src/lib/kitchen-basics";
import { emptyPantryDraft, pantrySignature, savePantryDrafts } from "../../src/lib/pantry";
import {
  RECIPE_EXPIRED_ITEM,
  RECIPE_REMOVED_ITEM,
  RECIPE_STALE_NOTICE,
  renderRecipeSetText,
} from "../../src/lib/recipe-set";
import { CALORIE_PATTERN } from "../../src/lib/text";
import {
  recipeSetSchema,
  type AgentReply,
  type AppState,
  type PantryItem,
  type Profile,
  type RecipeSet,
} from "../../src/types";
import { DESPENSA_TITLE } from "../../src/lib/copy";

/** Escolhe uma opção na folha de seleção (PickerField): o campo mostra "rótulo + valor atual". */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("dialog", { name: label }).getByText(option, { exact: true }).click();
  await expect(page.getByRole("button", { name: `${label} ${option}`, exact: true })).toBeVisible();
}
/** Onde guardar o item N da revisão: grupo de botões com aria-pressed. */
async function chooseStorage(page: Page, n: number, place: "Despensa" | "Geladeira") {
  const option = page
    .getByRole("group", { name: `Guardar item ${n} em`, exact: true })
    .getByRole("button", { name: place, exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
}
/** "+" do cabeçalho: a folha "Adicionar alimentos" (o formulário saiu da primeira tela). */
async function openAdd(page: Page) {
  await page.getByRole("button", { name: "Adicionar alimentos", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Adicionar alimentos" })).toBeVisible();
}
/** "Novas" (Receitas para sua dieta): a folha com os básicos e "Criar receitas com meus alimentos". */
async function openRecipeSheet(page: Page) {
  await page.getByRole("button", { name: "Criar novas receitas", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Novas receitas" })).toBeVisible();
}
/** Ação do menu "⋯" de uma linha do inventário. */
async function rowAction(page: Page, name: string, action: "Editar" | "Remover") {
  await page.getByRole("button", { name: `Mais ações: ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

const meta: AgentReply["meta"] = {
  specialists: ["nutricionista"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 2,
};
const recipeReply: AgentReply = {
  text: "Arroz com tomate\nRendimento: 2 porções. Preparo: 20 minutos.\nIngredientes: arroz e tomate do seu estoque.\n1. Cozinhe o arroz.\n2. Junte o tomate.\nSugestão para o almoço da sua dieta.",
  meta,
};
const photo = {
  name: "compras.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};
/** A receita aparece em blocos: parágrafos e passos numerados (sem o "1." no texto). */
async function expectRecipe(page: Page) {
  for (const line of [
    "Arroz com tomate",
    "Rendimento: 2 porções. Preparo: 20 minutos.",
    "Ingredientes: arroz e tomate do seu estoque.",
    "Cozinhe o arroz.",
    "Junte o tomate.",
    "Sugestão para o almoço da sua dieta.",
  ])
    await expect(page.getByText(line, { exact: true })).toBeVisible();
  await expect(page.locator(".rich-steps li")).toHaveCount(2);
}
function readyState(profile: Partial<Profile> = {}) {
  const s = stateFixture();
  s.profile = { ...s.profile!, consentAi: true, ...profile };
  s.dietPlan = createDietPlan(
    { text: "Almoço: arroz com legumes.", meta },
    s.profile,
  );
  return s;
}
async function seed(page: Page, state: AppState, ready = true) {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready, token: "test-token" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("webfit-personal-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("state", "readwrite");
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
  await page
    .getByRole("button", { name: "Abrir despensa e receitas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: DESPENSA_TITLE, exact: true, level: 1 }),
  ).toBeVisible();
}
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("webfit-personal-v1", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("state"),
            read = tx.objectStore("state").get("current");
          read.onsuccess = () => resolve(read.result);
          tx.oncomplete = () => db.close();
          read.onerror = () => reject(read.error);
        };
      }),
  );
}
/** Uma receita estruturada (AGENTE-04) com os itens da casa, Sal, Cebola a comprar e forno no passo 2. */
function recipeSetFor(
  items: Pick<PantryItem, "id" | "name">[],
  nome: string,
  compatibilidade: string,
): RecipeSet {
  return recipeSetSchema.parse({
    version: 2,
    receitas: [
      {
        nome,
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade,
        ingredientesCasa: items.map((item, i) => ({
          pantryItemId: item.id,
          nome: item.name,
          quantidade: i === 0 ? "1 xícara" : "2 unidades",
        })),
        basicos: [{ basico: "sal", quantidade: "a gosto" }],
        faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade" }],
        passos: [
          { texto: "Refogue o tomate.", timerMin: null, temperaturaC: null },
          { texto: "Junte o arroz e leve ao forno.", timerMin: 25, temperaturaC: 200 },
        ],
        porcao: "Sirva 1 porção e complete o prato com salada.",
      },
    ],
    perguntas: [],
  });
}
/** Arroz e Tomate (+2 dias), Sal marcado, uma geração estruturada atual e uma antiga só em texto. */
function structuredState(profile: Partial<Profile> = {}) {
  const s = savePantryDrafts(
    readyState(profile),
    [
      { ...emptyPantryDraft(), name: "Arroz" },
      { ...emptyPantryDraft("geladeira"), name: "Tomate", expiresOn: shiftDate(localDate(), 2) },
    ],
    "manual",
  );
  s.kitchenBasics = ["sal"];
  const hide = !!profile.hideCalories;
  const set = recipeSetFor(
    s.pantry,
    hide ? "Arroz 300 kcal com tomate" : "Arroz com tomate",
    hide
      ? "Almoço leve com cerca de 300 kcal por porção, como na sua dieta."
      : "Arroz e legumes, como no almoço da sua dieta.",
  );
  const base = {
    meta,
    dietPlanId: s.dietPlan!.id,
    profileSignature: dietProfileSignature(s.profile!),
    pantrySignature: pantrySignature(s.pantry, s.kitchenBasics),
  };
  s.recipes = [
    {
      ...base,
      id: "receita-antiga",
      text: recipeReply.text,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      ...base,
      id: "receita-estruturada",
      text: renderRecipeSetText(set),
      createdAt: new Date().toISOString(),
      recipeSet: set,
    },
  ];
  return s;
}

test("despensa: cadastro manual sem IA, edição de local/quantidade, recarga e remoção", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/agent", (route) => {
    requests++;
    return route.abort();
  });
  await seed(page, stateFixture(), false);
  await openAdd(page);
  await page
    .getByRole("button", { name: "Cadastrar item manualmente" })
    .click();
  await page.getByLabel("Nome do item 1", { exact: true }).fill("Tomate");
  await chooseStorage(page, 1, "Geladeira");
  await page.getByRole("button", { name: "Confirmar e salvar itens" }).click();
  await expect(
    page.getByRole("heading", { name: "Tomate", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).pantry[0].quantity).toBeNull();
  await rowAction(page, "Tomate", "Editar");
  await expect(page.getByLabel("Nome do item 1", { exact: true })).toBeFocused();
  await page.getByLabel("Quantidade do item 1", { exact: true }).fill("0.5");
  await pick(page, "Unidade do item 1", "kg");
  await page.getByRole("button", { name: "Confirmar e salvar itens" }).click();
  await expect
    .poll(async () => (await saved(page)).pantry[0].quantity)
    .toBe(0.5);
  await page.reload();
  await page.getByRole("button", { name: "Abrir despensa e receitas" }).click();
  await expect(
    page
      .getByRole("list", { name: "Geladeira", exact: true })
      .getByText("0,5 kg", { exact: true }),
  ).toBeVisible();
  await rowAction(page, "Tomate", "Remover");
  await expect.poll(async () => (await saved(page)).pantry.length).toBe(0);
  await expect(page.getByRole("heading", { name: "Meus alimentos" })).toBeFocused();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(async () => (await saved(page)).pantry.length).toBe(1);
  await rowAction(page, "Tomate", "Remover");
  await expect.poll(async () => (await saved(page)).pantry.length).toBe(0);
  expect(requests).toBe(0);
});

test("compras já realizadas: foto exige revisão, permite corrigir e abastece receitas", async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      json:
        body.mode === "recipe"
          ? recipeReply
          : {
              text: "Revise os alimentos.",
              meta: { ...meta, specialists: [], reviewed: false, llmCalls: 1 },
              inventoryDraft: {
                items: [
                  {
                    ...emptyPantryDraft(),
                    name: "Arroz",
                    quantity: 1,
                    unit: "kg",
                  },
                  { ...emptyPantryDraft(), name: "Tomate", quantity: null },
                  { ...emptyPantryDraft(), name: "Item incerto" },
                ],
                notes: "Confira o item incerto.",
              },
            },
    });
  });
  await seed(page, readyState());
  await openAdd(page);
  const photoKind = page.getByRole("radiogroup", { name: "O que está na foto?" });
  const shopping = photoKind.getByRole("radio", { name: /lista de compras realizadas/i });
  await shopping.check();
  await expect(shopping).toBeChecked();
  await page
    .getByLabel("Escolher foto da galeria", { exact: true })
    .setInputFiles(photo);
  await page.getByRole("button", { name: "Reconhecer itens da foto" }).click();
  await expect(
    page.getByRole("heading", { name: "Revise os itens antes de salvar" }),
  ).toBeVisible();
  expect((await saved(page)).pantry).toHaveLength(0);
  expect(requests[0].mode).toBe("shopping_photo");
  expect(requests[0].context).toEqual({ location: "despensa" });
  expect(requests[0].history).toEqual([]);
  await page
    .getByLabel("Nome do item 2", { exact: true })
    .fill("Tomate italiano");
  await page.getByLabel("Quantidade do item 2", { exact: true }).fill("4");
  await chooseStorage(page, 2, "Geladeira");
  await page.getByRole("button", { name: "Remover item 3 da revisão" }).click();
  await page.getByRole("button", { name: "Confirmar e salvar itens" }).click();
  await expect.poll(async () => (await saved(page)).pantry.length).toBe(2);
  const stock = (await saved(page)).pantry;
  expect(stock.map((i) => i.location)).toEqual(["despensa", "geladeira"]);
  expect(stock.every((i) => i.source === "shopping_photo")).toBe(true);
  await expect(page.getByRole("dialog", { name: "Adicionar alimentos" })).toHaveCount(0);
  await openRecipeSheet(page);
  await page
    .getByRole("button", { name: "Criar receitas com meus alimentos" })
    .click();
  await expectRecipe(page);
  expect(requests[1].mode).toBe("recipe");
  expect(requests[1].context.pantry.map((i: any) => i.name)).toEqual([
    "Arroz",
    "Tomate italiano",
  ]);
  expect(requests[1].context.dietPlan.text).toContain("Almoço: arroz");
  expect(requests[1].context.kitchenBasics).toEqual([]);
  expect((await saved(page)).pantry).toEqual(stock);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/pantry-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/pantry-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Abrir despensa e receitas" }).click();
  await expectRecipe(page);
});

test("foto: falha preserva imagem e cadastro manual; cancelar não salva itens", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/agent", async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 502,
        json: { error: "Não foi possível reconhecer esta foto." },
      });
    else
      await new Promise<void>((resolve) => {
        page.once("close", () => resolve());
      });
  });
  await seed(page, readyState());
  await openAdd(page);
  await page.getByLabel("Tirar foto", { exact: true }).setInputFiles(photo);
  await page.getByRole("button", { name: "Reconhecer itens da foto" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível reconhecer",
  );
  await expect(
    page.getByAltText("Foto selecionada para reconhecer alimentos"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reconhecer itens da foto" }).click();
  await page.getByRole("button", { name: "Cancelar solicitação" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelada");
  expect((await saved(page)).pantry).toHaveLength(0);
  await page
    .getByRole("button", { name: "Cadastrar item manualmente" })
    .click();
  await expect(
    page.getByLabel("Nome do item 1", { exact: true }),
  ).toBeVisible();
});

test("receitas: dieta desatualizada impede geração e itens vencidos ficam fora do contexto", async ({
  page,
}) => {
  const s = savePantryDrafts(
    readyState(),
    [
      { ...emptyPantryDraft(), name: "Arroz" },
      {
        ...emptyPantryDraft("geladeira"),
        name: "Leite vencido",
        expiresOn: "2020-01-01",
      },
    ],
    "manual",
  );
  s.profile = { ...s.profile!, weight: 80 };
  let calls = 0;
  await page.route("**/api/agent", (route) => {
    calls++;
    return route.abort();
  });
  await seed(page, s);
  await openRecipeSheet(page);
  await expect(
    page.getByText(/Atualize sua dieta para considerar/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar receitas com meus alimentos" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/^Venceu .* — não usado nas receitas/),
  ).toBeVisible();
  expect(calls).toBe(0);
});

test("despensa: grupos por local, vencido no topo, pílula curta, busca do cabeçalho e ordem", async ({
  page,
}) => {
  const today = localDate();
  const s = savePantryDrafts(
    readyState(),
    [
      { ...emptyPantryDraft(), name: "Arroz" },
      { ...emptyPantryDraft("geladeira"), name: "Iogurte", expiresOn: shiftDate(today, 2) },
      { ...emptyPantryDraft("geladeira"), name: "Leite", expiresOn: shiftDate(today, -1) },
      { ...emptyPantryDraft("geladeira"), name: "Queijo", expiresOn: shiftDate(today, 10) },
    ],
    "manual",
  );
  await page.route("**/api/agent", (route) => route.abort());
  await seed(page, s);
  // Sem blocos de resumo nem filtro de local (conceito 06): o "Use primeiro", os grupos e a busca cobrem.
  await expect(page.getByTestId("pantry-summary")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Filtrar por local" })).toHaveCount(0);
  await expect(page.getByLabel("Buscar nos meus alimentos", { exact: true })).toHaveCount(0);
  const names = page.locator("[data-testid=pantry-row] h3");
  // Geladeira primeiro, com o vencido no topo para conferir; depois a Despensa.
  await expect(names).toHaveText(["Leite", "Iogurte", "Queijo", "Arroz"]);
  const fridge = page.getByRole("list", { name: "Geladeira", exact: true });
  await expect(fridge.locator("[data-testid=pantry-row] h3")).toHaveText(["Leite", "Iogurte", "Queijo"]);
  await expect(
    page.getByRole("list", { name: "Despensa", exact: true }).getByRole("heading", { name: "Arroz" }),
  ).toBeVisible();
  const yogurt = page
    .getByTestId("pantry-row")
    .filter({ has: page.getByRole("heading", { name: "Iogurte", exact: true }) });
  await expect(
    yogurt.getByTestId("pantry-expiry-soon").locator('span[aria-hidden="true"]'),
  ).toHaveText("2 dias");
  await expect(yogurt.getByTestId("pantry-expiry-soon")).toContainText("Vence em 2 dias");
  const milk = page.getByTestId("pantry-row").filter({ hasText: "Leite" });
  await expect(milk.getByTestId(/^pantry-expiry-/)).toHaveCount(0);
  await expect(milk.getByTestId("pantry-expired-pill").locator('span[aria-hidden="true"]')).toHaveText(
    "Venceu ontem",
  );
  await expect(milk).toContainText("— não usado nas receitas");
  await expect(milk.getByText("Ainda está bom?", { exact: true })).toBeVisible();
  await expect(milk.getByRole("button", { name: "Atualizar Leite", exact: true })).toBeVisible();
  await expect(milk.getByRole("button", { name: "Remover Leite", exact: true })).toBeVisible();
  // Busca pela lupa do cabeçalho: abre com foco, filtra sem acento, Esc fecha e limpa.
  const toggle = page.getByRole("button", { name: "Buscar alimentos", exact: true });
  await toggle.click();
  const field = page.getByLabel("Buscar nos meus alimentos", { exact: true });
  await expect(field).toBeFocused();
  await field.fill("queijo");
  await expect(names).toHaveText(["Queijo"]);
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(names).toHaveCount(4);
  // Ordem por nome: o vencido continua no topo.
  await page.getByLabel("Ordenar alimentos", { exact: true }).selectOption("nome");
  await expect(names).toHaveText(["Leite", "Iogurte", "Queijo", "Arroz"]);
  await page.setViewportSize({ width: 390, height: 844 });
  const heights = await page
    .getByTestId("pantry-row")
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights).toHaveLength(4);
  // Conceito 06: linhas de 48 px (a vencida ganha a segunda linha "Ainda está bom?").
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(48);
    expect(height).toBeLessThanOrEqual(96);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-inventory-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-inventory-320.png", fullPage: true });
  await page.getByRole("navigation").getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(
    page.getByText("3 alimentos disponíveis para suas receitas. 1 vencido fica de fora.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("revisão compacta: stepper, validade e observação", async ({ page }) => {
  await page.route("**/api/agent", (route) => route.abort());
  await seed(page, readyState());
  await openAdd(page);
  await page
    .getByRole("button", { name: "Digitar: cadastrar item manualmente", exact: true })
    .click();
  await page.getByLabel("Nome do item 1", { exact: true }).fill("Ovos");
  const less = page.getByRole("button", { name: "Diminuir quantidade do item 1", exact: true });
  const more = page.getByRole("button", { name: "Aumentar quantidade do item 1", exact: true });
  await expect(less).toBeDisabled();
  await more.click();
  await more.click();
  await expect(page.getByLabel("Quantidade do item 1", { exact: true })).toHaveValue("2");
  await expect(less).toBeEnabled();
  const week = page.getByRole("button", { name: "+7 dias de validade do item 1", exact: true });
  await week.click();
  await expect(week).toHaveAttribute("aria-pressed", "true");
  const notes = page.getByRole("button", { name: "Observação do item 1", exact: true });
  await expect(notes).toHaveAttribute("aria-expanded", "false");
  await notes.click();
  await expect(notes).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Observações do item 1", { exact: true }).fill("Caixa aberta");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-review-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-review-320.png", fullPage: true });
  await page.getByRole("button", { name: "Confirmar e salvar itens" }).click();
  await expect.poll(async () => (await saved(page)).pantry.length).toBe(1);
  expect((await saved(page)).pantry[0]).toMatchObject({
    name: "Ovos",
    quantity: 2,
    unit: "un",
    expiresOn: shiftDate(localDate(), 7),
    notes: "Caixa aberta",
  });
});

test("básicos: chips alternam, persistem e marcam receitas como estoque alterado", async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route("**/api/agent", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: recipeReply });
  });
  await seed(
    page,
    savePantryDrafts(
      readyState(),
      [
        { ...emptyPantryDraft(), name: "Arroz" },
        { ...emptyPantryDraft("geladeira"), name: "Tomate" },
      ],
      "manual",
    ),
  );
  const basics = () => page.getByTestId("kitchen-basics");
  await openRecipeSheet(page);
  await expect(basics().getByRole("button")).toHaveCount(12);
  await expect(page.getByText(KITCHEN_BASICS_NONE_HINT, { exact: true })).toBeVisible();
  const salt = basics().getByRole("button", { name: "Sal", exact: true });
  await expect(salt).toHaveAttribute("aria-pressed", "false");
  await salt.click();
  await expect(salt).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(KITCHEN_BASICS_NONE_HINT, { exact: true })).toBeHidden();
  await expect.poll(async () => (await saved(page)).kitchenBasics).toEqual(["sal"]);
  await page.reload();
  await page.getByRole("button", { name: "Abrir despensa e receitas", exact: true }).click();
  await openRecipeSheet(page);
  await expect(basics().getByRole("button", { name: "Sal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect((await saved(page)).kitchenBasics).toEqual(["sal"]);
  await page.getByRole("button", { name: "Criar receitas com meus alimentos" }).click();
  await expectRecipe(page);
  expect(requests[0].context.kitchenBasics).toEqual(["sal"]);
  await expect(page.getByText("Estoque alterado", { exact: true })).toHaveCount(0);
  await openRecipeSheet(page);
  await basics().getByRole("button", { name: "Azeite", exact: true }).click();
  await page.getByRole("dialog", { name: "Novas receitas" }).getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText("Estoque alterado", { exact: true })).toBeVisible();
  await expect(page.getByText(RECIPE_STALE_NOTICE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consultar receitas" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("receita estruturada salva: cartão por título, sheet e modo preparo", async ({ page }) => {
  await page.route("**/api/agent", (route) => route.abort());
  await seed(page, structuredState());
  const card = page.getByTestId("recipe-card");
  await expect(card).toHaveCount(1);
  await expect(
    card.getByRole("heading", { level: 3, name: "Arroz com tomate", exact: true }),
  ).toBeVisible();
  await expect(card.getByTestId("recipe-coverage")).toHaveText("3 de 4 ingredientes em casa");
  await expect(card.getByText("Falta: cebola", { exact: true })).toBeVisible();
  await expect(card.getByTestId("recipe-seal").locator('span[aria-hidden="true"]')).toHaveText(
    "Usa o tomate",
  );
  await expect(card.getByTestId("recipe-seal")).toContainText("que vence em 2 dias");
  for (const chip of ["Almoço", "20 min", "2 porções"])
    await expect(card.getByText(chip, { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Arroz com tomate", exact: true });
  await expect(dialog.getByTestId("recipe-sheet")).toBeVisible();
  const home = dialog.getByRole("list", { name: "Na sua cozinha" });
  await expect(home.getByText("Arroz", { exact: true })).toBeVisible();
  await expect(home.getByText("Tomate", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("list", { name: "Básicos da cozinha" }).getByText("Sal", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("list", { name: "Modo de preparo" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(dialog.getByText("25 min", { exact: true })).toBeVisible();
  await expect(dialog.getByText("200 °C", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Começar modo preparo" }).click();
  await expect(dialog.getByTestId("recipe-step-mode")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Passo 1 de 2" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Passo anterior" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Próximo passo" }).click();
  await expect(dialog.getByRole("heading", { name: "Passo 2 de 2" })).toBeFocused();
  await dialog.getByRole("button", { name: "Concluir preparo" }).click();
  await expect(dialog.getByRole("button", { name: "Começar modo preparo" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/pantry-recipe-sheet-390.png" });
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-recipes-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/pantry-recipes-320.png", fullPage: true });
  const older = page.getByRole("button", { name: "Receitas anteriores (1)" });
  await expect(older).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("recipe-legacy")).toHaveCount(0);
  await older.click();
  await expect(older).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("recipe-legacy")).toBeVisible();
  await expect(page.getByTestId("recipe-legacy").locator(".rich-steps li")).toHaveCount(2);
});

test("receita com ingrediente vencido ou removido: rótulos e modo preparo bloqueado", async ({
  page,
}) => {
  await page.route("**/api/agent", (route) => route.abort());
  const state = structuredState();
  const yesterday = shiftDate(localDate(), -1);
  state.pantry = state.pantry
    .filter((item) => item.name !== "Arroz")
    .map((item) => ({ ...item, expiresOn: yesterday }));
  await seed(page, state);
  await page.getByRole("button", { name: "Consultar receitas" }).click();
  await page
    .getByTestId("recipe-card")
    .getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Arroz com tomate", exact: true });
  const home = dialog.getByRole("list", { name: "Na sua cozinha" });
  await expect(home).toContainText(`Tomate · ${RECIPE_EXPIRED_ITEM}`);
  await expect(home).toContainText(`Arroz · ${RECIPE_REMOVED_ITEM}`);
  const start = dialog.getByRole("button", { name: "Começar modo preparo" });
  await expect(start).toBeDisabled();
  const hint = dialog.getByText("Um ingrediente venceu: gere novas receitas.", { exact: true });
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(12);
});

test("editar item com calorias ocultas: nome e observação chegam mascarados à revisão", async ({
  page,
}) => {
  const state = savePantryDrafts(
    readyState({ hideCalories: true }),
    [{ ...emptyPantryDraft("geladeira"), name: "Iogurte 120 kcal", notes: "Pote aberto, 90 kcal" }],
    "manual",
  );
  await seed(page, state);
  await rowAction(page, "Iogurte calorias ocultas", "Editar");
  const name = page.getByLabel("Nome do item 1", { exact: true });
  await expect(name).toHaveValue("Iogurte calorias ocultas");
  await expect(page.getByLabel("Observações do item 1", { exact: true })).toHaveValue(
    "Pote aberto, calorias ocultas",
  );
  const re = new RegExp(CALORIE_PATTERN.source, "i");
  const values = await page
    .locator("input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(values.filter((value) => re.test(value))).toEqual([]);
});

test("receita estruturada com calorias ocultas", async ({ page }) => {
  await page.route("**/api/agent", (route) => route.abort());
  await seed(page, structuredState({ hideCalories: true }));
  const re = new RegExp(CALORIE_PATTERN.source, "i");
  const card = page.getByTestId("recipe-card");
  await expect(card).toBeVisible();
  expect(await card.textContent()).not.toMatch(re);
  await card.getByRole("button", { name: /^Modo preparo: / }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("recipe-sheet")).toBeVisible();
  expect(await dialog.textContent()).not.toMatch(re);
  const dialogName = await dialog.evaluate(
    (el) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? "",
  );
  expect(dialogName).toContain("calorias ocultas");
  expect(dialogName).not.toMatch(re);
  const labels = await page
    .locator("[aria-label]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(labels.filter((label) => re.test(label))).toEqual([]);
});

test("geração estruturada: resposta com receitas vira cartão e persiste", async ({ page }) => {
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON();
    const set = recipeSetFor(
      body.context.pantry.slice(0, 2),
      "Arroz com tomate",
      "Arroz e legumes, como no almoço da sua dieta.",
    );
    const unbasic = { ...set, receitas: set.receitas.map((card) => ({ ...card, basicos: [] })) };
    await route.fulfill({
      json: { text: renderRecipeSetText(unbasic), meta, structured: { kind: "recipes", set: unbasic } },
    });
  });
  await seed(
    page,
    savePantryDrafts(
      readyState(),
      [
        { ...emptyPantryDraft(), name: "Arroz" },
        { ...emptyPantryDraft("geladeira"), name: "Tomate" },
      ],
      "manual",
    ),
  );
  await openRecipeSheet(page);
  await page.getByRole("button", { name: "Criar receitas com meus alimentos" }).click();
  const title = page
    .getByTestId("recipe-card")
    .getByRole("heading", { name: "Arroz com tomate", exact: true });
  await expect(title).toBeVisible();
  expect((await saved(page)).recipes.at(-1)?.recipeSet?.receitas[0].nome).toBe("Arroz com tomate");
  await page.reload();
  await page.getByRole("button", { name: "Abrir despensa e receitas", exact: true }).click();
  await expect(title).toBeVisible();
});
