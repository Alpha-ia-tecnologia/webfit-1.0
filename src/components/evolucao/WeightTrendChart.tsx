import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Syringe } from "lucide-react";
import { fmtNumber, fmtShortDate } from "../../lib/format";
import { weightChartModel, type TrendPoint } from "../../lib/evolution";
import type { DoseTimeline } from "../../lib/treatment";

const HEIGHT = 220;
/** Com a faixa "Aplicações", o gráfico ganha altura para o chip da dose e os discos. */
const LANE_CHART_HEIGHT = 244;
const LANE_HEIGHT = 24;
const DEFAULT_WIDTH = 340;
const BALLOON_HALF = 84;
/** Pílula do último valor ("72,4"): largura aproximada para ficar dentro do gráfico. */
const LAST_PILL_WIDTH = 50;
const LAST_PILL_GAP = 12;
const LAST_HALO_R = 12;
/** Distância vertical (px) em que um rótulo do eixo do peso colidiria com a pílula do último valor. */
const Y_LABEL_CLEARANCE = 14;
/** Chip "2,50 mg/sem" acima da área do peso, dentro da faixa violeta. */
const DOSE_CHIP_TOP = 4;
/** Espaço do rótulo "Aplicações" antes da linha pontilhada da faixa. */
const LANE_LABEL_WIDTH = 78;

const kg = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Props = {
  points: TrendPoint[];
  start: string;
  /** Fim do eixo (hoje ou logo depois da próxima aplicação estimada). */
  end: string;
  /** Hoje, quando `end` vai além (padrão: `end`). */
  today?: string;
  /** Peso desejado; null sem meta ou em perfil sensível. */
  target: number | null;
  /** Degraus de dose registrados (EVOL-04); null sem aplicações ou em perfil sensível. */
  dose?: DoseTimeline | null;
  /** Evolução (conceito 09): faixa "Aplicações" dentro do gráfico, meta só perto dos dados, 5 datas. */
  withLane?: boolean;
  /** Próxima aplicação estimada (só quem acompanha a frequência; nunca perfil calmo ou gestação). */
  nextDose?: string | null;
  /** Nome da medicação na legenda ("Tirzepatida"), com a faixa de doses. */
  medication?: string | null;
};

/**
 * Peso com pesagens (pontos vazados), tendência (linha em degradê) e o último valor numa pílula,
 * desenhado na largura real do cartão para os rótulos não encolherem. Tocar, passar o mouse ou usar
 * as setas mostra o balão com a data, o peso e a tendência. Com doses registradas, uma faixa violeta
 * neutra cobre o período da dose (chip "2,50 mg/sem" no topo) e a faixa "Aplicações" mostra cada
 * aplicação (a próxima, estimada, tracejada). Nome acessível próprio e nenhum peso por dose.
 */
export function WeightTrendChart({
  points,
  start,
  end,
  today = end,
  target,
  dose = null,
  withLane = false,
  nextDose = null,
  medication = null,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [active, setActive] = useState<number | null>(null);
  // Período trocado: zera a seleção no mesmo render (o índice antigo pode apontar outra pesagem).
  const [range, setRange] = useState(`${start}|${end}`);
  if (range !== `${start}|${end}`) {
    setRange(`${start}|${end}`);
    setActive(null);
  }
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = withLane && dose ? LANE_CHART_HEIGHT : HEIGHT;
  const model = weightChartModel({
    points,
    start,
    end,
    today,
    target,
    width,
    height,
    dose,
    targetFit: withLane ? "near" : "fit",
    xTickCount: withLane ? 5 : undefined,
    laneHeight: withLane ? LANE_HEIGHT : 0,
    nextDose: withLane ? nextDose : null,
  });
  const overlay = model.dose;
  const { dots, plot, lane } = model;
  const last = dots[dots.length - 1];
  const selected = active !== null ? dots[active] : undefined;
  const shadeTop = overlay && lane ? DOSE_CHIP_TOP : plot.top;
  const shadeBottom = lane ? lane.bottom : plot.bottom;
  const nearest = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !dots.length) return null;
    const x = clientX - rect.left;
    let best = 0;
    dots.forEach((d, i) => {
      if (Math.abs(d.x - x) < Math.abs(dots[best]!.x - x)) best = i;
    });
    return best;
  };
  const onPointer = (e: PointerEvent<HTMLDivElement>) => setActive(nearest(e.clientX));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!dots.length) return;
    const lastIndex = dots.length - 1;
    const current = active ?? lastIndex;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : e.key === "ArrowRight"
          ? Math.min(lastIndex, current + 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? lastIndex
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };
  const describe = (i: number) => {
    const d = dots[i]!;
    return `${fmtShortDate(d.date)}: ${kg(d.weight)} kg, tendência ${kg(d.trend)} kg`;
  };
  const summary = dots.length
    ? `Peso: ${dots.length} ${dots.length === 1 ? "pesagem" : "pesagens"} no período, de ${kg(dots[0]!.weight)} a ${kg(last!.weight)} kg; tendência atual ${kg(last!.trend)} kg${target === null ? "" : `; meta ${kg(target)} kg`}. Use as setas para ver cada pesagem.`
    : "Sem pesagens neste período.";
  // A pílula do último valor fica à direita do ponto; sem espaço, passa para a esquerda.
  const pillLeft =
    last && last.x + LAST_PILL_GAP + LAST_PILL_WIDTH > width
      ? last.x - LAST_PILL_GAP - LAST_PILL_WIDTH
      : (last?.x ?? 0) + LAST_PILL_GAP;
  const pillCoversAxis = pillLeft + LAST_PILL_WIDTH > plot.right;
  const doseAria =
    overlay && overlay.next
      ? `${overlay.aria}; próxima aplicação estimada: ${fmtShortDate(overlay.next.date)}`
      : overlay?.aria;
  return (
    <div className="wchart-stack">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- gráfico explorável: setas escolhem a pesagem, lida na região aria-live */}
      <div
        ref={box}
        className={`wchart ${lane ? "has-lane" : ""}`}
        role="group"
        aria-label={summary}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- o gráfico recebe o foco para as setas funcionarem
        tabIndex={dots.length ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(null);
        }}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--wf-emerald)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--wf-emerald)" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id={`${gradientId}-trend`}
              gradientUnits="userSpaceOnUse"
              x1={plot.left}
              y1="0"
              x2={plot.right}
              y2="0"
            >
              <stop offset="0%" stopColor="var(--wf-green-500)" />
              <stop offset="100%" stopColor="var(--wf-sky-500)" />
            </linearGradient>
          </defs>
          {overlay?.segments.map((s) => (
            <rect
              key={s.key}
              className={`wchart-dose-bg ${s.isAlt ? "is-alt" : ""}`}
              x={s.x}
              y={shadeTop}
              width={s.width}
              height={shadeBottom - shadeTop}
              rx={lane ? 10 : 0}
            />
          ))}
          {model.yTicks.map((tick) => (
            <g key={tick.label}>
              <line className="wchart-grid" x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} />
              {/* O rótulo que ficaria sob a pílula do último valor sai (a pílula já diz o número). */}
              {!(pillCoversAxis && Math.abs(tick.y - (last?.y ?? 0)) < Y_LABEL_CLEARANCE) && (
                <text className="wchart-axis" x={width - 4} y={tick.y + 4} textAnchor="end">
                  {tick.label}
                </text>
              )}
            </g>
          ))}
          {model.targetY !== null && (
            <line className="wchart-target" x1={plot.left} x2={plot.right} y1={model.targetY} y2={model.targetY} />
          )}
          {dots.length > 1 && (
            <path
              d={`${model.trendPath} L${last!.x},${plot.bottom} L${dots[0]!.x},${plot.bottom} Z`}
              fill={`url(#${gradientId})`}
            />
          )}
          {dots.length > 1 && (
            <path className="wchart-trend" d={model.trendPath} stroke={`url(#${gradientId}-trend)`} />
          )}
          {selected && (
            <line className="wchart-cursor" x1={selected.x} x2={selected.x} y1={plot.top} y2={shadeBottom} />
          )}
          {lane && (
            <line
              className="wchart-lane-line"
              x1={plot.left + LANE_LABEL_WIDTH}
              x2={plot.right}
              y1={lane.y}
              y2={lane.y}
            />
          )}
          {last && <circle className="wchart-last-halo" cx={last.x} cy={last.y} r={LAST_HALO_R} />}
          {dots.map((d, i) => (
            <circle
              key={d.id}
              className={`wchart-dot ${i === dots.length - 1 ? "is-last" : ""} ${i === active ? "is-active" : ""}`}
              cx={d.x}
              cy={d.y}
              r={i === dots.length - 1 ? 6 : i === active ? 5.5 : 4.5}
            />
          ))}
          {model.xTicks.map((tick, i) => (
            <text
              key={`${tick.label}-${i}`}
              className={`wchart-axis is-x ${tick.label === "hoje" ? "is-today" : ""}`}
              x={tick.x}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === model.xTicks.length - 1 && !lane ? "end" : "middle"}
            >
              {tick.label}
            </text>
          ))}
        </svg>
        {last && (
          <span
            className="wchart-last"
            style={{ left: Math.max(0, pillLeft), top: last.y }}
            aria-hidden="true"
          >
            {kg(last.weight)}
          </span>
        )}
        {overlay && lane && (
          <div className="dose-band" role="img" aria-label={doseAria} data-testid="dose-band">
            {overlay.segments.map((s) => (
              <span
                key={s.key}
                className={`dose-band-seg ${s.isAlt ? "is-alt" : ""}`}
                style={{ left: s.x + 6, top: DOSE_CHIP_TOP + 4, maxWidth: Math.max(0, width - s.x - 10) }}
                hidden={!s.showLabel}
              >
                <Syringe size={12} aria-hidden="true" />
                {s.rate}
              </span>
            ))}
            <span className="dose-band-label" style={{ top: lane.y }}>
              Aplicações
            </span>
            {overlay.marks.map((m, i) => (
              <i key={`${m.date}-${i}`} className="dose-band-mark" style={{ left: m.x, top: lane.y }}>
                <Syringe size={11} aria-hidden="true" />
              </i>
            ))}
            {overlay.next && (
              <i className="dose-band-mark is-next" style={{ left: overlay.next.x, top: lane.y }}>
                <Syringe size={11} aria-hidden="true" />
              </i>
            )}
          </div>
        )}
        {selected && (
          <div
            className="wchart-balloon"
            style={{
              left: Math.min(Math.max(selected.x, BALLOON_HALF), width - BALLOON_HALF),
              top: Math.max(0, Math.min(selected.y, selected.trendY) - 70),
            }}
            aria-hidden="true"
          >
            <span>{fmtShortDate(selected.date)}</span>
            <span className="wchart-balloon-row">
              <strong>
                {kg(selected.weight)} <small>kg</small>
              </strong>
              <b>tend. {kg(selected.trend)}</b>
            </span>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {active !== null ? describe(active) : ""}
        </p>
      </div>
      {overlay && !lane && (
        <div className="dose-band is-strip" role="img" aria-label={overlay.aria} data-testid="dose-band" style={{ width }}>
          {overlay.segments.map((s) => (
            <span
              key={s.key}
              className={`dose-band-seg ${s.isAlt ? "is-alt" : ""}`}
              style={{ left: s.x, width: s.width }}
            >
              {s.showLabel && s.label}
            </span>
          ))}
          {overlay.marks.map((m, i) => (
            <i key={`${m.date}-${i}`} className="dose-band-mark" style={{ left: m.x }} />
          ))}
        </div>
      )}
      <ul className="evol-legend" aria-hidden="true">
        <li>
          <i className="dot-hollow" /> Pesagem
        </li>
        <li>
          <i className="line-trend" /> Tendência
        </li>
        {overlay && (
          <li>
            <i className="dot-dose" /> {medication ?? "Dose registrada"}
          </li>
        )}
        {target !== null && (
          <li className="evol-legend-target">
            <b>Meta {fmtNumber(target, 1)} kg</b>
          </li>
        )}
      </ul>
    </div>
  );
}
