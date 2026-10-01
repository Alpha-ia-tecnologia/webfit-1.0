import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyTargets,
  GOAL_RULES,
  goalsFor,
  goalsForDate,
  withManualGoals,
} from "../src/lib/domain";
import type { AppState, DiaryEntry, Profile } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";

const DATE = "2026-09-10";
/** Pessoa da fixture sem metas manuais: 72 kg, 165 cm, 34 anos, feminino, atividade leve → basal 1420, gasto 1953. */
const base = (): Profile => ({
  ...profileFixture(),
  manualCalories: null,
  manualWater: null,
  manualProtein: null,
  manualCarbs: null,
  manualFat: null,
});
const withPen = (over: Partial<Profile> = {}): Profile => ({
  ...base(),
  goal: "perder",
  weightLossPen: "sim",
  weightLossPenName: "Ozempic (semaglutida)",
  weightLossPenDose: "0,5 mg",
  weightLossPenPerMonth: 4,
  ...over,
});

test("manutenção e organização da rotina usam o gasto estimado com macros base", () => {
  const goals = goalsFor({ ...base(), goal: "manter" }, DATE);
  assert.equal(goals.basal, 1420);
  assert.equal(goals.expenditure, 1953);
  assert.equal(goals.calories, 1953);
  assert.equal(goals.strategy, "manutencao");
  assert.equal(goals.protein, 86);
  assert.equal(goals.fat, 65);
  assert.equal(goals.carbs, 256);
  assert.equal(goals.note, null);
  const organize = goalsFor({ ...base(), goal: "organizar" }, DATE);
  assert.equal(organize.calories, 1953);
  assert.equal(organize.strategy, "manutencao");
});

test("perda de peso sem caneta: déficit de 500 kcal e proteína alta", () => {
  const goals = goalsFor({ ...base(), goal: "perder" }, DATE);
  assert.equal(goals.calories, 1953 - GOAL_RULES.standardDeficit);
  assert.equal(goals.strategy, "deficit");
  assert.equal(goals.protein, 115);
  assert.equal(goals.fat, 48);
  assert.equal(goals.carbs, 140);
  assert.match(goals.note ?? "", /500 kcal/);
  assert.match(goals.source, /déficit moderado/);
});

test("informar uso de caneta não altera calorias nem macros em nenhum objetivo", () => {
  for (const goal of ["perder", "manter", "organizar", "ganhar"] as const) {
    const withoutMedication = goalsFor({ ...base(), goal }, DATE);
    for (const weightLossPen of ["sim", "nao", "nao_informado"] as const) {
      assert.deepEqual(
        goalsFor(withPen({ goal, weightLossPen }), DATE),
        withoutMedication,
        `Metas não devem depender do uso de medicamento: ${goal}/${weightLossPen}`,
      );
    }
  }
});

test("informar caneta não aumenta o déficit de pessoas com gasto maior", () => {
  for (const change of [
    { weight: 120 },
    { weight: 150, height: 190, activityLevel: "intenso" as const },
  ]) {
    const goals = goalsFor(withPen(change), DATE);
    assert.equal(
      goals.expenditure! - goals.calories!,
      GOAL_RULES.standardDeficit,
    );
    assert.deepEqual(
      goals,
      goalsFor({ ...base(), ...change, goal: "perder" }, DATE),
    );
  }
});

test("piso de segurança: nunca abaixo de 1.200/1.500 kcal e sem déficit quando o gasto já está no piso", () => {
  const small = withPen({
    weight: 52,
    height: 155,
    birthDate: "1966-01-01",
    activityLevel: "sedentario",
  });
  // basal 1028, gasto 1234: o déficit de 500 levaria a 734 → piso de 1.200.
  const woman = goalsFor(small, DATE);
  assert.equal(woman.expenditure, 1234);
  assert.equal(woman.calories, 1200);
  assert.equal(woman.strategy, "deficit");
  assert.match(woman.note ?? "", /piso/);
  // Homem com o mesmo corpo: gasto 1433 já abaixo do piso de 1.500 → manutenção explicada.
  const man = goalsFor({ ...small, sex: "masculino" }, DATE);
  assert.equal(man.expenditure, 1433);
  assert.equal(man.calories, 1433);
  assert.equal(man.strategy, "manutencao");
  assert.match(man.note ?? "", /piso/);
});

test("ganho de peso: superávit moderado com proteína alta", () => {
  const goals = goalsFor({ ...base(), goal: "ganhar" }, DATE);
  assert.equal(goals.calories, 1953 + GOAL_RULES.surplus);
  assert.equal(goals.strategy, "superavit");
  assert.equal(goals.protein, 115);
  assert.equal(goalsFor(withPen({ goal: "ganhar" }), DATE).calories, 2253);
});

test("metas manuais prevalecem e os macros em branco derivam da meta informada", () => {
  const manual = goalsFor(withPen({ manualCalories: 1800 }), DATE);
  assert.equal(manual.calories, 1800);
  assert.equal(manual.strategy, "manual");
  assert.equal(manual.source, "Meta informada por você");
  assert.equal(manual.note, null);
  assert.equal(manual.protein, 115);
  assert.equal(manual.fat, 60);
  assert.equal(manual.carbs, 200);
  const protein = goalsFor(
    { ...base(), goal: "manter", manualProtein: 150 },
    DATE,
  );
  assert.equal(protein.protein, 150);
  assert.equal(protein.fat, 65);
  assert.equal(protein.carbs, 192);
});

test("restrições clínicas continuam sem metas automáticas, mesmo com caneta", () => {
  const goals = goalsFor(withPen({ conditions: "Diabetes tipo 2" }), DATE);
  assert.equal(goals.calories, null);
  assert.equal(goals.protein, null);
  assert.equal(goals.carbs, null);
  assert.equal(goals.fat, null);
  assert.equal(goals.strategy, null);
  assert.ok(goals.reason);
  // Com meta manual, os macros derivam dela mesmo sob restrição.
  const manual = goalsFor(
    withPen({ conditions: "Diabetes tipo 2", manualCalories: 1600 }),
    DATE,
  );
  assert.equal(manual.calories, 1600);
  assert.equal(manual.protein, 115);
});

test("piso de segurança também vale para perda de peso sem caneta", () => {
  const woman = goalsFor(
    {
      ...base(),
      goal: "perder",
      weight: 52,
      height: 155,
      birthDate: "1966-01-01",
      activityLevel: "sedentario",
    },
    DATE,
  );
  // gasto 1234 − 500 = 734 → piso de 1.200.
  assert.equal(woman.calories, 1200);
  assert.equal(woman.strategy, "deficit");
  assert.match(woman.note ?? "", /piso/);
});

test("macros automáticos respeitam o que sobra da meta e metas manuais incoerentes são avisadas", () => {
  // Proteína manual alta: gordura automática limitada ao restante, carboidratos quase zero, sem aviso.
  const highProtein = goalsFor(
    { ...base(), goal: "manter", manualCalories: 1200, manualProtein: 250 },
    DATE,
  );
  assert.equal(highProtein.fat, 22);
  assert.equal(highProtein.carbs, 1);
  assert.equal(highProtein.note, null);
  // Gordura manual alta: a proteína automática cede ao restante das calorias.
  const highFat = goalsFor(
    { ...base(), goal: "perder", manualCalories: 1500, manualFat: 150 },
    DATE,
  );
  assert.equal(highFat.protein, 37);
  assert.equal(highFat.carbs, 1);
  // Duas metas manuais que não cabem na meta calórica: carboidratos zero e aviso explícito.
  const clash = goalsFor(
    {
      ...base(),
      goal: "manter",
      manualCalories: 1200,
      manualProtein: 200,
      manualFat: 100,
    },
    DATE,
  );
  assert.equal(clash.carbs, 0);
  assert.match(clash.note ?? "", /somam cerca de 1\.700 kcal/);
  assert.match(clash.note ?? "", /1\.200 kcal/);
});

// ---------- Metas diárias estáveis ----------
const YESTERDAY = "2026-09-09";
const meal = (date: string, calories: number): DiaryEntry =>
  ({
    id: `m-${date}-${calories}`,
    userId: "u1",
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    description: "",
    calories,
  }) as DiaryEntry;
const stateWith = (profile: Profile, diary: DiaryEntry[]): AppState => ({
  ...stateFixture(),
  profile,
  goalHistory: [{ date: "2026-09-01", profile }],
  diary,
});

test("meta diária sem registros conserva a meta base e não anuncia ajustes", () => {
  const p = base();
  const goals = goalsFor(p, DATE);
  assert.deepEqual(dailyTargets(stateWith(p, []), DATE), {
    ...goals,
    baseCalories: goals.calories,
    adjustment: 0,
    adjustmentNote: null,
  });
});

test("registrar somente uma refeição no dia anterior não muda calorias nem macros", () => {
  const p = base();
  const withoutRecords = dailyTargets(stateWith(p, []), DATE);
  const withPartialDiary = dailyTargets(
    stateWith(p, [meal(YESTERDAY, 350)]),
    DATE,
  );
  assert.deepEqual(withPartialDiary, withoutRecords);
});

test("consumo registrado acima da meta não reduz a meta seguinte nem encadeia compensações", () => {
  const p = base();
  const withoutRecords = dailyTargets(stateWith(p, []), DATE);
  const withPreviousRecords = dailyTargets(
    stateWith(p, [
      meal("2026-09-07", 3000),
      meal("2026-09-08", 400),
      meal(YESTERDAY, 2500),
    ]),
    DATE,
  );
  assert.deepEqual(withPreviousRecords, withoutRecords);
});

test("meta manual e todos os macros manuais são preservados após registros acima ou abaixo", () => {
  const p: Profile = {
    ...base(),
    manualCalories: 1250,
    manualProtein: 90,
    manualCarbs: 140,
    manualFat: 35,
    manualWater: 2000,
  };
  for (const consumed of [350, 1650, 3000]) {
    const target = dailyTargets(
      stateWith(p, [meal(YESTERDAY, consumed)]),
      DATE,
    );
    assert.equal(target.calories, 1250);
    assert.equal(target.baseCalories, 1250);
    assert.equal(target.protein, 90);
    assert.equal(target.carbs, 140);
    assert.equal(target.fat, 35);
    assert.equal(target.water, 2000);
    assert.equal(target.strategy, "manual");
    assert.equal(target.adjustment, 0);
    assert.equal(target.adjustmentNote, null);
  }
});

test("metas diárias respeitam o histórico e permanecem indefinidas antes do primeiro perfil", () => {
  const oldProfile = { ...base(), manualCalories: 1700 };
  const currentProfile = { ...oldProfile, manualCalories: 1900 };
  const state = {
    ...stateWith(currentProfile, [meal(YESTERDAY, 350)]),
    goalHistory: [
      { date: "2026-09-10", profile: currentProfile },
      { date: "2026-09-01", profile: oldProfile },
    ],
  };
  for (const date of ["2026-08-31", YESTERDAY, DATE]) {
    const expected = goalsForDate(state, date);
    assert.deepEqual(dailyTargets(state, date), {
      ...expected,
      baseCalories: expected.calories,
      adjustment: 0,
      adjustmentNote: null,
    });
  }
  assert.equal(dailyTargets(state, "2026-08-31").calories, null);
  assert.equal(dailyTargets(state, YESTERDAY).calories, 1700);
  assert.equal(dailyTargets(state, DATE).calories, 1900);
});

test("registros anteriores não criam metas automáticas para quem precisa de avaliação individual", () => {
  for (const change of [
    { conditions: "Diabetes tipo 2" },
    { pregnancy: "gestacao" as const },
    { eatingDisorder: "sim" as const },
    { sex: "nao_informado" as const },
    { birthDate: "2015-06-15" },
  ]) {
    const p = { ...base(), ...change };
    const target = dailyTargets(stateWith(p, [meal(YESTERDAY, 350)]), DATE);
    assert.equal(target.calories, null);
    assert.equal(target.protein, null);
    assert.equal(target.carbs, null);
    assert.equal(target.fat, null);
    assert.equal(target.adjustment, 0);
    assert.equal(target.adjustmentNote, null);
    assert.ok(target.reason);
  }
});

test("ajustar metas grava o perfil e a meta do dia sem mexer em medições nem rascunho", () => {
  const state = { ...stateWith(base(), []), draft: { name: "rascunho" }, draftStep: 3 };
  const next = withManualGoals(state, { manualCalories: 1650, manualProtein: 110 }, DATE);
  assert.equal(next.profile!.manualCalories, 1650);
  assert.equal(next.profile!.manualProtein, 110);
  assert.equal(next.profile!.manualWater, null);
  assert.deepEqual(next.measurements, state.measurements);
  assert.deepEqual(next.draft, state.draft);
  assert.equal(next.draftStep, 3);
  // Um registro por data: o de hoje é substituído, os anteriores ficam.
  assert.deepEqual(next.goalHistory.map((h) => h.date), ["2026-09-01", DATE]);
  assert.equal(dailyTargets(next, DATE).calories, 1650);
  assert.equal(dailyTargets(next, DATE).strategy, "manual");
  assert.equal(dailyTargets(next, "2026-09-05").calories, goalsFor(base(), DATE).calories);
  const again = withManualGoals(next, { manualCalories: 1700 }, DATE);
  assert.equal(again.goalHistory.length, 2);
  assert.equal(dailyTargets(again, DATE).calories, 1700);
  assert.equal(again.profile!.manualProtein, 110);
});

test("voltar ao automático limpa as metas manuais e recusa valores fora dos limites", () => {
  const manual = { ...base(), manualCalories: 1500, manualProtein: 90, manualCarbs: 150, manualFat: 50, manualWater: 2200 };
  const state = stateWith(manual, []);
  const auto = withManualGoals(
    state,
    { manualCalories: null, manualProtein: null, manualCarbs: null, manualFat: null },
    DATE,
  );
  assert.equal(auto.profile!.manualWater, 2200);
  assert.deepEqual(goalsFor(auto.profile!, DATE), goalsFor({ ...base(), manualWater: 2200 }, DATE));
  assert.notEqual(dailyTargets(auto, DATE).strategy, "manual");
  assert.throws(() => withManualGoals(state, { manualCalories: 100 }, DATE), /Confira os valores/);
  assert.equal(withManualGoals({ ...state, profile: null }, { manualCalories: 1500 }, DATE).profile, null);
});
