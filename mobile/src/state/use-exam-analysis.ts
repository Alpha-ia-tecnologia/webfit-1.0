import { useCallback, useRef, useState, type RefObject } from "react";
import { analyzeExams, ExamUrgentError } from "@shared/lib/exams";
import type { AppState } from "@shared/types";
import type { AppContextValue } from "./app-context-types";

type Options = {
  stateRef: RefObject<AppState | null>;
  aiRequest: AppContextValue["aiRequest"];
  commit: AppContextValue["commit"];
  notify: AppContextValue["notify"];
};

/** Análise de um exame salvo, uma por vez; o estado vive no app e sobrevive à troca de tela. */
export function useExamAnalysis({ stateRef, aiRequest, commit, notify }: Options) {
  const examRun = useRef<object | null>(null);
  const [analyzingExamId, setAnalyzingExamId] = useState<string | null>(null);
  const [examUrgent, setExamUrgent] = useState<Record<string, string>>({});

  /** Análise de exame fora da dieta; o alerta urgente também vira aviso global, visível em qualquer tela. */
  const analyzeExam = useCallback<AppContextValue["analyzeExam"]>(
    async (id) => {
      if (examRun.current) return;
      const run = {};
      examRun.current = run;
      setAnalyzingExamId(id);
      setExamUrgent(({ [id]: _previous, ...rest }) => rest);
      try {
        await analyzeExams({
          ids: [id],
          getState: () => stateRef.current,
          isCurrent: () => examRun.current === run,
          request: aiRequest,
          commit: (update) => commit(update, "Análise salva."),
          progress: () => undefined,
          onReply: (reply) => {
            if (reply.meta.notes.length) notify(reply.meta.notes.join(" "), "info");
          },
        });
      } catch (error) {
        if (error instanceof ExamUrgentError) {
          setExamUrgent((current) => ({ ...current, [id]: error.message }));
          notify(error.message, "warning");
        } else if (examRun.current === run)
          notify(
            error instanceof Error ? error.message : "Não foi possível analisar o exame.",
            "warning",
          );
      } finally {
        if (examRun.current === run) {
          examRun.current = null;
          setAnalyzingExamId(null);
        }
      }
    },
    [aiRequest, commit, notify, stateRef],
  );

  /** Esquece a análise em andamento (cancelar): uma resposta que ainda chegue não é aplicada. */
  const stopExamAnalysis = useCallback(() => {
    examRun.current = null;
    setAnalyzingExamId(null);
  }, []);

  return { analyzeExam, analyzingExamId, examUrgent, stopExamAnalysis };
}
