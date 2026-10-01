import { useId, type CSSProperties } from "react";
import { Syringe } from "lucide-react";
import { arcDash, circumference, ringSegments } from "../../lib/charts";
import type { NextDose, NextDoseText } from "../../lib/treatment";
import "./NextDoseRing.css";

const VIEW = 88;
const RING_RADIUS = 38;
const RING_CENTER = 44;
const RING_GAP = 4;
const STROKE = 8;
/** Intervalos de 2 a 14 dias viram segmentos (um por dia); os outros, um arco contínuo. */
const SEGMENT_MIN = 2;
const SEGMENT_MAX = 14;
const ROTATE = `rotate(-90 ${RING_CENTER} ${RING_CENTER})`;
const FG = "var(--wf-tone-medication-fg)";
const TRACK = "var(--wf-tone-medication-bg)";

type Props = {
  next: NextDose;
  text: NextDoseText;
  /**
   * medication: segmentos no tom da medicação sobre fundo claro (Hoje) ·
   * inverse: arco contínuo em gradiente com a ponta branca, para o cartão navy (Seringa).
   */
  tone?: "medication" | "inverse";
  /** Lado em px (o desenho escala). Hoje 78–88; Seringa 90–96. */
  size?: number;
  /** data-testid: "next-dose-ring" (Hoje) ou "next-application-ring" (Seringa). */
  testId?: string;
};

/** Ponto na circunferência a `percent` do topo, no sentido horário. */
function pointAt(percent: number) {
  const angle = (percent / 100) * 2 * Math.PI - Math.PI / 2;
  return {
    x: RING_CENTER + RING_RADIUS * Math.cos(angle),
    y: RING_CENTER + RING_RADIUS * Math.sin(angle),
  };
}

/**
 * Anel da próxima dose estimada (contagem regressiva): nunca vermelho nem âmbar, mesmo depois da
 * data. O nome acessível (text.aria) diz "estimada" e o dia do ciclo. Sem dose no desenho.
 */
export function NextDoseRing({ next, text, tone = "medication", size = VIEW, testId = "next-dose-ring" }: Props) {
  const gradientId = useId();
  const isInverse = tone === "inverse";
  const isSegmented = !isInverse && next.intervalDays >= SEGMENT_MIN && next.intervalDays <= SEGMENT_MAX;
  const filled = Math.min(next.elapsedDays, next.intervalDays);
  const c = circumference(RING_RADIUS);
  const end = pointAt(Math.min(100, next.progress));
  const style = { "--dose-ring-size": `${size}px` } as CSSProperties;
  return (
    <div
      className={isInverse ? "dose-ring is-inverse" : "dose-ring"}
      style={style}
      role="img"
      aria-label={text.aria}
      data-testid={testId}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false">
        {isInverse && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--wf-green-500)" />
              <stop offset="100%" stopColor="var(--wf-sky-500)" />
            </linearGradient>
          </defs>
        )}
        {isSegmented ? (
          ringSegments(RING_RADIUS, next.intervalDays, RING_GAP).map((segment, i) => (
            <circle key={i} className={i < filled ? "dose-ring-fill" : "dose-ring-track"} cx={RING_CENTER} cy={RING_CENTER}
              r={RING_RADIUS} fill="none" strokeWidth={STROKE} strokeLinecap="butt" stroke={i < filled ? FG : TRACK}
              strokeDasharray={`${segment.length} ${c}`} strokeDashoffset={segment.offset} transform={ROTATE} />
          ))
        ) : (
          <>
            <circle className="dose-ring-track" cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none"
              strokeWidth={STROKE} stroke={isInverse ? undefined : TRACK} />
            {next.progress > 0 && (
              <circle className="dose-ring-fill" cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none"
                strokeWidth={STROKE} strokeLinecap="round" stroke={isInverse ? `url(#${gradientId})` : FG}
                strokeDasharray={arcDash(RING_RADIUS, next.progress)} transform={ROTATE} />
            )}
            {isInverse && next.progress > 0 && next.progress < 100 && (
              <circle className="dose-ring-end" cx={end.x} cy={end.y} r={STROKE / 2 - 1} />
            )}
          </>
        )}
      </svg>
      <span className="dose-ring-center">
        {text.ring ? (
          <>
            <strong className={text.unit ? "" : "is-word"}>{text.ring}</strong>
            {text.unit && <small>{text.unit}</small>}
          </>
        ) : (
          <Syringe size={24} aria-hidden="true" />
        )}
      </span>
    </div>
  );
}
