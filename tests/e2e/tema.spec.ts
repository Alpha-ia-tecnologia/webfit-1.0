import { test, expect, type Browser, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals, shiftDate, uid } from "../../src/lib/domain";
import { diarySchema, type AppState, type DiaryEntry, type FoodItem } from "../../src/types";
import { contrastIssues } from "./contrast";
import { EVOLUCAO_TITLE, SETTINGS_TAB } from "../../src/lib/copy";

/**
 * Onda 3 · Lote 4 · HOJE-X2: tema escuro no web. "Sistema" segue o aparelho só com CSS; "Claro" e
 * "Escuro" (Meu espaço › Preferências e dados › Aparência) fixam o tema neste aparelho. O escuro
 * não pode criar falha de contraste que o claro não tenha, nem pintar de vermelho meta passada ou
 * dose atrasada; a seringa continua sobre papel claro. Relógio fixo às 13:00 de hoje.
 */
const today = localDate();
const DARK = {
  bg: "rgb(11, 18, 32)",
  surface: "rgb(17, 26, 43)",
  header: "rgba(17, 26, 43, 0.85)",
  danger: "rgb(251, 113, 133)",
  medication: "rgb(196, 181, 253)",
  paper: "rgb(230, 237, 247)",
};
const LIGHT = { bg: "rgb(246, 248, 251)", surface: "rgb(255, 255, 255)", header: "rgba(255, 255, 255, 0.85)" };

type Raw = Record<string, unknown>;

const bread: FoodItem = {
  id: "test-pao",
  name: "Pão do teste",
  category: "Cereais",
  caloriesPer100g: 280,
  proteinPer100g: 8,
  carbsPer100g: 55,
  fatPer100g: 3,
  source: "Tabela de teste",
};

function diaryEntry(fields: Raw): DiaryEntry {
  const time = String(fields.time);
  return diarySchema.parse({
    userId: "seed",
    date: today,
    createdAt: `${today}T${time}:00.000Z`,
    updatedAt: `${today}T${time}:00.000Z`,
    description: "",
    ...fields,
  });
}

/** Lembretes ligados, café e 500 ml de água, dois combinados e oito pesagens semanais. */
function baseState(grams = 80): AppState {
  const state = stateFixture();
  const items = [{ food: bread, grams }];
  return {
    ...state,
    profile: { ...state.profile!, remindersEnabled: true, targetWeight: 66 },
    measurements: Array.from({ length: 8 }, (_, i) => ({
      ...state.measurements[0]!,
      id: uid(),
      date: shiftDate(today, -7 * (8 - i)),
      weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
    })),
    diary: [
      diaryEntry({
        id: "cafe1",
        userId: state.userId,
        time: "08:10",
        type: "refeicao",
        title: "Café da manhã",
        categoryTag: "Café da manhã",
        items,
        ...mealTotals(items),
      }),
      diaryEntry({ id: "agua1", userId: state.userId, time: "10:00", type: "agua", title: "Água", amountMl: 500 }),
    ],
    habits: [
      { id: "h1", title: "Caminhar 20 minutos", timeOfDay: "12:00", createdDate: shiftDate(today, -3), completedDates: [] },
      { id: "h2", title: "Chá calmante", timeOfDay: "21:30", createdDate: shiftDate(today, -3), completedDates: [today] },
    ],
  };
}

/** Caneta semanal com a última aplicação (Tirzepatida 50 UI na seringa de 100 UI) há `daysAgo` dias. */
function penState(daysAgo: number): AppState {
  const state = baseState();
  const date = shiftDate(today, -daysAgo);
  const injection = {
    id: `inj-${daysAgo}`,
    userId: state.userId,
    date,
    time: "08:30",
    createdAt: `${date}T08:30:00.000Z`,
    updatedAt: `${date}T08:30:00.000Z`,
    method: "frasco",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
    side: null,
    notes: "",
  };
  return {
    ...state,
    profile: {
      ...state.profile!,
      weightLossPen: "sim",
      weightLossPenName: "Tirzepatida",
      weightLossPenDose: "2,5 mg",
      weightLossPenPerMonth: 4,
      pregnancy: "nao",
    },
    injections: [injection],
  } as unknown as AppState;
}

async function seed(page: Page, state: AppState) {
  await page.clock.setFixedTime(`${today}T13:00:00`);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: false, token: "test-token" } }),
  );
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
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
}

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const backgroundOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);
/** Cabeçalho sem barra no topo (fundo da página); depois de rolar, o vidro do tema, a mesma cor de antes. */
async function expectHeaderGlass(page: Page, glass: string) {
  await expect.poll(() => backgroundOf(page, ".app-header")).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator(".app-header.is-scrolled")).toHaveCount(1);
  // A troca tem transição curta: espera a cor assentar.
  await expect.poll(() => backgroundOf(page, ".app-header")).toBe(glass);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openPreferences(page: Page) {
  await page.getByRole("navigation").getByRole("button", { name: "Meu espaço", exact: true }).click();
  await page.getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true }).click();
}

test.describe("Sistema escuro", () => {
  test.use({ colorScheme: "dark" });

  test("segue o aparelho sem data-theme: fundo, cartão, cabeçalho de vidro e meta do navegador", async ({ page }) => {
    await seed(page, baseState());
    expect(await bodyBackground(page)).toBe(DARK.bg);
    expect(await backgroundOf(page, ".card")).toBe(DARK.surface);
    await expectHeaderGlass(page, DARK.header);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    expect(await themeAttr(page)).toBeNull();
    const meta = await page
      .locator('meta[name="theme-color"][media*="dark"]')
      .getAttribute("content");
    expect(meta?.toLowerCase()).toBe("#0b1220");
    expect(await page.locator('meta[name="color-scheme"]').getAttribute("content")).toBe("light dark");
  });

  test("dia acima da meta e dose atrasada nunca em vermelho; seringa sobre papel", async ({ page }) => {
    await seed(page, baseState(800));
    await expect(page.getByTestId("calories-total")).toBeVisible();
    const reds = (root: string) =>
      page.evaluate(
        ({ root, danger }) =>
          [...document.querySelectorAll(`${root}, ${root} *`)].flatMap((el) => {
            const s = getComputedStyle(el);
            return [s.color, s.backgroundColor, s.fill, s.stroke, s.borderTopColor]
              .filter((value) => value === danger)
              .map(() => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
          }),
        { root, danger: DARK.danger },
      );
    expect(await reds(".day-hero")).toEqual([]);
    expect(await reds("main")).toEqual([]);

    await seed(page, penState(9));
    await expect(page.locator(".dose-ring-fill").first()).toBeAttached();
    const fills = await page
      .locator(".dose-ring-fill")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) expect(fill).toBe(DARK.medication);
    expect(await reds("main")).toEqual([]);

    await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
    await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
    const other = page.getByRole("button", { name: "Outra dose ou frasco novo" });
    const lens = page.getByTestId("syringe-lens");
    // A tela carrega sob demanda: espera o corpo (dose de sempre ou lente) antes de decidir.
    await expect(other.or(lens).first()).toBeVisible();
    if (await other.count()) await other.click();
    await expect(lens).toBeVisible();
    expect(await backgroundOf(page, ".inj-lens")).toBe(DARK.paper);
  });

  test("360 px: Hoje e Lembretes sem rolagem lateral", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await seed(page, baseState());
    const noSideScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await bodyBackground(page)).toBe(DARK.bg);
    expect(await noSideScroll()).toBe(true);
    await page.getByRole("button", { name: /^Notificações/ }).click();
    await expect(page.getByTestId("reminder-section-agora")).toBeVisible();
    expect(await noSideScroll()).toBe(true);
  });
});

test("Sistema claro: fundo, cartão e cabeçalho como antes", async ({ page }) => {
  await seed(page, baseState());
  expect(await bodyBackground(page)).toBe(LIGHT.bg);
  expect(await backgroundOf(page, ".card")).toBe(LIGHT.surface);
  await expectHeaderGlass(page, LIGHT.header);
  expect(await themeAttr(page)).toBeNull();
});

test("Aparência: Sistema, Claro e Escuro valem na hora, ficam no aparelho e sobrevivem ao recarregar", async ({
  page,
  browser,
}) => {
  await seed(page, baseState());
  await openPreferences(page);
  const row = page.getByRole("button", { name: /^Aparência/ });
  await expect(row).toContainText("Sistema");
  await expect(row).toHaveAttribute("aria-haspopup", "dialog");
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Aparência" });
  await expect(sheet).toContainText("Vale só para este aparelho.");
  const group = sheet.getByRole("radiogroup", { name: "Tema" });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await expect(group.getByRole("radio", { name: "Sistema" })).toHaveAttribute("aria-checked", "true");

  await group.getByRole("radio", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe(DARK.bg);
  expect(await page.evaluate(() => localStorage.getItem("webfit-theme"))).toBe("escuro");
  expect(await page.locator('meta[name="color-scheme"]').getAttribute("content")).toBe("dark");
  expect(
    await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("content"))),
  ).toEqual(["#0b1220", "#0b1220"]);
  // Nenhum aviso ao trocar: andar pelas opções não empilha toasts.
  await expect(page.locator(".toast")).toHaveCount(0);

  await page.keyboard.press("ArrowUp");
  await expect(group.getByRole("radio", { name: "Claro" })).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio", { name: "Claro" })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(page)).toBe(LIGHT.bg);

  await sheet.getByRole("button", { name: "Fechar" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText("Claro");
  await expect(row).toBeFocused();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await openPreferences(page);
  await expect(page.getByRole("button", { name: /^Aparência/ })).toContainText("Claro");

  // Aparelho no escuro: "Claro" continua claro; "Sistema" solta o atributo e acompanha o aparelho.
  const dark = await browser.newContext({ colorScheme: "dark" });
  const other = await dark.newPage();
  await other.addInitScript(() => localStorage.setItem("webfit-theme", "claro"));
  await seed(other, baseState());
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(other)).toBe(LIGHT.bg);
  await openPreferences(other);
  await other.getByRole("button", { name: /^Aparência/ }).click();
  await other.getByRole("dialog", { name: "Aparência" }).getByRole("radio", { name: "Sistema" }).click();
  expect(await themeAttr(other)).toBeNull();
  expect(await bodyBackground(other)).toBe(DARK.bg);
  await dark.close();
});

/** Chaves de contraste por tela; "tela::chave" para comparar claro e escuro. */
async function sweep(browser: Browser, colorScheme: "light" | "dark"): Promise<string[]> {
  const context = await browser.newContext({
    colorScheme,
    viewport: { width: 1365, height: 950 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const keys: string[] = [];
  const collect = async (screen: string, root?: string) => {
    // Telas sob demanda: mede a tela carregada, não o esqueleto que aparece enquanto ela chega.
    await expect(page.locator(".screen-fallback")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const issue of await contrastIssues(page, root)) keys.push(`${screen}::${issue.key}`);
  };
  const nav = (name: string) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true });

  await seed(page, baseState());
  await collect("hoje");
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Registro rápido" })).toBeVisible();
  await collect("registro-rapido", '[role="dialog"]');
  await page.keyboard.press("Escape");
  await nav("Diário").click();
  await expect(page.getByRole("heading", { name: "Meu diário" })).toBeVisible();
  await collect("diario");
  await nav("Evolução").click();
  await expect(page.getByRole("heading", { name: EVOLUCAO_TITLE, level: 1 })).toBeVisible();
  await collect("evolucao");
  await nav("Meu espaço").click();
  await collect("espaco-saude");
  await page.getByRole("button", { name: "Exames e consultas", exact: true }).click();
  await collect("espaco-exames");
  await page.getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true }).click();
  await collect("espaco-dados");
  await page.getByRole("button", { name: /^Aparência/ }).click();
  await expect(page.getByRole("dialog", { name: "Aparência" })).toBeVisible();
  await collect("aparencia", '[role="dialog"]');
  await page.keyboard.press("Escape");
  await nav("Meu agente").click();
  await expect(page.getByRole("heading", { name: "Meu agente" }).first()).toBeVisible();
  await collect("agente");
  await nav("Hoje").click();
  await page.getByRole("button", { name: /^Notificações/ }).click();
  await expect(page.getByTestId("reminder-section-agora")).toBeVisible();
  await collect("lembretes");

  await seed(page, penState(7));
  await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
  await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
  const other = page.getByRole("button", { name: "Outra dose ou frasco novo" });
  const lens = page.getByTestId("syringe-lens");
  // A tela carrega sob demanda: mede o corpo (dose de sempre ou lente), não o esqueleto.
  await expect(other.or(lens).first()).toBeVisible();
  await collect("seringa-receita");
  if (await other.count()) await other.click();
  await expect(lens).toBeVisible();
  await collect("seringa");
  await context.close();
  return keys;
}

test("AA: o tema escuro não cria falha de contraste que o claro não tenha", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const light = await sweep(browser, "light");
  const dark = await sweep(browser, "dark");
  await testInfo.attach("contraste-claro.json", {
    body: JSON.stringify(light, null, 1),
    contentType: "application/json",
  });
  await testInfo.attach("contraste-escuro.json", {
    body: JSON.stringify(dark, null, 1),
    contentType: "application/json",
  });
  const known = new Set(light);
  expect(dark.filter((key) => !known.has(key))).toEqual([]);
});
