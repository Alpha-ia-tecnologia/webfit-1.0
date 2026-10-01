import { useMemo, useState } from "react";
import {
  Apple,
  Bean,
  Beef,
  Check,
  Info,
  LeafyGreen,
  Milk,
  Nut,
  Utensils,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { circumference, ringSegments } from "../../lib/charts";
import { useApp } from "../../lib/context";
import type { FoodIconName } from "../../lib/food-categories";
import {
  dayVariety,
  FOOD_GROUP_TOTAL,
  FOOD_GROUPS,
  VARIETY_COPY,
  type DayVariety,
} from "../../lib/food-groups";
import { IconTile } from "../IconTile";
import { Modal } from "../UI";
import "./Quality.css";

/** Ícones dos 7 grupos (os nomes vêm de FOOD_GROUPS). */
const GROUP_ICONS: Partial<Record<FoodIconName, LucideIcon>> = {
  Wheat,
  Bean,
  LeafyGreen,
  Apple,
  Nut,
  Milk,
  Beef,
};
const iconOf = (name: FoodIconName): LucideIcon => GROUP_ICONS[name] ?? Utensils;

const SIZE = 88;
const CENTER = SIZE / 2;
const RADIUS = 34;
const GAP = 4;
const STROKE = 10;

/**
 * Variedade do dia: um anel com um segmento por grupo (presente na cor do grupo, ausente em
 * trilho neutro) e a legenda dos 7 grupos. Sem vermelho, sem comemoração, sem sequência.
 */
function VarietyTile({ variety }: { variety: DayVariety }) {
  const present = new Set(variety.present);
  const segments = ringSegments(RADIUS, FOOD_GROUP_TOTAL, GAP);
  const full = circumference(RADIUS);
  return (
    <div className="quality-tile variety">
      <div className="quality-ring" role="img" aria-label={variety.speech}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {FOOD_GROUPS.map((group, i) => (
            <circle
              key={group.key}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              stroke={
                present.has(group.key) ? `var(--wf-tone-${group.tone}-fg)` : "var(--wf-border)"
              }
              strokeDasharray={`${segments[i]?.length ?? 0} ${full}`}
              strokeDashoffset={segments[i]?.offset ?? 0}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          ))}
        </svg>
        <span className="quality-count" aria-hidden="true">
          <strong>{variety.count}</strong>
          <small>de {FOOD_GROUP_TOTAL}</small>
        </span>
      </div>
      <p className="quality-caption">{VARIETY_COPY.caption}</p>
      <ul className="quality-legend" aria-label={VARIETY_COPY.legend}>
        {FOOD_GROUPS.map((group) => {
          const Icon = iconOf(group.icon);
          const isPresent = present.has(group.key);
          return (
            <li key={group.key} className={isPresent ? "is-present" : undefined}>
              {isPresent ? (
                <IconTile tone={group.tone} icon={Icon} size="sm" />
              ) : (
                <span className="quality-absent-icon" aria-hidden="true">
                  <Icon size={14} />
                </span>
              )}
              <span className="quality-label">{group.short}</span>
              {isPresent ? (
                <Check
                  size={14}
                  strokeWidth={3}
                  aria-hidden="true"
                  className="quality-check"
                  style={{ color: `var(--wf-tone-${group.tone}-fg)` }}
                />
              ) : (
                <span className="sr-only">{VARIETY_COPY.absent}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * "Qualidade do dia" (DIARIO-12) no Diário, entre as refeições e "Água e bem-estar": só aparece
 * com pelo menos uma refeição com alimentos no dia. Lê só tipo, data e alimentos (nunca calorias):
 * o mesmo cartão com "Ocultar calorias" e para perfis sensíveis.
 */
export function QualityCard({ date }: { date: string }) {
  const { state } = useApp();
  const variety = useMemo(() => dayVariety(state.diary, date), [state.diary, date]);
  const [isInfoOpen, setInfoOpen] = useState(false);
  if (!variety.mealCount) return null;
  // Fibras e sódio (quando houver dados) entram como novos quadros nesta lista, sem mudar o layout.
  const tiles = [<VarietyTile key="variety" variety={variety} />];
  return (
    <section className="card diary-quality stagger-4" aria-labelledby="diary-quality-title">
      <div className="quality-head">
        <h2 id="diary-quality-title">{VARIETY_COPY.title}</h2>
        <button
          type="button"
          className="icon-btn quality-info"
          aria-label={VARIETY_COPY.info}
          onClick={() => setInfoOpen(true)}
        >
          <Info size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="quality-grid">{tiles}</div>
      {isInfoOpen && (
        <Modal title={VARIETY_COPY.infoTitle} onClose={() => setInfoOpen(false)}>
          <p>{VARIETY_COPY.infoText}</p>
        </Modal>
      )}
    </section>
  );
}
