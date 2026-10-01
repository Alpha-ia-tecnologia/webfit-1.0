import { Brain, ChevronDown, Sparkles } from "lucide-react";
import { fmtNumber, plural } from "../../lib/format";
import { arcLength, circumference } from "../../lib/charts";

/** Avatar do agente no cabeçalho do app (antes do título): gradiente, brilho e o ponto de status. */
export function AgentAvatar({ isLive }: { isLive: boolean }) {
  return (
    <span className="agent-avatar" aria-hidden="true">
      <Sparkles size={20} />
      <span className={`agent-avatar-dot${isLive ? "" : " is-off"}`} />
    </span>
  );
}

/** Botão do cabeçalho que abre "O que o agente considera" (no lugar do sino). */
export function ContextButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="O que o agente considera"
      onClick={onOpen}
    >
      <Brain size={20} />
    </button>
  );
}

function MiniRing({ value, max }: { value: number; max: number | null }) {
  const r = 8;
  const length = circumference(r);
  const ratio = max ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <svg
      className="mini-ring"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r={r} className="mini-ring-track" />
      <circle
        cx="11"
        cy="11"
        r={r}
        className="mini-ring-fill"
        strokeDasharray={length}
        strokeDashoffset={length - arcLength(r, ratio * 100)}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

interface DayTotals {
  calories: number;
  water: number;
  protein: number;
  meals: number;
}
interface DayGoals {
  calories: number | null;
  water: number | null;
  protein: number | null;
}

const liters = (ml: number) => fmtNumber(ml / 1000, 2);

/**
 * Pílula do contexto de hoje com 3 mini anéis ("1.210 kcal", "1,75 L", "82 g prot."): o número
 * em destaque e a unidade menor. Abre o detalhe com as metas. Nunca fica vermelha.
 */
export function ContextPill({
  totals,
  goals,
  hideCalories,
  mealsPerDay,
}: {
  totals: DayTotals;
  goals: DayGoals;
  hideCalories: boolean;
  mealsPerDay: number;
}) {
  const energy = hideCalories
    ? {
        label: "Refeições",
        value: totals.meals,
        max: mealsPerDay,
        amount: fmtNumber(totals.meals),
        unit: plural(totals.meals, "refeição", "refeições").replace(/^\S+\s/, ""),
        detail: `de ${fmtNumber(mealsPerDay)} no dia`,
      }
    : {
        label: "Energia",
        value: totals.calories,
        max: goals.calories,
        amount: fmtNumber(totals.calories),
        unit: "kcal",
        detail: goals.calories
          ? `de ${fmtNumber(goals.calories)} kcal`
          : "sem meta",
      };
  const items = [
    { key: "energia", tone: "food", ...energy },
    {
      key: "agua",
      tone: "water",
      label: "Água",
      value: totals.water,
      max: goals.water,
      amount: liters(totals.water),
      unit: "L",
      detail: goals.water ? `de ${liters(goals.water)} L` : "sem meta",
    },
    {
      key: "proteina",
      tone: "protein",
      label: "Proteína",
      value: totals.protein,
      max: goals.protein,
      amount: `${fmtNumber(totals.protein)} g`,
      unit: "prot.",
      detail: goals.protein ? `de ${fmtNumber(goals.protein)} g` : "sem meta",
    },
  ];
  return (
    <details className="context-pill">
      <summary>
        <span className="sr-only">Contexto de hoje: </span>
        {items.map((item) => (
          <span key={item.key} className={`context-ring ${item.tone}`}>
            <MiniRing value={item.value} max={item.max} />
            <strong>{item.amount}</strong>
            <span className="context-unit">{item.unit}</span>
          </span>
        ))}
        <ChevronDown size={18} className="chevron" aria-hidden="true" />
      </summary>
      <dl className="context-grid">
        {items.map((item) => (
          <div key={item.key} className={`context-mini ${item.tone}`}>
            <dt>{item.label}</dt>
            <dd>
              <strong>
                {item.amount} {item.unit}
              </strong>
              <small>{item.detail}</small>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
