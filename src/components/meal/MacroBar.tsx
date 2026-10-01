import type { CSSProperties } from "react";
import "./Meal.css";

export interface MacroShare {
  protein: number;
  carbs: number;
  fat: number;
}

const SEGMENTS: { key: keyof MacroShare; className: string }[] = [
  { key: "protein", className: "is-protein" },
  { key: "carbs", className: "is-carbs" },
  { key: "fat", className: "is-fat" },
];

type Props = {
  /** Parte da energia de cada macro (macroShare / macroEstimate().share); null não desenha nada. */
  share: MacroShare | null | undefined;
  /** sm 5 px (linha do Diário) · md 6 px (cartão do Hoje, bandeja) · lg 8 px (refeição da Dieta). */
  size?: "sm" | "md" | "lg";
  /** Largura fixa em px (ex.: 112 na linha do Diário); sem ela, ocupa a linha toda. */
  width?: number;
  /** Nome acessível ("Estimativa TACO: proteínas 9 g…"); sem ele, a barra é decorativa. */
  label?: string;
  testId?: string;
  className?: string;
};

/**
 * Barra P/C/G nas cores fixas do app (proteína esmeralda, carbo azul, gordura âmbar). Só
 * proporção, sem cor de alerta; os números ficam no texto ao lado (TACO ou registro).
 */
export function MacroBar({ share, size = "md", width, label, testId, className }: Props) {
  if (!share) return null;
  const style: CSSProperties | undefined = width ? { width } : undefined;
  return (
    <span
      className={["macro-bar", `is-${size}`, className].filter(Boolean).join(" ")}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid={testId}
    >
      {SEGMENTS.filter(({ key }) => share[key] > 0).map(({ key, className: part }) => (
        <span key={key} className={part} style={{ flexGrow: share[key] }} />
      ))}
    </span>
  );
}
