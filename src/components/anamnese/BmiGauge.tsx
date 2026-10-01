import { BMI_BANDS, BMI_CAPTION, bmiGauge } from "../../lib/body-metrics";

/**
 * IMC estimado em quatro faixas de mesma largura e cor neutra (nunca vermelho ou âmbar).
 * Só aparece para adultos com perfil não sensível (canShowBodyNumbers); a figura é uma
 * imagem com o texto completo no nome acessível.
 */
export function BmiGauge({ bmi }: { bmi: number | null }) {
  const gauge = bmiGauge(bmi);
  if (!gauge) return null;
  return (
    <figure
      className="bmi-gauge"
      data-testid="anamnese-bmi"
      role="img"
      aria-label={gauge.ariaLabel}
    >
      <div className="bmi-head" aria-hidden="true">
        <span>IMC estimado</span>
        <strong>{gauge.value}</strong>
      </div>
      <div className="bmi-track" aria-hidden="true">
        {BMI_BANDS.map((band, i) => (
          <span
            key={band}
            className={`bmi-band ${i === 1 ? "is-reference" : ""} ${i === 3 ? "is-last" : ""}`}
          />
        ))}
        <span
          className="bmi-marker"
          data-testid="bmi-marker"
          style={{ left: `${gauge.markerPercent}%` }}
        >
          <svg width="12" height="8" viewBox="0 0 12 8" focusable="false">
            <path d="M6 0 12 8H0Z" fill="currentColor" />
          </svg>
        </span>
      </div>
      <ol className="bmi-labels" aria-hidden="true">
        {BMI_BANDS.map((band, i) => (
          <li key={band} className={i === gauge.band ? "is-current" : ""}>
            {band}
          </li>
        ))}
      </ol>
      <figcaption aria-hidden="true">{BMI_CAPTION}</figcaption>
    </figure>
  );
}
