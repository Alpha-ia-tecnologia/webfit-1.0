import { WEEKDAYS_SHORT } from "../../lib/today";

/**
 * Rótulos dos dias e descrição acessível dos gráficos diários da Evolução, compartilhados
 * pelo web e pelo app. A geometria dos gráficos fica em src/lib/evolution.ts.
 */
export interface DailyPoint {
  date: string;
  /** Rótulo sob a barra; vazio quando o dia não recebe rótulo. */
  label: string;
  value: number;
  /** Meta do dia; null quando não havia meta nessa data. */
  goal: number | null;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

/**
 * Descrição acessível das barras: lista os dias com registro em períodos de até
 * sete dias, resume a contagem nos maiores e termina com a meta da legenda.
 */
export function dailyChartDescription(
  title: string,
  points: readonly DailyPoint[],
  unit: string,
  legendGoal: number | null,
): string {
  const recorded = points.filter((p) => p.value > 0);
  const detail = !recorded.length
    ? "sem registros"
    : points.length <= 7
      ? recorded
          .map((p) => `${p.label || p.date} ${fmt(p.value)} ${unit}`)
          .join(", ")
      : `${recorded.length} dias com registro`;
  const goal = legendGoal === null ? "" : `; meta ${fmt(legendGoal)} ${unit}`;
  return `${title} por dia nos últimos ${points.length} dias: ${detail}${goal}`;
}

/**
 * Rótulos do eixo dos dias: nome curto do dia da semana em períodos de até
 * sete dias; nos maiores, "dd/mm" a cada sete dias contados a partir do último.
 */
export function dayLabels(dates: readonly string[]): string[] {
  if (dates.length <= 7)
    return dates.map(
      (d) => WEEKDAYS_SHORT[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]!,
    );
  const last = dates.length - 1;
  return dates.map((d, i) =>
    (last - i) % 7 === 0 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "",
  );
}
