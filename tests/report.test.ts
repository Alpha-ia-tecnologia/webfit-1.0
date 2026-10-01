import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_COPY,
  REPORT_PERIODS,
  REPORT_SECTION_KEYS,
  buildReport,
  pendingExamQuestions,
  reportFileName,
  reportSections,
  type ReportModel,
  type ReportOptions,
  type ReportSection,
  type ReportSectionKey,
} from "../src/lib/report";
import { shiftDate } from "../src/lib/domain";
import type { AppState } from "../src/types";
import { EXAM_RESULT } from "./structured-fixtures";
import { T, appointment, reportState, withProfile } from "./report-fixtures";

const ALL = [...REPORT_SECTION_KEYS];
const options = (over: Partial<ReportOptions> = {}): ReportOptions => ({
  periodDays: 30,
  sections: ALL,
  questions: "",
  today: T,
  ...over,
});
const sectionOf = <K extends ReportSectionKey>(model: ReportModel, key: K) =>
  model.sections.find(
    (s): s is Extract<ReportSection, { key: K }> => s.key === key,
  );
const optionOf = (state: AppState, key: ReportSectionKey) =>
  reportSections(state, 30, T).find((s) => s.key === key);

test("períodos e nome do arquivo", () => {
  assert.deepEqual(
    REPORT_PERIODS.map((p) => [p.days, p.label]),
    [
      [30, "30 dias"],
      [90, "90 dias"],
      [180, "6 meses"],
    ],
  );
  assert.equal(
    reportFileName("2026-09-28"),
    "relatorio-webfit-2026-09-28.html",
  );
});

test("seções: ordem fixa, todas disponíveis; sem calorias ocultas; sem tratamento sem caneta", () => {
  const state = reportState();
  const sections = reportSections(state, 30, T);
  assert.deepEqual(
    sections.map((s) => s.key),
    [
      "essencial",
      "medidas",
      "calorias",
      "alimentacao",
      "tratamento",
      "exames",
      "bem_estar",
      "perguntas",
    ],
  );
  assert.ok(sections.every((s) => s.available && s.defaultOn));
  assert.equal(
    sections.find((s) => s.key === "medidas")?.hint,
    "Pesagens, tendência e IMC",
  );
  assert.ok(
    !reportSections(withProfile(state, { hideCalories: true }), 30, T).some(
      (s) => s.key === "calorias",
    ),
  );
  const noPen = { ...state, injections: [] };
  assert.ok(!reportSections(noPen, 30, T).some((s) => s.key === "tratamento"));
  const penOnly = withProfile(noPen, {
    weightLossPen: "sim",
    pregnancy: "nao",
  });
  const pen = reportSections(penOnly, 30, T).find(
    (s) => s.key === "tratamento",
  );
  assert.deepEqual(
    [pen?.available, pen?.defaultOn, pen?.hint],
    [false, false, REPORT_COPY.unavailable],
  );
});

test("padrões: perfil calmo desmarca medidas e calorias; números ocultos só medidas, com a nota", () => {
  const calm = withProfile(reportState(), { eatingDisorder: "sim" });
  assert.equal(optionOf(calm, "medidas")?.defaultOn, false);
  assert.equal(optionOf(calm, "medidas")?.hint, "Pesagens do período");
  assert.equal(optionOf(calm, "calorias")?.defaultOn, false);
  const hidden = withProfile(reportState(), { hideBodyNumbers: true });
  assert.equal(optionOf(hidden, "medidas")?.defaultOn, false);
  assert.equal(
    optionOf(hidden, "medidas")?.note,
    "Inclui os números do corpo que você ocultou nas telas.",
  );
  assert.equal(optionOf(hidden, "calorias")?.defaultOn, true);
  assert.equal(optionOf(reportState(), "medidas")?.note, null);
});

test("medidas completas: pesagens do período, variação, IMC e peso desejado", () => {
  const model = buildReport(reportState(), options());
  assert.equal(model.period.label, "30/08/2026 a 28/09/2026");
  assert.deepEqual([model.period.from, model.period.to], ["2026-08-30", T]);
  const measures = sectionOf(model, "medidas");
  assert.ok(measures);
  assert.equal(measures.level, "full");
  assert.deepEqual(
    measures.rows.map((r) => r[0]),
    ["07/09/2026", "21/09/2026", "28/09/2026"],
  );
  assert.deepEqual(measures.columns, [
    "Data",
    "Peso",
    "Cintura",
    "Quadril",
    "Gordura",
  ]);
  assert.deepEqual(measures.lines, [
    "3 pesagens no período",
    "Primeira: 74 kg em 07/09/2026 · Última: 72,4 kg em 28/09/2026",
    "Variação no período: −1,6 kg",
    "IMC atual: 26,6 (referência 18,5 a 24,9)",
    "Peso desejado informado: 66 kg",
  ]);
  assert.ok(measures.chart);
  assert.deepEqual(
    [measures.chart.start, measures.chart.end, measures.chart.target],
    ["2026-08-30", T, 66],
  );
  // Números ocultos, mas a seção escolhida: vai completa (a pessoa pediu).
  const hidden = buildReport(
    withProfile(reportState(), { hideBodyNumbers: true }),
    options(),
  );
  assert.equal(sectionOf(hidden, "medidas")?.level, "full");
});

test("medidas em perfil calmo: só o valor do peso", () => {
  for (const patch of [
    { eatingDisorder: "sim" as const },
    { eatingDisorder: "sim" as const, hideBodyNumbers: true },
  ]) {
    const measures = sectionOf(
      buildReport(withProfile(reportState(), patch), options()),
      "medidas",
    );
    assert.ok(measures);
    assert.equal(measures.level, "value");
    assert.deepEqual(measures.lines, ["3 pesagens no período"]);
    assert.deepEqual(measures.columns, ["Data", "Peso"]);
    assert.deepEqual(measures.rows.at(-1), ["28/09/2026", "72,4 kg"]);
    assert.equal(measures.chart, null);
  }
});

test("próxima consulta só dentro de 60 dias", () => {
  assert.equal(
    buildReport(reportState(), options()).nextAppointment,
    "02/10/2026 às 10:00 com Dra. Ana Lima",
  );
  const far = {
    ...reportState(),
    appointments: [appointment(shiftDate(T, 70), "Dra. Ana Lima", "")],
  };
  assert.equal(buildReport(far, options()).nextAppointment, null);
});

test("tratamento: tabela das aplicações, sem estimativa de próxima dose", () => {
  const treatment = sectionOf(
    buildReport(reportState(), options()),
    "tratamento",
  );
  assert.ok(treatment);
  assert.deepEqual(treatment.rows[0], [
    "20/09/2026",
    "Tirzepatida",
    "5,00 mg",
    "Caneta",
    "Abdômen à esquerda",
  ]);
  assert.equal(
    treatment.note,
    "Aplicações registradas pela pessoa. A dose é decidida com quem prescreveu.",
  );
  assert.doesNotMatch(JSON.stringify(treatment), /próxima|estimad|faltam/i);
});

test("perguntas pendentes dos exames e máscara de calorias nas perguntas", () => {
  assert.deepEqual(
    pendingExamQuestions(reportState()),
    EXAM_RESULT.perguntas.slice(1),
  );
  const hidden = withProfile(reportState(), { hideCalories: true });
  const model = buildReport(
    hidden,
    options({ questions: "Posso comer 300 kcal à noite?\n\n  " }),
  );
  assert.deepEqual(sectionOf(model, "perguntas")?.items, [
    "Posso comer calorias ocultas à noite?",
  ]);
  assert.equal(sectionOf(model, "calorias"), undefined);
});

test("seções: só as escolhidas e disponíveis, na ordem fixa; perguntas cortadas", () => {
  const model = buildReport(
    reportState(),
    options({
      sections: ["perguntas", "essencial"],
      questions: `${"x".repeat(250)}\n${Array(10).fill("p").join("\n")}`,
    }),
  );
  assert.deepEqual(
    model.sections.map((s) => s.key),
    ["essencial", "perguntas"],
  );
  const items = sectionOf(model, "perguntas")?.items ?? [];
  assert.equal(items.length, 8);
  assert.equal(items[0]?.length, 200);
  const noExams = buildReport(
    { ...reportState(), exams: [] },
    options({ sections: ["exames"] }),
  );
  assert.deepEqual(noExams.sections, []);
});

test("calorias, alimentação e bem-estar: médias do registrado, sem palavras de excesso", () => {
  const model = buildReport(reportState(), options());
  assert.deepEqual(sectionOf(model, "calorias")?.lines.length, 2);
  assert.match(
    sectionOf(model, "calorias")?.lines[0] ?? "",
    /^Média registrada: [\d.]+ kcal por dia, em 1 dia com refeições\.$/,
  );
  assert.equal(
    sectionOf(model, "calorias")?.lines[1],
    "Meta vigente: 1.800 kcal por dia (Definida por você).",
  );
  const food = sectionOf(model, "alimentacao")?.lines ?? [];
  assert.equal(food[0], "Dias com refeições registradas: 1 de 30.");
  assert.ok(
    food.includes("Água: média de 1,5 L por dia, em 1 dia com registro."),
  );
  assert.ok(
    food.includes(
      "Grupos de alimentos: média de 4 de 7 por dia com refeições.",
    ),
  );
  assert.ok(food.includes("Cereais, raízes e tubérculos: 1 dia"));
  assert.ok(food.some((l) => l.startsWith("Média diária de proteínas")));
  const calmFood = sectionOf(
    buildReport(
      withProfile(reportState(), { eatingDisorder: "sim" }),
      options(),
    ),
    "alimentacao",
  );
  assert.ok(
    !calmFood?.lines.some((l) => l.startsWith("Média diária de proteínas")),
  );
  assert.deepEqual(sectionOf(model, "bem_estar")?.lines, [
    "1 registro de bem-estar no período.",
    "Como se sente, em média: 4 de 5 (Bem).",
    "Sono informado, em média: 7 h (1 registro).",
    "Marcadores mais frequentes: Disposição (1).",
  ]);
  assert.doesNotMatch(
    JSON.stringify(model),
    /\b(excesso|acima da meta|abaixo da meta|estourou|ultrapass)/i,
  );
});

test("cabeçalho e rodapé", () => {
  const model = buildReport(reportState(), options());
  assert.equal(model.title, "Relatório para consulta");
  assert.deepEqual(model.person, { name: "Pessoa Teste", age: 34 });
  assert.equal(model.generatedOn, "28/09/2026");
  assert.equal(
    model.footer,
    "Gerado em 28/09/2026 pelo WebFit, com dados registrados pela própria pessoa. Não é laudo nem diagnóstico. Valores de alimentos estimados pela Tabela TACO (NEPA/UNICAMP).",
  );
});
