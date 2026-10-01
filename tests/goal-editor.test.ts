import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftGoalProfile,
  draftGoals,
  goalsCoherence,
  gramsOf,
  handlePercent,
  moveSplit,
  recommendedModel,
  splitAtPercent,
  splitOf,
  splitValueText,
  stepWater,
  waterModel,
} from "../src/lib/goal-editor";
import { goalsFor, type GoalProfile } from "../src/lib/domain";
import type { Draft } from "../src/types";
import { profileFixture } from "./fixtures";

const DAY = "2026-09-27";
const draft = () => profileFixture() as unknown as Draft;
const base = (): GoalProfile => draftGoalProfile(draft())!;

test("metas a partir do rascunho: iguais às do perfil e nulas sem os dados obrigatórios", () => {
  assert.equal(draftGoalProfile({ ...draft(), weight: "" }), null);
  assert.equal(draftGoalProfile({ ...draft(), conditions: "" }), null);
  assert.deepEqual(draftGoals(draft(), DAY), goalsFor(profileFixture(), DAY));
  assert.equal(draftGoals({ ...draft(), activityLevel: "" }, DAY), null);
  // Textos do rascunho ("72") viram números como no perfil.
  assert.deepEqual(
    draftGoals({ ...draft(), weight: "72", height: "165", manualCalories: "" }, DAY),
    goalsFor({ ...profileFixture(), manualCalories: null }, DAY),
  );
});

test("divisão dos macronutrientes: percentuais inteiros e cada fatia com pelo menos 10%", () => {
  assert.deepEqual(splitOf({ protein: 86, carbs: 229, fat: 60 }), {
    protein: 19,
    carbs: 51,
    fat: 30,
  });
  assert.equal(splitOf({ protein: null, carbs: 229, fat: 60 }), null);
  assert.deepEqual(moveSplit({ protein: 19, carbs: 51, fat: 30 }, 0, 5), {
    protein: 24,
    carbs: 46,
    fat: 30,
  });
  assert.deepEqual(moveSplit({ protein: 12, carbs: 58, fat: 30 }, 0, -5), {
    protein: 10,
    carbs: 60,
    fat: 30,
  });
  assert.deepEqual(moveSplit({ protein: 19, carbs: 51, fat: 30 }, 1, 25), {
    protein: 19,
    carbs: 71,
    fat: 10,
  });
  const s = { protein: 19, carbs: 51, fat: 30 };
  assert.equal(handlePercent(s, 0), 19);
  assert.equal(handlePercent(s, 1), 70);
  assert.deepEqual(splitAtPercent(s, 0, 24), { protein: 24, carbs: 46, fat: 30 });
  assert.deepEqual(splitAtPercent(s, 1, 80), { protein: 19, carbs: 61, fat: 20 });
  assert.deepEqual(splitAtPercent(s, 0, 3), { protein: 10, carbs: 60, fat: 30 });
  for (const handle of [0, 1] as const)
    for (const delta of [-90, -7, 3, 90]) {
      const next = moveSplit(s, handle, delta);
      assert.equal(next.protein + next.carbs + next.fat, 100);
      assert.ok(Math.min(next.protein, next.carbs, next.fat) >= 10);
    }
  assert.deepEqual(gramsOf(1800, { protein: 24, carbs: 46, fat: 30 }), {
    protein: 108,
    carbs: 207,
    fat: 60,
  });
});

test("valor falado das alças: percentuais, ou só gramas com calorias ocultas", () => {
  const s = { protein: 24, carbs: 46, fat: 30 };
  const g = { protein: 108, carbs: 207, fat: 60 };
  assert.equal(splitValueText(s, g, 0, false), "Proteína 24%, carboidratos 46%");
  assert.equal(splitValueText(s, g, 1, false), "Carboidratos 46%, gorduras 30%");
  assert.equal(splitValueText(s, g, 0, true), "Proteína 108 g, carboidratos 207 g");
  assert.equal(splitValueText(s, g, 1, true), "Carboidratos 207 g, gorduras 60 g");
});

test("coerência: macros manuais acima da meta de energia sugerem ajuste pela mesma divisão", () => {
  const g = {
    ...base(),
    manualCalories: 1200,
    manualProtein: 108,
    manualCarbs: 207,
    manualFat: 60,
  };
  const goals = goalsFor(g, DAY);
  const coherence = goalsCoherence(g, goals, false)!;
  assert.deepEqual(coherence.fix, {
    manualProtein: 72,
    manualCarbs: 138,
    manualFat: 40,
  });
  assert.equal(coherence.fixLabel, "Ajustar à meta");
  assert.equal(
    coherence.text,
    "Os macronutrientes somam cerca de 1.800 kcal, acima da meta de 1.200 kcal.",
  );
  const hidden = goalsCoherence(g, goals, true)!;
  assert.ok(!/\d|kcal/.test(hidden.text), hidden.text);
  const auto = { ...base(), manualCalories: 1200 };
  assert.equal(goalsCoherence(auto, goalsFor(auto, DAY), false), null);
  const fits = { ...g, manualProtein: 72, manualCarbs: 138, manualFat: 40 };
  assert.equal(goalsCoherence(fits, goalsFor(fits, DAY), false), null);
});

test("cartão recomendado: origem, calorias ocultas e perfil sensível sem números", () => {
  const auto = { ...base(), manualCalories: null };
  const goals = goalsFor(auto, DAY);
  const model = recommendedModel(auto, goals, false, false);
  assert.equal(model.origin, "Pela sua anamnese");
  assert.equal(model.calories, new Intl.NumberFormat("pt-BR").format(goals.calories!));
  assert.deepEqual(
    model.macros?.map((m) => `${m.label} ${m.grams}`),
    [`Proteína ${goals.protein} g`, `Carboidratos ${goals.carbs} g`, `Gorduras ${goals.fat} g`],
  );
  assert.equal(model.water, "2 L");
  assert.equal(model.reason, null);
  assert.equal(model.actionLabel, "Personalizar");
  // A água informada não torna a meta "definida por você".
  assert.equal(recommendedModel({ ...auto, manualWater: 2500 }, goals, false, false).origin, "Pela sua anamnese");
  for (const key of ["manualCalories", "manualProtein", "manualCarbs", "manualFat"] as const) {
    const manual = { ...auto, [key]: 100 };
    assert.equal(
      recommendedModel(manual, goalsFor(manual, DAY), false, false).origin,
      "Definida por você",
      key,
    );
  }
  const hidden = recommendedModel(auto, goals, true, false);
  assert.equal(hidden.calories, null);
  assert.ok(hidden.macros?.length);
  const sensitive = { ...auto, eatingDisorder: "sim" as const };
  const careful = recommendedModel(sensitive, goalsFor(sensitive, DAY), false, true);
  assert.equal(careful.calories, null);
  assert.equal(careful.macros, null);
  assert.equal(careful.origin, "Aguardando orientação profissional");
  assert.equal(careful.actionLabel, "Informar metas de um profissional");
  assert.ok(careful.reason);
  const noWater = recommendedModel({ ...auto, manualWater: null }, goalsFor({ ...auto, manualWater: null }, DAY), false, false);
  assert.equal(noWater.water, null);
});

test("água em copos: passo de 250 ml, sugestão pelo consumo habitual e cautela com restrição", () => {
  assert.equal(stepWater(2100, 1), 2250);
  assert.equal(stepWater(null, 1), 250);
  assert.equal(stepWater(250, -1), 250);
  assert.equal(stepWater(6000, 1), 6000);
  assert.equal(stepWater(2000, -1), 1750);
  const suggested = waterModel({ manualWater: "", usualWater: 1500, fluidRestriction: "nao" });
  assert.equal(suggested.value, "—");
  assert.equal(suggested.glasses, null);
  assert.deepEqual(suggested.suggestion, {
    ml: 1500,
    label: "Usar 6 copos (1,5 L)",
    hint: "Você contou que bebe cerca de 1,5 L por dia.",
  });
  assert.equal(suggested.note, null);
  const restricted = waterModel({ manualWater: "", usualWater: 1500, fluidRestriction: "sim" });
  assert.equal(restricted.suggestion, null);
  assert.equal(
    restricted.note,
    "Com restrição de líquidos, informe só a meta de quem acompanha você.",
  );
  const set = waterModel({ manualWater: 2000, usualWater: 1500 });
  assert.equal(set.value, "8 copos · 2 L");
  assert.equal(set.glasses, 8);
  assert.equal(set.suggestion, null);
  assert.equal(waterModel({ manualWater: 1750 }).value, "7 copos · 1,75 L");
  assert.equal(waterModel({ manualWater: "", usualWater: 100 }).suggestion, null);
});
