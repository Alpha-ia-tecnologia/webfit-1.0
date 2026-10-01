import type { CSSProperties } from "react";
import {
  CalendarClock,
  EyeOff,
  Flag,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { BODY_PRIVACY_COPY, hiddenJourneyText } from "../../lib/body-privacy";
import { COPY } from "../../lib/copy";
import {
  fmtDayMonth,
  type Journey,
  type NextWeighIn,
  type StartItem,
} from "../../lib/evolution";
import { fmtNumber, fmtRelDate } from "../../lib/format";
import { Metric } from "../Metric";
import { arcDash } from "../../lib/charts";

const TRACK_SEGMENTS = 10;
/** Sempre com uma casa: "4,0 kg", "72,4 kg". */
const kg1 = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Variação com sinal e uma casa, igual ao que se vê: "−4,0 kg", "+0,5 kg/sem". */
const signed = (n: number, unit: string) =>
  `${n < 0 ? "−" : n > 0 ? "+" : ""}${kg1(Math.abs(n))} ${unit}`;

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="journey-add" aria-label={COPY.measure} onClick={onClick}>
      <Plus size={20} aria-hidden="true" />
    </button>
  );
}

/**
 * "Números do corpo ocultos" (ESPACO-13): quantas pesagens, a próxima (sem número), registrar e o
 * atalho para a preferência. Nenhum peso, variação, meta, ritmo ou medida. Perfil calmo (sensível ou
 * menor de 18, journey.isSensitive) não recebe lembrete de pesagem aqui, como na jornada completa.
 */
function HiddenJourney({
  journey,
  next,
  onRegister,
  onAdjust,
}: {
  journey: Journey;
  next: NextWeighIn | null;
  onRegister: () => void;
  onAdjust: () => void;
}) {
  return (
    <section className="card journey-card" aria-labelledby="journey-title">
      <div className="journey-head">
        <h2 id="journey-title" className="journey-kicker">
          Sua jornada · desde {fmtDayMonth(journey.start.date)}
        </h2>
        <AddButton onClick={onRegister} />
      </div>
      <div className="journey-hidden" data-testid="journey-hidden">
        <span className="evol-icon body" aria-hidden="true">
          <EyeOff size={20} />
        </span>
        <p>{hiddenJourneyText(journey.count)}</p>
      </div>
      {next && !journey.isSensitive && (
        <p className={`journey-next ${next.status}`}>
          <CalendarClock size={16} aria-hidden="true" />
          {next.label}
        </p>
      )}
      <button type="button" className="text-btn journey-adjust" onClick={onAdjust}>
        <SlidersHorizontal size={16} aria-hidden="true" />
        {BODY_PRIVACY_COPY.adjust}
      </button>
    </section>
  );
}

/** Número curto do conceito: "76,4", "66" (a meta redonda não ganha ",0"). */
const kgShort = (n: number) => fmtNumber(n, 1);

/** Valor com a unidade menor ao lado ("−0,5" + "kg/sem"), como no conceito 09. */
function StatValue({ value, unit }: { value: string; unit: string }) {
  return (
    <strong>
      {value}
      <small className="journey-unit"> {unit}</small>
    </strong>
  );
}

/** Variação com sinal e uma casa, sem a unidade: "−0,5", "+1,2". */
const signedNumber = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${kg1(Math.abs(n))}`;

/**
 * "Sua jornada" (conceito 09): a última pesagem em destaque (a tendência fica no gráfico), variação
 * desde o início, trilha até a meta com o marcador, ritmo e medidas. A próxima pesagem vai para a
 * folha "Pesagens". Perfil sensível vê só o valor pesado (sem variação, meta, trilha nem ritmo).
 * Com os números do corpo ocultos, nenhum número: HiddenJourney.
 */
export function JourneyCard({
  journey,
  today,
  next,
  onRegister,
  hidden = false,
  onAdjust = () => {},
}: {
  journey: Journey;
  today: string;
  /** Próxima pesagem sugerida (só no modo oculto; a jornada completa a mostra na folha "Pesagens"). */
  next: NextWeighIn | null;
  onRegister: () => void;
  /** "Ocultar números do corpo" (bodyNumbers = "hidden"). */
  hidden?: boolean;
  /** Abre a preferência "Ocultar números do corpo" (só no modo oculto). */
  onAdjust?: () => void;
}) {
  if (hidden)
    return (
      <HiddenJourney journey={journey} next={next} onRegister={onRegister} onAdjust={onAdjust} />
    );
  const { current, start, delta, target, progress, pace, waist, hip } = journey;
  const isSensitive = journey.isSensitive;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta < 0 ? TrendingDown : TrendingUp;
  const percent = progress === null ? null : Math.round(progress * 100);
  const filled = progress === null ? 0 : Math.round(progress * TRACK_SEGMENTS);
  const showDeltas = !isSensitive;
  const when = fmtRelDate(current.date, today);
  return (
    <section className="card journey-card" aria-labelledby="journey-title">
      <div className="journey-head">
        <h2 id="journey-title" className="journey-kicker">
          Sua jornada · desde {fmtDayMonth(start.date)}
        </h2>
        <AddButton onClick={onRegister} />
      </div>
      <div className="journey-main">
        <Metric value={current.weight} format={kg1} unit="kg" size="hero" />
        {delta !== null && journey.count > 1 && (
          <span
            className="journey-delta"
            aria-label={`${signed(delta, "kg")} desde ${fmtDayMonth(start.date)}`}
          >
            <DeltaIcon size={16} aria-hidden="true" />
            {kg1(Math.abs(delta))} kg
          </span>
        )}
      </div>
      <p className="journey-caption">Peso atual · pesado {when}</p>
      {percent !== null && target !== null && (
        <div
          className="journey-track"
          role="img"
          aria-label={`${percent}% do caminho: de ${kg1(start.weight)} kg até a meta de ${kg1(target)} kg`}
        >
          <div className="journey-segments" aria-hidden="true">
            {Array.from({ length: TRACK_SEGMENTS }, (_, i) => (
              <span
                key={i}
                className={i < filled ? "on" : ""}
                style={{ "--seg-mix": `${Math.round((i / (TRACK_SEGMENTS - 1)) * 100)}%` } as CSSProperties}
              />
            ))}
            <span className="journey-knob" style={{ left: `${percent}%` }} />
          </div>
          <div className="journey-track-labels" aria-hidden="true">
            <span>
              Início <b>{kgShort(start.weight)}</b>
            </span>
            <span className="journey-percent">{percent}% do caminho</span>
            <span>
              Meta <b>{kgShort(target)}</b>
            </span>
          </div>
        </div>
      )}
      {(pace !== null || waist || hip) && (
        <dl className="journey-stats">
          {pace !== null && (
            <div>
              <dt>Ritmo</dt>
              <dd>
                <StatValue value={signedNumber(pace)} unit="kg/sem" />
                <small>média 4 sem</small>
              </dd>
            </div>
          )}
          {waist && (
            <div>
              <dt>Cintura</dt>
              <dd>
                <StatValue value={kg1(waist.value)} unit="cm" />
                {showDeltas && waist.delta !== 0 && <small>{signed(waist.delta, "cm")}</small>}
              </dd>
            </div>
          )}
          {hip && (
            <div>
              <dt>Quadril</dt>
              <dd>
                <StatValue value={kg1(hip.value)} unit="cm" />
                {showDeltas && hip.delta !== 0 && <small>{signed(hip.delta, "cm")}</small>}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** Mini anel de progresso de um item da linha de partida. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 15;
  return (
    <svg className="start-ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} className="start-ring-track" />
      {/* Sem progresso, nada de arco: a ponta arredondada desenharia um ponto. */}
      {done > 0 && (
        <circle
          cx="18"
          cy="18"
          r={r}
          className="start-ring-value"
          strokeDasharray={arcDash(r, (done / total) * 100)}
        />
      )}
    </svg>
  );
}

/**
 * Primeira visita (menos de duas pesagens): "Sua linha de partida", com o ponto inicial e os
 * primeiros registros que dão vida aos gráficos. Perfil sensível não vê o item de pesagem. Com os
 * números do corpo ocultos, o início fica só com a data ("Início · 6 ago").
 */
export function StartLine({
  journey,
  items,
  onRegister,
  hidden = false,
}: {
  journey: Journey | null;
  items: StartItem[];
  onRegister: () => void;
  hidden?: boolean;
}) {
  return (
    <section className="card journey-card start-line" aria-labelledby="start-title">
      <div className="journey-head">
        <h2 id="start-title" className="journey-kicker">
          Sua linha de partida
        </h2>
        <AddButton onClick={onRegister} />
      </div>
      <div className="start-flag">
        <span className="evol-icon body" aria-hidden="true">
          <Flag size={20} />
        </span>
        <p>
          {journey && hidden ? (
            <>Início · {fmtDayMonth(journey.current.date)}</>
          ) : journey ? (
            <>
              Início <strong>{kg1(journey.current.weight)} kg</strong> ·{" "}
              {fmtDayMonth(journey.current.date)}
            </>
          ) : (
            "Registre sua primeira pesagem para começar."
          )}
        </p>
      </div>
      <p className="muted">Com alguns registros, os gráficos ganham vida aqui.</p>
      <ul className="start-list">
        {items.map((item) => (
          <li key={item.key} className={item.done >= item.total ? "is-done" : ""}>
            <Ring done={item.done} total={item.total} />
            <span>{item.label}</span>
            <small>
              {item.done} de {item.total}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
