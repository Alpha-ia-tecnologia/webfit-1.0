import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, Target } from "lucide-react";
import type { Question } from "../../data/questionnaire";
import type { Draft } from "../../types";
import { ChoiceCards } from "./ChoiceCards";
import { TermsModal } from "./TermsModal";

/**
 * "O que você já contou": objetivo e consentimento que chegaram do primeiro acesso viram um
 * resumo com "Alterar" e "Ler termos completos", em vez de serem perguntados de novo.
 */
export function KnownAnswers({
  keys,
  answers,
  goalField,
  consentField,
  error,
  reducedMotion,
  onChange,
}: {
  keys: readonly ("goal" | "consentLocal")[];
  answers: Draft;
  goalField?: Question;
  consentField?: Question;
  error?: string;
  reducedMotion: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const headingId = useId();
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const [isGoalOpen, setGoalOpen] = useState(false);
  const [isTermsOpen, setTermsOpen] = useState(false);
  const isExpanded = isGoalOpen || !!error;
  useEffect(() => {
    if (!shouldFocus.current || !isExpanded) return;
    shouldFocus.current = false;
    panel.current
      ?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
      ?.focus();
  }, [isExpanded]);
  const goal = String(answers.goal ?? "");
  const goalLabel =
    goalField?.options?.find(([value]) => value === goal)?.[1] ?? goal;
  return (
    <section
      className="known-answers"
      data-testid="anamnese-known"
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>O que você já contou</h3>
      {keys.includes("goal") && goalField && (
        <div className="known-item">
          <div className="known-row">
            <Target size={18} aria-hidden="true" />
            <p>
              <span>Objetivo</span>
              <strong>{goalLabel}</strong>
            </p>
            <button
              type="button"
              className="known-change"
              aria-label="Alterar objetivo"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={() => {
                shouldFocus.current = !isExpanded;
                setGoalOpen(!isExpanded);
              }}
            >
              Alterar
            </button>
          </div>
          <div
            ref={panel}
            id={panelId}
            className="known-panel"
            hidden={!isExpanded}
          >
            {isExpanded && (
              <ChoiceCards
                field={goalField}
                value={goal}
                error={error}
                reducedMotion={reducedMotion}
                onChange={(value) => onChange("goal", value)}
              />
            )}
          </div>
        </div>
      )}
      {keys.includes("consentLocal") && consentField && (
        <div className="known-row">
          <CircleCheck size={18} aria-hidden="true" />
          <p>
            <strong>Respostas salvas neste navegador</strong>
          </p>
          <button
            type="button"
            className="link-btn"
            onClick={() => setTermsOpen(true)}
          >
            Ler termos completos
          </button>
        </div>
      )}
      {isTermsOpen && consentField && (
        <TermsModal
          label={consentField.label}
          text={consentField.hint ?? ""}
          onClose={() => setTermsOpen(false)}
        />
      )}
    </section>
  );
}
