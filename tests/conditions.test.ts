import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_CONDITION_TAGS,
  bmiOf,
  BLOCKING_CONDITION_TAGS,
  CARE_NOTES_CLOSING,
  CARE_TEXT_MAX,
  careItemsFor,
  careItemsOf,
  careNotesFor,
  CONDITION_GROUPS,
  CONDITION_LABELS,
  CONDITION_TAGS,
  conditionLabels,
  formatConditionTags,
  GLUCOSE_CARE_NOTE,
  hasBlockingCondition,
  parseConditionTags,
  PEN_CARE_NOTE,
  PEN_CARE_NOTE_NO_WATER,
  toggleConditionTag,
  UNDERWEIGHT_CARE_NOTE,
} from "../src/lib/conditions";
import { draftConditionTags } from "../src/lib/anamnese-flow";

test("lista fechada: 7 com ajustes, 5 que pedem avaliação e “Nenhuma”, cada uma com rótulo", () => {
  assert.equal(ALLOWED_CONDITION_TAGS.length, 7);
  assert.equal(BLOCKING_CONDITION_TAGS.length, 5);
  assert.equal(CONDITION_TAGS.length, 13);
  assert.equal(CONDITION_LABELS.hipertensao, "Hipertensão (pressão alta)");
  assert.equal(CONDITION_LABELS.diabetes_tipo_1_insulina, "Diabetes tipo 1 ou uso de insulina");
  assert.equal(CONDITION_LABELS.nenhuma, "Nenhuma");
  // Os grupos cobrem a lista inteira, sem repetir; títulos curtos da anamnese (polimento 2026-10-01).
  const grouped = CONDITION_GROUPS.flatMap((g) => g.tags);
  assert.deepEqual([...grouped].sort(), [...CONDITION_TAGS].sort());
  assert.deepEqual(
    CONDITION_GROUPS.map((g) => g.title),
    ["Sem condições", "Com ajustes nas metas", "Com orientação individual"],
  );
  assert.ok(BLOCKING_CONDITION_TAGS.includes("outra"));
});

test("rascunho em texto “a,b” ↔ lista validada", () => {
  assert.deepEqual(parseConditionTags("hipertensao, diabetes_tipo_2"), [
    "hipertensao",
    "diabetes_tipo_2",
  ]);
  assert.deepEqual(parseConditionTags(["obesidade", "inventada", 3]), ["obesidade"]);
  assert.deepEqual(parseConditionTags("hipertensao,,hipertensao"), ["hipertensao"]);
  for (const empty of ["", null, undefined, 7, true])
    assert.deepEqual(parseConditionTags(empty), []);
  assert.equal(formatConditionTags(["hipertensao", "outra"]), "hipertensao,outra");
  assert.deepEqual(parseConditionTags(formatConditionTags(["gordura_figado"])), [
    "gordura_figado",
  ]);
  assert.deepEqual(draftConditionTags({ conditionTags: "pre_diabetes" }), ["pre_diabetes"]);
});

test("marcar condições: “Nenhuma” limpa as demais e sai quando outra é marcada", () => {
  assert.deepEqual(toggleConditionTag(["hipertensao"], "nenhuma"), ["nenhuma"]);
  assert.deepEqual(toggleConditionTag(["nenhuma"], "obesidade"), ["obesidade"]);
  assert.deepEqual(toggleConditionTag(["hipertensao", "obesidade"], "hipertensao"), [
    "obesidade",
  ]);
  assert.deepEqual(toggleConditionTag([], "outra"), ["outra"]);
});

test("bloqueio e rótulos das condições declaradas", () => {
  assert.equal(hasBlockingCondition(["hipertensao", "obesidade"]), false);
  assert.equal(hasBlockingCondition(["nenhuma"]), false);
  assert.equal(hasBlockingCondition(["hipertensao", "doenca_renal"]), true);
  assert.equal(hasBlockingCondition(["outra"]), true);
  assert.deepEqual(conditionLabels(["nenhuma"]), []);
  assert.deepEqual(conditionLabels(["pre_diabetes", "outra"]), ["Pré-diabetes", "Outra"]);
});

test("IMC: peso ÷ altura²; nulo sem peso ou altura", () => {
  assert.ok(Math.abs(bmiOf(72, 165)! - 26.446) < 0.001);
  assert.equal(bmiOf(0, 165), null);
  assert.equal(bmiOf(72, 0), null);
  assert.equal(bmiOf(Number.NaN, 165), null);
});

test("cuidados: uma linha por cuidado, glicose uma vez e fechamento só quando algum se aplica", () => {
  assert.deepEqual(
    careNotesFor({ conditionTags: [], usesPen: false, underweightForLoss: false, fluidRestriction: "nao" }),
    [],
  );
  assert.deepEqual(
    careNotesFor({ conditionTags: ["nenhuma"], usesPen: false, underweightForLoss: false, fluidRestriction: "nao" }),
    [],
  );
  const all = careNotesFor({
    conditionTags: [...ALLOWED_CONDITION_TAGS],
    usesPen: true,
    underweightForLoss: true,
    fluidRestriction: "nao",
  });
  // 7 condições com 2 de glicose numa linha só, caneta, IMC baixo e fechamento.
  assert.equal(all.length, 6 + 1 + 1 + 1);
  assert.equal(all.at(-1), CARE_NOTES_CLOSING);
  assert.ok(all.includes(PEN_CARE_NOTE));
  assert.ok(all.includes(UNDERWEIGHT_CARE_NOTE));
  for (const note of all) assert.ok(!/\d/.test(note), note);
});

test("cuidados em chips: rótulo curto, ícone e frase de até 90 caracteres, na ordem condições → caneta → IMC baixo", () => {
  const items = careItemsFor({
    conditionTags: ["hipertensao", "pre_diabetes", "diabetes_tipo_2", "obesidade"],
    usesPen: true,
    underweightForLoss: true,
    fluidRestriction: "nao",
  });
  assert.deepEqual(
    items.map((item) => [item.key, item.label, item.icon]),
    [
      ["pressao", "Pressão alta", "heartPulse"],
      ["glicose", "Glicose", "droplet"],
      ["imc", "IMC", "scale"],
      ["caneta", "Caneta", "syringe"],
      ["imc_baixo", "IMC baixo", "shieldCheck"],
    ],
  );
  // Todas as frases (as 7 condições, as duas da caneta e a do IMC baixo): curtas, "Rótulo: frase", sem números.
  const every = [
    ...careItemsFor({
      conditionTags: [...ALLOWED_CONDITION_TAGS],
      usesPen: true,
      underweightForLoss: true,
      fluidRestriction: "nao",
    }),
    ...careItemsFor({ conditionTags: [], usesPen: true, underweightForLoss: false, fluidRestriction: "sim" }),
  ];
  assert.equal(every.length, 6 + 1 + 1 + 1);
  for (const item of every) {
    assert.ok(item.text.length <= CARE_TEXT_MAX, `${item.text} (${item.text.length})`);
    assert.ok(item.text.startsWith(`${item.label}: `), item.text);
    assert.match(item.body, /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/, item.body);
    assert.ok(!/\d|kcal|\bkg\b|\bmg\b|dose/i.test(item.text), item.text);
    assert.ok(item.label.split(" ").length <= 2, item.label);
  }
  assert.equal(GLUCOSE_CARE_NOTE, "Glicose: distribua os carboidratos no dia, com integrais, fibras e proteína.");
});

test("careItemsOf devolve os cuidados por trás de Goals.careNotes, sem o fechamento; frase desconhecida vira genérica", () => {
  const input = { conditionTags: ["gordura_figado" as const], usesPen: true, underweightForLoss: false, fluidRestriction: "nao" };
  const notes = careNotesFor(input);
  assert.deepEqual(careItemsOf(notes), careItemsFor(input));
  assert.deepEqual(careItemsOf([]), []);
  assert.deepEqual(careItemsOf([CARE_NOTES_CLOSING]), []);
  const [other] = careItemsOf(["Frase nova do servidor."]);
  assert.deepEqual(other, {
    key: "outro",
    label: "Cuidado",
    icon: "stethoscope",
    body: "Frase nova do servidor.",
    text: "Frase nova do servidor.",
  });
});

test("caneta com restrição de líquidos (ou sem resposta): o cuidado não fala em beber água", () => {
  for (const fluidRestriction of ["sim", "nao_sei", ""]) {
    const notes = careNotesFor({ conditionTags: [], usesPen: true, underweightForLoss: false, fluidRestriction });
    assert.deepEqual(notes, [PEN_CARE_NOTE_NO_WATER, CARE_NOTES_CLOSING]);
    for (const note of notes) assert.doesNotMatch(note, /água/);
  }
  assert.match(PEN_CARE_NOTE, /água/);
});
