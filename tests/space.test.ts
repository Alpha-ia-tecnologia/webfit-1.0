import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeDays,
  agentStatus,
  AUTO_GOALS,
  backupStatus,
  BMI_TICKS,
  bodyNumbers,
  bodySummary,
  canAdjustGoals,
  commitManualGoals,
  fmtInterval,
  fmtMonthYear,
  goalOrigin,
  heroFacts,
  goalRuler,
  goalSteppers,
  inventory,
  isCalmProfile,
  macroShares,
  memberSince,
  profileStats,
  quietLabel,
  withProfilePatch,
} from "../src/lib/space";
import { bmiGauge } from "../src/lib/body-metrics";
import { AI_CONSENT_VERSION } from "../src/lib/consent";
import { goalsFor, localDate, shiftDate, uid, withMeasurements } from "../src/lib/domain";
import { fmtDayMonth } from "../src/lib/format";
import type { AppState, Measurement, ToastAction } from "../src/types";
import { stateFixture } from "./fixtures";

const water = (state: AppState, date: string) =>
  ({
    id: uid(),
    userId: state.userId,
    date,
    time: "10:00",
    type: "agua",
    title: "Água",
    description: "",
    amountMl: 250,
  }) as AppState["diary"][number];

test("mês e ano curtos em português", () => {
  assert.equal(fmtMonthYear("2026-09-24"), "set/2026");
  assert.equal(fmtMonthYear("2027-01-02"), "jan/2027");
});

test("desde quando: a data mais antiga entre metas, medições e diário", () => {
  const state = stateFixture();
  const today = localDate();
  state.diary = [water(state, shiftDate(today, -40))];
  assert.equal(memberSince(state), shiftDate(today, -40));
  assert.equal(
    memberSince({ ...state, diary: [], measurements: [], goalHistory: [] }),
    null,
  );
});

test("dias ativos contam datas distintas com registro na janela de 30 dias", () => {
  const state = stateFixture();
  const today = localDate();
  state.diary = [
    water(state, today),
    water(state, today),
    water(state, shiftDate(today, -29)),
    water(state, shiftDate(today, -30)),
  ];
  assert.equal(activeDays(state, today), 2);
  assert.equal(profileStats(state, today)[0], "2 de 30 dias");
});

test("inventário lista seis tipos de dado com contagem", () => {
  const items = inventory(stateFixture());
  assert.deepEqual(
    items.map((i) => i.key),
    ["diario", "medidas", "exames", "consultas", "mensagens", "combinados"],
  );
  assert.equal(items.find((i) => i.key === "exames")?.count, 0);
});

test("divisão dos macros pela energia soma 100 e some sem alguma meta", () => {
  const shares = macroShares({ protein: 115, carbs: 175, fat: 45 });
  assert.deepEqual(
    shares?.map((s) => s.percent),
    [29, 45, 26],
  );
  assert.equal(
    shares?.reduce((sum, s) => sum + s.percent, 0),
    100,
  );
  assert.equal(macroShares({ protein: 100, carbs: null, fat: 50 }), null);
});

test("régua só aparece com basal, meta e gasto", () => {
  assert.deepEqual(
    goalRuler({ basal: 1420, calories: 1645, expenditure: 1953 }),
    { basal: 1420, target: 1645, expenditure: 1953 },
  );
  assert.equal(
    goalRuler({ basal: null, calories: 1800, expenditure: null }),
    null,
  );
});

test("situação do backup: nenhum, recente e antigo", () => {
  const today = "2026-09-24";
  assert.deepEqual(backupStatus(null, today), {
    label: "Nenhum backup exportado ainda",
    tone: "attention",
  });
  assert.equal(backupStatus("inválido", today).tone, "attention");
  assert.deepEqual(
    backupStatus(new Date("2026-09-12T15:00:00").toISOString(), today),
    { label: "Último backup: há 12 dias", tone: "ok" },
  );
  assert.equal(
    backupStatus(new Date("2026-07-01T15:00:00").toISOString(), today).tone,
    "attention",
  );
});

test("trocar medições atualiza o perfil pela mais recente e o histórico do dia", () => {
  const state = stateFixture();
  const today = localDate();
  const base = state.measurements[0];
  const older = {
    ...base,
    id: "antiga",
    date: shiftDate(today, -10),
    weight: 80,
  };
  const both = withMeasurements(state, [older, base], today);
  assert.equal(both.profile?.weight, base.weight);
  const onlyOld = withMeasurements(both, [older], today);
  assert.equal(onlyOld.profile?.weight, 80);
  assert.equal(onlyOld.profile?.measurementDate, older.date);
  assert.equal(onlyOld.goalHistory.filter((h) => h.date === today).length, 1);
  assert.equal(
    onlyOld.goalHistory.find((h) => h.date === today)?.profile.weight,
    80,
  );
});

test("régua aceita meta acima do gasto (ganho) e abaixo do basal (meta manual)", () => {
  assert.deepEqual(
    goalRuler({ basal: 1500, calories: 2400, expenditure: 2100 }),
    { basal: 1500, target: 2400, expenditure: 2100 },
  );
  assert.deepEqual(
    goalRuler({ basal: 1500, calories: 1300, expenditure: 2000 }),
    { basal: 1500, target: 1300, expenditure: 2000 },
  );
});

test("selo das metas: definida por você, automática ou aguardando orientação", () => {
  const profile = stateFixture().profile!;
  assert.equal(goalOrigin(profile, goalsFor(profile)).label, "Definida por você");
  const auto = { ...profile, ...AUTO_GOALS };
  assert.equal(goalOrigin(auto, goalsFor(auto)).label, "Automática");
  // Só a água informada não torna as metas de energia e macros manuais.
  assert.equal(auto.manualWater, 2000);
  const pending = { ...auto, conditions: "Hipertensão" };
  assert.equal(goalOrigin(pending, goalsFor(pending)).key, "pending");
  assert.equal(canAdjustGoals(profile), true);
  assert.equal(canAdjustGoals({ ...profile, eatingDisorder: "sim" }), false);
  assert.equal(canAdjustGoals({ ...profile, pregnancy: "nao_informado" }), false);
});

test("folha de metas: sem energia com calorias ocultas e o + parte da estimativa", () => {
  const profile = { ...stateFixture().profile!, ...AUTO_GOALS };
  const steppers = goalSteppers(profile);
  assert.deepEqual(
    steppers.map((s) => s.field),
    ["manualCalories", "manualWater", "manualProtein", "manualCarbs", "manualFat"],
  );
  const goals = goalsFor(profile);
  const calories = steppers[0]!;
  assert.equal(calories.auto, goals.calories);
  assert.equal(calories.config.initial % calories.config.step, 0);
  assert.ok(Math.abs(calories.config.initial - goals.calories!) <= calories.config.step / 2);
  assert.equal(steppers[1]!.auto, null);
  assert.equal(steppers[2]!.auto, goals.protein);
  const hidden = goalSteppers({ ...profile, hideCalories: true });
  assert.ok(!hidden.some((s) => s.field === "manualCalories" || s.config.unit === "kcal"));
  // Valor salvo abaixo da faixa da folha: o − não salta para o mínimo.
  const low = goalSteppers({ ...profile, manualCalories: 600 })[0]!;
  assert.equal(low.config.min, 600);
});

test("salvar metas oferece Desfazer, que devolve perfil e histórico de antes", async () => {
  let state = stateFixture();
  const original = state;
  const toasts: { message?: string; action?: ToastAction }[] = [];
  const commit = async (update: (s: AppState) => AppState, message?: string, action?: ToastAction) => {
    state = update(state);
    toasts.push({ message, action });
    return true;
  };
  assert.equal(await commitManualGoals(commit, { manualProtein: 120 }, "Metas atualizadas."), true);
  assert.equal(state.profile!.manualProtein, 120);
  assert.equal(state.goalHistory.at(-1)!.profile.manualProtein, 120);
  assert.equal(toasts[0]!.message, "Metas atualizadas.");
  assert.equal(toasts[0]!.action?.label, "Desfazer");
  toasts[0]!.action!.onAction();
  await Promise.resolve();
  assert.deepEqual(state.profile, original.profile);
  assert.deepEqual(state.goalHistory, original.goalHistory);
  assert.doesNotMatch(toasts.map((t) => t.message).join(" "), /kcal|caloria/i);
});

const weighIn = (date: string, weight: number, over: Partial<Measurement> = {}): Measurement => ({
  id: uid(),
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança em casa",
  ...over,
});
const HEIGHT_TILE = { key: "height", label: "Altura", value: "165 cm", number: "165", unit: "cm" };
/** 9 pesagens semanais até hoje (a mais antiga fica fora das 8) e uma futura, que não conta. */
function withJourney(today: string): AppState {
  const weights = [77, 76.4, 75.8, 75.1, 74.6, 74, 73.5, 72.9, 72.4];
  const list = weights.map((w, i) => weighIn(shiftDate(today, -7 * (weights.length - 1 - i)), w));
  const state = withMeasurements(stateFixture(), list, today);
  return { ...state, measurements: [...state.measurements, weighIn(shiftDate(today, 3), 90)] };
}

test("Corpo: peso, variação das últimas 8 pesagens, IMC na régua neutra e medidas", () => {
  const today = localDate();
  const summary = bodySummary(withJourney(today), today)!;
  const first = shiftDate(today, -49);
  assert.equal(summary.weight, "72,4");
  assert.equal(summary.calm, false);
  assert.deepEqual(summary.trend, {
    values: [76.4, 75.8, 75.1, 74.6, 74, 73.5, 72.9, 72.4],
    delta: "−4 kg",
    since: `desde ${fmtDayMonth(first)}`,
    speech: `Variação de −4 kg desde ${fmtDayMonth(first)}, em 8 pesagens.`,
    chip: "−4,0 kg",
    direction: "down",
  });
  assert.deepEqual(summary.bmi, { value: "26,6", position: bmiGauge(72.4 / 1.65 ** 2)!.markerPercent });
  assert.deepEqual(summary.tiles, [HEIGHT_TILE]);
  assert.equal(summary.measured, "Medido hoje · Balança em casa");
  assert.equal(summary.when, "hoje");
  // Sem peso desejado não há trilha; com 66 kg, parte da primeira pesagem da jornada (77 kg).
  assert.equal(summary.progress, null);
  const journey = withJourney(today);
  const target = (kg: number) =>
    bodySummary({ ...journey, profile: { ...journey.profile!, targetWeight: kg } }, today)!.progress;
  const progress = target(66)!;
  assert.deepEqual([progress.start, progress.target, progress.speech], ["77", "66", "Início 77 kg, meta 66 kg."]);
  assert.ok(Math.abs(progress.ratio - (77 - 72.4) / (77 - 66)) < 1e-9);
  // Ganho de peso usa o mesmo caminho; passar da meta não passa de 1; meta = início não desenha.
  assert.ok(Math.abs(target(80)!.ratio - 0) < 1e-9);
  assert.equal(target(72.4)!.ratio, 1);
  assert.equal(target(77), null);
  // Faixas de largura igual: 18,5 / 25 / 30 marcam 25 / 50 / 75 % e 26,6 cai entre 25 e 30.
  assert.deepEqual(BMI_TICKS.map((t) => t.position), [25, 50, 75]);
  assert.ok(summary.bmi!.position > 50 && summary.bmi!.position < 75);
  const waist = withMeasurements(stateFixture(), [weighIn(today, 70, { waist: 82.5 })], today);
  assert.deepEqual(bodySummary(waist, today)!.tiles.at(-1), {
    key: "waist",
    label: "Cintura",
    value: "82,5 cm",
    number: "82,5",
    unit: "cm",
  });
});

test("Corpo calmo: perfil sensível ou menor de idade vê só o peso, sem variação nem IMC", () => {
  const today = localDate();
  const journey = withJourney(today);
  for (const over of [
    { eatingDisorder: "sim" as const },
    { pregnancy: "amamentacao" as const },
    { birthDate: shiftDate(today, -16 * 365) },
  ]) {
    const state = { ...journey, profile: { ...journey.profile!, ...over, waist: 82.5 } };
    const summary = bodySummary(state, today)!;
    assert.equal(isCalmProfile(state.profile, today), true);
    assert.deepEqual([summary.weight, summary.calm, summary.trend, summary.bmi], ["72,4", true, null, null]);
    // A altura fica; a cintura (composição corporal) não aparece para perfil calmo.
    assert.deepEqual(summary.tiles, [HEIGHT_TILE]);
    // Sem trilha até a meta em perfil calmo.
    assert.equal(summary.progress, null);
  }
  assert.equal(isCalmProfile(journey.profile!, today), false);
  const single = bodySummary(stateFixture(), today)!;
  assert.equal(single.trend, null);
  assert.ok(single.bmi);
  assert.equal(bodySummary({ ...stateFixture(), profile: null }, today), null);
});

test("preferências: estado do agente, intervalo da água e horário de silêncio", () => {
  assert.deepEqual(agentStatus(true, false, { deepseek: true, openai: true }), {
    label: "Desativado nas suas escolhas",
    tone: "neutral",
  });
  assert.deepEqual(agentStatus(true, true, { deepseek: true, openai: true }), {
    label: "Pronto · DeepSeek e OpenAI",
    tone: "ok",
  });
  assert.equal(agentStatus(true, true, { deepseek: true, openai: false }).label, "Pronto · DeepSeek");
  assert.equal(agentStatus(true, true, { deepseek: false, openai: true }).label, "Pronto · OpenAI");
  assert.equal(agentStatus(true, true, null).label, "Pronto");
  assert.deepEqual(agentStatus(false, true, null), {
    label: "Sem conexão com o servidor do agente",
    tone: "attention",
  });
  assert.equal(fmtInterval(120), "A cada 2 h");
  assert.equal(fmtInterval(135), "A cada 2 h 15 min");
  assert.equal(fmtInterval(45), "A cada 45 min");
  assert.equal(fmtInterval(60), "A cada 1 h");
  assert.equal(fmtInterval(480), "A cada 8 h");
  assert.equal(quietLabel({ quietStart: "22:00", quietEnd: "07:00" }), "22:00 às 07:00");
});

test("withProfilePatch: versão do consentimento, rascunho junto e histórico de metas intacto", () => {
  const state = { ...stateFixture(), draft: { name: "Rascunho", hideCalories: false } };
  const before = JSON.stringify(state);
  const consent = withProfilePatch(
    { ...state, profile: { ...state.profile!, aiConsentVersion: 0 } },
    { consentAi: true },
  );
  assert.equal(consent.profile!.consentAi, true);
  assert.equal(consent.profile!.aiConsentVersion, AI_CONSENT_VERSION);
  assert.equal(consent.draft!.aiConsentVersion, AI_CONSENT_VERSION);
  assert.equal(consent.goalHistory, state.goalHistory);
  const hidden = withProfilePatch(state, { hideCalories: true });
  assert.equal(hidden.profile!.hideCalories, true);
  assert.deepEqual(hidden.draft, { name: "Rascunho", hideCalories: true });
  const quiet = withProfilePatch(state, { quietStart: "23:00", hydrationInterval: 135 });
  assert.deepEqual(
    [quiet.profile!.quietStart, quiet.profile!.quietEnd, quiet.profile!.hydrationInterval],
    ["23:00", "07:00", 135],
  );
  assert.equal(withProfilePatch({ ...state, draft: null }, { remindersEnabled: true }).draft, null);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => withProfilePatch(state, { quietStart: "25:00" }));
  assert.throws(() => withProfilePatch({ ...state, profile: null }, { hideCalories: true }), /anamnese/);
});

test("bodyNumbers: oculto vence calmo; calmo por perfil sensível ou idade; completo no resto", () => {
  const T = "2026-09-28";
  const profile = stateFixture().profile!;
  const cases: [Partial<typeof profile>, string][] = [
    [{}, "full"],
    [{ eatingDisorder: "sim" }, "calm"],
    [{ birthDate: "2012-01-01" }, "calm"],
    [{ hideBodyNumbers: true }, "hidden"],
    [{ hideBodyNumbers: true, pregnancy: "gestacao" }, "hidden"],
  ];
  for (const [over, level] of cases) assert.equal(bodyNumbers({ ...profile, ...over }, T), level, JSON.stringify(over));
});

test("Corpo com números ocultos: sem peso, variação, IMC nem medidas; a data da medição fica", () => {
  const today = localDate();
  const journey = withJourney(today);
  const state = { ...journey, profile: { ...journey.profile!, hideBodyNumbers: true, waist: 82.5 } };
  const summary = bodySummary(state, today)!;
  assert.deepEqual(summary, {
    weight: null,
    calm: false,
    hidden: true,
    trend: null,
    bmi: null,
    tiles: [],
    progress: null,
    when: "hoje",
    measured: "Medido hoje · Balança em casa",
  });
  assert.doesNotMatch(JSON.stringify(summary), /kg|cm|\d+,\d/);
  assert.equal(bodySummary(journey, today)!.hidden, false);
});

test("withProfilePatch: ocultar números do corpo vai ao perfil e ao rascunho, sem mexer nas metas", () => {
  const state = { ...stateFixture(), draft: { name: "Rascunho" } };
  const hidden = withProfilePatch(state, { hideBodyNumbers: true });
  assert.equal(hidden.profile!.hideBodyNumbers, true);
  assert.equal(hidden.draft!.hideBodyNumbers, true);
  assert.equal(hidden.goalHistory, state.goalHistory);
  assert.equal(withProfilePatch(hidden, { hideBodyNumbers: false }).profile!.hideBodyNumbers, false);
});

test("heroFacts: idade e altura; com números do corpo ocultos, só a idade", () => {
  const profile = stateFixture().profile!;
  const T = "2026-09-24";
  assert.equal(heroFacts(profile, T), "34 anos · 165 cm");
  assert.equal(heroFacts({ ...profile, hideBodyNumbers: true }, T), "34 anos");
});

test("Corpo: variação do chip com uma casa e seta neutra (sobe, desce ou fica)", () => {
  const today = localDate();
  const up = withMeasurements(
    stateFixture(),
    [weighIn(shiftDate(today, -7), 70), weighIn(today, 71.25)],
    today,
  );
  const flat = withMeasurements(
    stateFixture(),
    [weighIn(shiftDate(today, -7), 70), weighIn(today, 70.02)],
    today,
  );
  assert.deepEqual(
    [bodySummary(up, today)!.trend?.chip, bodySummary(up, today)!.trend?.direction],
    ["+1,3 kg", "up"],
  );
  assert.deepEqual(
    [bodySummary(flat, today)!.trend?.chip, bodySummary(flat, today)!.trend?.direction],
    ["0,0 kg", "flat"],
  );
});
