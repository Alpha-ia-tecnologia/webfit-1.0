import { useEffect, useId, useRef, useState } from "react";
import {
  fmtMl,
  syringeTicks,
  volumeMl,
  type SyringeProfile,
} from "../../lib/injection";
import {
  SLIM_VIEW,
  SYRINGE_VIEW,
  lensView,
  pillPercent,
  scaleLabels,
  slimPercent,
  syringePercent,
  syringeX,
} from "../../lib/syringe-geometry";

const { width: VIEW_W, height: VIEW_H, barrelX: BARREL_X, barrelW: BARREL_W, midY: MID_Y, flangeX: FLANGE_X, rodEnd: ROD_END } =
  SYRINGE_VIEW;
const TICK_LENGTH = { major: 12, mid: 8, minor: 5 } as const;
const STOPPER_W = 12;
/** Largura inicial do cilindro antes da primeira medida (ResizeObserver). */
const INITIAL_BARREL_PX = 200;
/**
 * Seringa fina da receita (conceito 10, recorte SLIM_VIEW): cilindro a 60% da altura e mais arredondado, flange
 * mais curta, traços só na borda de cima (cinza) e o líquido no verde da marca.
 */
const SLIM = { barrel: 0.6, flangeExtra: 20, thumb: 46, rx: 8 } as const;
const SLIM_TICK_LENGTH = { major: 13, mid: 8, minor: 5 } as const;

/** Traços da escala desenhados no SVG (sem números: os rótulos são HTML, ≥ 12 px). Fina: só em cima, em cinza. */
function Ticks({ profile, top, h, slim = false }: { profile: SyringeProfile; top: number; h: number; slim?: boolean }) {
  return (
    <g stroke={slim ? "var(--wf-art-muted)" : "var(--wf-art-ink)"}>
      {syringeTicks(profile).map((t) => {
        const x = syringeX(t.units, profile);
        const len = (slim ? SLIM_TICK_LENGTH : TICK_LENGTH)[t.kind];
        const width = t.kind === "major" ? 1.6 : slim ? 1.2 : 1;
        return (
          <g key={t.units}>
            <line x1={x} x2={x} y1={top + 2} y2={top + 2 + len} strokeWidth={width} />
            {!slim && <line x1={x} x2={x} y1={top + h - 2 - len} y2={top + h - 2} strokeWidth={width} />}
          </g>
        );
      })}
    </g>
  );
}

/** Cilindro com líquido e êmbolo; `dx` desloca o êmbolo (transform) e `fill` escala o líquido. */
function Barrel({
  profile,
  units,
  ids,
  lineEnd,
  barrel = profile.barrel,
  slim = false,
}: {
  profile: SyringeProfile;
  units: number | null;
  ids: string;
  /** Fim da linha do êmbolo (y do desenho); padrão: logo abaixo do cilindro. */
  lineEnd?: number;
  /** Altura do cilindro no viewBox (a seringa fina da receita usa 70% do perfil). */
  barrel?: number;
  slim?: boolean;
}) {
  const h = barrel;
  const top = MID_Y - h / 2;
  const x = syringeX(units ?? 0, profile);
  const fill = (x - BARREL_X) / BARREL_W;
  const rx = slim ? SLIM.rx : 4;
  return (
    <>
      <rect data-testid="syringe-barrel" x={BARREL_X} y={top} width={BARREL_W} height={h} rx={rx}
        fill="var(--wf-art-paper)" stroke={slim ? "var(--wf-art-line)" : "var(--wf-art-muted)"} strokeWidth="2" />
      <rect className="inj-liquid" x={BARREL_X} y={top + 2} width={BARREL_W} height={h - 4} rx={slim ? rx - 2 : 0}
        fill={`url(#${ids}-liquid)`} style={{ transform: `scaleX(${fill})`, transformOrigin: `${BARREL_X}px ${MID_Y}px` }} />
      <g className="inj-plunger" style={{ transform: `translateX(${x - BARREL_X}px)` }}>
        <rect x={BARREL_X} y={top + 4} width={STOPPER_W} height={h - 8} rx={slim ? 3 : 2} fill="var(--wf-art-ink)" />
        {units !== null && (
          <line x1={BARREL_X} x2={BARREL_X} y1={top - 6} y2={lineEnd ?? top + h + 6} stroke="var(--wf-accent-fill)" strokeWidth="2" />
        )}
      </g>
      <rect x={BARREL_X} y={top} width={BARREL_W} height={h} rx={rx} fill={`url(#${ids}-glass)`} pointerEvents="none" />
      <Ticks profile={profile} top={top} h={h} slim={slim} />
    </>
  );
}

function Gradients({ ids, slim = false }: { ids: string; slim?: boolean }) {
  return (
    <defs>
      <linearGradient id={`${ids}-liquid`} x1="0" x2="1" y1="0" y2="0">
        {slim ? (
          <>
            <stop offset="0" stopColor="var(--wf-green-500)" />
            <stop offset="1" stopColor="var(--wf-emerald)" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="var(--wf-green-600)" stopOpacity="0.78" />
            <stop offset="1" stopColor="var(--wf-green-500)" />
          </>
        )}
      </linearGradient>
      <linearGradient id={`${ids}-glass`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="var(--wf-art-paper)" stopOpacity="0.85" />
        <stop offset="0.35" stopColor="var(--wf-art-paper)" stopOpacity="0.12" />
        <stop offset="1" stopColor="var(--wf-art-ink)" stopOpacity="0.06" />
      </linearGradient>
      <linearGradient id={`${ids}-cap`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="var(--wf-orange-600)" />
        <stop offset="0.6" stopColor="var(--wf-orange-500)" />
        <stop offset="1" stopColor="var(--wf-amber-500)" />
      </linearGradient>
    </defs>
  );
}

/** Mede a largura do desenho para escolher a densidade dos rótulos (MIN_LABEL_GAP_PX); `viewW`: largura do viewBox. */
function useBarrelPx(viewW: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [barrelPx, setBarrelPx] = useState(INITIAL_BARREL_PX);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) setBarrelPx((width * BARREL_W) / viewW);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewW]);
  return { ref, barrelPx };
}

type FigureProps = {
  profile: SyringeProfile;
  units: number | null;
  /** cap: tampa laranja (calculadora); needle: agulha fina à esquerda (receita, conceito 10). */
  tip?: "cap" | "needle";
  /** Rótulo "0" no início da escala (receita, conceito 10). */
  showZero?: boolean;
  /** Seringa fina da receita (conceito 10): cilindro mais baixo e desenho recortado em cima e embaixo. */
  slim?: boolean;
};

/** Agulha fina e canhão, no lugar da tampa (receita). */
function Needle() {
  return (
    <g>
      <line x1="6" x2="56" y1={MID_Y} y2={MID_Y} stroke="var(--wf-art-muted)" strokeWidth="2.4" strokeLinecap="round" />
      <path d={`M54 ${MID_Y - 7} L${BARREL_X} ${MID_Y - 11} L${BARREL_X} ${MID_Y + 11} L54 ${MID_Y + 7} Z`}
        fill="var(--wf-art-mid)" stroke="var(--wf-art-line)" strokeWidth="1.2" strokeLinejoin="round" />
    </g>
  );
}

/** Tampa laranja da calculadora. */
function Cap({ ids }: { ids: string }) {
  return (
    <>
      <rect x="14" y={MID_Y - 16} width="46" height="32" rx="5" fill={`url(#${ids}-cap)`} stroke="var(--wf-orange-700)" />
      <g stroke="var(--wf-orange-200)" strokeOpacity="0.7" strokeWidth="1.2">
        <line x1="26" x2="48" y1={MID_Y - 8} y2={MID_Y - 8} />
        <line x1="26" x2="48" y1={MID_Y} y2={MID_Y} />
        <line x1="26" x2="48" y1={MID_Y + 8} y2={MID_Y + 8} />
      </g>
      <rect x="60" y={MID_Y - 5} width="12" height="10" fill="var(--wf-orange-500)" stroke="var(--wf-orange-600)" />
    </>
  );
}

/** A pílula ancora no mesmo ponto relativo (16–84%): perto do valor e sempre dentro da figura. */
const pillStyle = (percent: number) => {
  const at = pillPercent(percent);
  return { left: `${at}%`, transform: `translateX(-${at}%)` };
};

/**
 * Seringa horizontal (SERINGA-03): geometria única de syringe-geometry, êmbolo com a borda do
 * lado da agulha sobre o valor, escala em HTML acima do cilindro e a pílula "Aspire até aqui".
 */
export function SyringeFigure({ profile, units, tip = "cap", showZero = false, slim = false }: FigureProps) {
  const ids = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { ref, barrelPx } = useBarrelPx(slim ? SLIM_VIEW.width : VIEW_W);
  const h = slim ? Math.round(profile.barrel * SLIM.barrel) : profile.barrel;
  const flangeH = h + (slim ? SLIM.flangeExtra : 32);
  const thumbH = slim ? SLIM.thumb : 48;
  const rodEnd = slim ? SLIM_VIEW.rodEnd : ROD_END;
  const viewBox = slim
    ? `${SLIM_VIEW.x} ${SLIM_VIEW.y} ${SLIM_VIEW.width} ${SLIM_VIEW.height}`
    : `0 0 ${VIEW_W} ${VIEW_H}`;
  const percentOf = slim ? slimPercent : syringePercent;
  const label =
    units !== null
      ? `Seringa de ${profile.title}: aspire até ${units} UI, ${fmtMl(volumeMl(units))}`
      : `Seringa de ${profile.title} vazia`;
  const percent = units !== null ? percentOf(units, profile) : 0;
  const labels = scaleLabels(profile, barrelPx, percentOf);
  const scale = showZero ? [{ units: 0, percent: percentOf(0, profile) }, ...labels] : labels;
  return (
    <figure className="inj-figure" role="img" aria-label={label}>
      <div ref={ref} className="inj-figure-frame">
        <div className="inj-scale" data-testid="syringe-scale" aria-hidden="true">
          {scale.map((l) => (
            <span key={l.units} className={l.units === units ? "on" : undefined} style={{ left: `${l.percent}%` }}>
              {l.units}
            </span>
          ))}
        </div>
        <svg className={`inj-syringe${slim ? " is-slim" : ""}`} viewBox={viewBox} aria-hidden="true" focusable="false">
          <Gradients ids={ids} slim={slim} />
          {tip === "needle" ? <Needle /> : <Cap ids={ids} />}
          <rect x={BARREL_X} y={MID_Y - 6} width={rodEnd - 12 - BARREL_X} height="12" rx="2"
            fill="var(--wf-art-soft)" stroke="var(--wf-art-line)" />
          <rect x={rodEnd - 12} y={MID_Y - thumbH / 2} width="12" height={thumbH} rx={slim ? 6 : 3}
            fill={slim ? "var(--wf-art-mid)" : "var(--wf-art-faint)"} stroke={slim ? "var(--wf-art-line)" : "var(--wf-art-muted)"} />
          <Barrel profile={profile} units={units} ids={ids} barrel={h} slim={slim} lineEnd={tip === "needle" ? VIEW_H : undefined} />
          <rect x={FLANGE_X} y={MID_Y - flangeH / 2} width="12" height={flangeH} rx={slim ? 6 : 3}
            fill="var(--wf-art-mid)" stroke={slim ? "var(--wf-art-line)" : "var(--wf-art-muted)"} strokeWidth="1.5" />
        </svg>
        {units !== null && (
          <span className="inj-pill" data-testid="syringe-marker" style={pillStyle(percent)}>
            Aspire até aqui · {units} UI
          </span>
        )}
      </div>
    </figure>
  );
}

/**
 * Lupa da seringa de 100 UI (traços de 2 UI): um SVG próprio recortado pelo viewBox de lensView,
 * sem testids nem papel; os rótulos são HTML de 12 px.
 */
export function SyringeLens({ profile, units }: { profile: SyringeProfile; units: number }) {
  const ids = useId().replace(/[^a-zA-Z0-9]/g, "");
  const view = lensView(units, profile);
  const h = profile.barrel;
  const top = MID_Y - h / 2;
  const x = syringeX(units, profile);
  return (
    <div className="inj-lens" data-testid="syringe-lens" aria-hidden="true">
      <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Gradients ids={ids} />
        <rect x={BARREL_X} y={top} width={BARREL_W} height={h} fill="var(--wf-art-paper)" />
        <rect x={BARREL_X} y={top + 2} width={x - BARREL_X} height={h - 4} fill={`url(#${ids}-liquid)`} />
        <rect x={x} y={top + 4} width={STOPPER_W} height={h - 8} fill="var(--wf-art-ink)" />
        <rect x={BARREL_X} y={top} width={BARREL_W} height={h} fill={`url(#${ids}-glass)`} />
        <Ticks profile={profile} top={top} h={h} />
        <line x1={x} x2={x} y1={view.y} y2={view.y + view.height} stroke="var(--wf-accent-fill)" strokeWidth="0.8" />
      </svg>
      <div className="inj-lens-labels">
        {view.labels.map((l) => (
          <span key={l.units} className={l.units === units ? "on" : undefined} style={{ left: `clamp(12px, ${l.percent}%, calc(100% - 12px))` }}>
            {l.units}
          </span>
        ))}
      </div>
    </div>
  );
}
