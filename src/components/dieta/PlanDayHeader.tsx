import { useId, useState, type ReactNode } from "react";
import { Ban, ChefHat, Info, Leaf, Sparkles, Stethoscope, Target } from "lucide-react";
import { donutArcs } from "../../lib/charts";
import { macroShare } from "../../lib/diary-day";
import type { DietChip } from "../../lib/diet";
import { fmtNumber } from "../../lib/format";

const CHIP_ICON: Record<DietChip["kind"], typeof Target> = {
  goal: Target,
  allergy: Ban,
  pattern: Leaf,
  time: ChefHat,
  professional: Stethoscope,
};
/** "30 min para cozinhar" → "30 min" visível; o resto só para leitores de tela. */
const TIME_TAIL = " para cozinhar";

/** Metas do dia (dailyTargets): kcal e macros em gramas. */
export interface DayGoal {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

const DONUT = 66;
const DONUT_RADIUS = 28;
const DONUT_WIDTH = 10;
const DONUT_GAP = 3;
const MACROS = [
  { key: "protein", letter: "P", name: "Proteínas" },
  { key: "carbs", letter: "C", name: "Carboidratos" },
  { key: "fat", letter: "G", name: "Gorduras" },
] as const;

/** Rosca das metas: fatias P/C/G nas cores fixas e a parte da proteína no centro (sem kcal). */
function ProteinDonut({ share }: { share: { protein: number; carbs: number; fat: number } }) {
  const values = MACROS.map((m) => share[m.key]);
  const arcs = donutArcs(DONUT_RADIUS, values, DONUT_GAP);
  const c = DONUT / 2;
  return (
    <figure
      className="plan-day-donut"
      role="img"
      aria-label={`Proteínas: ${share.protein}% da meta do dia`}
    >
      <svg viewBox={`0 0 ${DONUT} ${DONUT}`} aria-hidden="true">
        {MACROS.map((m, i) =>
          arcs[i]!.length > 0 ? (
            <circle
              key={m.key}
              cx={c}
              cy={c}
              r={DONUT_RADIUS}
              fill="none"
              stroke={`var(--wf-macro-${m.key})`}
              strokeWidth={DONUT_WIDTH}
              strokeDasharray={`${arcs[i]!.length} 1000`}
              strokeDashoffset={arcs[i]!.offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          ) : null,
        )}
      </svg>
      <span className="plan-day-donut-center" aria-hidden="true">
        <strong>{share.protein}%</strong>
        <small>Prot.</small>
      </span>
    </figure>
  );
}

type Props = {
  hasPlan: boolean;
  /** "hoje", "ontem", "há 3 dias" (data do plano). */
  updatedAt: string | null;
  /** Metas do dia; null no perfil sensível (sem números nem rosca). */
  goal: DayGoal | null;
  hideCalories: boolean;
  chips: readonly DietChip[];
  /** Linha "2 de 5 refeições hoje" com os horários (só com plano estruturado de hoje). */
  progress: ReactNode;
  /** Conteúdo do (i) "Sobre esta dieta": resumo, nota dos horários e o aviso educativo. */
  about: ReactNode;
  /** Avisos (consentimento, agente) e, sem plano, os botões de gerar. */
  children?: ReactNode;
};

/**
 * Cabeçalho do dia da dieta (fidelidade "Minha dieta"): selo do agente com a data, a meta do dia em
 * destaque com os macros e a rosca, os chips de personalização e a linha "2 de 5 refeições hoje".
 * Números só das metas (dailyTargets) e do diário; nada com calorias ocultas nem no perfil sensível.
 */
export function PlanDayHeader({
  hasPlan,
  updatedAt,
  goal,
  hideCalories,
  chips,
  progress,
  about,
  children,
}: Props) {
  const [isInfoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  const titleId = useId();
  const grams = goal && goal.protein !== null && goal.carbs !== null && goal.fat !== null
    ? { protein: goal.protein, carbs: goal.carbs, fat: goal.fat }
    : null;
  const share = grams ? macroShare(grams) : null;
  const kcal = goal && !hideCalories ? goal.calories : null;
  const hasGoal = kcal !== null || grams !== null;
  return (
    <section className="card plan-day" aria-labelledby={titleId}>
      <div className="plan-day-top">
        {hasPlan && (
          <>
            <span className="plan-day-badge">
              <Sparkles size={14} aria-hidden="true" />
              Feita pelo seu agente
            </span>
            {updatedAt && <span className="plan-day-updated">· atualizada {updatedAt}</span>}
          </>
        )}
        <button
          type="button"
          className="plan-day-info"
          aria-label="Sobre esta dieta"
          aria-expanded={isInfoOpen}
          aria-controls={infoId}
          onClick={() => setInfoOpen(!isInfoOpen)}
        >
          <Info size={20} aria-hidden="true" />
        </button>
      </div>
      <h2 id={titleId} className={hasPlan ? "sr-only" : "plan-day-title"}>
        {hasPlan ? "Seu plano de refeições" : "Um plano que considera você"}
      </h2>
      {!hasPlan && (
        <div className="plan-day-lede">Refeições, porções e trocas a partir da sua anamnese.</div>
      )}
      <div id={infoId} className="diet-info" hidden={!isInfoOpen}>
        {about}
      </div>
      {hasPlan && hasGoal && (
        <div className="plan-day-goal">
          <div className="plan-day-goal-text">
            {kcal !== null ? (
              <div className="plan-day-kcal">
                <strong>{fmtNumber(kcal)}</strong>
                <span>kcal/dia</span>
              </div>
            ) : (
              <div className="plan-day-kcal is-label">Sua meta do dia</div>
            )}
            {grams && (
              <ul className="plan-day-macros" aria-label="Macronutrientes do dia">
                {MACROS.map((m) => (
                  <li key={m.key}>
                    <i className={`is-${m.key}`} aria-hidden="true" />
                    <span aria-hidden="true">{m.letter}</span>
                    <span className="sr-only">{m.name}</span> {fmtNumber(grams[m.key])} g
                  </li>
                ))}
              </ul>
            )}
          </div>
          {share && <ProteinDonut share={share} />}
        </div>
      )}
      <ul className="diet-chips" aria-label="Personalização da dieta">
        {chips.map(({ kind, label }) => {
          const Icon = CHIP_ICON[kind];
          const isTime = kind === "time" && label.endsWith(TIME_TAIL);
          return (
            <li key={kind} className={`diet-chip ${kind}`}>
              <Icon size={16} aria-hidden="true" />
              {isTime ? label.slice(0, -TIME_TAIL.length) : label}
              {isTime && <span className="sr-only">{TIME_TAIL}</span>}
            </li>
          );
        })}
      </ul>
      {progress && <div className="plan-day-rule">{progress}</div>}
      {children}
    </section>
  );
}
