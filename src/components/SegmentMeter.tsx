import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Domain } from "../design/tokens";
import { IconTile } from "./IconTile";
import "./SegmentMeter.css";

/** Cor do preenchimento: um domínio (comida verde, água azul, corpo índigo, mente…) ou o gradiente da marca. */
export type MeterTone = Domain | "gradient";

/** Acima disto, "segments" vira barra contínua (ex.: 95/115 g). */
export const MAX_SEGMENTS = 12;

type Props = {
  /** Segmentos cheios, ou o numerador da barra contínua. */
  value: number;
  /** Número de segmentos, ou o denominador da barra contínua (> 0). */
  total: number;
  /**
   * segments: um bloco por unidade (registros 6/7, humor 4/5, ingredientes 8/9);
   * bar: barra contínua value/total (proteína 95/115 g, gasto × meta). Padrão: segments quando
   * total é inteiro até MAX_SEGMENTS; senão bar.
   */
  mode?: "segments" | "bar";
  /** Segmentos do fim desenhados só com contorno âmbar (ingrediente que falta). */
  missing?: number;
  tone?: MeterTone;
  /** sm 4 px · md 6 px · lg 8 px (altura). */
  size?: "sm" | "md" | "lg";
  /** Nome acessível ("Humor 4 de 5, Bem"); sem ele a barra é decorativa (o texto ao lado diz o valor). */
  label?: string;
  testId?: string;
  className?: string;
};

const FILL: Record<MeterTone, string> = {
  water: "var(--wf-sky-500)",
  food: "var(--wf-green-500)",
  habit: "var(--wf-tone-habit-fg)",
  body: "var(--wf-indigo-500)",
  medication: "var(--wf-tone-medication-fg)",
  mind: "var(--wf-tone-mind-fg)",
  attention: "var(--wf-amber-500)",
  warn: "var(--wf-tone-warn-fg)",
  danger: "var(--wf-tone-danger-fg)",
  neutral: "var(--wf-slate-400)",
  gradient: "var(--wf-gradient)",
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * A barra de progresso/segmentos do app (fidelidade visual): mesma altura, trilho e raio em todas
 * as telas. Informativa: sem vermelho por passar da meta (a barra só enche até 100%).
 */
export function SegmentMeter({
  value,
  total,
  mode,
  missing = 0,
  tone = "food",
  size = "md",
  label,
  testId,
  className,
}: Props) {
  const safeTotal = Math.max(0, total);
  const isSegments =
    (mode ?? (Number.isInteger(safeTotal) && safeTotal > 0 && safeTotal <= MAX_SEGMENTS ? "segments" : "bar")) ===
    "segments";
  const style = { "--meter-fill": FILL[tone] } as CSSProperties;
  const classes = ["segment-meter", `is-${size}`, isSegments ? "is-segments" : "is-bar", className]
    .filter(Boolean)
    .join(" ");
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  if (!isSegments) {
    const ratio = safeTotal > 0 ? clamp(value / safeTotal, 0, 1) : 0;
    return (
      <span className={classes} style={style} data-testid={testId} {...a11y}>
        <span className="segment-meter-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
    );
  }
  const count = Math.round(safeTotal);
  const filled = clamp(Math.round(value), 0, count);
  const missed = clamp(Math.round(missing), 0, count - filled);
  return (
    <span className={classes} style={style} data-testid={testId} {...a11y}>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={i < filled ? "is-on" : i >= count - missed ? "is-missing" : undefined}
        />
      ))}
    </span>
  );
}

type RowProps = {
  icon?: LucideIcon;
  tone: Domain;
  label: string;
  /** Valor à direita ("6/7 dias", "95/115 g por dia"): o número em <strong>, o resto menor. */
  value: ReactNode;
  /** A barra (SegmentMeter) sob o rótulo. */
  children?: ReactNode;
  className?: string;
};

/** Linha "ícone · rótulo … valor" com a barra embaixo (resumo da semana, plano da anamnese). */
export function ProgressRow({ icon, tone, label, value, children, className }: RowProps) {
  return (
    <div className={["progress-row", className].filter(Boolean).join(" ")}>
      {icon && <IconTile tone={tone} size="md" icon={icon} />}
      <div className="progress-row-body">
        <div className="progress-row-head">
          <span className="progress-row-label">{label}</span>
          <span className="progress-row-value">{value}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
