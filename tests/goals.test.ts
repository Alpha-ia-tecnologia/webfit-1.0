import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyTargets,
  deficitFor,
  GOAL_RULES,
  goalsFor,
  goalsForDate,
  PROTEIN_BOOST_NOTE,
  proteinBaseWeight,
  withManualGoals,
} from "../src/lib/domain";
import { adaptiveAdjustment } from "../src/lib/goal-rules";
import {
  ALLOWED_CONDITION_TAGS,
  BLOCKING_CONDITION_TAGS,
  CARE_NOTES_CLOSING,
  GLUCOSE_CARE_NOTE,
  PEN_CARE_NOTE,
  PEN_CARE_NOTE_NO_WATER,
  UNDERWEIGHT_CARE_NOTE,
  type ConditionTag,
} from "../src/lib/conditions";
import type { AppState, DiaryEntry, Profile } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";

const DATE = "2026-09-10";
/**
 * Pessoa da fixture sem metas manuais: 72 kg, 165 cm (IMC 26,4), 34 anos, feminino, atividade
 * leve → basal 1420, gasto 1953.
 */
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
const deficitOf = (p: Profile) => {
  const goals = goalsFor(p, DATE);
  return goals.expenditure! - goals.calories!;
};

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
  assert.deepEqual(goals.careNotes, []);
  const organize = goalsFor({ ...base(), goal: "organizar" }, DATE);
  assert.equal(organize.calories, 1953);
  assert.equal(organize.strategy, "manutencao");
});

test("perda de peso com sobrepeso (IMC 25–29,9): 20% do gasto, no mínimo 400 kcal", () => {
  const goals = goalsFor({ ...base(), goal: "perder" }, DATE);
  // 20% de 1953 = 391 → mínimo da faixa, 400.
  assert.equal(goals.calories, 1553);
  assert.equal(goals.strategy, "deficit");
  assert.equal(goals.protein, 115);
  assert.equal(goals.fat, 52);
  assert.equal(goals.carbs, 156);
  assert.match(goals.note ?? "", /Déficit de 400 kcal/);
  assert.match(goals.note ?? "", /ajustado ao seu perfil: IMC e estilo de vida/);
  assert.match(goals.source, /déficit ajustado ao seu perfil/);
});

test("faixas de IMC: 15%, 20% e 25% do gasto, limitados ao mínimo e ao máximo de cada faixa", () => {
  // IMC 22 (60 kg): 15% de 1788 = 268, dentro de 250–400.
  assert.equal(deficitOf({ ...base(), goal: "perder", weight: 60 }), 268);
  // IMC 40 (110 kg): 25% de 2475 = 619, dentro de 500–1000.
  assert.equal(deficitOf({ ...base(), goal: "perder", weight: 110 }), 619);
  // Limites de cada faixa (faixa decidida só pelo IMC).
  assert.equal(deficitFor(1000, 22, false), 250);
  assert.equal(deficitFor(4000, 22, false), 400);
  assert.equal(deficitFor(1000, 27, false), 400);
  assert.equal(deficitFor(4000, 27, false), 600);
  assert.equal(deficitFor(1500, 30, false), 500);
  assert.equal(deficitFor(5000, 35, false), 1000);
  // Fronteiras: 25 e 30 já são da faixa seguinte.
  assert.equal(deficitFor(2000, 24.99, false), 300);
  assert.equal(deficitFor(2000, 25, false), 400);
  assert.equal(deficitFor(2400, 30, false), 600);
  assert.equal(GOAL_RULES.maxDeficit, 1000);
});

test("caneta emagrecedora: +5 pontos percentuais no déficit de cada faixa, sem passar de 1.000 kcal", () => {
  // IMC 22: 20% de 1788 = 358 (sem caneta, 268).
  assert.equal(deficitOf(withPen({ weight: 60 })), 358);
  // IMC 26,4: 25% de 1953 = 488 (sem caneta, 400).
  const goals = goalsFor(withPen(), DATE);
  assert.equal(goals.calories, 1465);
  assert.match(goals.note ?? "", /IMC, estilo de vida e uso da caneta/);
  // IMC 40: 30% de 2475 = 743 (sem caneta, 619).
  assert.equal(deficitOf(withPen({ weight: 110 })), 743);
  // Gasto alto: 30% passaria de 1.000 → teto absoluto.
  const large = {
    weight: 150,
    height: 190,
    activityLevel: "intenso" as const,
    sex: "masculino" as const,
  };
  assert.equal(deficitOf(withPen(large)), 1000);
  assert.equal(deficitOf({ ...base(), ...large, goal: "perder" }), 1000);
  assert.equal(deficitFor(2000, 27, true), 500);
  assert.equal(deficitFor(4000, 27, true), 600);
  // Caneta não muda a meta de quem não quer perder peso.
  for (const goal of ["manter", "organizar"] as const)
    assert.equal(goalsFor(withPen({ goal }), DATE).calories, 1953);
  assert.equal(goalsFor(withPen({ goal: "ganhar" }), DATE).calories, 2253);
});

test("IMC abaixo de 18,5: sem déficit, manutenção e cuidado sem números (com ou sem caneta)", () => {
  for (const pen of [false, true]) {
    const p = pen
      ? withPen({ weight: 48 })
      : { ...base(), goal: "perder" as const, weight: 48 };
    const goals = goalsFor(p, DATE);
    assert.equal(goals.calories, goals.expenditure);
    assert.equal(goals.strategy, "manutencao");
    assert.ok(goals.careNotes.includes(UNDERWEIGHT_CARE_NOTE));
    assert.equal(goals.careNotes.at(-1), CARE_NOTES_CLOSING);
    assert.ok(!/\d/.test(goals.note ?? ""), goals.note ?? "");
  }
  // Manter o peso com IMC baixo não ganha o aviso de perda de peso.
  assert.deepEqual(
    goalsFor({ ...base(), goal: "manter", weight: 48 }, DATE).careNotes,
    [],
  );
});

test("piso de segurança: nunca abaixo de 1.200/1.500 kcal e sem déficit quando o gasto já está no piso", () => {
  const small = withPen({
    weight: 52,
    height: 155,
    birthDate: "1966-01-01",
    activityLevel: "sedentario",
  });
  // basal 1028, gasto 1234: qualquer déficit da faixa levaria abaixo de 1.200 → piso.
  const woman = goalsFor(small, DATE);
  assert.equal(woman.expenditure, 1234);
  assert.equal(woman.calories, 1200);
  assert.equal(woman.strategy, "deficit");
  assert.match(woman.note ?? "", /piso de 1\.200 kcal/);
  // Homem com o mesmo corpo: gasto 1433 já abaixo do piso de 1.500 → manutenção explicada.
  const man = goalsFor({ ...small, sex: "masculino" }, DATE);
  assert.equal(man.expenditure, 1433);
  assert.equal(man.calories, 1433);
  assert.equal(man.strategy, "manutencao");
  assert.match(man.note ?? "", /piso/);
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
  // gasto 1234 − 250 (mínimo da faixa) = 984 → piso de 1.200.
  assert.equal(woman.calories, 1200);
  assert.equal(woman.strategy, "deficit");
  assert.match(woman.note ?? "", /piso/);
});

test("ganho de peso: superávit moderado com proteína alta", () => {
  const goals = goalsFor({ ...base(), goal: "ganhar" }, DATE);
  assert.equal(goals.calories, 1953 + GOAL_RULES.surplus);
  assert.equal(goals.strategy, "superavit");
  assert.equal(goals.protein, 115);
});

test("proteína: peso atual até IMC 30; acima, referência do IMC 25 mais 40% do excesso", () => {
  assert.equal(proteinBaseWeight({ weight: 72, height: 165 }), 72);
  // IMC 40: referência 68,06 kg + 40% de (110 − 68,06) = 84,84 kg.
  const adjusted = proteinBaseWeight({ weight: 110, height: 165 });
  assert.ok(Math.abs(adjusted - 84.8375) < 1e-9, String(adjusted));
  assert.equal(goalsFor({ ...base(), goal: "manter", weight: 110 }, DATE).protein, 102);
  assert.equal(goalsFor({ ...base(), goal: "perder", weight: 110 }, DATE).protein, 136);
  // IMC exatamente 30 (120 kg, 2 m) ainda usa o peso atual.
  assert.equal(proteinBaseWeight({ weight: 120, height: 200 }), 120);
});

test("caneta: 1,8 g/kg em qualquer objetivo e teto de 40% das calorias (35% sem caneta)", () => {
  for (const goal of ["perder", "manter", "organizar", "ganhar"] as const)
    assert.equal(goalsFor(withPen({ goal }), DATE).protein, 130);
  assert.equal(goalsFor(withPen({ weight: 110 }), DATE).protein, 153);
  // Meta manual de 1.200 kcal: 1,8 × 72 = 130 passa do teto de 40% (120 g).
  assert.equal(goalsFor(withPen({ manualCalories: 1200 }), DATE).protein, 120);
  // Sem caneta: 1,6 × 72 = 115 passa do teto de 35% (105 g).
  assert.equal(
    goalsFor({ ...base(), goal: "perder", manualCalories: 1200 }, DATE).protein,
    105,
  );
  assert.equal(GOAL_RULES.proteinPerKg.pen, 1.8);
  assert.equal(GOAL_RULES.penProteinMaxShare, 0.4);
});

test("metas manuais prevalecem e os macros em branco derivam da meta informada", () => {
  const manual = goalsFor(withPen({ manualCalories: 1800 }), DATE);
  assert.equal(manual.calories, 1800);
  assert.equal(manual.strategy, "manual");
  assert.equal(manual.source, "Meta informada por você");
  assert.equal(manual.note, null);
  assert.equal(manual.protein, 130);
  assert.equal(manual.fat, 60);
  assert.equal(manual.carbs, 185);
  const protein = goalsFor(
    { ...base(), goal: "manter", manualProtein: 150 },
    DATE,
  );
  assert.equal(protein.protein, 150);
  assert.equal(protein.fat, 65);
  assert.equal(protein.carbs, 192);
});

test("restrições clínicas continuam sem metas automáticas, mesmo com caneta", () => {
  const goals = goalsFor(withPen({ conditionTags: ["doenca_renal"] }), DATE);
  assert.equal(goals.calories, null);
  assert.equal(goals.protein, null);
  assert.equal(goals.carbs, null);
  assert.equal(goals.fat, null);
  assert.equal(goals.strategy, null);
  assert.deepEqual(goals.careNotes, []);
  assert.ok(goals.reason);
  // Com meta manual, os macros derivam dela mesmo sob restrição.
  const manual = goalsFor(
    withPen({ conditions: "Diabetes tipo 2", manualCalories: 1600 }),
    DATE,
  );
  assert.equal(manual.calories, 1600);
  assert.equal(manual.protein, 130);
});

test("condições da lista: as com ajustes mantêm metas e cuidados; as que pedem avaliação bloqueiam", () => {
  const listed = (conditionTags: ConditionTag[], conditions = "") => ({
    ...base(),
    goal: "perder" as const,
    conditionTags,
    conditions,
  });
  const allowed = goalsFor(
    listed(["hipertensao", "pre_diabetes", "diabetes_tipo_2"]),
    DATE,
  );
  assert.equal(allowed.calories, 1553);
  assert.deepEqual(allowed.careNotes, [
    "Pressão alta: prefira comida caseira, com menos sal, embutidos e ultraprocessados.",
    GLUCOSE_CARE_NOTE,
    CARE_NOTES_CLOSING,
  ]);
  for (const tag of BLOCKING_CONDITION_TAGS) {
    const goals = goalsFor(listed(["hipertensao", tag], "Detalhes"), DATE);
    assert.equal(goals.calories, null, tag);
    assert.deepEqual(goals.careNotes, [], tag);
  }
  // "Nenhuma" libera as metas; com a lista marcada, o texto dos detalhes não decide.
  const none = goalsFor(listed(["nenhuma"], "Asma leve na infância"), DATE);
  assert.equal(none.calories, 1553);
  assert.deepEqual(none.careNotes, []);
  // Condição com ajustes + caneta: cuidados das duas, fechamento uma vez só.
  const both = goalsFor(withPen({ conditionTags: ["obesidade"] }), DATE);
  assert.deepEqual(both.careNotes, [
    "IMC: a meta já considera a sua faixa; a perda gradual é a mais sustentável.",
    PEN_CARE_NOTE,
    CARE_NOTES_CLOSING,
  ]);
});

test("caneta com restrição de líquidos: o cuidado das metas não pede para beber água", () => {
  for (const fluidRestriction of ["sim", "nao_sei"] as const) {
    const goals = goalsFor(withPen({ fluidRestriction }), DATE);
    assert.deepEqual(goals.careNotes, [PEN_CARE_NOTE_NO_WATER, CARE_NOTES_CLOSING]);
    assert.doesNotMatch(goals.careNotes.join(" "), /água/);
  }
  assert.deepEqual(goalsFor(withPen(), DATE).careNotes, [PEN_CARE_NOTE, CARE_NOTES_CLOSING]);
});

test("perfis antigos (sem a lista): o texto livre decide como antes", () => {
  const legacy = (conditions: string) => ({
    ...base(),
    conditionTags: [],
    conditions,
  });
  assert.notEqual(goalsFor(legacy("Nenhuma"), DATE).calories, null);
  assert.notEqual(goalsFor(legacy("não"), DATE).calories, null);
  assert.equal(goalsFor(legacy("Hipertensão"), DATE).calories, null);
  assert.equal(goalsFor(legacy("Prefiro não informar"), DATE).calories, null);
});

test("cuidados nunca trazem números, dados do corpo nem dose", () => {
  const tagSets: ConditionTag[][] = [
    [...ALLOWED_CONDITION_TAGS],
    ...ALLOWED_CONDITION_TAGS.map((tag) => [tag]),
  ];
  for (const conditionTags of tagSets)
    for (const pen of [false, true])
      for (const weight of [48, 72, 110]) {
        const p = pen
          ? withPen({ conditionTags, weight })
          : { ...base(), goal: "perder" as const, conditionTags, weight };
        const { careNotes } = goalsFor(p, DATE);
        assert.ok(careNotes.length > 0);
        for (const note of careNotes) {
          assert.ok(!/\d/.test(note), note);
          assert.ok(!/kcal|kg|\bmg\b|dose/i.test(note), note);
        }
      }
  // Glicose aparece uma vez mesmo com pré-diabetes e diabetes tipo 2.
  const glucose = goalsFor(
    { ...base(), conditionTags: ["pre_diabetes", "diabetes_tipo_2"] },
    DATE,
  ).careNotes;
  assert.equal(glucose.filter((n) => n === GLUCOSE_CARE_NOTE).length, 1);
  // A nota da meta cita IMC só como palavra: nem o IMC nem o peso aparecem.
  for (const weight of [60, 72, 110]) {
    const note = goalsFor(withPen({ weight }), DATE).note ?? "";
    assert.ok(!note.includes(String(weight)), note);
    assert.ok(!/\d+,\d/.test(note), note);
  }
});

test("histórico: dias passados são recalculados com as regras atuais", () => {
  const p = withPen();
  const state: AppState = {
    ...stateFixture(),
    profile: p,
    goalHistory: [{ date: "2026-08-01", profile: p }],
  };
  // O histórico guarda o perfil, não as metas: um dia antigo segue a regra vigente.
  assert.deepEqual(goalsForDate(state, "2026-08-15"), goalsFor(p, "2026-08-15"));
  assert.equal(goalsForDate(state, "2026-08-15").calories, 1465);
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

// ---------- Meta diária com ajuste dinâmico ----------
const YESTERDAY = "2026-09-09";
const BEFORE_YESTERDAY = "2026-09-08";
const meal = (date: string, calories: number, protein = 50, n = 1): DiaryEntry =>
  ({
    id: `m-${date}-${calories}-${n}`,
    userId: "u1",
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    description: "",
    calories,
    macros: { protein, carbs: 0, fat: 0 },
  }) as DiaryEntry;
/** Dia com duas refeições (o mínimo para ontem contar), somando as calorias e a proteína dadas. */
const day = (date: string, calories: number, protein = 100): DiaryEntry[] => [
  meal(date, Math.floor(calories / 2), protein / 2, 1),
  meal(date, Math.ceil(calories / 2), protein / 2, 2),
];
const stateWith = (profile: Profile, diary: DiaryEntry[]): AppState => ({
  ...stateFixture(),
  profile,
  goalHistory: [{ date: "2026-09-01", profile }],
  diary,
  adaptiveTargets: true,
});
const stable = (goals: ReturnType<typeof goalsFor>) => ({
  ...goals,
  baseCalories: goals.calories,
  baseProtein: goals.protein,
  baseCarbs: goals.carbs,
  adjustment: 0,
  proteinBoost: 0,
  adjustmentNote: null,
});
/** Fixture: manutenção 1.953 kcal, proteína 86 g, carboidratos 256 g, gorduras 65 g. */
const BASE = { calories: 1953, protein: 86, carbs: 256, fat: 65 };

test("meta diária sem registros conserva a meta base e não anuncia ajustes", () => {
  const p = base();
  assert.deepEqual(dailyTargets(stateWith(p, []), DATE), stable(goalsFor(p, DATE)));
});

test("ontem com menos de 2 refeições não conta: dia sem registro nunca vira 'comeu pouco'", () => {
  const p = base();
  const withoutRecords = dailyTargets(stateWith(p, []), DATE);
  for (const diary of [[meal(YESTERDAY, 350, 5)], [meal(YESTERDAY, 4000, 5)]])
    assert.deepEqual(dailyTargets(stateWith(p, diary), DATE), withoutRecords);
});

test("tolerância: até 10% da meta-base de ontem não muda a meta de hoje", () => {
  const p = base();
  for (const eaten of [2148, 1758, BASE.calories]) {
    const target = dailyTargets(stateWith(p, day(YESTERDAY, eaten)), DATE);
    assert.equal(target.adjustment, 0, `comeu ${eaten}`);
    assert.equal(target.calories, BASE.calories);
    assert.equal(target.adjustmentNote, null);
  }
});

test("acima da meta ontem: hoje metade da diferença a menos, absorvida nos carboidratos", () => {
  const p = base();
  // 2.150 − 1.953 = 197 → −round(98,5) = −99 kcal; carboidratos −25 g; gorduras iguais.
  const target = dailyTargets(stateWith(p, day(YESTERDAY, 2150)), DATE);
  assert.equal(target.adjustment, -99);
  assert.equal(target.calories, BASE.calories - 99);
  assert.equal(target.baseCalories, BASE.calories);
  assert.equal(target.carbs, BASE.carbs - 25);
  assert.equal(target.baseCarbs, BASE.carbs);
  assert.equal(target.fat, BASE.fat);
  assert.equal(target.protein, BASE.protein);
  assert.equal(target.proteinBoost, 0);
  assert.equal(
    target.adjustmentNote,
    "Hoje a meta está um pouco menor para equilibrar ontem (99 kcal a menos).",
  );
  assert.doesNotMatch(target.adjustmentNote!, /compens|excesso|culpa|atrasad/i);
});

test("tetos: no máximo 10% da meta-base de hoje e 250 kcal, nos dois sentidos", () => {
  const p = base();
  // 10% de 1.953 = 195 (menor que 250).
  const over = dailyTargets(stateWith(p, day(YESTERDAY, 3500)), DATE);
  assert.equal(over.adjustment, -195);
  assert.equal(over.calories, BASE.calories - 195);
  assert.equal(over.carbs, BASE.carbs - 49);
  const under = dailyTargets(stateWith(p, day(YESTERDAY, 600)), DATE);
  assert.equal(under.adjustment, 195);
  assert.equal(under.calories, BASE.calories + 195);
  assert.equal(under.carbs, BASE.carbs + 49);
  assert.equal(
    under.adjustmentNote,
    "Hoje a meta está um pouco maior porque ontem você comeu menos (195 kcal a mais).",
  );
  // Meta-base alta: o teto de 250 kcal vale antes dos 10%.
  const big: Profile = { ...base(), sex: "masculino", weight: 95, height: 185, activityLevel: "intenso" };
  const bigBase = goalsFor(big, DATE).calories!;
  assert.ok(bigBase * GOAL_RULES.adaptive.maxShare > GOAL_RULES.adaptive.maxKcal);
  const bigOver = dailyTargets(stateWith(big, day(YESTERDAY, bigBase + 2000)), DATE);
  assert.equal(bigOver.adjustment, -GOAL_RULES.adaptive.maxKcal);
  assert.equal(bigOver.calories, bigBase - GOAL_RULES.adaptive.maxKcal);
});

test("piso: a meta ajustada nunca fica abaixo de 1.200/1.500 kcal", () => {
  // 50 kg, 160 cm, sedentária, perder peso: a meta-base já está no piso de 1.200 kcal.
  const p: Profile = { ...base(), goal: "perder", weight: 50, height: 160, activityLevel: "sedentario" };
  assert.equal(goalsFor(p, DATE).calories, 1200);
  const target = dailyTargets(stateWith(p, day(YESTERDAY, 2500)), DATE);
  assert.equal(target.calories, 1200);
  assert.equal(target.adjustment, 0);
  assert.equal(target.adjustmentNote, null);
  // Acima do piso, a redução para nele.
  const near = adaptiveAdjustment({
    today: { calories: 1260, protein: 90, carbs: 150 },
    yesterday: { calories: 1260, protein: 90 },
    eaten: { calories: 2000, protein: 90, meals: 2 },
    floor: 1200,
    proteinMaxShare: GOAL_RULES.proteinMaxShare,
    adjustCalories: true,
  });
  assert.equal(near.adjustment, -60);
  assert.equal(near.calories, 1200);
});

test("IMC abaixo de 18,5: a meta do dia nunca diminui, só sobe (qualquer objetivo)", () => {
  // 48 kg, 165 cm (IMC 17,6): perder peso vira manutenção; comer mais ontem não recria um déficit.
  for (const goal of ["perder", "manter"] as const) {
    const p: Profile = { ...base(), goal, weight: 48 };
    const baseCalories = goalsFor(p, DATE).calories!;
    const over = dailyTargets(stateWith(p, day(YESTERDAY, baseCalories + 1500)), DATE);
    assert.equal(over.adjustment, 0);
    assert.equal(over.calories, baseCalories);
    assert.equal(over.adjustmentNote, null);
    // Comer menos ontem ainda sobe a meta de hoje, dentro dos tetos.
    const under = dailyTargets(stateWith(p, day(YESTERDAY, 600)), DATE);
    const cap = Math.min(Math.round(baseCalories * GOAL_RULES.adaptive.maxShare), GOAL_RULES.adaptive.maxKcal);
    assert.equal(under.adjustment, cap);
    assert.equal(under.calories, baseCalories + cap);
  }
  // Proteína baixa ontem ainda sobe hoje, mesmo com calorias acima: a troca não baixa a meta.
  const low = dailyTargets(stateWith({ ...base(), goal: "perder", weight: 48 }, day(YESTERDAY, 3000, 10)), DATE);
  assert.equal(low.adjustment, 0);
  assert.ok(low.proteinBoost > 0);
});

test("carboidratos nunca abaixo de 50% da base; o ajuste em kcal acompanha", () => {
  const result = adaptiveAdjustment({
    today: { calories: 1600, protein: 140, carbs: 70 },
    yesterday: { calories: 1600, protein: 140 },
    eaten: { calories: 2400, protein: 140, meals: 2 },
    floor: 1200,
    proteinMaxShare: GOAL_RULES.proteinMaxShare,
    adjustCalories: true,
  });
  assert.equal(result.carbs, 35);
  assert.equal(result.adjustment, -140);
  assert.equal(result.calories, 1460);
  assert.equal(result.protein, 140);
});

test("proteína nunca diminui, mesmo com calorias acima ontem", () => {
  const p = base();
  const target = dailyTargets(stateWith(p, day(YESTERDAY, 3000, 250)), DATE);
  assert.ok(target.adjustment < 0);
  assert.equal(target.protein, BASE.protein);
  assert.equal(target.proteinBoost, 0);
});

test("proteína abaixo de 80% ontem: hoje +10% (até 20 g), trocada por carboidratos sem mudar as calorias", () => {
  const p = base();
  const target = dailyTargets(stateWith(p, day(YESTERDAY, BASE.calories, 40)), DATE);
  // round(8,6) = 9 g; calorias iguais; carboidratos −9 g.
  assert.equal(target.proteinBoost, 9);
  assert.equal(target.protein, BASE.protein + 9);
  assert.equal(target.carbs, BASE.carbs - 9);
  assert.equal(target.calories, BASE.calories);
  assert.equal(target.adjustment, 0);
  assert.equal(target.adjustmentNote, PROTEIN_BOOST_NOTE);
  // 80% exatos não contam como baixa.
  const enough = dailyTargets(stateWith(p, day(YESTERDAY, BASE.calories, 68.8)), DATE);
  assert.equal(enough.proteinBoost, 0);
  // No máximo 20 g e respeitando o teto de 35% (40% com caneta) das calorias.
  const input = {
    yesterday: { calories: 2000, protein: 160 },
    eaten: { calories: 2000, protein: 50, meals: 2 },
    floor: 1200,
    adjustCalories: true,
  };
  const capped = adaptiveAdjustment({
    ...input,
    today: { calories: 3000, protein: 250, carbs: 300 },
    yesterday: { calories: 3000, protein: 250 },
    proteinMaxShare: GOAL_RULES.penProteinMaxShare,
  });
  assert.equal(capped.proteinBoost, GOAL_RULES.adaptive.proteinBoostMaxG);
  const share = adaptiveAdjustment({
    ...input,
    today: { calories: 2000, protein: 170, carbs: 200 },
    proteinMaxShare: GOAL_RULES.proteinMaxShare,
  });
  // floor(2000 × 0,35 / 4) = 175 → só 5 g cabem.
  assert.equal(share.proteinBoost, 5);
  const pen = adaptiveAdjustment({
    ...input,
    today: { calories: 2000, protein: 170, carbs: 200 },
    proteinMaxShare: GOAL_RULES.penProteinMaxShare,
  });
  assert.equal(pen.proteinBoost, 17);
});

test("calorias acima e proteína baixa ontem: os dois ajustes juntos, numa frase sem culpa", () => {
  const target = dailyTargets(stateWith(base(), day(YESTERDAY, 2500, 30)), DATE);
  assert.ok(target.adjustment < 0);
  assert.equal(target.proteinBoost, 9);
  assert.equal(target.carbs, BASE.carbs + Math.round(target.adjustment / 4) - 9);
  assert.match(target.adjustmentNote!, /um pouco menor para equilibrar ontem/);
  assert.match(target.adjustmentNote!, /proteína está um pouco maior/);
});

test("só ontem, comparado à meta-base de ontem: sem encadear ajustes nem oscilar", () => {
  const p = base();
  // Anteontem bem acima: ontem teve a meta reduzida, mas ontem comeu a meta-base → hoje sem ajuste.
  const state = stateWith(p, [...day(BEFORE_YESTERDAY, 3500), ...day(YESTERDAY, BASE.calories)]);
  assert.equal(dailyTargets(state, YESTERDAY).adjustment, -195);
  const today = dailyTargets(state, DATE);
  assert.equal(today.adjustment, 0);
  assert.equal(today.calories, BASE.calories);
  // Dias passados mostram o ajuste recalculado daquele dia.
  assert.equal(dailyTargets(state, YESTERDAY).calories, BASE.calories - 195);
});

test("outra data (Diário em dia passado): a frase diz 'Neste dia', nunca 'Hoje'", () => {
  const p = base();
  const state = stateWith(p, [...day(BEFORE_YESTERDAY, 3500, 20)]);
  const past = dailyTargets(state, YESTERDAY, DATE);
  assert.equal(past.adjustment, -195);
  assert.equal(
    past.adjustmentNote,
    "Neste dia a meta é um pouco menor para equilibrar o dia anterior (195 kcal a menos). Neste dia a proteína é um pouco maior para recuperar a do dia anterior.",
  );
  assert.doesNotMatch(past.adjustmentNote!, /Hoje|ontem/);
  // Números e metas iguais aos de quem vê o dia como hoje; só a frase muda.
  const asToday = dailyTargets(state, YESTERDAY, YESTERDAY);
  assert.deepEqual({ ...past, adjustmentNote: null }, { ...asToday, adjustmentNote: null });
  assert.match(asToday.adjustmentNote!, /^Hoje a meta está um pouco menor para equilibrar ontem/);
  const higher = dailyTargets(stateWith(p, day(BEFORE_YESTERDAY, 600)), YESTERDAY, DATE);
  assert.match(higher.adjustmentNote!, /^Neste dia a meta é um pouco maior porque no dia anterior você comeu menos/);
});

test("'Ocultar calorias': sem ajuste de calorias nem carboidratos; a proteína ainda pode subir", () => {
  const p: Profile = { ...base(), hideCalories: true };
  const over = dailyTargets(stateWith(p, day(YESTERDAY, 3500)), DATE);
  assert.deepEqual(over, stable(goalsFor(p, DATE)));
  const low = dailyTargets(stateWith(p, day(YESTERDAY, 3500, 20)), DATE);
  assert.equal(low.adjustment, 0);
  assert.equal(low.calories, BASE.calories);
  assert.equal(low.proteinBoost, 9);
  assert.equal(low.adjustmentNote, PROTEIN_BOOST_NOTE);
  assert.doesNotMatch(low.adjustmentNote!, /kcal|\d/);
});

test("preferência 'Ajuste dinâmico das metas' desligada: meta-base sempre", () => {
  const p = base();
  const state = { ...stateWith(p, day(YESTERDAY, 3500, 10)), adaptiveTargets: false };
  assert.deepEqual(dailyTargets(state, DATE), stable(goalsFor(p, DATE)));
});

test("metas manuais (números do profissional) nunca são ajustadas", () => {
  const all: Profile = {
    ...base(),
    manualCalories: 1250,
    manualProtein: 90,
    manualCarbs: 140,
    manualFat: 35,
    manualWater: 2000,
  };
  for (const consumed of [350, 1650, 3000]) {
    const target = dailyTargets(stateWith(all, day(YESTERDAY, consumed, 10)), DATE);
    assert.equal(target.calories, 1250);
    assert.equal(target.baseCalories, 1250);
    assert.equal(target.protein, 90);
    assert.equal(target.carbs, 140);
    assert.equal(target.fat, 35);
    assert.equal(target.water, 2000);
    assert.equal(target.strategy, "manual");
    assert.equal(target.adjustment, 0);
    assert.equal(target.proteinBoost, 0);
    assert.equal(target.adjustmentNote, null);
  }
  // Basta um macro manual para a meta ficar como o profissional definiu.
  const onlyProtein: Profile = { ...base(), manualProtein: 120 };
  const target = dailyTargets(stateWith(onlyProtein, day(YESTERDAY, 3000, 10)), DATE);
  assert.deepEqual(target, stable(goalsFor(onlyProtein, DATE)));
});

test("metas diárias respeitam o histórico e permanecem indefinidas antes do primeiro perfil", () => {
  const oldProfile = { ...base(), manualCalories: 1700 };
  const currentProfile = { ...oldProfile, manualCalories: 1900 };
  const state = {
    ...stateWith(currentProfile, day(YESTERDAY, 350)),
    goalHistory: [
      { date: "2026-09-10", profile: currentProfile },
      { date: "2026-09-01", profile: oldProfile },
    ],
  };
  for (const date of ["2026-08-31", YESTERDAY, DATE])
    assert.deepEqual(dailyTargets(state, date), stable(goalsForDate(state, date)));
  assert.equal(dailyTargets(state, "2026-08-31").calories, null);
  assert.equal(dailyTargets(state, YESTERDAY).calories, 1700);
  assert.equal(dailyTargets(state, DATE).calories, 1900);
  // Ontem sem meta (antes do primeiro perfil): nada a comparar.
  const first = { ...stateWith(base(), day("2026-08-31", 3500, 10)) };
  assert.equal(dailyTargets(first, "2026-09-01").adjustment, 0);
  assert.equal(dailyTargets(first, "2026-09-01").proteinBoost, 0);
});

test("perfis calmos ou sensíveis e metas nulas (avaliação individual) nunca têm ajuste", () => {
  for (const change of [
    // Perfil antigo (só texto livre) e condição da lista que pede avaliação.
    { conditionTags: [], conditions: "Diabetes tipo 2" },
    { conditionTags: ["insuficiencia_cardiaca" as const] },
    { pregnancy: "gestacao" as const },
    { eatingDisorder: "sim" as const },
    { sex: "nao_informado" as const },
    { birthDate: "2015-06-15" },
  ]) {
    const p = { ...base(), ...change };
    const target = dailyTargets(stateWith(p, day(YESTERDAY, 350, 5)), DATE);
    assert.equal(target.calories, null);
    assert.equal(target.protein, null);
    assert.equal(target.carbs, null);
    assert.equal(target.fat, null);
    assert.equal(target.adjustment, 0);
    assert.equal(target.proteinBoost, 0);
    assert.equal(target.adjustmentNote, null);
    assert.ok(target.reason);
  }
  // Perfil atual sensível com metas antigas no histórico: o cuidado de hoje vale.
  const old = base();
  const state = {
    ...stateWith({ ...old, eatingDisorder: "sim" }, day(YESTERDAY, 3500, 5)),
    goalHistory: [{ date: "2026-09-01", profile: old }],
  };
  assert.deepEqual(dailyTargets(state, DATE), stable(goalsFor(old, DATE)));
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
