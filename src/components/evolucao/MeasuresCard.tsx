import { Plus } from "lucide-react";
import { sparklinePath } from "../../lib/charts";
import { useApp } from "../../lib/context";
import { COPY } from "../../lib/copy";
import { bodyMeasures, type MeasureSeries } from "../../lib/measures";
import {
  FIGURE_VIEWBOX,
  MEASURE_LINES,
  OUTLINE,
  figurePercent,
} from "../injecao/bodyViews";
import "./EvolucaoCards.css";

const SPARK_WIDTH = 64;
const SPARK_HEIGHT = 24;

function Trend({ series }: { series: MeasureSeries }) {
  const spark = sparklinePath(
    series.points.map((p) => p.value),
    SPARK_WIDTH,
    SPARK_HEIGHT,
  );
  return (
    <li>
      <span className="measure-trend-label">{series.label}</span>
      {spark ? (
        <svg
          className="measure-spark"
          viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
          width={SPARK_WIDTH}
          height={SPARK_HEIGHT}
          role="img"
          aria-label={series.aria ?? undefined}
          focusable="false"
        >
          <path d={spark.d} />
          <circle cx={spark.last.x} cy={spark.last.y} r={2.5} />
        </svg>
      ) : (
        <span className="measure-spark is-empty">
          <span className="sr-only">{series.aria}</span>
        </span>
      )}
      <strong className="measure-latest">{series.latest}</strong>
      {series.delta && (
        <span className="measure-delta">
          <span aria-hidden="true">{series.delta}</span>
          <span className="sr-only">
            {series.delta} desde {series.since}
          </span>
        </span>
      )}
    </li>
  );
}

/**
 * Medidas (EVOL-10): silhueta com as linhas de cintura e quadril, mini tendência de cada medida
 * e IMC / relação cintura-quadril / gordura como fichas neutras, sem classificação nem cores por valor.
 * Nunca aparece em perfil sensível (quem chama decide).
 */
export function MeasuresCard({ onRegister }: { onRegister: () => void }) {
  const { state } = useApp();
  const body = bodyMeasures(state.measurements);
  const trends = [body.waist, body.hip, body.bodyFat].filter((s) => s.points.length > 0);
  const lines = [
    { key: "waist", line: MEASURE_LINES.waist, series: body.waist },
    { key: "hip", line: MEASURE_LINES.hip, series: body.hip },
  ] as const;
  return (
    <section className="card evol-card measures-card" data-testid="measures-card" aria-labelledby="measures-title">
      <header className="measures-head">
        <h2 id="measures-title">{COPY.measurements}</h2>
        <button
          type="button"
          className="text-btn measures-add"
          aria-label="Registrar medidas de cintura e quadril"
          onClick={onRegister}
        >
          <Plus size={16} aria-hidden="true" />
          Registrar
        </button>
      </header>
      <div className="measures-body">
        <div className="measure-figure" role="img" aria-label={body.silhouetteAria}>
          <div className="measure-canvas">
            <svg viewBox={FIGURE_VIEWBOX} aria-hidden="true" focusable="false">
              {OUTLINE.map((shape, i) =>
                shape.type === "path" ? <path key={i} className="measure-outline" d={shape.d} /> : null,
              )}
              {lines.map(({ key, line, series }) => (
                <line
                  key={key}
                  className={`measure-line ${series.latest ? "" : "is-missing"}`}
                  x1={line.x1}
                  x2={line.x2}
                  y1={line.y}
                  y2={line.y}
                />
              ))}
            </svg>
            {lines.map(({ key, line, series }) => {
              const at = figurePercent({ cx: line.x2, cy: line.y });
              return (
                <span
                  key={key}
                  className="measure-tag"
                  style={{ left: `${at.left}%`, top: `${at.top}%` }}
                  aria-hidden="true"
                >
                  {series.label} {series.latest ?? "—"}
                </span>
              );
            })}
          </div>
        </div>
        {trends.length > 0 && (
          <ul className="measure-trends">
            {trends.map((series) => (
              <Trend key={series.key} series={series} />
            ))}
          </ul>
        )}
      </div>
      {body.isEmpty && (
        <p className="muted">Registre cintura e quadril para acompanhar as medidas aqui.</p>
      )}
      {body.chips.length > 0 && (
        <ul className="measure-chips">
          {body.chips.map((chip) => (
            <li key={chip.text} aria-label={chip.aria}>
              {chip.text}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Valores descritivos, sem classificação clínica automática.</p>
    </section>
  );
}
