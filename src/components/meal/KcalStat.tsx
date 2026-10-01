import { fmtNumber } from "../../lib/format";
import "./Meal.css";

type Props = {
  /** kcal do registro (entry.calories) ou da TACO (macroEstimate().kcal). Nunca do texto do modelo. */
  value: number;
  /** Estimativa (plano, sugestão): escreve "≈" antes. */
  approx?: boolean;
  /** stack: "420" sobre "kcal" (cartão do Hoje); inline: "420 kcal" (grupo do Diário, bandeja). */
  layout?: "stack" | "inline";
  unit?: string;
  className?: string;
};

/**
 * Número de kcal com a unidade menor. A tela não o desenha com "ocultar calorias" (hideCalories):
 * este componente não sabe da preferência.
 */
export function KcalStat({ value, approx = false, layout = "stack", unit = "kcal", className }: Props) {
  return (
    <span className={["kcal-stat", `is-${layout}`, className].filter(Boolean).join(" ")}>
      <strong>
        {approx ? "≈ " : ""}
        {fmtNumber(value)}
      </strong>
      <small>{unit}</small>
    </span>
  );
}
