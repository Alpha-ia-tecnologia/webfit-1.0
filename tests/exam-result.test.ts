import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAM_TEXT_MAX,
  biomarkerHistory,
  biomarkerKey,
  biomarkerScale,
  biomarkerSpeech,
  classifiesResult,
  examCounters,
  examGroups,
  examResultSchema,
  historySpeech,
  parseLabNumber,
  parseReference,
  renderExamText,
  sanitizeExamResult,
  type Biomarker,
  type ExamResult,
} from "../src/lib/exam-result";
import { stringLeaves } from "../src/lib/structured";
import { EXAM_REVIEW_ADDENDUM, POLICY } from "../server/graph/prompts";
import { EXAM_RESULT } from "./structured-fixtures";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const [GLICOSE, HBA1C, HDL, TRIGLICERIDES, VITAMINA_D] = EXAM_RESULT.resultados as [
  Biomarker,
  Biomarker,
  Biomarker,
  Biomarker,
  Biomarker,
];

test("renderExamText: texto exato, grupos na ordem do laudo e sem grupo em 'Outros resultados'", () => {
  assert.equal(
    renderExamText(EXAM_RESULT),
    [
      "**Resultados transcritos · coleta em 10/08/2026**",
      "",
      "### Bioquímica",
      "- Glicose: 102 mg/dL · referência do laudo: 70 a 99 mg/dL · marcação do laudo: H",
      "- Hemoglobina glicada: 5,4 % · referência do laudo: < 5,7",
      "",
      "### Lipídios",
      "- Colesterol HDL: 52 mg/dL · referência do laudo: > 40 mg/dL",
      "- Triglicerídeos: 140 mg/dL · referência do laudo: Desejável: < 150",
      "",
      "### Outros resultados",
      "- Vitamina D: Ver laudo anexo · referência do laudo: não impressa",
      "",
      "**Não foi possível ler**",
      "- Rodapé da página 2, coberto por um carimbo",
      "",
      "**Observações da leitura**",
      "- Leitura feita a partir de uma foto inclinada do laudo.",
      "",
      "**Perguntas para levar ao profissional**",
      "- O valor de glicose pede repetir o exame?",
      "- Com que frequência devo refazer estes exames?",
    ].join("\n"),
  );
  const noGroups: ExamResult = {
    ...EXAM_RESULT,
    data: null,
    resultados: EXAM_RESULT.resultados.map((row) => ({ ...row, grupo: null })),
    ilegiveis: [],
    observacoes: [],
    perguntas: [],
  };
  const plain = renderExamText(noGroups);
  assert.doesNotMatch(plain, /###/);
  assert.match(plain, /^\*\*Resultados transcritos\*\*\n\n- Glicose: 102 mg\/dL/);
  assert.doesNotMatch(plain, /Não foi possível ler|Observações|Perguntas/);
  assert.equal(
    renderExamText({ ...noGroups, resultados: [], ilegiveis: ["Página 1 inteira"] }),
    "**Resultados transcritos**\n\nNenhum resultado legível foi transcrito.\n\n**Não foi possível ler**\n- Página 1 inteira",
  );
});

test("renderExamText: só copia o laudo, sem classificar, e todo texto transcrito aparece", () => {
  const text = renderExamText(EXAM_RESULT);
  assert.doesNotMatch(text, /\bnormal|alterad|acima|abaixo|elevad/i);
  for (const leaf of stringLeaves({ ...EXAM_RESULT, data: null }))
    assert.ok(text.includes(leaf), leaf);
  assert.ok(text.includes("10/08/2026"));
  assert.ok(!text.includes("2026-08-10"));
});

test("examGroups: ordem de primeira aparição, 'Outros resultados' por último, lista vazia sem resultados", () => {
  const groups = examGroups(EXAM_RESULT);
  assert.deepEqual(
    groups.map((g) => [g.title, g.rows.map((r) => r.nome)]),
    [
      ["Bioquímica", ["Glicose", "Hemoglobina glicada"]],
      ["Lipídios", ["Colesterol HDL", "Triglicerídeos"]],
      ["Outros resultados", ["Vitamina D"]],
    ],
  );
  const single = examGroups({ ...EXAM_RESULT, resultados: [VITAMINA_D] });
  assert.deepEqual(single, [{ title: null, rows: [VITAMINA_D] }]);
  assert.deepEqual(examGroups({ ...EXAM_RESULT, resultados: [] }), []);
  // Mesmo painel com grafias diferentes fica num grupo só (o primeiro título vale).
  const mixed = examGroups({
    ...EXAM_RESULT,
    resultados: [GLICOSE, { ...HDL, grupo: "BIOQUIMICA" }],
  });
  assert.deepEqual(mixed.map((g) => [g.title, g.rows.length]), [["Bioquímica", 2]]);
});

test("sanitizeExamResult: apara, tira linhas vazias, junta repetidas, limpa listas e nunca muta", () => {
  const dirty: ExamResult = {
    ...EXAM_RESULT,
    resultados: [
      { ...GLICOSE, nome: "  Glicose ", unidade: " mg/dL ", marcacao: " " },
      { ...GLICOSE, nome: "GLICOSE", unidade: "MG/DL" },
      { ...HDL, nome: "   " },
      { ...HDL, valor: "" },
      { ...VITAMINA_D, grupo: "  " },
    ],
    ilegiveis: ["", "  Rodapé  ", "rodapé"],
    perguntas: ["Pergunta?", "pergunta?", " "],
    observacoes: [],
  };
  const before = clone(dirty);
  const clean = sanitizeExamResult(dirty)!;
  assert.deepEqual(dirty, before);
  // A repetida completa a marca vazia da primeira: "Laudo: H" não se perde.
  assert.deepEqual(clean.resultados, [GLICOSE, { ...VITAMINA_D, grupo: null }]);
  // Mesmo valor com referência ou marca diferentes do laudo: as duas linhas ficam.
  const divergent = sanitizeExamResult({
    ...EXAM_RESULT,
    resultados: [GLICOSE, { ...GLICOSE, referencia: "65 a 99 mg/dL" }, { ...GLICOSE, marcacao: "L" }],
  })!;
  assert.equal(divergent.resultados.length, 3);
  assert.deepEqual(clean.ilegiveis, ["Rodapé"]);
  assert.deepEqual(clean.perguntas, ["Pergunta?"]);
  assert.deepEqual(sanitizeExamResult(EXAM_RESULT), EXAM_RESULT);
  const empty = { ...EXAM_RESULT, resultados: [], ilegiveis: [] };
  assert.equal(sanitizeExamResult(empty), null);
  assert.equal(sanitizeExamResult({ ...EXAM_RESULT, resultados: [{ ...HDL, valor: " " }], ilegiveis: [] }), null);
  assert.ok(sanitizeExamResult({ ...empty, ilegiveis: ["Página 1 inteira"] }));
  // 60 linhas longas, cada uma num painel: o texto passaria do limite da guarda → reserva em texto.
  const long = (n: number, size: number) => `${n}`.padEnd(size, "x");
  const big: ExamResult = {
    ...EXAM_RESULT,
    resultados: Array.from({ length: 60 }, (_, i) => ({
      grupo: long(i, 50),
      nome: long(i, 80),
      valor: long(i, 30),
      unidade: long(i, 20),
      referencia: long(i, 120),
      marcacao: long(i, 20),
    })),
  };
  assert.ok(renderExamText(big).length > EXAM_TEXT_MAX);
  assert.equal(sanitizeExamResult(big), null);
});

test("sanitizeExamResult: perguntas, observações e ilegíveis que classificam resultado saem; a marca do laudo fica", () => {
  const classifying = [
    "A glicose está alta?",
    "Meu HDL está normal?",
    "Os resultados normais dispensam retorno?",
    "Glicose acima da referência preocupa?",
    "Por que a vitamina D está abaixo do esperado?",
    "O colesterol elevado exige remédio?",
    "Triglicerídeos aumentados mudam a dieta?",
    "Hemoglobina diminuída pede suplemento?",
    "O valor está fora da faixa?",
    "Está dentro dos valores de referência?",
    "Há alteração no hemograma?",
    "Ferritina baixa explica o cansaço?",
    "Valor limítrofe de glicose é pré-diabetes?",
    "Tenho deficiência de vitamina B12?",
    "Resultado alterado da TSH",
  ];
  const neutral = [
    "O valor de glicose pede repetir o exame?",
    "Com que frequência devo refazer estes exames?",
    "Preciso de jejum na próxima coleta?",
    "Devo alterar algo na alimentação antes do retorno?",
    "Qual a altura informada no laudo?",
  ];
  const result = sanitizeExamResult({
    ...EXAM_RESULT,
    resultados: [{ ...GLICOSE, marcacao: "Alto" }, HBA1C],
    perguntas: [...classifying.slice(0, 3), ...neutral.slice(0, 3)],
    observacoes: ["Valores alterados na página 2.", "Leitura feita a partir de uma foto inclinada do laudo."],
    ilegiveis: ["Resultado anormal no rodapé", "Rodapé da página 2, coberto por um carimbo"],
  })!;
  assert.deepEqual(result.perguntas, neutral.slice(0, 3));
  assert.deepEqual(result.observacoes, ["Leitura feita a partir de uma foto inclinada do laudo."]);
  assert.deepEqual(result.ilegiveis, ["Rodapé da página 2, coberto por um carimbo"]);
  // A marca impressa pelo laboratório é copiada como está, mesmo quando é uma palavra ("Alto").
  assert.equal(result.resultados[0]!.marcacao, "Alto");
  for (const text of classifying) assert.equal(classifiesResult(text), true, text);
  for (const text of neutral) assert.equal(classifiesResult(text), false, text);
  // Só com trechos ilegíveis que classificam e sem resultados: nada sobra, cai para a reserva em texto.
  assert.equal(
    sanitizeExamResult({ ...EXAM_RESULT, resultados: [], ilegiveis: ["Valor alto ilegível"] }),
    null,
  );
});

test("classifiesResult: a palavra só conta quando se refere a um resultado; o mesmo termo em outro sentido fica", () => {
  const classifying = [
    "O LDL continua muito alto?",
    "Deu alto?",
    "O exame veio alterado?",
    "Ficou abaixo da referência?",
    "Glicose acima de 99 preocupa?",
    "Alto nível de ferritina pede exame novo?",
    "Os valores baixos pedem retorno?",
    "Há deficiência de ferro?",
    "Alterações nos exames mudam a dieta?",
    "A dieta está boa, mas a glicose em jejum está alta?",
    "Colesterol HDL ou LDL alto muda o cardápio?",
    "Resultado dentro da normalidade?",
  ];
  const neutral = [
    "Atividade física de alta intensidade influencia o exame?",
    "Devo manter a dieta baixa em sódio?",
    "A dieta está baixa em sódio?",
    "Exercício de baixo impacto antes da coleta atrapalha?",
    "Vale seguir uma dieta de baixo índice glicêmico?",
    "Alimentos com alto teor de açúcar na véspera mudam o exame?",
    "Posso fazer alterações na dieta antes do retorno?",
    "Dentro do possível, devo evitar açúcar antes da coleta?",
    "Tomei café acima de 2 xícaras, isso interfere no exame?",
    "Recebi alta do hospital, preciso repetir o exame?",
    "Foto com baixa resolução na página 2",
    "Página 2 fora de foco",
  ];
  for (const text of classifying) assert.equal(classifiesResult(text), true, text);
  for (const text of neutral) assert.equal(classifiesResult(text), false, text);
  // Biomarcador fora da lista comum: reconhecido pelos nomes impressos no mesmo laudo.
  assert.equal(classifiesResult("Apolipoproteína B aumentada muda a dieta?"), false);
  assert.equal(classifiesResult("Apolipoproteína B aumentada muda a dieta?", ["Apolipoproteína B"]), true);
  assert.equal(classifiesResult("Lipídios elevados?", ["Colesterol total", "Lipídios"]), true);
  // Palavras genéricas do nome ("total", "livre", "de") não viram resultado.
  assert.equal(classifiesResult("O total de copos foi alto?", ["Colesterol total"]), false);
});

test("sanitizeExamResult: mantém perguntas neutras com alta/baixo e tira as que classificam um biomarcador do laudo", () => {
  const apo: Biomarker = { grupo: "Lipídios", nome: "Apolipoproteína B", valor: "130", unidade: "mg/dL", referencia: "< 100", marcacao: "H" };
  const result = sanitizeExamResult({
    ...EXAM_RESULT,
    resultados: [GLICOSE, apo],
    perguntas: [
      "Atividade física de alta intensidade influencia o exame?",
      "Devo manter a dieta baixa em sódio?",
      "Apolipoproteína B aumentada muda a dieta?",
      "A glicose está alta?",
    ],
    observacoes: ["Foto com baixa resolução na página 2", "Valores alterados na página 2."],
    ilegiveis: ["Página 2 fora de foco", "Valor alto ilegível"],
  })!;
  assert.deepEqual(result.perguntas, [
    "Atividade física de alta intensidade influencia o exame?",
    "Devo manter a dieta baixa em sódio?",
  ]);
  assert.deepEqual(result.observacoes, ["Foto com baixa resolução na página 2"]);
  assert.deepEqual(result.ilegiveis, ["Página 2 fora de foco"]);
  // A marca do laboratório nunca passa pelo filtro.
  assert.equal(result.resultados[1]!.marcacao, "H");
});

test("revisor do laudo recusa classificação no texto livre; política: metas já consideram o perfil e a caneta", () => {
  assert.match(EXAM_REVIEW_ADDENDUM, /perguntas, observações ou trechos ilegíveis/);
  for (const word of ["normal", "alterado", "acima", "abaixo", "elevado", "alto", "baixo", "fora ou dentro da faixa"])
    assert.ok(EXAM_REVIEW_ADDENDUM.includes(word), word);
  assert.match(EXAM_REVIEW_ADDENDUM, /comparação de um valor com a referência/);
  // Decisão de 2026-10-01: as metas passam a considerar IMC, atividade, objetivo, condições e caneta.
  assert.doesNotMatch(POLICY, /não altera essas metas/);
  assert.match(
    POLICY,
    /já consideram o IMC, o nível de atividade, o objetivo, as condições declaradas e o uso de caneta: use-as como estão e nunca recalcule metas/,
  );
  assert.match(POLICY, /abaixo do piso de 1\.200 kcal \(feminino\) ou 1\.500 kcal \(masculino\)/);
  assert.match(POLICY, /priorize proteína em cada refeição e refeições menores/);
  // Hidratação só sem restrição de líquidos declarada (ou em dúvida), como no resto do app.
  assert.match(POLICY, /incentive hidratação apenas quando a restrição hídrica informada for "nao"/);
  assert.match(POLICY, /com restrição de líquidos ou em dúvida, não recomende aumentar líquidos/);
  assert.doesNotMatch(POLICY, /priorize proteína em cada refeição, hidratação/);
  assert.match(POLICY, /nunca sugira, altere ou comente dose/);
  // Ajuste dinâmico (2026-10): o app ajusta a meta de hoje pelo dia anterior; a IA não recalcula.
  assert.match(POLICY, /O aplicativo pode ajustar a meta de hoje a partir do consumo de ontem/);
  assert.match(POLICY, /sem recalcular nem repetir o cálculo/);
});

test("examResultSchema: recorta textos, data fora do formato vira null e nome ausente recusa", () => {
  const parsed = examResultSchema.parse({
    ...EXAM_RESULT,
    data: "10/08/2026",
    resultados: [{ ...GLICOSE, nome: "N".repeat(100), valor: "1".repeat(40), grupo: 7 }],
    perguntas: ["P".repeat(250)],
  });
  assert.equal(parsed.data, null);
  assert.equal(parsed.resultados[0]!.nome.length, 80);
  assert.equal(parsed.resultados[0]!.valor.length, 30);
  assert.equal(parsed.resultados[0]!.grupo, null);
  assert.equal(parsed.perguntas[0]!.length, 200);
  assert.equal(examResultSchema.safeParse({ ...EXAM_RESULT, resultados: [{ ...GLICOSE, nome: null }] }).success, false);
  assert.equal(
    examResultSchema.safeParse({ ...EXAM_RESULT, perguntas: Array.from({ length: 7 }, () => "x") }).success,
    false,
  );
  assert.deepEqual(examResultSchema.parse(EXAM_RESULT), EXAM_RESULT);
});

test("parseLabNumber: vírgula decimal, milhar com ponto e nada que não seja um número simples", () => {
  const cases: [string, number | null][] = [
    ["102", 102],
    ["5,4", 5.4],
    ["6.500", 6500],
    ["1.234,5", 1234.5],
    ["0.500", 0.5],
    ["1.5", 1.5],
    ["−2", -2],
    [" 13,5 ", 13.5],
    ["< 0,5", null],
    ["Negativo", null],
    ["1/40", null],
    ["1,2,3", null],
    ["1.23.4", null],
    ["", null],
  ];
  for (const [input, expected] of cases) assert.equal(parseLabNumber(input), expected, input);
});

test("parseReference: três formas simples; faixas por grupo, outra unidade ou invertidas ficam só em texto", () => {
  const cases: [string | null, string | null, { min: number | null; max: number | null } | null][] = [
    ["70 a 99 mg/dL", "mg/dL", { min: 70, max: 99 }],
    ["70-99", "mg/dL", { min: 70, max: 99 }],
    ["-2 a 2", null, { min: -2, max: 2 }],
    ["< 5,7", "%", { min: null, max: 5.7 }],
    ["até 200", "mg/dL", { min: null, max: 200 }],
    ["Inferior a 1,0", null, { min: null, max: 1 }],
    ["> 40 mg/dL", "mg/dL", { min: 40, max: null }],
    ["Superior a 30", "ng/mL", { min: 30, max: null }],
    ["Desejável: < 150", "mg/dL", null],
    ["Homens: 13,5 a 17,5", "g/dL", null],
    ["3,9 a 5,5 mmol/L", "mg/dL", null],
    ["99 a 70", "mg/dL", null],
    ["70 a 99; 100 a 125", "mg/dL", null],
    ["Negativo", null, null],
    [null, "mg/dL", null],
  ];
  for (const [text, unit, expected] of cases)
    assert.deepEqual(parseReference(text, unit), expected, String(text));
});

test("biomarkerScale: faixa impressa em menta, ponto do valor e seta neutra quando passa da barra", () => {
  assert.deepEqual(biomarkerScale(GLICOSE), { zoneStart: 25, zoneEnd: 75, dot: 80.2, beyond: null });
  assert.deepEqual(biomarkerScale(HBA1C), { zoneStart: 0, zoneEnd: 66.7, dot: 63.2, beyond: null });
  assert.deepEqual(biomarkerScale(HDL), { zoneStart: 50, zoneEnd: 100, dot: 65, beyond: null });
  assert.equal(biomarkerScale(TRIGLICERIDES), null);
  assert.equal(biomarkerScale(VITAMINA_D), null);
  assert.deepEqual(biomarkerScale({ ...GLICOSE, valor: "150" }), {
    zoneStart: 25,
    zoneEnd: 75,
    dot: 100,
    beyond: "above",
  });
  assert.equal(biomarkerScale({ ...GLICOSE, valor: "10" })!.beyond, "below");
  assert.equal(biomarkerScale({ ...GLICOSE, valor: "10" })!.dot, 0);
  // Só piso negativo: não há barra com sentido.
  assert.equal(biomarkerScale({ ...HDL, valor: "1", referencia: "> -5" }), null);
});

test("biomarkerHistory: junta por nome e unidade (sem acento/maiúscula), ignora outra unidade e texto", () => {
  const march: ExamResult = { ...EXAM_RESULT, data: "2026-03-12", resultados: [{ ...GLICOSE, valor: "95" }] };
  const exams = [
    { date: "2026-08-11", analysisStructured: EXAM_RESULT },
    { date: "2026-03-12", analysisStructured: march },
    {
      date: "2026-05-20",
      analysisStructured: { ...march, data: null, resultados: [{ ...GLICOSE, nome: "GLICOSE", unidade: "MG/DL", valor: "88" }] },
    },
    {
      date: "2026-01-05",
      analysisStructured: { ...march, data: null, resultados: [{ ...GLICOSE, valor: "5,1", unidade: "mmol/L" }] },
    },
    {
      date: "2026-04-01",
      analysisStructured: { ...march, data: null, resultados: [{ ...GLICOSE, valor: "Ver laudo" }] },
    },
    { date: "2026-02-01" },
  ];
  assert.deepEqual(biomarkerHistory(exams, GLICOSE), [
    { date: "2026-03-12", value: 95 },
    { date: "2026-05-20", value: 88 },
    { date: "2026-08-10", value: 102 },
  ]);
  assert.equal(biomarkerKey(GLICOSE), biomarkerKey({ nome: " glicose", unidade: "MG/DL" }));
  // A mesma data em dois laudos fica com o último.
  const twice = [
    { date: "2026-03-12", analysisStructured: march },
    { date: "2026-03-12", analysisStructured: { ...march, resultados: [{ ...GLICOSE, valor: "97" }] } },
  ];
  assert.deepEqual(biomarkerHistory(twice, GLICOSE), [{ date: "2026-03-12", value: 97 }]);
  assert.equal(
    historySpeech(biomarkerHistory(exams.slice(0, 2), GLICOSE), "mg/dL"),
    "Histórico nos seus exames: 95 mg/dL em 12/03/2026; 102 mg/dL em 10/08/2026.",
  );
  assert.equal(historySpeech([{ date: "2026-03-12", value: 5.25 }], null), "Histórico nos seus exames: 5,25 em 12/03/2026.");
});

test("contadores e leitura para leitor de tela só descrevem o que o laudo traz", () => {
  assert.deepEqual(examCounters(EXAM_RESULT), ["5 resultados", "1 marcado pelo laboratório", "1 trecho ilegível"]);
  assert.deepEqual(examCounters({ ...EXAM_RESULT, resultados: [HDL], ilegiveis: [] }), ["1 resultado"]);
  assert.equal(
    biomarkerSpeech(GLICOSE),
    "Glicose: 102 mg/dL. Referência do laudo: 70 a 99 mg/dL. Marcação do laudo: H.",
  );
  assert.equal(biomarkerSpeech(VITAMINA_D), "Vitamina D: Ver laudo anexo. Referência do laudo: não impressa.");
});
