import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayLine,
  HABITS_TEXT,
  PLAN_TITLES,
  planCascade,
  planChecklist,
  planRingAria,
  planVariant,
  planWater,
} from "../src/lib/plan-reveal";
import { goalsFor } from "../src/lib/domain";
import { fmtKcal } from "../src/lib/format";
import type { Profile } from "../src/types";
import { profileFixture } from "./fixtures";

const TODAY = "2026-09-27";
const variantOf = (p: Profile) => planVariant(p, goalsFor(p, TODAY), TODAY);

test("variante do plano: completo, prato com calorias ocultas e rotina para quem pede cuidado", () => {
  const p = profileFixture();
  assert.equal(variantOf(p), "completo");
  assert.equal(variantOf({ ...p, hideCalories: true }), "prato");
  assert.equal(variantOf({ ...p, eatingDisorder: "sim" }), "habitos");
  assert.equal(variantOf({ ...p, pregnancy: "gestacao" }), "habitos");
  // Menor de idade: rotina mesmo com meta manual.
  assert.equal(variantOf({ ...p, birthDate: "2010-06-15" }), "habitos");
  const hypertension = { ...p, conditions: "Hipertensão" };
  assert.equal(variantOf({ ...hypertension, manualCalories: null }), "habitos");
  assert.equal(variantOf({ ...hypertension, manualCalories: 1800 }), "completo");
  assert.equal(PLAN_TITLES.completo, "Seu plano inicial");
  assert.equal(PLAN_TITLES.prato, "Seu plano inicial");
  assert.equal(PLAN_TITLES.habitos, "Seu plano de hábitos");
  assert.ok(!/\d|kcal|peso/i.test(HABITS_TEXT));
});

test("linhas do carregamento citam as respostas; o plano de rotina não cita objetivo nem peso", () => {
  const p = profileFixture();
  assert.deepEqual(planChecklist(p, "completo"), [
    "Rotina: trabalho em escritório",
    "Horários: acorda às 07:00 e dorme às 23:00",
    "Alimentação: alimentação variada, sem restrições, sem amendoim",
    "Objetivo: manter meu peso",
  ]);
  const careful = planChecklist({ ...p, eatingDisorder: "sim", goal: "perder" }, "habitos");
  assert.equal(careful.length, 4);
  assert.equal(careful[3], "Cuidados: considerados nas sugestões");
  for (const line of careful) assert.ok(!/objetivo|peso|kcal/i.test(line), line);
  assert.equal(
    planChecklist({ ...p, allergies: "nao" }, "completo")[2],
    "Alimentação: alimentação variada, sem restrições",
  );
  assert.equal(
    planChecklist({ ...p, allergyDetails: "Prefiro não detalhar" }, "completo")[2],
    "Alimentação: alimentação variada, sem restrições",
  );
  const long = planChecklist(
    { ...p, occupation: "Coordeno uma equipe de manutenção em turnos alternados" },
    "completo",
  )[0];
  assert.ok(long.length <= "Rotina: ".length + 40, long);
});

test("cascata basal → gasto → meta com o detalhe de cada meta", () => {
  const p = profileFixture();
  const goals = goalsFor(p, TODAY);
  const rows = planCascade(p, goals)!;
  assert.deepEqual(
    rows.map((r) => [r.key, r.label, r.value]),
    [
      ["basal", "Em repouso", fmtKcal(goals.basal!)],
      ["gasto", "Gasto estimado", fmtKcal(goals.expenditure!)],
      ["meta", "Sua meta", fmtKcal(goals.calories!)],
    ],
  );
  assert.equal(rows[0].detail, "o que seu corpo gasta parado");
  assert.equal(rows[1].detail, "atividade leve");
  assert.equal(rows[2].detail, "informada por você");
  assert.equal(Math.max(...rows.map((r) => r.widthPercent)), 100);
  assert.ok(rows.every((r) => r.widthPercent >= 16));
  const detailFor = (changes: Partial<Profile>) => {
    const q = { ...p, manualCalories: null, ...changes };
    return planCascade(q, goalsFor(q, TODAY))?.[2].detail;
  };
  assert.equal(detailFor({ goal: "perder" }), "500 kcal a menos por dia");
  assert.equal(detailFor({ goal: "ganhar" }), "300 kcal a mais por dia");
  assert.equal(detailFor({ goal: "manter" }), "igual ao gasto");
  assert.equal(detailFor({ activityLevel: "moderado" }), "igual ao gasto");
  const restricted = { ...p, conditions: "Hipertensão", manualCalories: null };
  assert.equal(planCascade(restricted, goalsFor(restricted, TODAY)), null);
});

test("água, linha do dia e anel com rótulos falados", () => {
  assert.deepEqual(planWater({ water: 2000 }), {
    glasses: 8,
    label: "8 copos de 250 ml",
    aria: "Meta de água: 8 copos de 250 ml, 2 L por dia",
  });
  assert.equal(planWater({ water: null }), null);
  const line = dayLine(profileFixture());
  assert.equal(
    line.aria,
    "Seu dia: acordar 07:00, café da manhã 08:00, almoço 12:00, jantar 19:00, dormir 23:00",
  );
  assert.deepEqual(
    line.items.map((i) => i.time),
    ["07:00", "08:00", "12:00", "19:00", "23:00"],
  );
  assert.equal(planRingAria(1800), "Meta de 1.800 kcal por dia");
});
