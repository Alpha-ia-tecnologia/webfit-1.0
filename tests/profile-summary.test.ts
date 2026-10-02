import { test } from "node:test";
import assert from "node:assert/strict";
import { questionnaire } from "../src/data/questionnaire";
import {
  anamneseCompletion,
  answerText,
  attentionItems,
  goalChangePreview,
  goalChip,
  healthMosaic,
  PROFILE_HUB_COPY,
  isSectionDirty,
  profileSections,
  saveSection,
  sectionAnswers,
  sectionIndexOf,
  sectionIssues,
  SECTION_EDIT_COPY,
} from "../src/lib/profile-summary";
import { ageAt, goalsFor, localDate, shiftDate } from "../src/lib/domain";
import { fmtNumber } from "../src/lib/format";
import { profileSchema, type Draft, type Profile } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";

const today = localDate();
const field = (key: string) => questionnaire.flatMap((s) => s.fields).find((f) => f.key === key)!;
const withProfile = (over: Partial<Profile>): Profile => profileSchema.parse({ ...profileFixture(), ...over });
const asDraft = (p: Profile): Draft => ({ ...p }) as unknown as Draft;
const byAnchor = (p: Profile, measurements = stateFixture().measurements) =>
  Object.fromEntries(profileSections(p, measurements, today).map((c) => [c.anchor, c.highlights]));
const MINOR_BIRTH = shiftDate(today, -16 * 365);

test("sectionIndexOf: as 7 âncoras resolvem as etapas do questionário atual (sem a revisão)", () => {
  const anchors = ["name", "conditions", "weight", "medications", "allergies", "sleepHours", "manualCalories"];
  const indexes = anchors.map(sectionIndexOf);
  assert.ok(indexes.every((i) => i >= 0 && i < questionnaire.length - 1));
  assert.equal(new Set(indexes).size, 7);
  assert.equal(sectionIndexOf("goal"), sectionIndexOf("name"));
  assert.equal(sectionIndexOf("naoExiste"), -1);
  const cards = profileSections(profileFixture(), stateFixture().measurements, today);
  assert.equal(cards.length, questionnaire.length - 1);
  assert.deepEqual(cards.map((c) => c.anchor).sort(), [...anchors].sort());
  for (const card of cards) {
    assert.equal(sectionIndexOf(card.anchor), card.index);
    assert.equal(card.title, questionnaire[card.index]!.title);
  }
});

test("profileSections: destaques exatos do perfil de teste, com ícone e tom por âncora", () => {
  const state = stateFixture();
  const cards = profileSections(state.profile!, state.measurements, today);
  assert.deepEqual(byAnchor(state.profile!), {
    name: [`${ageAt("1992-06-15", today)} anos`, "Manter o peso"],
    conditions: ["6 de 6 respostas", "Toque para ver os detalhes"],
    weight: ["Medido hoje", "1 medição"],
    medications: ["5 de 5 respostas", "Toque para ver os detalhes"],
    allergies: ["Alergias informadas", "Alimentação variada, sem restrições"],
    sleepHours: ["7 h de sono", "Atividade leve", "3 dias de exercício"],
    manualCalories: ["Definida por você", "Lembretes desligados", "IA desativada"],
  });
  assert.deepEqual(
    Object.fromEntries(cards.map((c) => [c.anchor, `${c.icon}/${c.tone}`])),
    {
      name: "user/neutral",
      conditions: "shield/medication",
      weight: "ruler/body",
      medications: "heart/medication",
      allergies: "leaf/food",
      sleepHours: "moon/mind",
      manualCalories: "target/habit",
    },
  );
  const weight = cards.find((c) => c.anchor === "weight")!;
  assert.deepEqual([weight.answered, weight.total], [4, 7]);
  for (const card of cards) {
    assert.ok(card.highlights.length >= 1 && card.highlights.length <= 3, card.title);
    assert.ok(card.highlights.every((h) => Array.from(h).length <= 40), card.title);
  }
  // Destaques longos são recortados com reticências; "Prefiro não informar" nunca é destaque.
  const long = byAnchor(withProfile({ routine: "Acordo cedo", diet: "Prefiro não informar", goal: "ganhar" }));
  assert.deepEqual(long.name, [`${ageAt("1992-06-15", today)} anos`, "Ganhar peso ou massa", "Acordo cedo"]);
  assert.deepEqual(long.allergies, ["Alergias informadas"]);
});

test("profileSections: perfil sensível ou menor vê 'Objetivo definido' e nenhum cartão fala de peso", () => {
  for (const profile of [
    withProfile({ eatingDisorder: "sim" }),
    withProfile({ pregnancy: "gestacao" }),
    withProfile({ birthDate: MINOR_BIRTH }),
  ]) {
    const cards = profileSections(profile, stateFixture().measurements, today);
    assert.equal(cards.find((c) => c.anchor === "name")!.highlights.includes("Objetivo definido"), true);
    for (const card of cards)
      for (const text of [card.title, ...card.highlights]) assert.doesNotMatch(text, /peso|kg|IMC/i, text);
  }
});

test("answerText e sectionAnswers: datas em dd/mm/aaaa, números em pt-BR e opções pelo rótulo", () => {
  assert.equal(answerText(field("birthDate"), "1992-06-15"), "15/06/1992");
  assert.equal(answerText(field("weight"), 72.4), "72,4");
  assert.equal(answerText(field("goal"), "manter"), "Manter meu peso");
  assert.equal(answerText(field("consentLocal"), true), "Sim");
  assert.equal(answerText(field("hideCalories"), false), "Mostrar calorias");
  assert.equal(answerText(field("waist"), null), "Não informado");
  assert.equal(answerText(field("routine"), undefined), "Não informado");
  assert.equal(answerText(field("penWeekday"), 4), "Quinta-feira");
  const first = sectionAnswers(profileFixture(), sectionIndexOf("name"));
  assert.deepEqual(first.find((a) => a.key === "birthDate"), {
    key: "birthDate",
    label: "Data de nascimento",
    value: "15/06/1992",
  });
  const goals = sectionIndexOf("manualCalories");
  assert.ok(sectionAnswers(profileFixture(), goals).some((a) => a.key === "manualCalories"));
  assert.ok(!sectionAnswers(withProfile({ hideCalories: true }), goals).some((a) => a.key === "manualCalories"));
  // Peso desejado não aparece para perfil sensível (a mesma regra da anamnese).
  const perder = withProfile({ goal: "perder", targetWeight: 65 });
  assert.ok(sectionAnswers(perder, goals).some((a) => a.key === "targetWeight"));
  assert.ok(!sectionAnswers({ ...perder, eatingDisorder: "sim" }, goals).some((a) => a.key === "targetWeight"));
  assert.deepEqual(sectionAnswers(profileFixture(), 99), []);
});

test("attentionItems: alergias e líquidos 'não sei' e medição antiga; nada disso em perfil calmo", () => {
  const stale = shiftDate(today, -90);
  const profile = withProfile({ allergies: "nao_sei", fluidRestriction: "nao_sei", measurementDate: stale });
  const items = attentionItems(profile, today);
  assert.deepEqual(items.map((i) => i.key), ["allergies", "fluid", "measure"]);
  assert.deepEqual(items[0]!.target, { kind: "section", index: sectionIndexOf("allergies") });
  assert.equal(items[0]!.actionAria, "Revisar alergias");
  assert.deepEqual(items[1]!.target, { kind: "section", index: sectionIndexOf("fluidRestriction") });
  assert.equal(items[1]!.actionAria, "Revisar restrição de líquidos");
  assert.deepEqual(items[2], {
    key: "measure",
    text: "Última medição há 90 dias.",
    actionLabel: "Registrar medidas",
    actionAria: "Registrar medidas na Evolução",
    target: { kind: "measure" },
  });
  assert.deepEqual(attentionItems(profileFixture(), today), []);
  assert.deepEqual(
    attentionItems(withProfile({ measurementDate: shiftDate(today, -60) }), today),
    [],
  );
  assert.equal(attentionItems(withProfile({ measurementDate: shiftDate(today, -61) }), today).length, 1);
  for (const calm of [{ eatingDisorder: "sim" as const }, { birthDate: MINOR_BIRTH }])
    assert.deepEqual(
      attentionItems({ ...profile, ...calm }, today).map((i) => i.key),
      ["allergies", "fluid"],
    );
});

test("goalChangePreview: meta manual prevalece, calorias ou proteína, e nada em perfil calmo ou inválido", () => {
  const manual = profileFixture();
  assert.equal(goalChangePreview(manual, { ...asDraft(manual), goal: "perder" }, today), null);
  const auto = withProfile({ manualCalories: null, goal: "manter" });
  const after = { ...auto, goal: "perder" as const };
  const from = goalsFor(auto, today).calories!;
  const to = goalsFor(after, today).calories!;
  assert.notEqual(from, to);
  assert.equal(
    goalChangePreview(auto, { ...asDraft(auto), goal: "perder" }, today),
    `Sua meta passa de ${fmtNumber(from)} para ${fmtNumber(to)} kcal por dia.`,
  );
  const hidden = { ...auto, hideCalories: true };
  const preview = goalChangePreview(hidden, { ...asDraft(hidden), goal: "perder" }, today)!;
  assert.equal(
    preview,
    `Sua meta de proteína passa de ${fmtNumber(goalsFor(auto, today).protein!)} g para ${fmtNumber(goalsFor(after, today).protein!)} g por dia.`,
  );
  assert.doesNotMatch(preview, /kcal|calori/i);
  assert.equal(goalChangePreview(auto, asDraft(auto), today), null);
  assert.equal(goalChangePreview(auto, { ...asDraft(auto), goal: "perder", eatingDisorder: "sim" }, today), null);
  const sensitive = { ...auto, pregnancy: "amamentacao" as const };
  assert.equal(goalChangePreview(sensitive, { ...asDraft(sensitive), goal: "perder" }, today), null);
  const minor = withProfile({ manualCalories: null, birthDate: MINOR_BIRTH });
  assert.equal(goalChangePreview(minor, { ...asDraft(minor), goal: "perder" }, today), null);
  assert.equal(goalChangePreview(auto, { ...asDraft(auto), goal: "perder", name: "" }, today), null);
});

test("sectionIssues e isSectionDirty: erro da etapa, dependência de outra etapa e mudança real", () => {
  const profile = withProfile({ measurementDate: shiftDate(today, -30) });
  const first = sectionIndexOf("name");
  assert.deepEqual(sectionIssues(asDraft(profile), first), { fields: {}, outside: [] });
  const later = { ...asDraft(profile), birthDate: shiftDate(today, -10) };
  assert.deepEqual(sectionIssues(later, first), { fields: {}, outside: ["Data da medição"] });
  assert.equal(
    sectionIssues({ ...asDraft(profile), name: "" }, first).fields.name,
    "Informe seu nome.",
  );
  assert.equal(
    SECTION_EDIT_COPY.outside(["Data da medição"]),
    "Esta alteração depende de outra resposta: Data da medição. Revise também em Revisar tudo.",
  );
  assert.equal(isSectionDirty(profile, asDraft(profile), first), false);
  assert.equal(isSectionDirty(profile, { ...asDraft(profile), weight: "72" }, sectionIndexOf("weight")), false);
  assert.equal(isSectionDirty(profile, { ...asDraft(profile), goal: "perder" }, first), true);
  assert.equal(isSectionDirty(profile, { ...asDraft(profile), goal: "perder" }, sectionIndexOf("allergies")), false);
});

test("saveSection: grava como a anamnese (metas do dia) e preserva o rascunho do 'Revisar tudo'", () => {
  const state = stateFixture();
  const first = sectionIndexOf("name");
  const answers = { ...asDraft(state.profile!), goal: "perder" };
  const saved = saveSection(state, answers, first);
  assert.equal(saved.profile!.goal, "perder");
  assert.equal(saved.goalHistory.find((h) => h.date === localDate())!.profile.goal, "perder");
  assert.equal(saved.draft, null);
  assert.equal(saved.draftStep, 0);
  const withDraft = {
    ...state,
    draft: { ...asDraft(state.profile!), anamneseFlow: 2, goal: "manter", sleepQuality: "regular" },
    draftStep: 5,
  };
  const merged = saveSection(withDraft, { ...answers, sleepQuality: "ruim" }, first);
  assert.equal(merged.draft!.goal, "perder");
  assert.equal(merged.draft!.sleepQuality, "regular");
  assert.equal(merged.draft!.anamneseFlow, 2);
  assert.equal(merged.draftStep, 5);
  assert.equal(merged.profile!.goal, "perder");
  assert.throws(() => saveSection({ ...state, profile: null }, answers, first), /anamnese/);
  assert.throws(() => saveSection(state, { ...answers, name: "" }, first));
});

test("sectionAnswers: números do corpo como Oculto quando a pessoa os ocultou", () => {
  const index = sectionIndexOf("weight");
  const hidden = { ...profileFixture(), hideBodyNumbers: true, waist: 82 };
  const answers = sectionAnswers(hidden, index);
  const valueOf = (key: string) => answers.find((a) => a.key === key)?.value;
  assert.equal(valueOf("weight"), "Oculto");
  assert.equal(valueOf("height"), "Oculto");
  assert.equal(valueOf("waist"), "Oculto");
  assert.equal(valueOf("measurementMethod"), "Balança em casa");
  assert.ok(!answers.some((a) => /\d+(,\d+)?$/.test(a.value) && ["weight", "height", "waist", "hip", "bodyFat"].includes(a.key)));
  assert.equal(sectionAnswers(profileFixture(), index).find((a) => a.key === "weight")?.value, "72");
  const goals = sectionIndexOf("manualCalories");
  const perder = { ...hidden, goal: "perder" as const, targetWeight: 65 };
  assert.equal(sectionAnswers(perder, goals).find((a) => a.key === "targetWeight")?.value, "Oculto");
});

test("anamneseCompletion: 100% e 7 seções no perfil salvo; resposta essencial em branco baixa o anel", () => {
  const done = anamneseCompletion(profileFixture(), today);
  assert.equal(done.percent, 100);
  assert.deepEqual([done.sections, done.completeSections, done.isComplete], [7, 7, true]);
  assert.equal(done.label, "Anamnese completa · 7 seções");
  assert.equal(done.answered, done.total);
  const partial = anamneseCompletion({ ...profileFixture(), occupation: "", sleepHours: "" as unknown as number }, today);
  assert.ok(partial.percent < 100);
  assert.equal(partial.isComplete, false);
  assert.equal(partial.completeSections, 5);
  assert.equal(partial.label, "Anamnese · 5 de 7 seções");
  assert.equal(PROFILE_HUB_COPY.title, "Perfil de saúde");
});

test("goalChip: objetivo do perfil; nunca em perfil calmo (sensível ou menor)", () => {
  assert.equal(goalChip(withProfile({ goal: "perder" }), today), "Reduzir o peso");
  assert.equal(goalChip(withProfile({ goal: "manter" }), today), "Manter o peso");
  assert.equal(goalChip(withProfile({ goal: "perder", eatingDisorder: "sim" }), today), null);
  assert.equal(goalChip(withProfile({ goal: "perder", birthDate: MINOR_BIRTH }), today), null);
});

test("healthMosaic: alergias, o que evita, caneta pelo último registro, rotina curta; nada de condição", () => {
  const base = stateFixture();
  const profile = withProfile({
    allergies: "sim",
    allergyDetails: "Amendoim, Camarão",
    avoidedFoods: "Frituras, Refrigerantes",
    conditions: "Hipertensão",
    medications: "Medicamento para emagrecer, Losartana 50 mg 1x ao dia, Metformina ou outro para diabetes",
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro (tirzepatida)",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    occupation: "Trabalho em escritório",
    cookingTime: "30 minutos por dia",
  });
  const injection = {
    id: "inj-1",
    userId: base.userId,
    date: shiftDate(today, -2),
    time: "08:30",
    createdAt: `${shiftDate(today, -2)}T08:30:00.000Z`,
    updatedAt: `${shiftDate(today, -2)}T08:30:00.000Z`,
    method: "frasco" as const,
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100 as const,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen" as const,
    side: null,
    notes: "",
  };
  const mosaic = healthMosaic({ ...base, profile, injections: [injection] }, today);
  assert.deepEqual(mosaic.allergies, ["Amendoim", "Camarão"]);
  assert.deepEqual(mosaic.avoided, ["Frituras", "Refrigerantes"]);
  // Dose só do registro (2 casas, como na Seringa); os outros remédios só como contagem.
  assert.deepEqual(mosaic.medication, { tags: ["GLP-1"], name: "Mounjaro", dose: "2,50 mg", extraCount: 2 });
  // Sem o nome da caneta na anamnese, vale o da última aplicação registrada.
  const unnamed = { ...profile, weightLossPenName: "Não sei o nome" };
  assert.equal(
    healthMosaic({ ...base, profile: unnamed, injections: [injection] }, today).medication.name,
    "Tirzepatida",
  );
  assert.deepEqual(mosaic.routine, ["Escritório", "30 min cozinha"]);
  assert.doesNotMatch(JSON.stringify(mosaic), /Hipertens|Losartana|Metformina|(?<![\d,])50 mg/);
  // Sem aplicação registrada: o nome da caneta e nenhuma dose.
  const noShot = healthMosaic({ ...base, profile, injections: [] }, today).medication;
  assert.deepEqual(noShot, { tags: ["GLP-1"], name: "Mounjaro", dose: null, extraCount: 2 });
  // Sem caneta e sem registros: nada de GLP-1; "não sei" vira "A confirmar"; nada evitado = [].
  const plain = healthMosaic(
    { ...base, profile: withProfile({ allergies: "nao_sei", avoidedFoods: "Nada em especial", weightLossPen: "nao" }) },
    today,
  );
  assert.deepEqual(plain.allergies, ["A confirmar"]);
  assert.deepEqual(plain.avoided, []);
  assert.deepEqual(plain.medication.tags, []);
  assert.equal(plain.medication.dose, null);
  assert.deepEqual(healthMosaic({ ...base, profile: null }, today).routine, []);
});
