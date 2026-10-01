import { useEffect, useId, useMemo, useRef, useState } from "react";
import { RULER_FIELDS } from "../../data/anamneseOptions";
import { isSensitiveDraft } from "../../lib/anamnese-flow";
import {
  draftGoalProfile,
  draftGoals,
  goalsCoherence,
  recommendedModel,
} from "../../lib/goal-editor";
import type { Draft } from "../../types";
import { CoherenceChip } from "./CoherenceChip";
import { MacroSplitEditor } from "./MacroSplitEditor";
import { Ruler } from "./Ruler";

const MANUAL_KEYS = [
  "manualCalories",
  "manualProtein",
  "manualCarbs",
  "manualFat",
] as const;
const KCAL_LABEL = "Meta calórica informada (kcal/dia)";
const RULER_STEP = 25;

const isEmpty = (value: Draft[string] | undefined) =>
  String(value ?? "").trim() === "";

/**
 * "Recomendado para você": a meta que o app estimou pela anamnese (ou a informada) num cartão,
 * e um só editor para quem quer personalizar (energia e divisão dos macros). Os campos espelho
 * das quatro metas ficam sempre no DOM, aberto ou fechado.
 */
export function GoalsWidget({
  answers,
  errors,
  today,
  onChange,
}: {
  answers: Draft;
  errors: Record<string, string>;
  today: string;
  onChange: (key: string, value: string) => void;
}) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const [isOpen, setOpen] = useState(false);
  const hide = answers.hideCalories === true;
  const goals = draftGoals(answers, today);
  const profile = draftGoalProfile(answers);
  const hasError = MANUAL_KEYS.some((key) => errors[key]);
  const isExpanded = isOpen || hasError;
  const recommended = goals?.calories ?? null;
  const kcalConfig = useMemo(() => {
    const base = RULER_FIELDS.manualCalories;
    if (recommended === null) return base;
    const rounded = Math.round(recommended / RULER_STEP) * RULER_STEP;
    return {
      ...base,
      initial: Math.min(base.max, Math.max(base.min, rounded)),
    };
  }, [recommended]);
  useEffect(() => {
    if (!shouldFocus.current || !isExpanded) return;
    shouldFocus.current = false;
    // Energia primeiro; com "Ocultar calorias", a primeira alça da divisão.
    panel.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }, [isExpanded]);
  const mirrors = MANUAL_KEYS.filter(
    (key) => !(hide && key === "manualCalories"),
  ).map((key) => (
    <input
      key={key}
      className="q-mirror"
      name={key}
      type="number"
      tabIndex={-1}
      aria-hidden="true"
      value={String(answers[key] ?? "")}
      onChange={(e) => onChange(key, e.target.value)}
    />
  ));
  const root = {
    className: "goals-widget",
    "data-testid": "goals-recommended",
    "data-field": "manualProtein",
    "aria-invalid": hasError,
    tabIndex: -1,
  } as const;
  if (!goals || !profile)
    return (
      <section {...root}>
        <p className="hint">
          Complete as etapas anteriores para ver a recomendação.
        </p>
        {mirrors}
      </section>
    );
  const model = recommendedModel(profile, goals, hide, isSensitiveDraft(answers));
  const coherence = goalsCoherence(profile, goals, hide);
  const hasManual = MANUAL_KEYS.some((key) => !isEmpty(answers[key]));
  const errorKeys = MANUAL_KEYS.filter((key) => errors[key]);
  return (
    <section {...root}>
      <span className="goals-origin">{model.origin}</span>
      {model.calories && (
        <p className="goals-kcal">
          <strong>{model.calories}</strong> <span>kcal por dia</span>
        </p>
      )}
      {model.macros && (
        <ul className="goals-macros" aria-label="Macronutrientes por dia">
          {model.macros.map((macro) => (
            <li key={macro.key} className={macro.key}>
              <i aria-hidden="true" />
              {macro.label} {macro.grams}
            </li>
          ))}
        </ul>
      )}
      <p className="goals-water">
        Água: {model.water ?? "você define abaixo"}
      </p>
      {model.reason && <p className="goals-reason">{model.reason}</p>}
      <button
        type="button"
        className="btn-secondary goals-toggle"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => {
          shouldFocus.current = !isExpanded;
          setOpen(!isExpanded);
        }}
      >
        {model.actionLabel}
      </button>
      <div
        ref={panel}
        id={panelId}
        className="goals-panel"
        hidden={!isExpanded}
      >
        {isExpanded && (
          <>
            {!hide && (
              <Ruler
                id="anamnese-manualCalories"
                name="manualCalories"
                label={KCAL_LABEL}
                error={errors.manualCalories}
                value={(answers.manualCalories ?? "") as string | number}
                config={kcalConfig}
                hasMirror={false}
                onChange={(value) => onChange("manualCalories", value)}
              />
            )}
            <MacroSplitEditor
              goals={goals}
              hide={hide}
              onChange={(grams) => {
                onChange("manualProtein", String(grams.protein));
                onChange("manualCarbs", String(grams.carbs));
                onChange("manualFat", String(grams.fat));
              }}
            />
            {coherence && (
              <CoherenceChip
                testId="goals-coherence"
                text={coherence.text}
                actionLabel={coherence.fixLabel}
                onAction={() => {
                  onChange("manualProtein", String(coherence.fix.manualProtein));
                  onChange("manualCarbs", String(coherence.fix.manualCarbs));
                  onChange("manualFat", String(coherence.fix.manualFat));
                }}
              />
            )}
            {/* A régua mostra o erro da energia; os macros não têm controle próprio. */}
            {errorKeys
              .filter((key) => key !== "manualCalories")
              .map((key) => (
                <p key={key} className="field-error" role="alert">
                  {errors[key]}
                </p>
              ))}
            {hasManual && (
              <button
                type="button"
                className="text-btn"
                onClick={() => MANUAL_KEYS.forEach((key) => onChange(key, ""))}
              >
                Voltar ao recomendado
              </button>
            )}
          </>
        )}
      </div>
      {mirrors}
    </section>
  );
}
