import { useCallback, useEffect, useRef, useState } from "react";
import { initialState } from "@shared/lib/domain";
import { encouragementFor } from "@shared/lib/today";
import type { AppState } from "@shared/types";
import { loadState, saveState } from "@/lib/storage";
import type { AppContextValue } from "./app-context-types";

/**
 * Estado salvo no aparelho: leitura na abertura (uma falha preserva os dados e abre a recuperação) e
 * gravações em fila, uma por vez. Excluir e restaurar trocam a época dos dados (`dataEpoch`): funções
 * retidas por telas antigas deixam de gravar.
 */
export function useAppStore(notify: AppContextValue["notify"]) {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dataEpoch, setDataEpoch] = useState(0);
  const dataEpochRef = useRef(0);
  const restoring = useRef(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    loadState()
      .then((value) => {
        if (!alive) return;
        const next = value ?? initialState();
        stateRef.current = next;
        setState(next);
      })
      .catch(() => {
        if (alive)
          setLoadError(
            "Não foi possível abrir os dados salvos. Eles foram preservados; você pode exportar uma cópia para recuperação.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback<AppContextValue["commit"]>(
    (update, message, action) => {
      // Funções retidas por telas antigas não podem gravar no estado restaurado ou reiniciado.
      if (restoring.current || dataEpoch !== dataEpochRef.current)
        return Promise.resolve(false);
      const task = queue.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const current = stateRef.current;
            if (!current || dataEpoch !== dataEpochRef.current) return false;
            const next = {
              ...update(current),
              revision: current.revision + 1,
              updatedAt: new Date().toISOString(),
            };
            await saveState(next);
            stateRef.current = next;
            setState(next);
            const cheer = encouragementFor(current, next);
            // Mini anel só para água e combinados: refeições dariam uma pista de calorias.
            const progress =
              cheer && cheer.kind !== "meal" && cheer.percent !== null
                ? { percent: cheer.percent, tone: cheer.kind }
                : undefined;
            if (message) notify({ text: message, progress }, "success", action);
            else if (cheer) notify({ text: cheer.title, progress });
            return true;
          } catch (error) {
            // Falha real ao gravar: o único uso do aviso vermelho. A validação do esquema (zod) não
            // tem frase para pessoas: vira a mensagem genérica em vez do JSON dos erros.
            notify(
              error instanceof Error && error.name !== "ZodError"
                ? error.message
                : "Não foi possível salvar.",
              "error",
            );
            return false;
          }
        });
      queue.current = task;
      return task;
    },
    [notify, dataEpoch],
  );

  return {
    state,
    setState,
    stateRef,
    loadError,
    setLoadError,
    dataEpoch,
    setDataEpoch,
    dataEpochRef,
    restoring,
    isRestoring,
    setIsRestoring,
    queue,
    commit,
  };
}
