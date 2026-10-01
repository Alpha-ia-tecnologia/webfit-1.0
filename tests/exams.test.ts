import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addExam,
  analyzeExams,
  createExam,
  EXAM_AI_HINT,
  EXAM_PRIVACY_HINT,
  examFileKind,
  examHint,
  ExamUrgentError,
  toggleExamQuestion,
  withAnalysis,
} from "../src/lib/exams";
import { initialState, localDate } from "../src/lib/domain";
import { stateFixture } from "./fixtures";
import { CHAT_REPLY, EXAM_REPLY, EXAM_RESULT } from "./structured-fixtures";
import type { AgentReply, AppState } from "../src/types";
const file = {
  dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
  name: "laudo.pdf",
  mimeType: "application/pdf",
};
const exam = () =>
  createExam(file, "Hemograma", localDate(), "Conferir com profissional");
const reply: AgentReply = {
  text: "Resultado transcrito do laudo.",
  meta: {
    specialists: ["analista_exames"],
    reviewed: true,
    revisions: 0,
    urgency: "nenhuma",
    notes: [],
    llmCalls: 2,
  },
};
function setup() {
  let state = stateFixture();
  state.profile = { ...state.profile!, consentAi: true };
  state.exams = [exam(), exam()];
  let current = true;
  const options = {
    ids: state.exams.map((e) => e.id),
    getState: () => state,
    isCurrent: () => current,
    request: async () => reply,
    commit: async (update: (s: AppState) => AppState) => {
      state = update(state);
      return true;
    },
    progress: (_message: string) => {},
  };
  return {
    options,
    state: () => state,
    change: (update: (s: AppState) => AppState) => {
      state = update(state);
    },
    cancel: () => {
      current = false;
    },
  };
}
test("exames: anexos exigem consentimento local, identidade e limite de 30", () => {
  const s = initialState();
  assert.throws(() => addExam(s, exam(), s.userId), /armazenamento local/);
  const ready = stateFixture();
  assert.throws(() => addExam(ready, exam(), "outro"), /dados locais/);
  ready.exams = Array.from({ length: 30 }, exam);
  assert.throws(() => addExam(ready, exam(), ready.userId), /30 exames/);
  assert.throws(() => createExam(file, " ", localDate(), ""), /nome/);
  assert.throws(() => createExam(file, "Exame", "2099-01-01", ""), /futuro/);
});
test("exames: analisa somente selecionados, em sequência, e persiste cada resposta", async () => {
  const h = setup();
  const messages: string[] = [];
  let calls = 0;
  h.options.ids = [h.options.ids[0], h.options.ids[0]];
  h.options.progress = (message) => {
    messages.push(message);
  };
  h.options.request = async () => {
    calls++;
    return reply;
  };
  await analyzeExams(h.options);
  assert.equal(calls, 1);
  assert.match(messages[0], /1 de 1/);
  assert.equal(h.state().exams[0].analysis, reply.text);
  assert.equal(h.state().exams[1].analysis, undefined);
});
test("exames: falha no segundo preserva o primeiro e não inventa resposta", async () => {
  const h = setup();
  let calls = 0;
  h.options.request = async () => {
    if (++calls === 2) throw Error("sem conexão");
    return reply;
  };
  await assert.rejects(analyzeExams(h.options), /sem conexão/);
  assert.equal(h.state().exams[0].analysis, reply.text);
  assert.equal(h.state().exams[1].analysis, undefined);
});
test("exames: cancelamento, revogação e troca de perfil descartam resposta tardia", async () => {
  for (const action of ["cancel", "consent", "user", "profile"]) {
    const h = setup();
    h.options.request = async () => {
      if (action === "cancel") h.cancel();
      if (action === "consent")
        h.change((s) => ({
          ...s,
          profile: { ...s.profile!, consentAi: false },
        }));
      if (action === "user") h.change((s) => ({ ...s, userId: "outro" }));
      if (action === "profile")
        h.change((s) => ({ ...s, profile: { ...s.profile!, weight: 90 } }));
      return reply;
    };
    await assert.rejects(analyzeExams(h.options), /cancelada/);
    assert.equal(h.state().exams[0].analysis, undefined);
  }
});
test("exames: exclusão durante requisição nunca restaura o anexo", async () => {
  const h = setup();
  h.options.request = async () => {
    h.change((s) => ({ ...s, exams: [] }));
    return reply;
  };
  await assert.rejects(analyzeExams(h.options), /mudou/);
  assert.equal(h.state().exams.length, 0);
});
test("exames: urgência imediata e resposta sem revisão interrompem a sequência", async () => {
  for (const meta of [
    { ...reply.meta, reviewed: false },
    { ...reply.meta, urgency: "imediata" as const },
  ]) {
    const h = setup();
    h.options.request = async () => ({ ...reply, meta });
    await assert.rejects(analyzeExams(h.options));
    assert.equal(h.state().exams[0].analysis, undefined);
  }
});
test("exames: falha de armazenamento interrompe antes do próximo arquivo", async () => {
  const h = setup();
  let calls = 0;
  h.options.request = async () => {
    calls++;
    return reply;
  };
  h.options.commit = async () => false;
  await assert.rejects(analyzeExams(h.options), /salvar/);
  assert.equal(calls, 1);
});
test("exames: resposta urgente vira ExamUrgentError com o texto de segurança e não é salva", async () => {
  const h = setup();
  const safety = "Procure atendimento de urgência agora.";
  h.options.request = async () => ({
    text: safety,
    meta: { ...reply.meta, urgency: "imediata" as const },
  });
  await assert.rejects(analyzeExams(h.options), (error: unknown) => {
    assert.ok(error instanceof ExamUrgentError);
    assert.equal((error as Error).message, safety);
    return true;
  });
  assert.equal(h.state().exams[0].analysis, undefined);
});
test("exames: onReply recebe cada resposta revisada depois de salva", async () => {
  const h = setup();
  const seen: string[] = [];
  await analyzeExams({
    ...h.options,
    ids: [h.options.ids[0]],
    onReply: (answer, analyzed) => {
      assert.equal(h.state().exams[0].analysis, answer.text);
      seen.push(analyzed.id);
    },
  });
  assert.deepEqual(seen, [h.state().exams[0].id]);
});
test("exames: alerta urgente é entregue mesmo se a análise foi cancelada no meio", async () => {
  const h = setup();
  h.options.request = async () => {
    h.cancel();
    return { text: "Procure atendimento agora.", meta: { ...reply.meta, urgency: "imediata" as const } };
  };
  await assert.rejects(analyzeExams(h.options), ExamUrgentError);
  assert.equal(h.state().exams[0].analysis, undefined);
});
test("exames: resposta estruturada salva o texto e os resultados; os outros exames ficam intactos", async () => {
  const h = setup();
  const untouched = h.state().exams[1];
  h.options.ids = [h.options.ids[0]];
  h.options.request = async () => EXAM_REPLY;
  await analyzeExams(h.options);
  const [saved, other] = h.state().exams;
  assert.equal(saved.analysis, EXAM_REPLY.text);
  assert.deepEqual(saved.analysisStructured, EXAM_RESULT);
  assert.equal("questionsDone" in saved, false);
  assert.equal(other, untouched);
  // Outro tipo de estrutura (servidor antigo ou falha) não vira resultado de exame.
  const chat = setup();
  chat.options.request = async () => ({ ...CHAT_REPLY, meta: reply.meta });
  await analyzeExams(chat.options);
  assert.equal("analysisStructured" in chat.state().exams[0], false);
});
test("exames: reanálise só em texto tira o resultado estruturado antigo e as perguntas marcadas", async () => {
  const h = setup();
  h.change((s) => ({
    ...s,
    exams: s.exams.map((e, i) =>
      i === 0 ? { ...e, analysis: "antiga", analysisStructured: EXAM_RESULT, questionsDone: [0, 1] } : e,
    ),
  }));
  h.options.ids = [h.options.ids[0]];
  await analyzeExams(h.options);
  const exam = h.state().exams[0];
  assert.equal(exam.analysis, reply.text);
  assert.equal("analysisStructured" in exam, false);
  assert.equal("questionsDone" in exam, false);
  const again = withAnalysis(exam, "nova", EXAM_RESULT);
  assert.deepEqual(again.analysisStructured, EXAM_RESULT);
  assert.equal(exam.analysis, reply.text);
});
test("exames: perguntas marcadas em ordem crescente, índice ou exame inválido não muda nada", () => {
  const base = stateFixture();
  const analyzed = withAnalysis(exam(), "texto", EXAM_RESULT);
  const plain = exam();
  const state: AppState = { ...base, exams: [analyzed, plain] };
  const before = JSON.stringify(state);
  const one = toggleExamQuestion(state, analyzed.id, 1);
  assert.deepEqual(one.exams[0].questionsDone, [1]);
  const both = toggleExamQuestion(one, analyzed.id, 0);
  assert.deepEqual(both.exams[0].questionsDone, [0, 1]);
  assert.deepEqual(toggleExamQuestion(both, analyzed.id, 1).exams[0].questionsDone, [0]);
  const cleared = toggleExamQuestion(toggleExamQuestion(both, analyzed.id, 1), analyzed.id, 0);
  assert.equal("questionsDone" in cleared.exams[0], false);
  assert.equal(both.exams[1], plain);
  for (const index of [-1, 2, 1.5]) assert.equal(toggleExamQuestion(state, analyzed.id, index), state);
  assert.equal(toggleExamQuestion(state, plain.id, 0), state);
  assert.equal(toggleExamQuestion(state, "outro", 0), state);
  assert.equal(JSON.stringify(state), before);
});
test("exames: tipo do arquivo, dicas e análise sem chaves undefined", () => {
  assert.equal(examFileKind({ mimeType: "application/pdf" }), "pdf");
  assert.equal(examFileKind({ mimeType: "image/webp" }), "image");
  assert.equal(examHint(3), "3 de 30 exames · PDF ou imagem de até 5 MB.");
  assert.match(EXAM_PRIVACY_HINT, /só vai para a IA quando você autoriza/);
  assert.equal(EXAM_AI_HINT.consent, "Para analisar, autorize a IA em Meu espaço › Ajustes.");
  const saved = withAnalysis(exam(), "texto");
  assert.deepEqual(Object.keys(saved).sort(), ["analysis", "data", "date", "fileName", "id", "mimeType", "name", "notes"]);
});
