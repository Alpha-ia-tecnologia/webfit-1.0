import { useApp } from "../../lib/context";
import { tapFeedback } from "../../lib/haptics";
import { toggleKitchenBasic } from "../../lib/kitchen-basics";
import { RECIPE_REQUEST, saveRecipe } from "../../lib/pantry";
import { visiblePlainText } from "../../lib/text";
import type { KitchenBasicKey, PantryItem } from "../../types";
import type { PantryRun } from "./usePantryRun";

/**
 * "Criar receitas" (e "Receitas com eles"): pede ao agente e salva sobre o estado do momento do
 * pedido. `reason` bloqueia (ex.: sem dieta ou sem alimentos). Sem comemoração nem vibração de
 * sucesso: receitas não são meta (perfis sensíveis inclusive).
 */
export function useRecipeGenerator(run: PantryRun, reason: string) {
  const { state, commit, aiRequest } = useApp();
  return async (request: string = RECIPE_REQUEST) => {
    if (!run.canAi || reason) return;
    const snapshot = state;
    const attempt = run.begin("recipe", true);
    try {
      const reply = await aiRequest("recipe", request);
      if (!run.isCurrent(attempt)) return;
      run.releaseAi();
      run.setBusy("saving_recipe");
      if (!(await commit((s) => saveRecipe(s, reply, snapshot), "Receitas salvas.")))
        throw new Error(
          "Não foi possível salvar as receitas. Confira sua dieta e os alimentos atuais e tente novamente.",
        );
    } catch (e) {
      if (run.isCurrent(attempt)) run.fail("recipes", e);
    } finally {
      run.settle(attempt);
    }
  };
}

/** Remover um alimento (com "Desfazer") e marcar o básico da cozinha. */
export function usePantryItemActions() {
  const { state, commit } = useApp();
  const hide = state.profile?.hideCalories ?? false;
  const remove = (item: PantryItem) =>
    commit(
      (s) => ({ ...s, pantry: s.pantry.filter((i) => i.id !== item.id) }),
      `${visiblePlainText(item.name, hide)} removido.`,
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              s.pantry.some((i) => i.id === item.id) ? s : { ...s, pantry: [...s.pantry, item] },
            "Item restaurado.",
          ),
      },
    );
  const toggleBasic = (key: KitchenBasicKey) => {
    tapFeedback();
    void commit((s) => toggleKitchenBasic(s, key));
  };
  return { remove, toggleBasic };
}
