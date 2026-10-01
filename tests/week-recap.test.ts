import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECAP_DISMISS_KEY,
  RECAP_MAX_HABITS,
  STORY_SLIDE_MS,
  isRecapDay,
  lastCompleteWeek,
  shouldShowRecapCard,
  slideTitles,
  weekRecap,
  type WeekRecap,
} from "../src/lib/week-recap";
import { SHARE_TILE_KEYS, weekShare } from "../src/lib/week-share";
import type { AppState, DiaryEntry, HabitItem, Measurement, Profile } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";

/** Segunda-feira: a semana resumida é 21–27 set. */
const T = "2026-09-28";
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr|melhor semana/i;
const SHARE_UNSAFE = /kcal|calori|\bkg\b|peso|pesagem|dose|\bmg\b|medica|humor|sono/i;

let seq = 0;
function entry(date: string, type: DiaryEntry["type"], extra: Partial<DiaryEntry> = {}, time = "12:00"): DiaryEntry {
  seq += 1;
  return {
    id: `d-${seq}`,
    userId: "user",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type,
    title: type,
    description: "",
    ...extra,
  };
}
const meal = (date: string, time = "12:00") => entry(date, "refeicao", { calories: 520 }, time);
const water = (date: string, amountMl: number) => entry(date, "agua", { amountMl });
const feeling = (date: string, rating: number, sleepHours?: number) =>
  entry(date, "bem_estar", { rating, ...(sleepHours === undefined ? {} : { sleepHours }) });
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

function diary(): DiaryEntry[] {
  return [
    meal("2026-09-21"),
    meal("2026-09-22", "12:00"),
    meal("2026-09-22", "19:00"),
    meal("2026-09-23"),
    meal("2026-09-25"),
    meal("2026-09-26"),
    water("2026-09-21", 2000),
    water("2026-09-22", 1500),
    water("2026-09-23", 2500),
    water("2026-09-24", 1000),
    water("2026-09-25", 2000),
    water("2026-09-26", 1800),
    feeling("2026-09-22", 4, 7),
    feeling("2026-09-24", 3, 6.5),
    feeling("2026-09-26", 5),
    // Fora da semana resumida.
    water("2026-09-28", 500),
    meal("2026-09-20"),
  ];
}

type ProfileChange = Partial<Profile> & { hideBodyNumbers?: boolean };
/** Fixture do spec (§3.5): meta de água 2000 desde 1º set, 3 pesagens, 2 combinados. */
function recapState(change: ProfileChange = {}, patch: Partial<AppState> = {}): AppState {
  const profile = { ...profileFixture(), ...change } as Profile;
  return {
    ...stateFixture(),
    profile,
    goalHistory: [{ date: "2026-09-01", profile }],
    measurements: [
      weighIn("m1", "2026-09-07", 74),
      weighIn("m2", "2026-09-14", 73.4),
      weighIn("m3", "2026-09-24", 72.6),
    ],
    diary: diary(),
    habits: [
      habit("h1", "08:00", "2026-09-01", ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25"]),
      // 23 set é antes da criação: não conta.
      habit("h2", "09:00", "2026-09-24", ["2026-09-23", "2026-09-24", "2026-09-26"]),
    ],
    ...patch,
  };
}
const recapOf = (change: ProfileChange = {}, patch: Partial<AppState> = {}) =>
  weekRecap(recapState(change, patch), T)!;
const keys = (items: readonly { key: string }[]) => items.map((i) => i.key);
const winTexts = (recap: WeekRecap) => recap.wins.map((w) => w.text);
const CALM = { eatingDisorder: "sim" } as const;
const MINOR = { birthDate: "2010-09-28" } as const;

test("semana completa anterior: segunda a domingo, rótulos curto e acessível", () => {
  const week = lastCompleteWeek(T);
  assert.deepEqual(
    { start: week.start, end: week.end, label: week.label, aria: week.aria },
    { start: "2026-09-21", end: "2026-09-27", label: "21 a 27 set", aria: "21 a 27 de setembro" },
  );
  assert.equal(week.dates.length, 7);
  assert.equal(week.dates[3], "2026-09-24");
  assert.deepEqual(lastCompleteWeek("2026-09-29"), week);
  assert.equal(lastCompleteWeek("2026-09-27").label, "14 a 20 set");
  const turn = lastCompleteWeek("2026-10-05");
  assert.equal(turn.label, "28 set a 4 out");
  assert.equal(turn.aria, "28 de setembro a 4 de outubro");
  assert.equal(isRecapDay(T), true);
  assert.deepEqual(
    ["2026-09-27", "2026-09-29", "2026-09-30", "2026-10-03"].map(isRecapDay),
    [false, false, false, false],
  );
  assert.equal(RECAP_DISMISS_KEY, "webfit-week-recap-dismissed");
  assert.equal(STORY_SLIDE_MS, 6000);
});

test("resumo: 6 dias com registro e os 4 primeiros blocos (registros, peso, água, bem-estar)", () => {
  const recap = recapOf();
  assert.equal(recap.recordDays, 6);
  assert.deepEqual(recap.tiles, [
    {
      key: "registros",
      label: "Dias com registro",
      value: "6 de 7",
      detail: null,
      aria: "6 de 7 dias com registro",
      tone: "habit",
      face: null,
    },
    {
      key: "peso",
      label: "Peso de tendência",
      value: "73,0 kg",
      detail: "−0,7 kg na semana",
      aria: "Peso de tendência 73,0 kg, −0,7 kg na semana",
      tone: "body",
      face: null,
    },
    {
      key: "agua",
      label: "Água",
      value: "1,8 L/dia",
      detail: "média em 6 dias",
      aria: "Água: média de 1,8 L por dia em 6 dias",
      tone: "water",
      face: null,
    },
    {
      key: "bem_estar",
      label: "Bem-estar",
      value: "Bem",
      detail: "Sono 6,8 h",
      aria: "Bem-estar: humor médio Bem em 3 dias; sono médio 6,8 h",
      tone: "mind",
      face: 4,
    },
  ]);
  assert.deepEqual(keys(recap.candidates), ["registros", "peso", "agua", "bem_estar", "combinados", "refeicoes"]);
  const [, , , , habits, meals] = recap.candidates;
  assert.deepEqual([habits!.value, habits!.aria], ["6 de 11", "6 de 11 combinados cumpridos"]);
  assert.deepEqual([meals!.value, meals!.detail, meals!.aria], ["6", "em 5 dias", "6 refeições registradas em 5 dias"]);
});

test("conquistas gentis: até 4, só comportamentos", () => {
  const recap = recapOf();
  assert.deepEqual(winTexts(recap), [
    "Refeições registradas em 5 dias",
    "Água registrada em 6 dias",
    "Meta de água alcançada em 3 dias",
    "6 combinados cumpridos",
  ]);
  assert.equal(recap.slides.wins.title, "Conquistas gentis");
});

test("perfil calmo (transtorno alimentar ou menor de 18): sem peso, meta ou pesagem", () => {
  for (const change of [CALM, MINOR]) {
    const recap = recapOf(change);
    assert.equal(recap.privacy.calm, true);
    assert.deepEqual(keys(recap.tiles), ["registros", "agua", "bem_estar", "combinados"]);
    assert.deepEqual(winTexts(recap), [
      "Refeições registradas em 5 dias",
      "Água registrada em 6 dias",
      "6 combinados cumpridos",
      "Você registrou como se sentiu em 3 dias",
    ]);
    assert.equal(recap.slides.wins.title, "Sua semana em registros");
    assert.equal(recap.slides.habits.weight, null);
    assert.equal(recap.slides.habits.title, "Combinados");
    assert.doesNotMatch(JSON.stringify(recap), /kg\b|peso|pesagem|meta/i);
    assert.deepEqual(slideTitles(recap).slice(3), ["Combinados", "Sua semana em registros"]);
  }
});

test("restrição hídrica sem meta de água; hideBodyNumbers sem peso nem pesagens", () => {
  const fluid = recapOf({ fluidRestriction: "sim" });
  assert.ok(!keys(fluid.wins).includes("meta_agua"));
  assert.equal(winTexts(fluid).at(-1), "Você registrou como se sentiu em 3 dias");
  assert.ok(fluid.slides.routine.water!.points.every((p) => p.goal === null));
  const hidden = recapOf({ hideBodyNumbers: true });
  assert.equal(hidden.privacy.hideBodyNumbers, true);
  assert.ok(!keys(hidden.candidates).includes("peso"));
  assert.ok(!keys(hidden.wins).includes("pesagens"));
  assert.equal(hidden.slides.habits.weight, null);
  assert.equal(hidden.slides.habits.title, "Combinados");
  assert.equal(hidden.slides.wins.title, "Conquistas gentis");
});

test("calorias ocultas: mesmos blocos; nenhum resumo fala de calorias ou dias seguidos", () => {
  assert.deepEqual(recapOf({ hideCalories: true }).tiles, recapOf().tiles);
  const variants: ProfileChange[] = [{}, { hideCalories: true }, CALM, MINOR, { fluidRestriction: "sim" }, { hideBodyNumbers: true }];
  for (const change of variants) {
    const text = JSON.stringify(recapOf(change));
    assert.doesNotMatch(text, /kcal|calori/i);
    assert.doesNotMatch(text, NO_STREAK);
  }
});

test("partes dos stories: capa, rotina, combinados e peso, títulos", () => {
  const recap = recapOf();
  const { cover, routine, wellbeing, habits } = recap.slides;
  assert.equal(cover.range, "21 a 27 set");
  assert.equal(cover.lead, "6 de 7");
  assert.equal(cover.days.length, 7);
  assert.deepEqual(cover.weekdays, ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
  assert.equal(routine.water!.average, "1,8 L");
  assert.equal(routine.water!.caption, "média por dia em 6 dias");
  assert.equal(routine.water!.points.length, 7);
  assert.ok(routine.water!.aria.startsWith("Água por dia de 21 a 27 de setembro: Seg 2.000 ml, Ter 1.500 ml"));
  assert.equal(routine.meals, "6 refeições registradas em 5 dias");
  assert.equal(routine.empty, null);
  assert.equal(wellbeing.trend.days.length, 7);
  assert.equal(wellbeing.trend.aria, "Bem-estar e sono de 21 a 27 de setembro");
  assert.equal(wellbeing.trend.cross.progress, "2 de 4 dias");
  assert.equal(wellbeing.empty, null);
  assert.equal(habits.summary, "6 de 11 combinados cumpridos");
  assert.deepEqual(
    habits.items.map(({ title, text }) => ({ title, text })),
    [
      { title: "Combinado h1", text: "4 de 7 dias" },
      { title: "Combinado h2", text: "2 de 4 dias" },
    ],
  );
  assert.equal(habits.more, 0);
  assert.deepEqual(
    { value: habits.weight!.value, delta: habits.weight!.delta },
    { value: "73,0 kg", delta: "−0,7 kg na semana" },
  );
  assert.equal(habits.title, "Combinados e peso");
  assert.deepEqual(slideTitles(recap), [
    "Sua semana",
    "Água e refeições",
    "Bem-estar e sono",
    "Combinados e peso",
    "Conquistas gentis",
  ]);
});

test("partes sem dados: textos de vazio, combinados além do limite e peso sem pesagem anterior", () => {
  const habits = Array.from({ length: 7 }, (_, i) =>
    habit(`x${i}`, `0${i + 1}:00`, "2026-09-01", i === 0 ? ["2026-09-21"] : []),
  );
  const recap = recapOf(
    {},
    {
      diary: [feeling("2026-09-22", 4, 7), feeling("2026-09-23", 2)],
      habits,
      measurements: [weighIn("m3", "2026-09-24", 72.6)],
    },
  );
  assert.equal(recap.slides.routine.water, null);
  assert.equal(recap.slides.routine.meals, null);
  assert.equal(recap.slides.routine.empty, "Sem água nem refeições registradas nesta semana.");
  assert.equal(recap.slides.habits.items.length, RECAP_MAX_HABITS);
  assert.equal(recap.slides.habits.more, 2);
  assert.deepEqual(recap.slides.habits.weight, {
    value: "72,6 kg",
    delta: null,
    aria: "Peso de tendência 72,6 kg",
  });
  assert.deepEqual(winTexts(recap), ["1 combinado cumprido", "Você registrou como se sentiu em 2 dias", "1 pesagem registrada"]);
  const quiet = recapOf({}, { diary: [water("2026-09-21", 500), water("2026-09-22", 500)], habits: [] });
  assert.equal(quiet.slides.wellbeing.empty, "Sem registros de bem-estar nesta semana.");
  assert.equal(quiet.slides.habits.empty, "Nenhum combinado ativo nesta semana.");
  assert.equal(quiet.slides.habits.summary, null);
  assert.deepEqual(winTexts(quiet), ["1 pesagem registrada"]);
  const calmQuiet = recapOf(CALM, { diary: [water("2026-09-21", 500), water("2026-09-22", 500)], habits: [] });
  assert.deepEqual(winTexts(calmQuiet), ["Registros em 2 dias da semana"]);
});

test("mínimo de 2 dias com registro; sem perfil não há resumo", () => {
  const only22 = diary().filter((e) => e.date === "2026-09-22");
  assert.equal(weekRecap(recapState({}, { diary: only22, habits: [] }), T), null);
  const both = diary().filter((e) => e.date === "2026-09-22" || e.date === "2026-09-24");
  assert.notEqual(weekRecap(recapState({}, { diary: both, habits: [] }), T), null);
  assert.equal(weekRecap({ ...recapState(), profile: null }, T), null);
  const oneWater = diary().filter((e) => e.type !== "agua" || e.date === "2026-09-21");
  const recap = recapOf({}, { diary: oneWater });
  assert.ok(!keys(recap.wins).includes("agua"));
  assert.ok(keys(recap.tiles).includes("agua"));
});

test("cartão do Hoje só na segunda e enquanto a semana não foi dispensada", () => {
  const recap = recapOf();
  assert.equal(shouldShowRecapCard(recap, T, null), true);
  assert.equal(shouldShowRecapCard(recap, T, "2026-09-14"), true);
  assert.equal(shouldShowRecapCard(recap, T, "2026-09-21"), false);
  assert.equal(shouldShowRecapCard(recap, "2026-09-29", null), false);
  assert.equal(shouldShowRecapCard(null, T, null), false);
});

test("compartilhar: só blocos e conquistas seguros, texto exato", () => {
  const share = weekShare(recapOf());
  assert.deepEqual(SHARE_TILE_KEYS, ["registros", "agua", "combinados", "refeicoes"]);
  assert.equal(share.fileName, "webfit-semana-2026-09-21.png");
  assert.equal(share.title, "Minha semana no WebFit");
  assert.equal(share.range, "21 a 27 set");
  assert.deepEqual(share.tiles.map((t) => t.value), ["6 de 7", "1,8 L/dia", "6 de 11", "6"]);
  assert.equal(
    share.text,
    [
      "Minha semana no WebFit (21 a 27 set)",
      "• 6 de 7 dias com registro",
      "• Água: média de 1,8 L por dia em 6 dias",
      "• 6 de 11 combinados cumpridos",
      "• 6 refeições registradas em 5 dias",
      "Conquistas gentis:",
      "• Refeições registradas em 5 dias",
      "• Água registrada em 6 dias",
      "• Meta de água alcançada em 3 dias",
      "• 6 combinados cumpridos",
      "Gerado no meu aparelho pelo WebFit.",
    ].join("\n"),
  );
  assert.equal(
    share.alt,
    "Minha semana no WebFit, 21 a 27 set: 6 de 7 dias com registro; Água: média de 1,8 L por dia em 6 dias; " +
      "6 de 11 combinados cumpridos; 6 refeições registradas em 5 dias. Conquistas gentis: " +
      "Refeições registradas em 5 dias; Água registrada em 6 dias; Meta de água alcançada em 3 dias; 6 combinados cumpridos.",
  );
  for (const change of [{}, CALM, { hideCalories: true }, MINOR]) {
    const safe = weekShare(recapOf(change));
    assert.doesNotMatch(safe.text, SHARE_UNSAFE);
    assert.doesNotMatch(safe.alt, SHARE_UNSAFE);
  }
  assert.equal(weekShare(recapOf(CALM)).winsTitle, "Sua semana em registros");
});

test("compartilhar: pesagem nunca sai do aparelho, mesmo sendo a única conquista", () => {
  const quiet = recapOf({}, { diary: [water("2026-09-21", 500), water("2026-09-22", 500)], habits: [] });
  assert.deepEqual(keys(quiet.wins), ["pesagens"]);
  const share = weekShare(quiet);
  assert.deepEqual(share.wins, ["Registros em 2 dias da semana"]);
  assert.doesNotMatch(share.text, SHARE_UNSAFE);
});
