import { createContext, useContext } from "react";
import type { RecipeCard } from "../../types";

/**
 * Ações da Despensa oferecidas à folha da receita. "Descontar da despensa" abre no nível da tela:
 * mudar a despensa troca a assinatura das receitas e desmonta a folha (RecipeList.Generation).
 */
export interface RecipeActions {
  /** Fecha a folha e abre "Descontar da despensa" para esta receita (`name` já mascarado). */
  deduct(card: RecipeCard, name: string): void;
}

export const RecipeActionsContext = createContext<RecipeActions | null>(null);

/** null fora da Despensa (ex.: receita aberta em outro lugar): o botão de descontar não aparece. */
export function useRecipeActions(): RecipeActions | null {
  return useContext(RecipeActionsContext);
}
