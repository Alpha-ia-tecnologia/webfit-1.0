import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals, shiftDate, uid } from "../../src/lib/domain";
import { fmtShortDate } from "../../src/lib/format";
import { DOSE_OVERLAY_NOTE } from "../../src/lib/treatment";
import { diarySchema, type AppState, type FoodItem } from "../../src/types";

/** Oito pesagens semanais de 76,4 a 72,4 kg, terminando hoje, com meta de 66 kg. */
function withJourney(change: Partial<NonNullable<AppState["profile"]>> = {}) {
  const state = stateFixture();
  const today = localDate();
  state.profile = { ...state.profile!, targetWeight: 66, ...change };
  state.measurements = Array.from({ length: 8 }, (_, i) => ({
    ...stateFixture().measurements[0]!,
    id: uid(),
    date: shiftDate(today, -7 * (7 - i)),
    weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
  }));
  return state;
}

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => {
        const tx = req.result.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
}

test("evolução mostra a jornada até a meta, a tendência e o balão pelo teclado", async ({
  page,
}) => {
  await seed(page, withJourney());
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  const journey = page.locator(".journey-card");
  await expect(journey).toContainText("Sua jornada");
  await expect(journey).toContainText("38% do caminho");
  // Conceito 09: a última pesagem em destaque ("Peso atual"); a tendência fica no gráfico.
  await expect(journey.locator(".metric-hero")).toContainText("72,4");
  await expect(journey).toContainText("Peso atual · pesado hoje");
  await expect(page.locator(".journey-delta")).toHaveText("4,0 kg");
  // Meta longe dos dados: fora da escala (a curva não achata) e em texto na legenda.
  await expect(page.locator(".wchart-target")).toHaveCount(0);
  await expect(page.locator(".evol-legend-target")).toHaveText("Meta 66 kg");
  const chart = page.getByRole("group", { name: /Peso: 8 pesagens/ });
  await chart.focus();
  await chart.press("ArrowLeft");
  await expect(chart.locator("[aria-live]")).toContainText("tendência");
});

test("perfil sensível vê só o peso: sem meta, ritmo, variação, IMC nem proteína", async ({
  page,
}) => {
  await seed(page, withJourney({ eatingDisorder: "sim" }));
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  const journey = page.locator(".journey-card");
  await expect(journey).toContainText("72,4");
  await expect(journey).not.toContainText("caminho");
  await expect(journey).not.toContainText("Ritmo");
  await expect(page.locator(".journey-delta")).toHaveCount(0);
  await expect(page.locator(".wchart-target")).toHaveCount(0);
  await expect(page.locator(".evol-legend-target")).toHaveCount(0);
  await expect(page.getByText("Proteína", { exact: true })).toHaveCount(0);
  await expect(page.getByText("IMC calculado")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  const body = page.getByTestId("body-card");
  await expect(body).toContainText("kg");
  await expect(body).not.toContainText("IMC");
  await expect(page.getByTestId("body-trend")).toHaveCount(0);
  await expect(page.getByTestId("body-sparkline")).toHaveCount(0);
});

/* ---------- Onda 3 · Lote 3: pesagens, folha de medidas, consistência, medidas e doses ---------- */

const PHONE = { width: 390, height: 844 };
const today = localDate();
type Raw = Record<string, unknown>;

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
const hasSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
/** Cor computada de um token (ex.: "--wf-navy") para comparar com estilos calculados. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
async function openEvolucao(page: Page) {
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Peso", exact: true }).or(page.locator(".start-line"))).toBeVisible();
}
/** Conceito 09: "8 pesagens" no cabeçalho do peso abre a folha "Pesagens" com a lista. */
async function openWeighIns(page: Page) {
  await page.getByRole("button", { name: "8 pesagens no período", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pesagens" })).toBeVisible();
}
/** Linha de "Mais da sua evolução" que abre uma folha com o cartão de sempre. */
async function openMore(page: Page, name: string) {
  await page.locator(".evol-more-list").getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const sheet = page.getByRole("dialog", { name, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Com cintura (88 − 0,7 por semana) e quadril (102 − 0,4 por semana) em cada pesagem. */
function withMeasures(change: Partial<NonNullable<AppState["profile"]>> = {}) {
  const state = withJourney(change);
  state.measurements = state.measurements.map((m, i) => ({
    ...m,
    waist: Number((88 - 0.7 * i).toFixed(1)),
    hip: Number((102 - 0.4 * i).toFixed(1)),
  }));
  return state;
}

/** Aplicação semanal de Tirzepatida no frasco 5 mg/ml (2,50 mg = 50 UI; 5,00 mg = 100 UI). */
function injection(daysAgo: number, doseMg: number, site: string, userId: string): Raw {
  const date = shiftDate(today, -daysAgo);
  const units = doseMg * 20;
  return {
    id: `dose-${daysAgo}`,
    userId,
    date,
    time: "08:30",
    createdAt: `${date}T08:30:00.000Z`,
    updatedAt: `${date}T08:30:00.000Z`,
    method: "frasco",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units,
    volumeMl: units / 100,
    doseMg,
    site,
    side: null,
    notes: "",
  };
}
/** Pesagens da jornada + caneta semanal: 2,50 mg ×4 e depois 5,00 mg ×4 até hoje, locais em rodízio. */
function withDoses(change: Partial<NonNullable<AppState["profile"]>> = {}) {
  const state = withJourney({
    weightLossPen: "sim",
    weightLossPenName: "Tirzepatida",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    ...change,
  });
  const sites = ["abdomen", "coxa", "braco"];
  const injections = Array.from({ length: 8 }, (_, i) =>
    injection(49 - 7 * i, i < 4 ? 2.5 : 5, sites[i % 3]!, state.userId),
  );
  return { ...state, injections } as unknown as AppState;
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
function diaryEntry(type: "refeicao" | "agua", date: string, userId: string) {
  const base = {
    id: `${type}-${date}`,
    userId,
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00Z`,
    updatedAt: `${date}T12:00:00Z`,
  };
  if (type === "agua")
    return diarySchema.parse({ ...base, type, title: "Água", description: "Copo", amountMl: 300 });
  const items = [{ food: rice, grams: 100 }];
  return diarySchema.parse({ ...base, type, title: "Almoço", categoryTag: "Almoço", description: "Arroz", items, ...mealTotals(items) });
}
/** Refeição e água em 6 dos 7 dias (menos anteontem); 3 combinados de 30 dias atrás, 5 cumpridos. */
function withRoutine() {
  const state = stateFixture();
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, -i)).filter((d) => d !== shiftDate(today, -2));
  state.diary = days.flatMap((d) => [diaryEntry("refeicao", d, state.userId), diaryEntry("agua", d, state.userId)]);
  const created = shiftDate(today, -30);
  const habit = (id: string, done: number[]) => ({
    id,
    title: `Combinado ${id}`,
    timeOfDay: "09:00",
    createdDate: created,
    completedDates: done.map((n) => shiftDate(today, -n)),
  });
  state.habits = [habit("h1", [0, 1]), habit("h2", [3, 4]), habit("h3", [5])];
  return state;
}

test("pesagens em linhas: variação neutra, excluir com 44 px e sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, withJourney());
  await openEvolucao(page);
  await openWeighIns(page);
  const list = page.getByRole("list", { name: "Pesagens no período" });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText("72,4 kg");
  const delta = rows.first().locator(".weigh-delta");
  await expect(delta).toContainText("−0,6 kg");
  await expect(delta).toContainText("desde a pesagem anterior");
  const navy = await tokenColor(page, "--wf-navy");
  expect(await delta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(navy);

  await page.setViewportSize({ width: 320, height: 844 });
  expect(await hasSideScroll(page)).toBe(false);
  const remove = page.getByRole("button", { name: /^Excluir medição \d{2}\/\d{2}\/\d{4}$/ });
  await expect(remove).toHaveCount(8);
  // Arredonda o subpixel do layout (43,99998 px), como o teste dos dias da caneta.
  const boxes = await remove.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const px = (value: number) => Math.round(value * 100) / 100;
      return { width: px(r.width), height: px(r.height), left: px(r.left), right: px(r.right) };
    }),
  );
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
  }
  await remove.nth(1).click();
  await expect(page.locator(".toast")).toContainText("Medição excluída.");
  await expect(page.locator(".toast").getByRole("button", { name: "Desfazer" })).toBeVisible();

  await seed(page, withJourney({ eatingDisorder: "sim" }));
  await openEvolucao(page);
  await openWeighIns(page);
  await expect(page.getByRole("list", { name: "Pesagens no período" }).getByRole("listitem")).toHaveCount(8);
  await expect(page.locator(".weigh-delta")).toHaveCount(0);
});

test("menor de 18 é perfil calmo na Evolução: só o peso, sem meta, variação, medidas nem proteína", async ({
  page,
}) => {
  const state = withJourney({ birthDate: `${Number(localDate().slice(0, 4)) - 16}-01-01` });
  state.measurements = state.measurements.map((m) => ({ ...m, waist: 85, hip: 100 }));
  await seed(page, state);
  await openEvolucao(page);
  const journey = page.locator(".journey-card");
  await expect(journey).toContainText("72,4");
  for (const text of ["caminho", "Ritmo", "Cintura", "Quadril"]) await expect(journey).not.toContainText(text);
  await expect(page.locator(".journey-delta")).toHaveCount(0);
  await expect(page.locator(".wchart-target")).toHaveCount(0);
  await expect(page.getByTestId("measures-card")).toHaveCount(0);
  await expect(page.getByText("Proteína", { exact: true })).toHaveCount(0);
  await openWeighIns(page);
  await expect(page.getByRole("list", { name: "Pesagens no período" }).getByRole("listitem")).toHaveCount(8);
  await expect(page.locator(".weigh-delta")).toHaveCount(0);
  await expect(page.locator(".weigh-chip")).toHaveCount(0);
});

test("folha de medidas: régua do peso, cintura opcional, método em escolhas e ontem", async ({ page }) => {
  await seed(page, withJourney());
  await openEvolucao(page);
  await page.getByRole("button", { name: "Registrar medidas", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Registrar medidas" });
  const weight = sheet.getByRole("slider", { name: "Peso (kg)", exact: true });
  await expect(weight).toHaveAttribute("aria-valuetext", "72,0 kg");
  for (let i = 0; i < 5; i += 1) await sheet.getByRole("button", { name: "Aumentar 0,1 kg", exact: true }).click();
  await expect(weight).toHaveAttribute("aria-valuetext", "72,5 kg");
  // Cintura começa vazia (sem repetir valor antigo) e abre em "Informar".
  await sheet.getByRole("button", { name: "Informar Cintura (cm)", exact: true }).click();
  const waist = sheet.getByRole("slider", { name: "Cintura (cm)", exact: true });
  await expect(waist).toBeFocused();
  await sheet.getByRole("button", { name: "Aumentar 0,5 cm", exact: true }).click();
  await expect(waist).toHaveAttribute("aria-valuetext", "80,5 cm");
  const method = sheet.getByRole("button", { name: "Balança de academia ou farmácia", exact: true });
  await method.click();
  await expect(method).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Ontem", exact: true }).click();
  await sheet.getByRole("button", { name: "Salvar medidas", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const yesterday = shiftDate(today, -1);
  await expect
    .poll(async () => (await saved(page)).measurements.find((m) => m.date === yesterday) ?? null)
    .toMatchObject({ weight: 72.5, waist: 80.5, hip: null, method: "Balança de academia ou farmácia" });
});

test("seus registros: calendário de 4 semanas, contagens e nada de sequência", async ({ page }) => {
  await seed(page, withRoutine());
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  const card = page.getByTestId("consistency-card");
  await expect(card).toContainText("Seus registros");
  await expect(card).toContainText("Últimas 4 semanas");
  // Semanas de segunda a domingo: 3 completas + a atual até hoje (os dias futuros ficam fora da lista).
  const elapsed = 21 + ((new Date(`${today}T12:00:00`).getDay() + 6) % 7) + 1;
  const grid = card.getByRole("list", { name: "Registros das últimas 4 semanas" });
  await expect(grid.getByRole("listitem")).toHaveCount(elapsed);
  const current = grid.locator('li[aria-current="date"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText(`${fmtShortDate(today)}: água, refeição e combinado`);
  // Refeição e água em 6 dos últimos 7 dias; combinados cumpridos em 5 dias.
  const tiles = card.getByRole("list", { name: "Dias com registro nas 4 semanas" });
  await expect(tiles).toContainText(`Refeições: 6 de ${elapsed} dias`);
  await expect(tiles).toContainText(`Água: 6 de ${elapsed} dias`);
  await expect(tiles).toContainText(`Combinados: 5 de ${elapsed} dias`);
  await expect(tiles).toContainText(`/${elapsed} dias`);
  await expect(card).not.toContainText(/sequ[eê]ncia|seguid/i);
  const strokes = await card.locator(".consist-arc").evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  const warm = await Promise.all(
    ["--wf-rose-50", "--wf-rose-200", "--wf-rose-400", "--wf-rose-600", "--wf-rose-700", "--wf-rose-800", "--wf-amber-50", "--wf-amber-100", "--wf-amber-200", "--wf-amber-500", "--wf-amber-600", "--wf-amber-700", "--wf-amber-900"].map((t) => tokenColor(page, t)),
  );
  expect(strokes.length).toBe(elapsed * 3);
  for (const stroke of strokes) expect(warm).not.toContain(stroke);
  // Combinado em índigo só na Evolução (separa do arco esmeralda da refeição).
  const indigo = await tokenColor(page, "--wf-indigo-500");
  expect(await current.locator(".consist-arc.on.is-habit").evaluate((el) => getComputedStyle(el).stroke)).toBe(indigo);
  // Sem controle de período na tela: 7/28 dias ficam nas folhas de detalhes.
  await expect(page.getByRole("group", { name: "Período dos gráficos diários" })).toHaveCount(0);
});

test("medidas com silhueta, mini tendências e fichas; perfil sensível sem o cartão", async ({ page }) => {
  await seed(page, withMeasures());
  await openEvolucao(page);
  await expect(page.locator(".evol-more-list")).toContainText("Cintura 83,1 · Quadril 99,2 cm");
  const sheet = await openMore(page, "Medidas");
  const card = sheet.getByTestId("measures-card");
  await expect(card.getByRole("img", { name: /^Silhueta: cintura 83,1 cm, quadril 99,2 cm/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /^Cintura: de 88,0 a 83,1 cm desde/ })).toBeVisible();
  await expect(card.getByRole("listitem").filter({ hasText: "IMC 26,6" })).toHaveCount(1);
  await expect(card.getByRole("listitem").filter({ hasText: "Cintura/quadril 0,84" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Registrar medidas", exact: true })).toHaveCount(1);
  await card.getByRole("button", { name: "Registrar medidas de cintura e quadril" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar medidas" })).toBeVisible();

  await seed(page, withMeasures({ eatingDisorder: "sim" }));
  await openEvolucao(page);
  await expect(page.getByTestId("consistency-card")).toBeVisible();
  await expect(page.locator(".evol-more-list").getByRole("button", { name: /^Medidas/ })).toHaveCount(0);
  await expect(page.getByTestId("measures-card")).toHaveCount(0);
});

test("doses registradas sobre o peso, por dose e locais; perfis sensíveis sem a faixa", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, withDoses());
  await openEvolucao(page);
  // Conceito 09: as aplicações ficam dentro do gráfico do peso; a próxima (estimada) é tracejada.
  await expect(
    page.getByRole("img", {
      name: /^Doses registradas no período: Tirzepatida 2,50 mg de .+ \(4 aplicações\); Tirzepatida 5,00 mg desde .+ \(4 aplicações\); próxima aplicação estimada: .+$/,
    }),
  ).toBeVisible();
  await expect(page.locator(".dose-band-seg")).toHaveCount(2);
  await expect(page.locator(".dose-band-seg").last()).toContainText("5,00 mg/sem");
  await expect(page.locator(".dose-band-mark:not(.is-next)")).toHaveCount(8);
  await expect(page.locator(".dose-band-mark.is-next")).toHaveCount(1);
  await expect(page.locator(".wchart-dose-bg")).toHaveCount(2);
  await expect(page.locator(".evol-legend")).toContainText("Tirzepatida");
  // A nota informativa saiu do cartão e foi para "Como calculamos".
  await expect(page.getByText(DOSE_OVERLAY_NOTE, { exact: true })).toHaveCount(0);
  const how = await openHow(page);
  await expect(how.getByRole("heading", { name: "Doses no gráfico", exact: true })).toBeVisible();
  await expect(how).toContainText(DOSE_OVERLAY_NOTE);
  await page.keyboard.press("Escape");
  const chart = page.getByRole("group", { name: /Peso: 8 pesagens/ });
  await expect(chart.locator("[aria-live]")).toHaveCount(1);
  await expect(page.locator(".evol-legend-target")).toHaveText("Meta 66 kg");
  const sheet = await openMore(page, "Medicação e locais");
  const treatment = sheet.getByTestId("evol-treatment-card");
  const doses = treatment.getByTestId("dose-carousel").getByRole("listitem");
  await expect(doses).toHaveCount(2);
  await expect(doses.first()).toContainText("5,00 mg");
  await expect(doses.first()).toContainText("Mais recente");
  await expect(treatment.getByTestId("site-donut")).toHaveAccessibleName(
    /^Locais nos últimos 90 dias: Abdômen \d+, Coxa \d+, Braço \d+$/,
  );
  await expect(page.locator("main")).not.toContainText(/nível|concentração no sangue|eficaz|funcionou/i);
  await page.setViewportSize({ width: 320, height: 844 });
  // O gráfico se redimensiona depois da troca de largura (ResizeObserver): mede quando o layout assenta.
  await expect.poll(() => hasSideScroll(page)).toBe(false);

  for (const change of [{ eatingDisorder: "sim" }, { pregnancy: "gestacao" }] as const) {
    await seed(page, withDoses(change));
    await openEvolucao(page);
    await expect(page.getByTestId("dose-band")).toHaveCount(0);
    await expect(page.locator(".wchart-dose-bg")).toHaveCount(0);
    await expect(page.locator(".dose-band-mark")).toHaveCount(0);
    const calmSheet = await openMore(page, "Medicação e locais");
    await expect(calmSheet.getByTestId("evol-treatment-card")).toBeVisible();
    await expect(calmSheet.getByTestId("evol-treatment-card")).not.toContainText("kg");
  }
});

/* ---------- Onda 4 · Lote 2: destaques calculados, "Como calculamos" e bem-estar e sono ---------- */

const CAUSAL =
  /porque|por causa|causou|faz bem|faz mal|melhora|piora|deveria|você deve|precisa|recomend|diagn|depress|insôni|distúrbio|transtorno|tratamento/i;
const ROSE_TOKENS = ["--wf-rose-50", "--wf-rose-200", "--wf-rose-400", "--wf-rose-600", "--wf-rose-700", "--wf-rose-800"];
/** Água de hoje−6 até hoje (um dia sem registro): 11.250 ml ÷ 6 × 2.000 ml = 94% da meta. */
const WEEK_WATER = [2000, 1500, 0, 1750, 2000, 2250, 1750];
/** hoje−6 (i = 0) … hoje (i = 6). */
const day = (i: number) => shiftDate(today, i - 6);

function waterEntry(date: string, amountMl: number, userId: string) {
  return diarySchema.parse({
    id: `agua-${date}`,
    userId,
    date,
    time: "10:00",
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
    type: "agua",
    title: "Água",
    description: "Copo",
    amountMl,
  });
}
function feelingEntry(date: string, time: string, rating: number, sleepHours?: number) {
  return diarySchema.parse({
    id: `bem-${date}-${time}`,
    userId: "seed",
    date,
    time,
    createdAt: `${date}T${time}:00Z`,
    updatedAt: `${date}T${time}:00Z`,
    type: "bem_estar",
    title: "Bem-estar",
    description: "",
    rating,
    ...(sleepHours === undefined ? {} : { sleepHours }),
  });
}
/** Jornada com metas desde 30 dias atrás, a água da semana e uma refeição por dia. */
function withInsights(change: Partial<NonNullable<AppState["profile"]>> = {}) {
  const state = withJourney(change);
  const diary = WEEK_WATER.flatMap((ml, i) => [
    diaryEntry("refeicao", day(i), state.userId),
    ...(ml ? [waterEntry(day(i), ml, state.userId)] : []),
  ]);
  return { ...state, goalHistory: [{ date: shiftDate(today, -30), profile: state.profile! }], diary };
}
/** Semente do spec (§3.5) de hoje−6 a hoje: 5 dias com humor e sono, um dia sem nada. */
function withWellbeing() {
  return {
    ...stateFixture(),
    diary: [
      feelingEntry(day(0), "08:00", 4, 8),
      feelingEntry(day(1), "08:00", 2, 5.5),
      feelingEntry(day(2), "08:00", 5, 7.5),
      feelingEntry(day(3), "08:00", 3, 6),
      feelingEntry(day(5), "20:00", 4),
      feelingEntry(day(6), "09:00", 4, 7),
      feelingEntry(day(6), "21:00", 2),
    ],
  };
}
async function openHow(page: Page) {
  await page.getByRole("button", { name: "Como calculamos", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Como calculamos" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("insights nos mini gráficos e \"Como calculamos\"", async ({ page }) => {
  await seed(page, withInsights());
  await openEvolucao(page);
  // Conceito 09: 2 mini gráficos lado a lado com "média/dia · meta"; os destaques ficam na folha.
  const captions = page.locator(".evol-mini-grid .evol-mini-caption");
  await expect(captions).toHaveCount(2);
  for (const caption of await captions.all()) await expect(caption).toContainText("média/dia");
  await expect(page.locator(".evol-mini-grid .evol-mini.water")).toContainText("meta 2 L");
  await page.getByRole("button", { name: "Água: ver detalhes", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Água", exact: true });
  const water = details.getByRole("list", { name: "Destaques de Água" });
  await expect(water).toContainText("94% da meta");
  await expect(water).toContainText("6 de 7 dias");
  await expect(details.locator(".evol-mini.water")).toContainText("L/dia");
  await details.getByRole("group", { name: "Período do gráfico" }).getByRole("button", { name: "28 dias" }).click();
  await expect(details.getByRole("img", { name: /^Água por dia nos últimos 28 dias/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  const sheet = await openHow(page);
  for (const name of ["Médias", "Dias com registro", "Peso de tendência", "Bem-estar e sono"])
    await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(sheet).toContainText("Ausência de registro não significa ausência de consumo.");
  await expect(page.getByTestId("consistency-card")).not.toContainText("Ausência de registro");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("calorias ocultas e perfil calmo: destaques e folha sem energia, meta calórica ou peso", async ({ page }) => {
  await seed(page, withInsights({ hideCalories: true }));
  await openEvolucao(page);
  await expect(page.locator(".evol-mini-grid")).not.toContainText(/kcal|calori/i);
  await page.getByRole("button", { name: "Refeições: ver detalhes", exact: true }).click();
  await expect(page.getByRole("list", { name: "Destaques de Refeições" })).toContainText("7 de 7 dias");
  await page.keyboard.press("Escape");
  let sheet = await openHow(page);
  await expect(sheet).not.toContainText(/kcal|calori/i);
  await expect(sheet.getByRole("heading", { name: "Porcentagem da meta de água", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await seed(page, withInsights({ eatingDisorder: "sim" }));
  await openEvolucao(page);
  // Perfil calmo: a média de calorias sem a meta ao lado.
  await expect(page.locator(".evol-mini-grid .evol-mini.food .evol-mini-caption")).toHaveText("média/dia");
  await page.getByRole("button", { name: "Calorias: ver detalhes", exact: true }).click();
  const calories = page.getByRole("list", { name: "Destaques de Calorias" });
  await expect(calories).toContainText("7 de 7 dias");
  await expect(calories).not.toContainText("% da meta");
  await page.keyboard.press("Escape");
  await expect(page.locator(".evol-more-list").getByRole("button", { name: /^Proteína/ })).toHaveCount(0);
  sheet = await openHow(page);
  for (const name of ["Peso de tendência", "Ritmo", "Proteína"])
    await expect(sheet.getByRole("heading", { name, exact: true })).toHaveCount(0);
  await expect(sheet).not.toContainText(/kcal|calori/i);
});

test("bem-estar e sono: semana, leitura cruzada sem causa e mapa de 28 dias", async ({ page }) => {
  await seed(page, withWellbeing());
  await openEvolucao(page);
  await expect(page.locator(".evol-more-list")).toContainText("Humor em 6 de 7 dias");
  const wbSheet = await openMore(page, "Bem-estar e sono");
  const card = wbSheet.getByTestId("wellbeing-card");
  const items = card.getByRole("list", { name: "Bem-estar e sono dos últimos 7 dias" }).getByRole("listitem");
  await expect(items).toHaveCount(7);
  await expect(items.first()).toContainText(`${fmtShortDate(day(0))}: humor Bem, sono 8 h`);
  await expect(items.nth(4)).toContainText(`${fmtShortDate(day(4))}: sem registro de bem-estar`);
  await expect(items.last()).toHaveAttribute("aria-current", "date");
  await expect(card.getByRole("list", { name: "Destaques de bem-estar" })).toContainText("Humor em 6 de 7 dias");
  const cross = card.getByTestId("wellbeing-cross");
  await expect(cross).toContainText("Nos dias com mais sono, seu humor foi melhor em média.");
  await expect(cross).toContainText("Com 7 h ou mais de sono: humor 3,7 de 5 (3 dias) · com menos: 2,5 de 5 (2 dias)");
  await expect(cross).toContainText(
    "Leitura dos seus registros, sem relação de causa: humor e sono mudam por muitos motivos.",
  );
  expect(await card.textContent()).not.toMatch(CAUSAL);
  const paints = await card
    .locator(".wb-face svg circle, .wb-face svg path")
    .evaluateAll((els) => els.flatMap((el) => [getComputedStyle(el).fill, getComputedStyle(el).stroke]));
  const roses = await Promise.all(ROSE_TOKENS.map((token) => tokenColor(page, token)));
  expect(paints.length).toBeGreaterThan(0);
  for (const paint of paints) expect(roses).not.toContain(paint);

  await wbSheet.getByRole("group", { name: "Período dos gráficos diários" }).getByRole("button", { name: "28 dias" }).click();
  const heat = card.getByRole("list", { name: "Bem-estar e sono dos últimos 28 dias" });
  await expect(heat.getByRole("listitem")).toHaveCount(28);
  await expect(heat.locator('li[aria-current="date"]')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => hasSideScroll(page)).toBe(false);
});

test("bem-estar com poucos dados e sem registro", async ({ page }) => {
  await seed(page, { ...stateFixture(), diary: [feelingEntry(day(4), "08:00", 4, 7), feelingEntry(day(5), "08:00", 3, 6)] });
  await openEvolucao(page);
  await openMore(page, "Bem-estar e sono");
  const cross = page.getByTestId("wellbeing-cross");
  await expect(cross).toContainText("2 de 4 dias");
  await expect(cross).not.toContainText("Nos dias com");

  await seed(page, stateFixture());
  await openEvolucao(page);
  await openMore(page, "Bem-estar e sono");
  const card = page.getByTestId("wellbeing-card");
  await expect(card).toContainText("Registre como você está para ver o humor e o sono aqui.");
  await expect(card.getByTestId("wellbeing-cross")).toHaveCount(0);
  await card.getByRole("button", { name: "Registrar bem-estar" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar bem-estar" })).toBeVisible();
});

/* ---------- Sinais do app (chips de insight + folha) ---------- */

/** Bem-estar com um marcador de cansaço, estresse ou ansiedade. */
function tiredEntry(date: string, tag: string) {
  return diarySchema.parse({
    id: `cansaco-${date}`,
    userId: "seed",
    date,
    time: "21:00",
    createdAt: `${date}T21:00:00Z`,
    updatedAt: `${date}T21:00:00Z`,
    type: "bem_estar",
    title: "Bem-estar",
    description: "",
    rating: 3,
    tags: [tag],
  });
}

test("sinal do descanso: chip abaixo do cabeçalho, folha com a frase e a pergunta pronta, sem parágrafo na tela", async ({ page }) => {
  // Três dias com cansaço, estresse ou ansiedade nos últimos 7: "Cuidar do descanso".
  const state = { ...withJourney(), diary: [tiredEntry(day(6), "Cansaço"), tiredEntry(day(4), "Estresse"), tiredEntry(day(1), "Ansiedade")] };
  await seed(page, state);
  await openEvolucao(page);
  const chip = page.getByTestId("insight-chips").locator('[data-signal="sono-estresse"]');
  await expect(chip).toHaveText("Cuidar do descanso");
  await expect(page.locator("main")).not.toContainText(/rotina de sono|Observado nos seus registros/);
  await chip.click();
  const sheet = page.getByRole("dialog", { name: "Cuidar do descanso" });
  await expect(sheet.getByTestId("insight-sheet")).toContainText("rotina de sono");
  await expect(sheet).not.toContainText(CAUSAL);
  await expect(sheet.getByRole("button", { name: "Dispensar por 3 dias", exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Descansar melhor", exact: true }).click();
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue(/descansar melhor/);
});
