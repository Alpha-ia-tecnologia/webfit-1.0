import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { DIET_PLAN_V2, DIET_REPLY } from "../structured-fixtures";
import { createDietPlan, dietProfileSignature } from "../../src/lib/diet";
import { localDate, shiftDate } from "../../src/lib/dates";
import { emptyPantryDraft, pantrySignature, savePantryDrafts } from "../../src/lib/pantry";
import { renderRecipeSetText } from "../../src/lib/recipe-set";
import {
  recipeSetSchema,
  type AgentReply,
  type AppState,
  type PantryDraft,
  type PantryItem,
  type Profile,
  type RecipeSet,
} from "../../src/types";
import { DESPENSA_TITLE } from "../../src/lib/copy";

/**
 * Onda 4 · Lote 1 "Cozinha": "Comi esta"/"Ajustar"/"Trocar" e a faixa "1 de 4" (AGENTE-09), a
 * semana do plano (IA-X5), a lista de compras (AGENTE-08), "Use primeiro" na Despensa e no Hoje com
 * o lembrete das 10:00 (AGENTE-13) e o modo preparo em tela cheia com timer, tela acesa e
 * "Descontar da despensa" (AGENTE-11). Nada disso chama o agente, salvo "Criar receitas com eles".
 */

const today = localDate();
/** 12:41 de hoje: o almoço (12:00) ainda é a próxima refeição do plano. */
const NOON = `${today}T12:41:00`;
const meta: AgentReply["meta"] = {
  specialists: ["nutricionista"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 2,
};

/** /api/status pronto e /api/agent contado (responde com `reply`, quando houver). */
async function mockApi(page: Page, reply?: (body: Record<string, unknown>) => unknown) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true, token: "cozinha-e2e-token" } }),
  );
  await page.route("**/api/agent", (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    return reply ? route.fulfill({ json: reply(body) }) : route.abort();
  });
  return requests;
}

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "Personalizar alimentação", exact: true })
      .or(page.getByRole("heading", { name: "Olá, Pessoa." })),
  ).toBeVisible();
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
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
}

async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const request = indexedDB.open("webfit-personal-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("state", "readonly");
          const read = tx.objectStore("state").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(read.result as AppState);
          };
        };
      }),
  );
}

/** Perfil pronto para IA com a dieta estruturada criada hoje (dia 0 da rotação = plano original). */
function dietState(changes: Partial<Profile> = {}, plan = DIET_REPLY): AppState {
  const state = stateFixture();
  state.profile = { ...state.profile!, consentAi: true, ...changes };
  state.dietPlan = {
    ...createDietPlan(plan, state.profile),
    createdAt: new Date(`${today}T09:00:00`).toISOString(),
  };
  return state;
}

function withPantry(state: AppState, drafts: Partial<PantryDraft>[]): AppState {
  return savePantryDrafts(
    state,
    drafts.map((draft) => ({ ...emptyPantryDraft(draft.location ?? "despensa"), ...draft })),
    "manual",
  );
}

/** Receita estruturada atual: Arroz "1 xícara" e Tomate "2 unidades" da casa, Cebola a comprar, 25 min no passo 2. */
function recipeSetFor(items: Pick<PantryItem, "id" | "name">[], nome = "Arroz com tomate"): RecipeSet {
  return recipeSetSchema.parse({
    version: 2,
    receitas: [
      {
        nome,
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade: "Arroz e legumes, como no almoço da sua dieta.",
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

/** Grava uma geração de receitas atual (mesma dieta, perfil e estoque). */
function withRecipe(state: AppState): AppState {
  const set = recipeSetFor(state.pantry.slice(0, 2));
  return {
    ...state,
    kitchenBasics: ["sal"],
    recipes: [
      {
        id: "receita-atual",
        text: renderRecipeSetText(set),
        meta,
        createdAt: new Date().toISOString(),
        dietPlanId: state.dietPlan!.id,
        profileSignature: dietProfileSignature(state.profile!),
        pantrySignature: pantrySignature(state.pantry, ["sal"]),
        recipeSet: set,
      },
    ],
  };
}

async function openDieta(page: Page) {
  await page.getByRole("button", { name: "Ver minha dieta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minha dieta", exact: true })).toBeVisible();
}
async function openDespensa(page: Page) {
  await page.getByRole("button", { name: "Abrir despensa e receitas", exact: true }).click();
  await expect(page.getByRole("heading", { name: DESPENSA_TITLE, exact: true, level: 1 })).toBeVisible();
}

/** Atalho "Lista de compras" da Despensa: a folha da lista, com o foco no título. */
async function openShoppingSheet(page: Page) {
  await page.getByRole("button", { name: /^Lista de compras/ }).click();
  const sheet = page.getByRole("dialog", { name: "Lista de compras" });
  await expect(sheet.getByRole("heading", { name: "Lista de compras", exact: true })).toBeFocused();
  return sheet.getByTestId("shopping-list");
}

/**
 * Rotação do almoço de DIET_PLAN_V2 (diet-week.ts não entra aqui: importa a TACO, um JSON que o
 * carregador do Playwright não lê). Dia k depois da criação do plano: arroz usa a opção k mod 3
 * (branco, integral, batata) e feijão k mod 2 (carioca, lentilha); k mod 7 ∈ {0, 6} = plano original.
 */
const RICE = ["arroz branco cozido", "arroz integral cozido", "batata cozida"];
function rotation(date: string) {
  const days = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
  const k = (((days(date) - days(today)) % 7) + 7) % 7;
  return { hasVariation: k % 6 !== 0, rice: RICE[k % 3]! };
}

const lunchRow = (page: Page) => page.getByTestId("diet-timeline").locator(":scope > li").nth(1);
const toast = (page: Page) => page.locator(".toast");
const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const ids = (state: AppState) => state.diary[0]?.items?.map((item) => item.food.id);
const grams = (state: AppState) => state.diary[0]?.items?.map((item) => item.grams);

test("dieta: 'Registrar' registra do plano com Desfazer e marca 'Feita às'", async ({ page }) => {
  const requests = await mockApi(page);
  await page.clock.setFixedTime(NOON);
  await seed(page, dietState());
  await openDieta(page);
  const progress = page.getByTestId("plan-progress");
  await expect(progress).toHaveText("0 de 4 refeições hoje");
  await page.getByRole("button", { name: "Registrar Almoço", exact: true }).click();
  await expect(toast(page)).toContainText("Refeição registrada: Almoço, hoje às 12:41.");
  await expect(toast(page).getByRole("button", { name: "Desfazer" })).toBeVisible();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(1);
  const state = await saved(page);
  expect(state.diary[0]?.categoryTag).toBe("Almoço");
  expect(ids(state)).toEqual(["taco-3", "taco-561", "taco-410", "taco-78"]);
  expect(grams(state)).toEqual([100, 100, 100, 30]);
  await expect(lunchRow(page)).toContainText("Feita às 12:41");
  await expect(lunchRow(page).getByRole("button", { name: /^Registrar (Café|Almoço|Lanche|Jantar|Ceia)/ })).toHaveCount(0);
  await expect(progress).toContainText("1 de 4");
  await expect(page.getByTestId("diet-timeline").locator(":scope > li")).toHaveCount(4);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(0);
  await expect(page.getByRole("button", { name: "Registrar Almoço", exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("dieta: item sem TACO ou alérgeno leva à revisão; 'Ajustar' abre o prato sem salvar", async ({
  page,
}) => {
  await mockApi(page);
  await page.clock.setFixedTime(NOON);
  await seed(page, dietState());
  await openDieta(page);
  await page.getByRole("button", { name: "Registrar Café da manhã", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect(page.getByText(/café com leite/).first()).toBeVisible();
  expect((await saved(page)).diary).toHaveLength(0);

  await page.reload();
  await openDieta(page);
  // "Ajustar e registrar" é o botão de texto sob as ações do cartão (conceito 04: sem ⋯ no cabeçalho).
  await page.getByRole("button", { name: "Ajustar e registrar: Almoço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Seu prato · 4 itens", exact: true })).toBeVisible();
  expect((await saved(page)).diary).toHaveLength(0);

  await seed(page, dietState({ allergyDetails: "Tenho alergia a frango" }));
  await openDieta(page);
  await page.getByRole("button", { name: "Registrar Almoço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect(
    page.getByText(/Fora do prato por coincidir com alergia declarada: frango grelhado/).first(),
  ).toBeVisible();
  expect((await saved(page)).diary).toHaveLength(0);
});

test("dieta: 'Trocar' usa as trocas revisadas e 'Pedir outra opção' só preenche o chat", async ({
  page,
}) => {
  const requests = await mockApi(page);
  await page.clock.setFixedTime(NOON);
  await seed(page, dietState());
  await openDieta(page);
  const swap = page.getByRole("button", { name: "Trocar refeição: almoço", exact: true });
  await swap.click();
  await expect(lunchRow(page).getByRole("status")).toHaveText(
    "Almoço com trocas: arroz integral cozido e lentilha cozida.",
  );
  await expect(lunchRow(page).locator(".diet-swap-tag").first()).toHaveText(
    "no lugar de arroz branco cozido",
  );
  // A próxima refeição mostra o mesmo almoço trocado.
  await expect(page.getByTestId("next-meal")).toContainText("arroz integral cozido");
  await swap.click();
  await expect(lunchRow(page).getByRole("status")).toHaveText("Almoço com trocas: batata cozida.");
  await page.getByRole("button", { name: "Registrar Almoço", exact: true }).click();
  await expect.poll(async () => (await saved(page)).diary.length).toBe(1);
  const state = await saved(page);
  expect(ids(state)).toEqual(["taco-91", "taco-561", "taco-410", "taco-78"]);
  expect(grams(state)).toEqual([90, 100, 100, 30]);

  // O café já passou: fica recolhido (sem cobrança); abrir mostra as ações.
  await page.getByRole("button", { name: "Café da manhã", exact: true }).click();
  await page
    .getByRole("button", { name: "Pedir outra opção: Café da manhã", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue(
    /^Sugira outra opção de café da manhã/,
  );
  expect(requests).toHaveLength(0);

  await seed(page, dietState({ consentAi: false }));
  await openDieta(page);
  await expect(page.getByRole("button", { name: "Trocar refeição: almoço", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pedir outra opção/ })).toHaveCount(0);
});

test("semana: faixa S–D com ponto de variação, prévia sem registro e teclado", async ({ page }) => {
  await mockApi(page);
  await page.clock.setFixedTime(NOON);
  await seed(page, dietState());
  await openDieta(page);
  // Segunda a domingo da semana de hoje.
  const monday = shiftDate(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(monday, i);
    return { date, ...rotation(date) };
  });
  const group = page.getByRole("radiogroup", { name: "Semana do plano" });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(7);
  const todayRadio = group.getByRole("radio", { checked: true });
  await expect(todayRadio).toHaveAttribute("aria-label", /, hoje, /);
  const labels = await radios.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(labels.filter((label) => label.endsWith("com variação"))).toHaveLength(
    week.filter((day) => day.hasVariation).length,
  );

  const index = week.findIndex((day) => day.hasVariation);
  const target = week[index]!;
  await radios.nth(index).click();
  await expect(radios.nth(index)).toHaveAttribute("aria-checked", "true");
  await expect(lunchRow(page)).toContainText(target.rice);
  await expect(page.getByRole("button", { name: /^Registrar (Café|Almoço|Lanche|Jantar|Ceia)/ })).toHaveCount(0);
  await expect(page.locator(".diet-preview-note")).toHaveText(
    /^Prévia de \p{Ll}{3}, \d{1,2} \p{Ll}{3}: registre no próprio dia\.$/u,
  );
  await expect(page.getByTestId("plan-progress")).toHaveCount(0);
  // Na prévia não há "próxima": o registro só vale no próprio dia.
  await expect(page.getByTestId("next-meal")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth((index + 1) % 7)).toHaveAttribute("aria-checked", "true");
  await expect(radios.nth((index + 1) % 7)).toBeFocused();

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await fitsWidth(page)).toBe(true);
  for (const box of await radios.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ width: r.width, height: r.height })),
  )) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(36);
  }

  const plain = {
    ...DIET_REPLY,
    structured: {
      kind: "diet" as const,
      plan: {
        ...DIET_PLAN_V2,
        refeicoes: DIET_PLAN_V2.refeicoes.map((meal) => ({
          ...meal,
          itens: meal.itens.map((item) => ({ ...item, trocas: [] })),
        })),
      },
    },
  };
  await page.setViewportSize({ width: 1365, height: 950 });
  await seed(page, dietState({}, plain));
  await openDieta(page);
  await expect(page.getByTestId("diet-timeline")).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Semana do plano" })).toHaveCount(0);
});

test("perfil sensível: sem faixa '3 de 5', sem gramas e ações presentes", async ({ page }) => {
  await mockApi(page);
  await page.clock.setFixedTime(NOON);
  const minor = `${Number(today.slice(0, 4)) - 16}${today.slice(4)}`;
  for (const changes of [{ eatingDisorder: "sim" }, { birthDate: minor }] as Partial<Profile>[]) {
    await seed(page, dietState(changes));
    await openDieta(page);
    await expect(page.getByTestId("diet-timeline")).toBeVisible();
    await expect(page.getByTestId("plan-progress")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Registrar Almoço", exact: true })).toBeVisible();
    if (changes.eatingDisorder) await expect(page.getByText(/≈ \d+ g/)).toHaveCount(0);
    await page.getByRole("button", { name: "Registrar Almoço", exact: true }).click();
    await expect(toast(page)).toContainText("Refeição registrada: Almoço, hoje às 12:41.");
    await expect(page.locator('[data-testid="celebration"]')).toHaveCount(0);
  }
});

test("lista de compras: sugestões do plano e da receita, revisão, marcar e guardar na despensa", async ({
  page,
}) => {
  await mockApi(page);
  await page.clock.setFixedTime(NOON);
  const kitchen = (changes: Partial<Profile> = {}) =>
    withRecipe(
      withPantry(dietState(changes), [
        { name: "Arroz" },
        { name: "Tomate", location: "geladeira", expiresOn: shiftDate(today, 5) },
      ]),
    );
  await seed(page, kitchen({ allergyDetails: "Tenho alergia a lentilha" }));
  await openDieta(page);
  await page.getByRole("button", { name: "Montar lista de compras", exact: true }).click();
  let sheet = page.getByRole("dialog", { name: "Montar lista de compras" });
  await expect(sheet.getByRole("checkbox", { name: "Incluir Cebola", exact: true })).toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: /^Incluir Lentilha/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Cancelar" }).click();

  await seed(page, kitchen());
  await openDieta(page);
  await page.getByRole("button", { name: "Montar lista de compras", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Montar lista de compras" });
  // O localizador interno de `has` parte da linha: sem o escopo do diálogo.
  const tomato = page.getByRole("checkbox", { name: "Incluir Tomate", exact: true });
  await expect(sheet.locator(".shop-row", { has: tomato })).toContainText("Já tem na despensa");
  await expect(tomato).not.toBeChecked();
  const onion = page.getByRole("checkbox", { name: "Incluir Cebola", exact: true });
  await expect(onion).toBeChecked();
  await expect(sheet.locator(".shop-row", { has: onion })).toContainText("Receita: Arroz com tomate");
  const add = sheet.getByRole("button", { name: /^Adicionar \d+ itens$/ });
  const n = Number((await add.textContent())!.match(/\d+/)![0]);
  expect(n).toBeGreaterThan(1);
  await add.click();
  await expect(toast(page)).toContainText(`${n} itens na lista de compras.`);
  await expect.poll(async () => (await saved(page)).shoppingList.length).toBe(n);

  await page.getByRole("button", { name: `Ver lista: ${n} itens na lista`, exact: true }).click();
  const listSheet = page.getByRole("dialog", { name: "Lista de compras" });
  await expect(listSheet.getByRole("heading", { name: "Lista de compras", exact: true })).toBeFocused();
  const list = listSheet.getByTestId("shopping-list");
  for (const section of ["Hortifrúti", "Mercearia"])
    await expect(list.getByRole("heading", { name: section, exact: true })).toBeVisible();
  // click + toBeChecked (nunca .check()): a marca é salva de forma assíncrona antes do novo render.
  const bought = list.getByRole("checkbox", { name: "Cebola", exact: true });
  await bought.click();
  await expect(bought).toBeChecked();
  await expect.poll(async () => (await saved(page)).shoppingList.find((i) => i.name === "Cebola")?.checked).toBe(true);
  await expect(list.getByText(`1 de ${n} comprados`, { exact: true })).toBeVisible();
  const rows = await list
    .locator(".shop-row")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const height of rows) expect(height).toBeGreaterThanOrEqual(44);

  await list.getByRole("button", { name: "Guardar comprados na despensa" }).click();
  await expect(
    page.getByRole("heading", { name: "Revise os itens antes de salvar", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome do item 1", { exact: true })).toHaveValue("Cebola");
  await page.getByRole("button", { name: "Confirmar e salvar itens" }).click();
  await expect(toast(page)).toContainText("Comprados guardados na despensa.");
  await expect.poll(async () => (await saved(page)).shoppingList.length).toBe(n - 1);
  const state = await saved(page);
  expect(state.pantry.find((item) => item.name === "Cebola")?.source).toBe("shopping_list");
  expect(state.shoppingList.some((item) => item.name === "Cebola")).toBe(false);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await fitsWidth(page)).toBe(true);
});

test("lista de compras: manual, remover com Desfazer, compartilhar e calorias ocultas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData }).__shared = data;
      },
    });
  });
  await mockApi(page);
  const state = stateFixture();
  state.profile = { ...state.profile!, hideCalories: true };
  await seed(page, state);
  await openDespensa(page);
  const list = await openShoppingSheet(page);
  await expect(list.getByText("Sua lista está vazia.", { exact: true })).toBeVisible();
  await list.getByLabel("Adicionar item à lista", { exact: true }).fill("Barra 90 kcal");
  await list.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(list.getByText("Barra calorias ocultas", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Compartilhar lista de compras" }).click();
  const shared = await page.evaluate(
    () => (window as unknown as { __shared?: ShareData }).__shared ?? null,
  );
  expect(shared?.title).toBe("Lista de compras");
  expect(shared?.text).toMatch(/^Lista de compras/);
  expect(shared?.text).not.toMatch(/kcal/i);

  await list.getByRole("button", { name: "Remover Barra calorias ocultas da lista" }).click();
  await expect(toast(page)).toContainText("Barra calorias ocultas removido da lista.");
  await expect(list.getByText("Barra calorias ocultas", { exact: true })).toHaveCount(0);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(list.getByText("Barra calorias ocultas", { exact: true })).toBeVisible();

  // Sem Web Share: copia para a área de transferência.
  await page.evaluate(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
        },
      },
    });
  });
  await list.getByRole("button", { name: "Compartilhar lista de compras" }).click();
  await expect(toast(page)).toContainText("Lista copiada.");
  expect(await page.evaluate(() => (window as unknown as { __copied: string }).__copied)).not.toMatch(
    /kcal/i,
  );
  const labels = await page
    .locator("[aria-label]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(labels.filter((label) => /kcal/i.test(label))).toEqual([]);
});

test("use primeiro: cartão na Despensa e no Hoje, 'Agora não' até amanhã e receitas com eles", async ({
  page,
}) => {
  const requests = await mockApi(page, (body) => {
    const context = body.context as { pantry: PantryItem[] };
    const set = recipeSetFor(context.pantry.slice(0, 2), "Iogurte com tomate");
    const unbasic = { ...set, receitas: set.receitas.map((card) => ({ ...card, basicos: [] })) };
    return { text: renderRecipeSetText(unbasic), meta, structured: { kind: "recipes", set: unbasic } };
  });
  await page.clock.setFixedTime(NOON);
  const state = withPantry(dietState(), [
    { name: "Iogurte", location: "geladeira", expiresOn: shiftDate(today, 2) },
    { name: "Tomate", location: "geladeira", expiresOn: shiftDate(today, 2) },
    { name: "Queijo", location: "geladeira", expiresOn: shiftDate(today, 10) },
    { name: "Leite", location: "geladeira", expiresOn: shiftDate(today, -1) },
  ]);
  await seed(page, state);
  const strip = page.getByTestId("use-first-hoje");
  await expect(strip.getByRole("heading", { level: 3, name: "Use primeiro", exact: true })).toBeVisible();
  await expect(strip.getByTestId("use-first-chip")).toHaveCount(2);
  const [, mm, dd] = shiftDate(today, 2).split("-");
  await expect(strip.getByTestId("use-first-chip").first().locator(".sr-only")).toHaveText(
    `Iogurte, vence em 2 dias, ${dd}/${mm}`,
  );
  await expect(
    page.getByText("3 alimentos disponíveis para suas receitas. 1 vencido fica de fora.", {
      exact: true,
    }),
  ).toBeVisible();
  const chipColors = await strip.getByTestId("use-first-chip").evaluateAll((els) => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const rose = ["50", "200", "400", "600", "700", "800"].map((step) => {
      probe.style.color = `var(--wf-rose-${step})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return els.flatMap((el) => {
      const style = getComputedStyle(el);
      return [style.color, style.backgroundColor].filter((color) => rose.includes(color));
    });
  });
  expect(chipColors).toEqual([]);

  await page.getByRole("button", { name: "Agora não: ocultar Use primeiro até amanhã" }).click();
  await expect(strip).toHaveCount(0);
  await expect(toast(page)).toContainText("Use primeiro oculto até amanhã.");
  await expect
    .poll(async () => (await saved(page)).readNotifications)
    .toContain(`${today}:despensa`);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByTestId("use-first-hoje")).toBeVisible();

  await page.getByRole("button", { name: "Receitas com eles", exact: true }).click();
  const card = page.getByTestId("use-first-card");
  await expect(card.getByRole("heading", { name: "Use primeiro", exact: true })).toBeFocused();
  await expect(page.locator('[data-testid="pantry-row"] h3')).toHaveText([
    "Leite",
    "Iogurte",
    "Tomate",
    "Queijo",
  ]);
  // Uma pílula de validade nos utilizáveis; o vencido tem a sua ("Venceu ontem"), fora da contagem.
  const pills = page.getByTestId("pantry-row").locator('[data-testid^="pantry-expiry-"]');
  await expect(pills).toHaveCount(3);
  await expect(
    page.getByTestId("pantry-row").filter({ hasText: "Leite" }).locator('[data-testid^="pantry-expiry-"]'),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "Criar receitas com eles", exact: true }).click();
  await expect(
    page.getByTestId("recipe-card").getByRole("heading", { name: "Iogurte com tomate", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.mode).toBe("recipe");
  expect(requests[0]!.text).toContain("Priorize os alimentos que vencem");
  expect(requests[0]!.text).not.toContain("Iogurte");
});

test("lembrete das 10:00: 'Use primeiro' na central abre a Despensa", async ({ page }) => {
  await mockApi(page);
  const remind = (): AppState => {
    const state = withPantry(stateFixture(), [
      { name: "Iogurte", location: "geladeira", expiresOn: shiftDate(today, 2) },
    ]);
    return {
      ...state,
      profile: { ...state.profile!, remindersEnabled: true, quietStart: "00:00", quietEnd: "00:00" },
    };
  };
  await page.clock.setFixedTime(`${today}T10:05:00`);
  await seed(page, remind());
  await page.getByRole("button", { name: /^Notificações/ }).click();
  const card = page.locator('[data-testid="reminder-card"][data-type="despensa"]');
  await expect(card.getByRole("heading", { level: 3, name: "Use primeiro", exact: true })).toBeVisible();
  await expect(card).not.toContainText("Iogurte");
  await card.getByRole("button", { name: "Abrir registro" }).click();
  await expect(page.getByRole("heading", { name: DESPENSA_TITLE, exact: true, level: 1 })).toBeVisible();

  await page.clock.setFixedTime(`${today}T09:30:00`);
  await seed(page, remind());
  await page.getByRole("button", { name: /^Notificações/ }).click();
  const row = page
    .getByTestId("reminder-section-hoje")
    .locator('[data-testid="reminder-row"][data-type="despensa"]');
  await expect(row.locator(".reminder-row-when")).toHaveText("Às 10:00");
  await expect(row).toContainText("Use primeiro");
});

test("modo preparo: tela cheia navy, timer, tela acesa e descontar da despensa", async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as unknown as { __wake: number; __wakeReleased: boolean };
    win.__wake = 0;
    win.__wakeReleased = false;
    Object.defineProperty(Navigator.prototype, "wakeLock", {
      configurable: true,
      get: () => ({
        request: async () => {
          win.__wake += 1;
          const sentinel = {
            released: false,
            release: async () => {
              sentinel.released = true;
              win.__wakeReleased = true;
            },
            addEventListener: () => undefined,
          };
          return sentinel;
        },
      }),
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: `${today}T12:00:00` });
  await mockApi(page);
  const state = withRecipe(
    withPantry(dietState(), [
      { name: "Arroz", quantity: 1, unit: "kg" },
      { name: "Tomate", location: "geladeira", quantity: 3, unit: "un", expiresOn: shiftDate(today, 2) },
    ]),
  );
  await seed(page, state);
  await openDespensa(page);
  await page.getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Arroz com tomate", exact: true });
  await dialog.getByRole("button", { name: "Começar modo preparo" }).click();
  await expect(dialog).toHaveClass(/is-cooking/);
  const colors = await dialog.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--wf-inverse)";
    document.body.append(probe);
    const inverse = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { dialog: getComputedStyle(el).backgroundColor, inverse };
  });
  expect(colors.dialog).toBe(colors.inverse);
  const size = await dialog
    .locator(".recipe-step-text")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(24);
  await expect(dialog.getByRole("heading", { name: "Passo 1 de 2" })).toBeFocused();
  await expect(dialog.getByText("Tela acesa", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __wake: number }).__wake)).toBe(1);

  await dialog.getByRole("button", { name: "Próximo passo" }).click();
  const timer = dialog.getByTestId("cook-timer");
  await expect(timer).toContainText("25:00");
  await expect(dialog.getByText("25 min", { exact: true })).toHaveCount(1);
  // Relógio parado: só runFor avança o tempo (o texto do timer fica exato entre as checagens).
  await page.clock.pauseAt(new Date(`${today}T12:30:00`));
  await dialog.getByRole("button", { name: "Iniciar timer de 25 min" }).click();
  await page.clock.runFor(60_000);
  await expect(timer).toContainText("24:00");
  const transition = await dialog
    .locator(".cook-ring-fill")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toBe("0s");
  await dialog.getByRole("button", { name: "Pausar timer" }).click();
  await page.clock.runFor(60_000);
  await expect(timer).toContainText("24:00");
  await dialog.getByRole("button", { name: "Continuar timer" }).click();
  await page.clock.runFor(24 * 60_000);
  await expect(timer).toContainText("0:00");
  await expect(dialog.getByText("Tempo do passo 2 concluído.", { exact: true })).toHaveCount(1);

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await fitsWidth(page)).toBe(true);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1365, height: 950 });

  await dialog.getByRole("button", { name: "Descontar da despensa" }).click();
  const sheet = page.getByRole("dialog", { name: "Descontar da despensa" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("group", { name: "O que ficou de Tomate" }).getByRole("button", { name: "Sobrou" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("1 unidade", { exact: true })).toBeVisible();
  await expect(
    sheet.getByRole("group", { name: "O que ficou de Arroz" }).getByRole("button", { name: "Não mexer" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("1 item será atualizado.", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Atualizar despensa" }).click();
  await expect(toast(page)).toContainText("Despensa atualizada.");
  await expect
    .poll(async () => (await saved(page)).pantry.find((item) => item.name === "Tomate")?.quantity)
    .toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { __wakeReleased: boolean }).__wakeReleased),
  ).toBe(true);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect
    .poll(async () => (await saved(page)).pantry.find((item) => item.name === "Tomate")?.quantity)
    .toBe(3);

  await page.getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true }).click();
  await dialog.getByRole("button", { name: "Começar modo preparo" }).click();
  await dialog.getByRole("button", { name: "Próximo passo" }).click();
  await dialog.getByRole("button", { name: "Concluir preparo" }).click();
  await expect(dialog.getByRole("button", { name: "Começar modo preparo" })).toBeFocused();
  await expect(dialog).not.toHaveClass(/is-cooking/);
});

test("modo preparo sem Wake Lock: aviso discreto e nenhum erro", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    delete (Navigator.prototype as { wakeLock?: unknown }).wakeLock;
  });
  await mockApi(page);
  const state = withRecipe(
    withPantry(dietState(), [
      { name: "Arroz", quantity: 1, unit: "kg" },
      { name: "Tomate", location: "geladeira", quantity: 3, unit: "un" },
    ]),
  );
  await seed(page, state);
  await openDespensa(page);
  await page.getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Arroz com tomate", exact: true });
  await dialog.getByRole("button", { name: "Começar modo preparo" }).click();
  const hint = dialog.getByText("Se a tela apagar, toque nela para continuar.", { exact: true });
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(12);
  await expect(dialog.getByText("Tela acesa", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** Dois cliques no mesmo toque (antes do novo render): o que um toque duplo faz no aparelho. */
const doubleTap = (locator: Locator) =>
  locator.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
const pantryLines = async (page: Page) =>
  (await saved(page)).pantry.map((item) => `${item.name}:${item.quantity}${item.unit}`).sort();

test("descontar da despensa: toque duplo desconta uma vez e Desfazer devolve o que acabou", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  const state = withRecipe(
    withPantry(dietState(), [
      { name: "Arroz", quantity: 1, unit: "kg" },
      { name: "Tomate", location: "geladeira", quantity: 3, unit: "un" },
    ]),
  );
  await seed(page, state);
  await openDespensa(page);
  await page.getByRole("button", { name: "Modo preparo: Arroz com tomate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Arroz com tomate", exact: true });
  await dialog.getByRole("button", { name: "Começar modo preparo" }).click();
  await dialog.getByRole("button", { name: "Próximo passo" }).click();
  await dialog.getByRole("button", { name: "Descontar da despensa" }).click();
  const sheet = page.getByRole("dialog", { name: "Descontar da despensa" });
  const gone = sheet.getByRole("group", { name: "O que ficou de Arroz" }).getByRole("button", { name: "Acabou" });
  await gone.click();
  await expect(gone).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("2 itens serão atualizados.", { exact: true })).toBeVisible();
  const revision = (await saved(page)).revision;

  await doubleTap(sheet.getByRole("button", { name: "Atualizar despensa" }));
  await expect(toast(page)).toContainText("Despensa atualizada.");
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => pantryLines(page)).toEqual(["Tomate:1un"]);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(toast(page)).toContainText("Despensa como antes.");
  // O que "Acabou" volta com a quantidade de antes (o segundo toque não gravou outro desconto).
  await expect.poll(() => pantryLines(page)).toEqual(["Arroz:1kg", "Tomate:3un"]);
  expect((await saved(page)).revision).toBe(revision + 2);
});

test("lista de compras: toque duplo inclui uma vez, Desfazer limpa e a marca ainda salvando volta", async ({
  page,
}) => {
  await mockApi(page);
  await page.clock.setFixedTime(NOON);
  await seed(
    page,
    withRecipe(
      withPantry(dietState(), [
        { name: "Arroz" },
        { name: "Tomate", location: "geladeira", expiresOn: shiftDate(today, 5) },
      ]),
    ),
  );
  await openDespensa(page);
  const list = await openShoppingSheet(page);
  const names = async () => (await saved(page)).shoppingList.map((item) => item.name);

  // À mão: "Adicionar" duas vezes no mesmo toque (ou Enter duas vezes) inclui o item uma vez.
  const field = list.getByLabel("Adicionar item à lista", { exact: true });
  await field.fill("Sabão em pó");
  await doubleTap(list.getByRole("button", { name: "Adicionar", exact: true }));
  await expect(toast(page)).toContainText("1 item na lista de compras.");
  await expect(field).toHaveValue("");
  await expect.poll(names).toEqual(["Sabão em pó"]);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(names).toEqual([]);

  // Sugestões: "Adicionar N itens" duas vezes grava a lista uma vez; o Desfazer tira tudo.
  await list.getByRole("button", { name: "Montar lista de compras", exact: true }).click();
  let suggest = page.getByRole("dialog", { name: "Montar lista de compras" });
  let add = suggest.getByRole("button", { name: /^Adicionar \d+ itens$/ });
  const n = Number((await add.textContent())!.match(/\d+/)![0]);
  await doubleTap(add);
  await expect(toast(page)).toContainText(`${n} itens na lista de compras.`);
  await expect(suggest).toHaveCount(0);
  await expect.poll(async () => (await names()).length).toBe(n);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(names).toEqual([]);

  // Marcar e remover no mesmo toque: o "Desfazer" devolve o item marcado (retrato de dentro do commit).
  await list.getByRole("button", { name: "Montar lista de compras", exact: true }).click();
  suggest = page.getByRole("dialog", { name: "Montar lista de compras" });
  add = suggest.getByRole("button", { name: /^Adicionar \d+ itens$/ });
  await add.click();
  await expect.poll(async () => (await names()).length).toBe(n);
  await list
    .locator(".shop-row", { has: page.getByRole("checkbox", { name: "Cebola", exact: true }) })
    .evaluate((row) => {
      row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      row.querySelector<HTMLButtonElement>("button.shop-remove")!.click();
    });
  await expect(toast(page)).toContainText("Cebola removido da lista.");
  await expect.poll(async () => (await names()).includes("Cebola")).toBe(false);
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect
    .poll(async () => (await saved(page)).shoppingList.find((item) => item.name === "Cebola")?.checked)
    .toBe(true);
  await expect(list.getByRole("checkbox", { name: "Cebola", exact: true })).toBeChecked();
});
