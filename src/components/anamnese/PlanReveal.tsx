import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import {
  CircleCheck,
  Coffee,
  EyeOff,
  GlassWater,
  Soup,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { canShowProjection } from "../../lib/anamnese-flow";
import { weightProjection } from "../../lib/body-metrics";
import { circumference } from "../../lib/charts";
import { DAY_POINTS, type DayPointKey } from "../../lib/day-timeline";
import { fmtNumber, fmtWater } from "../../lib/format";
import type { PenLastPreview } from "../../lib/pen-setup";
import {
  dayLine,
  HABITS_TEXT,
  HIDE_CALORIES_COPY,
  planCascade,
  planChecklist,
  planConsidered,
  planFirstName,
  PLAN_LOADER_STEP_MS,
  PLAN_LOADER_TEXT,
  PLAN_TITLES,
  planRingAria,
  planWater,
  PLATE_ARIA,
  PLATE_TEXT,
  strategyLabel,
  type PlanVariant,
} from "../../lib/plan-reveal";
import { macroShares } from "../../lib/space";
import type { Draft, Goals, Profile } from "../../types";
import { IconTile } from "../IconTile";
import { MacroColumns } from "../MacroColumns";
import { MiniPlate } from "../MiniPlate";
import { Pill } from "../Pill";
import { SegmentMeter } from "../SegmentMeter";
import { Celebration } from "./Celebration";
import { ProjectionCard } from "./ProjectionCard";
import "./PlanReveal.css";

/** Pausa depois da última linha do carregamento antes de mostrar o plano. */
const LOADER_TAIL_MS = 300;
const RING_SIZE = 112;
const RING_RADIUS = 50;
const MAX_GLASSES_SHOWN = 12;
/** Refeições da linha "Seu dia" (horários reais da anamnese; nunca um lanche inventado). */
const MEAL_POINTS: readonly { key: DayPointKey; icon: LucideIcon }[] = [
  { key: "breakfastTime", icon: Coffee },
  { key: "lunchTime", icon: Utensils },
  { key: "dinnerTime", icon: Soup },
];

type Props = {
  profile: Profile;
  goals: Goals;
  variant: PlanVariant;
  today: string;
  /** Carregamento "Montando seu plano inicial…" (só ao chegar pela etapa anterior). */
  animate: boolean;
  celebrate: boolean;
  /** Registro da última aplicação que acontecerá ao concluir; null quando não haverá. */
  pending: PenLastPreview | null;
  reducedMotion: boolean;
  /** "Ocultar números do corpo": sem projeção de peso. */
  bodyHidden: boolean;
  onAnimated: () => void;
  onCancelPen: () => void;
  onToggleHideCalories: () => void;
};

/**
 * "Seu plano inicial, Nome": o que o app vai fazer com as respostas. Completo (anel da meta, gasto ×
 * meta e macros), prato (sem calorias) ou de hábitos (perfil sensível ou menor de idade: sem números
 * de peso ou energia, sem projeção, sem confete). O carregamento pode ser pulado e nunca bloqueia a
 * conclusão. "Ocultar números de calorias" vem antes de qualquer número.
 */
export function PlanReveal({
  profile,
  goals,
  variant,
  today,
  animate,
  celebrate,
  pending,
  reducedMotion,
  bodyHidden,
  onAnimated,
  onCancelPen,
  onToggleHideCalories,
}: Props) {
  const [isLoading, setLoading] = useState(animate && !reducedMotion);
  const [shownLines, setShownLines] = useState(0);
  const wasLoading = useRef(isLoading);
  const focusTitle = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const onAnimatedRef = useRef(onAnimated);
  useEffect(() => {
    onAnimatedRef.current = onAnimated;
  });
  const lines = planChecklist(profile, variant);
  useEffect(() => {
    if (!isLoading) return;
    const timer =
      shownLines < lines.length
        ? setTimeout(() => setShownLines((n) => n + 1), PLAN_LOADER_STEP_MS)
        : setTimeout(() => setLoading(false), LOADER_TAIL_MS);
    return () => clearTimeout(timer);
  }, [isLoading, shownLines, lines.length]);
  useEffect(() => {
    if (isLoading || !wasLoading.current) return;
    wasLoading.current = false;
    onAnimatedRef.current();
    if (focusTitle.current) title.current?.focus();
    focusTitle.current = false;
  }, [isLoading]);
  const firstName = planFirstName(profile.name);
  const considered = planConsidered(profile);
  const projection =
    variant !== "habitos" &&
    !bodyHidden &&
    profile.targetWeight !== null &&
    canShowProjection(profile as unknown as Draft, today)
      ? weightProjection({
          current: profile.weight,
          target: profile.targetWeight,
          height: profile.height,
          goal: profile.goal,
          today,
        })
      : null;
  return (
    <section
      className={`card anamnese-start-card plan-reveal is-${variant}`}
      data-testid="plan-reveal"
      aria-labelledby="plan-title"
    >
      <Celebration
        active={celebrate && !isLoading}
        reducedMotion={reducedMotion}
      />
      <h3 id="plan-title" className="plan-title" ref={title} tabIndex={-1}>
        {PLAN_TITLES[variant]}
        {firstName && (
          <>
            ,<span className="plan-name"> {firstName}</span>
          </>
        )}
      </h3>
      {isLoading ? (
        <div className="plan-loader" data-testid="plan-loader">
          <p role="status">{PLAN_LOADER_TEXT}</p>
          <ul aria-label="O que usamos">
            {lines.slice(0, shownLines).map((line) => (
              <motion.li
                key={line}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
              >
                <CircleCheck size={16} aria-hidden="true" />
                {line}
              </motion.li>
            ))}
          </ul>
          <button
            type="button"
            className="text-btn"
            aria-label="Pular e ver o plano"
            onClick={(e) => {
              focusTitle.current = document.activeElement === e.currentTarget;
              setLoading(false);
            }}
          >
            Pular
          </button>
        </div>
      ) : (
        <>
          {considered.length > 0 && (
            <div className="plan-considered">
              <span className="plan-considered-label" id="plan-considered">
                Considerado:
              </span>
              <ul aria-labelledby="plan-considered">
                {considered.map((item) => (
                  <li key={item.text}>
                    <Pill tone="neutral" variant="outline" emoji={item.emoji}>
                      {item.text}
                    </Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {variant !== "habitos" && (
            <HideCaloriesRow
              checked={variant === "prato"}
              onToggle={onToggleHideCalories}
            />
          )}
          <PlanBody
            goals={goals}
            profile={profile}
            variant={variant}
            reducedMotion={reducedMotion}
          />
          <div className="plan-duo">
            <WaterCard goals={goals} />
            <DayLine profile={profile} />
          </div>
          {projection && profile.targetWeight !== null && (
            <ProjectionCard
              projection={projection}
              current={profile.weight}
              target={profile.targetWeight}
              goal={profile.goal}
              today={today}
              usesPen={profile.weightLossPen === "sim"}
            />
          )}
          {pending && (
            <div className="plan-pending">
              <p>Ao concluir, registramos no diário: {pending.text}</p>
              <button type="button" className="text-btn" onClick={onCancelPen}>
                Não registrar
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "Ocultar números de calorias": interruptor antes de qualquer número; troca completo ↔ prato. */
function HideCaloriesRow({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const hintId = useId();
  return (
    <label className="plan-hide-row">
      <IconTile tone="neutral" size="md" icon={EyeOff} />
      <span className="plan-hide-text">
        <strong>{HIDE_CALORIES_COPY.title}</strong>
        <small id={hintId}>{HIDE_CALORIES_COPY.hint}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        aria-describedby={hintId}
        onChange={onToggle}
      />
    </label>
  );
}

function PlanBody({
  profile,
  goals,
  variant,
  reducedMotion,
}: {
  profile: Profile;
  goals: Goals;
  variant: PlanVariant;
  reducedMotion: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const shares = macroShares(goals);
  const columns = shares?.map((share) => ({
    key: share.key,
    grams: share.grams,
    percent: share.percent,
  }));
  if (variant === "habitos")
    return (
      <div className="notice plan-habits">
        <p>{HABITS_TEXT}</p>
        {goals.reason && <p>{goals.reason}</p>}
      </div>
    );
  if (variant === "prato")
    return (
      <div className="plan-energy is-plate">
        <figure
          className="plan-plate"
          role="img"
          aria-label={PLATE_ARIA}
          data-testid="plan-plate"
        >
          <MiniPlate groups={["vegetais", "proteinas", "cereais"]} />
          <figcaption>{PLATE_TEXT}</figcaption>
        </figure>
        {columns && (
          <div
            className="plan-macros"
            aria-label="Macronutrientes por dia"
            role="group"
            data-testid="plan-macros"
          >
            <MacroColumns items={columns} />
          </div>
        )}
      </div>
    );
  const calories = goals.calories ?? 0;
  const cascade = planCascade(profile, goals);
  const visible = cascade?.filter((row) => row.key !== "basal") ?? [];
  const basal = cascade?.find((row) => row.key === "basal");
  const scale = Math.max(1, ...visible.map((row) => kcalOf(row.value)));
  const length = circumference(RING_RADIUS);
  const center = RING_SIZE / 2;
  const strategy = strategyLabel(goals);
  return (
    <div className="plan-energy">
      <div className="plan-energy-top">
        <div
          className="plan-ring"
          role="img"
          aria-label={planRingAria(calories)}
          data-testid="plan-ring"
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            focusable="false"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" className="plan-ring-stop-start" />
                <stop offset="1" className="plan-ring-stop-end" />
              </linearGradient>
            </defs>
            <circle
              className="plan-ring-track"
              cx={center}
              cy={center}
              r={RING_RADIUS}
            />
            <circle
              className={`plan-ring-value ${reducedMotion ? "" : "is-drawing"}`}
              cx={center}
              cy={center}
              r={RING_RADIUS}
              stroke={`url(#${gradientId})`}
              strokeDasharray={length}
              strokeDashoffset={0}
              transform={`rotate(-90 ${center} ${center})`}
              style={{ "--ring-length": length } as CSSProperties}
            />
          </svg>
          <span className="plan-ring-center">
            <strong>{fmtNumber(calories)}</strong>
            <span>kcal por dia</span>
          </span>
        </div>
        <div className="plan-energy-side">
          {strategy && (
            <Pill tone="food" size="sm" className="plan-strategy">
              {strategy}
            </Pill>
          )}
          {visible.length > 0 && (
            <ol
              className="plan-cascade"
              aria-label="Como chegamos à meta"
              data-testid="plan-cascade"
            >
              {visible.map((row) => (
                <li key={row.key} className={`is-${row.key}`}>
                  <span className="pc-label">{row.label}</span>
                  <strong>
                    {fmtNumber(kcalOf(row.value))}
                    <span className="sr-only"> kcal</span>
                  </strong>
                  <SegmentMeter
                    mode="bar"
                    value={kcalOf(row.value)}
                    total={scale}
                    tone={row.key === "meta" ? "gradient" : "neutral"}
                    className="pc-bar"
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {shares && columns && (
        <div className="plan-macros-block">
          <div className="plan-macro-bar" aria-hidden="true">
            {shares.map((share) => (
              <span
                key={share.key}
                className={share.key}
                style={{ flexGrow: share.percent }}
              />
            ))}
          </div>
          <div
            className="plan-macros"
            role="group"
            aria-label="Macronutrientes por dia"
            data-testid="plan-macros"
          >
            <MacroColumns items={columns} showPercent />
          </div>
        </div>
      )}
      {(basal || goals.note) && (
        <details className="plan-how">
          <summary>Como calculamos</summary>
          {basal && (
            <p>
              <strong>{basal.label}</strong>: {basal.value}, {basal.detail}.
            </p>
          )}
          {cascade
            ?.filter((row) => row.key !== "basal")
            .map((row) => (
              <p key={row.key}>
                <strong>{row.label}</strong>: {row.value}, {row.detail}.
              </p>
            ))}
          <p>{goals.source}</p>
          {goals.note && <p>{goals.note}</p>}
        </details>
      )}
    </div>
  );
}

/** "1.958 kcal" → 1958 (a cascata guarda o texto formatado). */
function kcalOf(value: string): number {
  return Number(value.replace(/\D/g, "")) || 0;
}

/** Água do dia: litros em destaque e copos de 250 ml (sem meta, o aviso no lugar). */
function WaterCard({ goals }: { goals: Goals }) {
  const water = planWater(goals);
  if (!water || goals.water === null)
    return (
      <div className="plan-water is-empty">
        <p className="hint">Meta de água ainda não informada.</p>
      </div>
    );
  return (
    <div
      className="plan-water"
      role="img"
      aria-label={water.aria}
      data-testid="plan-water"
    >
      <strong>{fmtWater(goals.water)}</strong>
      <span className="plan-water-label">água por dia</span>
      <span className="plan-glasses">
        {Array.from(
          { length: Math.min(water.glasses, MAX_GLASSES_SHOWN) },
          (_, i) => (
            <GlassWater key={i} size={18} />
          ),
        )}
        {water.glasses > MAX_GLASSES_SHOWN && (
          <span>+{water.glasses - MAX_GLASSES_SHOWN}</span>
        )}
      </span>
    </div>
  );
}

/** "Seu dia": café, almoço e jantar nos horários da anamnese, com o acordar e o dormir embaixo. */
function DayLine({ profile }: { profile: Profile }) {
  const line = dayLine(profile);
  const timeOf = (key: DayPointKey) =>
    line.items.find((item) => item.key === key)?.time ?? "";
  const shortOf = (key: DayPointKey) =>
    DAY_POINTS.find((point) => point.key === key)?.short ?? "";
  return (
    <div
      className="plan-day"
      role="img"
      aria-label={line.aria}
      data-testid="plan-day"
    >
      <span className="plan-day-eyebrow">Seu dia</span>
      <ol className="plan-day-list">
        {MEAL_POINTS.map(({ key, icon: Icon }) => (
          <li key={key}>
            <span className="plan-day-node">
              <Icon size={18} />
            </span>
            <strong>{timeOf(key)}</strong>
            <span>{shortOf(key)}</span>
          </li>
        ))}
      </ol>
      <span className="plan-day-caption">
        Acorda {timeOf("wakeTime")} · dorme {timeOf("sleepTime")}
      </span>
    </div>
  );
}
