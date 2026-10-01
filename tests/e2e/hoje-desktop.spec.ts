import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals } from "../../src/lib/domain";
import { diarySchema, type AppState, type FoodItem } from "../../src/types";

/**
 * SIS-12: Hoje em grade de 12 colunas a partir de 1024 px (pares, pilhas ou linha inteira, sempre na
 * ordem do DOM) e a tecla N para o "Registro rápido".
 */

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

function seedState(homeLayout = ""): AppState {
  const state = stateFixture();
  state.profile = { ...state.profile!, homeLayout };
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
  await expect(page.getByTestId("hoje-grid")).toBeVisible();
  await animationsDone(page);
}
/** Os cartões entram com um leve deslize (stagger): mede só depois que ele termina. */
const animationsDone = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)))
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, selector: string): Promise<Box> => {
  const found = await page.locator(selector).first().boundingBox();
  if (!found) throw new Error(`sem caixa: ${selector}`);
  return found;
};
/** Espera dois quadros: dá tempo de o React desenhar antes de afirmar que algo NÃO abriu. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const hasSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const slots = (page: Page) =>
  page.locator(".hoje-slot").evaluateAll((items) =>
    items.map((item) => ({
      section: item.getAttribute("data-section"),
      span: item.getAttribute("data-span"),
      rows: item.getAttribute("data-rows") ?? "1",
    })),
  );
type Cell = { section: string; x: number; y: number; right: number; bottom: number };
const cells = async (page: Page): Promise<Record<string, Cell>> => {
  const list: Cell[] = await page.locator(".hoje-slot").evaluateAll((items) =>
    items.map((item) => {
      const r = item.getBoundingClientRect();
      return { section: item.getAttribute("data-section")!, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }),
  );
  // Leitura de cima para baixo e da esquerda para a direita = ordem do DOM.
  const reading = [...list].sort((a, b) => a.y - b.y || a.x - b.x).map((cell) => cell.section);
  expect(reading).toEqual(list.map((cell) => cell.section));
  return Object.fromEntries(list.map((cell) => [cell.section, cell]));
};
/** Pilha sem buraco: o alto ao lado de dois empilhados, com topo e base alinhados. */
function expectStack(tall: Cell, top: Cell, bottom: Cell) {
  expect(Math.abs(tall.y - top.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(tall.bottom - bottom.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(top.x - bottom.x)).toBeLessThanOrEqual(1);
  expect(bottom.y).toBeGreaterThan(top.bottom);
}
/**
 * Maior faixa vertical sem conteúdo dentro de cada cartão da grade, em % da altura do cartão:
 * texto, ícones, botões e gráficos contam como conteúdo; o resto é o que sobrou de esticar.
 */
const emptiest = (page: Page) =>
  page.locator(".hoje-slot > *").evaluateAll((cards) =>
    cards.map((card) => {
      const spans: { top: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) if (r.height > 0) spans.push(r);
      }
      for (const el of card.querySelectorAll("svg, button, [role=img]")) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) spans.push(r);
      }
      spans.sort((a, b) => a.top - b.top);
      const box = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      let cursor = box.top + parseFloat(style.paddingTop);
      let gap = 0;
      for (const r of spans) {
        gap = Math.max(gap, r.top - cursor);
        cursor = Math.max(cursor, r.bottom);
      }
      gap = Math.max(gap, box.bottom - parseFloat(style.paddingBottom) - cursor);
      return { section: card.parentElement!.getAttribute("data-section"), percent: Math.round((100 * gap) / box.height) };
    }),
  );

test("a 1365 px o Hoje vira grade de 12 colunas, em pares e pilhas, sem buracos", async ({ page }) => {
  await seed(page, seedState());
  const grid = page.getByTestId("hoje-grid");
  const tracks = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(tracks).toBe(12);

  const hero = await box(page, ".hoje-grid > .day-hero");
  const side = await box(page, ".hoje-grid > .hoje-lead-side");
  expect(Math.abs(hero.y - side.y)).toBeLessThanOrEqual(1);
  expect(hero.width).toBeGreaterThan(1.7 * side.width);

  // Padrão do conceito (bem-estar e água ocultos): refeições e a linha da dieta empilhadas ao lado dos
  // combinados (vazios, os mais altos); a linha da despensa fecha na largura toda.
  expect(await slots(page)).toEqual([
    { section: "meals", span: "7", rows: "1" },
    { section: "habits", span: "5", rows: "2" },
    { section: "diet", span: "7", rows: "1" },
    { section: "pantry", span: "12", rows: "1" },
  ]);
  const at = await cells(page);
  expectStack(at.habits!, at.meals!, at.diet!);
  expect(at.meals!.x).toBeLessThan(at.habits!.x);

  const edit = await box(page, ".home-edit");
  const whole = (await grid.boundingBox())!;
  expect(Math.abs(edit.x + edit.width / 2 - (whole.x + whole.width / 2))).toBeLessThanOrEqual(4);
  expect(await hasSideScroll(page)).toBe(false);
});

test("no desktop o registro rápido fica na barra lateral, com a dica N fora do nome", async ({ page }) => {
  await seed(page, seedState());
  await expect(page.locator(".quick-fab")).toBeHidden();
  const add = page.getByRole("button", { name: "Registro rápido", exact: true });
  await expect(add).toHaveCount(1);
  await expect(add).toHaveAttribute("aria-keyshortcuts", "N");
  await expect(add.locator("kbd")).toHaveText("N");
  await expect(add.locator("kbd")).toHaveAttribute("aria-hidden", "true");
});

test("a tecla N abre o registro rápido; nunca com modificadores, em diálogos ou digitando", async ({ page }) => {
  await seed(page, seedState());
  const quick = page.getByRole("dialog", { name: "Registro rápido" });

  await page.keyboard.press("n");
  await expect(quick).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quick).toHaveCount(0);

  await page.keyboard.press("Shift+N");
  await expect(quick).toBeVisible();
  // Outra letra N com a folha aberta não fecha nem duplica.
  await page.keyboard.press("n");
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(quick).toHaveCount(0);

  await page.keyboard.press("Alt+n");
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+n");
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Com outro diálogo aberto, a letra fica com ele.
  await page.getByRole("button", { name: "Editar Hoje", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Editar Hoje" })).toBeVisible();
  await page.keyboard.press("n");
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(quick).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Digitando na conversa com o agente, "n" é só uma letra.
  await page.getByRole("navigation").getByRole("button", { name: "Meu agente", exact: true }).click();
  const message = page.getByLabel("Mensagem para o agente");
  await message.focus();
  await page.keyboard.press("n");
  await expect(message).toHaveValue("n");
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a ordem salva em Editar Hoje decide os grupos; quem sobra ocupa a linha inteira", async ({ page }) => {
  await seed(page, seedState("water,-mood,meals"));
  expect(await slots(page)).toEqual([
    { section: "water", span: "12", rows: "1" },
    { section: "meals", span: "7", rows: "1" },
    { section: "habits", span: "5", rows: "2" },
    { section: "diet", span: "7", rows: "1" },
    { section: "pantry", span: "12", rows: "1" },
  ]);
  const at = await cells(page);
  expectStack(at.habits!, at.meals!, at.diet!);
  const whole = await box(page, '[data-testid="hoje-grid"]');
  for (const section of ["water", "pantry"]) {
    const strip = await box(page, `.hoje-slot[data-section="${section}"]`);
    expect(Math.abs(strip.width - whole.width), section).toBeLessThanOrEqual(1);
  }
  // Água na linha inteira vira faixa: copo e toques à esquerda, a semana à direita.
  const glass = await box(page, "#hoje-agua .water-main");
  const week = await box(page, "#hoje-agua .water-chart");
  expect(week.x).toBeGreaterThan(glass.x + glass.width);
  expect(week.y).toBeLessThan(glass.y + glass.height);
});

const blankDay = () => ({ ...seedState(), diary: [] });
for (const [label, state] of [
  ["na ordem padrão", () => seedState()],
  ["no dia em branco", blankDay],
  ["na ordem salva", () => seedState("water,-mood,meals")],
] as const)
  test(`nenhum cartão da grade fica esticado e vazio ${label} (1024, 1365 e 1440 px)`, async ({ page }) => {
    await seed(page, state());
    for (const width of [1024, 1365, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      for (const card of await emptiest(page))
        expect(card.percent, `${width} px · ${card.section}`).toBeLessThanOrEqual(30);
    }
  });

test("a 1024 px os anéis ficam em 7 colunas e o próximo passo em 5", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await seed(page, seedState());
  const hero = await box(page, ".hoje-grid > .day-hero");
  const side = await box(page, ".hoje-grid > .hoje-lead-side");
  expect(Math.abs(hero.y - side.y)).toBeLessThanOrEqual(1);
  const ratio = hero.width / side.width;
  expect(ratio).toBeGreaterThan(1.2);
  expect(ratio).toBeLessThan(1.6);
  expect(await hasSideScroll(page)).toBe(false);
});

test("no celular segue uma coluna e a tecla N usa o '+' da barra", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, seedState());
  const grid = page.getByTestId("hoje-grid");
  await expect(grid).toHaveCSS("display", "flex");
  await expect(grid).toHaveCSS("flex-direction", "column");
  // As seções entram direto na coluna (display: contents): todos os cartões alinhados à esquerda.
  const lefts = await page
    .locator(".hoje-slot > *")
    .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().x)));
  expect(lefts.length).toBeGreaterThan(0);
  expect(new Set(lefts).size).toBe(1);
  const fab = page.locator(".quick-fab");
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute("aria-keyshortcuts", "N");
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Registro rápido" })).toBeVisible();
  expect(await hasSideScroll(page)).toBe(false);
});

test("sem rolagem lateral no Hoje em 320, 360, 768, 1024, 1365 e 1440 px", async ({ page }) => {
  await seed(page, seedState());
  for (const width of [320, 360, 768, 1024, 1365, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    expect(await hasSideScroll(page), `${width} px`).toBe(false);
  }
});

test("a 320 px os 7 dias da semana (seg–dom) cabem na tela com chips de pelo menos 38 × 64 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seed(page, seedState());
  const week = page.getByRole("group", { name: "Esta semana" });
  const chips = await week.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const el = button as HTMLButtonElement;
      const r = el.getBoundingClientRect();
      // Tamanho pelo offset (a animação de entrada deixa o retângulo em 37,99…).
      return {
        width: el.offsetWidth,
        height: el.offsetHeight,
        left: r.left,
        right: r.right,
        isToday: el.getAttribute("aria-current") === "date",
        isDisabled: el.disabled,
      };
    }),
  );
  expect(chips).toHaveLength(7);
  const todayIndex = chips.findIndex((chip) => chip.isToday);
  // Segunda a domingo: hoje está na posição do dia da semana; depois dele, só dias desabilitados.
  expect(todayIndex).toBe((new Date(`${today}T12:00:00`).getDay() + 6) % 7);
  for (const [i, chip] of chips.entries()) {
    // Exceção aceita aos 44 px só para os chips da semana: 38 × 64 no mínimo.
    expect(chip.width, `chip ${i + 1}`).toBeGreaterThanOrEqual(38);
    expect(chip.height, `chip ${i + 1}`).toBeGreaterThanOrEqual(64);
    expect(chip.left, `chip ${i + 1}`).toBeGreaterThanOrEqual(0);
    expect(chip.right, `chip ${i + 1}`).toBeLessThanOrEqual(320);
    expect(chip.isDisabled, `chip ${i + 1}`).toBe(i > todayIndex);
    // Nenhum chip sobrepõe o vizinho.
    if (i > 0) expect(chip.left).toBeGreaterThanOrEqual(chips[i - 1]!.right);
  }
  expect(await hasSideScroll(page)).toBe(false);
});
