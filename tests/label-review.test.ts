import { test } from "node:test";
import assert from "node:assert/strict";
import { labelReview, type LabelReviewModel } from "../src/lib/label-review";
import type { LabelRead } from "../src/lib/label-read";
import { stageLabel, stageMode } from "../src/lib/agent-stream";
import { LABEL_READ, LABEL_READ_MULTI, LABEL_READ_NONE } from "./label-fixtures";

const NO_DOSE_TEXT = /\bUI\b|aspir|aplique|aument|reduz|ajust/i;
const strings = (m: LabelReviewModel): string[] =>
  [
    m.title,
    m.confirmLabel,
    m.nameLine,
    m.medicationWarning,
    ...m.problems,
    ...m.choices.flatMap((c) => [c.text, c.printed, c.roundedNote, c.confidence, c.radioLabel]),
  ].filter((s): s is string => s !== null);

test("um candidato: 'Confira: 5 mg/ml?', pré-selecionado e com o nome impresso", () => {
  const model = labelReview(LABEL_READ, "tirzepatida");
  assert.equal(model.state, "single");
  assert.equal(model.title, "Confira: 5 mg/ml?");
  assert.deepEqual(model.choices[0], {
    id: "c0",
    concentration: 5,
    text: "5 mg/ml",
    printed: "10 mg/2 mL",
    isRounded: false,
    roundedNote: null,
    confidence: "Confiança alta",
    radioLabel: "5 mg/ml, no rótulo “10 mg/2 mL”",
  });
  assert.equal(model.preselected, "c0");
  assert.equal(model.confirmLabel, "Sim, usar 5 mg/ml");
  assert.equal(model.nameLine, "Nome no rótulo: Tirzepatida");
  assert.equal(model.medicationWarning, null);
  assert.deepEqual(model.problems, []);
});

test("aviso de medicamento só quando o nome impresso é de outro medicamento da calculadora", () => {
  assert.equal(
    labelReview(LABEL_READ, "semaglutida").medicationWarning,
    "O nome no rótulo parece ser Tirzepatida, e a calculadora está em Semaglutida. Confira antes de usar.",
  );
  assert.equal(
    labelReview(LABEL_READ, "personalizado").medicationWarning,
    "O nome no rótulo parece ser Tirzepatida, e a calculadora está em Personalizado. Confira antes de usar.",
  );
  assert.equal(labelReview({ ...LABEL_READ, nome: "Mounjaro" }, "tirzepatida").medicationWarning, null);
  assert.equal(labelReview({ ...LABEL_READ, nome: "Produto X" }, "tirzepatida").medicationWarning, null);
  assert.equal(labelReview({ ...LABEL_READ, nome: "Não sei" }, "tirzepatida").medicationWarning, null);
  const noName = labelReview({ ...LABEL_READ, nome: null }, "semaglutida");
  assert.equal(noName.nameLine, null);
  assert.equal(noName.medicationWarning, null);
});

test("concentração arredondada em 2 casas, com a conta explicada", () => {
  const read: LabelRead = { nome: null, candidatos: [{ mg: 10, ml: 3, trecho: "10 mg/3 mL", confianca: "medium" }], problemas: [] };
  const [choice] = labelReview(read, "tirzepatida").choices;
  assert.equal(choice.concentration, 3.33);
  assert.equal(choice.text, "3,33 mg/ml");
  assert.equal(choice.isRounded, true);
  assert.equal(choice.roundedNote, "Valor arredondado: 10 mg em 3 ml ≈ 3,33 mg/ml.");
  assert.equal(choice.confidence, "Confiança média");
});

test("vários candidatos: a pessoa escolhe; nada vem marcado", () => {
  const model = labelReview(LABEL_READ_MULTI, "semaglutida");
  assert.equal(model.state, "multiple");
  assert.equal(model.title, "Qual concentração está no seu frasco?");
  assert.equal(model.choices.length, 2);
  assert.deepEqual(model.choices.map((c) => [c.id, c.concentration]), [
    ["c0", 5],
    ["c1", 2.5],
  ]);
  assert.equal(model.preselected, null);
  assert.equal(model.confirmLabel, "Usar a concentração escolhida");
  assert.deepEqual(model.problems, ["Há reflexo sobre o rótulo."]);
  assert.equal(model.choices[0].radioLabel, "5 mg/ml, no rótulo “5 mg/mL”");
  assert.equal(model.choices[1].radioLabel, "2,5 mg/ml, no rótulo “2,5 mg/mL”");
});

test("nenhum candidato ou resposta sem estrutura: 'Não encontrei a concentração'", () => {
  for (const read of [LABEL_READ_NONE, null]) {
    const model = labelReview(read, "tirzepatida");
    assert.equal(model.state, "none");
    assert.equal(model.title, "Não encontrei a concentração");
    assert.deepEqual(model.choices, []);
    assert.equal(model.preselected, null);
    assert.equal(model.confirmLabel, "");
  }
  assert.deepEqual(labelReview(LABEL_READ_NONE, "tirzepatida").problems, [
    "Parte do rótulo ficou fora da foto.",
    "A foto ficou desfocada.",
  ]);
  assert.deepEqual(labelReview(null, "tirzepatida").problems, []);
});

test("o valor do servidor é limpo de novo: candidato sem o número no trecho sai", () => {
  const fromServer: LabelRead = {
    ...LABEL_READ,
    candidatos: [...LABEL_READ.candidatos, { mg: 10, ml: 2, trecho: "5 mg/mL", confianca: "low" }],
  };
  const model = labelReview(fromServer, "tirzepatida");
  assert.equal(model.state, "single");
  assert.deepEqual(model.choices.map((c) => c.printed), ["10 mg/2 mL"]);
});

test("nenhum texto da conferência fala em unidades da seringa, aspirar ou ajustar dose", () => {
  const models = [
    labelReview(LABEL_READ, "semaglutida"),
    labelReview(LABEL_READ_MULTI, "tirzepatida"),
    labelReview(LABEL_READ_NONE, "tirzepatida"),
    labelReview(
      {
        nome: "Ozempic",
        candidatos: [{ mg: 10, ml: 3, trecho: "10 mg/3 mL", confianca: "low" }],
        problemas: ["reflexo", "cortado", "desfocado", "varias_concentracoes", "nao_e_rotulo"],
      },
      "tirzepatida",
    ),
  ];
  for (const text of models.flatMap(strings)) assert.doesNotMatch(text, NO_DOSE_TEXT, text);
});

test("etapas do agente no modo rótulo", () => {
  assert.equal(stageMode("rotulo"), "rotulo");
  assert.equal(stageLabel("especialista", "rotulo"), "Lendo o rótulo");
  assert.equal(stageLabel("contexto", "rotulo"), "Preparando a foto");
  assert.equal(stageLabel("revisao", "rotulo"), "Conferindo a leitura");
});
