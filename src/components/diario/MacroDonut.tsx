import { donutArcs } from "../../lib/charts";
import { macroShare } from "../../lib/diary-day";

const SIZE = 88;
const RADIUS = 34;
const WIDTH = 12;
const GAP = 4;
const PARTS = [
  { key: "protein", label: "Proteína" },
  { key: "carbs", label: "Carboidratos" },
  { key: "fat", label: "Gorduras" },
] as const;

/**
 * Rosca P/C/G do Diário quando as calorias estão ocultas (HOJE-01): só a proporção entre os macros,
 * nas cores fixas, sem nenhum número de energia. Sem registros, não aparece.
 */
export function MacroDonut({ macros }: { macros: { protein: number; carbs: number; fat: number } }) {
  const share = macroShare(macros);
  if (!share) return null;
  const values = PARTS.map((p) => share[p.key]);
  const arcs = donutArcs(RADIUS, values, GAP);
  const label = `Distribuição dos macros no dia: ${PARTS.map((p, i) => `${p.label} ${values[i]}%`).join(", ")}`;
  return (
    <figure className="macro-donut" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {PARTS.map((p, i) =>
          arcs[i]!.length > 0 ? (
            <circle
              key={p.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={`var(--wf-macro-${p.key})`}
              strokeWidth={WIDTH}
              strokeDasharray={`${arcs[i]!.length} 1000`}
              strokeDashoffset={arcs[i]!.offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          ) : null,
        )}
      </svg>
      <ul className="macro-donut-legend" aria-hidden="true">
        {PARTS.map((p, i) => (
          <li key={p.key}>
            <i className={`dot macro-${p.key}`} />
            {p.label}
            <strong>{values[i]}%</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}
