import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "../src/lib/backup";
import { createDietPlan } from "../src/lib/diet";
import { createExam, withAnalysis } from "../src/lib/exams";
import type { AppState, ChatMessage } from "../src/types";
import { stateFixture } from "./fixtures";
import { CHAT_REPLY, DIET_PLAN_V2, DIET_REPLY, EXAM_REPLY, EXAM_RESULT } from "./structured-fixtures";

function withStructured(): AppState {
  const state = stateFixture();
  const sections = CHAT_REPLY.structured?.kind === "chat" ? CHAT_REPLY.structured.sections : [];
  const messages: ChatMessage[] = [
    { id: "m1", sender: "user", text: "Ideias de jantar?", timestamp: "2026-09-24T19:00:00.000Z", status: "sent" },
    {
      id: "m2",
      sender: "ai",
      text: CHAT_REPLY.text,
      timestamp: "2026-09-24T19:00:05.000Z",
      status: "sent",
      meta: CHAT_REPLY.meta,
      blocks: sections,
    },
  ];
  return { ...state, messages, dietPlan: createDietPlan(DIET_REPLY, state.profile!) };
}

test("backup: blocos do chat e dieta estruturada vão e voltam sem mudança", () => {
  const state = withStructured();
  assert.deepEqual(state.dietPlan?.structured, DIET_PLAN_V2);
  const restored = parseBackup(JSON.stringify(state));
  assert.deepStrictEqual(restored.messages, state.messages);
  assert.deepStrictEqual(restored.dietPlan, state.dietPlan);
});

test("backup: blocos ou plano estruturado inválidos são descartados e o resto é importado", () => {
  const state = withStructured();
  const exported = JSON.parse(JSON.stringify(state)) as Record<string, unknown> & {
    messages: Record<string, unknown>[];
    dietPlan: Record<string, unknown>;
  };
  exported.messages[1]!.blocks = [{ papel: null, blocos: [{ tipo: "foo" }] }];
  exported.dietPlan.structured = { resumo: {}, refeicoes: [] };
  const restored = parseBackup(JSON.stringify(exported));
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.messages[1]!.blocks, undefined);
  assert.equal(restored.messages[1]!.text, CHAT_REPLY.text);
  assert.equal(restored.dietPlan?.structured, undefined);
  assert.equal(restored.dietPlan?.text, DIET_REPLY.text);
  // Backups antigos, sem as chaves novas, continuam iguais.
  const legacy = stateFixture();
  assert.deepStrictEqual(parseBackup(JSON.stringify(legacy)).messages, legacy.messages);
});

function withExams(): AppState {
  const file = { dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=", name: "laudo.pdf", mimeType: "application/pdf" };
  const structured = {
    ...withAnalysis(createExam(file, "Bioquímica", "2026-08-11", ""), EXAM_REPLY.text, EXAM_RESULT),
    questionsDone: [1],
  };
  const legacy = withAnalysis(createExam(file, "Hemograma", "2026-03-12", ""), "Hemoglobina: 13,5 g/dL.");
  return { ...stateFixture(), exams: [structured, legacy] };
}

test("backup: exame com resultados estruturados e perguntas marcadas vai e volta sem mudança", () => {
  const state = withExams();
  const restored = parseBackup(JSON.stringify(state));
  assert.deepStrictEqual(restored.exams, state.exams);
  assert.deepEqual(restored.exams[0]!.analysisStructured, EXAM_RESULT);
  assert.deepEqual(restored.exams[0]!.questionsDone, [1]);
  // Análise antiga (só texto) continua sem as chaves novas.
  assert.equal("analysisStructured" in restored.exams[1]!, false);
  assert.equal("questionsDone" in restored.exams[1]!, false);
});

test("backup: resultado estruturado ou perguntas inválidos são descartados e o exame fica", () => {
  const exported = JSON.parse(JSON.stringify(withExams())) as Record<string, unknown> & {
    exams: Record<string, unknown>[];
  };
  exported.exams[0]!.analysisStructured = { resultados: "x" };
  exported.exams[0]!.questionsDone = [9];
  const restored = parseBackup(JSON.stringify(exported));
  assert.equal(restored.exams.length, 2);
  assert.equal(restored.exams[0]!.analysisStructured, undefined);
  assert.equal(restored.exams[0]!.questionsDone, undefined);
  assert.equal(restored.exams[0]!.analysis, EXAM_REPLY.text);
});
