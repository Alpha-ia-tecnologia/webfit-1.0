import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceStatus,
  coachSummary,
  dateStrip,
  humanDate,
  liters,
  longDate,
  macroBars,
  mealTone,
  percentOf,
  encouragementFor,
  weekDays,
  weekStart,
  weekWater,
  type Totals,
} from "../src/lib/today";
import { dailyTargets, localDate, shiftDate } from "../src/lib/domain";
import type { AppState, DiaryEntry, Goals } from "../src/types";
import { stateFixture } from "./fixtures";

const water = (date: string, amountMl: number): DiaryEntry => ({
  id: `${date}-${amountMl}`,
  userId: "u",
  date,
  time: "10:00",
  createdAt: "x",
  updatedAt: "x",
  type: "agua",
  title: "Água",
  description: "",
  amountMl,
});

const goals: Goals = {
  basal: 1400,
  expenditure: 2000,
  calories: 1645,
  water: 2500,
  protein: 115,
  carbs: 175,
  fat: 45,
  source: "Mifflin-St Jeor",
  reason: null,
  strategy: "manutencao",
  note: null,
  careNotes: [],
};
const totals = (partial: Partial<Totals> = {}): Totals => ({
  calories: 0,
  water: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  meals: 0,
  ...partial,
});

test("faixa de datas termina hoje, marca o dia atual e nunca mostra o futuro", () => {
  const today = "2026-09-12";
  const days = dateStrip(today, today);
  assert.equal(days.length, 7);
  assert.equal(days.at(-1)?.date, today);
  assert.equal(days[0].date, shiftDate(today, -6));
  assert.equal(days.at(-1)?.weekday, "Hoje");
  assert.equal(days.at(-1)?.isToday, true);
  assert.notEqual(days.at(-1)?.aria, "Hoje");
  assert.ok(days.at(-1)?.aria.startsWith("Hoje, "));
  assert.ok(days.every((d) => d.date <= today));
  assert.ok(days.slice(0, -1).every((d) => d.weekday.length === 3));
});

test("faixa de datas acompanha um dia selecionado no passado sem perder a janela", () => {
  const today = "2026-09-12";
  const selected = "2026-08-01";
  const days = dateStrip(selected, today);
  assert.equal(days.length, 7);
  assert.ok(days.some((d) => d.date === selected));
  assert.equal(days.at(-1)?.date, shiftDate(selected, 3));
  assert.ok(days.every((d) => !d.isToday));
});

test("percentuais respeitam metas ausentes e o teto de 100%", () => {
  assert.equal(percentOf(1750, 2500), 70);
  assert.equal(percentOf(3000, 2500), 100);
  assert.equal(percentOf(500, null), null);
  const bars = macroBars(totals({ protein: 82, carbs: 95, fat: 28 }), goals);
  assert.deepEqual(
    bars.map((b) => [b.key, b.percent]),
    [
      ["protein", 71],
      ["carbs", 54],
      ["fat", 62],
    ],
  );
  assert.equal(
    macroBars(totals(), { ...goals, protein: null })[0].percent,
    null,
  );
});

test("resumo do agente usa só dados registrados e respeita calorias ocultas", () => {
  const empty = coachSummary({
    firstName: "Ana",
    totals: totals(),
    goals,
    habitsDone: 0,
    habitsTotal: 0,
    hideCalories: false,
    isToday: true,
  });
  assert.match(empty, /em branco, Ana/);
  const full = coachSummary({
    firstName: "Ana",
    totals: totals({ calories: 1210, water: 1750, meals: 2 }),
    goals,
    habitsDone: 1,
    habitsTotal: 3,
    hideCalories: false,
    isToday: true,
  });
  assert.match(full, /2 refeições/);
  assert.match(full, /1\.750 ml de água \(70% da meta\)/);
  assert.match(full, /1 de 3 combinados prontos/);
  assert.match(full, /Restam 435 kcal/);
  const hidden = coachSummary({
    firstName: "Ana",
    totals: totals({ calories: 1210, water: 1750, meals: 2 }),
    goals,
    habitsDone: 0,
    habitsTotal: 0,
    hideCalories: true,
    isToday: false,
  });
  assert.doesNotMatch(hidden, /kcal/);
  assert.match(hidden, /^Neste dia, Ana/);
  const reached = coachSummary({
    firstName: "Ana",
    totals: totals({ calories: 1700, meals: 3 }),
    goals,
    habitsDone: 0,
    habitsTotal: 0,
    hideCalories: false,
    isToday: true,
  });
  assert.match(reached, /atingiu a meta calórica/);
});

test("semana de água começa na segunda, soma por dia e marca hoje e o futuro", () => {
  const today = "2026-09-12"; // sábado
  const week = weekWater(
    [
      water("2026-09-06", 500),
      water("2026-09-07", 750),
      water("2026-09-12", 1000),
      water("2026-09-12", 750),
    ],
    today,
  );
  assert.equal(week.length, 7);
  assert.deepEqual(
    week.map((d) => d.label),
    ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
  );
  assert.equal(week[0].date, "2026-09-07");
  assert.equal(week[0].ml, 750);
  assert.equal(week[5].isToday, true);
  assert.equal(week[5].ml, 1750);
  assert.equal(week[6].date, "2026-09-13");
  assert.equal(week[6].isFuture, true);
  assert.equal(week[6].ml, 0);
  assert.equal(liters(1750), "1,8");
  assert.equal(liters(0), "0,0");
});

test("tom da refeição vem da categoria e, sem ela, do horário", () => {
  assert.equal(
    mealTone({ categoryTag: "Café da manhã", time: "12:00" }),
    "amber",
  );
  assert.equal(mealTone({ categoryTag: "Almoço", time: "08:00" }), "emerald");
  assert.equal(mealTone({ categoryTag: "Lanche", time: "08:00" }), "sky");
  assert.equal(mealTone({ categoryTag: "Jantar", time: "08:00" }), "teal");
  assert.equal(mealTone({ time: "07:30" }), "amber");
  assert.equal(mealTone({ time: "12:10" }), "emerald");
  assert.equal(mealTone({ time: "16:00" }), "sky");
  assert.equal(mealTone({ time: "20:10" }), "teal");
});

test("status do balanço e data legível do cabeçalho", () => {
  assert.deepEqual(balanceStatus(1200, null), {
    label: "Sem meta",
    tone: "neutral",
  });
  // Acima do planejado é informativo: tom neutro, nunca o vermelho de erro ou exclusão.
  assert.deepEqual(balanceStatus(1900, 1800), {
    label: "Acima do planejado",
    tone: "neutral",
  });
  assert.equal(balanceStatus(1500, 1800).label, "No alvo");
  assert.equal(balanceStatus(600, 1800).label, "Em andamento");
  assert.equal(humanDate("2026-09-12", "2026-09-12"), "Hoje, 12 de setembro");
  assert.equal(humanDate("2026-09-11", "2026-09-12"), "Ontem, 11 de setembro");
  assert.equal(
    humanDate("2026-09-07", "2026-09-12"),
    "Segunda-feira, 7 de setembro",
  );
});

// ---------- Incentivo após registro ----------
const TODAY = localDate();
const diaryEntry = (over: Partial<DiaryEntry>): DiaryEntry =>
  ({
    id: over.id ?? "novo",
    userId: "u1",
    date: TODAY,
    time: "12:00",
    createdAt: `${TODAY}T12:00:00.000Z`,
    updatedAt: `${TODAY}T12:00:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    description: "",
    ...over,
  }) as DiaryEntry;
const withProfile = (state: AppState, patch: Record<string, unknown>): AppState => ({
  ...state,
  profile: { ...state.profile!, ...patch },
  goalHistory: state.goalHistory.map((h) => ({ ...h, profile: { ...h.profile, ...patch } })),
});

test("encouragementFor: água informa quanto falta para a meta", () => {
  const before = withProfile(stateFixture(), { manualWater: 2000 });
  const after = { ...before, diary: [...before.diary, diaryEntry({ id: "agua-1", type: "agua", title: "Água", amountMl: 500 })] };
  const cheer = encouragementFor(before, after)!;
  assert.equal(cheer.kind, "water");
  assert.match(cheer.text, /Faltam 1\.500 ml/);
  assert.equal(cheer.percent, 25);
  const full = { ...before, diary: [...before.diary, diaryEntry({ id: "agua-2", type: "agua", title: "Água", amountMl: 2000 })] };
  assert.match(encouragementFor(before, full)!.text, /Meta de água atingida/);
});

test("encouragementFor: refeição mostra a distância até a meta calórica do dia", () => {
  const before = withProfile(stateFixture(), { hideCalories: false });
  const target = dailyTargets(before, TODAY).calories!;
  const after = { ...before, diary: [...before.diary, diaryEntry({ id: "ref-1", calories: 600 })] };
  const cheer = encouragementFor(before, after)!;
  assert.equal(cheer.kind, "meal");
  assert.match(cheer.text, new RegExp(`Faltam ${(target - 600).toLocaleString("pt-BR")} kcal`));
  assert.equal(cheer.percent, percentOf(600, target));
  const over = { ...before, diary: [...before.diary, diaryEntry({ id: "ref-2", calories: target + 300 })] };
  const overText = encouragementFor(before, over)!.text;
  assert.match(overText, /300 kcal acima do planejado/);
  // Sem julgamento e sem prometer um ajuste automático que o app não faz.
  assert.doesNotMatch(overText, /passou|ajusta/);
});

test("encouragementFor: com calorias ocultas não expõe números de kcal", () => {
  const before = withProfile(stateFixture(), { hideCalories: true });
  const after = { ...before, diary: [...before.diary, diaryEntry({ id: "ref-3", calories: 600 })] };
  const cheer = encouragementFor(before, after)!;
  assert.doesNotMatch(cheer.text, /kcal/);
  assert.equal(cheer.percent, null);
});

test("encouragementFor: combinado concluído e ausência de novidade", () => {
  const base = stateFixture();
  const habit = { id: "h1", title: "Caminhar", timeOfDay: "08:00", createdDate: TODAY, completedDates: [] as string[] };
  const before = { ...base, habits: [habit] } as AppState;
  const after = { ...before, habits: [{ ...habit, completedDates: [TODAY] }] } as AppState;
  const cheer = encouragementFor(before, after)!;
  assert.equal(cheer.kind, "habit");
  assert.match(cheer.text, /combinado do dia está pronto/);
  assert.equal(encouragementFor(before, before), null);
  const wellBeing = { ...before, diary: [...before.diary, diaryEntry({ id: "bem-1", type: "bem_estar", title: "Humor" })] };
  assert.equal(encouragementFor(before, wellBeing), null);
});

// ---------- Semana de segunda a domingo e data longa (fidelidade visual) ----------
test("weekDays: segunda a domingo da semana que contém a data (domingo fecha a semana)", () => {
  // 24/09/2026 é quinta-feira.
  assert.equal(weekStart("2026-09-24"), "2026-09-21");
  assert.deepEqual(weekDays("2026-09-24"), [
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
    "2026-09-27",
  ]);
  assert.equal(weekStart("2026-09-27"), "2026-09-21");
  assert.equal(weekStart("2026-09-21"), "2026-09-21");
});

test("dateStrip range week: a semana do Hoje com os dias futuros marcados e sem cobrança", () => {
  const today = "2026-09-24";
  const days = dateStrip(today, today, undefined, "week");
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-09-21");
  assert.equal(days.at(-1)?.date, "2026-09-27");
  assert.deepEqual(days.map((d) => d.isFuture), [false, false, false, false, true, true, true]);
  assert.equal(days[3].weekday, "Hoje");
  assert.equal(days[4].aria, "sexta-feira, 25 de setembro, ainda não chegou");
  // A faixa "trailing" nunca tem futuro.
  assert.ok(dateStrip(today, today).every((d) => !d.isFuture));
});

test("longDate: dia da semana sem \"-feira\", maiúscula e sem \"Hoje,\"", () => {
  assert.equal(longDate("2026-09-24"), "Quinta, 24 de setembro");
  assert.equal(longDate("2026-09-26"), "Sábado, 26 de setembro");
  assert.equal(longDate("2026-09-27"), "Domingo, 27 de setembro");
});
