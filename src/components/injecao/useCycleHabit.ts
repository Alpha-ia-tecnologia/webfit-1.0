import { useApp } from "../../lib/context";
import { habitFromTip, type CycleTip } from "../../lib/cycle-tips";
import { localDate, uid } from "../../lib/domain";

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "+ Combinado" de uma dica do ciclo (SERINGA-11): pergunta antes de criar (título e horário da
 * dica), grava com "Desfazer" e diz se um combinado com o mesmo título já existe.
 */
export function useCycleHabit() {
  const { state, commit, confirm, notify } = useApp();
  const exists = (tip: CycleTip) => state.habits.some((h) => sameTitle(h.title, tip.combinado.title));
  const create = async (tip: CycleTip): Promise<boolean> => {
    const { title, time } = tip.combinado;
    const isConfirmed = await confirm({
      title: "Criar combinado?",
      message: `“${title}”, todos os dias às ${time}. Você pode editar ou excluir em Combinados.`,
      confirmLabel: "Criar combinado",
      cancelLabel: "Agora não",
    });
    if (!isConfirmed) return false;
    const habit = habitFromTip(tip, uid(), localDate());
    if (!habit) {
      notify("Não foi possível criar o combinado.", "error");
      return false;
    }
    return commit(
      (s) => (s.habits.some((h) => sameTitle(h.title, habit.title)) ? s : { ...s, habits: [...s.habits, habit] }),
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
