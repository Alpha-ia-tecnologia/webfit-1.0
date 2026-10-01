import { useCallback } from "react";
import { visiblePlainText } from "@shared/lib/text";
import type { AppState, ToastAction } from "@shared/types";
import { useApp } from "@/state/app-context";

type SafeCommitOptions = {
  /**
   * Quem mostra a recusa no lugar do aviso laranja: uma folha aberta cobre o aviso, então ela mostra
   * a frase por dentro (useSheetNotice) ou num campo (peso do registro rápido).
   */
  onRefuse?: (text: string) => void;
  /**
   * Quem mostra o aviso de sucesso (com o "Desfazer") no lugar do aviso da janela principal: dentro de uma
   * folha aberta ele ficaria coberto (lista de compras na Despensa).
   */
  onSuccess?: (message: string, action?: ToastAction) => void;
};

/**
 * Grava uma mudança da cozinha (lista de compras, "Use primeiro", descontar da despensa) cujas funções
 * podem recusar com uma frase para pessoas (limite de 200 itens, de 500 na despensa, nome vazio): a
 * recusa vira um aviso laranja com a frase (ou vai para `onRefuse`), e o estado fica como estava. O
 * aviso de sucesso (com "Desfazer") só aparece quando a mudança entrou.
 */
export function useSafeCommit(): (
  update: (state: AppState) => AppState,
  message?: string,
  action?: ToastAction,
  options?: SafeCommitOptions,
) => Promise<boolean> {
  const { state, commit, notify } = useApp();
  const hide = state.profile?.hideCalories ?? true;
  return useCallback(
    async (update, message, action, options) => {
      const failure = { text: "" };
      const saved = await commit((current) => {
        try {
          return update(current);
        } catch (error) {
          failure.text = error instanceof Error ? error.message : "Não foi possível salvar.";
          return current;
        }
      });
      if (failure.text) {
        const text = visiblePlainText(failure.text, hide);
        if (options?.onRefuse) options.onRefuse(text);
        else notify(text, "warning");
        return false;
      }
      if (saved && message) {
        if (options?.onSuccess) options.onSuccess(message, action);
        else notify(message, "success", action);
      }
      return saved;
    },
    [commit, notify, hide],
  );
}
