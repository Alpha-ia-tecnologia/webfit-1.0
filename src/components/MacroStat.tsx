import { fmtNumber } from "../lib/format";
import { CountUp } from "./Metric";

export type MacroKey = "protein" | "carbs" | "fat";

/**
 * Um macronutriente na gramática de gráficos (SISTEMA-X2): ponto na cor fixa do macro, rótulo,
 * gramas (com a meta, quando há) e, opcionalmente, a barra até a meta. A barra é decorativa: o
 * texto já diz o valor.
 */
export function MacroStat({
  macro,
  label,
  value,
  goal,
  percent,
  showBar = false,
}: {
  macro: MacroKey | string;
  label: string;
  value: number;
  goal: number | null;
  percent: number | null;
  showBar?: boolean;
}) {
  return (
    <div className="day-macro">
      <span className="day-macro-label">
        <i className={`dot macro-${macro}`} aria-hidden="true" />
        {label}
      </span>
      <strong>
        <CountUp value={value} />
        <small>{goal !== null ? ` / ${fmtNumber(goal)} g` : " g"}</small>
      </strong>
      {showBar && (
        <span className="day-macro-bar" aria-hidden="true">
          <span className={`macro-${macro}`} style={{ transform: `scaleX(${(percent ?? 0) / 100})` }} />
        </span>
      )}
    </div>
  );
}
