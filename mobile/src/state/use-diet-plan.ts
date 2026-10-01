import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createDietPlan, DIET_PLAN_REQUEST, dietProfileSignature } from "@shared/lib/diet";
import { uid } from "@shared/lib/domain";
import { analyzeExams } from "@shared/lib/exams";
import type { AppState } from "@shared/types";
import type { AppContextValue } from "./app-context-types";

type Options = {
  stateRef: RefObject<AppState | null>;
  aiReady: boolean;
  aiRequest: AppContextValue["aiRequest"];
  commit: AppContextValue["commit"];
  notify: AppContextValue["notify"];
};

/**
 * Dieta a partir da anamnese atual: analisa antes os exames escolhidos, pede o plano ao agente e só
 * grava se perfil, consentimento e exames continuam os mesmos do início da tentativa.
 */
export function useDietPlan({ stateRef, aiReady, aiRequest, commit, notify }: Options) {
  const [dietBusy, setDietBusy] = useState(false);
  const [dietSaving, setDietSaving] = useState(false);
  const [dietError, setDietError] = useState<string | null>(null);
  const [dietProgress, setDietProgress] = useState("");
  const dietExamIds = useRef<string[]>([]);
  const dietAttempt = useRef<{ saving: boolean } | null>(null);
  // Ao desmontar o app, a tentativa em andamento não grava mais nada.
  useEffect(
    () => () => {
      dietAttempt.current = null;
    },
    [],
  );

  const requestDietPlan = useCallback<AppContextValue["requestDietPlan"]>(
    async (examIds) => {
      const current = stateRef.current;
      if (dietAttempt.current) return false;
      if (!current?.profile) {
        setDietError("Conclua a anamnese para criar sua dieta personalizada.");
        return false;
      }
      if (!current.profile.consentAi) {
        setDietError(
          "Sua anamnese está salva. Autorize o compartilhamento com a IA em Meu espaço para criar a dieta.",
        );
        return false;
      }
      if (!aiReady) {
        setDietError(
          "Sua anamnese está salva. Conecte o servidor do agente em Meu espaço e tente criar a dieta novamente.",
        );
        return false;
      }
      if (examIds !== undefined) dietExamIds.current = [...examIds];
      const selectedExams = [...dietExamIds.current];
      let selectedSnapshot: string | undefined;
      const attempt = { saving: false };
      const profile = current.profile;
      const profileSignature = dietProfileSignature(profile);
      const canSave = (candidate: AppState) =>
        dietAttempt.current === attempt &&
        candidate.userId === current.userId &&
        !!candidate.profile?.consentAi &&
        dietProfileSignature(candidate.profile) === profileSignature &&
        JSON.stringify(
          candidate.exams.filter((e) => selectedExams.includes(e.id)),
        ) === selectedSnapshot;
      dietAttempt.current = attempt;
      setDietBusy(true);
      setDietSaving(false);
      setDietError(null);
      try {
        setDietProgress("");
        if (selectedExams.length) {
          await analyzeExams({
            ids: selectedExams,
            getState: () => stateRef.current,
            isCurrent: () => dietAttempt.current === attempt,
            request: aiRequest,
            commit,
            progress: setDietProgress,
          });
          if (dietAttempt.current !== attempt) return false;
          setDietProgress("");
        }
        selectedSnapshot = JSON.stringify(
          stateRef.current?.exams.filter((e) => selectedExams.includes(e.id)),
        );
        const reply = await aiRequest(
          "diet",
          DIET_PLAN_REQUEST,
          undefined,
          undefined,
          selectedExams,
        );
        if (!stateRef.current || !canSave(stateRef.current))
          throw new Error(
            "Seu perfil mudou durante a criação. Gere uma nova dieta com a anamnese atual.",
          );
        const plan = createDietPlan(reply, profile);
        attempt.saving = true;
        setDietSaving(true);
        let applied = false;
        const saved = await commit((s) => {
          if (!canSave(s)) return s;
          applied = true;
          return {
            ...s,
            dietPlan: plan,
            messages: [
              ...s.messages.slice(-1998),
              {
                id: uid(),
                sender: "user",
                text: DIET_PLAN_REQUEST,
                timestamp: plan.createdAt,
                status: "sent",
              },
              {
                id: uid(),
                sender: "ai",
                text: plan.text,
                meta: plan.meta,
                timestamp: plan.createdAt,
                status: "sent",
              },
            ],
          };
        });
        if (!saved)
          throw new Error(
            "A dieta foi gerada, mas não foi salva no aparelho. Tente novamente.",
          );
        if (!applied || !stateRef.current || !canSave(stateRef.current))
          throw new Error(
            "Seu perfil mudou durante a criação. Gere uma nova dieta com a anamnese atual.",
          );
        notify("Sua dieta personalizada está pronta.");
        return true;
      } catch (error) {
        if (dietAttempt.current === attempt)
          setDietError(
            error instanceof Error
              ? error.message
              : "Não foi possível criar sua dieta. Tente novamente.",
          );
        return false;
      } finally {
        if (dietAttempt.current === attempt) {
          dietAttempt.current = null;
          setDietBusy(false);
          setDietSaving(false);
        }
      }
    },
    [aiReady, aiRequest, commit, notify, stateRef],
  );

  /** Cancelar só interrompe uma tentativa que ainda não começou a gravar; a mensagem deixa tentar de novo. */
  const cancelDietAttempt = useCallback(() => {
    if (dietAttempt.current && !dietAttempt.current.saving) {
      dietAttempt.current = null;
      setDietBusy(false);
      setDietError("Criação da dieta cancelada. Você pode tentar novamente.");
    }
  }, []);

  /** Dados excluídos ou restaurados: esquece a tentativa, os exames escolhidos, o erro e o andamento. */
  const clearDiet = useCallback(() => {
    dietAttempt.current = null;
    dietExamIds.current = [];
    setDietBusy(false);
    setDietSaving(false);
    setDietError(null);
    setDietProgress("");
  }, []);

  return {
    requestDietPlan,
    dietBusy,
    dietSaving,
    dietError,
    dietProgress,
    cancelDietAttempt,
    clearDiet,
  };
}
