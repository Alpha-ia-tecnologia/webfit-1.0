import { readFileSync } from "node:fs";
import { test, expect, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { profileFixture, stateFixture } from "../fixtures";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain";
import { weekdayOf } from "../../src/lib/dates";
import { lastCompleteWeek } from "../../src/lib/week-recap";
import {
  diarySchema,
  type AppState,
  type DiaryEntry,
  type FoodItem,
  type HabitItem,
  type Measurement,
  type Profile,
} from "../../src/types";
import { contrastIssues } from "./contrast";
import { EVOLUCAO_TITLE } from "../../src/lib/copy";

/**
 * Onda 4 · Lote 2 · EVOL-05 (+SIS-13): "Sua semana" no Hoje (só às segundas, dispensável neste
 * aparelho) e na Evolução (todo dia), stories de 5 partes e a imagem opcional criada no aparelho.
 * O relógio da página fica na próxima segunda (ou terça) às 10:00; a semana resumida é W(0)…W(6).
 */
const realToday = localDate();
/** Próxima segunda a partir de hoje (hoje, se já for segunda): o relógio da página fica nela. */
const MONDAY = shiftDate(realToday, (8 - weekdayOf(realToday)) % 7);
/** W(0) = segunda da semana resumida … W(6) = domingo. */
const W = (i: number) => shiftDate(MONDAY, i - 7);
const WEEK = lastCompleteWeek(MONDAY);
const PHONE = { width: 390, height: 844 };
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr|melhor semana/i;
const WINS = [
  "Refeições registradas em 5 dias",
  "Água registrada em 6 dias",
  "Meta de água alcançada em 3 dias",
  "6 combinados cumpridos",
];

type ProfileChange = Partial<Profile> & { hideBodyNumbers?: boolean };
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
const meal = (date: string, time = "12:00") => {
  const items = [{ food: rice, grams: 150 }];
  return entry(date, { type: "refeicao", title: "Almoço", categoryTag: "Almoço", items, ...mealTotals(items) }, time);
};
const water = (date: string, amountMl: number) => entry(date, { type: "agua", title: "Água", amountMl });
const feeling = (date: string, rating: number, sleepHours?: number) =>
  entry(date, { type: "bem_estar", title: "Bem-estar", rating, ...(sleepHours === undefined ? {} : { sleepHours }) }, "21:00");
const weighIn = (id: string, date: string, weight: number): Measurement => ({
  id,
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança em casa",
});
const habit = (id: string, timeOfDay: string, createdDate: string, completedDates: string[]): HabitItem => ({
  id,
  title: `Combinado ${id}`,
  timeOfDay,
  createdDate,
  completedDates,
});

/** Fixture do spec (§3.5) deslocada para a semana W(0)…W(6): 6 dias com registro, 3 pesagens, 2 combinados. */
function recapState(change: ProfileChange = {}): AppState {
  const profile = { ...profileFixture(), ...change } as Profile;
  const diary = [
    meal(W(0)),
    meal(W(1), "12:00"),
    meal(W(1), "19:00"),
    meal(W(2)),
    meal(W(4)),
    meal(W(5)),
    water(W(0), 2000),
    water(W(1), 1500),
    water(W(2), 2500),
    water(W(3), 1000),
    water(W(4), 2000),
    water(W(5), 1800),
    feeling(W(1), 4, 7),
    feeling(W(3), 3, 6.5),
    feeling(W(5), 5),
    // Fora da semana resumida.
    water(MONDAY, 500),
    meal(shiftDate(W(0), -1)),
  ];
  return {
    ...stateFixture(),
    profile,
    goalHistory: [{ date: shiftDate(MONDAY, -30), profile }],
    // Substitui a pesagem da fixture (de hoje, que pode cair dentro da semana).
    measurements: [
      weighIn("m1", shiftDate(MONDAY, -21), 74),
      weighIn("m2", shiftDate(MONDAY, -14), 73.4),
      weighIn("m3", W(3), 72.6),
    ],
    diary,
    habits: [
      habit("h1", "08:00", shiftDate(MONDAY, -27), [W(0), W(1), W(2), W(4)]),
      // W(2) é antes da criação: não conta.
      habit("h2", "09:00", W(3), [W(2), W(3), W(5)]),
    ],
  } as AppState;
}

async function seed(page: Page, state: AppState, at = `${MONDAY}T10:00:00`) {
  await page.clock.setFixedTime(at);
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: "test-token" } }));
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

async function freshPage(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: PHONE, ...options });
  return { context, page: await context.newPage() };
}

const hasSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
/** Elemento inteiro dentro de [0, width] e sem conteúdo mais largo que ele (sem rolagem lateral própria). */
const fitsWidth = (locator: Locator, width: number) =>
  locator.evaluate((el, max) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= max + 0.5 && el.scrollWidth <= el.clientWidth + 1;
  }, width);
/** Cor computada de um token para comparar com estilos calculados. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
const openEvolucao = (page: Page) =>
  page.getByRole("navigation").getByRole("button", { name: "Evolução", exact: true }).click();
const stories = (page: Page) => page.getByRole("dialog", { name: "Sua semana" });
const part = (page: Page, name: string | RegExp) => stories(page).getByRole("group", { name });

/** Abre os stories e devolve o texto de cada uma das 5 partes (avançando com "Próximo"). */
async function readParts(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Ver sua semana" }).click();
  await expect(part(page, /^1 de 5: /)).toBeVisible();
  const texts: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const current = part(page, new RegExp(`^${i} de 5: `));
    await expect(current).toBeVisible();
    texts.push(await stories(page).innerText());
    if (i < 5) await stories(page).getByRole("button", { name: "Próximo" }).click();
  }
  return texts;
}

test("segunda: cartão no Hoje, grade e dispensar", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, recapState());
  const card = page.getByTestId("week-recap");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: `Sua semana ${WEEK.label}` })).toBeVisible();
  const grid = card.getByRole("list", { name: "Resumo da semana" });
  await expect(grid.getByRole("listitem")).toHaveCount(4);
  for (const text of ["6 de 7", "73,0 kg", "−0,7 kg na semana", "1,8 L/dia", "Bem"]) await expect(grid).toContainText(text);
  await expect(card).not.toContainText(/kcal/i);
  const inverse = await tokenColor(page, "--wf-inverse");
  expect(await card.locator(".recap-delta").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(inverse);
  // Não é uma seção de "Editar Hoje".
  await expect(page.locator(".hoje-slot [data-testid='week-recap']")).toHaveCount(0);

  const dismiss = page.getByRole("button", { name: "Dispensar resumo da semana" });
  const box = await dismiss.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await dismiss.click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? "")).not.toBe("BODY");
  const toast = page.locator(".toast");
  await expect(toast).toContainText("Resumo da semana dispensado.");
  await toast.getByRole("button", { name: "Desfazer" }).click();
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Dispensar resumo da semana" }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("webfit-week-recap-dismissed"))).toBe(W(0));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  await expect(card).toHaveCount(0);

  // 360 px: o Hoje segue sem rolagem lateral (a faixa da semana só cabe a partir daí, hoje-desktop.spec).
  await page.evaluate(() => localStorage.removeItem("webfit-week-recap-dismissed"));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(card).toBeVisible();
  expect(await hasSideScroll(page)).toBe(false);
  // 320 px: o cartão e os blocos ficam dentro da tela, sem rolagem própria.
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await fitsWidth(card, 320)).toBe(true);
  const tiles = await grid.getByRole("listitem").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }),
  );
  for (const tile of tiles) {
    expect(tile.left).toBeGreaterThanOrEqual(0);
    expect(tile.right).toBeLessThanOrEqual(320);
  }

  // Escuro: superfície por token e sem falha de contraste no cartão.
  await page.emulateMedia({ colorScheme: "dark" });
  const surface = await tokenColor(page, "--wf-surface");
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(surface);
  expect(await contrastIssues(page, '[data-testid="week-recap"]')).toEqual([]);
});

test("stories que não carregam: aviso e o Hoje continua de pé", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, recapState());
  // Arquivo de uma versão anterior (ou conexão caída): o pedaço dos stories não chega.
  await page.route("**/assets/WeekStories-*.js", (route) => route.abort());
  await page.getByRole("button", { name: "Ver sua semana" }).click();
  await expect(page.locator(".toast")).toContainText("Não foi possível abrir o resumo da semana.");
  await expect(stories(page)).toHaveCount(0);
  await expect(page.getByText("Esta tela não abriu", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  await expect(page.getByTestId("week-recap")).toBeVisible();
});

test("terça: sem cartão no Hoje; Evolução mantém \"Sua semana\"", async ({ page }) => {
  await seed(page, recapState(), `${shiftDate(MONDAY, 1)}T10:00:00`);
  await expect(page.getByTestId("hoje-grid")).toBeVisible();
  await expect(page.getByTestId("week-recap")).toHaveCount(0);
  await openEvolucao(page);
  const card = page.getByTestId("week-recap");
  await expect(card).toBeVisible();
  await expect(card).toContainText(WEEK.label);
  await expect(page.getByRole("button", { name: "Dispensar resumo da semana" })).toHaveCount(0);
  // 320 px na Evolução: nem o cartão nem os stories criam rolagem lateral no documento.
  await page.setViewportSize({ width: 320, height: 760 });
  await expect.poll(() => hasSideScroll(page)).toBe(false);
  await page.getByRole("button", { name: "Ver sua semana" }).click();
  await expect(part(page, /^1 de 5: /)).toBeVisible();
  expect(await hasSideScroll(page)).toBe(false);
});

test("stories: 5 partes, teclado, deslizar, pausar", async ({ browser }) => {
  const reduced = await freshPage(browser, { reducedMotion: "reduce" });
  const page = reduced.page;
  await seed(page, recapState());
  const open = page.getByRole("button", { name: "Ver sua semana" });
  await open.click();
  const dialog = stories(page);
  await expect(dialog).toBeVisible();
  await expect(part(page, /^1 de 5: Sua semana$/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Próximo" })).toBeFocused();
  const texts = [await dialog.innerText()];
  await page.keyboard.press("ArrowRight");
  const second = part(page, "2 de 5: Água e refeições");
  await expect(second).toContainText("6 refeições registradas em 5 dias");
  await expect(second.getByRole("img", { name: new RegExp(`^Água por dia de ${WEEK.aria}: Seg 2.000 ml`) })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(part(page, /^1 de 5: /)).toBeVisible();

  const stage = dialog.locator(".story-stage");
  const box = (await stage.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, y, { steps: 6 });
  await page.mouse.up();
  await expect(second).toBeVisible();
  texts.push(await dialog.innerText());
  for (let i = 3; i <= 5; i += 1) {
    await dialog.getByRole("button", { name: "Próximo" }).click();
    await expect(part(page, new RegExp(`^${i} de 5: `))).toBeVisible();
    texts.push(await dialog.innerText());
  }
  const last = part(page, "5 de 5: Conquistas gentis");
  await expect(last.getByRole("list", { name: "Conquistas gentis" }).getByRole("listitem")).toHaveText(WINS);
  await expect(dialog.getByRole("button", { name: /avanço automático/ })).toHaveCount(0);
  expect(await dialog.locator(".story-seg.is-active i").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  for (const text of texts) {
    expect(text).not.toMatch(NO_STREAK);
    expect(text).not.toMatch(/kcal|calori/i);
  }
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();

  // 320 px: stories em tela cheia, sem rolagem lateral, controles de 44 px.
  await page.setViewportSize({ width: 320, height: 700 });
  await open.click();
  await expect(part(page, /^1 de 5: /)).toBeVisible();
  expect(await fitsWidth(dialog, 320)).toBe(true);
  expect(await fitsWidth(dialog.locator(".story-stage"), 320)).toBe(true);
  const controls = await dialog.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent || el.getAttribute("aria-label"), width: r.width, height: r.height, right: r.right };
    }),
  );
  for (const control of controls) {
    expect(control.width, String(control.name)).toBeGreaterThanOrEqual(44);
    expect(control.height, String(control.name)).toBeGreaterThanOrEqual(44);
    expect(control.right, String(control.name)).toBeLessThanOrEqual(320);
  }
  await reduced.context.close();

  // Movimento normal: pausa e retoma o avanço automático (6 s por parte).
  const moving = await freshPage(browser);
  await seed(moving.page, recapState());
  await moving.page.getByRole("button", { name: "Ver sua semana" }).click();
  const movingDialog = stories(moving.page);
  await movingDialog.getByRole("button", { name: "Pausar avanço automático" }).click();
  const resume = movingDialog.getByRole("button", { name: "Retomar avanço automático" });
  await expect(resume).toBeVisible();
  expect(
    await movingDialog.locator(".story-seg.is-active i").evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe("paused");
  await expect(part(moving.page, /^1 de 5: /)).toBeVisible();
  await resume.click();
  await expect(part(moving.page, /^2 de 5: /)).toBeVisible({ timeout: 9000 });
  await moving.context.close();
});

test("perfil calmo: sem peso nem meta", async ({ browser }) => {
  const { context, page } = await freshPage(browser, { reducedMotion: "reduce" });
  await seed(page, recapState({ eatingDisorder: "sim" }));
  const grid = page.getByTestId("week-recap").getByRole("list", { name: "Resumo da semana" });
  await expect(grid.getByRole("listitem")).toHaveCount(4);
  for (const text of ["6 de 7", "1,8 L/dia", "Bem", "6 de 11"]) await expect(grid).toContainText(text);
  await expect(grid).not.toContainText("Peso");
  const texts = await readParts(page);
  await expect(part(page, "5 de 5: Sua semana em registros")).toBeVisible();
  expect(texts[3]).toContain("Combinados");
  for (const text of texts) expect(text).not.toMatch(/\bkg\b|kcal|meta|pesagem/i);
  await stories(page).getByRole("button", { name: "Concluir" }).click();
  await stories(page).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Ver sua semana" }).click();
  for (let i = 0; i < 3; i += 1) await stories(page).getByRole("button", { name: "Próximo" }).click();
  await expect(part(page, "4 de 5: Combinados").getByRole("heading", { name: "Combinados", exact: true })).toBeVisible();
  await context.close();
});

test("imagem no aparelho, opt-in", async ({ browser }) => {
  const { context, page } = await freshPage(browser, { reducedMotion: "reduce", acceptDownloads: true });
  // Navegador sem compartilhamento de arquivos: o botão "Compartilhar" não aparece.
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", { value: undefined, configurable: true });
  });
  await seed(page, recapState({ hideCalories: true }));
  await page.getByRole("button", { name: "Ver sua semana" }).click();
  for (let i = 0; i < 4; i += 1) await stories(page).getByRole("button", { name: "Próximo" }).click();
  await expect(part(page, /^5 de 5: /)).toBeVisible();
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await stories(page).getByRole("button", { name: "Salvar imagem" }).click();
  const sheet = page.getByRole("dialog", { name: "Imagem da sua semana" });
  const preview = sheet.getByTestId("share-preview");
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute("src")).toMatch(/^blob:/);
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1080);
  await expect(sheet).toContainText("A imagem é criada neste aparelho e só sai dele se você baixar ou compartilhar.");
  await expect(sheet.getByRole("button", { name: "Compartilhar" })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("button", { name: "Baixar imagem" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`webfit-semana-${W(0)}.png`);
  const bytes = readFileSync((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  for (const url of urls) {
    expect(url, url).toMatch(/^(blob:|data:|http:\/\/127\.0\.0\.1:3107\/)/);
    expect(url, url).not.toContain("/api/");
  }
  await context.close();
});

test("poucos registros: nada", async ({ page }) => {
  const state = stateFixture();
  const lonely = {
    ...state,
    measurements: [],
    diary: [meal(W(1)), water(W(1), 300)],
  } as AppState;
  await seed(page, lonely);
  await expect(page.getByTestId("hoje-grid")).toBeVisible();
  await expect(page.getByTestId("week-recap")).toHaveCount(0);
  await openEvolucao(page);
  await expect(page.getByRole("heading", { name: EVOLUCAO_TITLE, level: 1 })).toBeVisible();
  // Conceito 09: bem-estar em "Mais da sua evolução"; sem semana registrada, a linha "Sua semana" some.
  await expect(page.locator(".evol-more-list").getByRole("button", { name: /^Bem-estar e sono/ })).toBeVisible();
  await expect(page.getByTestId("week-recap")).toHaveCount(0);
});
