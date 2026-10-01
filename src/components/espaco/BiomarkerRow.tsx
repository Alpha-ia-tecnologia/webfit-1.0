import { sparklinePath } from "../../lib/charts";
import {
  biomarkerScale,
  EXAM_COPY,
  historySpeech,
  type Biomarker,
  type HistoryPoint,
} from "../../lib/exam-result";

const HISTORY_W = 80;
const HISTORY_H = 20;
const HISTORY_PAD = 3;

/**
 * Um resultado transcrito: nome, valor e unidade como impressos, a faixa do laudo (zona cinza e
 * valor em navy, só quando valor e referência são números simples) e a referência em texto.
 * O app nunca classifica: sem cor por resultado, sem "normal", "alto" ou "baixo"; a marca do
 * laboratório aparece copiada ("Laudo: H") numa etiqueta neutra.
 */
export function BiomarkerRow({
  row,
  history,
}: {
  row: Biomarker;
  history: readonly HistoryPoint[];
}) {
  const scale = biomarkerScale(row);
  const spark =
    history.length >= 2
      ? sparklinePath(
          history.map((point) => point.value),
          HISTORY_W,
          HISTORY_H,
          HISTORY_PAD,
        )
      : null;
  return (
    <li className="biomarker">
      <div className="biomarker-head">
        <span className="biomarker-name">{row.nome}</span>
        <span className="biomarker-value">
          <strong>{row.valor}</strong>
          {row.unidade && <small> {row.unidade}</small>}
        </span>
      </div>
      {scale && (
        <div className="biomarker-bar" aria-hidden="true">
          <span
            className="biomarker-zone"
            style={{
              left: `${scale.zoneStart}%`,
              width: `${Math.max(0, scale.zoneEnd - scale.zoneStart)}%`,
            }}
          />
          <span className="biomarker-dot" style={{ left: `${scale.dot}%` }} />
          {scale.beyond && (
            <span className={`biomarker-beyond ${scale.beyond}`} />
          )}
        </div>
      )}
      <div className="biomarker-foot">
        <p className="biomarker-ref">
          {EXAM_COPY.refLabel}: {row.referencia ?? EXAM_COPY.noRef}
          {row.marcacao && (
            <>
              {" "}
              <span className="lab-mark">
                {EXAM_COPY.labMark(row.marcacao)}
              </span>
            </>
          )}
        </p>
        {spark && (
          <>
            <svg
              className="biomarker-history"
              data-testid="biomarker-history"
              viewBox={`0 0 ${HISTORY_W} ${HISTORY_H}`}
              width={HISTORY_W}
              height={HISTORY_H}
              aria-hidden="true"
              focusable="false"
            >
              <path d={spark.d} />
              <circle cx={spark.last.x} cy={spark.last.y} r={2.5} />
            </svg>
            <p className="sr-only">{historySpeech(history, row.unidade)}</p>
          </>
        )}
      </div>
    </li>
  );
}
