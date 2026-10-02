import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustmentView, signedNumber } from "../src/lib/balance-explain";
import { adjustmentNoteFor, type DailyTarget } from "../src/lib/domain";

/** Meta do dia (dailyTargets) com a meta-base de 1.806 kcal e 110 g de proteína, sem ajuste. */
const target = (changes: Partial<DailyTarget>): DailyTarget => ({
  basal: 1500,
  expenditure: 2300,
  calories: 1806,
  water: 2500,
  protein: 110,
  carbs: 200,
  fat: 60,
  source: "Estimativa da anamnese",
  reason: null,
  strategy: "deficit",
  note: null,
  careNotes: [],
  baseCalories: 1806,
  baseProtein: 110,
  baseCarbs: 200,
  adjustment: 0,
  proteinBoost: 0,
  adjustmentNote: null,
  ...changes,
});

test("sem ajuste no dia: nada a mostrar em 'Como calculamos'", () => {
  assert.equal(adjustmentView(target({})), null);
});

test("meta maior hoje: Meta-base → hoje, delta com sinal e motivo sem culpa; proteína à parte", () => {
  const goals = target({
    calories: 1953,
    adjustment: 147,
    protein: 119,
    proteinBoost: 9,
    adjustmentNote: adjustmentNoteFor(147, 9, false),
  });
  assert.deepEqual(adjustmentView(goals), {
    dayLabel: "hoje",
    calories: {
      base: "1.806",
      target: "1.953",
      delta: "+147 kcal",
      direction: "up",
      why: "ontem você comeu menos",
    },
    protein: { delta: "+9 g", why: "para recuperar a de ontem" },
  });
});

test("meta menor noutra data (Diário): 'neste dia' e 'o dia anterior'; com calorias ocultas só a proteína", () => {
  const down = target({
    calories: 1707,
    adjustment: -99,
    adjustmentNote: adjustmentNoteFor(-99, 0, false, false),
  });
  assert.deepEqual(adjustmentView(down), {
    dayLabel: "neste dia",
    calories: {
      base: "1.806",
      target: "1.707",
      delta: "−99 kcal",
      direction: "down",
      why: "para equilibrar o dia anterior",
    },
    protein: null,
  });
  const hidden = target({
    protein: 119,
    proteinBoost: 9,
    adjustmentNote: adjustmentNoteFor(0, 9, true),
  });
  assert.deepEqual(adjustmentView(hidden), {
    dayLabel: "hoje",
    calories: null,
    protein: { delta: "+9 g", why: "para recuperar a de ontem" },
  });
  assert.equal(signedNumber(-1250), "−1.250");
  assert.equal(signedNumber(9), "+9");
});
