import { useCallback } from "react";
import { useApp } from "../../lib/context";
import type { AppState, ToastAction } from "../../types";

/**
 * Commit da cozinha (lista de compras, "Descontar da despensa"): as regras das bibliotecas lançam
 * erros com frase para pessoas (limite de 200 itens, de 500 na despensa, nome vazio). Aqui eles
 * viram aviso (âmbar), não erro vermelho, e nada muda; sem erro, o aviso de sucesso sai com a ação.
 */
export function useKitchenCommit() {
  const { commit, notify } = useApp();
  return useCallback(
    async (
      update: (state: AppState) => AppState,
      message: string,
      action?: ToastAction,
    ): Promise<boolean> => {
      let failure: string | null = null;
      const ok = await commit((state) => {
        try {
          return update(state);
        } catch (error) {
          // A validação do esquema (zod) não tem frase para pessoas: vira a mensagem genérica.
          failure =
            error instanceof Error && error.name !== "ZodError"
              ? error.message
              : "Não foi possível salvar.";
          return state;
        }
      });
      if (!ok) return false;
      if (failure) {
        notify(failure, "warning");
        return false;
      }
      notify(message, "success", action);
      return true;
    },
    [commit, notify],
  );
}
