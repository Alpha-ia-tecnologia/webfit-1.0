import { useId } from "react";
import { CupSoda, Droplet, GlassWater, Plus } from "lucide-react";
import { fmtLiters } from "../../lib/format";
import { percentOf, WATER_TAPS, type WeekDay } from "../../lib/today";
import { WaterWeek } from "./WaterWeek";
import { CountUp } from "../Metric";
import { useCelebration } from "./useCelebration";
import { tapFeedback } from "../../lib/haptics";

type Props = {
  totalMl: number;
  goalMl: number | null;
  week: WeekDay[];
  onTap: (ml: number) => void;
  onCustom: () => void;
  /** Brilho ao bater a meta; desligado para perfis sensíveis. */
  canCelebrate?: boolean;
};

const TAP_ICONS = [Droplet, GlassWater, CupSoda];

/** Copo que enche até a porcentagem da meta (a água sobe por transform, sem animar layout). */
function WaterGlass({ percent }: { percent: number }) {
  const clipId = useId();
  const level = 64 - (Math.min(100, percent) / 100) * 56;
  return (
    <svg className="water-glass" viewBox="0 0 56 72" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M6 6h44l-5 60a4 4 0 0 1-4 3.6H15a4 4 0 0 1-4-3.6z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="56" height="72" fill="var(--wf-sky-50)" />
        <g className="water-glass-fill" style={{ transform: `translateY(${level}px)` }}>
          <path d="M0 4q7-4 14 0t14 0 14 0 14 0v80H0z" fill="var(--wf-blue)" opacity="0.85" />
        </g>
      </g>
      <path
        d="M6 6h44l-5 60a4 4 0 0 1-4 3.6H15a4 4 0 0 1-4-3.6z"
        fill="none"
        stroke="var(--wf-sky-600)"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Água do dia: copo, total em litros, registro em um toque e a semana com a linha da meta. */
export function WaterCard({ totalMl, goalMl, week, onTap, onCustom, canCelebrate = false }: Props) {
  const percent = percentOf(totalMl, goalMl) ?? 0;
  const isReached = goalMl !== null && totalMl >= goalMl;
  const isCelebrating = useCelebration(isReached, canCelebrate, totalMl);
  return (
    <section
      className={`card water-card stagger-3 ${isCelebrating ? "is-celebrating" : ""}`}
      id="hoje-agua"
      aria-labelledby="water-title"
    >
      <div className="section-head">
        <div>
          <h2 id="water-title">Água</h2>
          <span className="muted">
            {goalMl !== null ? `Meta de ${fmtLiters(goalMl)} por dia` : "Sem meta de água informada"}
          </span>
        </div>
        <button type="button" className="link-btn" onClick={onCustom}>
          <Plus size={14} aria-hidden="true" />
          Registrar água
        </button>
      </div>
      <div className="water-main">
        <WaterGlass percent={percent} />
        <div className="water-amount">
          <strong>
            <CountUp value={totalMl} format={fmtLiters} />
          </strong>
          <span className="muted">
            {goalMl === null
              ? "registrados hoje"
              : isReached
                ? `de ${fmtLiters(goalMl)} · meta alcançada`
                : `de ${fmtLiters(goalMl)} · ${percent}%`}
          </span>
        </div>
      </div>
      <div className="water-taps">
        {WATER_TAPS.map((tap, i) => {
          const Icon = TAP_ICONS[i] ?? Droplet;
          return (
            <button
              key={tap.ml}
              type="button"
              className="water-tap"
              onClick={() => {
                tapFeedback();
                onTap(tap.ml);
              }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{tap.label}</span>
              <small>+{tap.ml} ml</small>
            </button>
          );
        })}
      </div>
      <WaterWeek days={week} goalMl={goalMl} />
    </section>
  );
}
