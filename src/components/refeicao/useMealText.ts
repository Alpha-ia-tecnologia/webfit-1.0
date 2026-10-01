import { useState, type RefObject } from "react";
import { useApp } from "../../lib/context";
import { friendlyName } from "../../lib/food-search";
import { defaultPortion, type PortionUnit } from "../../lib/household-measures";
import { MEAL_TEXT_COPY } from "../../lib/meal-text";
import type { StatedPortion } from "../../lib/taco-match";
import type { FoodItem, MealItem } from "../../types";

/** Alimento escolhido no rascunho da descrição; porção null = medida caseira padrão e "Falta porção". */
export interface MealTextSelection {
  food: FoodItem;
  portion: StatedPortion | null;
}

const NO_PENDING: ReadonlySet<string> = new Set();

/**
 * "Descrever refeição" (DIARIO-07) na tela de refeição: abre e fecha a folha, põe no prato o que a
 * pessoa escolheu (porção dita ou a medida caseira padrão) e guarda, só nesta tela, os alimentos sem
 * porção dita. Salvar com algum deles pede confirmação; nada é salvo com um palpite silencioso.
 */
export function useMealText({
  items,
  add,
  onAdded,
  plateRef,
}: {
  items: readonly MealItem[];
  /** O "adicionar" da tela (junta ao item que já está no prato). */
  add: (food: FoodItem, grams: number, unit: PortionUnit) => void;
  /** Depois de adicionar: anuncia a mensagem e leva o foco para "Seu prato". */
  onAdded: (message: string) => void;
  plateRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { confirm } = useApp();
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(NO_PENDING);
  const open = () => setOpen(true);
  const close = () => setOpen(false);
  /** "Manter porção", qualquer ajuste da porção ou remover o item: o aviso some. */
  const clearPending = (id: string) =>
    setPending((current) =>
      current.has(id) ? new Set([...current].filter((pendingId) => pendingId !== id)) : current,
    );
  const addFromText = (selections: readonly MealTextSelection[]) => {
    setOpen(false);
    if (!selections.length) return;
    for (const { food, portion } of selections) {
      const { grams, unit } = portion ?? defaultPortion(food);
      add(food, grams, unit);
    }
    const stated = new Set(selections.filter((s) => s.portion).map((s) => s.food.id));
    const missing = new Set(selections.filter((s) => !s.portion).map((s) => s.food.id));
    setPending(
      (current) => new Set([...[...current].filter((id) => !stated.has(id)), ...missing]),
    );
    onAdded(MEAL_TEXT_COPY.added(selections.length, missing.size));
  };
  /** Antes de salvar: com alimentos sem porção dita, pergunta; "Conferir porções" volta ao prato. */
  const confirmPending = async (): Promise<boolean> => {
    const names = items
      .filter((item) => pending.has(item.food.id))
      .map((item) => friendlyName(item.food.name).label);
    if (!names.length) return true;
    const isConfirmed = await confirm({
      title: MEAL_TEXT_COPY.confirmTitle,
      message: MEAL_TEXT_COPY.confirmMessage(names),
      confirmLabel: MEAL_TEXT_COPY.confirmOk,
      cancelLabel: MEAL_TEXT_COPY.confirmCancel,
    });
    if (!isConfirmed) requestAnimationFrame(() => plateRef.current?.focus());
    return isConfirmed;
  };
  return { isOpen, open, close, pending, clearPending, addFromText, confirmPending };
}
