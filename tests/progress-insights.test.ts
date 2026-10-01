import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/dates";
import type { DayPoint } from "../src/lib/evolution";
import {
  MIN_DAYS_FOR_PERCENT,
  howWeCalculate,
  insightPrivacy,
  seriesInsight,
  type InsightPrivacy,
} from "../src/lib/progress-insights";
import { profileFixture } from "./fixtures";

/** Segunda-feira. */
const T = "2026-09-28";
const P: InsightPrivacy = { calm: false, hideCalories: false, fluidRestriction: false };
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr|melhor semana/i;
const CAUSAL =
  /porque|por causa|causou|faz bem|faz mal|melhora|piora|deveria|você deve|precisa|recomend|diagn|depress|insôni|distúrbio|transtorno|tratamento/i;

/** 7 pontos de 22 a 28 set (ou `values.length` dias terminando em T). */
function points(values: readonly number[], goal: number | null | ((i: number) => number | null)): DayPoint[] {
  return values.map((value, i) => ({
    date: shiftDate(T, i - (values.length - 1)),
    label: "",
    value,
    goal: typeof goal === "function" ? goal(i) : goal,
  }));
}
const texts = (insight: { chips: { text: string }[] }) => insight.chips.map((c) => c.text);

test("água: porcentagem da meta nos dias com registro e dias com registro", () => {
  const insight = seriesInsight("water", points([2000, 1500, 0, 1750, 2000, 2250, 1750], 2000), P);
  assert.deepEqual(insight.chips, [
    {
      key: "goal",
      text: "94% da meta",
      aria: "Média de 94% da meta de água nos dias com registro",
      tone: "water",
    },
    { key: "days", text: "6 de 7 dias", aria: "6 de 7 dias com registro", tone: "water" },
  ]);
  assert.equal(
    insight.aria,
    "Média de 94% da meta de água nos dias com registro; 6 de 7 dias com registro",
  );
});

test("água: sem porcentagem com restrição hídrica ou com menos de 2 dias com meta; acima de 100% fica sem teto", () => {
  const week = points([2000, 1500, 0, 1750, 2000, 2250, 1750], 2000);
  assert.deepEqual(texts(seriesInsight("water", week, { ...P, fluidRestriction: true })), ["6 de 7 dias"]);
  const oneGoal = points([2000, 1500, 0, 1750, 2000, 2250, 1750], (i) => (i === 6 ? 2000 : null));
  assert.ok(MIN_DAYS_FOR_PERCENT === 2);
  assert.deepEqual(texts(seriesInsight("water", oneGoal, P)), ["6 de 7 dias"]);
  assert.deepEqual(texts(seriesInsight("water", points(Array(7).fill(2500), 2000), P)), [
    "125% da meta",
    "7 de 7 dias",
  ]);
});

test("calorias: porcentagem só fora do perfil calmo; com hideCalories nenhum chip", () => {
  const week = points([1600, 0, 1800, 1700, 0, 2000, 1500], 1800);
  const insight = seriesInsight("calories", week, P);
  assert.deepEqual(texts(insight), ["96% da meta", "5 de 7 dias"]);
  assert.equal(insight.chips[0]!.aria, "Média de 96% da meta calórica nos dias com registro");
  assert.equal(insight.chips[0]!.tone, "food");
  assert.deepEqual(texts(seriesInsight("calories", week, { ...P, calm: true })), ["5 de 7 dias"]);
  assert.deepEqual(seriesInsight("calories", week, { ...P, hideCalories: true }), {
    chips: [],
    aria: "",
    goalText: null,
  });
});

test("meta do mini gráfico compacto: a mais recente, só onde a privacidade permite", () => {
  const calories = points([1600, 0, 1800, 1700, 0, 2000, 1500], (i) => (i < 6 ? 1800 : 1645));
  assert.equal(seriesInsight("calories", calories, P).goalText, "meta 1.645");
  assert.equal(seriesInsight("calories", calories, { ...P, calm: true }).goalText, null);
  assert.equal(seriesInsight("calories", calories, { ...P, hideCalories: true }).goalText, null);
  const water = points([2000, 1500, 0, 1750, 2000, 2250, 1750], 2500);
  assert.equal(seriesInsight("water", water, P).goalText, "meta 2,5 L");
  assert.equal(seriesInsight("water", water, { ...P, fluidRestriction: true }).goalText, null);
  // Perfil calmo ainda vê a meta de água (a regra de privacidade é só a restrição hídrica).
  assert.equal(seriesInsight("water", water, { ...P, calm: true }).goalText, "meta 2,5 L");
  assert.equal(seriesInsight("water", points([2000, 1500], null), P).goalText, null);
  assert.equal(seriesInsight("protein", points([90, 100], null), P, { min: 86, max: 115 }).goalText, null);
  assert.equal(seriesInsight("meals", points([3, 2], null), P).goalText, null);
});

test("proteína com faixa de referência, refeições só com dias, zeros sem chip e 28 dias", () => {
  const protein = points([90, 0, 100, 80, 95, 110, 105], null);
  const insight = seriesInsight("protein", protein, P, { min: 86, max: 115 });
  assert.deepEqual(texts(insight), ["Referência 86–115 g", "6 de 7 dias"]);
  assert.equal(insight.chips[0]!.aria, "Referência de 86 a 115 g por dia");
  assert.deepEqual(insight.chips.map((c) => c.key), ["reference", "days"]);
  assert.deepEqual(seriesInsight("protein", protein, { ...P, calm: true }, { min: 86, max: 115 }).chips, []);
  const meals = seriesInsight("meals", points([3, 2, 0, 4, 3, 3, 1], null), P);
  assert.deepEqual(meals.chips, [
    { key: "days", text: "6 de 7 dias", aria: "6 de 7 dias com registro", tone: "neutral" },
  ]);
  assert.deepEqual(seriesInsight("water", points(Array(7).fill(0), 2000), P), {
    chips: [],
    aria: "",
    goalText: "meta 2 L",
  });
  const month = points(Array.from({ length: 28 }, (_, i) => (i % 7 < 5 ? 2000 : 0)), 2000);
  assert.deepEqual(texts(seriesInsight("water", month, P)), ["100% da meta", "20 de 28 dias"]);
});

test("insightPrivacy: calmo para transtorno alimentar ou menor de 18; restrição hídrica e calorias ocultas", () => {
  const profile = profileFixture();
  assert.deepEqual(insightPrivacy(profile, T), P);
  assert.equal(insightPrivacy({ ...profile, eatingDisorder: "sim" }, T).calm, true);
  assert.equal(insightPrivacy({ ...profile, birthDate: "2010-09-28" }, T).calm, true);
  assert.deepEqual(insightPrivacy({ ...profile, fluidRestriction: "sim", hideCalories: true }, T), {
    calm: false,
    hideCalories: true,
    fluidRestriction: true,
  });
});

test("Como calculamos: seções por perfil, sem energia, sequência nem causa", () => {
  const keys = (privacy: InsightPrivacy) => howWeCalculate(privacy).map((s) => s.key);
  const title = (privacy: InsightPrivacy) => howWeCalculate(privacy).find((s) => s.key === "meta")?.title;
  assert.deepEqual(keys(P), ["medias", "meta", "dias", "tendencia", "ritmo", "proteina", "bem_estar", "semana"]);
  assert.equal(title(P), "Porcentagem da meta");
  const calm = { ...P, calm: true };
  assert.deepEqual(keys(calm), ["medias", "meta", "dias", "bem_estar", "semana"]);
  assert.equal(title(calm), "Porcentagem da meta de água");
  assert.deepEqual(keys({ ...calm, fluidRestriction: true }), ["medias", "dias", "bem_estar", "semana"]);
  const hidden = { ...P, hideCalories: true };
  assert.equal(title(hidden), "Porcentagem da meta de água");
  assert.ok(keys(hidden).includes("proteina"));
  assert.equal(title({ ...P, fluidRestriction: true }), "Porcentagem da meta");
  const dias = howWeCalculate(P).find((s) => s.key === "dias")!;
  assert.ok(dias.paragraphs.includes("Ausência de registro não significa ausência de consumo."));
  for (const privacy of [P, calm, hidden, { ...calm, hideCalories: true, fluidRestriction: true }]) {
    const text = JSON.stringify(howWeCalculate(privacy));
    assert.doesNotMatch(text, /kcal|calori/i);
    assert.doesNotMatch(text, NO_STREAK);
    assert.doesNotMatch(text, CAUSAL);
  }
});
