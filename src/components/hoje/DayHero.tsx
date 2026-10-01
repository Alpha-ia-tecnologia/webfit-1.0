import { useId, useState } from "react";
import { Droplet, Info, Leaf, Plus } from "lucide-react";
import { arcDash, circumference, ringSegments, segmentFill } from "../../lib/charts";
import { energyRing } from "../../lib/day";
import { fmtNumber } from "../../lib/format";
import { CountUp } from "../Metric";
import { percentOf } from "../../lib/today";
import { MacroSummary, type MacroValue } from "./MacroSummary";

type Props = {
  consumed: number;
  goal: number | null;
  hideCalories: boolean;
  macros: MacroValue[];
  water: { ml: number; goal: number | null };
  habits: { done: number; total: number };
  meals: number;
  /** Toque no tile de água: abre a folha "Registrar água" (±50 ml). */
  onWater: () => void;
  /** "+" do tile de água (um copo em um toque); ausente com restrição hídrica. */
  onWaterAdd?: (ml: number) => void;
  onHabits: () => void;
  onExplain: () => void;
};

const SIZE = 164;
const CENTER = SIZE / 2;
const ENERGY_RADIUS = 74;
const ENERGY_STROKE = 12;
/** Três anéis de macro por dentro; o miolo (raio ~38) cabe "kcal restantes" em duas linhas. */
const MACRO_RADII = [60, 51, 42];
const MACRO_STROKE = 7;
const MAIN_MEALS = 3;
/** Folga entre os três segmentos de presença (px de traço). */
const PRESENCE_GAP = 10;
/** Um copo no "+" do tile de água. */
const WATER_ADD_ML = 250;
const ROTATE = `rotate(-90 ${CENTER} ${CENTER})`;
/** "1.645" não cabe em 36 px dentro do anel de gordura: números de 4 dígitos descem um degrau. */
const isLong = (value: number) => fmtNumber(value).length >= 5;
/** Litros sem a unidade: "1,75". */
const literNumber = (ml: number) => fmtNumber(ml / 1000, 2);

function Arc({
  radius,
  percent,
  stroke,
  width,
  track,
}: {
  radius: number;
  percent: number;
  stroke: string;
  width: number;
  track: string;
}) {
  return (
    <>
      <circle className={`day-ring-track ${track}`} cx={CENTER} cy={CENTER} r={radius} fill="none" strokeWidth={width} />
      {percent > 0 && (
        <circle
          className="day-ring-arc"
          cx={CENTER}
          cy={CENTER}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={arcDash(radius, percent)}
          transform={ROTATE}
        />
      )}
    </>
  );
}

/** "Seu dia" sem números de energia: refeições, água e combinados, um terço do anel cada. */
function PresenceArcs({ parts }: { parts: { key: string; percent: number; stroke: string }[] }) {
  const segments = ringSegments(ENERGY_RADIUS, parts.length, PRESENCE_GAP);
  return (
    <>
      {parts.map((part, i) => {
        const segment = segments[i]!;
        const filled = segmentFill(segment, part.percent);
        return (
          <g key={part.key}>
            <circle
              className="day-ring-track is-energy"
              cx={CENTER}
              cy={CENTER}
              r={ENERGY_RADIUS}
              fill="none"
              strokeWidth={ENERGY_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${segment.length} 1000`}
              strokeDashoffset={segment.offset}
              transform={ROTATE}
            />
            {filled > 0 && (
              <circle
                className="day-ring-arc"
                cx={CENTER}
                cy={CENTER}
                r={ENERGY_RADIUS}
                fill="none"
                stroke={part.stroke}
                strokeWidth={ENERGY_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${filled} 1000`}
                strokeDashoffset={segment.offset}
                transform={ROTATE}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

const TILE = 28;
const TILE_C = TILE / 2;
const TILE_R = 11.5;
const TILE_STROKE = 3;
const TILE_ROTATE = `rotate(-90 ${TILE_C} ${TILE_C})`;

/** Mini-anel de 28 px do tile: água em arco contínuo; combinados em um segmento por combinado. */
function TileRing({ kind, percent, done = 0, total = 0 }: { kind: "water" | "habits"; percent?: number; done?: number; total?: number }) {
  const Icon = kind === "water" ? Droplet : Leaf;
  return (
    <span className={`tile-ring is-${kind}`} aria-hidden="true">
      <svg viewBox={`0 0 ${TILE} ${TILE}`} focusable="false">
        {kind === "water" ? (
          <>
            <circle className="tile-ring-track" cx={TILE_C} cy={TILE_C} r={TILE_R} fill="none" strokeWidth={TILE_STROKE} />
            {(percent ?? 0) > 0 && (
              <circle
                className="tile-ring-fill"
                cx={TILE_C}
                cy={TILE_C}
                r={TILE_R}
                fill="none"
                strokeWidth={TILE_STROKE}
                strokeLinecap="round"
                strokeDasharray={arcDash(TILE_R, percent ?? 0)}
                transform={TILE_ROTATE}
              />
            )}
          </>
        ) : (
          ringSegments(TILE_R, Math.max(total, 1), 3).map((segment, i) => (
            <circle
              key={i}
              className={i < done ? "tile-ring-fill" : "tile-ring-track"}
              cx={TILE_C}
              cy={TILE_C}
              r={TILE_R}
              fill="none"
              strokeWidth={TILE_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${segment.length} ${circumference(TILE_R)}`}
              strokeDashoffset={segment.offset}
              transform={TILE_ROTATE}
            />
          ))
        )}
      </svg>
      <Icon size={14} />
    </span>
  );
}

/**
 * Topo do Hoje: anel de energia com os três macros por dentro e os tiles de água (com "+" de um
 * toque) e combinados. Tocar no anel alterna entre restantes e consumidas. Com calorias ocultas ou
 * sem meta, o anel vira "Seu dia" em três segmentos de presença, sem número de energia.
 */
export function DayHero({
  consumed,
  goal,
  hideCalories,
  macros,
  water,
  habits,
  meals,
  onWater,
  onWaterAdd,
  onHabits,
  onExplain,
}: Props) {
  const gradientId = useId();
  const [isShowingConsumed, setShowingConsumed] = useState(false);
  const ring = hideCalories ? null : energyRing(consumed, goal);
  const waterPercent = percentOf(water.ml, water.goal) ?? 0;
  const habitsPercent = percentOf(habits.done, habits.total) ?? 0;
  const mealsDone = Math.min(meals, MAIN_MEALS);
  const presence = [
    { key: "meals", percent: (mealsDone / MAIN_MEALS) * 100, stroke: "var(--wf-tone-food-fg)" },
    { key: "water", percent: waterPercent, stroke: "var(--wf-blue)" },
    { key: "habits", percent: habitsPercent, stroke: "var(--wf-tone-habit-fg)" },
  ];
  const center = !ring ? (
    <>
      <strong className="day-ring-word">Seu dia</strong>
      <span>{hideCalories ? `${mealsDone} de ${MAIN_MEALS} refeições` : `${fmtNumber(consumed)} kcal hoje`}</span>
    </>
  ) : isShowingConsumed ? (
    <>
      <strong className={isLong(consumed) ? "is-long" : undefined}>
        <CountUp value={consumed} />
      </strong>
      <span>kcal consumidas</span>
    </>
  ) : ring.reached ? (
    <>
      <strong className="day-ring-word">Meta do dia</strong>
      <span>alcançada</span>
    </>
  ) : (
    <>
      <strong className={isLong(ring.remaining) ? "is-long" : undefined}>
        <CountUp value={ring.remaining} />
      </strong>
      <span>kcal restantes</span>
    </>
  );
  const presenceLabel = `Seu dia: ${mealsDone} de ${MAIN_MEALS} refeições, água em ${waterPercent}% e combinados em ${habitsPercent}%`;
  const ringLabel = ring
    ? `${fmtNumber(consumed)} de ${fmtNumber(goal ?? 0)} kcal, ${ring.percent}% da meta`
    : hideCalories
      ? presenceLabel
      : `${presenceLabel}. ${fmtNumber(consumed)} kcal consumidas, sem meta definida`;
  const waterGoal = water.goal !== null ? ` de ${literNumber(water.goal)} L` : " L";
  const art = (
    <>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--wf-emerald)" />
            <stop offset="100%" stopColor="var(--wf-blue)" />
          </linearGradient>
        </defs>
        {ring ? (
          <Arc
            radius={ENERGY_RADIUS}
            percent={ring.percent}
            stroke={`url(#${gradientId})`}
            width={ENERGY_STROKE}
            track="is-energy"
          />
        ) : (
          <PresenceArcs parts={presence} />
        )}
        {macros.map((m, i) => (
          <Arc
            key={m.key}
            radius={MACRO_RADII[i]!}
            percent={m.percent ?? 0}
            stroke={`var(--wf-macro-${m.key})`}
            width={MACRO_STROKE}
            track={`is-${m.key}`}
          />
        ))}
      </svg>
      <div className="day-ring-center">{center}</div>
    </>
  );
  return (
    <section className="card day-hero stagger-1" aria-labelledby="day-hero-title">
      <h2 id="day-hero-title" className="sr-only">
        Seu dia
      </h2>
      <span className="sr-only" data-testid="calories-total">
        {hideCalories
          ? "Calorias ocultas"
          : `${fmtNumber(consumed)}${goal !== null ? ` / ${fmtNumber(goal)} kcal` : " kcal consumidas"}`}
      </span>
      {ring && (
        <button type="button" className="day-explain" aria-label="Como calculamos" title="Como calculamos" onClick={onExplain}>
          <Info size={18} aria-hidden="true" />
        </button>
      )}
      <div className="day-hero-grid">
        {ring ? (
          <button
            type="button"
            className="day-ring is-toggle"
            aria-label={`${ringLabel}. Mostrar kcal ${isShowingConsumed ? "restantes" : "consumidas"}`}
            onClick={() => setShowingConsumed(!isShowingConsumed)}
          >
            {art}
          </button>
        ) : (
          <div className="day-ring" role="img" aria-label={ringLabel}>
            {art}
          </div>
        )}
        <div className="day-tiles">
          <div className="day-tile water">
            <button
              type="button"
              className="day-tile-main"
              aria-label={`Água: ${literNumber(water.ml)}${waterGoal}. Registrar água`}
              onClick={onWater}
            >
              <span className="day-tile-head">
                <TileRing kind="water" percent={waterPercent} />
                <span className="day-tile-label">Água</span>
              </span>
              <strong>
                <CountUp value={water.ml} format={literNumber} />
                <small>{water.goal !== null ? ` / ${literNumber(water.goal)} L` : " L"}</small>
              </strong>
            </button>
            {onWaterAdd && (
              <button
                type="button"
                className="day-tile-add"
                aria-label={`Adicionar ${WATER_ADD_ML} ml de água`}
                onClick={() => onWaterAdd(WATER_ADD_ML)}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            )}
            <span className="sr-only" data-testid="water-total">
              {fmtNumber(water.ml)} ml
            </span>
          </div>
          <button type="button" className="day-tile habits" onClick={onHabits}>
            <span className="day-tile-head">
              <TileRing kind="habits" done={habits.done} total={habits.total} />
              <span className="day-tile-label">Combinados</span>
            </span>
            <strong>
              {habits.done}
              <small> de {habits.total}</small>
            </strong>
          </button>
        </div>
      </div>
      <MacroSummary macros={macros} />
    </section>
  );
}
