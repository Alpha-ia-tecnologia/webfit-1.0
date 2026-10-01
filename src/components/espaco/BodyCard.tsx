import { useId } from "react";
import { EyeOff, Minus, Plus, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { sparklinePath } from "../../lib/charts";
import { useApp } from "../../lib/context";
import { BMI_REFERENCE_HINT, BMI_TICKS, bodySummary, type BodySummary } from "../../lib/space";
import { IconTile } from "../IconTile";
import { focusWhenReady, HIDE_BODY_SWITCH_ID } from "./focusWhenReady";

const SPARK_W = 150;
const SPARK_H = 46;
const SPARK_PAD = 4;
/** Faixas de largura igual da régua do IMC (as marcas 18,5 · 25 · 30 caem nas divisas). */
const BMI_SEGMENTS = BMI_TICKS.length + 1;
const TREND_ICON = { down: TrendingDown, up: TrendingUp, flat: Minus } as const;

function RegisterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="link-btn body-register"
      aria-label="Registrar medidas na Evolução"
      onClick={onClick}
    >
      <Plus size={18} aria-hidden="true" />
      Registrar
    </button>
  );
}

function BodyHead({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="section-title-row body-bento-head">
      <h2 id="body-card-title">Corpo</h2>
      <RegisterButton onClick={onRegister} />
    </div>
  );
}

/** Mini gráfico das últimas pesagens: área azul-clara, linha e o último ponto vazado. */
function WeightSpark({ trend }: { trend: NonNullable<BodySummary["trend"]> }) {
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const spark = sparklinePath(trend.values, SPARK_W, SPARK_H, SPARK_PAD);
  if (!spark) return null;
  const area = `${spark.d} L${spark.last.x},${SPARK_H} L${SPARK_PAD},${SPARK_H} Z`;
  return (
    <svg
      className="body-spark"
      data-testid="body-sparkline"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="body-spark-stop-a" />
          <stop offset="1" className="body-spark-stop-b" />
        </linearGradient>
      </defs>
      <path className="body-spark-area" d={area} fill={`url(#${gradientId})`} />
      <path className="body-spark-line" d={spark.d} />
      <circle cx={spark.last.x} cy={spark.last.y} r={SPARK_PAD - 0.5} />
    </svg>
  );
}

/**
 * "Corpo" em blocos (conceito 11): peso com a variação neutra, mini gráfico e a trilha até a meta;
 * IMC numa régua neutra sem categoria nem cor por faixa; altura e cintura. Perfil calmo (sensível ou
 * menor de idade): só o peso e a altura. "Ocultar números do corpo" (ESPACO-13): nenhum número, só a
 * data da medição, o registro e o atalho para a preferência.
 */
export function BodyCard() {
  const { state, navigate, openEspaco } = useApp();
  const s = bodySummary(state);
  if (!s) return null;
  const register = () => navigate("evolucao");
  if (s.hidden) {
    const adjust = () => {
      openEspaco("preferencias");
      // A aba troca alguns quadros depois; o foco vai para o próprio interruptor.
      focusWhenReady(HIDE_BODY_SWITCH_ID);
    };
    return (
      <section
        className="body-bento is-hidden"
        data-testid="body-card"
        aria-labelledby="body-card-title"
      >
        <BodyHead onRegister={register} />
        <div className="body-tile body-hidden-tile">
          <div className="body-hidden" data-testid="body-hidden">
            <IconTile tone="body" size="md" icon={EyeOff} />
            <div>
              <p className="body-hidden-title">{BODY_PRIVACY_COPY.hiddenTitle}</p>
              <p className="hint">{s.measured}</p>
            </div>
          </div>
          <button type="button" className="text-btn body-adjust" onClick={adjust}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {BODY_PRIVACY_COPY.adjust}
          </button>
        </div>
      </section>
    );
  }
  const TrendIcon = s.trend ? TREND_ICON[s.trend.direction] : Minus;
  return (
    <section
      className="body-bento"
      data-testid="body-card"
      aria-labelledby="body-card-title"
    >
      <BodyHead onRegister={register} />
      <div className={s.bmi ? "body-bento-grid has-bmi" : "body-bento-grid"}>
        <div className="body-tile body-tile-weight">
          <p className="body-tile-head">
            <span>Peso</span>
            <span className="body-when">{s.when}</span>
          </p>
          <p className="body-weight" data-testid="body-weight">
            <strong>{s.weight}</strong> <small>kg</small>
          </p>
          {s.trend && (
            <>
              <span className="body-delta" data-testid="body-trend">
                <TrendIcon size={16} aria-hidden="true" />
                {s.trend.chip}
              </span>
              <WeightSpark trend={s.trend} />
              <p className="sr-only">{s.trend.speech}</p>
            </>
          )}
          {s.progress && (
            <div className="body-progress">
              <span className="body-progress-track" aria-hidden="true">
                <span
                  className="body-progress-fill"
                  style={{ width: `${Math.round(s.progress.ratio * 100)}%` }}
                />
              </span>
              <p className="body-progress-labels" aria-hidden="true">
                <span>
                  Início <b>{s.progress.start}</b>
                </span>
                <span>
                  Meta <b>{s.progress.target}</b>
                </span>
              </p>
              <p className="sr-only">{s.progress.speech}</p>
            </div>
          )}
        </div>
        {s.bmi && (
          <div className="body-tile body-tile-bmi" data-testid="body-bmi">
            <p className="body-bmi-value">
              <span className="body-tile-label">IMC</span> <strong>{s.bmi.value}</strong>
            </p>
            <div className="bmi-ruler" aria-hidden="true">
              {Array.from({ length: BMI_SEGMENTS }, (_, i) => (
                <span key={i} className="bmi-seg" />
              ))}
              <span
                className="bmi-dot"
                data-testid="body-bmi-dot"
                style={{ left: `${s.bmi.position}%` }}
              />
            </div>
            <p className="body-bmi-ref">{BMI_REFERENCE_HINT}</p>
          </div>
        )}
        <dl className="body-tile body-extra">
          {s.tiles.map((tile) => (
            <div key={tile.key}>
              <dt>{tile.label}</dt>
              <dd data-testid={`body-${tile.key}`}>
                <strong>{tile.number}</strong> <small>{tile.unit}</small>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
