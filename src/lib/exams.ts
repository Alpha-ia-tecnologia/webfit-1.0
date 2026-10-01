import {
  examSchema,
  type AgentReply,
  type AppState,
  type Exam,
} from "../types";
import { localDate, uid } from "./domain";
import type { ExamResult } from "./exam-result";

export const EXAM_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const EXAM_MAX_BYTES = 5 * 1024 * 1024;
export const EXAM_LIMIT = 30;
export const EXAM_REQUEST =
  "Leia este laudo. Transcreva os resultados legíveis com unidades, data e referências impressas. Indique o que não estiver legível e organize dúvidas para discutir com um profissional. Não diagnostique.";

/** "3 de 30 exames · PDF ou imagem de até 5 MB." */
export const examHint = (count: number) =>
  `${count} de ${EXAM_LIMIT} exames · PDF ou imagem de até 5 MB.`;
/** Dica do campo "Arquivo do laudo". */
export const EXAM_PRIVACY_HINT =
  "PDF, JPG, PNG ou WebP de até 5 MB. O arquivo só vai para a IA quando você autoriza e pede uma análise.";
/** Por que "Analisar com o agente" está indisponível. */
export const EXAM_AI_HINT = {
  consent: "Para analisar, autorize a IA em Meu espaço › Ajustes.",
  offline: "O agente está indisponível agora.",
} as const;

export function examFileKind(exam: Pick<Exam, "mimeType">): "pdf" | "image" {
  return exam.mimeType === "application/pdf" ? "pdf" : "image";
}

/**
 * Grava uma análise nova: o texto sempre; os resultados estruturados só quando vieram. Uma
 * reanálise em texto tira o resultado antigo e as perguntas marcadas (nunca grava chave undefined).
 */
export function withAnalysis(exam: Exam, text: string, result?: ExamResult): Exam {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira a análise antiga do objeto; só o resto importa
  const { analysisStructured: _structured, questionsDone: _done, ...rest } = exam;
  return { ...rest, analysis: text, ...(result ? { analysisStructured: result } : {}) };
}

/**
 * Marca ou desmarca uma pergunta da análise como levada à consulta (índices em ordem crescente).
 * Exame, análise ou índice inexistente devolve o mesmo estado; nunca muta.
 */
export function toggleExamQuestion(state: AppState, examId: string, index: number): AppState {
  const exam = state.exams.find((item) => item.id === examId);
  const total = exam?.analysisStructured?.perguntas.length ?? 0;
  if (!exam || !Number.isInteger(index) || index < 0 || index >= total) return state;
  const done = exam.questionsDone ?? [];
  const next = done.includes(index)
    ? done.filter((i) => i !== index)
    : [...done, index].sort((a, b) => a - b);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira as marcas do objeto; só o resto importa
  const { questionsDone: _done, ...rest } = exam;
  const updated: Exam = next.length ? { ...rest, questionsDone: next } : rest;
  return {
    ...state,
    exams: state.exams.map((item) => (item.id === examId ? updated : item)),
  };
}

export function createExam(
  file: { dataUrl: string; name: string; mimeType: string },
  name: string,
  date: string,
  notes: string,
): Exam {
  if (!name.trim()) throw new Error("Informe o nome do exame.");
  if (date > localDate())
    throw new Error("A data do exame não pode estar no futuro.");
  const base64 = file.dataUrl.split(",")[1] ?? "";
  const bytes =
    (base64.length * 3) / 4 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > EXAM_MAX_BYTES)
    throw new Error("O arquivo deve ter no máximo 5 MB.");
  return examSchema.parse({
    id: uid(),
    name: name.trim(),
    date,
    notes,
    fileName: file.name,
    mimeType: file.mimeType,
    data: file.dataUrl,
  });
}

export function addExam(state: AppState, exam: Exam, userId: string): AppState {
  if (state.userId !== userId)
    throw new Error("Os dados locais mudaram. Anexe o exame novamente.");
  if (!state.profile?.consentLocal && !state.draft?.consentLocal)
    throw new Error("Autorize o armazenamento local antes de anexar exames.");
  if (state.exams.length >= EXAM_LIMIT)
    throw new Error(
      "Você pode salvar até 30 exames. Exclua um exame antes de adicionar outro.",
    );
  return { ...state, exams: [...state.exams, exam] };
}

/** Resposta de segurança do agente: deve ficar visível para a pessoa, nunca salva como análise. */
export class ExamUrgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExamUrgentError";
  }
}

/** Analisa um arquivo por vez e nunca restaura exames excluídos ou dados de outro perfil. */
export async function analyzeExams(options: {
  ids: string[];
  getState: () => AppState | null;
  isCurrent: () => boolean;
  request: (mode: "exam", text: string, file: string) => Promise<AgentReply>;
  commit: (update: (state: AppState) => AppState) => Promise<boolean>;
  progress: (message: string) => void;
  /** Chamado depois que cada análise revisada foi salva (ex.: para mostrar as notas). */
  onReply?: (reply: AgentReply, exam: Exam) => void;
}): Promise<void> {
  const initial = options.getState();
  if (!initial?.profile?.consentAi)
    throw new Error("Autorize o uso da IA para analisar exames.");
  const profile = JSON.stringify(initial.profile);
  const check = (state: AppState | null) => {
    if (
      !options.isCurrent() ||
      !state?.profile?.consentAi ||
      state.userId !== initial.userId ||
      JSON.stringify(state.profile) !== profile
    )
      throw new Error(
        "Análise cancelada porque os dados ou a autorização mudaram.",
      );
    return state;
  };
  const ids = [...new Set(options.ids)];
  for (const [index, id] of ids.entries()) {
    const exam = check(options.getState()).exams.find((item) => item.id === id);
    if (!exam)
      throw new Error(
        "Um dos exames foi excluído. Selecione os exames novamente.",
      );
    options.progress(
      `Analisando exame ${index + 1} de ${ids.length}: ${exam.name}`,
    );
    const reply = await options.request("exam", EXAM_REQUEST, exam.data);
    // Um alerta de segurança sempre chega à pessoa, mesmo se a análise foi cancelada no meio.
    if (reply.meta.urgency === "imediata") throw new ExamUrgentError(reply.text);
    check(options.getState());
    if (
      !reply.meta.reviewed ||
      !reply.meta.specialists.includes("analista_exames")
    )
      throw new Error(
        "A análise do exame não foi revisada. Tente novamente em Meu espaço → Exames e consultas.",
      );
    const saved = await options.commit((state) => {
      check(state);
      if (
        !state.exams.some((item) => item.id === id && item.data === exam.data)
      )
        throw new Error("O exame mudou durante a análise.");
      return {
        ...state,
        exams: state.exams.map((item) =>
          item.id === id
            ? withAnalysis(
                item,
                reply.text,
                reply.structured?.kind === "exam" ? reply.structured.result : undefined,
              )
            : item,
        ),
      };
    });
    if (!saved)
      throw new Error(
        "Não foi possível salvar a análise. Tente novamente em Meu espaço → Exames e consultas.",
      );
    options.onReply?.(reply, exam);
  }
}
