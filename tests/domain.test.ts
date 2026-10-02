import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  profileSchema,
  diarySchema,
  foodSchema,
  stateSchema,
} from "../src/types";
import {
  ageAt,
  goalsFor,
  goalsForDate,
  mealTotals,
  totalsFor,
  localDate,
  shiftDate,
  isQuiet,
  notificationsFor,
  agentContext,
  needsIndividualCare,
  updateProfile,
  uid,
} from "../src/lib/domain";
import { profileFixture, stateFixture } from "./fixtures";
import { initialState } from "../src/lib/domain";
import { prepareRestore } from "../src/lib/backup";
import { mediaPart, requestSchema, systemInstruction } from "../server/agent";
test("idade considera aniversário sem converter a data para UTC", () => {
  assert.equal(ageAt("2000-09-11", "2026-09-10"), 25);
  assert.equal(ageAt("2000-09-11", "2026-09-11"), 26);
});
test("metas usam a mesma fórmula e fator de atividade, com déficit explícito para perda", () => {
  const p = {
    ...profileFixture(),
    birthDate: "1992-09-10",
    sex: "masculino" as const,
    manualCalories: null,
    activityLevel: "moderado" as const,
  };
  const goals = goalsFor(p, "2026-09-10");
  assert.equal(goals.basal, 1586);
  assert.equal(goals.expenditure, 2458);
  assert.equal(goals.calories, 2458);
  // IMC 26,4 (sobrepeso): déficit de 20% do gasto (492 kcal).
  assert.equal(goalsFor({ ...p, goal: "perder" }, "2026-09-10").calories, 1966);
  assert.equal(
    goalsFor({ ...p, manualCalories: 1900 }, "2026-09-10").calories,
    1900,
  );
});
test("respostas clínicas e informações omitidas impedem estimativas inadequadas", () => {
  const p = { ...profileFixture(), manualCalories: null };
  for (const change of [
    // Perfil antigo (só texto livre) e perfil com a lista fechada.
    { conditionTags: [], conditions: "Diabetes tipo 1" },
    { conditionTags: ["diabetes_tipo_1_insulina" as const] },
    { pregnancy: "gestacao" as const },
    { eatingDisorder: "sim" as const },
    { sex: "nao_informado" as const },
    { birthDate: "2015-06-15" },
  ]) {
    assert.equal(goalsFor({ ...p, ...change }).calories, null);
  }
  assert.equal(goalsFor({ ...p, manualWater: null }).water, null);
});
test("filtro de cuidado: data de nascimento ausente conta como menor de idade", () => {
  const p = profileFixture();
  assert.equal(needsIndividualCare(p), false);
  assert.equal(needsIndividualCare({ ...p, birthDate: "" }), true);
  assert.equal(needsIndividualCare({ ...p, birthDate: "2010-06-15" }, "2026-09-27"), true);
  // Perfis antigos (sem a lista): o texto livre decide.
  const legacy = { ...p, conditionTags: [] };
  assert.equal(needsIndividualCare({ ...legacy, conditions: "Nenhuma." }), false);
  assert.equal(needsIndividualCare({ ...legacy, conditions: "Hipertensão" }), true);
  assert.equal(needsIndividualCare({ ...p, sex: "nao_informado" }), true);
});
test("filtro de cuidado com a lista de condições: só as que pedem avaliação bloqueiam", () => {
  const p = profileFixture();
  const listed = (conditionTags: string | string[], conditions = "") =>
    needsIndividualCare({ ...p, conditionTags, conditions });
  assert.equal(listed(["nenhuma"]), false);
  assert.equal(listed(["hipertensao", "diabetes_tipo_2", "obesidade"]), false);
  for (const tag of [
    "diabetes_tipo_1_insulina",
    "doenca_renal",
    "insuficiencia_cardiaca",
    "cancer_tratamento",
    "outra",
  ])
    assert.equal(listed(["hipertensao", tag], "Detalhes"), true, tag);
  // Rascunho: texto "a,b"; com a lista marcada, o texto dos detalhes não decide.
  assert.equal(listed("hipertensao,pre_diabetes", "Hipertensão"), false);
  assert.equal(listed("hipertensao,doenca_renal"), true);
  // Lista vazia ou só com códigos desconhecidos: vale o texto livre (perfis antigos).
  assert.equal(listed("", "Nenhuma"), false);
  assert.equal(listed([], "Hipertensão"), true);
  assert.equal(listed("desconhecida", "Hipertensão"), true);
  // Os outros bloqueios continuam valendo com a lista liberada.
  assert.equal(needsIndividualCare({ ...p, conditionTags: ["nenhuma"], pregnancy: "gestacao" }), true);
});
test("condições no perfil: rascunho em texto vira lista validada, Outra pede detalhes, Nenhuma é exclusiva", () => {
  const p = profileFixture();
  const parse = (changes: Record<string, unknown>) =>
    profileSchema.safeParse({ ...p, ...changes });
  const fromDraft = parse({ conditionTags: "hipertensao, diabetes_tipo_2,hipertensao", conditions: "" });
  assert.equal(fromDraft.success, true);
  assert.deepEqual(fromDraft.data?.conditionTags, ["hipertensao", "diabetes_tipo_2"]);
  assert.equal(parse({ conditionTags: "inventada" }).success, false);
  assert.equal(parse({ conditionTags: ["outra"], conditions: "" }).success, false);
  assert.equal(parse({ conditionTags: ["outra"], conditions: "Asma" }).success, true);
  assert.equal(parse({ conditionTags: ["nenhuma", "hipertensao"] }).success, false);
  // Sem lista e sem texto: a pergunta não foi respondida.
  assert.equal(parse({ conditionTags: [], conditions: "" }).success, false);
  assert.equal(parse({ conditionTags: ["nenhuma"], conditions: "" }).success, true);
  // Perfis antigos, sem o campo, carregam a lista vazia.
  const { conditionTags: _omitted, ...legacy } = p;
  assert.deepEqual(profileSchema.parse(legacy).conditionTags, []);
});
test("dia da aplicação vazio não conta como informação faltando para o agente", () => {
  const context = agentContext(stateFixture());
  assert.equal(context.anamnese.penWeekday, null);
  assert.ok(!context.missingInformation.includes("penWeekday"));
  // Outras respostas nulas continuam na lista.
  assert.ok(context.missingInformation.includes("targetWeight"));
});
test("anamnese incompleta, alergia sem detalhe e datas inválidas são rejeitadas", () => {
  const p = profileFixture();
  assert.equal(
    profileSchema.safeParse({ ...p, consentLocal: false }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...p, conditionTags: [], conditions: "" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...p, allergies: "sim", allergyDetails: "" })
      .success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...p, birthDate: "2020-02-31" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...p, measurementDate: "2099-01-01" }).success,
    false,
  );
  const withSeconds = profileSchema.safeParse({
    ...p,
    wakeTime: "06:27:38",
    sleepTime: "22:05:00",
  });
  assert.equal(withSeconds.success, true);
  assert.equal(withSeconds.data?.wakeTime, "06:27");
  assert.equal(withSeconds.data?.sleepTime, "22:05");
  assert.equal(
    profileSchema.safeParse({ ...p, wakeTime: "6:27" }).success,
    false,
  );
});
test("canetas emagrecedoras: Sim exige caneta, quantidade e frequência; perfis antigos carregam 'não informado'", () => {
  const p = profileFixture();
  const incomplete = profileSchema.safeParse({ ...p, weightLossPen: "sim" });
  assert.equal(incomplete.success, false);
  assert.deepEqual(
    incomplete.error?.issues.map((i) => String(i.path[0])).sort(),
    ["weightLossPenDose", "weightLossPenName", "weightLossPenPerMonth"],
  );
  const complete = profileSchema.safeParse({
    ...p,
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro (tirzepatida)",
    weightLossPenDose: "5 mg",
    weightLossPenPerMonth: "4",
  });
  assert.equal(complete.success, true);
  assert.equal(complete.data?.weightLossPenPerMonth, 4);
  const { weightLossPen: _omitted, ...legacy } = p;
  const parsed = profileSchema.parse(legacy);
  assert.equal(parsed.weightLossPen, "nao_informado");
  assert.equal(parsed.weightLossPenName, "");
  assert.equal(parsed.weightLossPenPerMonth, null);
  const context = agentContext(stateFixture());
  assert.equal(context.anamnese.weightLossPen, "nao");
});
test("salvar perfil preserva respostas, medidas opcionais e dados usados pelo agente", () => {
  const s = updateProfile(stateFixture(), {
    ...profileFixture(),
    weight: 73,
    waist: 84,
    hip: 98,
    bodyFat: 23,
  });
  assert.equal(s.profile?.weight, 73);
  assert.equal(s.measurements.at(-1)?.waist, 84);
  assert.equal(s.profile?.allergyDetails, "Amendoim");
  assert.equal(s.draft, null);
  assert.equal(s.goalHistory.at(-1)?.profile.weight, 73);
  assert.ok(stateSchema.safeParse(s).success);
});
test("campos numéricos obrigatórios não transformam respostas ausentes em zero", () => {
  const profile = profileFixture();
  for (const field of [
    "sleepHours",
    "exerciseDays",
    "exerciseMinutes",
    "sedentaryHours",
  ]) {
    for (const value of ["", "  ", null, undefined, false])
      assert.equal(
        profileSchema.safeParse({ ...profile, [field]: value }).success,
        false,
        `${field}: ${String(value)}`,
      );
    for (const value of [0, "0"])
      assert.equal(
        profileSchema.safeParse({ ...profile, [field]: value }).success,
        true,
      );
  }
  const parsed = profileSchema.parse({ ...profile, usualWater: "  " });
  assert.equal(parsed.usualWater, null);
});
test("metas históricas não usam metas futuras nem o perfil atual como passado", () => {
  const state = stateFixture();
  const first = { ...profileFixture(), manualCalories: 1800 };
  const later = { ...first, manualCalories: 2100 };
  state.profile = { ...later, manualCalories: 2300 };
  state.goalHistory = [
    { date: "2026-09-10", profile: later },
    { date: "2026-09-01", profile: first },
  ];
  assert.equal(goalsForDate(state, "2026-08-31").calories, null);
  assert.equal(goalsForDate(state, "2026-08-31").water, null);
  assert.equal(goalsForDate(state, "2026-08-31").reason, null);
  assert.equal(
    goalsForDate(state, "2026-08-31").source,
    "Sem metas registradas nesta data",
  );
  assert.equal(goalsForDate(state, "2026-09-01").calories, 1800);
  assert.equal(goalsForDate(state, "2026-09-09").calories, 1800);
  assert.equal(goalsForDate(state, "2026-09-10").calories, 2100);
  assert.equal(goalsForDate(state, "2026-09-11").calories, 2100);
});
test("totais são derivados dos registros do dia e acompanham exclusão e edição", () => {
  const now = localDate();
  const base = {
    id: "a",
    userId: "u",
    date: now,
    time: "09:00",
    createdAt: "x",
    updatedAt: "x",
    type: "agua" as const,
    title: "Água",
    description: "",
    amountMl: 250,
  };
  const b = { ...base, id: "b", amountMl: 500 },
    c = { ...base, id: "c", date: shiftDate(now, -1), amountMl: 1000 };
  assert.equal(totalsFor([base, b, c], now).water, 750);
  assert.equal(totalsFor([b, c], now).water, 500);
  assert.equal(totalsFor([{ ...b, amountMl: 100 }, c], now).water, 100);
});
test("refeições vazias e volumes inválidos não podem ser salvos", () => {
  const base = {
    id: "a",
    userId: "u",
    date: localDate(),
    time: "09:00",
    createdAt: "x",
    updatedAt: "x",
    title: "Registro",
    description: "",
  };
  assert.equal(
    diarySchema.safeParse({ ...base, type: "refeicao", items: [] }).success,
    false,
  );
  assert.equal(
    diarySchema.safeParse({ ...base, type: "agua", amountMl: -1 }).success,
    false,
  );
  assert.equal(
    diarySchema.safeParse({ ...base, type: "agua", amountMl: 250.5 }).success,
    false,
  );
  assert.equal(
    diarySchema.safeParse({ ...base, type: "bem_estar", rating: 6 }).success,
    false,
  );
});
test("catálogo importado possui origem, números válidos e arredondamento só no total", () => {
  const foods = JSON.parse(
    readFileSync(new URL("../src/data/foods.json", import.meta.url), "utf8"),
  );
  assert.equal(foods.length, 593);
  for (const f of foods)
    assert.ok(foodSchema.safeParse(f).success, JSON.stringify(f));
  const rice = foods.find((f: { id: string }) => f.id === "taco-1");
  assert.equal(rice.name, "Arroz, integral, cozido");
  assert.equal(mealTotals([{ food: rice, grams: 100 }]).calories, 124);
  assert.equal(
    mealTotals([
      { food: rice, grams: 50 },
      { food: rice, grams: 50 },
    ]).calories,
    124,
  );
});
test("lembretes respeitam silêncio e ler não registra consumo", () => {
  assert.equal(isQuiet("23:30", "22:00", "07:00"), true);
  assert.equal(isQuiet("06:59", "22:00", "07:00"), true);
  assert.equal(isQuiet("07:00", "22:00", "07:00"), false);
  const state = stateFixture();
  state.profile!.remindersEnabled = true;
  const now = new Date(`${localDate()}T12:30:00`);
  const original = JSON.stringify(state.diary);
  const notifications = notificationsFor(state, now);
  assert.ok(notifications.some((n) => n.type === "agua"));
  state.readNotifications = notifications.map((n) => n.id);
  assert.ok(notificationsFor(state, now).every((n) => n.read));
  assert.equal(JSON.stringify(state.diary), original);
});
test("contexto da IA inclui anamnese e omite identificadores e anexos automáticos", () => {
  const state = stateFixture(),
    context = agentContext(state);
  assert.equal(context.anamnese.allergyDetails, "Amendoim");
  assert.equal(context.anamnese.medications, "Não");
  assert.ok(!("name" in context.anamnese));
  assert.ok(!("birthDate" in context.anamnese));
  assert.ok(!("aiConsentVersion" in context.anamnese));
  assert.ok(context.missingInformation.includes("familyHistory"));
});
test("contexto ordena medidas recentes e não inclui eventos posteriores à data", () => {
  const state = stateFixture();
  const referenceDate = localDate();
  const measurement = state.measurements[0];
  state.measurements = Array.from({ length: 35 }, (_, i) => ({
    ...measurement,
    id: `measurement-${i}`,
    date: shiftDate(referenceDate, 1 - i),
  }));
  state.habits = [
    {
      id: "existing",
      title: "Caminhar",
      timeOfDay: "08:00",
      createdDate: shiftDate(referenceDate, -3),
      completedDates: [
        shiftDate(referenceDate, -1),
        shiftDate(referenceDate, 1),
      ],
    },
    {
      id: "future",
      title: "Ler",
      timeOfDay: "09:00",
      createdDate: shiftDate(referenceDate, 1),
      completedDates: [],
    },
  ];
  const original = JSON.stringify(state);
  const context = agentContext(state, referenceDate);
  assert.equal(context.measurements.length, 30);
  assert.equal(context.measurements[0].date, shiftDate(referenceDate, -29));
  assert.equal(context.measurements.at(-1)?.date, referenceDate);
  assert.deepEqual(
    context.habits.map((h) => h.id),
    ["existing"],
  );
  assert.deepEqual(context.habits[0].completedDates, [
    shiftDate(referenceDate, -1),
  ]);
  assert.equal(JSON.stringify(state), original);
});
test("API exige consentimento e rejeita conteúdo incompatível com tipo de arquivo", () => {
  assert.equal(
    requestSchema.safeParse({
      mode: "chat",
      text: "Olá",
      consent: false,
      context: {},
      history: [],
    }).success,
    false,
  );
  assert.throws(() => mediaPart("data:image/png;base64,aGVsbG8=", "photo"));
  assert.throws(() =>
    mediaPart("data:application/pdf;base64,JVBERi0xLjQ=", "photo"),
  );
  assert.deepEqual(
    mediaPart("data:application/pdf;base64,JVBERi0xLjQ=", "exam"),
    {
      type: "file",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
      filename: "laudo.pdf",
    },
  );
  assert.match(systemInstruction, /alergias/);
  assert.match(systemInstruction, /Não diagnostique/);
});

test("hideBodyNumbers: rascunho antigo não desfaz a escolha; vai ao agente e não falta", () => {
  const state = stateFixture();
  const hidden = { ...state, profile: { ...state.profile!, hideBodyNumbers: true } };
  const { hideBodyNumbers: _key, ...withoutKey } = profileFixture();
  assert.equal(updateProfile(hidden, withoutKey as ReturnType<typeof profileFixture>).profile!.hideBodyNumbers, true);
  assert.equal(updateProfile(hidden, { ...profileFixture(), hideBodyNumbers: false }).profile!.hideBodyNumbers, true);
  assert.equal(updateProfile(state, profileFixture()).profile!.hideBodyNumbers, false);
  const context = agentContext(hidden);
  assert.equal(context.anamnese.hideBodyNumbers, true);
  assert.ok(!context.missingInformation.includes("hideBodyNumbers"));
});

test("preferências da IA proativa: estados e backups antigos carregam os padrões; valores inválidos não quebram", () => {
  const fresh = initialState();
  assert.equal(fresh.adaptiveTargets, true);
  assert.equal(fresh.aiDailyComment, true);
  assert.equal(fresh.aiDailyCommentDate, null);
  assert.deepEqual(fresh.signalDismissals, {});
  const {
    adaptiveTargets: _a,
    aiDailyComment: _b,
    aiDailyCommentDate: _c,
    signalDismissals: _d,
    ...old
  } = stateFixture();
  const loaded = stateSchema.parse(old);
  assert.equal(loaded.adaptiveTargets, true);
  assert.equal(loaded.aiDailyComment, true);
  assert.equal(loaded.aiDailyCommentDate, null);
  assert.deepEqual(loaded.signalDismissals, {});
  const odd = stateSchema.parse({ ...old, aiDailyCommentDate: "ontem", signalDismissals: { x: "2026-13-45" } });
  assert.equal(odd.aiDailyCommentDate, null);
  assert.deepEqual(odd.signalDismissals, {});
  const kept = stateSchema.parse({
    ...old,
    adaptiveTargets: false,
    aiDailyComment: false,
    aiDailyCommentDate: "2026-09-30",
    signalDismissals: { "kcal-acima": "2026-09-29" },
  });
  assert.equal(kept.adaptiveTargets, false);
  assert.equal(kept.aiDailyComment, false);
  assert.equal(kept.aiDailyCommentDate, "2026-09-30");
  assert.deepEqual(kept.signalDismissals, { "kcal-acima": "2026-09-29" });
});

test("restaurar backup traz as preferências do arquivo sem liberar um segundo comentário no mesmo dia", () => {
  const current = { ...stateFixture(), aiDailyCommentDate: "2026-10-01" };
  const backup = {
    ...stateFixture(),
    adaptiveTargets: false,
    aiDailyComment: false,
    aiDailyCommentDate: "2026-09-20",
    signalDismissals: { "agua-baixa": "2026-09-19" },
  };
  const restored = prepareRestore(backup, current);
  assert.equal(restored.adaptiveTargets, false);
  assert.equal(restored.aiDailyComment, false);
  assert.equal(restored.aiDailyCommentDate, "2026-10-01");
  assert.deepEqual(restored.signalDismissals, { "agua-baixa": "2026-09-19" });
  const newer = prepareRestore({ ...backup, aiDailyCommentDate: "2026-10-02" }, { ...current, aiDailyCommentDate: null });
  assert.equal(newer.aiDailyCommentDate, "2026-10-02");
});
