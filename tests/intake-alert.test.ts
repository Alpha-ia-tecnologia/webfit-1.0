import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTargets, initialState, shiftDate } from "../src/lib/domain";
import { intakeAlert } from "../src/lib/intake-alert";
import { profileSchema, type AppState, type DiaryEntry, type Profile } from "../src/types";
import { profileFixture } from "./fixtures";

const TODAY = "2026-09-30";

function penProfile(over: Partial<Profile> = {}): Profile {
  return profileSchema.parse({
    ...profileFixture(),
    manualCalories: null,
    weightLossPen: "sim",
    weightLossPenName: "Caneta X",
    weightLossPenDose: "conforme a receita",
    weightLossPenPerMonth: 4,
    ...over,
  });
}

/** Estado com a meta vigente desde antes da janela olhada (goalHistory fixo, sem depender do relógio). */
function stateWith(profile: Profile, diary: DiaryEntry[]): AppState {
  return {
    ...initialState(),
    profile,
    diary,
    goalHistory: [{ date: "2026-01-01", profile }],
  };
}

function meal(date: string, time: string, calories: number, protein: number): DiaryEntry {
  return {
    id: `${date}-${time}`,
    userId: "u",
    date,
    time,
    createdAt: `${date}T${time}:00`,
    updatedAt: `${date}T${time}:00`,
    type: "refeicao",
    title: "Refeição",
    description: "",
    calories,
    macros: { protein, carbs: 0, fat: 0 },
  };
}

/** `days` dias antes de hoje, cada um com duas refeições do tamanho dado. */
function days(count: number, calories: number, protein: number): DiaryEntry[] {
  return Array.from({ length: count }, (_, i) => shiftDate(TODAY, -(i + 1))).flatMap((date) => [
    meal(date, "08:00", calories / 2, protein / 2),
    meal(date, "13:00", calories / 2, protein / 2),
  ]);
}

const NUMBERS = /\d/;
const DOSE = /dose|aplica|mg\b/i;
/** A orientação vai na folha do Resumo: até duas frases e 140 caracteres. */
const SHEET_MAX = 140;

test("sem caneta não há alerta, mesmo comendo pouco", () => {
  const state = stateWith(penProfile({ weightLossPen: "nao" }), days(5, 600, 10));
  assert.equal(intakeAlert(state, TODAY), null);
});

test("caneta: três dias com pouca comida pedem refeições menores, sem números nem dose", () => {
  const alert = intakeAlert(stateWith(penProfile(), days(3, 800, 80)), TODAY);
  assert.equal(alert?.kind, "low_intake");
  assert.ok(alert!.title.split(/\s+/).length <= 7);
  assert.ok(alert!.body.length <= SHEET_MAX, `${alert!.body.length} caracteres`);
  assert.doesNotMatch(`${alert!.title} ${alert!.body}`, NUMBERS);
  assert.doesNotMatch(`${alert!.title} ${alert!.body}`, DOSE);
  assert.match(alert!.body, /refeições menores e mais frequentes/);
  assert.match(alert!.body, /fale com quem prescreveu/);
});

test("pouca comida tem prioridade sobre a proteína baixa", () => {
  assert.equal(intakeAlert(stateWith(penProfile(), days(4, 700, 5)), TODAY)?.kind, "low_intake");
});

test("com calorias ocultas não há comparação com o piso; a proteína ainda é olhada", () => {
  const profile = penProfile({ hideCalories: true });
  // Proteína em dia (acima da meta, qualquer que seja a regra de g/kg): só o piso pesaria, e ele não entra.
  const goal = dailyTargets(stateWith(profile, []), shiftDate(TODAY, -1)).protein!;
  assert.equal(intakeAlert(stateWith(profile, days(4, 700, goal)), TODAY), null);
  assert.equal(intakeAlert(stateWith(profile, days(4, 700, 5)), TODAY)?.kind, "protein");
});

test("caneta: proteína abaixo de 70% da meta em três dias", () => {
  const profile = penProfile();
  const state = stateWith(profile, []);
  const goal = dailyTargets(state, shiftDate(TODAY, -1)).protein!;
  assert.ok(goal > 0);
  const low = intakeAlert(stateWith(profile, days(3, 1800, goal * 0.6)), TODAY);
  assert.equal(low?.kind, "protein");
  assert.equal(low?.title, "Proteína abaixo do combinado");
  assert.ok(low!.body.length <= SHEET_MAX, `${low!.body.length} caracteres`);
  assert.match(low!.body, /fonte de proteína em cada refeição/);
  assert.doesNotMatch(low!.body, NUMBERS);
  assert.doesNotMatch(low!.body, DOSE);
  assert.equal(intakeAlert(stateWith(profile, days(3, 1800, goal * 0.8)), TODAY), null);
});

test("menos de três dias com registro suficiente não gera alerta", () => {
  assert.equal(intakeAlert(stateWith(penProfile(), days(2, 600, 5)), TODAY), null);
  // Uma refeição só por dia não conta como dia registrado.
  const single = days(5, 600, 5).filter((e) => e.time === "08:00");
  assert.equal(intakeAlert(stateWith(penProfile(), single), TODAY), null);
});

test("só os cinco dias antes de hoje contam: hoje e dias antigos ficam de fora", () => {
  const old = Array.from({ length: 3 }, (_, i) => shiftDate(TODAY, -(i + 6))).flatMap((date) => [
    meal(date, "08:00", 300, 2),
    meal(date, "13:00", 300, 2),
  ]);
  const today = [meal(TODAY, "08:00", 300, 2), meal(TODAY, "13:00", 300, 2)];
  assert.equal(intakeAlert(stateWith(penProfile(), [...old, ...today]), TODAY), null);
});

test("perfis calmos nunca recebem o alerta", () => {
  const diary = days(5, 600, 5);
  for (const over of [
    { pregnancy: "gestacao" },
    { eatingDisorder: "sim" },
    { birthDate: "2012-05-10" },
  ] as Partial<Profile>[]) {
    assert.equal(intakeAlert(stateWith(penProfile(over), diary), TODAY), null, JSON.stringify(over));
  }
});

test("sem perfil não há alerta", () => {
  assert.equal(intakeAlert({ ...initialState(), diary: days(5, 600, 5) }, TODAY), null);
});

test("condições que pedem avaliação individual (metas nulas) nunca recebem o alerta", () => {
  const BLOCKING = [
    "diabetes_tipo_1_insulina",
    "doenca_renal",
    "insuficiencia_cardiaca",
    "cancer_tratamento",
    "outra",
  ] as const;
  for (const tag of BLOCKING) {
    const profile = penProfile({ conditionTags: [tag], conditions: "Detalhes" });
    assert.equal(intakeAlert(stateWith(profile, days(5, 600, 5)), TODAY), null, tag);
    assert.equal(intakeAlert(stateWith(profile, days(5, 1800, 5)), TODAY), null, tag);
  }
  // Perfil antigo com texto livre que pede avaliação: também sem alerta.
  const legacy = penProfile({ conditionTags: [], conditions: "Doença renal crônica" });
  assert.equal(intakeAlert(stateWith(legacy, days(5, 600, 5)), TODAY), null);
  // Condição que permite metas automáticas continua recebendo.
  const allowed = penProfile({ conditionTags: ["hipertensao"] });
  assert.equal(intakeAlert(stateWith(allowed, days(5, 600, 5)), TODAY)?.kind, "low_intake");
});

test("restrição de líquidos (ou sem resposta): o alerta não fala em beber água", () => {
  for (const fluidRestriction of ["sim", "nao_sei"] as const) {
    const alert = intakeAlert(stateWith(penProfile({ fluidRestriction }), days(3, 800, 80)), TODAY);
    assert.equal(alert?.kind, "low_intake", fluidRestriction);
    assert.doesNotMatch(alert!.body, /água/);
    assert.ok(alert!.body.length <= SHEET_MAX, `${alert!.body.length} caracteres`);
  }
  const free = intakeAlert(stateWith(penProfile({ fluidRestriction: "nao" }), days(3, 800, 80)), TODAY);
  assert.match(free!.body, /beba água/);
});

test("comer a própria meta abaixo do piso não vira 'comeu pouco'", () => {
  // 71 anos, 50 kg, 150 cm, sedentária, perder: gasto 1.106 kcal ≤ piso → manutenção em 1.106.
  const profile = penProfile({
    birthDate: "1955-01-01",
    weight: 50,
    height: 150,
    activityLevel: "sedentario",
    goal: "perder",
  });
  const goal = dailyTargets(stateWith(profile, []), shiftDate(TODAY, -1)).calories!;
  assert.equal(goal, 1106);
  assert.equal(intakeAlert(stateWith(profile, days(3, 1120, 200)), TODAY), null);
  // Abaixo da própria meta, o alerta volta.
  assert.equal(intakeAlert(stateWith(profile, days(3, 900, 200)), TODAY)?.kind, "low_intake");
});
