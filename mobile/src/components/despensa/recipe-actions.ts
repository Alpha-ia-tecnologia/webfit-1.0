import { createContext, useContext } from "react";
import type { RecipeCard } from "@shared/types";

/**
 * Ações da Despensa que o painel da receita chama sem desenhar nada por conta própria: o painel
 * fica dentro da geração de receitas, que some quando a despensa muda; o "Descontar da despensa"
 * abre na própria tela.
 */
export interface RecipeActions {
  /** Abre "Descontar da despensa" para a receita (`name` já mascarado). */
  deduct: (card: RecipeCard, name: string) => void;
}

export const RecipeActionsContext = createContext<RecipeActions | null>(null);

/** null fora da Despensa (o painel então não oferece descontar). */
export function useRecipeActions(): RecipeActions | null {
  return useContext(RecipeActionsContext);
}
