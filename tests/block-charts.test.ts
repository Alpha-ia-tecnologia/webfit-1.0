import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabels } from "../src/components/evolucao/chart-geometry";
import {
  BAR_COPY,
  blockChart,
  formatBarAverage,
  weekRange,
  weekSummary,
} from "../src/lib/block-charts";
import { dailyTargets, shiftDate } from "../src/lib/domain";
import type { AppState, DiaryEntry, Measurement } from "../src/types";
import { stateFixture } from "./fixtures";

const TODAY = "2026-09-24";

function baseState(): AppState {
  const state = stateFixture();
  // Metas vigentes desde antes da janela: toda barra tem a meta de água do perfil (2 L).
  return {
    ...state,
    measurements: [],
    goalHistory: state.goalHistory.map((h) => ({ ...h, date: shiftDate(TODAY, -60) })),
  };
}
const entry = (date: string, over: Partial<DiaryEntry>): DiaryEntry => ({
  id: `${date}-${over.type}-${over.amountMl ?? over.title}`,
  userId: "u",
  date,
  time: "10:00",
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  type: "agua",
  title: "Água",
  description: "",
  ...over,
});
const water = (date: string, amountMl: number) => entry(date, { type: "agua", amountMl });
const meal = (date: string, title: string) =>
  entry(date, { type: "refeicao", title, categoryTag: title, amountMl: undefined });
const weighing = (date: string, weight: number): Measurement => ({
  id: date,
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança",
});

test("água: 7 dias até hoje, valores do diário e meta do dia", () => {
  const state = {
    ...baseState(),
    diary: [water(TODAY, 500), water(TODAY, 250), water(shiftDate(TODAY, -2), 1500), water(shiftDate(TODAY, -9), 900)],
  };
  const chart = blockChart(state, "agua_7d", TODAY);
  assert.ok(chart && chart.kind === "bars");
  assert.equal(chart.metric, "agua_7d");
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(TODAY, i - 6));
  assert.deepEqual(chart.points.map((p) => p.date), dates);
  assert.deepEqual(chart.points.map((p) => p.label), dayLabels(dates));
  assert.deepEqual(chart.points.map((p) => p.value), [0, 0, 0, 0, 1500, 0, 750]);
  assert.ok(chart.points.every((p) => p.goal === 2000));
  assert.equal(chart.goalText, "meta 2 L");
  assert.equal(BAR_COPY.agua_7d.unitLabel, "L");
  assert.equal(formatBarAverage("agua_7d", 1125), "1,1");
});

test("água com restrição hídrica: sem meta nas barras nem na legenda", () => {
  const state = baseState();
  const restricted = { ...state, profile: { ...state.profile!, fluidRestriction: "sim" as const } };
  const chart = blockChart(restricted, "agua_7d", TODAY);
  assert.ok(chart && chart.kind === "bars");
  assert.ok(chart.points.every((p) => p.goal === null));
  assert.equal(chart.goalText, null);
});

test("refeições: contagem por dia, sem meta", () => {
  const state = {
    ...baseState(),
    diary: [meal(TODAY, "Almoço"), meal(TODAY, "Jantar"), meal(shiftDate(TODAY, -1), "Almoço"), water(TODAY, 300)],
  };
  const chart = blockChart(state, "refeicoes_7d", TODAY);
  assert.ok(chart && chart.kind === "bars");
  assert.deepEqual(chart.points.map((p) => p.value), [0, 0, 0, 0, 0, 1, 2]);
  assert.ok(chart.points.every((p) => p.goal === null));
  assert.equal(chart.goalText, null);
  assert.equal(BAR_COPY.refeicoes_7d.emptyText, "Sem refeições registradas.");
  assert.equal(formatBarAverage("refeicoes_7d", 2), "2");
});

test("peso: tendência sobre todas as pesagens, janela de 8 semanas", () => {
  const recent = [weighing(shiftDate(TODAY, -20), 74), weighing(TODAY, 72)];
  const withOld = { ...baseState(), measurements: [weighing(shiftDate(TODAY, -90), 80), ...recent] };
  const chart = blockChart(withOld, "peso_8s", TODAY);
  assert.ok(chart && chart.kind === "weight");
  assert.equal(chart.start, shiftDate(TODAY, -55));
  assert.equal(chart.end, TODAY);
  assert.equal(chart.hasData, true);
  assert.equal(chart.points.length, 3);
  const onlyRecent = blockChart({ ...baseState(), measurements: recent }, "peso_8s", TODAY);
  assert.ok(onlyRecent && onlyRecent.kind === "weight");
  const firstInWindow = (points: { date: string; trend: number }[]) =>
    points.find((p) => p.date >= chart.start)!.trend;
  assert.notEqual(firstInWindow(chart.points), firstInWindow(onlyRecent.points));
  const oldOnly = blockChart(
    { ...baseState(), measurements: [weighing(shiftDate(TODAY, -90), 80)] },
    "peso_8s",
    TODAY,
  );
  assert.ok(oldOnly && oldOnly.kind === "weight" && !oldOnly.hasData);
});

test("peso: perfil sensível não recebe gráfico e sem pesagens não há dados", () => {
  const state = baseState();
  const sensitive = { ...state, profile: { ...state.profile!, eatingDisorder: "sim" as const } };
  assert.equal(blockChart(sensitive, "peso_8s", TODAY), null);
  const empty = blockChart(state, "peso_8s", TODAY);
  assert.ok(empty && empty.kind === "weight");
  assert.equal(empty.hasData, false);
  assert.deepEqual(empty.points, []);
});

test("peso: só com os números do corpo completos (nem ocultos, nem menor de idade)", () => {
  const state = { ...baseState(), measurements: [weighing(TODAY, 72)] };
  const hidden = { ...state, profile: { ...state.profile!, hideBodyNumbers: true } };
  assert.equal(blockChart(hidden, "peso_8s", TODAY), null);
  const minor = { ...state, profile: { ...state.profile!, birthDate: "2012-01-01" } };
  assert.equal(blockChart(minor, "peso_8s", TODAY), null);
  assert.equal(blockChart(state, "peso_8s", TODAY)?.kind, "weight");
  // As barras não dependem dos números do corpo.
  assert.equal(blockChart(hidden, "agua_7d", TODAY)?.kind, "bars");
});

// ---------- Resumo da semana (semana_7d) ----------

const MESSAGE_DAY = "2026-09-23";
const mealWith = (date: string, calories: number, protein: number) =>
  entry(date, {
    type: "refeicao",
    title: `Almoço ${calories}`,
    categoryTag: "Almoço",
    amountMl: undefined,
    calories,
    macros: { protein, carbs: 0, fat: 0 },
  });
const mood = (date: string, sleepHours: number) =>
  entry(date, { type: "bem_estar", title: `Bem-estar ${sleepHours}`, amountMl: undefined, rating: 4, sleepHours });

function weekState(): AppState {
  const state = baseState();
  const days = [0, 1, 2, 3, 4, 6].map((i) => shiftDate(MESSAGE_DAY, -i));
  return {
    ...state,
    diary: [
      ...days.map((date) => mealWith(date, 1728, 95)),
      ...days.map((date) => water(date, 1900)),
      mood(MESSAGE_DAY, 7),
      mood(shiftDate(MESSAGE_DAY, -2), 7),
      // Fora da janela (hoje e 8 dias antes): não entram.
      mealWith(TODAY, 3000, 10),
      mood(shiftDate(MESSAGE_DAY, -8), 3),
    ],
  };
}

test("semana: 7 dias que terminam na data da mensagem, com as 4 linhas e o selo neutro", () => {
  const state = weekState();
  const goals = dailyTargets(state, MESSAGE_DAY);
  const summary = weekSummary(state, MESSAGE_DAY);
  assert.equal(summary.start, "2026-09-17");
  assert.equal(summary.end, MESSAGE_DAY);
  assert.equal(summary.range, "17 a 23 de setembro");
  assert.deepEqual(
    summary.rows.map((r) => r.key),
    ["registros", "proteina", "agua", "sono"],
  );
  const [registros, proteina, agua, sono] = summary.rows;
  assert.equal(`${registros!.value}${registros!.rest}`, "6/7 dias");
  assert.deepEqual(registros!.meter, { value: 6, total: 7, mode: "segments" });
  assert.equal(proteina!.value, "95");
  assert.equal(agua!.value, "1,9");
  assert.equal(agua!.rest, "/2 L por dia");
  assert.equal(`${sono!.value}${sono!.rest}`, "7 h por noite");
  // A barra do sono é contra a janela da anamnese (23:00 → 07:00), nunca "meta".
  assert.deepEqual(sono!.meter, { value: 7, total: 8, mode: "bar" });
  assert.doesNotMatch(`${sono!.rest} ${sono!.text}`, /meta/);
  assert.ok(goals.calories);
  const pct = Math.round(((1728 - goals.calories!) / goals.calories!) * 100);
  assert.equal(summary.kcalBadge, `kcal ${Math.abs(pct)}% ${pct < 0 ? "abaixo" : "acima"} da meta`);
});

test("semana: perfil calmo sem proteína nem selo; calorias ocultas sem selo; restrição hídrica sem meta", () => {
  const state = weekState();
  const calm = { ...state, profile: { ...state.profile!, eatingDisorder: "sim" as const } };
  const calmSummary = weekSummary(calm, MESSAGE_DAY);
  assert.deepEqual(
    calmSummary.rows.map((r) => r.key),
    ["registros", "agua", "sono"],
  );
  assert.equal(calmSummary.kcalBadge, null);
  const minor = { ...state, profile: { ...state.profile!, birthDate: "2012-01-01" } };
  assert.equal(weekSummary(minor, MESSAGE_DAY).kcalBadge, null);
  const hidden = { ...state, profile: { ...state.profile!, hideCalories: true } };
  assert.equal(weekSummary(hidden, MESSAGE_DAY).kcalBadge, null);
  const fluid = { ...state, profile: { ...state.profile!, fluidRestriction: "sim" as const } };
  const agua = weekSummary(fluid, MESSAGE_DAY).rows.find((r) => r.key === "agua");
  assert.equal(agua?.rest, " L por dia");
  assert.equal(agua?.meter, null);
});

test("semana: linhas sem dados somem; poucos dias com refeição, sem selo; kcal na meta", () => {
  const empty = weekSummary({ ...baseState(), diary: [] }, MESSAGE_DAY);
  assert.deepEqual(
    empty.rows.map((r) => r.key),
    ["registros"],
  );
  assert.equal(`${empty.rows[0]!.value}${empty.rows[0]!.rest}`, "0/7 dias");
  assert.equal(empty.kcalBadge, null);
  const state = baseState();
  const goal = dailyTargets(state, MESSAGE_DAY).calories!;
  const two = [0, 1].map((i) => mealWith(shiftDate(MESSAGE_DAY, -i), goal, 80));
  assert.equal(weekSummary({ ...state, diary: two }, MESSAGE_DAY).kcalBadge, null);
  const three = [0, 1, 2].map((i) => mealWith(shiftDate(MESSAGE_DAY, -i), goal + 10, 80));
  assert.equal(weekSummary({ ...state, diary: three }, MESSAGE_DAY).kcalBadge, "kcal na meta");
  assert.equal(weekRange("2026-08-28", "2026-09-03"), "28 de agosto a 3 de setembro");
  assert.equal(blockChart(state, "semana_7d", TODAY), null);
});
