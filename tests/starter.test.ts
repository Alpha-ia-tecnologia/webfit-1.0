import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, updateProfile } from "../src/lib/domain";
import {
  addStarterHabit,
  isStarterState,
  recordStarterWater,
  removeStarterWater,
  restoreStarterWater,
  STARTER_UNLOCKS,
  starterCups,
  starterInputSchema,
  startWithHabits,
  toggleStarterHabit,
} from "../src/lib/starter";
import { stateSchema } from "../src/types";
import { profileFixture } from "./fixtures";

const input = {
  name: "Ana",
  goal: "perder" as const,
  consentLocal: true as const,
  habitIndex: null,
};
const date = "2026-09-23";

test("entrada rápida exige consentimento e não inventa um perfil de saúde", () => {
  assert.equal(
    starterInputSchema.safeParse({ ...input, consentLocal: false }).success,
    false,
  );
  assert.equal(
    starterInputSchema.safeParse({ ...input, name: "" }).success,
    false,
  );
  const state = startWithHabits(initialState(), input, date, "habit-1");
  assert.equal(isStarterState(state), true);
  assert.equal(state.profile, null);
  assert.equal(state.draft?.goal, "perder");
  assert.equal(state.draft?.consentAi, false);
  for (const key of [
    "birthDate",
    "sex",
    "weight",
    "height",
    "conditions",
    "allergies",
    "fluidRestriction",
    "medications",
  ])
    assert.equal(state.draft?.[key], "", key);
  assert.equal(state.habits.length, 0);
  assert.equal(state.measurements.length, 0);
  assert.equal(stateSchema.safeParse(state).success, true);
});

test("hábito depende da escolha e não é duplicado ao repetir a ação", () => {
  const state = startWithHabits(
    initialState(),
    { ...input, habitIndex: 0 },
    date,
    "habit-1",
  );
  assert.equal(state.habits.length, 1);
  const repeated = addStarterHabit(state, 0, date, "habit-2");
  assert.equal(repeated.habits.length, 1);
  const done = toggleStarterHabit(repeated, "habit-1", date);
  assert.deepEqual(done.habits[0].completedDates, [date]);
  assert.deepEqual(
    toggleStarterHabit(done, "habit-1", date).habits[0].completedDates,
    [],
  );
});

test("registro básico depende do consentimento e não cria metas nem ativa IA", () => {
  assert.throws(() =>
    recordStarterWater(
      initialState(),
      date,
      "10:00",
      `${date}T13:00:00.000Z`,
      "water-1",
    ),
  );
  const started = startWithHabits(initialState(), input, date, "habit-1");
  const state = recordStarterWater(
    started,
    date,
    "10:00",
    `${date}T13:00:00.000Z`,
    "water-1",
  );
  assert.equal(state.diary[0].amountMl, 250);
  assert.equal(state.profile, null);
  assert.equal(state.draft?.manualWater, "");
  assert.equal(state.draft?.manualCalories, "");
  assert.equal(state.draft?.consentAi, false);
  assert.equal(stateSchema.safeParse(state).success, true);
});

test("entrada rápida preserva respostas e registros já salvos", () => {
  const existing = {
    ...initialState(),
    draft: {
      occupation: "Professora",
      allergies: "sim",
      allergyDetails: "Amendoim",
      consentLocal: true,
    },
    draftStep: 3,
  };
  const state = startWithHabits(existing, input, date, "habit-1");
  assert.equal(state.draft?.occupation, "Professora");
  assert.equal(state.draft?.allergyDetails, "Amendoim");
  assert.equal(state.draftStep, 3);
});

test("concluir a anamnese mantém os hábitos e registros do início rápido", () => {
  const started = startWithHabits(
    initialState(),
    { ...input, habitIndex: 0 },
    date,
    "habit-1",
  );
  const recorded = recordStarterWater(
    started,
    date,
    "10:00",
    `${date}T13:00:00.000Z`,
    "water-1",
  );
  const completed = updateProfile(recorded, profileFixture());
  assert.notEqual(completed.profile, null);
  assert.equal(isStarterState(completed), false);
  assert.equal(completed.habits[0].id, "habit-1");
  assert.equal(completed.diary[0].id, "water-1");
  assert.throws(() => startWithHabits(completed, input, date, "habit-2"));
});

test("copos só do que foi bebido: sem copos vazios, oito no máximo e o resto em +n", () => {
  assert.deepEqual(starterCups(0), { full: 0, more: 0 });
  assert.deepEqual(starterCups(250), { full: 1, more: 0 });
  assert.deepEqual(starterCups(2000), { full: 8, more: 0 });
  assert.deepEqual(starterCups(2250), { full: 8, more: 1 });
  assert.deepEqual(starterCups(-250), { full: 0, more: 0 });
  assert.equal(STARTER_UNLOCKS.length, 4);
});

test("remover e desfazer um registro de água do primeiro acesso", () => {
  const started = startWithHabits(initialState(), { ...input, habitIndex: 0 }, date, "habit-1");
  const one = recordStarterWater(started, date, "10:00", `${date}T13:00:00.000Z`, "water-1");
  const two = recordStarterWater(one, date, "11:00", `${date}T14:00:00.000Z`, "water-2");
  const removed = removeStarterWater(two, "water-1");
  assert.deepEqual(removed.diary.map((e) => e.id), ["water-2"]);
  assert.equal(removed.habits, two.habits);
  assert.equal(removeStarterWater(removed, "water-1"), removed);
  const entry = two.diary[0]!;
  const restored = restoreStarterWater(removed, entry);
  assert.deepEqual(restored.diary.map((e) => e.id).sort(), ["water-1", "water-2"]);
  assert.equal(restoreStarterWater(restored, entry), restored);
  assert.equal(stateSchema.safeParse(restored).success, true);
  assert.throws(() => removeStarterWater(initialState(), "water-1"));
  assert.throws(() => restoreStarterWater(initialState(), entry));
});
