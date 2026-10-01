import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { fmtDelta, fmtNumber } from "../lib/format";

const COUNT_SECONDS = 0.45;

/**
 * Valor exibido que "conta" até o novo número quando ele muda (ex.: +250 ml de água).
 * Na primeira renderização e com movimento reduzido, mostra o valor final direto.
 */
export function useCountUp(value: number | null): number | null {
  const isReduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (value === null || from === null || from === value || isReduced) {
      setShown(value);
      return;
    }
    const controls = animate(from, value, {
      duration: COUNT_SECONDS,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [value, isReduced]);
  return shown;
}

/** Número animado dentro de um texto: `<strong><CountUp value={1210} /></strong>`. */
export function CountUp({
  value,
  format = fmtNumber,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  return <>{format(useCountUp(value) ?? value)}</>;
}

/** Variação ao lado do número: sinal e unidade ("−0,4 kg"), sempre em tom neutro (sem julgamento). */
export interface MetricDelta {
  value: number;
  unit: string;
  digits?: number;
  /** Contexto curto depois da variação: "em 7 dias". */
  caption?: string;
}

/**
 * Métrica de destaque: rótulo opcional, número com algarismos tabulares, unidade menor, variação e
 * legenda. `null` vira "—"; `format` recebe o número já animado.
 */
export function Metric({
  value,
  format = fmtNumber,
  unit,
  label,
  caption,
  delta,
  size = "md",
}: {
  value: number | null;
  format?: (value: number) => string;
  unit?: string;
  label?: string;
  caption?: string;
  delta?: MetricDelta | null;
  /** hero: número principal da tela (60 px, --wf-fs-hero), com a unidade em fs-2xl. */
  size?: "sm" | "md" | "lg" | "xl" | "hero";
}) {
  const shown = useCountUp(value);
  return (
    <span className={`metric-block metric-${size}`}>
      {label && <span className="metric-label">{label}</span>}
      <span className="metric-value">
        <strong>{shown === null ? "—" : format(shown)}</strong>
        {unit && shown !== null && <small> {unit}</small>}
        {delta && (
          <span className="metric-delta">
            {fmtDelta(delta.value, delta.unit, delta.digits)}
            {delta.caption && <small> {delta.caption}</small>}
          </span>
        )}
      </span>
      {caption && <span className="metric-caption">{caption}</span>}
    </span>
  );
}
