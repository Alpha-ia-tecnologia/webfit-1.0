import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Coffee,
  Moon,
  Soup,
  Sun,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { STEPPER_FIELDS, TIME_PRESETS } from "../../data/anamneseOptions";
import type { Question } from "../../data/questionnaire";
import {
  DAY_POINTS,
  DAY_SPAN,
  dayPointAtPercent,
  dayTimelineModel,
  moveDayPoint,
  PAGE_STEP,
  sleepMismatch,
  TIME_STEP,
  type DayPoint,
  type DayPointKey,
} from "../../lib/day-timeline";
import { tapFeedback } from "../../lib/haptics";
import type { Draft } from "../../types";
import { Modal } from "../UI";
import { CoherenceChip } from "./CoherenceChip";
import { Stepper } from "./Stepper";
import { TimePicker } from "./TimePicker";

const ICONS: Record<DayPoint["icon"], LucideIcon> = {
  sun: Sun,
  coffee: Coffee,
  utensils: Utensils,
  soup: Soup,
  moon: Moon,
};
/** Acordar e dormir ficam acima da trilha; as refeições, abaixo (evita colisões). */
const TOP_ROW: ReadonlySet<DayPointKey> = new Set(["wakeTime", "sleepTime"]);
const KEY_DELTA: Readonly<Record<string, number>> = {
  ArrowLeft: -TIME_STEP,
  ArrowDown: -TIME_STEP,
  ArrowRight: TIME_STEP,
  ArrowUp: TIME_STEP,
  PageDown: -PAGE_STEP,
  PageUp: PAGE_STEP,
  // Home/End vão aos limites dos vizinhos: moveDayPoint prende o salto à janela.
  Home: -DAY_SPAN,
  End: DAY_SPAN,
};
const TIMELINE_KEYS = [...DAY_POINTS.map((p) => p.key), "sleepHours"] as const;

/**
 * Linha do dia (05:00 à 01:00): acordar, refeições e dormir como pontos arrastáveis, com as
 * horas de sono derivadas. Os botões da legenda abrem o horário de cada ponto; quando os
 * horários passam da madrugada, só a legenda fica (sem pontos arrastáveis).
 */
export function DayTimeline({
  answers,
  errors,
  fields,
  labelledBy,
  onChange,
}: {
  answers: Draft;
  errors: Record<string, string>;
  fields: Question[];
  labelledBy: string;
  onChange: (key: string, value: string) => void;
}) {
  const model = dayTimelineModel(answers);
  const mismatch = sleepMismatch(answers);
  const inner = useRef<HTMLDivElement>(null);
  const dragging = useRef<DayPointKey | null>(null);
  const [active, setActive] = useState<DayPointKey | null>(null);
  const [sheet, setSheet] = useState<DayPointKey | null>(null);
  const meals = fields.find((f) => f.key === "mealsPerDay");
  const labelOf = (key: string) =>
    fields.find((f) => f.key === key)?.label ?? key;
  const errorKeys = TIMELINE_KEYS.filter((key) => errors[key]);
  const isFilled = model.points.every((p) => p.time !== "");
  const commit = (key: DayPointKey, next: string) => {
    if (next === String(answers[key] ?? "").slice(0, 5)) return;
    // Um toque por passo de 15 minutos, não por evento de ponteiro.
    tapFeedback();
    onChange(key, next);
  };
  const onKeyDown = (key: DayPointKey) => (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = KEY_DELTA[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    commit(key, moveDayPoint(answers, key, delta));
  };
  const onPointerDown =
    (key: DayPointKey) => (e: PointerEvent<HTMLDivElement>) => {
      dragging.current = key;
      setActive(key);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.focus();
    };
  const onPointerMove =
    (key: DayPointKey) => (e: PointerEvent<HTMLDivElement>) => {
      const rect = inner.current?.getBoundingClientRect();
      if (dragging.current !== key || !rect || rect.width <= 0) return;
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      commit(key, dayPointAtPercent(answers, key, percent));
    };
  const endDrag = () => {
    dragging.current = null;
    setActive(null);
  };
  const sheetPoint = DAY_POINTS.find((p) => p.key === sheet);
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o CSS de erro e o foco no primeiro campo inválido (ScreenAnamnese) leem este aria-invalid
    <div
      className="day-timeline"
      data-testid="day-timeline"
      role="group"
      aria-labelledby={labelledBy}
      data-field="wakeTime"
      aria-invalid={errorKeys.length > 0}
      tabIndex={-1}
    >
      {model.isLinear ? (
        <div className="dt-track">
          <div ref={inner} className="dt-inner">
            <div className="dt-bar" aria-hidden="true">
              {model.nightBands.map((band) => (
                <span
                  key={band.from}
                  className="dt-night"
                  style={{
                    left: `${band.from}%`,
                    width: `${band.to - band.from}%`,
                  }}
                />
              ))}
              {model.ticks.map((tick, i) => (
                <span
                  key={tick.label + i}
                  className={`dt-tick ${i === 0 ? "is-first" : i === model.ticks.length - 1 ? "is-last" : ""}`}
                  style={{ left: `${tick.percent}%` }}
                >
                  {/* Marca a cada 2 h; rótulo a cada 4 h para caber em 320 px. */}
                  {i % 2 === 0 ? tick.label : ""}
                </span>
              ))}
            </div>
            {model.points.map((point, i) => {
              if (point.percent === null) return null;
              const Icon = ICONS[DAY_POINTS[i].icon];
              const offset = Math.round((point.percent / 100) * DAY_SPAN);
              return (
                <div
                  key={point.key}
                  className={`dt-handle ${TOP_ROW.has(point.key) ? "is-top" : "is-bottom"} ${active === point.key ? "is-active" : ""}`}
                  style={{ left: `${point.percent}%` }}
                  role="slider"
                  tabIndex={0}
                  aria-label={point.label}
                  aria-valuemin={0}
                  aria-valuemax={DAY_SPAN}
                  aria-valuenow={offset}
                  aria-valuetext={point.time}
                  onKeyDown={onKeyDown(point.key)}
                  onPointerDown={onPointerDown(point.key)}
                  onPointerMove={onPointerMove(point.key)}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span className="dt-handle-dot" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="dt-note">
          {isFilled
            ? "Seus horários passam da madrugada: ajuste cada um pelos botões abaixo."
            : "Escolha cada horário pelos botões abaixo."}
        </p>
      )}
      <div className="dt-legend">
        {model.points.map((point) => {
          const shown = point.time || "—";
          return (
            <button
              key={point.key}
              type="button"
              className={`dt-legend-btn ${point.time ? "" : "is-empty"}`}
              aria-label={`${point.short} ${point.time || "sem horário"}, alterar horário`}
              onClick={() => setSheet(point.key)}
            >
              {point.short} <strong>{shown}</strong>
            </button>
          );
        })}
      </div>
      {model.sleep && (
        <p className="dt-summary" data-testid="sleep-summary">
          {model.sleep.text}
        </p>
      )}
      {mismatch && (
        <CoherenceChip
          testId="sleep-coherence"
          text={mismatch.text}
          actionLabel={mismatch.actionLabel}
          onAction={() => onChange("sleepHours", String(mismatch.derived))}
        />
      )}
      {errorKeys.map((key) => (
        <p key={key} className="field-error" role="alert">
          {labelOf(key)}: {errors[key]}
        </p>
      ))}
      <Stepper
        id="anamnese-mealsPerDay"
        name="mealsPerDay"
        label={meals?.label ?? "Refeições por dia"}
        hint={meals?.hint}
        error={errors.mealsPerDay}
        value={(answers.mealsPerDay ?? "") as string | number}
        config={STEPPER_FIELDS.mealsPerDay}
        onChange={(value) => onChange("mealsPerDay", value)}
      />
      <p className="hint">Arraste os pontos ou toque num horário para ajustar.</p>
      {DAY_POINTS.map((point) => (
        <input
          key={point.key}
          className="q-mirror"
          name={point.key}
          type="time"
          step={60}
          tabIndex={-1}
          aria-hidden="true"
          value={String(answers[point.key] ?? "").slice(0, 5)}
          onChange={(e) => onChange(point.key, e.target.value.slice(0, 5))}
        />
      ))}
      <input
        className="q-mirror"
        name="sleepHours"
        type="number"
        min={0}
        max={24}
        step={0.5}
        tabIndex={-1}
        aria-hidden="true"
        value={String(answers.sleepHours ?? "")}
        onChange={(e) => onChange("sleepHours", e.target.value)}
      />
      {sheetPoint && (
        <Modal title={sheetPoint.label} onClose={() => setSheet(null)}>
          <TimePicker
            id={`anamnese-sheet-${sheetPoint.key}`}
            name={sheetPoint.key}
            label="Horário"
            value={String(answers[sheetPoint.key] ?? "").slice(0, 5)}
            presets={TIME_PRESETS[sheetPoint.key] ?? []}
            hasMirror={false}
            onChange={(value) => onChange(sheetPoint.key, value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => setSheet(null)}
          >
            Concluir
          </button>
        </Modal>
      )}
    </div>
  );
}
