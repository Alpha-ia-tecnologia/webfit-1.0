import { fmtNumber } from "../lib/format";
import { MACROS } from "../lib/today";
import "./meal/Meal.css";

export type MacroKey = (typeof MACROS)[number]["key"];

export interface MacroColumn {
  key: MacroKey;
  /** Gramas (meta, consumo ou TACO); null = "—". */
  grams: number | null;
  /** "82 / 115 g": a meta vira o texto menor depois da barra. */
  goal?: number | null;
  /** Parte da energia (%), mostrada com showPercent: "115 g · 29%". */
  percent?: number | null;
}

type Props = {
  items: readonly MacroColumn[];
  showPercent?: boolean;
  className?: string;
};

const LABEL: Record<MacroKey, string> = Object.fromEntries(MACROS.map((m) => [m.key, m.label])) as Record<
  MacroKey,
  string
>;

/**
 * Três colunas de macros com o ponto na cor fixa: "● Proteína / 115 g · 29%" (plano da anamnese,
 * metas do Meu espaço) ou "82 / 115 g" (com meta). O nome acessível de cada coluna lê tudo junto.
 */
export function MacroColumns({ items, showPercent = false, className }: Props) {
  return (
    <ul className={["macro-columns", className].filter(Boolean).join(" ")}>
      {items.map(({ key, grams, goal, percent }) => {
        const value = grams === null ? "—" : fmtNumber(grams);
        const hasGoal = goal !== null && goal !== undefined;
        const hasPercent = showPercent && percent !== null && percent !== undefined;
        return (
          <li key={key} className={`is-${key}`}>
            <span className="macro-col-label">
              <i aria-hidden="true" />
              {LABEL[key]}
            </span>
            <span className="macro-col-value">
              <strong>{value}</strong>
              <small>
                {hasGoal ? ` / ${fmtNumber(goal)} g` : " g"}
                {hasPercent ? ` · ${percent}%` : ""}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
