import { BadgeCheck, Check, Pencil, Target } from "lucide-react";
import { useId } from "react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { anamneseCompletion, goalChip } from "../../lib/profile-summary";
import { heroFacts } from "../../lib/space";

const initialOf = (name: string) => Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?";

/** Anel de 82 px: arco em degradê da marca = quanto da anamnese está respondido. */
const RING_SIZE = 82;
const RING_STROKE = 4;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Topo do Meu espaço (conceito 11): avatar com o anel da anamnese (neutro, sem festa), nome,
 * "34 anos · 165 cm", lápis para revisar a anamnese e os chips "Anamnese 100%" (abre as seções no
 * mosaico) e o objetivo (nunca em perfil calmo).
 */
export function ProfileHero({ onOpenSections }: { onOpenSections: () => void }) {
  const { state, navigate } = useApp();
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const p = state.profile!;
  const today = localDate();
  const done = anamneseCompletion(p, today);
  const goal = goalChip(p, today);
  const dash = (RING_C * done.percent) / 100;
  return (
    <section className="profile-hero" aria-labelledby="profile-hero-name">
      <div className="profile-hero-top">
        <span className="profile-hero-avatar" aria-hidden="true">
          <svg
            className="profile-hero-ring"
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            width={RING_SIZE}
            height={RING_SIZE}
            focusable="false"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" className="ring-stop-a" />
                <stop offset="1" className="ring-stop-b" />
              </linearGradient>
            </defs>
            <circle
              className="profile-hero-ring-track"
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
            />
            <circle
              className="profile-hero-ring-arc"
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              stroke={`url(#${gradientId})`}
              strokeDasharray={`${dash} ${RING_C}`}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </svg>
          <span className="profile-hero-disc">{initialOf(p.name)}</span>
          {done.isComplete && (
            <span className="profile-hero-badge">
              <Check size={16} strokeWidth={3} />
            </span>
          )}
        </span>
        <div className="profile-hero-id">
          <h2 id="profile-hero-name">{p.name}</h2>
          <p>{heroFacts(p, today)}</p>
        </div>
        <button
          type="button"
          className="profile-hero-btn"
          aria-label="Revisar anamnese"
          onClick={() => navigate("anamnese")}
        >
          <Pencil size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="profile-hero-chips">
        <button
          type="button"
          className="profile-hero-chip is-anamnese"
          aria-label={`Anamnese ${done.percent}%: ver as seções`}
          onClick={onOpenSections}
        >
          <BadgeCheck size={18} aria-hidden="true" />
          Anamnese {done.percent}%
        </button>
        {goal && (
          <span className="profile-hero-chip is-goal">
            <Target size={18} aria-hidden="true" />
            {goal}
          </span>
        )}
      </div>
    </section>
  );
}
