import { useCallback, useState } from "react";
import { friendlyName } from "@shared/lib/food-search";
import { defaultPortion, type PortionUnit } from "@shared/lib/household-measures";
import { MEAL_TEXT_COPY } from "@shared/lib/meal-text";
import type { FoodItem, MealItem } from "@shared/types";
import { confirmAsync } from "@/lib/confirm";
import type { MealTextSelection } from "./meal-text-draft";

/** Um alimento que entra no prato com a porção já decidida. */
export interface PlatePortion {
  food: FoodItem;
  grams: number;
  unit: PortionUnit;
}

/**
 * "Descrever refeição" na tela de registro (DIARIO-07): abre e fecha a folha, põe no prato os itens
 * escolhidos (porção dita ou a medida caseira padrão) e guarda, só nesta tela, os que entraram sem
 * porção dita ("Falta porção"). Salvar com algum deles pede confirmação; nunca há palpite silencioso.
 */
export function useMealText(
  items: readonly MealItem[],
  addPortions: (entries: PlatePortion[], message: string) => void,
) {
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const clearPending = useCallback(
    (foodId: string) =>
      setPending((current) => {
        if (!current.has(foodId)) return current;
        const next = new Set(current);
        next.delete(foodId);
        return next;
      }),
    [],
  );
  const addFromText = (selections: readonly MealTextSelection[]) => {
    if (!selections.length) return;
    const entries = selections.map(({ food, portion }) => {
      const chosen = portion ?? defaultPortion(food);
      return { food, grams: chosen.grams, unit: chosen.unit };
    });
    const missing = new Set(selections.filter((s) => !s.portion).map((s) => s.food.id));
    const stated = new Set(selections.filter((s) => s.portion).map((s) => s.food.id));
    setPending((current) => new Set([...[...current].filter((id) => !stated.has(id)), ...missing]));
    setOpen(false);
    addPortions(entries, MEAL_TEXT_COPY.added(selections.length, missing.size));
  };
  /** Itens do prato ainda sem porção dita, na ordem do prato. */
  const pendingItems = items.filter((i) => pending.has(i.food.id));
  /** true = pode salvar (nada pendente ou a pessoa aceitou a medida padrão). */
  const confirmPending = async (): Promise<boolean> => {
    if (!pendingItems.length) return true;
    const names = pendingItems.map((i) => friendlyName(i.food.name).label);
    return confirmAsync(
      MEAL_TEXT_COPY.confirmTitle,
      MEAL_TEXT_COPY.confirmMessage(names),
      MEAL_TEXT_COPY.confirmOk,
    );
  };
  return { isOpen, open, close, pending, clearPending, addFromText, confirmPending };
}
