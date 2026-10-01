/**
 * Semana de um combinado (segunda a domingo) para os 7 pontos do Hoje (web + app nativo).
 * Sem sequência nem cobrança: só o que foi feito, o que passou sem registro (cinza, nunca vermelho),
 * hoje e os dias que ainda não chegaram (ou antes de o combinado existir).
 */
import type { HabitItem } from "../types";
import { weekDays } from "./today";

export type HabitDayState = "done" | "missed" | "today" | "future" | "before";

/** Estado de cada dia da semana de `today` (seg→dom). Hoje feito conta como "done". */
export function habitWeek(
  habit: Pick<HabitItem, "createdDate" | "completedDates">,
  today: string,
): HabitDayState[] {
  const done = new Set(habit.completedDates);
  return weekDays(today).map((date) => {
    if (done.has(date) && date <= today) return "done";
    if (date > today) return "future";
    if (date < habit.createdDate) return "before";
    return date === today ? "today" : "missed";
  });
}

/** Dias feitos e dias que já valeram nesta semana (até hoje, desde a criação). */
export function habitWeekSummary(states: readonly HabitDayState[]): { done: number; days: number } {
  return {
    done: states.filter((s) => s === "done").length,
    days: states.filter((s) => s === "done" || s === "missed" || s === "today").length,
  };
}

/** "3 de 4 dias nesta semana" (sem sequência); "1 de 1 dia nesta semana" no singular. */
export function habitWeekLabel(states: readonly HabitDayState[]): string {
  const { done, days } = habitWeekSummary(states);
  return `${done} de ${days} ${days === 1 ? "dia" : "dias"} nesta semana`;
}
