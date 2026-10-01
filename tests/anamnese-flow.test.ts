import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerText,
  completion,
  essentialFields,
  firstIncompleteStep,
  initialStep,
  renderableFields,
  stepMinutes,
  widgetKeys,
} from "../src/components/anamnese/progress";
import { questionnaire, type Question } from "../src/data/questionnaire";
import {
  applyAnswer,
  canShowBodyNumbers,
  canShowProjection,
  careInput,
  draftAge,
  finalizeAnswers,
  flowHidden,
  FLOW_KEY,
  FLOW_VERSION,
  hasFlowMarker,
  isQuietLinked,
  isSensitiveDraft,
  prefilledKeys,
  withDerivedDefaults,
  withFlowMarker,
} from "../src/lib/anamnese-flow";
import { parseBackup } from "../src/lib/backup";
import { emptyDraft } from "../src/lib/domain";
import { profileSchema, stateSchema, type Draft } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";

const TODAY = "2026-09-27";
const full = () => profileFixture() as unknown as Draft;
const empty = () => emptyDraft() as Draft;
const fieldOf = (key: string): Question =>
  questionnaire.flatMap((s) => s.fields).find((f) => f.key === key)!;
const stepKeys = (index: number) => questionnaire[index].fields.map((f) => f.key);

test("questionário: 8 etapas, triagem logo depois do básico e cada resposta do perfil uma vez", () => {
  assert.deepEqual(
    questionnaire.map((s) => s.title),
    [
      "Vamos conhecer você",
      "Cuidados importantes",
      "Seu ponto de partida",
      "Histórico de saúde",
      "Sua alimentação",
      "Sono, movimento e bem-estar",
      "Objetivos e metas",
      "Revise sua anamnese",
    ],
  );
  const withGoal = questionnaire
    .map((s, i) => (s.fields.some((f) => f.key === "goal") ? i : -1))
    .filter((i) => i >= 0);
  assert.deepEqual(withGoal, [0]);
  assert.deepEqual(stepKeys(1), [
    "pregnancy",
    "eatingDisorder",
    "fluidRestriction",
    "conditions",
    "hideCalories",
  ]);
  const keys = questionnaire.flatMap((s) => s.fields.map((f) => f.key));
  // Preferências fora do questionário: ordem do Hoje, versão do consentimento e "Ocultar números do corpo" (Meu espaço).
  const profileKeys = Object.keys(profileSchema.shape).filter(
    (k) => k !== "homeLayout" && k !== "aiConsentVersion" && k !== "hideBodyNumbers",
  );
  for (const key of profileKeys)
    assert.equal(keys.filter((k) => k === key).length, 1, key);
  assert.equal(keys.length, profileKeys.length);
  for (const step of questionnaire)
    assert.ok(step.summary.split(/\s+/).length <= 12, step.title);
  // O início do bloco de metas nunca é uma chave que "Ocultar calorias" esconde.
  assert.equal(
    questionnaire[6].fields.find((f) => f.widget === "goals")?.key,
    "manualProtein",
  );
  const hide = fieldOf("hideCalories");
  assert.equal(hide.type, "checkbox");
  assert.deepEqual(hide.options, [
    ["false", "Mostrar calorias"],
    ["true", "Ocultar calorias"],
  ]);
});

test("etapa inicial: rascunho novo usa a etapa salva; antigo passa pelo mapa e para na primeira incompleta", () => {
  assert.equal(initialStep(null, 5), 0);
  assert.equal(initialStep(withFlowMarker(full()), 3), 3);
  assert.equal(initialStep(withFlowMarker(full()), 9), 7);
  assert.equal(initialStep(withFlowMarker(full()), -2), 0);
  // Rascunhos completos antigos: revisão (dieta, estruturado, exames) e início (checagens do app).
  assert.equal(initialStep(full(), 7), 7);
  assert.equal(initialStep(full(), 0), 0);
  assert.equal(initialStep(full(), 9), 7);
  const noTriage = {
    ...full(),
    pregnancy: "",
    eatingDisorder: "",
    fluidRestriction: "",
    conditions: "",
  };
  assert.equal(initialStep(noTriage, 2), 1);
  assert.equal(initialStep(noTriage, 1), 1);
  assert.equal(initialStep({ ...full(), goal: "" }, 5), 0);
  assert.equal(firstIncompleteStep(full()), null);
  assert.equal(firstIncompleteStep(noTriage), 1);
  assert.equal(firstIncompleteStep(empty()), 0);
});

test("marca do fluxo: gravada no rascunho e descartada pelo perfil", () => {
  const marked = withFlowMarker(full());
  assert.equal(marked[FLOW_KEY], FLOW_VERSION);
  assert.equal(hasFlowMarker(marked), true);
  assert.equal(hasFlowMarker(full()), false);
  assert.equal(hasFlowMarker(null), false);
  assert.ok(!(FLOW_KEY in profileSchema.parse(marked)));
});

test("fluxo esconde peso desejado de perfis sensíveis, menores e sem idade; e o que não se aplica", () => {
  const adult = { ...full(), goal: "perder" };
  assert.equal(flowHidden(adult, "targetWeight", TODAY), false);
  assert.equal(flowHidden({ ...adult, goal: "ganhar" }, "targetWeight", TODAY), false);
  const changes: Draft[] = [
    { goal: "manter" },
    { goal: "organizar" },
    { eatingDisorder: "sim" },
    { pregnancy: "gestacao" },
    { pregnancy: "" },
    { birthDate: "2010-06-15" },
    { birthDate: "" },
  ];
  for (const change of changes)
    assert.equal(
      flowHidden({ ...adult, ...change }, "targetWeight", TODAY),
      true,
      JSON.stringify(change),
    );
  assert.equal(flowHidden({ ...adult, hideCalories: false }, "manualCalories"), false);
  assert.equal(flowHidden({ ...adult, hideCalories: true }, "manualCalories"), true);
  for (const key of ["quietStart", "quietEnd", "hydrationInterval"]) {
    assert.equal(flowHidden({ ...adult, remindersEnabled: false }, key), true, key);
    assert.equal(flowHidden({ ...adult, remindersEnabled: true }, key), false, key);
  }
  const pen = { ...adult, weightLossPen: "sim", weightLossPenPerMonth: 4 };
  assert.equal(flowHidden(pen, "penWeekday"), false);
  assert.equal(flowHidden({ ...pen, weightLossPenPerMonth: "4" }, "penWeekday"), false);
  assert.equal(flowHidden({ ...pen, weightLossPenPerMonth: 30 }, "penWeekday"), true);
  assert.equal(flowHidden({ ...pen, weightLossPen: "nao" }, "penWeekday"), true);
  assert.equal(flowHidden(adult, "name"), false);
});

test("filtro de cuidado no rascunho: triagem vazia é sensível; idade desconhecida não é adulta", () => {
  const adult = { ...full(), goal: "perder" };
  assert.equal(isSensitiveDraft(adult), false);
  assert.equal(isSensitiveDraft({ ...adult, eatingDisorder: "" }), true);
  assert.equal(isSensitiveDraft({ ...adult, pregnancy: "nao_informado" }), true);
  assert.equal(draftAge(adult, TODAY), 34);
  assert.equal(draftAge({ ...adult, birthDate: "" }, TODAY), null);
  assert.equal(canShowBodyNumbers(adult, TODAY), true);
  assert.equal(canShowBodyNumbers({ ...adult, birthDate: "" }, TODAY), false);
  assert.equal(canShowBodyNumbers({ ...adult, birthDate: "2010-06-15" }, TODAY), false);
  assert.equal(canShowProjection(adult, TODAY), true);
  assert.equal(canShowProjection({ ...adult, goal: "manter" }, TODAY), false);
  // Condições e sexo não informado deixam o peso desejado, mas tiram a projeção.
  const hypertension = { ...adult, conditions: "Hipertensão" };
  assert.equal(canShowBodyNumbers(hypertension, TODAY), true);
  assert.equal(canShowProjection(hypertension, TODAY), false);
  assert.equal(canShowProjection({ ...adult, sex: "nao_informado" }, TODAY), false);
  assert.deepEqual(careInput({ birthDate: null }), {
    birthDate: "",
    sex: "",
    pregnancy: "",
    eatingDisorder: "",
    conditions: "",
  });
});

test("applyAnswer deriva o sono, leva o silêncio junto e desfaz a confirmação da caneta", () => {
  const base = { ...empty(), sleepTime: "", wakeTime: "07:00" };
  const slept = applyAnswer(base, "sleepTime", "23:00");
  assert.equal(slept.sleepHours, "8");
  // Silêncio nos padrões (22:00–07:00) acompanha o sono.
  assert.equal(isQuietLinked(base), true);
  assert.equal(slept.quietStart, "23:00");
  assert.equal(slept.quietEnd, "07:00");
  assert.equal(base.sleepTime, "", "sem mutação");
  // Igual ao sono também acompanha.
  const later = applyAnswer(slept, "sleepTime", "23:30");
  assert.equal(later.quietStart, "23:30");
  assert.equal(later.sleepHours, "7.5");
  // Silêncio escolhido pela pessoa fica como está.
  const custom = { ...base, sleepTime: "23:00", quietStart: "21:00", quietEnd: "06:00" };
  const kept = applyAnswer(custom, "wakeTime", "06:30");
  assert.equal(kept.quietStart, "21:00");
  assert.equal(kept.quietEnd, "06:00");
  assert.equal(kept.sleepHours, "7.5");
  // Horário ainda incompleto: sem derivar nada.
  const partial = applyAnswer({ ...empty(), wakeTime: "" }, "sleepTime", "23:00");
  assert.equal(partial.sleepHours, "");
  assert.equal(partial.quietStart, "22:00");

  const confirmed = {
    ...empty(),
    weightLossPen: "sim",
    weightLossPenPerMonth: "4",
    penLastConfirmed: true,
  };
  assert.equal(applyAnswer(confirmed, "penLastSite", "coxa").penLastConfirmed, false);
  assert.equal(applyAnswer(confirmed, "weightLossPenDose", "5 mg").penLastConfirmed, false);
  assert.equal(applyAnswer(confirmed, "name", "Ana").penLastConfirmed, true);

  const dated = applyAnswer(confirmed, "penLastDate", "2026-09-24");
  assert.equal(dated.penWeekday, "4");
  assert.equal(dated.penLastConfirmed, false);
  assert.equal(
    applyAnswer({ ...confirmed, penWeekday: "1" }, "penLastDate", "2026-09-24").penWeekday,
    "1",
  );
  assert.equal(
    applyAnswer({ ...confirmed, weightLossPenPerMonth: 30 }, "penLastDate", "2026-09-24").penWeekday,
    "",
  );
  assert.equal(applyAnswer(confirmed, "penLastDate", "").penWeekday, "");
});

test("valores derivados só preenchem o vazio da etapa enviada e devolvem o mesmo objeto sem mudança", () => {
  const blank = {
    ...empty(),
    mealsPerDay: "",
    sleepHours: "",
    sleepTime: "23:00",
    wakeTime: "07:00",
  };
  const derived = withDerivedDefaults(blank, stepKeys(5));
  assert.equal(derived.mealsPerDay, "3");
  assert.equal(derived.sleepHours, "8");
  assert.equal(blank.mealsPerDay, "", "sem mutação");
  const first = withDerivedDefaults(blank, stepKeys(0));
  assert.equal(first, blank);
  assert.equal(first.mealsPerDay, "");
  const filled = { ...blank, mealsPerDay: "4", sleepHours: "7" };
  assert.equal(withDerivedDefaults(filled, stepKeys(5)), filled);
  const noTimes = { ...blank, sleepTime: "" };
  assert.equal(withDerivedDefaults(noTimes, stepKeys(5)).sleepHours, "");
});

test("ao concluir, o dia da aplicação só vale para a caneta semanal", () => {
  const weekly = {
    ...empty(),
    weightLossPen: "sim",
    weightLossPenPerMonth: 4,
    penWeekday: "4",
  };
  assert.equal(finalizeAnswers(weekly), weekly);
  assert.equal(finalizeAnswers({ ...weekly, weightLossPenPerMonth: 30 }).penWeekday, "");
  assert.equal(finalizeAnswers({ ...weekly, weightLossPen: "nao" }).penWeekday, "");
  const withPen = {
    ...full(),
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro (tirzepatida)",
    weightLossPenDose: "5 mg",
    weightLossPenPerMonth: 4,
    penWeekday: "4",
  };
  assert.equal(profileSchema.parse(finalizeAnswers(withPen)).penWeekday, 4);
  assert.equal(
    profileSchema.parse(finalizeAnswers({ ...withPen, weightLossPenPerMonth: 30 })).penWeekday,
    null,
  );
});

test("ao concluir, o peso desejado escondido pelo fluxo é apagado (meta antiga não alimenta a Evolução)", () => {
  const adult = { ...full(), goal: "perder", targetWeight: 66, penWeekday: "" };
  assert.equal(finalizeAnswers(adult, TODAY), adult);
  assert.equal(finalizeAnswers({ ...adult, goal: "ganhar" }, TODAY).targetWeight, 66);
  const hidden: Draft[] = [
    { goal: "manter" },
    { goal: "organizar" },
    { eatingDisorder: "sim" },
    { pregnancy: "gestacao" },
    { birthDate: "2010-06-15" },
    { birthDate: "" },
  ];
  for (const change of hidden) {
    const final = finalizeAnswers({ ...adult, ...change }, TODAY);
    assert.equal(final.targetWeight, "", JSON.stringify(change));
    assert.equal(profileSchema.safeParse({ ...full(), ...final }).data?.targetWeight ?? null, null);
  }
  // Sem meta salva, nada muda (mesmo objeto).
  const noTarget = { ...adult, goal: "manter", targetWeight: "" };
  assert.equal(finalizeAnswers(noTarget, TODAY), noTarget);
});

test("respostas do primeiro acesso viram o cartão só para objetivo e consentimento", () => {
  assert.deepEqual(prefilledKeys({ goal: "perder", consentLocal: true, name: "Ana" }), [
    "goal",
    "consentLocal",
  ]);
  assert.deepEqual(prefilledKeys({ goal: "", consentLocal: false }), []);
  assert.deepEqual(prefilledKeys({ goal: "outro", consentLocal: "true" }), []);
});

test("progresso: perfil completo em 100% e rascunho vazio sem silêncio com lembretes desligados", () => {
  const done = completion(full());
  assert.equal(done.percent, 100);
  const start = completion(empty());
  assert.ok(start.answered > 0 && start.answered <= 8, String(start.answered));
  assert.ok(start.total >= 45 && start.total <= 70, String(start.total));
  const keys = essentialFields(empty()).map((f) => f.key);
  assert.ok(!keys.includes("quietStart"));
  assert.ok(!keys.includes("hydrationInterval"));
  assert.ok(essentialFields({ ...empty(), remindersEnabled: true }).some((f) => f.key === "quietStart"));
  assert.ok(!keys.includes("penWeekday"));
});

test("texto das respostas na revisão", () => {
  assert.equal(answerText(fieldOf("hideCalories"), false), "Mostrar calorias");
  assert.equal(answerText(fieldOf("hideCalories"), true), "Ocultar calorias");
  assert.equal(answerText(fieldOf("penWeekday"), 4), "Quinta-feira");
  assert.equal(answerText(fieldOf("penWeekday"), ""), "Varia");
  assert.equal(answerText(fieldOf("penWeekday"), null), "Varia");
  assert.equal(answerText(fieldOf("weightLossPenPerMonth"), 4), "Semanal (4 por mês)");
  assert.equal(answerText(fieldOf("weightLossPenPerMonth"), "30"), "Diária (30 por mês)");
  assert.equal(answerText(fieldOf("weightLossPenPerMonth"), ""), "Não informado");
  assert.equal(answerText(fieldOf("birthDate"), "1992-06-15"), "15/06/1992");
  assert.equal(answerText(fieldOf("consentAi"), true), "Sim");
  assert.equal(answerText(fieldOf("sex"), "feminino"), "Feminino");
  assert.equal(answerText(fieldOf("name"), ""), "Não informado");
});

test("widgets: a linha do dia conta como uma pergunta e cobre as sete chaves", () => {
  const step5 = questionnaire[5].fields;
  const drawn = renderableFields(step5, empty());
  assert.deepEqual(
    drawn.filter((f) => f.widget === "dayTimeline").map((f) => f.key),
    ["wakeTime"],
  );
  assert.equal(drawn.length, 8);
  assert.equal(stepMinutes(empty(), step5), 2);
  assert.deepEqual(widgetKeys(fieldOf("wakeTime"), step5, empty()), [
    "wakeTime",
    "breakfastTime",
    "lunchTime",
    "dinnerTime",
    "sleepTime",
    "mealsPerDay",
    "sleepHours",
  ]);
  assert.deepEqual(widgetKeys(fieldOf("name"), questionnaire[0].fields, empty()), ["name"]);
  // Etapa 0: objetivo e consentimento vindos do primeiro acesso saem do formulário.
  const known = renderableFields(questionnaire[0].fields, empty(), ["goal", "consentLocal"]);
  assert.ok(!known.some((f) => f.key === "goal" || f.key === "consentLocal"));
  assert.ok(known.some((f) => f.key === "name"));
  // Metas com calorias ocultas: o bloco começa na proteína e não cobre a meta calórica.
  const step6 = questionnaire[6].fields;
  const hidden = { ...empty(), hideCalories: true };
  assert.equal(renderableFields(step6, hidden).find((f) => f.widget === "goals")?.key, "manualProtein");
  assert.ok(!widgetKeys(fieldOf("manualProtein"), step6, hidden).includes("manualCalories"));
  assert.ok(widgetKeys(fieldOf("manualProtein"), step6, empty()).includes("manualCalories"));
});

test("estado e backup antigos, sem o dia da aplicação, carregam com nulo", () => {
  const state = stateFixture();
  const strip = <T extends object>(profile: T) => {
    const { penWeekday: _drop, ...rest } = profile as T & { penWeekday?: unknown };
    return rest;
  };
  const legacy = {
    ...state,
    profile: strip(state.profile!),
    goalHistory: state.goalHistory.map((h) => ({ ...h, profile: strip(h.profile) })),
  };
  const json = JSON.stringify(legacy);
  assert.ok(!json.includes("penWeekday"));
  assert.equal(stateSchema.parse(JSON.parse(json)).profile?.penWeekday, null);
  const restored = parseBackup(json);
  assert.equal(restored.profile?.penWeekday, null);
  assert.equal(restored.goalHistory[0].profile.penWeekday, null);
});

test("ligar os lembretes leva o silêncio ao sono (web e app pela mesma regra), sem mexer em silêncio escolhido", () => {
  const linked = { ...empty(), sleepTime: "23:00", wakeTime: "07:00", quietStart: "22:00", quietEnd: "07:00", remindersEnabled: false };
  const on = applyAnswer(linked, "remindersEnabled", true);
  assert.equal(on.quietStart, "23:00");
  assert.equal(on.quietEnd, "07:00");
  const custom = { ...linked, quietStart: "21:00", quietEnd: "06:00" };
  const kept = applyAnswer(custom, "remindersEnabled", true);
  assert.equal(kept.quietStart, "21:00");
  const noSleep = applyAnswer({ ...linked, sleepTime: "" }, "remindersEnabled", true);
  assert.equal(noSleep.quietStart, "22:00", "sem horário de dormir válido, nada muda");
  const off = applyAnswer(linked, "remindersEnabled", false);
  assert.equal(off.quietStart, "22:00");
});
