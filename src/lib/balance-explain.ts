/**
 * "Como calculamos" (web e app nativo): o ajuste dinâmico do dia como linha estruturada
 * (`Meta-base 1.806 → hoje 1.953`, o delta e o motivo numa linha; `Proteína +9 g` à parte), no lugar
 * do parágrafo. Lógica pura sobre o DailyTarget de dailyTargets (lib/domain); nada é recalculado aqui.
 */
import type { DailyTarget } from "./domain";
import { fmtNumber } from "./format";

export interface AdjustmentCalories {
  /** Meta-base do dia, formatada ("1.806"). */
  base: string;
  /** Meta do dia depois do ajuste ("1.953"). */
  target: string;
  /** Delta com sinal e unidade ("+147 kcal", "−99 kcal"). */
  delta: string;
  direction: "up" | "down";
  /** Motivo em uma linha, sem culpa ("ontem você comeu menos"). */
  why: string;
}
export interface AdjustmentView {
  /** "hoje" no dia de hoje; "neste dia" quando o Diário mostra outra data. */
  dayLabel: "hoje" | "neste dia";
  /** Só com ajuste calórico (com "Ocultar calorias" as calorias não mudam). */
  calories: AdjustmentCalories | null;
  /** Proteína somada para recuperar a de ontem ("+9 g"). */
  protein: { delta: string; why: string } | null;
}

const WHY = {
  today: {
    up: "ontem você comeu menos",
    down: "para equilibrar ontem",
    protein: "para recuperar a de ontem",
  },
  otherDay: {
    up: "no dia anterior você comeu menos",
    down: "para equilibrar o dia anterior",
    protein: "para recuperar a do dia anterior",
  },
} as const;

/** Valor com sinal tipográfico: "+147", "−99" (menos verdadeiro, U+2212). */
export const signedNumber = (value: number) =>
  `${value < 0 ? "−" : "+"}${fmtNumber(Math.abs(value))}`;

/** A frase do ajuste de outra data começa por "Neste dia…" (adjustmentNoteFor em lib/domain). */
const isOtherDay = (goals: DailyTarget) =>
  goals.adjustmentNote?.startsWith("Neste dia") ?? false;

/** Linhas do ajuste do dia; null sem ajuste algum (calorias e proteína iguais à meta-base). */
export function adjustmentView(goals: DailyTarget): AdjustmentView | null {
  if (goals.adjustment === 0 && goals.proteinBoost === 0) return null;
  const why = isOtherDay(goals) ? WHY.otherDay : WHY.today;
  const direction: AdjustmentCalories["direction"] =
    goals.adjustment < 0 ? "down" : "up";
  const calories =
    goals.adjustment !== 0 &&
    goals.baseCalories !== null &&
    goals.calories !== null
      ? {
          base: fmtNumber(goals.baseCalories),
          target: fmtNumber(goals.calories),
          delta: `${signedNumber(goals.adjustment)} kcal`,
          direction,
          why: why[direction],
        }
      : null;
  const protein =
    goals.proteinBoost > 0
      ? { delta: `${signedNumber(goals.proteinBoost)} g`, why: why.protein }
      : null;
  return {
    dayLabel: isOtherDay(goals) ? "neste dia" : "hoje",
    calories,
    protein,
  };
}
