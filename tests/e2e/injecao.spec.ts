import { test, expect, type Locator, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, shiftDate } from "../../src/lib/domain";
import { diarySchema, type AppState, type FoodItem } from "../../src/types";

/**
 * Onda 2 · Lote 5 (seringa e GLP-1): dose de sempre, calculadora compacta, caneta, régua da bula,
 * confirmação explícita, estimativa no Hoje, Meu tratamento, lembrete e guia.
 */
const today = localDate();
const PHONE = { width: 390, height: 844 };
/** Meta de altura da página a 390×844 (SERINGA-06). */
const RECIPE_MAX_HEIGHT = 1700;
/**
 * Calculadora sem histórico, 1 mg na seringa de 100 UI (lupa e régua visíveis), disclosures fechados:
 * medido 2.134 px a 390×844 (2.076 sem dose). Guarda = medida arredondada para os 50 seguintes
 * (spec §8, desvio 3: a meta de 1.700 px não cabe com método, dose, seringa legível e mapa).
 */
const FORM_MAX_HEIGHT = 2150;
const MAX_WORDS = 170;

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
/** Perfil com caneta semanal (4/mês); o estado fica solto porque um registro antigo não tem `method`. */
function penState(profile: Raw = {}, injections: Raw[] = []): AppState {
  const state = stateFixture();
  Object.assign(state.profile!, {
    weightLossPen: "sim",
    weightLossPenName: "Tirzepatida",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    pregnancy: "nao",
    ...profile,
  });
  const raw = { ...state, injections: injections.map((e) => ({ ...e, userId: state.userId })) };
  return raw as unknown as AppState;
}
const usualDose = () => {
  const legacy = injection(16, { site: "braco" });
  delete legacy.method;
  return [legacy, injection(9, { site: "coxa" }), injection(2, { site: "abdomen" })];
};

async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: "test-token" } }));
  await page.goto("/");
  // Primeira carga: a abertura do app; ao semear de novo no mesmo teste, o Hoje já aparece.
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
async function openInjecao(page: Page) {
  await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
  await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
}
/** Botão da receita (conceito 10): "Registrar aplicação de hoje" no dia estimado, senão "Registrar aplicação". */
const recipeRegister = (page: Page) =>
  page.getByTestId("injection-recipe").getByRole("button", { name: /^Registrar aplicação/ });
const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);
const hasSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
/** Palavras com letra ou número (o "·" e o "—" não contam). */
const wordsInMain = (page: Page) =>
  page.evaluate(
    () => (document.querySelector("main")?.innerText ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
  );
/** Rótulos da escala: tamanho, posição acima do cilindro e sobreposição entre vizinhos. */
const scaleReport = (page: Page) =>
  page.evaluate(() => {
    const barrel = document.querySelector('[data-testid="syringe-barrel"]')!.getBoundingClientRect();
    const spans = [...document.querySelectorAll<HTMLElement>(".inj-scale span")].map((s) => ({
      box: s.getBoundingClientRect(),
      size: parseFloat(getComputedStyle(s).fontSize),
    }));
    return {
      count: spans.length,
      minSize: Math.min(...spans.map((s) => s.size)),
      allAbove: spans.every((s) => s.box.bottom <= barrel.top + 0.5),
      overlaps: spans.slice(1).filter((s, i) => s.box.left < spans[i]!.box.right).length,
    };
  });
/** Rótulos da régua: pares na mesma linha que se sobrepõem. */
const rulerOverlaps = (page: Page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".inj-ruler-label")].map((l) => l.getBoundingClientRect());
    let overlaps = 0;
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => {
        const sameRow = Math.abs(a.top - b.top) < 4;
        if (sameRow && a.left < b.right && b.left < a.right) overlaps += 1;
      }),
    );
    return overlaps;
  });

test("dose de sempre em dois toques: confirmar, cancelar sem salvar e desfazer", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({}, usualDose()));
  await openInjecao(page);
  const recipe = page.getByTestId("injection-recipe");
  await expect(recipe.getByRole("heading", { name: "Minha dose de sempre" })).toBeVisible();
  await expect(page.getByTestId("injection-recipe-dose")).toHaveText("2,50");
  const chips = recipe.getByRole("list", { name: "Receita" });
  await expect(chips).toContainText("5 mg/ml");
  await expect(chips).toContainText("Seringa de 100 UI");
  // Conceito 10: próxima aplicação (sempre "estimada", sem dose), com o local sugerido.
  const next = page.getByTestId("next-application");
  await expect(next).toContainText("Próxima aplicação estimada");
  await expect(next).toContainText("Local sugerido: Coxa");
  await expect(next).not.toContainText(/mg|atrasad/i);
  await expect(page.getByTestId("next-application-ring")).toHaveAccessibleName(/^Próxima dose estimada em 5 dias/);
  await expect(recipe.getByRole("img", { name: /aspire até 50 UI/ })).toBeVisible();
  await expect(page.getByTestId("rotation-card").getByRole("img", { name: /^Mapa de rodízio\. Sugerido: Coxa/ })).toBeVisible();
  // "Antes de aplicar": informativo, desmarcado a cada visita e nunca bloqueia o registro.
  const safety = page.getByRole("group", { name: "Antes de aplicar" });
  await expect(safety.getByRole("checkbox")).toHaveCount(3);
  for (const box of await safety.getByRole("checkbox").all()) await expect(box).not.toBeChecked();
  await safety.getByRole("checkbox", { name: /Agulha nova/ }).click();
  await expect(safety.getByRole("checkbox", { name: /Agulha nova/ })).toBeChecked();
  // O aviso de aplicação recente mora na folha de confirmação (recalculado pela data), não na receita.
  const notice = "Você registrou Tirzepatida 2,50 mg há 2 dias.";
  await expect(page.getByText(notice)).toHaveCount(0);
  await expect(recipeRegister(page)).toHaveText("Registrar aplicação");
  expect(await pageHeight(page)).toBeLessThanOrEqual(RECIPE_MAX_HEIGHT);
  expect(await wordsInMain(page)).toBeLessThanOrEqual(MAX_WORDS);

  await recipeRegister(page).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  const checklist = dialog.getByRole("list", { name: "Confira antes de aplicar" });
  await expect(checklist).toContainText("Frasco");
  await expect(checklist).toContainText("Seringa");
  await expect(checklist).toContainText("Dose");
  await expect(dialog).toContainText(notice);
  await expect(dialog.getByRole("button", { name: "Voltar" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await saved(page)).injections).toHaveLength(3);

  await recipeRegister(page).click();
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(page.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.")).toBeVisible();
  await expect.poll(async () => (await saved(page)).injections.length).toBe(4);
  const added = (await saved(page)).injections.find((e) => e.date === today);
  expect(added).toMatchObject({ site: "coxa", method: "frasco", units: 50, doseMg: 2.5 });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect.poll(async () => (await saved(page)).injections.length).toBe(3);
});

test("outra dose ou frasco novo: frasco aberto e focado, seringa com lupa", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({}, usualDose()));
  await openInjecao(page);
  await page.getByRole("button", { name: "Outra dose ou frasco novo" }).click();
  await expect(page.getByTestId("injection-concentration")).toHaveText("5");
  await expect(page.getByRole("button", { name: "Diminuir 0,1 mg/ml" })).toBeVisible();
  const frasco = page.getByRole("button", { name: "Alterar a concentração do frasco" });
  await expect(frasco).toHaveAttribute("aria-expanded", "true");
  await expect(frasco).toBeFocused();
  await expect(page.getByRole("radio", { name: "Seringa de 100 UI" })).toBeChecked();
  await expect(page.getByTestId("injection-dose")).toHaveText("2,50");
  await expect(page.getByTestId("injection-volume")).toHaveText("0,50");
  const lens = page.getByTestId("syringe-lens");
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("syringe-barrel")).toHaveCount(1);
  await expect(page.getByTestId("syringe-marker")).toHaveCount(1);
});

test("calculadora guiada: escala legível, barra fixa, sem rolagem lateral e página curta", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "1 mg" }));
  await openInjecao(page);
  await expect(page.getByTestId("injection-dose")).toHaveText("—");
  const manual = page.getByRole("button", { name: "Ajuste manual" });
  await manual.click();
  await expect(page.getByLabel("Unidades na seringa")).toBeDisabled();
  await manual.click();
  await expect(manual).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("radio", { name: "Seringa de 100 UI" }).click();
  await page.getByRole("button", { name: "Dose de 1,00 mg", exact: true }).click();
  await expect(page.locator(".inj-hero")).toContainText("75 UI");
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const scale = await scaleReport(page);
    expect(scale.count, `rótulos em ${width}px`).toBeGreaterThanOrEqual(5);
    expect(scale.minSize, `fonte em ${width}px`).toBeGreaterThanOrEqual(12);
    expect(scale.allAbove, `acima do cilindro em ${width}px`).toBe(true);
    expect(scale.overlaps, `sobreposição em ${width}px`).toBe(0);
    expect(await hasSideScroll(page), `rolagem lateral em ${width}px`).toBe(false);
    if (width === 320) expect(await rulerOverlaps(page)).toBe(0);
  }
  const bar = page.getByTestId("injection-bar");
  for (const top of [0, 99999]) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  expect(await wordsInMain(page)).toBeLessThanOrEqual(MAX_WORDS);
  expect(await pageHeight(page)).toBeLessThanOrEqual(FORM_MAX_HEIGHT);
});

test("modo caneta: dose em mg, régua da bula, confirmação sem seringa e registro sem UI", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({ hideCalories: true }));
  await openInjecao(page);
  await page.getByRole("radio", { name: "Caneta com seletor" }).click();
  await expect(page.getByRole("radio", { name: "Seringa de 30 UI" })).toHaveCount(0);
  await expect(page.getByTestId("injection-concentration")).toHaveCount(0);
  await page.getByRole("radio", { name: "Tirzepatida", exact: true }).click();
  await page.getByRole("button", { name: "Dose de 5,00 mg", exact: true }).click();
  await expect(page.getByTestId("injection-dose")).toHaveText("5,00");
  await expect(page.getByRole("img", { name: /^Faixa da bula: Titulação/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/kcal|caloria/i);
  await page.getByRole("button", { name: /^Confirmar e registrar 5,00 mg/ }).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  await expect(dialog).toContainText("Caneta com seletor");
  await expect(dialog).not.toContainText("Seringa");
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  // SERINGA-10: a folha "Aplicação registrada" leva ao diário.
  await page
    .getByRole("dialog", { name: "Aplicação registrada" })
    .getByRole("button", { name: "Ver no diário", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Tirzepatida 5,00 mg" })).toBeVisible();
  await expect(page.getByText("Caneta · Abdômen")).toBeVisible();
  const entry = (await saved(page)).injections[0];
  expect(entry).toMatchObject({ method: "caneta", doseMg: 5, units: null, volumeMl: null, concentrationMgPerMl: null });
});

test("dose que não cabe na seringa: aviso sem grampear e régua acima da bula sem bloquear", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "1 mg" }));
  await openInjecao(page);
  await page.getByRole("button", { name: "Digitar a dose prescrita" }).click();
  const input = page.getByLabel("Dose prescrita em mg");
  await input.fill("3");
  await input.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("injection-dose")).toHaveText("3,00");
  await expect(page.getByTestId("injection-volume")).toHaveText("—");
  await expect(page.getByRole("status").filter({ hasText: "precisaria de 224 UI" })).toBeVisible();
  const blocked = page.getByRole("button", { name: "Confira a concentração do frasco para registrar" });
  await expect(blocked).toHaveAttribute("aria-disabled", "true");
  await blocked.click({ force: true });
  await expect(page.locator(".toast")).toContainText("precisaria de 224 UI");
  await expect(page.getByRole("img", { name: /Acima/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Acima das doses habituais" })).toContainText("2,40 mg");

  await page.getByRole("button", { name: "Alterar a concentração do frasco" }).click();
  await page.getByRole("button", { name: "5 mg/ml", exact: true }).click();
  await expect(page.getByTestId("injection-volume")).toHaveText("0,60");
  await expect(page.locator(".inj-hero")).toContainText("60 UI");
  const ready = page.getByRole("button", { name: /^Confirmar e registrar 60 UI/ });
  await expect(ready).toHaveAttribute("aria-disabled", "false");
  await ready.click();
  await expect(page.getByRole("dialog", { name: "Confirmar aplicação" })).toBeVisible();
});

test("atalho de dose: marca mais próxima da seringa, régua pela dose prescrita e aviso da marca", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "0,25 mg" }));
  await openInjecao(page);
  await expect(page.getByTestId("injection-concentration")).toHaveText("1,34");
  // 0,25 mg a 1,34 mg/ml = 19 UI (0,2546 mg): a tela mostra 0,25, a régua fica em "Inicial".
  const quarter = page.getByRole("button", { name: "Dose de 0,25 mg", exact: true });
  await quarter.click();
  await expect(page.getByTestId("injection-dose")).toHaveText("0,25");
  await expect(page.locator(".inj-hero")).toContainText("19 UI");
  await expect(page.getByRole("img", { name: /^Faixa da bula: Inicial/ })).toBeVisible();
  await expect(quarter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/é a marca mais próxima de/)).toHaveCount(0);
  const one = page.getByRole("button", { name: "Dose de 1,00 mg", exact: true });
  await one.click();
  await expect(page.getByTestId("injection-dose")).toHaveText("1,00");
  await expect(one).toHaveAttribute("aria-pressed", "true");
  await expect(quarter).toHaveAttribute("aria-pressed", "false");

  // Dose que a seringa não marca: a linha de 12 px explica a diferença.
  await page.getByRole("radio", { name: "Tirzepatida", exact: true }).click();
  await page.getByRole("button", { name: "Digitar a dose prescrita" }).click();
  const input = page.getByLabel("Dose prescrita em mg");
  await input.fill("2,52");
  await input.press("Enter");
  await expect(page.getByTestId("injection-dose")).toHaveText("2,50");
  const hint = page.getByText("50 UI é a marca mais próxima de 2,52 mg na seringa (2,50 mg).", { exact: true });
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(12);
});

test("limite da seringa: +0,05 mg em 100 UI mostra o aviso e o ajuste fino não troca a dose", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "1 mg" }));
  await openInjecao(page);
  await page.getByRole("button", { name: "Digitar a dose prescrita" }).click();
  const input = page.getByLabel("Dose prescrita em mg");
  await input.fill("1,34");
  await input.press("Enter");
  await expect(page.locator(".inj-hero")).toContainText("100 UI");
  await page.getByRole("button", { name: "Aumentar 0,05 mg", exact: true }).click();
  await expect(page.getByTestId("injection-dose")).toHaveText("1,39");
  await expect(page.getByTestId("injection-volume")).toHaveText("—");
  await expect(page.getByRole("status").filter({ hasText: "precisaria de 104 UI" })).toBeVisible();

  await page.getByRole("button", { name: "Ajuste manual" }).click();
  for (const name of ["Aumentar 1 UI", "Aumentar 5 UI", "Diminuir 1 UI"]) {
    const fine = page.getByRole("button", { name, exact: true });
    await expect(fine).toHaveAttribute("aria-disabled", "true");
    await fine.click({ force: true });
    await expect(page.locator(".toast")).toContainText("precisaria de 104 UI");
    await expect(page.getByTestId("injection-dose")).toHaveText("1,39");
    await expect(page.getByTestId("injection-volume")).toHaveText("—");
  }
});

test("radiogroups pelo teclado: uma parada de Tab e setas escolhem", async ({ page }) => {
  await seed(page, penState({ weightLossPenName: "Semaglutida", weightLossPenDose: "1 mg" }));
  await openInjecao(page);
  const method = page.getByRole("radiogroup", { name: "Como você aplica?" });
  // O guia (i) fica no cabeçalho (conceito 10), antes da navegação: entra-se no grupo pelo conteúdo. Uma só
  // parada de Tab: da medicação marcada, Shift+Tab cai no método marcado (não no último do grupo).
  await page.getByRole("radio", { name: "Semaglutida", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(method.getByRole("radio", { name: "Frasco e seringa" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const pen = method.getByRole("radio", { name: "Caneta com seletor" });
  await expect(pen).toBeFocused();
  await expect(pen).toBeChecked();
  await expect(page.getByRole("radio", { name: "Seringa de 30 UI" })).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(method.getByRole("radio", { name: "Caneta de dose única" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(method.getByRole("radio", { name: "Frasco e seringa" })).toBeChecked();
  // Uma só parada de Tab por grupo: do método direto para a medicação marcada.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Semaglutida", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Personalizado", exact: true })).toBeChecked();
});

test("Hoje: próxima dose estimada, ciclo, local sugerido e card promovido no dia", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({}, [injection(2)]));
  const ring = page.getByTestId("next-dose-ring");
  await expect(ring).toHaveAccessibleName(/^Próxima dose estimada em 5 dias/);
  // A faixa do ciclo saiu do widget: o dia do ciclo fica no nome do anel.
  await expect(ring).toHaveAccessibleName(/dia 3 de 7 do ciclo/);
  await expect(page.getByTestId("injection-site-mini")).toHaveAccessibleName("Local sugerido: Coxa");
  await expect(page.getByRole("button", { name: "Calcular dose e registrar" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/atrasad/i);
  await page.getByRole("button", { name: "Como você está? Registrar bem-estar" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar bem-estar" })).toBeVisible();

  await seed(page, penState({}, [injection(7)]));
  const card = page.locator(".injection-card");
  const cardTop = (await card.boundingBox())!.y;
  // No dia estimado o card sobe acima das refeições (a primeira seção do padrão).
  const mealsTop = (await page.locator(".meals-section").boundingBox())!.y;
  expect(cardTop).toBeLessThan(mealsTop);
  await card.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(page.getByText("Aplicação registrada no diário: Tirzepatida 2,50 mg.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Registrar aplicação", exact: true })).toHaveCount(0);
  await expect(ring).toHaveAccessibleName(/^Próxima dose estimada em 7 dias/);
  await expect(ring).toContainText("7");
  await expect(page.getByRole("heading", { name: "Medicação injetável" })).toBeFocused();

  await seed(page, penState({}, [injection(9)]));
  await expect(card).toContainText("estimada");
  await expect(page.locator("main")).not.toContainText(/atrasad/i);
  const colors = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--wf-tone-medication-fg)";
    document.body.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    const fills = [...document.querySelectorAll<SVGElement>(".dose-ring-fill")].map((c) => getComputedStyle(c).stroke);
    return { token, fills };
  });
  expect(colors.fills.length).toBeGreaterThan(0);
  for (const fill of colors.fills) expect(fill).toBe(colors.token);
});

for (const pregnancy of ["gestacao", "amamentacao"] as const) {
  test(`${pregnancy}: sem contagem nem ciclo, só o registro`, async ({ page }) => {
    await seed(page, penState({ pregnancy }, [injection(2)]));
    await expect(page.getByRole("button", { name: "Calcular dose e registrar" })).toBeVisible();
    await expect(page.getByTestId("next-dose-ring")).toHaveCount(0);
    await expect(page.getByTestId("dose-cycle-strip")).toHaveCount(0);
  });
}

test("Meu tratamento mostra a frequência, o modo e os degraus de dose", async ({ page }) => {
  await seed(
    page,
    penState({}, [
      injection(16, { site: "braco" }),
      injection(9, { site: "coxa" }),
      injection(2, { units: 100, volumeMl: 1, doseMg: 5 }),
    ]),
  );
  await page.getByRole("navigation").getByRole("button", { name: "Meu espaço", exact: true }).click();
  // Conceito 11: "Meu tratamento" abre numa folha pela linha Medicação do mosaico "Perfil de saúde".
  await page.getByTestId("health-mosaic").getByRole("button", { name: "Medicação", exact: true }).click();
  // Na folha, o título "Meu tratamento" é o do diálogo (o cartão não repete o h2).
  await expect(page.getByRole("dialog", { name: "Meu tratamento" })).toBeVisible();
  const card = page.getByTestId("treatment-card");
  await expect(card).toContainText("Tirzepatida · semanal · Frasco e seringa");
  await expect(page.getByTestId("dose-steps")).toHaveAccessibleName(/^Degraus de dose: 2,50 mg desde/);
});

test("lembrete do dia estimado abre Seringa e dose", async ({ page }) => {
  await seed(
    page,
    penState({ remindersEnabled: true, quietStart: "00:00", quietEnd: "00:00" }, [injection(7, { time: "00:00" })]),
  );
  await page.getByRole("button", { name: /^Notificações/ }).click();
  const item = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Dia da aplicação (estimado)" }),
  });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Abrir registro" }).click();
  await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
});

test("guia rápido e segurança em quatro cartões", async ({ page }) => {
  await seed(page, penState());
  await openInjecao(page);
  await expect(page.getByRole("button", { name: "Informações de segurança" })).toHaveCount(0);
  await page.getByRole("button", { name: "Guia rápido e segurança" }).click();
  const guide = page.getByRole("dialog", { name: "Guia rápido" });
  for (const title of ["Confira o frasco", "Leia a seringa certa", "Troque o local", "Quem orienta a dose"])
    await expect(guide.getByRole("heading", { name: title })).toBeAttached();
  await expect(guide).toContainText("dor abdominal forte");
  await expect(guide).toContainText("1 de 4");
  await guide.getByRole("button", { name: "Próximo cartão" }).click();
  await expect(guide).toContainText("2 de 4");
});

test("receita antiga: formulário vazio com o aviso e sem estimativa no Hoje", async ({ page }) => {
  await seed(page, penState({}, [injection(30)]));
  await expect(page.getByTestId("next-dose-ring")).toHaveCount(0);
  await expect(page.locator(".injection-card").getByRole("button", { name: "Registrar aplicação" })).toHaveCount(0);
  await openInjecao(page);
  await expect(page.getByTestId("injection-recipe")).toHaveCount(0);
  await expect(page.getByText("Faz tempo desde a última aplicação: confirme a dose com quem prescreveu.")).toBeVisible();
  await expect(page.getByTestId("injection-dose")).toHaveText("—");
  await expect(page.getByRole("radio", { name: "Tirzepatida", exact: true })).toBeChecked();
  await expect(page.getByTestId("injection-concentration")).toHaveText("5");
});

test("folha de confirmação recalcula o aviso de aplicação recente para a data escolhida", async ({ page }) => {
  await seed(page, penState({}, [injection(1)]));
  await openInjecao(page);
  await recipeRegister(page).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  await expect(dialog).toContainText("Você registrou Tirzepatida 2,50 mg ontem.");
  await dialog.getByRole("button", { name: "Alterar data e horário" }).click();
  await dialog.getByRole("button", { name: "Ontem", exact: true }).click();
  await expect(dialog).toContainText("Você já registrou Tirzepatida 2,50 mg nesse dia às 08:30.");
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect.poll(async () => (await saved(page)).injections.length).toBe(2);
});

/* ---------- Onda 3 · Lote 3: mapa de rodízio (SERINGA-04) e pós-registro (SERINGA-10) ---------- */

/** Braço esquerdo há 16 dias, coxa direita há 9 e abdômen à esquerda há 2 (sugestão: coxa esquerda). */
const withSides = () => [
  injection(16, { site: "braco", side: "esquerdo" }),
  injection(9, { site: "coxa", side: "direito" }),
  injection(2, { site: "abdomen", side: "esquerdo" }),
];
const ROTATION_ARIA =
  "Mapa de rodízio. Sugerido: Coxa esquerda. Últimas aplicações: 1, Abdômen à esquerda, há 2 dias; 2, Coxa direita, há 9 dias; 3, Braço esquerdo, há 16 dias.";
const DOSE_ADVICE = /aument|reduz|ajust|mantenha|atrasad/i;
/** Menor fonte (px) entre os elementos com texto próprio e visível dentro de `selector`. */
const smallestText = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const sizes: number[] = [];
    for (const root of document.querySelectorAll(sel))
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (own && el.getClientRects().length) sizes.push(parseFloat(getComputedStyle(el).fontSize));
      }
    return Math.min(...sizes);
  }, selector);
const centerX = async (locator: Locator) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.x + box!.width / 2;
};
const savedSheet = (page: Page) => page.getByRole("dialog", { name: "Aplicação registrada" });

test("mapa de rodízio: frente e costas, lado sugerido, selos e o lado gravado", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({}, withSides()));
  await openInjecao(page);
  await page.getByRole("button", { name: "Outra dose ou frasco novo" }).click();
  const map = page.getByTestId("injection-body-map");
  await expect(map.getByRole("img", { name: ROTATION_ARIA, exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Coxa", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Esquerdo", exact: true })).toBeChecked();
  await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa esquerda");
  const badges = page.getByTestId("rotation-badge");
  await expect(badges).toHaveCount(3);
  // Lado da pessoa: de frente, o esquerdo fica à direita de quem olha; de costas, à esquerda.
  const [front, back] = [map.locator(".rot-canvas").nth(0), map.locator(".rot-canvas").nth(1)];
  expect(await centerX(badges.filter({ hasText: /^1$/ }))).toBeGreaterThan(await centerX(front));
  expect(await centerX(badges.filter({ hasText: /^3$/ }))).toBeLessThan(await centerX(back));
  expect(await smallestText(page, ".inj-site-card")).toBeGreaterThanOrEqual(12);
  // O mapa só resume (pontos pequenos demais para 44 px): tocar no desenho não troca local nem lado.
  const spot = map.locator(".rot-spot").first();
  await expect(spot).toHaveCSS("cursor", "auto");
  await spot.click({ force: true });
  await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa esquerda");

  await page.getByRole("radio", { name: "Direito", exact: true }).click();
  await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa direita");
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await hasSideScroll(page)).toBe(false);
  await page.setViewportSize(PHONE);
  await expect(page.getByTestId("injection-dose")).toHaveText("2,50");
  await page.getByRole("button", { name: /^Confirmar e registrar/ }).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  await expect(dialog.getByText("Local · Coxa direita", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(savedSheet(page)).toBeVisible();
  const added = (await saved(page)).injections.find((e) => e.date === today);
  expect(added).toMatchObject({ site: "coxa", side: "direito" });
});

test("folha da receita: lado sugerido marcado e a troca de lado é gravada", async ({ page }) => {
  await seed(page, penState({}, withSides()));
  await openInjecao(page);
  await expect(page.getByTestId("next-application")).toContainText("Local sugerido: Coxa esquerda");
  await recipeRegister(page).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar aplicação" });
  const sides = dialog.getByRole("radiogroup", { name: "Lado do corpo" });
  await expect(sides.getByRole("radio", { name: "Esquerdo", exact: true })).toBeChecked();
  await sides.getByRole("radio", { name: "Direito", exact: true }).click();
  await expect(sides.getByRole("radio", { name: "Direito", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(savedSheet(page)).toBeVisible();
  const added = (await saved(page)).injections.find((e) => e.date === today);
  expect(added).toMatchObject({ site: "coxa", side: "direito" });
});

test("registros antigos sem lado: nada inventado no mapa", async ({ page }) => {
  await seed(page, penState({}, usualDose()));
  await openInjecao(page);
  await expect(page.locator(".inj-chip-site")).toHaveText("Local sugerido: Coxa");
  await page.getByRole("button", { name: "Outra dose ou frasco novo" }).click();
  await expect(page.getByTestId("rotation-badge")).toHaveCount(0);
  const map = page.getByTestId("injection-body-map").getByRole("img");
  await expect(map).toHaveAccessibleName(/lado não informado/);
  await expect(page.getByTestId("injection-site-indicator")).toHaveText("Local: Coxa");
});

test("aplicação registrada: próxima dose estimada, próximo local, bem-estar, medidas e diário", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, penState({}, [injection(7)]));
  await openInjecao(page);
  // No dia estimado: "Registrar aplicação de hoje" e "Hoje" no anel (nota da proposta).
  await expect(recipeRegister(page)).toHaveText("Registrar aplicação de hoje");
  await expect(page.getByTestId("next-application")).toContainText(/Hoje, \d+ \w+/);
  const register = async () => {
    await recipeRegister(page).click();
    await page
      .getByRole("dialog", { name: "Confirmar aplicação" })
      .getByRole("button", { name: "Registrar aplicação", exact: true })
      .click();
    await expect(savedSheet(page)).toBeVisible();
  };
  await register();
  const sheet = savedSheet(page);
  await expect(sheet).toContainText("Aplicação registrada no diário: Tirzepatida 2,50 mg.");
  await expect(sheet).toContainText("Próxima dose estimada:");
  await expect(sheet).toContainText("Próximo local sugerido:");
  await expect(sheet.getByTestId("saved-check")).toHaveAttribute("aria-hidden", "true");
  await expect(sheet.getByRole("button", { name: "Ver no diário", exact: true })).toBeFocused();
  await expect(sheet).not.toContainText(DOSE_ADVICE);
  await sheet.getByRole("button", { name: "Como você está? Registrar bem-estar" }).click();
  const mood = page.getByRole("dialog", { name: "Registrar bem-estar" });
  await expect(mood).toBeVisible();
  await mood.getByRole("button", { name: "Fechar" }).click();

  await register();
  await savedSheet(page).getByRole("button", { name: "Registrar medidas", exact: true }).click();
  const measures = page.getByRole("dialog", { name: "Registrar medidas" });
  await expect(measures).toBeVisible();
  await measures.getByRole("button", { name: "Fechar" }).click();

  await register();
  await savedSheet(page).getByRole("button", { name: "Ver no diário", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tirzepatida 2,50 mg" }).first()).toBeVisible();
  await expect.poll(async () => (await saved(page)).injections.length).toBe(4);
});

test("aplicação registrada com números do corpo ocultos: 'Registrar medidas' abre sem o peso salvo", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const state = penState({ hideBodyNumbers: true }, [injection(7)]);
  // Uma cintura salva: a dica "Última: … cm" apareceria nas réguas do modo completo.
  const measured = {
    ...state,
    measurements: state.measurements.map((m) => ({ ...m, waist: 84, hip: 100 })),
  } as AppState;
  await seed(page, measured);
  await openInjecao(page);
  await recipeRegister(page).click();
  await page
    .getByRole("dialog", { name: "Confirmar aplicação" })
    .getByRole("button", { name: "Registrar aplicação", exact: true })
    .click();
  await savedSheet(page).getByRole("button", { name: "Registrar medidas", exact: true }).click();
  const measures = page.getByRole("dialog", { name: "Registrar medidas" });
  await expect(measures).toBeVisible();
  await expect(measures.getByRole("textbox", { name: "Peso (kg)" })).toHaveValue("");
  await expect(measures.getByRole("textbox", { name: "Cintura (cm)" })).toHaveValue("");
  await expect(measures.getByRole("slider")).toHaveCount(0);
  await expect(measures).not.toContainText(/\d[\d.,]*\s*(kg|cm)\b|Última/);
});

test("aplicação registrada em perfis sensíveis e com movimento reduzido", async ({ page }) => {
  await seed(page, penState({ pregnancy: "gestacao" }, [injection(7)]));
  await openInjecao(page);
  // Gestação: sem contagem nem data estimada; o cartão mostra só a última aplicação.
  await expect(page.getByTestId("next-application-ring")).toHaveCount(0);
  await expect(page.getByTestId("next-application")).toContainText("Última aplicação");
  await expect(page.getByTestId("next-application")).not.toContainText(/estimad/i);
  await expect(page.getByRole("list", { name: "Últimas aplicações" })).not.toContainText("próxima");
  await expect(recipeRegister(page)).toHaveText("Registrar aplicação");
  await recipeRegister(page).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(savedSheet(page)).toContainText("Próximo local sugerido:");
  await expect(savedSheet(page)).not.toContainText("Próxima dose estimada");
  await expect(savedSheet(page).getByRole("button", { name: "Registrar medidas" })).toHaveCount(0);
  await expect(savedSheet(page).getByRole("button", { name: "Como você está? Registrar bem-estar" })).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, penState({ eatingDisorder: "sim" }, [injection(7)]));
  await openInjecao(page);
  await recipeRegister(page).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await expect(savedSheet(page).getByRole("button", { name: "Registrar medidas" })).toHaveCount(0);
  const animation = await savedSheet(page)
    .locator('[data-testid="saved-check"] path')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  // Fechar fica na Seringa, com o foco em "Últimas aplicações".
  await savedSheet(page).getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimas aplicações" })).toBeFocused();
});

test("últimas aplicações em faixa: 3 passadas + a próxima estimada, miniatura nomeada, nada inventado", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seed(
    page,
    penState({}, [
      injection(16, { site: "braco", side: "esquerdo" }),
      injection(9, { site: "coxa", side: "direito" }),
      injection(2, { site: "abdomen" }),
    ]),
  );
  await openInjecao(page);
  const strip = page.getByRole("list", { name: "Últimas aplicações" });
  const cols = strip.getByRole("listitem");
  await expect(cols).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Últimas aplicações" })).toBeVisible();
  await expect(page.locator(".inj-strip-head")).toContainText("Todas com 2,50 mg · semanais");
  // Da mais antiga para a mais nova; cada miniatura é uma imagem com o nome completo do local.
  await expect(cols.nth(0)).toContainText("há 16 dias");
  await expect(cols.nth(0).getByRole("img")).toHaveAccessibleName("Local: Braço esquerdo");
  await expect(cols.nth(1).getByRole("img")).toHaveAccessibleName("Local: Coxa direita");
  // Sem lado: a zona inteira acende (um ponto no centro do abdômen), sem lado inventado.
  await expect(cols.nth(2).getByRole("img")).toHaveAccessibleName("Local: Abdômen");
  await expect(cols.nth(2).locator(".inj-mini-dot")).toHaveCount(1);
  await expect(cols.nth(3)).toContainText("próxima estimada");
  await expect(cols.nth(3).getByRole("img")).toHaveAccessibleName("Local sugerido: Coxa esquerda");
  await expect(cols.nth(3)).not.toContainText(/mg/);
  // Rodízio: abdômen "última", coxa direita "recente", braço "livre"; a sugestão é a coxa esquerda.
  const rotation = page.getByTestId("rotation-card");
  await expect(rotation.locator(".rot-callout.is-ultima")).toContainText("Abdômen");
  await expect(rotation.locator(".rot-callout.is-recente")).toContainText("Coxa dir.");
  await expect(rotation.locator(".rot-callout.is-livre")).toContainText("Braço esq.");
  await expect(rotation.locator(".rot-suggest-box")).toContainText("Coxa esquerda");
  await rotation.getByRole("button", { name: "Costas" }).click();
  await expect(rotation.locator(".rot-callout")).toHaveCount(1);
  await expect(rotation.locator(".rot-suggest-box")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await hasSideScroll(page)).toBe(false);
  expect(await smallestText(page, ".inj-screen")).toBeGreaterThanOrEqual(12);
});

/* ---------- Sinal da caneta (chip de insight + folha) ---------- */

const SMALL_FOOD: FoodItem = {
  id: "test-arroz",
  name: "Arroz do teste",
  category: "Cereais",
  caloriesPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  source: "Tabela de teste",
};
/** Três dias anteriores com duas refeições pequenas cada: o alerta de ingestão de quem usa caneta. */
function lowIntakeDiary(userId: string) {
  return [1, 2, 3].flatMap((n) => {
    const date = shiftDate(today, -n);
    return ["12:00", "19:00"].map((time) =>
      diarySchema.parse({
        id: `pouco-${date}-${time}`,
        userId,
        date,
        time,
        createdAt: `${date}T${time}:00Z`,
        updatedAt: `${date}T${time}:00Z`,
        type: "refeicao",
        title: "Refeição",
        description: "Arroz do teste (250 g)",
        items: [{ food: SMALL_FOOD, grams: 250 }],
        calories: 320,
        macros: { protein: 6, carbs: 70, fat: 1 },
      }),
    );
  });
}

test("caneta: comendo pouco vira chip na Seringa, com a folha calma e a pergunta pronta, sem números nem dose", async ({ page }) => {
  const state = penState({}, usualDose());
  const seeded = {
    ...state,
    diary: lowIntakeDiary(state.userId),
    goalHistory: [{ date: shiftDate(today, -10), profile: state.profile! }],
  } as AppState;
  await seed(page, seeded);
  await openInjecao(page);
  const chip = page.getByTestId("insight-chips").locator('[data-signal="caneta-ingestao"]');
  await expect(chip).toHaveText("Comendo pouco");
  await expect(page.locator("main")).not.toContainText(/fale com quem prescreveu/);
  await chip.click();
  const sheet = page.getByRole("dialog", { name: "Comendo pouco" });
  const body = sheet.getByTestId("insight-sheet");
  await expect(body).toContainText("fale com quem prescreveu");
  await expect(body).not.toContainText(/\d|dose|mg\b/i);
  await sheet.getByRole("button", { name: "Pedir ideias", exact: true }).click();
  await expect(page.getByLabel("Mensagem para o agente")).toHaveValue(/refeições pequenas/);
});
