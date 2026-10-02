import { test, expect, type Page } from "@playwright/test";
import { profileFixture } from "../fixtures";
import {
  goalsFor,
  initialState,
  localDate,
  shiftDate,
} from "../../src/lib/domain";
import { questionnaire } from "../../src/data/questionnaire";
import { fmtNumber } from "../../src/lib/format";
import {
  PROJECTION_CAPTION,
  UNDERWEIGHT_TEXT,
  weightProjection,
} from "../../src/lib/body-metrics";
import { HABIT_SUGGESTIONS } from "../../src/data/habit-suggestions";
import type { AppState, Draft } from "../../src/types";
import { ANAMNESE_FINISH_LABEL } from "../../src/lib/copy";

// Onda 3 · Lote 1: triagem antes das medidas, "O que você já contou", IMC neutro e silhueta,
// caneta configurada, linha do dia, metas recomendadas, projeção em faixa e o plano inicial.
test.use({ viewport: { width: 390, height: 844 } });

// Perfil completo de hoje: condições da lista fechada (texto "a,b" no rascunho).
const base = () =>
  ({ ...profileFixture(), conditionTags: "nenhuma" }) as unknown as Draft;
const stepOf = (title: string) =>
  questionnaire.findIndex((step) => step.title === title);
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });
const anamnese = (page: Page) => page.locator("main.anamnese");

/** Grava o estado fora do app (página de status, mesma origem) para o autosave não sobrescrever. */
async function putState(page: Page, state: AppState) {
  await page.goto("/api/status");
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
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
}

/** Rascunho na etapa `step`; `expected` é a etapa em que a anamnese deve abrir. */
async function seedDraft(
  page: Page,
  draft: Draft,
  step: number,
  { marker = true, expected = step }: { marker?: boolean; expected?: number } = {},
) {
  await putState(page, {
    ...initialState(),
    draft: marker ? { ...draft, anamneseFlow: 2 } : draft,
    draftStep: step,
  } as AppState);
  await page.goto("/");
  await expect(heading(page, questionnaire[expected].title)).toBeVisible();
}

async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const req = indexedDB.open("webfit-personal-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("state", "readonly");
          const value = tx.objectStore("state").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(value.result as AppState);
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

async function pick(page: Page, key: string, value: string) {
  const radio = page.locator(`input[type="radio"][name="${key}Choice"][value="${value}"]`);
  await page.locator("label").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

const next = (page: Page) =>
  page.getByRole("button", { name: "Salvar e continuar" }).click();

test("triagem sensível vem antes das medidas e esconde IMC, silhueta, peso desejado e projeção", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .click();
  await expect(heading(page, "Vamos conhecer você")).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "Objetivo principal" }),
  ).toBeVisible();
  await page.getByLabel("Como você se chama?").fill("Pessoa Teste");
  await page.locator('input[name="birthDate"]').fill("1992-06-15");
  await pick(page, "sex", "feminino");
  await pick(page, "goal", "perder");
  await page.locator('input[name="occupation"]').fill("Trabalho em escritório");
  await page.locator('input[name="routine"]').fill("Trabalho durante o dia.");
  await page.locator('input[name="consentLocal"]').check();
  await next(page);
  await expect(heading(page, "Cuidados importantes")).toBeVisible();
  await expect(
    page
      .getByRole("radiogroup", { name: "Como prefere ver números?" })
      .getByRole("radio", { name: /Mostrar calorias/ }),
  ).toBeChecked();
  await pick(page, "eatingDisorder", "sim");
  await expect(
    page.locator(".anamnese-echo").filter({ hasText: /^Obrigado por confiar/ }),
  ).toBeVisible();
  await pick(page, "pregnancy", "nao");
  await pick(page, "fluidRestriction", "nao");
  await page.getByRole("button", { name: "Nenhuma", exact: true }).first().click();
  await next(page);
  await expect(heading(page, "Seu ponto de partida")).toBeVisible();
  // Peso e altura primeiro: o medidor teria dados, mas o perfil é sensível.
  await page.locator('input[name="weight"]').fill("72");
  await page.locator('input[name="height"]').fill("165");
  await expect(page.locator('input[name="height"]')).toHaveValue("165");
  await expect(page.getByTestId("anamnese-bmi")).toHaveCount(0);
  await expect(page.getByTestId("measure-figure")).toHaveCount(0);
  await expect(anamnese(page)).not.toContainText("IMC");

  await seedDraft(page, { ...base(), goal: "perder", eatingDisorder: "sim" }, 6);
  await expect(page.locator('input[name="targetWeight"]')).toHaveCount(0);
  await expect(page.getByTestId("weight-projection")).toHaveCount(0);
  const goals = page.getByTestId("goals-recommended");
  await expect(goals).toContainText("avaliação individual");
  await expect(goals).not.toContainText(/kcal/);
  await expect(
    goals.getByRole("button", { name: "Informar metas de um profissional" }),
  ).toBeVisible();
});

test("objetivo e consentimento do primeiro acesso viram 'O que você já contou'", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await page.getByLabel("Como você se chama?").fill("Ana Silva");
  await page.getByRole("radio", { name: "Emagrecer e criar hábitos" }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(heading(page, "Seu primeiro passo")).toBeVisible();
  await page
    .getByRole("radio", { name: new RegExp(HABIT_SUGGESTIONS[0].title) })
    .check();
  await page
    .getByLabel("Concordo em salvar minhas respostas e registros neste navegador.")
    .check();
  await page
    .getByRole("button", { name: "Começar com combinados", exact: true })
    .click();
  await expect(heading(page, "Olá, Ana.")).toBeVisible();
  await page.getByRole("button", { name: "Personalizar alimentação" }).click();
  const known = page.getByTestId("anamnese-known");
  await expect(known).toContainText("Reduzir meu peso com acompanhamento");
  await expect(known).toContainText("Respostas salvas neste navegador");
  await expect(
    page.getByLabel(
      "Concordo em salvar minhas respostas e registros neste navegador.",
    ),
  ).toHaveCount(0);
  await expect(page.getByLabel("Como você se chama?")).toHaveValue("Ana Silva");
  const change = page.getByRole("button", { name: "Alterar objetivo" });
  await expect(change).toHaveAttribute("aria-expanded", "false");
  await change.click();
  await expect(change).toHaveAttribute("aria-expanded", "true");
  const goal = page.getByRole("radio", {
    name: /Reduzir meu peso com acompanhamento/,
  });
  await expect(goal).toBeChecked();
  await expect(goal).toBeFocused();
  await page.getByRole("button", { name: "Ler termos completos" }).click();
  await expect(
    page.getByRole("dialog", { name: "Termos completos" }),
  ).toBeVisible();
});

test("IMC em faixas neutras e silhueta de medidas só para adulto não sensível", async ({
  page,
}) => {
  await seedDraft(page, base(), stepOf("Seu ponto de partida"));
  await expect(
    page.getByRole("img", { name: /^IMC estimado 26,4, na faixa de 25 a 29,9/ }),
  ).toBeVisible();
  const colors = await page.evaluate(() => {
    const probe = (value: string) => {
      const span = document.createElement("span");
      span.style.color = value;
      document.body.append(span);
      const color = getComputedStyle(span).color;
      span.remove();
      return color;
    };
    const gauge = document.querySelector('[data-testid="anamnese-bmi"]');
    const marker = document.querySelector('[data-testid="bmi-marker"]');
    const elements = gauge ? [gauge, ...gauge.querySelectorAll("*")] : [];
    return {
      marker: marker ? getComputedStyle(marker).color : "",
      body: probe("var(--wf-tone-body-fg)"),
      forbidden: [
        "--wf-rose-600",
        "--wf-rose-700",
        "--wf-amber-600",
        "--wf-amber-700",
      ].map((token) => probe(`var(${token})`)),
      used: elements.flatMap((el) => {
        const style = getComputedStyle(el);
        return [style.color, style.backgroundColor, style.borderTopColor, style.fill];
      }),
    };
  });
  expect(colors.marker).toBe(colors.body);
  for (const color of colors.forbidden) expect(colors.used).not.toContain(color);
  await expect(page.getByTestId("measure-figure")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Informar Cintura (cm)" }),
  ).toBeVisible();
  await expect(page.getByText("· referência de 18,5 a 24,9")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const today = localDate();
  const teen = `${Number(today.slice(0, 4)) - 16}${today.slice(4)}`;
  await seedDraft(page, { ...base(), birthDate: teen }, stepOf("Seu ponto de partida"));
  await expect(page.getByTestId("anamnese-bmi")).toHaveCount(0);
  await expect(page.getByTestId("measure-figure")).toHaveCount(0);
});

test("caneta: frequência, dia da aplicação e registro da última aplicação só com confirmação", async ({
  page,
}) => {
  const forbidden = /aumente|reduza|próxima dose/i;
  const expectNoDoseAdvice = async () =>
    expect(await anamnese(page).innerText()).not.toMatch(forbidden);
  await seedDraft(
    page,
    {
      ...base(),
      weightLossPen: "sim",
      weightLossPenName: "Mounjaro (tirzepatida)",
      weightLossPenDose: "5 mg",
      weightLossPenPerMonth: 4,
      medications: "Não uso medicamentos",
    },
    stepOf("Histórico de saúde"),
  );
  // Conceito 07: caneta, dose e frequência moram em "Caneta e dose", recolhido quando já respondido.
  const penDetails = page.getByTestId("pen-details");
  await expect(penDetails).toContainText("Mounjaro · 5 mg · semanal");
  const penHead = penDetails.getByRole("button", { name: /^Caneta e dose/ });
  await expect(penHead).toHaveAttribute("aria-expanded", "false");
  await penHead.click();
  const frequency = page.getByRole("radiogroup", { name: "Com que frequência?" });
  await expect(frequency.getByRole("radio", { name: "Semanal" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const days = page
    .getByRole("radiogroup", { name: "Dia da aplicação" })
    .getByRole("radio");
  await expect(days).toHaveCount(8);
  const boxes = await days.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      // Arredonda o subpixel (43,99999 px) do layout.
      return [Math.round(rect.width), Math.round(rect.height)];
    }),
  );
  for (const [width, height] of boxes) {
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("radio", { name: "Quinta-feira" }).click();
  await expect(page.locator('input[name="penWeekday"]')).toHaveValue("4");
  const chip = page.locator(".coherence-chip").filter({
    hasText: "Não uso medicamentos",
  });
  await expect(chip).toBeVisible();
  await chip.getByRole("button", { name: "Incluir nos medicamentos" }).click();
  await expect(page.locator('input[name="medications"]')).toHaveValue(
    "Medicamento para emagrecer",
  );
  await expect(chip).toHaveCount(0);
  await frequency.getByRole("radio", { name: "Diária" }).click();
  await expect(
    page.getByRole("radiogroup", { name: "Dia da aplicação" }),
  ).toHaveCount(0);
  await frequency.getByRole("radio", { name: "Outra" }).click();
  await expect(
    page.getByRole("group", { name: "Aplicações por mês" }),
  ).toBeVisible();
  await expect(page.locator('input[name="weightLossPenPerMonth"]')).toHaveCount(1);
  await frequency.getByRole("radio", { name: "Semanal" }).click();
  await expect(page.locator('input[name="weightLossPenPerMonth"]')).toHaveValue("4");

  await page.getByRole("button", { name: "Registrar a última aplicação" }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: "Quando foi?" })
      .getByRole("radio", { name: "Hoje" }),
  ).toBeFocused();
  await page
    .getByRole("radiogroup", { name: "Quando foi?" })
    .getByRole("radio", { name: "Ontem" })
    .click();
  const site = page.getByRole("radiogroup", { name: "Local", exact: true });
  await site.getByRole("radio", { name: "Abdômen" }).click();
  await page
    .getByRole("radiogroup", { name: "Tipo de caneta" })
    .getByRole("radio", { name: "Caneta com seletor" })
    .click();
  await expect(
    page.getByText(
      "Vamos registrar: Tirzepatida 5,00 mg · Caneta · Abdômen · ontem, 12:00",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar para registrar" }).click();
  await expect(
    page.getByText("Será registrada no diário ao concluir a anamnese."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Não registrar" })).toBeFocused();
  // Mudar o local desfaz a confirmação.
  await site.getByRole("radio", { name: "Coxa" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar para registrar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar para registrar" }).click();
  await expectNoDoseAdvice();
  for (const index of [4, 5, 6, 7]) {
    await next(page);
    await expect(heading(page, questionnaire[index].title)).toBeVisible();
    await expectNoDoseAdvice();
  }
  await page.getByRole("button", { name: "Pular e ver o plano" }).click();
  await expect(
    page.getByText(/^Ao concluir, registramos no diário: Tirzepatida 5,00 mg/),
  ).toBeVisible();
  await expectNoDoseAdvice();
  await page.getByRole("button", { name: ANAMNESE_FINISH_LABEL }).click();
  await expect(
    page.getByText("Anamnese salva. Aplicação registrada no diário."),
  ).toBeVisible();
  const state = await saved(page);
  expect(state.injections).toHaveLength(1);
  expect(state.injections[0]).toMatchObject({
    method: "caneta",
    doseMg: 5,
    site: "coxa",
    date: shiftDate(localDate(), -1),
    time: "12:00",
    units: null,
  });
  expect(state.profile?.penWeekday).toBe(4);
});

test("linha do dia: pontos arrastáveis por teclado, sono derivado e silêncio que acompanha o sono", async ({
  page,
}) => {
  await seedDraft(page, base(), stepOf("Sono, movimento e bem-estar"));
  for (const name of ["Acordar", "Café da manhã", "Almoço", "Jantar", "Dormir"])
    await expect(page.getByRole("slider", { name, exact: true })).toBeVisible();
  const summary = page.getByTestId("sleep-summary");
  await expect(summary).toHaveText("Sono: 8 h (23:00 às 07:00)");
  const coherence = page.getByTestId("sleep-coherence");
  await expect(coherence).toContainText(
    "Você informou 7 h de sono; pelos horários são 8 h.",
  );
  await coherence.getByRole("button", { name: "Usar 8 h" }).click();
  await expect(page.locator('input[name="sleepHours"]')).toHaveValue("8");
  await expect(coherence).toHaveCount(0);
  const sleep = page.getByRole("slider", { name: "Dormir", exact: true });
  await sleep.focus();
  await page.keyboard.press("PageUp");
  await expect(sleep).toHaveAttribute("aria-valuetext", "00:00");
  await expect(page.locator('input[name="sleepTime"]')).toHaveValue("00:00");
  await expect(page.locator('input[name="sleepHours"]')).toHaveValue("7");
  await expect(summary).toHaveText("Sono: 7 h (00:00 às 07:00)");
  // Lembretes desligados: o silêncio não é perguntado, mas acompanha o sono.
  await expect(page.locator('input[name="quietStart"]')).toHaveCount(0);
  await expect
    .poll(async () => (await saved(page)).draft?.quietStart)
    .toBe("00:00");
  const legend = page.getByRole("button", {
    name: "Dormir 00:00, alterar horário",
  });
  await legend.click();
  await expect(page.getByRole("dialog", { name: "Dormir" })).toBeVisible();
  await expect(page.locator('input[name="sleepTime"]')).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(legend).toBeFocused();
  const quality = page.getByRole("radiogroup", { name: "Qualidade do sono" });
  for (const name of ["Boa", "Regular", "Ruim", "Prefiro não informar"])
    await expect(quality.getByRole("radio", { name })).toHaveCount(1);
  await page.locator('input[name="exerciseDays"]').fill("5");
  await expect(
    page.locator("label").filter({
      has: page.locator('input[name="activityLevelChoice"][value="moderado"]'),
    }),
  ).toContainText("Sugerido");
});

test("metas: recomendado para você, editor único de macros, água em copos", async ({
  page,
}) => {
  const draft = { ...base(), manualCalories: null, manualWater: null, usualWater: 1500 };
  await seedDraft(page, draft, stepOf("Objetivos e metas"));
  const expected = goalsFor(
    { ...profileFixture(), manualCalories: null, manualWater: null },
    localDate(),
  ).calories!;
  const widget = page.getByTestId("goals-recommended");
  await expect(widget).toContainText(fmtNumber(expected));
  await expect(widget).toContainText("Pela sua anamnese");
  const mirrors = ["manualCalories", "manualProtein", "manualCarbs", "manualFat", "manualWater"];
  for (const name of mirrors)
    await expect(page.locator(`input[name="${name}"]`)).toHaveCount(1);
  const toggle = widget.getByRole("button", { name: "Personalizar", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("slider", { name: "Meta calórica informada (kcal/dia)" }),
  ).toBeFocused();
  for (const name of mirrors)
    await expect(page.locator(`input[name="${name}"]`)).toHaveCount(1);
  await page
    .getByRole("slider", { name: "Divisão entre proteína e carboidratos" })
    .focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator('input[name="manualProtein"]')).not.toHaveValue("");
  await expect(widget).toContainText("Definida por você");
  await page.locator('input[name="manualCalories"]').fill("1200");
  const coherence = page.getByTestId("goals-coherence");
  await expect(coherence).toBeVisible();
  await coherence.getByRole("button", { name: "Ajustar à meta" }).click();
  await expect(coherence).toHaveCount(0);
  const [protein, carbs, fat] = await Promise.all(
    ["manualProtein", "manualCarbs", "manualFat"].map(async (name) =>
      Number(await page.locator(`input[name="${name}"]`).inputValue()),
    ),
  );
  expect(4 * protein + 4 * carbs + 9 * fat).toBeLessThanOrEqual(1260);
  await widget.getByRole("button", { name: "Voltar ao recomendado" }).click();
  for (const name of mirrors.slice(0, 4))
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue("");
  const water = page.getByTestId("water-glasses");
  await water.getByRole("button", { name: "Usar 6 copos (1,5 L)" }).click();
  await expect(page.locator('input[name="manualWater"]')).toHaveValue("1500");
  await water.getByRole("button", { name: "Mais um copo" }).click();
  await expect(page.locator('input[name="manualWater"]')).toHaveValue("1750");
  await expect(water).toContainText("7 copos · 1,75 L");
  // O CSS do Diário, carregado na abertura, já espremeu este widget em colunas de 20 px.
  for (const part of [".wg-head", ".wg-body"])
    expect((await water.locator(part).boundingBox())!.width, part).toBeGreaterThan(200);

  await seedDraft(page, { ...base(), hideCalories: true }, stepOf("Objetivos e metas"));
  const hidden = page.getByTestId("goals-recommended");
  await hidden.getByRole("button", { name: "Personalizar", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Meta calórica informada (kcal/dia)" }),
  ).toHaveCount(0);
  await expect(hidden).not.toContainText(/kcal/);
  const split = page.getByRole("slider", {
    name: "Divisão entre proteína e carboidratos",
  });
  await expect(split).toHaveAttribute("aria-valuetext", / g/);
  expect(await split.getAttribute("aria-valuetext")).not.toMatch(/%/);

  await seedDraft(
    page,
    { ...base(), fluidRestriction: "sim", manualWater: null, usualWater: 1500 },
    stepOf("Objetivos e metas"),
  );
  await expect(page.getByRole("button", { name: /Usar 6 copos/ })).toHaveCount(0);
  await expect(
    page.getByText(
      "Com restrição de líquidos, informe só a meta de quem acompanha você.",
    ),
  ).toBeVisible();
});

test("projeção do peso desejado em faixa de meses, com cautela abaixo da referência", async ({
  page,
}) => {
  const goalsStep = stepOf("Objetivos e metas");
  const losing = { ...base(), goal: "perder", weight: 80, targetWeight: 75 };
  await seedDraft(page, losing, goalsStep);
  const expected = weightProjection({
    current: 80,
    target: 75,
    height: 165,
    goal: "perder",
    today: localDate(),
  })!;
  const projection = page.getByTestId("weight-projection");
  await expect(projection).toContainText(expected.title);
  await expect(projection).toContainText(PROJECTION_CAPTION);
  expect(await anamnese(page).innerText()).not.toMatch(/\b\d{1,2}\/\d{1,2}\b/);
  await page.locator('input[name="targetWeight"]').fill("49");
  await expect(projection.locator("p")).toHaveText(UNDERWEIGHT_TEXT);
  await expect(projection).not.toContainText("Entre");
  // Condição que pede avaliação individual: peso desejado fica, a projeção sai.
  await seedDraft(page, { ...losing, conditionTags: "doenca_renal" }, goalsStep);
  await expect(
    page.getByRole("slider", { name: "Peso desejado (kg)" }),
  ).toBeVisible();
  await expect(page.getByTestId("weight-projection")).toHaveCount(0);
  // Condição com ajustes (pressão alta) mantém a projeção.
  await seedDraft(page, { ...losing, conditionTags: "hipertensao" }, goalsStep);
  await expect(page.getByTestId("weight-projection")).toContainText(expected.title);
  await seedDraft(page, { ...losing, goal: "manter" }, goalsStep);
  await expect(
    page.getByRole("slider", { name: "Peso desejado (kg)" }),
  ).toHaveCount(0);
});

test("plano inicial: carregamento que pode ser pulado, anel, cascata, água e linha do dia", async ({
  page,
}) => {
  const goalsStep = stepOf("Objetivos e metas");
  await seedDraft(page, base(), goalsStep);
  await next(page);
  await expect(heading(page, "Revise sua anamnese")).toBeVisible();
  const loader = page.getByTestId("plan-loader");
  await expect(loader).toBeVisible();
  await expect(loader.getByRole("status")).toHaveText("Montando seu plano inicial…");
  await expect(
    page.getByRole("button", { name: ANAMNESE_FINISH_LABEL }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pular e ver o plano" }).click();
  await expect(loader).toHaveCount(0);
  // Conceito 08: "Seu plano inicial, Nome"; a cascata mostra gasto e meta, o repouso fica em "Como calculamos".
  await expect(page.getByRole("heading", { name: /^Seu plano inicial, / })).toBeVisible();
  await expect(page.getByTestId("plan-ring")).toHaveAccessibleName(
    "Meta de 1.800 kcal por dia",
  );
  await expect(page.getByTestId("plan-cascade").locator("li")).toHaveCount(2);
  await expect(page.locator("details.plan-how")).toContainText("Em repouso");
  await expect(page.getByTestId("plan-water")).toHaveAccessibleName(
    /^Meta de água: 8 copos/,
  );
  await expect(page.getByTestId("plan-day")).toBeVisible();
  await expect(page.locator(".anamnese-start-card")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedDraft(page, base(), goalsStep);
  await next(page);
  await expect(heading(page, "Revise sua anamnese")).toBeVisible();
  await expect(page.getByTestId("plan-reveal")).toBeVisible();
  await expect(page.getByTestId("plan-loader")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await seedDraft(page, { ...base(), hideCalories: true }, 7);
  await expect(page.getByTestId("plan-plate")).toBeVisible();
  await expect(page.getByTestId("plan-reveal")).not.toContainText(/kcal/);

  await seedDraft(page, { ...base(), eatingDisorder: "sim" }, 7);
  await expect(page.getByRole("heading", { name: /^Seu plano de hábitos, / })).toBeVisible();
  await expect(page.locator(".anamnese-confetti")).toHaveCount(0);
  await expect(page.getByTestId("plan-ring")).toHaveCount(0);
  await expect(page.getByTestId("plan-reveal")).not.toContainText(/kcal/);
});

test("rascunho antigo abre na etapa equivalente do fluxo novo e ganha a marca ao salvar", async ({
  page,
}) => {
  await seedDraft(page, base(), 7, { marker: false });
  await seedDraft(
    page,
    {
      ...base(),
      pregnancy: "",
      eatingDisorder: "",
      fluidRestriction: "",
      conditions: "",
    },
    2,
    { marker: false, expected: stepOf("Cuidados importantes") },
  );
  await expect
    .poll(async () => (await saved(page)).draft?.anamneseFlow)
    .toBe(2);
  await seedDraft(page, { ...base(), goal: "" }, 5, { marker: false, expected: 0 });
  await expect(
    page.getByRole("radiogroup", { name: "Objetivo principal" }),
  ).toBeVisible();
  await seedDraft(page, base(), 0, { marker: false });
});

test("revisão com calorias ocultas não mostra nenhum número de calorias", async ({
  page,
}) => {
  await seedDraft(page, { ...base(), hideCalories: true, manualCalories: 1800 }, 7);
  await expect(anamnese(page)).not.toContainText(/kcal/);
  // Conceito 08: as respostas por etapa ficam na folha "Ajustar".
  await page.getByRole("button", { name: "Ajustar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Ajustar respostas" });
  await expect(sheet).toBeVisible();
  for (const group of await sheet.locator("details.review-group").all())
    await group.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
  await expect(sheet).not.toContainText("Meta calórica informada");
  await expect(sheet).not.toContainText(/kcal/);
  const care = sheet
    .locator("details.review-group")
    .filter({ hasText: "Cuidados importantes" });
  await expect(
    care
      .locator("dl > div")
      .filter({ hasText: "Como prefere ver números?" })
      .locator("dd"),
  ).toHaveText("Ocultar calorias");
});

test("condições: perfil antigo escolhe na lista, 'Outra' pede os detalhes e 'Nenhuma' é exclusiva", async ({
  page,
}) => {
  const careStep = stepOf("Cuidados importantes");
  // Perfil antigo: só o texto livre, nenhuma condição marcada.
  await seedDraft(page, { ...base(), conditionTags: "", conditions: "Hipertensão" }, careStep);
  const tags = page.locator('[data-field="conditionTags"]');
  const details = page.locator('[data-field="conditions"]');
  const chip = (name: string) => tags.getByRole("button", { name, exact: true });
  await expect(tags.getByRole("group", { name: "Metas com cuidados" })).toBeVisible();
  await expect(tags.getByRole("group", { name: "Pedem avaliação individual" })).toBeVisible();
  await expect(tags.getByRole("button", { name: /^Outros/ })).toHaveCount(0);
  for (const name of ["Nenhuma", "Obesidade", "Doença renal", "Outra"])
    await expect(chip(name)).toHaveAttribute("aria-pressed", "false");
  // O texto antigo continua à vista, e a escolha na lista é pedida.
  const text = details.locator('input[name="conditions"]');
  await expect(text).toHaveValue("Hipertensão");
  await next(page);
  await expect(heading(page, "Cuidados importantes")).toBeVisible();
  await expect(tags).toContainText("Escolha uma opção. Se não tiver nenhuma condição, marque “Nenhuma”.");

  await chip("Hipertensão (pressão alta)").click();
  await chip("Outra").click();
  await expect(chip("Hipertensão (pressão alta)")).toHaveAttribute("aria-pressed", "true");
  await expect(details).toContainText("Obrigatório com “Outra”");
  await text.fill("");
  await next(page);
  await expect(details).toContainText("Conte qual é a outra condição.");
  // O valor gravado é aparado; o campo não pode engolir o espaço entre as palavras enquanto se digita.
  await text.pressSequentially("asma leve");
  await expect(text).toHaveValue("asma leve");
  await expect
    .poll(async () => (await saved(page)).draft?.conditionTags)
    .toBe("hipertensao,outra");

  // "Nenhuma" limpa as demais; outra escolha tira "Nenhuma".
  await chip("Nenhuma").click();
  // Com "Nenhuma", as demais recolhem atrás de "Mostrar outras opções" (como nos outros chips).
  await expect(chip("Hipertensão (pressão alta)")).toHaveCount(0);
  await tags.getByRole("button", { name: "Mostrar outras opções" }).click();
  await expect(chip("Hipertensão (pressão alta)")).toHaveAttribute("aria-pressed", "false");
  await expect(chip("Outra")).toHaveAttribute("aria-pressed", "false");
  await chip("Obesidade").click();
  await expect(chip("Nenhuma")).toHaveAttribute("aria-pressed", "false");
  await next(page);
  await expect(heading(page, "Seu ponto de partida")).toBeVisible();
  const draft = (await saved(page)).draft;
  expect(draft?.conditionTags).toBe("obesidade");
  expect(draft?.conditions).toBe("asma leve");
});

test("condições: detalhes opcionais aparecem ao marcar qualquer condição, sem exigir texto", async ({
  page,
}) => {
  const careStep = stepOf("Cuidados importantes");
  // Pessoa nova: "Nenhuma" marcada e nenhum texto salvo.
  await seedDraft(page, { ...base(), conditionTags: "nenhuma", conditions: "" }, careStep);
  const tags = page.locator('[data-field="conditionTags"]');
  const details = page.locator('[data-field="conditions"]');
  await expect(details).toHaveCount(0);
  await tags.getByRole("button", { name: "Mostrar outras opções" }).click();
  await tags.getByRole("button", { name: "Diabetes tipo 2", exact: true }).click();
  // O campo abre opcional (sem "Obrigatório com “Outra”") e aceita detalhes.
  await expect(details).toContainText("Opcional. Detalhes que ajudem a entender suas condições.");
  await expect(details).not.toContainText("Obrigatório");
  const text = details.locator('input[name="conditions"]');
  await expect(text).not.toHaveAttribute("required", "");
  await text.fill("uso metformina");
  await next(page);
  await expect(heading(page, "Seu ponto de partida")).toBeVisible();
  const draft = (await saved(page)).draft;
  expect(draft?.conditionTags).toBe("diabetes_tipo_2");
  expect(draft?.conditions).toBe("uso metformina");
});
