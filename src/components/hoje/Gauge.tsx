import { useId, type ReactNode } from "react";

type Props = {
  percent: number | null;
  label: string;
  /** Paradas do gradiente, da esquerda para a direita. */
  stops?: readonly string[];
  children: ReactNode;
  className?: string;
};

const ARC = "M 20 100 A 80 80 0 0 1 180 100";

/** Medidor semicircular (estilo velocímetro) com traço em gradiente da marca. */
export function Gauge({
  percent,
  label,
  stops = ["var(--wf-blue)", "var(--wf-emerald)"],
  children,
  className = "",
}: Props) {
  const id = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className={`gauge ${className}`} role="img" aria-label={label}>
      <svg viewBox="0 0 200 110" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            {stops.map((color, i) => (
              <stop
                key={`${color}-${i}`}
                offset={`${(i / Math.max(1, stops.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={ARC}
          fill="none"
          stroke="var(--wf-surface-2)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={ARC}
          fill="none"
          stroke="var(--wf-slate-300)"
          strokeWidth="1"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
        <path
          className="gauge-value"
          d={ARC}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="16"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - clamped}
        />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}
