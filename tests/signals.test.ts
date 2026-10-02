import { test } from "node:test";
import assert from "node:assert/strict";
import { goalsForDate, initialState, shiftDate } from "../src/lib/domain";
import {
  dismissSignal,
  isCoolingDown,
  signalBriefs,
  signalFor,
  signals,
  SIGNAL_COOLDOWN_DAYS,
  type Signal,
} from "../src/lib/signals";
import {
  profileSchema,
  type AppState,
  type DiaryEntry,
  type Measurement,
  type Profile,
} from "../src/types";
import { profileFixture } from "./fixtures";

const TODAY = "2026-09-30";
const day = (n: number) => shiftDate(TODAY, -n);

/** Metas automáticas (sem calorias manuais), água manual de 2.000 ml. */
function adult(over: Partial<Profile> = {}): Profile {
  return profileSchema.parse({ ...profileFixture(), manualCalories: null, ...over });
}

/** Meta vigente desde antes da janela (goalHistory fixo); sem medições salvo quando pedido. */
function stateWith(
  profile: Profile,
  diary: DiaryEntry[],
  extra: Partial<AppState> = {},
): AppState {
  return {
    ...initialState(),
    profile,
    diary,
    measurements: [],
    goalHistory: [{ date: "2026-01-01", profile }],
    ...extra,
  };
}

function entry(date: string, time: string, fields: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: `${date}-${time}-${fields.type ?? "refeicao"}`,
    userId: "u",
    date,
    time,
    createdAt: `${date}T${time}:00`,
    updatedAt: `${date}T${time}:00`,
    type: "refeicao",
    title: "Refeição",
    description: "",
    ...fields,
  };
}
/** Duas refeições no dia, somando as calorias e a proteína dadas. */
const twoMeals = (date: string, calories: number, protein: number): DiaryEntry[] => [
  entry(date, "08:00", { calories: calories / 2, macros: { protein: protein / 2, carbs: 0, fat: 0 } }),
  entry(date, "13:00", { calories: calories / 2, macros: { protein: protein / 2, carbs: 0, fat: 0 } }),
];
const water = (date: string, ml: number) =>
  entry(date, "10:00", { type: "agua", title: "Água", amountMl: ml });
const wellbeing = (date: string, fields: Partial<DiaryEntry>) =>
  entry(date, "21:00", { type: "bem_estar", title: "Bem-estar", rating: 3, ...fields });
const weighIn = (date: string, weight: number): Measurement => ({
  id: `m-${date}`,
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança",
});

const base = adult();
const KCAL = goalsForDate(stateWith(base, []), day(1)).calories!;
const PROTEIN = goalsForDate(stateWith(base, []), day(1)).protein!;
/** Dias 1..n antes de hoje, cada um com duas refeições. */
const mealDays = (n: number, calories: number, protein: number) =>
  Array.from({ length: n }, (_, i) => twoMeals(day(i + 1), calories, protein)).flat();

const NO_GUILT = /atrasad|excesso|compens|culpa|dose|aplica/i;
function assertCalm(signal: Signal) {
  assert.ok(signal.title.split(/\s+/).length <= 7, signal.title);
  assert.doesNotMatch(`${signal.title} ${signal.body}`, NO_GUILT);
}
const ids = (list: Signal[]) => list.map((s) => s.id);

test("sem perfil, nenhum sinal", () => {
  assert.deepEqual(signals({ ...initialState(), profile: null }, TODAY), []);
});

test("perfis calmos (transtorno alimentar, gestação, menor de 18) nunca recebem sinais", () => {
  const diary = [...mealDays(5, KCAL * 1.4, PROTEIN * 0.3), ...[1, 2, 3].map((n) => water(day(n), 200))];
  for (const over of [
    { eatingDisorder: "sim" },
    { eatingDisorder: "nao_informado" },
    { pregnancy: "gestacao" },
    { birthDate: "2012-01-01" },
  ] as Partial<Profile>[]) {
    const state = stateWith(adult(over), diary);
    assert.deepEqual(signals(state, TODAY), [], JSON.stringify(over));
    assert.deepEqual(signalBriefs(state, TODAY), []);
  }
});

test("pausa nos registros: ontem e anteontem vazios depois de já ter registrado", () => {
  const state = stateWith(base, twoMeals(day(4), KCAL, PROTEIN));
  const signal = signalFor(state, TODAY, "hoje");
  assert.equal(signal?.id, "registro-pausa");
  assert.equal(signal?.tone, "info");
  assertCalm(signal!);
  // Nunca registrou antes: nada a retomar. Registrou ontem: sem pausa.
  assert.equal(signalFor(stateWith(base, []), TODAY, "hoje"), null);
  assert.notEqual(
    signalFor(stateWith(base, [...twoMeals(day(4), KCAL, PROTEIN), water(day(1), 2000)]), TODAY, "hoje")?.id,
    "registro-pausa",
  );
});

test("água baixa em 3 dos últimos 5 dias com água registrada; nunca com restrição hídrica", () => {
  const diary = [1, 2, 3].map((n) => water(day(n), 1000));
  const signal = signalFor(stateWith(base, diary), TODAY, "hoje");
  assert.equal(signal?.id, "agua-baixa");
  assertCalm(signal!);
  assert.ok(signal?.action?.prompt);
  assert.equal(signalFor(stateWith(base, diary.slice(0, 2)), TODAY, "hoje"), null);
  assert.equal(signalFor(stateWith(adult({ fluidRestriction: "sim" }), diary), TODAY, "hoje"), null);
  // Dia sem água registrada não conta como água baixa.
  assert.equal(signalFor(stateWith(base, mealDays(3, KCAL, PROTEIN)), TODAY, "hoje")?.id, undefined);
});

test("reforço: cinco dias seguidos com refeição; a água baixa vem antes na prioridade", () => {
  const streak = mealDays(5, KCAL, PROTEIN);
  const signal = signalFor(stateWith(base, streak), TODAY, "hoje");
  assert.equal(signal?.id, "sequencia-boa");
  assert.equal(signal?.tone, "positive");
  assertCalm(signal!);
  const withWater = [...streak, ...[1, 2, 3].map((n) => water(day(n), 900))];
  assert.equal(signalFor(stateWith(base, withWater), TODAY, "hoje")?.id, "agua-baixa");
});

test("energia acima ou abaixo da meta-base em 3+ dias, só com 2+ refeições no dia", () => {
  const above = signalFor(stateWith(base, mealDays(3, KCAL * 1.3, PROTEIN)), TODAY, "diario");
  assert.equal(above?.id, "energia-acima");
  assertCalm(above!);
  assert.match(above!.body, /^Nos últimos 3 dias registrados, o consumo passou da meta\./);
  const below = signalFor(stateWith(base, mealDays(3, KCAL * 0.6, PROTEIN)), TODAY, "diario");
  assert.equal(below?.id, "energia-abaixo");
  assertCalm(below!);
  // Dentro da tolerância de 10% (e proteína nem baixa nem em dia): nada no Diário.
  assert.equal(signalFor(stateWith(base, mealDays(5, KCAL * 1.08, PROTEIN * 0.85)), TODAY, "diario"), null);
  // Uma refeição por dia não conta (diário incompleto não vira padrão).
  const single = [1, 2, 3].map((n) => entry(day(n), "12:00", { calories: KCAL * 2, macros: { protein: PROTEIN, carbs: 0, fat: 0 } }));
  assert.equal(signalFor(stateWith(base, single), TODAY, "diario"), null);
});

test("com calorias ocultas nenhum sinal de energia, nem implícito; a proteína ainda aparece", () => {
  const profile = adult({ hideCalories: true });
  assert.equal(signalFor(stateWith(profile, mealDays(4, KCAL * 1.4, PROTEIN * 0.85)), TODAY, "diario"), null);
  const protein = signalFor(stateWith(profile, mealDays(4, KCAL * 1.4, PROTEIN * 0.5)), TODAY, "diario");
  assert.equal(protein?.id, "proteina-baixa");
  assert.doesNotMatch(signalBriefs(stateWith(profile, mealDays(4, KCAL * 1.4, PROTEIN)), TODAY).join(" "), /meta|kcal|calor/i);
});

test("energia compara com a meta-base de cada dia, não com a meta já ajustada", () => {
  // Base: só 2 dias acima. Contra a meta ajustada (menor depois de um dia alto) seriam 4.
  const pattern = [1.05, 1.05, 1.3, 1.05, 1.3];
  const diary = pattern.flatMap((ratio, i) => twoMeals(day(i + 1), KCAL * ratio, PROTEIN));
  const state = stateWith(base, diary, { adaptiveTargets: true });
  assert.notEqual(signalFor(state, TODAY, "diario")?.id, "energia-acima");
});

test("proteína baixa em 3+ dias e reforço com proteína em dia", () => {
  const low = signalFor(stateWith(base, mealDays(3, KCAL, PROTEIN * 0.5)), TODAY, "diario");
  assert.equal(low?.id, "proteina-baixa");
  assertCalm(low!);
  const good = signalFor(stateWith(base, mealDays(3, KCAL, PROTEIN)), TODAY, "diario");
  assert.equal(good?.id, "proteina-em-dia");
  assert.equal(good?.tone, "positive");
  // Energia vem antes da proteína no Diário.
  assert.equal(signalFor(stateWith(base, mealDays(3, KCAL * 1.4, PROTEIN * 0.5)), TODAY, "diario")?.id, "energia-acima");
});

test("caneta: o alerta de ingestão vira o sinal da Seringa, sem repetir no Diário", () => {
  const pen = adult({
    weightLossPen: "sim",
    weightLossPenName: "Caneta X",
    weightLossPenDose: "conforme a receita",
    weightLossPenPerMonth: 4,
  });
  // Proteína baixa com comida suficiente: alerta "protein" da caneta, sem "proteina-baixa" no Diário.
  const protein = stateWith(pen, mealDays(3, KCAL, PROTEIN * 0.5));
  assert.equal(signalFor(protein, TODAY, "seringa")?.id, "caneta-ingestao");
  assert.equal(signalFor(protein, TODAY, "seringa")?.title, "Proteína abaixo do combinado");
  assert.notEqual(signalFor(protein, TODAY, "diario")?.id, "proteina-baixa");
  // Comeu pouco e marcou náusea: o texto fala do enjoo, sem números nem dose.
  const nausea = stateWith(pen, [...mealDays(3, 800, 60), wellbeing(day(2), { tags: ["Náusea"] })]);
  const signal = signalFor(nausea, TODAY, "seringa");
  assert.equal(signal?.title, "Enjoo e pouco apetite");
  assert.doesNotMatch(`${signal!.title} ${signal!.body}`, /\d/);
  assertCalm(signal!);
  assert.match(signal!.body, /fale com quem prescreveu/);
  // Comer pouco já aparece na Seringa: o Diário não repete "abaixo da meta".
  assert.notEqual(signalFor(nausea, TODAY, "diario")?.id, "energia-abaixo");
  // Sem caneta, nada na Seringa.
  assert.equal(signalFor(stateWith(base, mealDays(3, 800, 60)), TODAY, "seringa"), null);
});

test("descanso: cansaço, estresse ou sono curto em 3 dos últimos 7 dias", () => {
  const diary = [
    wellbeing(day(0), { tags: ["Cansaço"] }),
    wellbeing(day(2), { tags: ["Estresse"] }),
    wellbeing(day(5), { sleepHours: 5 }),
  ];
  const signal = signalFor(stateWith(base, diary), TODAY, "evolucao");
  assert.equal(signal?.id, "sono-estresse");
  assertCalm(signal!);
  assert.equal(signalFor(stateWith(base, diary.slice(0, 2)), TODAY, "evolucao"), null);
  assert.equal(signalFor(stateWith(base, [...diary.slice(0, 2), wellbeing(day(9), { tags: ["Cansaço"] })]), TODAY, "evolucao"), null);
});

test("peso: tendência só em palavras e nada com números do corpo ocultos", () => {
  const measurements = [weighIn(day(20), 80), weighIn(day(10), 79), weighIn(day(1), 78)];
  const losing = adult({ goal: "perder" });
  const signal = signalFor(stateWith(losing, [], { measurements }), TODAY, "evolucao");
  assert.equal(signal?.id, "peso-tendencia");
  assert.equal(signal?.title, "Seu peso vem descendo aos poucos");
  assert.equal(signal?.tone, "positive");
  assert.doesNotMatch(`${signal!.title} ${signal!.body} ${signal!.action?.prompt}`, /\d/);
  assertCalm(signal!);
  // Manter e subindo: informativo, sem cobrança.
  const up = [weighIn(day(20), 76), weighIn(day(10), 77), weighIn(day(1), 78)];
  const rising = signalFor(stateWith(base, [], { measurements: up }), TODAY, "evolucao");
  assert.equal(rising?.title, "Seu peso subiu um pouco");
  assert.equal(rising?.tone, "info");
  assert.equal(
    signalFor(stateWith(base, [], { measurements: up.map((m) => ({ ...m, weight: 78.2 })) }), TODAY, "evolucao")?.title,
    "Seu peso ficou estável",
  );
  assert.equal(signalFor(stateWith(adult({ goal: "perder", hideBodyNumbers: true }), [], { measurements }), TODAY, "evolucao"), null);
  // Poucos pontos ou menos de 14 dias: sem tendência.
  assert.equal(signalFor(stateWith(losing, [], { measurements: measurements.slice(1) }), TODAY, "evolucao"), null);
  const short = [weighIn(day(10), 80), weighIn(day(5), 79), weighIn(day(1), 78)];
  assert.equal(signalFor(stateWith(losing, [], { measurements: short }), TODAY, "evolucao"), null);
  // O descanso vem antes do peso na Evolução.
  const tired = [0, 1, 2].map((n) => wellbeing(day(n), { tags: ["Ansiedade"] }));
  assert.equal(signalFor(stateWith(losing, tired, { measurements }), TODAY, "evolucao")?.id, "sono-estresse");
});

test("no máximo um sinal por tela; sem tela, um por tela na ordem fixa", () => {
  const diary = [...mealDays(5, KCAL * 1.4, PROTEIN * 0.5), ...[0, 1, 2].map((n) => wellbeing(day(n), { tags: ["Cansaço"] }))];
  const state = stateWith(base, diary);
  assert.deepEqual(ids(signals(state, TODAY)), ["sequencia-boa", "energia-acima", "sono-estresse"]);
  assert.deepEqual(ids(signals(state, TODAY, "diario")), ["energia-acima"]);
  assert.deepEqual(signals(state, TODAY, "seringa"), []);
  assert.deepEqual(signalBriefs(state, TODAY), [
    "5 dias seguidos de registros",
    "Alguns dias acima da meta",
    "Proteína abaixo do combinado",
    "Cuidar do descanso esta semana",
  ]);
});

test("dispensar pausa o sinal por 3 dias e mostra o próximo da prioridade", () => {
  const state = stateWith(base, mealDays(5, KCAL * 1.4, PROTEIN * 0.5));
  assert.equal(signalFor(state, TODAY, "diario")?.id, "energia-acima");
  const dismissed = dismissSignal(state, "energia-acima", TODAY);
  assert.equal(dismissed.signalDismissals["energia-acima"], TODAY);
  assert.equal(state.signalDismissals["energia-acima"], undefined, "não muda o estado original");
  assert.equal(signalFor(dismissed, TODAY, "diario")?.id, "proteina-baixa");
  for (let n = 1; n < SIGNAL_COOLDOWN_DAYS; n++)
    assert.ok(isCoolingDown(dismissed.signalDismissals, "energia-acima", shiftDate(TODAY, n)));
  assert.ok(!isCoolingDown(dismissed.signalDismissals, "energia-acima", shiftDate(TODAY, SIGNAL_COOLDOWN_DAYS)));
  // Dispensas vencidas saem do registro na próxima dispensa.
  const later = dismissSignal(dismissed, "proteina-baixa", shiftDate(TODAY, SIGNAL_COOLDOWN_DAYS));
  assert.deepEqual(Object.keys(later.signalDismissals), ["proteina-baixa"]);
});

test("IMC abaixo de 18,5: peso descendo nunca é elogiado e não há convite a comer menos", () => {
  const thin = adult({ goal: "perder", weight: 48 });
  const measurements = [weighIn(day(20), 50), weighIn(day(10), 49), weighIn(day(1), 48)];
  const trend = signalFor(stateWith(thin, [], { measurements }), TODAY, "evolucao");
  assert.equal(trend?.id, "peso-tendencia");
  assert.equal(trend?.tone, "info");
  assert.doesNotMatch(trend!.body, /sentido do seu objetivo/);
  assert.match(trend!.body, /conversar com quem acompanha você/);
  assert.doesNotMatch(`${trend!.title} ${trend!.body}`, /\d/);
  assertCalm(trend!);
  // Acima da meta (de manutenção) em vários dias: nada de "refeições que saciam mais".
  const kcal = goalsForDate(stateWith(thin, []), day(1)).calories!;
  const protein = goalsForDate(stateWith(thin, []), day(1)).protein!;
  const above = stateWith(thin, mealDays(3, kcal * 1.3, protein));
  assert.notEqual(signalFor(above, TODAY, "diario")?.id, "energia-acima");
  assert.ok(!signalBriefs(above, TODAY).includes("Alguns dias acima da meta"));
  // Com IMC adequado, o mesmo padrão continua aparecendo.
  assert.equal(signalFor(stateWith(base, mealDays(3, KCAL * 1.3, PROTEIN)), TODAY, "diario")?.id, "energia-acima");
});

test("descanso: quem usa caneta marca cansaço como sintoma e também recebe o sinal", () => {
  const pen = adult({
    weightLossPen: "sim",
    weightLossPenName: "Caneta X",
    weightLossPenDose: "conforme a receita",
    weightLossPenPerMonth: 4,
  });
  const tired = [0, 2, 4, 6].map((n) => wellbeing(day(n), { symptoms: [{ key: "cansaco", intensity: 2 }] }));
  const signal = signalFor(stateWith(pen, tired), TODAY, "evolucao");
  assert.equal(signal?.id, "sono-estresse");
  // Outro sintoma (sem relação com descanso) não conta.
  const other = [0, 2, 4].map((n) => wellbeing(day(n), { symptoms: [{ key: "azia", intensity: 1 }] }));
  assert.equal(signalFor(stateWith(pen, other), TODAY, "evolucao"), null);
});

test("caneta com restrição de líquidos: o sinal da Seringa não fala em água", () => {
  for (const fluidRestriction of ["sim", "nao_sei"] as const) {
    const pen = adult({
      fluidRestriction,
      weightLossPen: "sim",
      weightLossPenName: "Caneta X",
      weightLossPenDose: "conforme a receita",
      weightLossPenPerMonth: 4,
    });
    const nausea = stateWith(pen, [...mealDays(3, 800, 60), wellbeing(day(2), { tags: ["Náusea"] })]);
    const signal = signalFor(nausea, TODAY, "seringa");
    assert.equal(signal?.title, "Enjoo e pouco apetite", fluidRestriction);
    assert.doesNotMatch(signal!.body, /água/);
    const plain = signalFor(stateWith(pen, mealDays(3, 800, 60)), TODAY, "seringa");
    assert.equal(plain?.id, "caneta-ingestao");
    assert.doesNotMatch(plain!.body, /água/);
  }
});

test("caneta com condição que pede avaliação individual: nenhum sinal de ingestão", () => {
  const pen = adult({
    conditionTags: ["doenca_renal"],
    conditions: "",
    weightLossPen: "sim",
    weightLossPenName: "Caneta X",
    weightLossPenDose: "conforme a receita",
    weightLossPenPerMonth: 4,
  });
  assert.equal(signalFor(stateWith(pen, mealDays(5, 600, 10)), TODAY, "seringa"), null);
});
