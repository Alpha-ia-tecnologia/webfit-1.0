import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_CANDIDATES_MAX,
  LABEL_CONC_MAX,
  LABEL_CONC_MIN,
  LABEL_PHOTO_ERRORS,
  LABEL_PROBLEM_TEXT,
  LABEL_PROBLEMS,
  labelReadSchema,
  renderLabelText,
  sanitizeLabelRead,
  trechoMatches,
  type LabelCandidate,
  type LabelRead,
} from "../src/lib/label-read";
import { CONCENTRATION_MAX, CONCENTRATION_MIN } from "../src/lib/injection";
import { LABEL_READ, LABEL_READ_MULTI, LABEL_READ_NONE } from "./label-fixtures";

const candidate = (
  mg: number,
  ml: number,
  trecho: string,
  confianca: LabelCandidate["confianca"] = "high",
): LabelCandidate => ({ mg, ml, trecho, confianca });
const read = (candidatos: LabelCandidate[], over: Partial<LabelRead> = {}): LabelRead => ({
  nome: null,
  candidatos,
  problemas: [],
  ...over,
});

test("esquema do rótulo: nome recortado, até 3 candidatos e problemas conhecidos", () => {
  assert.deepEqual(labelReadSchema.parse(LABEL_READ), LABEL_READ);
  assert.deepEqual(labelReadSchema.parse(LABEL_READ_MULTI), LABEL_READ_MULTI);
  assert.deepEqual(labelReadSchema.parse(LABEL_READ_NONE), LABEL_READ_NONE);
  assert.equal(labelReadSchema.parse({ ...LABEL_READ, nome: "x".repeat(70) }).nome, "x".repeat(60));
  const four = Array.from({ length: LABEL_CANDIDATES_MAX + 1 }, () => LABEL_READ.candidatos[0]);
  assert.equal(labelReadSchema.safeParse({ ...LABEL_READ, candidatos: four }).success, false);
  assert.equal(labelReadSchema.safeParse({ ...LABEL_READ, problemas: ["x"] }).success, false);
  assert.equal(labelReadSchema.safeParse({ ...LABEL_READ, nome: null }).success, true);
  assert.equal(
    labelReadSchema.safeParse({ ...LABEL_READ, candidatos: [{ ...LABEL_READ.candidatos[0], mg: "10" }] }).success,
    false,
    "número como texto não passa",
  );
});

test("trechoMatches: o trecho impresso precisa conter os números e as unidades", () => {
  assert.equal(trechoMatches(candidate(10, 2, "10 mg/2 mL")), true);
  assert.equal(trechoMatches(candidate(5, 1, "5mg/mL")), true);
  assert.equal(trechoMatches(candidate(5, 1, "cada mL contém 5 mg")), true);
  assert.equal(trechoMatches(candidate(2.5, 0.5, "2,5 mg/0,5 mL")), true);
  assert.equal(trechoMatches(candidate(10, 2, "5 mg/mL")), false);
  assert.equal(trechoMatches(candidate(5, 1, "5 mg")), false);
  assert.equal(trechoMatches(candidate(5, 2, "5 mg/mL")), false);
  assert.equal(trechoMatches(candidate(5, 1, "5 mcg/mL")), false, "mcg não é mg");
});

test("trechoMatches: o número do mg fica preso a 'mg' e o do ml a 'ml' (sem troca nem ml implícito errado)", () => {
  assert.equal(trechoMatches(candidate(2, 10, "10 mg/2 mL")), false, "mg e ml trocados");
  assert.equal(trechoMatches(candidate(10, 1, "10 mg/2 mL")), false, "ml impresso é 2, não 1");
  assert.equal(trechoMatches(candidate(2.5, 1, "2,5 mg/0,5 mL")), false, "ml impresso é 0,5, não 1");
  assert.equal(trechoMatches(candidate(5, 1, "lote 5 mg ml")), false, "mg e ml soltos, sem par");
  assert.equal(trechoMatches(candidate(5, 1, "5 mcg/1 mL")), false, "mcg não é mg");
  assert.equal(trechoMatches(candidate(0.5, 1, "2,5 mg/mL")), false, "pedaço de número não vale");
  assert.equal(trechoMatches(candidate(5, 1, "5 mg/1 mL")), true, "ml 1 impresso");
  assert.equal(trechoMatches(candidate(5, 1, "5 mg por mL")), true);
  assert.equal(trechoMatches(candidate(10, 2, "Tirzepatida 10 mg/2 mL")), true);
  assert.equal(trechoMatches(candidate(5, 1, "10 mg/2 mL (5 mg/mL)")), true, "qualquer par impresso vale");
  assert.equal(trechoMatches(candidate(2.5, 0.5, "cada 0,5 mL contém 2,5 mg")), true);
  assert.deepEqual(
    sanitizeLabelRead(read([candidate(2.5, 1, "2,5 mg/0,5 mL")])).candidatos,
    [],
    "o candidato com ml errado sai da leitura",
  );
});

test("sanitizeLabelRead: tira valores implausíveis, repetidos e fora do trecho; ordena por confiança", () => {
  const dirty = read(
    [
      candidate(60, 1, "60 mg/mL"),
      candidate(0.05, 1, "0,05 mg/mL"),
      candidate(Number.NaN, 1, "NaN mg/mL"),
      candidate(-5, 1, "-5 mg/mL"),
    ],
    { nome: "  ", problemas: ["cortado", "reflexo", "cortado"] },
  );
  assert.deepEqual(sanitizeLabelRead(dirty), { nome: null, candidatos: [], problemas: ["reflexo", "cortado"] });
  assert.deepEqual(sanitizeLabelRead(read([candidate(1200, 2, "1200 mg/2 mL")])).candidatos, []);
  assert.deepEqual(sanitizeLabelRead(read([candidate(5, 12, "5 mg/12 mL")])).candidatos, [], "volume acima de 10 ml");
  const deduped = sanitizeLabelRead(
    read([candidate(10, 2, "10 mg/2 mL", "medium"), candidate(5, 1, "5 mg/mL", "high")]),
  );
  assert.deepEqual(deduped.candidatos, [candidate(5, 1, "5 mg/mL", "high")]);
  const ordered = sanitizeLabelRead(
    read([
      candidate(2.5, 1, "2,5 mg/mL", "low"),
      candidate(10, 1, "10 mg/mL", "medium"),
      candidate(5, 1, " 5 mg/mL ", "high"),
    ]),
  );
  assert.deepEqual(ordered.candidatos.map((c) => [c.trecho, c.confianca]), [
    ["5 mg/mL", "high"],
    ["10 mg/mL", "medium"],
    ["2,5 mg/mL", "low"],
  ]);
  assert.deepEqual(sanitizeLabelRead(LABEL_READ), LABEL_READ);
  assert.equal(sanitizeLabelRead({ ...LABEL_READ, nome: " Mounjaro " }).nome, "Mounjaro");
  // Pura: o valor recebido não muda.
  const original = read([candidate(5, 1, " 5 mg/mL ")], { problemas: ["cortado", "reflexo"] });
  sanitizeLabelRead(original);
  assert.deepEqual(original, read([candidate(5, 1, " 5 mg/mL ")], { problemas: ["cortado", "reflexo"] }));
});

test("renderLabelText: texto fixo, sem a concentração calculada", () => {
  assert.equal(
    renderLabelText(LABEL_READ),
    '**Leitura do rótulo** (confira no frasco)\n- Nome impresso: Tirzepatida\n- No rótulo: "10 mg/2 mL" (mg 10; ml 2; confiança alta)',
  );
  assert.equal(
    renderLabelText(read([candidate(2.5, 0.5, "2,5 mg/0,5 mL", "medium")])),
    '**Leitura do rótulo** (confira no frasco)\n- No rótulo: "2,5 mg/0,5 mL" (mg 2,5; ml 0,5; confiança média)',
  );
  assert.equal(
    renderLabelText(LABEL_READ_NONE),
    "**Leitura do rótulo** (confira no frasco)\n- Nenhuma concentração legível na foto.\n- Observações: A foto ficou desfocada. Parte do rótulo ficou fora da foto.",
  );
  assert.equal(renderLabelText(LABEL_READ).includes("mg/ml"), false, "a conta mg ÷ ml é só do app");
});

test("limites da leitura iguais aos da calculadora; todo problema tem texto", () => {
  assert.equal(LABEL_CONC_MIN, CONCENTRATION_MIN);
  assert.equal(LABEL_CONC_MAX, CONCENTRATION_MAX);
  for (const problem of LABEL_PROBLEMS) assert.ok(LABEL_PROBLEM_TEXT[problem], problem);
  for (const text of Object.values(LABEL_PROBLEM_TEXT))
    assert.doesNotMatch(text, /\bUI\b|aspir|aplique|aument|reduz|ajust/i, text);
});

test("LABEL_PHOTO_ERRORS: mesma mensagem no web e no app", () => {
  assert.equal(LABEL_PHOTO_ERRORS.prepare, "Não foi possível preparar a foto. Tente de novo.");
  assert.equal(LABEL_PHOTO_ERRORS.open, "Não foi possível abrir a foto.");
});
