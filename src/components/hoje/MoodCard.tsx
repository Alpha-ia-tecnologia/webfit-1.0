import { Moon } from "lucide-react";
import { MOOD_LABELS } from "../../lib/day";
import { fmtNumber } from "../../lib/format";
import { tapFeedback } from "../../lib/haptics";
import type { DiaryEntry } from "../../types";

/** Marcadores visíveis no cartão depois do registro; o Diário mostra todos. */
const MAX_TAGS_SHOWN = 2;

/** Tons sem julgamento: nenhum rosto usa vermelho. */
const FACE_TONES = [
  { fill: "var(--wf-indigo-50)", ink: "var(--wf-indigo-500)" },
  { fill: "var(--wf-violet-50)", ink: "var(--wf-violet-600)" },
  { fill: "var(--wf-surface-2)", ink: "var(--wf-text-muted)" },
  { fill: "var(--wf-mint-100)", ink: "var(--wf-green-600)" },
  { fill: "var(--wf-mint-200)", ink: "var(--wf-green-700)" },
];

/** Rosto desenhado: a boca vai de triste (1) a sorrindo (5). */
export function MoodFace({ rating, size = 40 }: { rating: number; size?: number }) {
  const tone = FACE_TONES[Math.min(5, Math.max(1, rating)) - 1];
  const curve = (rating - 3) * 4;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill={tone.fill} stroke={tone.ink} strokeWidth="1.5" />
      <circle cx="14" cy="16" r="2" fill={tone.ink} />
      <circle cx="26" cy="16" r="2" fill={tone.ink} />
      <path
        d={`M12 ${26 - curve / 2} Q20 ${26 + curve} 28 ${26 - curve / 2}`}
        fill="none"
        stroke={tone.ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  latest: DiaryEntry | null;
  onLog: (rating: number) => void;
  onDetails: () => void;
};

/** Bem-estar em um toque: cinco rostos; depois de registrar, mostra o último e o sono. */
export function MoodCard({ latest, onLog, onDetails }: Props) {
  if (latest?.rating)
    return (
      <section className="card mood-card done stagger-3" aria-labelledby="mood-title">
        <MoodFace rating={latest.rating} size={44} />
        <div className="mood-copy">
          <h2 id="mood-title">{MOOD_LABELS[latest.rating - 1]}</h2>
          <span className="muted">
            Registrado às {latest.time}
            {latest.sleepHours !== undefined && (
              <span className="mood-sleep">
                <Moon size={12} aria-hidden="true" />
                Sono {fmtNumber(latest.sleepHours, 1)} h
              </span>
            )}
            {latest.tags?.slice(0, MAX_TAGS_SHOWN).map((tag) => (
              <span key={tag} className="mood-tag">
                {tag}
              </span>
            ))}
          </span>
        </div>
        <button type="button" className="text-btn" onClick={onDetails}>
          Detalhes
        </button>
      </section>
    );
  return (
    <section className="card mood-card stagger-3" aria-labelledby="mood-title">
      <h2 id="mood-title">Como você está?</h2>
      <div className="mood-faces" role="group" aria-labelledby="mood-title">
        {MOOD_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className="mood-face"
            aria-label={`Registrar como me sinto: ${label}`}
            title={label}
            onClick={() => {
              tapFeedback();
              onLog(i + 1);
            }}
          >
            <MoodFace rating={i + 1} />
          </button>
        ))}
      </div>
    </section>
  );
}
