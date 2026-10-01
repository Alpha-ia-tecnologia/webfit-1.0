import { MEASURE_LINES, MEASURE_VIEWBOX } from "../../lib/body-metrics";
import { fmtNumber } from "../../lib/format";
import { SILHOUETTE } from "../injecao/bodySilhouette";
import { toNumber } from "./inputs";

/** Só o contorno do corpo e a cabeça, com os preenchimentos do BodyMapMini. */
const OUTLINE = SILHOUETTE.slice(0, 2);
const DOT_RADIUS = 2;
const MEASURES = [
  { key: "waist", label: "Cintura" },
  { key: "hip", label: "Quadril" },
] as const;

/**
 * Onde medir cintura e quadril: linhas tracejadas sobre a silhueta, cheias quando a medida foi
 * informada. Decorativa (as réguas ao lado são o controle); some no perfil sensível.
 */
export function MeasureFigure({
  waist,
  hip,
}: {
  waist: unknown;
  hip: unknown;
}) {
  const values = { waist: toNumber(waist), hip: toNumber(hip) };
  return (
    <div
      className="body-measure"
      data-testid="measure-figure"
      aria-hidden="true"
    >
      <svg
        viewBox={MEASURE_VIEWBOX}
        width="72"
        height="160"
        focusable="false"
      >
        {OUTLINE.map((shape, i) =>
          shape.type === "path" ? (
            <path
              key={i}
              d={shape.d}
              fill="var(--wf-slate-100)"
              stroke="var(--wf-slate-300)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ) : null,
        )}
        {MEASURES.map(({ key }) => {
          const line = MEASURE_LINES[key];
          const isFilled = values[key] !== null;
          return (
            <g
              key={key}
              className={`body-measure-line ${isFilled ? "is-filled" : ""}`}
            >
              <line
                x1={line.x1}
                x2={line.x2}
                y1={line.y}
                y2={line.y}
                strokeDasharray="4 3"
                strokeWidth={2}
              />
              <circle cx={line.x1} cy={line.y} r={DOT_RADIUS} />
              <circle cx={line.x2} cy={line.y} r={DOT_RADIUS} />
            </g>
          );
        })}
      </svg>
      <ul className="body-measure-labels">
        {MEASURES.map(({ key, label }) => {
          const value = values[key];
          return (
            <li key={key} className={value === null ? "is-empty" : ""}>
              {label} · {value === null ? "—" : `${fmtNumber(value, 1)} cm`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
