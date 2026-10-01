import { habitFromTip, type CycleTip } from "@shared/lib/cycle-tips";
import { localDate, uid } from "@shared/lib/domain";
import type { HabitItem } from "@shared/types";
import { confirmAsync } from "@/lib/confirm";
import { useApp } from "@/state/app-context";

/** Mesmo título, sem espaços nas pontas e sem diferença de maiúsculas. */
const sameTitle = (habit: HabitItem, tip: CycleTip) =>
  habit.title.trim().toLowerCase() === tip.combinado.title.trim().toLowerCase();

/**
 * "+ Combinado" das dicas do ciclo (SERINGA-11): um toque e a confirmação criam o combinado com o título
 * e o horário da dica; "Desfazer" o remove. Um combinado com o mesmo título já existente não é duplicado.
 */
export function useCycleHabit() {
  const { state, commit } = useApp();
  const exists = (tip: CycleTip) => state.habits.some((habit) => sameTitle(habit, tip));
  const create = async (tip: CycleTip): Promise<boolean> => {
    const isConfirmed = await confirmAsync(
      "Criar combinado?",
      `“${tip.combinado.title}”, todos os dias às ${tip.combinado.time}. Você pode editar ou excluir em Combinados.`,
      "Criar combinado",
    );
    if (!isConfirmed) return false;
    const habit = habitFromTip(tip, uid(), localDate());
    if (!habit) return false;
    return commit(
      (s) => (s.habits.some((h) => sameTitle(h, tip)) ? s : { ...s, habits: [...s.habits, habit] }),
      "Combinado criado.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== habit.id) }), "Combinado desfeito."),
      },
    );
  };
  return { exists, create };
}
