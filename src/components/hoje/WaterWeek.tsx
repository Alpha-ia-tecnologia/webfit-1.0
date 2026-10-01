import { Check } from "lucide-react";
import { fmtLiters } from "../../lib/format";
import { liters, type WeekDay } from "../../lib/today";

type Props = {
  days: WeekDay[];
  goalMl: number | null;
};

/** Barra mínima para dias com algum registro, em % da altura do gráfico. */
const MIN_BAR_PERCENT = 8;
const MIN_REFERENCE_ML = 500;

/**
 * Semana da água em 72 px (HOJE-03): uma coluna por dia (segunda a domingo), a meta como linha
 * tracejada e um check nos dias em que ela foi atingida. O resumo acessível lista os litros.
 */
export function WaterWeek({ days, goalMl }: Props) {
  const reference = Math.max(goalMl ?? 0, MIN_REFERENCE_ML, ...days.map((d) => d.ml));
  const metCount = goalMl === null ? 0 : days.filter((d) => d.ml >= goalMl).length;
  const description = [
    `Água registrada nesta semana: ${days.map((d) => `${d.label} ${liters(d.ml)} L`).join(", ")}`,
    goalMl !== null ? `meta de ${fmtLiters(goalMl)} por dia, atingida em ${metCount} ${metCount === 1 ? "dia" : "dias"}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <div className="water-chart" role="img" aria-label={description}>
      {goalMl !== null && (
        <span className="water-chart-legend" aria-hidden="true">
          <i /> Meta {fmtLiters(goalMl)}
        </span>
      )}
      <div className="water-chart-plot" aria-hidden="true">
        {goalMl !== null && (
          <span className="water-chart-goal" style={{ bottom: `${(goalMl / reference) * 100}%` }} />
        )}
        {days.map((d) => {
          const isMet = goalMl !== null && d.ml >= goalMl;
          const percent = d.ml > 0 ? Math.max(MIN_BAR_PERCENT, (d.ml / reference) * 100) : 0;
          return (
            <span
              key={d.date}
              className={`water-chart-col ${d.isToday ? "today" : ""} ${d.isFuture ? "future" : ""} ${isMet ? "met" : ""}`}
            >
              {percent > 0 ? (
                <span className="water-chart-bar" style={{ height: `${percent}%` }}>
                  {isMet && <Check size={10} strokeWidth={3.5} />}
                </span>
              ) : (
                <span className="water-chart-bar empty" />
              )}
            </span>
          );
        })}
      </div>
      <div className="water-chart-days" aria-hidden="true">
        {days.map((d) => (
          <span key={d.date} className={d.isToday ? "today" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
