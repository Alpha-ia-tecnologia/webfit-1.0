import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Question } from "../../data/questionnaire";
import { CONSENT_DETAILS } from "../../data/anamneseOptions";
import { TermsModal } from "./TermsModal";

type ConsentKey = keyof typeof CONSENT_DETAILS;
const isConsent = (key: string): key is ConsentKey => key in CONSENT_DETAILS;

/**
 * Perguntas de sim/não como interruptor (checkbox nativo estilizado). Nos consentimentos,
 * o texto integral vira "Ler termos completos" e a tela mostra só pontos curtos e, na IA,
 * o caminho dos dados até os provedores.
 */
export function SwitchField({
  field,
  checked,
  error,
  onChange,
}: {
  field: Question;
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
}) {
  const [isTermsOpen, setTermsOpen] = useState(false);
  const id = `anamnese-${field.key}`;
  const details = isConsent(field.key) ? CONSENT_DETAILS[field.key] : null;
  const hint = details ? undefined : field.hint;
  const hasFlow = !!(details?.sends && details.to);
  const describedBy = [
    hasFlow ? `${id}-flow` : null,
    details ? `${id}-points` : null,
    hint || error ? `${id}-help` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={`switch-field ${checked ? "is-checked" : ""} ${details ? "is-consent" : ""}`}
    >
      <label className="switch-row">
        <span className="switch-label">{field.label}</span>
        <input
          id={id}
          type="checkbox"
          className="switch"
          name={field.key}
          checked={checked}
          required={field.key === "consentLocal"}
          aria-invalid={!!error}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {hasFlow && details?.sends && details.to && (
        <div id={`${id}-flow`} className="consent-flow">
          <div>
            <span className="consent-flow-caption">Pode ir</span>
            <ul aria-label="Pode ser enviado">
              {details.sends.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <ArrowRight
            className="consent-flow-arrow"
            size={18}
            aria-hidden="true"
          />
          <div>
            <span className="consent-flow-caption">Para</span>
            <ul aria-label="Provedores de IA" className="is-providers">
              {details.to.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {details && (
        <ul id={`${id}-points`} className="consent-points">
          {details.points.map((point) => (
            <li key={point}>
              <Check size={14} aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
      )}
      {details && field.hint && (
        <button
          type="button"
          className="link-btn"
          onClick={() => setTermsOpen(true)}
        >
          Ler termos completos
        </button>
      )}
      {(hint || error) && (
        <p
          id={`${id}-help`}
          className={error ? "field-error" : "hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
      {isTermsOpen && (
        <TermsModal
          label={field.label}
          text={field.hint ?? ""}
          onClose={() => setTermsOpen(false)}
        />
      )}
    </div>
  );
}
