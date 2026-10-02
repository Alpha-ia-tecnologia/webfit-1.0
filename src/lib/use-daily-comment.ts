/**
 * Dispara o comentário automático do dia (daily-comment.ts), igual no web e no nativo: com o Hoje
 * aberto e as condições de shouldRunDailyComment valendo, roda uma vez. Uma tentativa por dia nesta
 * sessão, mesmo sem cota ou com falha (sem laço de novas tentativas); entre sessões e aparelhos, a
 * data gravada no estado (aiDailyCommentDate) garante o "uma vez por dia"; por isso, com a cópia no
 * servidor ligada, espera a primeira comparação terminar ("synced") antes de rodar (isSyncSettled).
 */
import { useEffect, useRef } from "react";
import type { AppState } from "../types";
import { localDate } from "./dates";
import {
  runDailyComment,
  shouldRunDailyComment,
  type DailyCommentRun,
  type DailyCommentSync,
} from "./daily-comment";

export interface DailyCommentOptions extends Omit<DailyCommentRun, "today"> {
  state: AppState | null;
  /** O Hoje está na tela (web: tela "hoje"; nativo: aba Hoje montada). */
  isHome: boolean;
  aiReady: boolean;
  aiBusy: boolean;
  /** Restauração, troca de conta ou outra gravação em lote em andamento: espera. */
  isPaused?: boolean;
  /** Cópia no servidor (controles de useServerSync): com ela ligada, só roda depois de comparada. */
  sync: DailyCommentSync;
}

export function useDailyComment(options: DailyCommentOptions): void {
  const { state, isHome, aiReady, aiBusy, isPaused = false, sync } = options;
  const latest = useRef(options);
  const attemptedOn = useRef<string | null>(null);
  useEffect(() => {
    latest.current = options;
  });
  const today = localDate();
  const isDue = isHome && !isPaused && shouldRunDailyComment({ state, today, aiReady, aiBusy, sync });
  useEffect(() => {
    if (!isDue || attemptedOn.current === today) return;
    attemptedOn.current = today;
    const { getState, request, commit, checkQuota } = latest.current;
    void runDailyComment({ today, getState, request, commit, checkQuota });
  }, [isDue, today]);
}
