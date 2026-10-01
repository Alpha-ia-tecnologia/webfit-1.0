import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AgentProgress } from "@shared/lib/agent-stream";
import { CLIENT_TIMEOUT_MS } from "@shared/lib/limits";
import { agentRequestContext } from "@shared/lib/pantry";
import type { AppState } from "@shared/types";
import { callAgent, type AgentStatus } from "@/lib/api";
import type { AppContextValue } from "./app-context-types";

type Options = {
  stateRef: RefObject<AppState | null>;
  agentStatus: RefObject<AgentStatus | null>;
  token: RefObject<string>;
  /** A função é refeita quando a conexão muda de estado. */
  aiReady: boolean;
};

/**
 * Uma solicitação ao agente por vez: consentimento e conexão conferidos antes, contexto e histórico
 * montados a partir do estado atual, etapa do grafo em `aiStage`, tempo máximo e cancelamento.
 */
export function useAiRequest({ stateRef, agentStatus, token, aiReady }: Options) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStage, setAiStage] = useState<AgentProgress | null>(null);
  const request = useRef<AbortController | null>(null);
  // Ao desmontar o app, a solicitação em andamento é interrompida.
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  const aiRequest = useCallback<AppContextValue["aiRequest"]>(
    async (mode, text, file, location, examIds = []) => {
      const current = stateRef.current;
      if (!current?.profile?.consentAi)
        throw new Error("Autorize o uso de contexto pela IA em Meu espaço.");
      if (!agentStatus.current?.ready)
        throw new Error(
          "O agente ainda não está conectado. Verifique a conexão e tente novamente.",
        );
      if (request.current)
        throw new Error("Aguarde a solicitação atual ou cancele-a.");
      const controller = new AbortController();
      request.current = controller;
      setAiBusy(true);
      setAiStage(null);
      const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      try {
        const reply = await callAgent(
          {
            mode,
            text,
            file,
            consent: true,
            context: {
              ...agentRequestContext(current, mode, location),
              ...(mode === "diet" && examIds.length
                ? {
                    examAnalyses: current.exams
                      .filter((exam) => examIds.includes(exam.id))
                      .map(({ name, date, analysis }) => ({
                        name,
                        date,
                        analysis,
                      })),
                  }
                : {}),
            },
            history: [
              "diet",
              "recipe",
              "pantry_photo",
              "shopping_photo",
              "rotulo",
              "meal_text",
            ].includes(mode)
              ? []
              : current.messages
                  .filter((m) => m.status !== "error")
                  .slice(-16)
                  .map(({ sender, text: body }) => ({ sender, text: body })),
          },
          token.current,
          controller.signal,
          (progress) => {
            if (request.current === controller) setAiStage(progress);
          },
        );
        if (!stateRef.current?.profile?.consentAi || controller.signal.aborted)
          throw new Error("Solicitação cancelada.");
        return reply;
      } catch (error) {
        if (controller.signal.aborted)
          throw new Error(
            "Solicitação cancelada ou tempo de resposta excedido. Você pode tentar novamente.",
          );
        throw error;
      } finally {
        clearTimeout(timeout);
        if (request.current === controller) {
          request.current = null;
          setAiBusy(false);
          setAiStage(null);
        }
      }
    },
    [aiReady, stateRef, agentStatus, token],
  );

  /** Interrompe a solicitação atual (se houver) e limpa o andamento. */
  const abortAi = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setAiBusy(false);
    setAiStage(null);
  }, []);

  return { aiBusy, aiStage, aiRequest, abortAi };
}
