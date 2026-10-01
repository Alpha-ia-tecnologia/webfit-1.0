import { useId } from "react";
import { Droplets, Heart, Utensils } from "lucide-react";
import { dayPeriod, mealWord, type DayPeriodKey } from "../../lib/diary-day";

/** Ilustração do período do dia: nascer do sol, sol a pino ou lua (SVG local, sem imagem externa). */
function PeriodArt({ period }: { period: DayPeriodKey }) {
  const clipId = useId();
  const rays = period === "tarde" ? 8 : 5;
  if (period === "noite")
    return (
      <svg className="start-art" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="30" fill="var(--wf-indigo-50)" />
        <path d="M44 20a17 17 0 1 0 8 26A14 14 0 0 1 44 20Z" fill="var(--wf-indigo-500)" />
        <circle cx="22" cy="22" r="1.8" fill="var(--wf-indigo-500)" />
        <circle cx="54" cy="16" r="1.4" fill="var(--wf-indigo-500)" />
        <circle cx="18" cy="44" r="1.2" fill="var(--wf-indigo-500)" />
      </svg>
    );
  const cy = period === "manha" ? 44 : 36;
  return (
    <svg className="start-art" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="var(--wf-amber-50)" />
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="72" height={period === "manha" ? 46 : 72} />
        </clipPath>
      </defs>
      {Array.from({ length: rays }, (_, i) => {
        const angle = period === "manha" ? Math.PI + (i + 1) * (Math.PI / (rays + 1)) : (i * 2 * Math.PI) / rays;
        const x1 = 36 + Math.cos(angle) * 18;
        const y1 = cy + Math.sin(angle) * 18;
        const x2 = 36 + Math.cos(angle) * 24;
        const y2 = cy + Math.sin(angle) * 24;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--wf-amber-500)" strokeWidth="3" strokeLinecap="round" />
        );
      })}
      <circle cx="36" cy={cy} r="13" fill="var(--wf-amber-500)" clipPath={`url(#${clipId})`} />
      {period === "manha" && (
        <path d="M12 47h48" stroke="var(--wf-amber-200)" strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * "Comece seu dia" (HOJE-X3), no lugar do próximo passo enquanto o dia está em branco: um convite
 * neutro, sem cobrança, com três registros de um toque.
 */
export function StartCard({
  time,
  mealCategory,
  quickWaterMl,
  onMeal,
  onWater,
  onMood,
}: {
  time: string;
  mealCategory: string;
  /** Volume do toque único; null com restrição hídrica (abre o formulário de volume). */
  quickWaterMl: number | null;
  onMeal: () => void;
  onWater: () => void;
  onMood: () => void;
}) {
  const { key, greeting } = dayPeriod(time);
  return (
    <section className={`card start-card ${key} stagger-2`} aria-labelledby="start-title">
      <div className="start-head">
        <PeriodArt period={key} />
        <div>
          <p className="start-kicker">{greeting}</p>
          <h2 id="start-title">Comece seu dia</h2>
          <p className="muted">Um toque registra; dá para ajustar depois.</p>
        </div>
      </div>
      <div className="start-tiles">
        <button type="button" className="start-tile food" aria-label={`Registrar ${mealWord(mealCategory)}`} onClick={onMeal}>
          <Utensils size={18} aria-hidden="true" />
          <strong>{mealCategory}</strong>
          <span aria-hidden="true">registrar</span>
        </button>
        <button
          type="button"
          className="start-tile water"
          aria-label={quickWaterMl ? `Registrar ${quickWaterMl} ml de água` : "Água: informar volume"}
          onClick={onWater}
        >
          <Droplets size={18} aria-hidden="true" />
          <strong>{quickWaterMl ? `+${quickWaterMl} ml` : "Água"}</strong>
          <span aria-hidden="true">{quickWaterMl ? "copo de água" : "informar volume"}</span>
        </button>
        <button type="button" className="start-tile mind" aria-label="Registrar bem-estar" onClick={onMood}>
          <Heart size={18} aria-hidden="true" />
          <strong>Bem-estar</strong>
          <span aria-hidden="true">como você está</span>
        </button>
      </div>
    </section>
  );
}
