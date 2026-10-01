import { useId } from "react";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import {
  monthShort,
  monthWindow,
  PACE_LABEL,
  type WeightProjection,
} from "../../lib/body-metrics";
import { fmtNumber } from "../../lib/format";
import { PROJECTION_COPY } from "../../lib/plan-reveal";
import { IconTile } from "../IconTile";

/** Geometria do gráfico (unidades do viewBox; o SVG ocupa a largura do cartão). */
const W = 320;
const H = 150;
const LEFT = 14;
const RIGHT = 12;
const HIGH = 30;
const LOW = 104;
const AXIS_Y = H - 6;
const MIN_LABEL_GAP = 30;
const DAY_MS = 86_400_000;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
const monthStart = (month: string) => `${month}-01`;
function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}
/** Curva suave de (x0, y0) até (x1, y1), plana nas duas pontas. */
const ease = (x0: number, y0: number, x1: number, y1: number) =>
  `C ${x0 + (x1 - x0) * 0.45} ${y0} ${x0 + (x1 - x0) * 0.55} ${y1} ${x1} ${y1}`;

/**
 * Faixa de chegada ao peso desejado (ANAM-13): de hoje até o fim da janela de meses, a linha sai
 * do peso atual e se desfaz numa faixa menta sobre os meses possíveis; a meta é uma linha pontilhada.
 * Nunca um ponto final nem um dia: só a janela de meses (0,25 a 0,5 kg por semana).
 */
function ProjectionChart({
  current,
  target,
  goal,
  today,
  fromMonth,
  toMonth,
}: {
  current: number;
  target: number;
  goal: string;
  today: string;
  fromMonth: string;
  toMonth: string;
}) {
  const id = useId().replace(/:/g, "");
  const start = dayNumber(today);
  const span = Math.max(1, dayNumber(monthEnd(toMonth)) - start);
  const x = (date: string) =>
    LEFT + ((dayNumber(date) - start) / span) * (W - LEFT - RIGHT);
  const isGain = goal === "ganhar";
  const yStart = isGain ? LOW : HIGH;
  const yGoal = isGain ? HIGH : LOW;
  const xFast = Math.max(LEFT + 24, x(monthStart(fromMonth)));
  const xEnd = W - RIGHT;
  const fast = `M ${LEFT} ${yStart} ${ease(LEFT, yStart, xFast, yGoal)}`;
  const wedge = `${fast} L ${xEnd} ${yGoal} C ${LEFT + (xEnd - LEFT) * 0.55} ${yGoal} ${LEFT + (xEnd - LEFT) * 0.45} ${yStart} ${LEFT} ${yStart} Z`;
  const line = `M ${LEFT} ${yStart} C ${LEFT + (xEnd - LEFT) * 0.35} ${yStart} ${xFast + (xEnd - xFast) * 0.15} ${yGoal} ${xEnd} ${yGoal}`;
  const fadeAt = Math.min(1, Math.max(0, (xFast - LEFT) / (xEnd - LEFT)));
  const labels: { key: string; x: number; text: string; isWindow: boolean }[] = [];
  let lastX = LEFT;
  for (let month = nextMonth(today.slice(0, 7)); month <= toMonth; month = nextMonth(month)) {
    const at = x(monthStart(month));
    if (at - lastX < MIN_LABEL_GAP || at > xEnd - 8) continue;
    labels.push({ key: month, x: at, text: monthShort(month), isWindow: month >= fromMonth });
    lastX = at;
  }
  const bandTop = Math.min(yStart, yGoal) - 16;
  return (
    <svg
      className="projection-chart"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="projection-band-top" />
          <stop offset="1" className="projection-band-bottom" />
        </linearGradient>
        <linearGradient
          id={`${id}-line`}
          gradientUnits="userSpaceOnUse"
          x1={LEFT}
          y1="0"
          x2={xEnd}
          y2="0"
        >
          <stop offset="0" className="projection-line-start" />
          <stop offset={fadeAt} className="projection-line-mid" />
          <stop offset="1" className="projection-line-end" />
        </linearGradient>
      </defs>
      <rect
        className="projection-band"
        x={xFast}
        y={bandTop}
        width={xEnd - xFast}
        height={Math.abs(yGoal - bandTop)}
        fill={`url(#${id}-band)`}
      />
      <line className="projection-window" x1={xFast} y1={bandTop} x2={xFast} y2={AXIS_Y - 14} />
      <path className="projection-wedge" d={wedge} />
      <line className="projection-goal" x1={LEFT} y1={yGoal} x2={xEnd} y2={yGoal} />
      <path className="projection-line" d={line} stroke={`url(#${id}-line)`} />
      <circle className="projection-start" cx={LEFT} cy={yStart} r="6" />
      <text className="projection-value" x={LEFT + 12} y={yStart - 10}>
        {fmtNumber(current, 1)} kg
      </text>
      <text
        className="projection-goal-value"
        x={xEnd}
        y={yGoal - 8}
        textAnchor="end"
      >
        {fmtNumber(target, 1)} kg
      </text>
      <text className="projection-axis is-today" x={LEFT - 4} y={AXIS_Y}>
        hoje
      </text>
      {labels.map((label) => (
        <text
          key={label.key}
          className={`projection-axis ${label.isWindow ? "is-window" : ""}`}
          x={label.x}
          y={AXIS_Y}
          textAnchor="middle"
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

/**
 * "Projeção segura" no plano: meta, ritmo e a janela de meses, com o gráfico em faixa. Só aparece
 * para perfis elegíveis (a tela decide com canShowProjection e hideBodyNumbers). "Caminho longo" e
 * "abaixo da referência" mostram só o texto, sem gráfico.
 */
export function ProjectionCard({
  projection,
  current,
  target,
  goal,
  today,
  usesPen,
}: {
  projection: WeightProjection;
  current: number;
  target: number;
  goal: string;
  today: string;
  usesPen: boolean;
}) {
  const titleId = useId();
  const isRange =
    projection.kind === "range" && !!projection.fromMonth && !!projection.toMonth;
  const Trend = goal === "ganhar" ? TrendingUp : TrendingDown;
  return (
    <section
      className="plan-projection"
      data-testid="plan-projection"
      aria-labelledby={titleId}
    >
      <header className="plan-projection-head">
        <IconTile tone="food" size="md" icon={Trend} />
        <div>
          <h4 id={titleId}>{PROJECTION_COPY.title}</h4>
          <p className="plan-projection-why">
            <ShieldCheck size={14} aria-hidden="true" />
            {PROJECTION_COPY.why}
          </p>
        </div>
      </header>
      {isRange ? (
        <>
          <dl className="plan-projection-strip">
            <div>
              <dt>Meta</dt>
              <dd>{fmtNumber(target, 1)} kg</dd>
            </div>
            <div>
              <dt>Ritmo sugerido</dt>
              <dd>{projection.paceLabel ?? PACE_LABEL}</dd>
            </div>
            <div>
              <dt>Estimativa</dt>
              <dd>{monthWindow(projection.fromMonth!, projection.toMonth!)}</dd>
            </div>
          </dl>
          <ProjectionChart
            current={current}
            target={target}
            goal={goal}
            today={today}
            fromMonth={projection.fromMonth!}
            toMonth={projection.toMonth!}
          />
          <p className="sr-only">{projection.title}.</p>
          <p className="plan-projection-caption">
            {PROJECTION_COPY.estimate}
            {usesPen && PROJECTION_COPY.pen}
          </p>
        </>
      ) : (
        <>
          {projection.title && (
            <p className="plan-projection-title">{projection.title}</p>
          )}
          <p className="plan-projection-caption">{projection.caption}</p>
        </>
      )}
    </section>
  );
}
