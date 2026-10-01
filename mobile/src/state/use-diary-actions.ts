import { localDate, localTime, uid } from "@shared/lib/domain";
import { fmtRelDate } from "@shared/lib/format";
import { cloneMealItems, defaultMealCategory, mealEntry } from "@shared/lib/meals";
import { diarySchema, type DiaryEntry, type InjectionEntry, type MealItem } from "@shared/types";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "./app-context";

/**
 * Registros de um toque e exclusões com "Desfazer", iguais no Hoje, no Diário e no registro rápido
 * (useDiaryActions do web). Um registro salvo vibra de leve no aparelho.
 */
export function useDiaryActions() {
  const { state, commit, notify } = useApp();

  /** Grava um registro; "Desfazer" remove exatamente o que foi gravado. */
  const addEntry = async (fields: Record<string, unknown>, date: string, message: string) => {
    const now = new Date().toISOString();
    const entry = diarySchema.safeParse({
      id: uid(),
      userId: state.userId,
      date,
      time: localTime(),
      createdAt: now,
      updatedAt: now,
      description: "",
      ...fields,
    });
    if (!entry.success || date > localDate()) {
      notify("Não foi possível salvar o registro.", "warning");
      return false;
    }
    const saved = await commit((s) => ({ ...s, diary: [...s.diary, entry.data] }), message, {
      label: "Desfazer",
      onAction: () =>
        void commit((s) => ({ ...s, diary: s.diary.filter((e) => e.id !== entry.data.id) }), "Registro desfeito."),
    });
    if (saved) successHaptic();
    return saved;
  };

  const addWater = (ml: number, date: string) =>
    addEntry(
      { type: "agua", title: "Água", description: `Registro rápido: +${ml} ml`, amountMl: ml },
      date,
      `+${ml} ml registrados.`,
    );

  const logMood = (rating: number, date: string) =>
    addEntry({ type: "bem_estar", title: "Bem-estar", rating }, date, "Bem-estar registrado.");

  /**
   * Excluir é imediato e pode ser desfeito pelo aviso (sem diálogo). O que "Desfazer" devolve é lido
   * dentro do commit, na versão mais recente do estado (uma edição na fila fica).
   */
  const removeEntry = (id: string) => {
    let removed: DiaryEntry | null = null;
    void commit(
      (s) => {
        removed = s.diary.find((item) => item.id === id) ?? null;
        return removed ? { ...s, diary: s.diary.filter((item) => item.id !== id) } : s;
      },
      "Registro excluído; totais atualizados.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => {
            const restored = removed;
            return !restored || s.diary.some((item) => item.id === id) ? s : { ...s, diary: [...s.diary, restored] };
          }, "Registro restaurado."),
      },
    );
  };

  const removeInjection = (id: string) => {
    let removed: InjectionEntry | null = null;
    void commit(
      (s) => {
        removed = s.injections.find((item) => item.id === id) ?? null;
        return removed ? { ...s, injections: s.injections.filter((item) => item.id !== id) } : s;
      },
      "Aplicação excluída.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => {
            const restored = removed;
            return !restored || s.injections.some((item) => item.id === id)
              ? s
              : { ...s, injections: [...s.injections, restored] };
          }, "Aplicação restaurada."),
      },
    );
  };

  /** Registra de novo os mesmos alimentos, hoje e agora, com o tipo sugerido pelo horário. */
  const repeatMeal = async (items: readonly MealItem[]) => {
    const profile = state.profile;
    if (!profile) return false;
    const today = localDate();
    const time = localTime();
    const category = defaultMealCategory(time, profile);
    const id = uid();
    const result = mealEntry({
      id,
      userId: state.userId,
      date: today,
      time,
      category,
      items: cloneMealItems(items),
      now: new Date().toISOString(),
      today,
    });
    if (!result.success) {
      notify("Não foi possível repetir esta refeição.", "warning");
      return false;
    }
    const saved = await commit(
      (s) => ({ ...s, diary: [...s.diary, result.entry] }),
      `Refeição registrada: ${category}, ${fmtRelDate(today, today)} às ${time}.`,
      {
        label: "Desfazer",
        onAction: () => void commit((s) => ({ ...s, diary: s.diary.filter((d) => d.id !== id) }), "Registro desfeito."),
      },
    );
    if (saved) successHaptic();
    return saved;
  };

  return { addWater, logMood, removeEntry, removeInjection, repeatMeal };
}
