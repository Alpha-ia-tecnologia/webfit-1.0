import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { LABEL_READ, LABEL_READ_MULTI, LABEL_READ_NONE } from "../label-fixtures";
import { REPLY_META } from "../structured-fixtures";
import { CYCLE_NOTE } from "../../src/lib/cycle-tips";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain";
import { renderLabelText, type LabelRead } from "../../src/lib/label-read";
import { NOTICE_USE_BY_PAST } from "../../src/lib/treatment-stock";
import { diarySchema, type AppState, type FoodItem } from "../../src/types";

/**
 * Onda 4 · Lote 3 (Tratamento): efeitos no bem-estar e "Como ficou?" (SERINGA-07), a grade "Seu
 * ciclo", o estoque do frasco ou caneta (SERINGA-12), "Seu ciclo da semana" (SERINGA-11) e a
 * leitura do rótulo por foto com confirmação (INJECAO-X2). O /api/agent é simulado em NDJSON.
 */
const today = localDate();
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 844 };
/** Frases de conselho de dose que nunca aparecem (injecao.spec: DOSE_ADVICE). */
const DOSE_ADVICE = /aument|reduz|ajust|mantenha|atrasad/i;
const PNG = {
  name: "rotulo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};

type Raw = Record<string, unknown>;

/** Aplicação de Tirzepatida 5 mg/ml, 50 UI na seringa de 100 UI (2,50 mg), há `daysAgo` dias. */
function injection(daysAgo: number, overrides: Raw = {}): Raw {
  const date = shiftDate(today, -daysAgo);
  return {
    id: `inj-${daysAgo}`,
    userId: "seed",
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
    notes: "",
    ...overrides,
  };
}
const fiveMg = { units: 100, volumeMl: 1, doseMg: 5 };
function wellbeing(daysAgo: number, symptoms: { key: string; intensity: number }[]): Raw {
  const date = shiftDate(today, -daysAgo);
  return {
    id: `bem-${daysAgo}`,
    userId: "seed",
    date,
    time: "20:00",
    createdAt: `${date}T20:00:00.000Z`,
    updatedAt: `${date}T20:00:00.000Z`,
    type: "bem_estar",
    title: "Bem-estar",
    description: "",
    rating: 3,
    symptoms,
  };
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
function lunch(daysAgo: number, id = `almoco-${daysAgo}`): Raw {
  const date = shiftDate(today, -daysAgo);
  const items = [{ food: rice, grams: 100 }];
  return diarySchema.parse({
    id,
    userId: "seed",
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00Z`,
    updatedAt: `${date}T12:00:00Z`,
    type: "refeicao",
    title: "Almoço",
    categoryTag: "Almoço",
    description: "Arroz do teste (100 g)",
    items,
    ...mealTotals(items),
  });
}
/** Perfil com caneta semanal (4/mês); o estado fica solto para aceitar registros crus. */
function penState(profile: Raw = {}, injections: Raw[] = [], extra: Raw = {}): AppState {
  const state = stateFixture();
  Object.assign(state.profile!, {
    weightLossPen: "sim",
    weightLossPenName: "Tirzepatida",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    pregnancy: "nao",
    ...profile,
  });
  const diary = ((extra.diary as Raw[] | undefined) ?? []).map((e) => ({ ...e, userId: state.userId }));
  const raw = {
    ...state,
    ...extra,
    diary,
    injections: injections.map((e) => ({ ...e, userId: state.userId })),
  };
  return raw as unknown as AppState;
}

async function seed(page: Page, state: AppState, ready = false) {
  if (!ready)
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
const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
/** "Meu tratamento" abre numa folha pela linha Medicação do mosaico do perfil de saúde (conceito 11). */
async function openTreatment(page: Page) {
  await page.getByTestId("health-mosaic").getByRole("button", { name: "Medicação", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Meu tratamento" })).toBeVisible();
}
const hasSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
/** Elementos dentro de `root` que passam da janela, e o próprio `root` se rolar de lado. */
const overflowsViewport = (root: Locator) =>
  root.evaluate((el) => [
    ...(el.scrollWidth > el.clientWidth + 1 ? [`rola de lado: ${el.scrollWidth} > ${el.clientWidth}`] : []),
    ...[...el.querySelectorAll<HTMLElement>("*")]
      .filter((n) => !n.closest(".sr-only") && n.getBoundingClientRect().right > window.innerWidth + 0.5)
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className)}`),
  ]);
/**
 * Controles novos visíveis com menos de 44 × 44 dentro de `root` (o "Fechar" do Modal é do kit).
 * Mede o layout (offsetWidth/offsetHeight): durante a entrada do Modal (wf-fade-up, translateY) o
 * getBoundingClientRect devolve 43,99… e a guarda falhava sem o alvo ter mudado.
 */
async function smallTargets(root: Locator): Promise<string[]> {
  return root.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("button, [role='radio'], input[type='radio'], label.stock-method")]
      .filter((b) => b.offsetParent !== null && !b.closest(".sr-only") && !b.classList.contains("sr-only"))
      .filter((b) => b.getAttribute("aria-label") !== "Fechar")
      .filter((b) => b.offsetWidth < 44 || b.offsetHeight < 44)
      .map((b) => `${b.getAttribute("aria-label") ?? b.textContent?.trim()} ${b.offsetWidth}x${b.offsetHeight}`),
  );
}
/** Tamanho de layout de um controle (sem transformações de animação). */
const layoutSize = (target: Locator) =>
  target.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
/** Menor fonte (px) do texto visível dentro de `root`. */
const smallestText = (root: Locator) =>
  root.evaluate((el) => {
    const sizes = [...el.querySelectorAll<HTMLElement>("*")]
      .filter((n) => n.offsetParent !== null && !n.closest(".sr-only, [aria-hidden='true'], svg"))
      .filter((n) => [...n.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim()))
      .map((n) => parseFloat(getComputedStyle(n).fontSize));
    return Math.min(...sizes);
  });

test.describe("efeitos percebidos (SERINGA-07)", () => {
  test("bem-estar com efeitos e intensidade, nota de efeito forte, chip no Diário e busca", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, penState({}, [injection(1)]));
    await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
    await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar bem-estar" });
    const group = dialog.getByRole("group", { name: "Efeitos percebidos (opcional)" });
    await expect(group).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Náusea", exact: true })).toHaveCount(1);
    await group.getByRole("button", { name: "Náusea", exact: true }).click();
    const intensity = dialog.getByRole("radiogroup", { name: "Intensidade de Náusea" });
    await expect(intensity.getByRole("radio", { name: "Leve" })).toBeChecked();
    await intensity.getByRole("radio", { name: "Forte" }).click();
    await expect(intensity.getByRole("radio", { name: "Forte" })).toBeChecked();
    const note = dialog.getByRole("note");
    await expect(note).toContainText("Efeito forte");
    await expect(note).toContainText("converse com quem acompanha seu tratamento");
    await expect(note).not.toContainText(/dose|\bmg\b|aument|reduz|suspend/i);
    for (const radio of await intensity.getByRole("radio").all()) {
      const box = await layoutSize(radio);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await smallTargets(group)).toEqual([]);
    await dialog.getByRole("button", { name: "Salvar registro", exact: true }).click();
    await expect
      .poll(async () => (await saved(page)).diary.find((e) => e.type === "bem_estar")?.symptoms)
      .toEqual([{ key: "nausea", intensity: 3 }]);

    await nav(page, "Diário");
    const chip = page.locator(".diary-chip.is-symptom");
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("Náusea");
    await expect(chip.locator(".sr-only")).toHaveText("Náusea, intensidade forte");
    await page.getByRole("button", { name: "Buscar no diário", exact: true }).click();
    await page.getByLabel("Buscar em todo o diário").fill("nausea");
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText("1 resultado");
  });

  test("sem tratamento o formulário não muda; 320 px com 6 efeitos sem rolagem lateral", async ({ page }) => {
    await seed(page, penState({ weightLossPen: "nao" }));
    await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
    await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar bem-estar" });
    await expect(dialog.getByRole("group", { name: "Marcadores (opcional)" })).toBeVisible();
    await expect(dialog.getByRole("group", { name: "Efeitos percebidos (opcional)" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Náusea", exact: true })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Fechar" }).click();

    await page.setViewportSize(NARROW);
    await seed(page, penState({}, [injection(1)]));
    await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
    await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
    const group = page.getByRole("group", { name: "Efeitos percebidos (opcional)" });
    for (const name of ["Náusea", "Vômito", "Azia ou refluxo", "Intestino preso", "Diarreia", "Dor na barriga"])
      await group.getByRole("button", { name, exact: true }).click();
    const cansaco = group.getByRole("button", { name: "Cansaço", exact: true });
    await expect(cansaco).toHaveAttribute("aria-disabled", "true");
    await expect(group).toContainText("Até 6 efeitos por registro.");
    await expect(page.getByRole("radiogroup", { name: /^Intensidade de / })).toHaveCount(6);
    // A guarda mede a folha; a página inteira do Hoje a 320 px é coberta em hoje-desktop.spec.ts.
    expect(await overflowsViewport(page.getByRole("dialog", { name: "Registrar bem-estar" }))).toEqual([]);
    expect(await smallestText(group)).toBeGreaterThanOrEqual(12);
  });
});

test.describe("Como ficou? (SERINGA-07)", () => {
  test("responde, desfaz e mantém a resposta ao editar a refeição", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, penState({}, [injection(1)], { diary: [lunch(0, "almoco-hoje")] }));
    await nav(page, "Diário");
    const ask = page.getByRole("button", { name: "Como ficou? Almoço das 12:00", exact: true });
    await expect(ask).toBeVisible();
    expect((await layoutSize(ask)).height).toBeGreaterThanOrEqual(44);
    await ask.click();
    const sheet = page.getByRole("dialog", { name: "Como ficou?" });
    const options = sheet.getByRole("group", { name: "Como ficou?" }).getByRole("button");
    await expect(options).toHaveText(["Ainda com fome", "Na medida", "Saciou rápido", "Pouca fome", "Desconforto"]);
    for (const option of await options.all()) expect((await layoutSize(option)).height).toBeGreaterThanOrEqual(44);
    await options.filter({ hasText: "Na medida" }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await saved(page)).diary.find((e) => e.id === "almoco-hoje")?.satiety).toBe("na_medida");
    await expect(
      page.getByRole("button", { name: "Como ficou: Na medida. Alterar, Almoço das 12:00", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Anotado: Na medida.")).toBeVisible();
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect
      .poll(async () => "satiety" in ((await saved(page)).diary.find((e) => e.id === "almoco-hoje") ?? {}))
      .toBe(false);
    await expect(ask).toBeVisible();

    await ask.click();
    await page.getByRole("dialog", { name: "Como ficou?" }).getByRole("button", { name: "Desconforto" }).click();
    await expect.poll(async () => (await saved(page)).diary.find((e) => e.id === "almoco-hoje")?.satiety).toBe("desconforto");
    // O chip "Como ficou" fica no centro da linha (é outro botão): toca no título, no canto de cima.
    await page.getByRole("button", { name: "Editar Almoço", exact: true }).click({ position: { x: 24, y: 16 } });
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page.getByLabel("Data dos registros")).toBeVisible();
    const edited = (await saved(page)).diary.find((e) => e.id === "almoco-hoje");
    expect(edited?.satiety).toBe("desconforto");
  });

  test("conjunto reduzido com transtorno alimentar e nada em refeições antigas", async ({ page }) => {
    await seed(page, penState({ eatingDisorder: "sim" }, [injection(1)], { diary: [lunch(0), lunch(3)] }));
    await nav(page, "Diário");
    await page.getByRole("button", { name: "Como ficou? Almoço das 12:00", exact: true }).click();
    const options = page.getByRole("dialog", { name: "Como ficou?" }).getByRole("group").getByRole("button");
    await expect(options).toHaveCount(3);
    await expect(options.filter({ hasText: /Pouca fome|Saciou rápido/ })).toHaveCount(0);
    await page.getByRole("dialog", { name: "Como ficou?" }).getByRole("button", { name: "Fechar" }).click();
    await page.getByLabel("Data dos registros").fill(shiftDate(today, -3));
    await expect(page.getByRole("button", { name: "Editar Almoço", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Como ficou/ })).toHaveCount(0);
  });
});

test.describe("Seu ciclo na Evolução (SERINGA-07)", () => {
  const cycleSeed = (profile: Raw = {}, withSymptoms = true) =>
    penState(
      profile,
      [injection(21), injection(14), injection(7, fiveMg), injection(0, fiveMg)],
      {
        diary: withSymptoms
          ? [
              wellbeing(23, [{ key: "nausea", intensity: 1 }]),
              wellbeing(20, [{ key: "nausea", intensity: 2 }]),
              wellbeing(13, [{ key: "nausea", intensity: 1 }]),
              wellbeing(12, [{ key: "nausea", intensity: 3 }]),
              wellbeing(6, [
                { key: "nausea", intensity: 2 },
                { key: "cansaco", intensity: 1 },
              ]),
              wellbeing(3, [{ key: "intestino_preso", intensity: 1 }]),
            ]
          : [],
      },
    );

  test("grade D0–D6 em ardósia, filtro de dose e nenhuma interpretação", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, cycleSeed());
    await nav(page, "Evolução");
    // Conceito 09: medicação e ciclo ficam na folha "Medicação e locais" (Mais da sua evolução).
    await page.getByRole("button", { name: /^Medicação e locais/ }).click();
    const card = page.getByTestId("cycle-grid-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "Seu ciclo" })).toBeVisible();
    await expect(card.locator("caption")).toHaveText(
      "Últimas 8 semanas: 6 registros com efeitos, 1 fora dos dias 0 a 6.",
    );
    await expect(card.getByRole("rowheader")).toHaveText(["Náusea", "Intestino preso", "Cansaço"]);
    const nausea = card.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Náusea" }) });
    const cells = nausea.getByRole("cell");
    await expect(cells.nth(0)).toHaveText("Náusea, no dia da aplicação: nenhum registro");
    await expect(cells.nth(1)).toHaveText("Náusea, 1 dia depois: 3 dias");
    await expect(cells.nth(2)).toHaveText("Náusea, 2 dias depois: 1 dia, com registro forte");
    const colors = await page.evaluate(() => {
      const resolve = (token: string) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = `var(${token})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      const warm = ["--wf-rose-50", "--wf-rose-200", "--wf-rose-400", "--wf-rose-600", "--wf-rose-700",
        "--wf-amber-50", "--wf-amber-100", "--wf-amber-200", "--wf-amber-500", "--wf-amber-600", "--wf-amber-700",
        "--wf-tone-danger-bg", "--wf-tone-danger-fg", "--wf-tone-attention-bg", "--wf-tone-attention-fg"].map(resolve);
      const squares = [...document.querySelectorAll<HTMLElement>('[data-testid="cycle-grid"] .cg-cell')].map(
        (el) => getComputedStyle(el).backgroundColor,
      );
      const d1 = document.querySelectorAll<HTMLElement>('[data-testid="cycle-grid"] tbody tr')[0]!
        .querySelectorAll<HTMLElement>(".cg-cell")[1]!;
      return { slate700: resolve("--wf-slate-700"), d1: getComputedStyle(d1).backgroundColor, warm, squares };
    });
    expect(colors.d1).toBe(colors.slate700);
    for (const square of colors.squares) expect(colors.warm).not.toContain(square);
    await expect(card).not.toContainText(/piora|melhora|aument|reduz/i);

    const dose = card.getByRole("group", { name: "Dose" });
    await expect(dose.getByRole("button")).toHaveText(["Todas as doses", "5,00 mg", "2,50 mg"]);
    await dose.getByRole("button", { name: "5,00 mg", exact: true }).click();
    await expect(card.locator("caption")).toHaveText("Últimas 8 semanas, dose 5,00 mg: 2 registros com efeitos.");
    expect(await smallTargets(card)).toEqual([]);
    expect(await smallestText(card)).toBeGreaterThanOrEqual(12);

    await page.setViewportSize(NARROW);
    expect(await hasSideScroll(page)).toBe(false);
  });

  test("some em gestação e sem aplicação semanal; vazio sem efeitos registrados", async ({ page }) => {
    await seed(page, cycleSeed({ pregnancy: "gestacao" }));
    await nav(page, "Evolução");
    await page.getByRole("button", { name: /^Medicação e locais/ }).click();
    await expect(page.getByRole("heading", { name: "Medicação injetável" })).toBeVisible();
    await expect(page.getByTestId("cycle-grid-card")).toHaveCount(0);

    await seed(page, cycleSeed({ weightLossPenPerMonth: 30 }));
    await nav(page, "Evolução");
    await page.getByRole("button", { name: /^Medicação e locais/ }).click();
    await expect(page.getByRole("heading", { name: "Medicação injetável" })).toBeVisible();
    await expect(page.getByTestId("cycle-grid-card")).toHaveCount(0);

    await seed(page, cycleSeed({}, false));
    await nav(page, "Evolução");
    await page.getByRole("button", { name: /^Medicação e locais/ }).click();
    await expect(page.getByTestId("cycle-grid-card")).toContainText(
      "Registre efeitos no bem-estar para vê-los por dia desde a aplicação.",
    );
    await expect(page.getByTestId("cycle-grid")).toHaveCount(0);
  });
});

test.describe("estoque do frasco ou caneta (SERINGA-12)", () => {
  const stockSeed = (profile: Raw = {}, stock: Raw | null = null) =>
    penState(profile, [injection(14), injection(7), injection(0)], stock ? { treatmentStock: stock } : {});
  const vial = (overrides: Raw = {}) => ({
    method: "frasco",
    volumeMl: 2,
    doses: null,
    openedOn: shiftDate(today, -14),
    useBy: shiftDate(today, 17),
    ...overrides,
  });
  const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

  test("informar, ver no tratamento e na Seringa, registrar e ver a folha", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, stockSeed());
    await nav(page, "Meu espaço");
    await openTreatment(page);
    const card = page.getByTestId("treatment-card");
    await card.getByRole("button", { name: "Informar estoque do frasco ou caneta" }).click();
    const sheet = page.getByRole("dialog", { name: "Estoque do frasco ou caneta" });
    await expect(sheet.getByRole("radio", { name: "Frasco", exact: true })).toBeChecked();
    expect(await smallTargets(sheet)).toEqual([]);
    await sheet.getByLabel("Volume do frasco (ml)").fill("2");
    await sheet.getByLabel("Aberto em").fill(shiftDate(today, -14));
    await sheet.getByLabel("Usar até (opcional)").fill(shiftDate(today, 17));
    // "Limpar data de uso" (igual ao app): esvazia o campo e devolve o foco a ele.
    await sheet.getByRole("button", { name: "Limpar data de uso", exact: true }).click();
    await expect(sheet.getByLabel("Usar até (opcional)")).toHaveValue("");
    await expect(sheet.getByLabel("Usar até (opcional)")).toBeFocused();
    await expect(sheet.getByRole("button", { name: "Limpar data de uso", exact: true })).toHaveCount(0);
    await sheet.getByLabel("Usar até (opcional)").fill(shiftDate(today, 17));
    await sheet.getByRole("button", { name: "Salvar estoque" }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await saved(page)).treatmentStock).toEqual(vial());

    await expect(
      card.getByRole("img", {
        name: /^Frasco: 0,50 ml de 2,00 ml, cerca de 1 dose igual à última registrada, usar até \d{2}\/\d{2}\.$/,
      }),
    ).toBeVisible();
    await expect(card.getByText("≈ 1 dose", { exact: true })).toBeVisible();
    await expect(card.getByText(`usar até ${ddmm(shiftDate(today, 17))}`, { exact: true })).toBeVisible();
    await expect(card.getByRole("note")).toContainText("este frasco tem cerca de 1 dose igual à última");
    await expect(card.getByRole("button", { name: "Novo frasco" })).toBeVisible();
    await expect(card.getByTestId("stock-liquid")).toHaveAttribute("height", "15.5");
    expect(await smallTargets(card.getByTestId("stock-summary"))).toEqual([]);

    // Fecha a folha "Meu tratamento" antes de sair pela navegação.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav(page, "Hoje");
    await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
    await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
    const row = page.getByTestId("stock-row");
    await expect(row).toContainText("0,50 ml de 2,00 ml");
    expect((await layoutSize(row)).height).toBeGreaterThanOrEqual(56);
    await page.getByTestId("injection-recipe").getByRole("button", { name: /^Registrar aplicação/ }).click();
    await page
      .getByRole("dialog", { name: "Confirmar aplicação" })
      .getByRole("button", { name: "Registrar aplicação", exact: true })
      .click();
    const savedSheet = page.getByRole("dialog", { name: "Aplicação registrada" });
    await expect(savedSheet).toContainText("Estoque: 0,00 ml de 2,00 ml");
    await expect(savedSheet).toContainText("o frasco pode ter acabado");
    await expect(savedSheet).toContainText("Para os próximos dias");
    await expect(savedSheet.getByRole("button", { name: "Ver no diário", exact: true })).toBeFocused();
    await expect(savedSheet).not.toContainText(DOSE_ADVICE);
  });

  test("gestação sem contagem; data de uso vencida em âmbar; remover com Desfazer", async ({ page }) => {
    await seed(page, stockSeed({ pregnancy: "gestacao" }, vial()));
    await nav(page, "Meu espaço");
    await openTreatment(page);
    const card = page.getByTestId("treatment-card");
    await expect(card.getByTestId("stock-summary")).toContainText("0,50 ml de 2,00 ml");
    await expect(card.getByTestId("stock-summary")).not.toContainText("≈");
    await expect(card.getByRole("note")).toHaveCount(0);

    await seed(page, stockSeed({}, vial({ useBy: shiftDate(today, -1) })));
    await nav(page, "Meu espaço");
    await openTreatment(page);
    const past = card.getByRole("note").filter({ hasText: NOTICE_USE_BY_PAST });
    await expect(past).toBeVisible();
    const tones = await past.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--wf-tone-attention-bg)";
      document.body.append(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { token, value: getComputedStyle(el).backgroundColor };
    });
    expect(tones.value).toBe(tones.token);

    await card.getByRole("button", { name: "Atualizar estoque" }).click();
    await page.getByRole("dialog", { name: "Estoque do frasco ou caneta" }).getByRole("button", { name: "Remover estoque" }).click();
    await page.getByRole("dialog", { name: "Remover estoque?" }).getByRole("button", { name: "Remover", exact: true }).click();
    await expect.poll(async () => (await saved(page)).treatmentStock).toBeNull();
    await expect(card.getByRole("button", { name: "Informar estoque do frasco ou caneta" })).toBeVisible();
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect.poll(async () => (await saved(page)).treatmentStock).toMatchObject({ method: "frasco", volumeMl: 2 });
  });
});

test.describe("Seu ciclo da semana (SERINGA-11)", () => {
  test("dica da fase no Hoje, combinado em um toque com Desfazer e a folha das fases", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, penState({}, [injection(1)]));
    const card = page.locator(".injection-card");
    await expect(card).toContainText("Seu ciclo da semana · Dias 0 a 2");
    // O bloco vem recolhido numa linha de 44 px; abrir mostra a dica da fase.
    const toggle = card.getByRole("button", { name: /^Seu ciclo da semana/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(card.locator(".cycle-tip")).toBeVisible();
    await expect(card).toContainText("Coma devagar e faça pausas durante a refeição.");
    await expect(card.locator(".cycle-tip")).not.toContainText(/dose|\bmg\b|aplicar|caneta/i);
    expect(await smallestText(card.locator(".cycle-tip"))).toBeGreaterThanOrEqual(12);
    const add = card.getByRole("button", { name: "Criar combinado: Comer devagar no jantar" });
    const box = await layoutSize(add);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await add.click();
    await page.getByRole("dialog", { name: "Criar combinado?" }).getByRole("button", { name: "Criar combinado" }).click();
    await expect
      .poll(async () => (await saved(page)).habits.find((h) => h.title === "Comer devagar no jantar"))
      .toMatchObject({ title: "Comer devagar no jantar", timeOfDay: "19:30" });
    await expect(card).toContainText("Já está nos seus combinados.");
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect
      .poll(async () => (await saved(page)).habits.some((h) => h.title === "Comer devagar no jantar"))
      .toBe(false);

    await card.getByRole("button", { name: "Ver as fases" }).click();
    const sheet = page.getByRole("dialog", { name: "Seu ciclo da semana" });
    await expect(sheet.getByRole("heading", { level: 3 })).toHaveText(["Dias 0 a 2", "Dias 3 a 5", "Dias 6 e 7"]);
    await expect(sheet.getByText("Agora", { exact: true })).toHaveCount(1);
    await expect(sheet).toContainText(CYCLE_NOTE);
    expect(await smallTargets(sheet)).toEqual([]);
  });

  test("filtros do perfil e nada em gestação, para menores ou sem aplicação semanal", async ({ page }) => {
    await seed(page, penState({ eatingDisorder: "sim" }, [injection(1)]));
    await expect(page.locator(".cycle-tip")).toContainText("Beba água em pequenos goles ao longo do dia.");
    await seed(page, penState({ eatingDisorder: "sim", fluidRestriction: "sim" }, [injection(1)]));
    await expect(page.locator(".cycle-tip")).toContainText("Se sentir cansaço, reserve um momento do dia para descansar.");
    for (const profile of [{ pregnancy: "gestacao" }, { birthDate: "2010-01-01" }, { weightLossPenPerMonth: 30 }]) {
      await seed(page, penState(profile, [injection(1)]));
      await expect(page.locator(".injection-card")).toBeVisible();
      await expect(page.locator(".cycle-tip")).toHaveCount(0);
    }
  });
});

test.describe("rótulo do frasco por foto (INJECAO-X2)", () => {
  type AgentRequest = { mode: string; text: string; file?: string; context?: unknown; history?: unknown };
  const reply = (label: LabelRead) => ({
    text: renderLabelText(label),
    meta: { ...REPLY_META, specialists: ["analista_exames"], llmCalls: 2 },
    structured: { kind: "rotulo", label },
  });
  function fulfill(route: Route, body: unknown) {
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "stage", stage: "especialista", attempt: 1 })}\n${JSON.stringify({ type: "result", reply: body })}\n`,
    });
  }
  async function mockAgent(page: Page, answer: (index: number) => LabelRead | "error") {
    const requests: AgentRequest[] = [];
    await page.route("**/api/status", (route) => route.fulfill({ json: { ready: true, token: "rotulo-e2e-token" } }));
    await page.route("**/api/agent", (route) => {
      requests.push(route.request().postDataJSON() as AgentRequest);
      const value = answer(requests.length - 1);
      return value === "error"
        ? route.fulfill({ status: 502, json: { error: "O agente está indisponível no momento." } })
        : fulfill(route, reply(value));
    });
    return requests;
  }
  const labelState = (profile: Raw = {}) =>
    penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "1 mg", consentAi: true, ...profile });
  async function openLabel(page: Page) {
    await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
    await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
    await page.getByRole("button", { name: "Alterar a concentração do frasco" }).click();
    await expect(page.getByTestId("injection-concentration")).toHaveText("1,34");
    await page.getByRole("button", { name: "Ler rótulo por foto" }).click();
    const sheet = page.getByRole("dialog", { name: "Ler rótulo do frasco" });
    await expect(sheet).toContainText("A foto vai só para a leitura pelo agente e não fica salva no app.");
    await sheet.locator('input[type="file"]').setInputFiles(PNG);
    return sheet;
  }
  const hasPhotoStored = async (page: Page) =>
    JSON.stringify(await saved(page)).includes("data:image") ||
    (await page.evaluate(() => JSON.stringify({ ...localStorage }).includes("data:image")));

  test("uma leitura: confere lado a lado e só entra na calculadora depois do sim", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const requests = await mockAgent(page, () => LABEL_READ);
    await seed(page, labelState(), true);
    const sheet = await openLabel(page);
    await expect(sheet.getByRole("img", { name: "Foto do rótulo enviada para leitura" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Confira: 5 mg/ml?" })).toBeFocused();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.mode).toBe("rotulo");
    expect(requests[0]!.file).toMatch(/^data:image\/jpeg;base64,/);
    expect(requests[0]!.context).toEqual({});
    expect(requests[0]!.history).toEqual([]);
    await expect(sheet).toContainText("No rótulo: “10 mg/2 mL”");
    await expect(sheet).toContainText("Confiança alta");
    await expect(sheet.getByRole("note")).toHaveText(
      "O nome no rótulo parece ser Tirzepatida, e a calculadora está em Semaglutida. Confira antes de usar.",
    );
    await expect(page.getByTestId("injection-concentration")).toHaveText("1,34");
    expect(await smallTargets(sheet)).toEqual([]);
    await sheet.getByRole("button", { name: "Sim, usar 5 mg/ml" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("injection-concentration")).toHaveText("5");
    await expect(page.getByText("Concentração do frasco: 5 mg/ml, conferida no rótulo.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alterar a concentração do frasco" })).toBeFocused();
    // A medicação não troca sozinha.
    await expect(page.getByRole("radio", { name: "Semaglutida", exact: true })).toBeChecked();
    expect(await hasPhotoStored(page)).toBe(false);
  });

  test("várias leituras pedem a escolha; nenhuma leitura e erro voltam ao campo digitado", async ({ page }) => {
    const replies: (LabelRead | "error")[] = [LABEL_READ_MULTI, LABEL_READ_NONE, "error"];
    await mockAgent(page, (i) => replies[i] ?? "error");
    await seed(page, labelState(), true);
    let sheet = await openLabel(page);
    await expect(sheet.getByRole("heading", { name: "Qual concentração está no seu frasco?" })).toBeVisible();
    const radios = sheet.getByRole("radiogroup", { name: "Concentrações encontradas" }).getByRole("radio");
    await expect(radios).toHaveCount(2);
    for (const radio of await radios.all()) await expect(radio).not.toBeChecked();
    const use = sheet.getByRole("button", { name: "Usar a concentração escolhida" });
    await expect(use).toHaveAttribute("aria-disabled", "true");
    // aria-disabled (não disabled): o toque chega ao botão e explica o que falta.
    await use.click({ force: true });
    await expect(sheet.getByRole("alert")).toHaveText("Escolha a concentração que está no frasco.");
    await expect(sheet).toContainText("Há reflexo sobre o rótulo.");
    await sheet.getByRole("radio", { name: /^2,5 mg\/ml, no rótulo/ }).check();
    await use.click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("injection-concentration")).toHaveText("2,5");

    await page.getByRole("button", { name: "Ler rótulo por foto" }).click();
    sheet = page.getByRole("dialog", { name: "Ler rótulo do frasco" });
    await sheet.locator('input[type="file"]').setInputFiles(PNG);
    await expect(sheet).toContainText("Não encontrei a concentração com segurança nesta foto.");
    await expect(sheet).toContainText("A foto ficou desfocada.");
    await sheet.getByRole("button", { name: "Digitar a concentração" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Alterar a concentração do frasco" })).toBeFocused();
    await expect(page.getByTestId("injection-concentration")).toHaveText("2,5");

    await page.getByRole("button", { name: "Ler rótulo por foto" }).click();
    await sheet.locator('input[type="file"]').setInputFiles(PNG);
    await expect(sheet.getByRole("heading", { name: "Não foi possível ler o rótulo agora" })).toBeVisible();
    await expect(sheet).toContainText("O agente está indisponível no momento.");
    await sheet.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByTestId("injection-concentration")).toHaveText("2,5");
    expect(await hasPhotoStored(page)).toBe(false);
  });

  test("cada troca de etapa leva o foco ao que aparece: espera, resultado e nova foto", async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/status", (route) => route.fulfill({ json: { ready: true, token: "rotulo-e2e-token" } }));
    await page.route("**/api/agent", async (route) => {
      await held;
      await fulfill(route, reply(LABEL_READ_NONE));
    });
    await seed(page, labelState(), true);
    const sheet = await openLabel(page);
    // A foto sai de cena: o foco fica na espera (nunca no <body> do diálogo).
    await expect(sheet.locator(".label-sending")).toBeFocused();
    release();
    await expect(sheet).toContainText("Não encontrei a concentração com segurança nesta foto.");
    await expect(sheet.getByRole("heading", { level: 3 })).toBeFocused();
    await sheet.getByRole("button", { name: "Tirar outra foto" }).click();
    await expect(sheet.getByLabel("Escolher ou tirar foto")).toBeFocused();
  });

  test("sem autorização de IA não há leitura por foto", async ({ page }) => {
    await mockAgent(page, () => LABEL_READ);
    await seed(page, labelState({ consentAi: false }), true);
    await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
    await page.getByRole("button", { name: "Alterar a concentração do frasco" }).click();
    await expect(page.getByTestId("injection-concentration")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ler rótulo por foto" })).toHaveCount(0);
  });
});
