import { useMemo, useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { COOK_COPY } from "../../lib/cook-timer";
import { localDate } from "../../lib/dates";
import { applyDeduction, deductRows, undoDeduction, type DeductRow } from "../../lib/pantry-deduct";
import type { PantryItem, RecipeCard } from "../../types";
import type { RecipeActions } from "./recipe-actions";
import { useKitchenCommit } from "./useKitchenCommit";

/** Depois de descontar: volta para a receita se ela segue na tela, senão para "Meus alimentos". */
const focusAfterDeduct = (name: string) =>
  requestAnimationFrame(() => {
    const label = `Ver receita: ${name}`;
    const recipe = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="recipe-card"] button'),
    ).find((button) => button.getAttribute("aria-label") === label);
    (recipe ?? document.querySelector<HTMLElement>(".pantry-inventory h2"))?.focus();
  });

/**
 * "Descontar da despensa" (AGENTE-11): a folha da receita fecha e esta abre no nível da tela.
 * "Atualizar despensa" aplica uma vez só (trava síncrona) e o "Desfazer" devolve o que mudou,
 * inclusive o que "Acabou".
 */
export function useDeductFlow() {
  const { state } = useApp();
  const kitchenCommit = useKitchenCommit();
  const [deducting, setDeducting] = useState<{ name: string; rows: DeductRow[] } | null>(null);
  // Trava síncrona do "Atualizar despensa": o estado só muda no próximo render, e um toque duplo
  // descontaria duas vezes (o "Desfazer" do segundo não traria de volta o que "Acabou").
  const deductBusy = useRef(false);
  const [isSaving, setSaving] = useState(false);
  const recipeActions = useMemo<RecipeActions>(
    () => ({
      deduct: (card: RecipeCard, name: string) =>
        setDeducting({ name, rows: deductRows(card, state.pantry, localDate()) }),
    }),
    [state.pantry],
  );
  const confirm = async (rows: DeductRow[]) => {
    const current = deducting;
    if (!current || deductBusy.current) return;
    const now = new Date().toISOString();
    // Nada muda (tudo "Não mexer"): fecha sem aviso.
    if (!applyDeduction(state, rows, now).before.length) {
      setDeducting(null);
      return;
    }
    deductBusy.current = true;
    setSaving(true);
    let before: PantryItem[] = [];
    try {
      const ok = await kitchenCommit(
        (s) => {
          const result = applyDeduction(s, rows, now);
          before = result.before;
          return result.state;
        },
        COOK_COPY.deducted,
        {
          label: "Desfazer",
          onAction: () => void kitchenCommit((s) => undoDeduction(s, before), COOK_COPY.deductUndone),
        },
      );
      if (!ok) return;
      setDeducting(null);
      focusAfterDeduct(current.name);
    } finally {
      deductBusy.current = false;
      setSaving(false);
    }
  };
  return { deducting, isSaving, recipeActions, confirm, close: () => setDeducting(null) };
}
