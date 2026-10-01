import { Minus, Plus } from "lucide-react";
import { toNumber } from "./inputs";
import type { StepperConfig } from "../../data/anamneseOptions";
import { OptionalTag } from "./OptionalTag";

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string | number | null;
  config: StepperConfig;
  onChange: (value: string) => void;
};

/** Inteiros pequenos: chips rápidos e botões de menos e mais, sem digitação. */
export function Stepper({
  id,
  name,
  label,
  hint,
  error,
  optional,
  value,
  config,
  onChange,
}: Props) {
  const numeric = toNumber(value);
  const current = numeric ?? config.initial;
  const helpId = hint || error ? `${id}-help` : undefined;
  const set = (next: number) =>
    onChange(String(Math.min(config.max, Math.max(config.min, next))));
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o CSS de erro e o foco no primeiro campo inválido (ScreenAnamnese) leem este aria-invalid
    <div
      className="q-block"
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={helpId}
      aria-invalid={!!error}
      data-field={name}
      tabIndex={-1}
    >
      <div className="q-head">
        <span id={`${id}-label`} className="q-label">
          {label}
          {optional && <OptionalTag />}
        </span>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Diminuir ${config.step} ${config.unit}`}
          disabled={current <= config.min}
          onClick={() => set(current - config.step)}
        >
          <Minus size={18} />
        </button>
        <div className={`stepper-value ${numeric === null ? "empty" : ""}`}>
          <strong>{numeric === null ? "—" : numeric}</strong>
          <span>{config.unit}</span>
        </div>
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Aumentar ${config.step} ${config.unit}`}
          disabled={current >= config.max}
          onClick={() =>
            set(numeric === null ? config.initial : current + config.step)
          }
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="quick-chips center">
        {config.quick.map((option) => (
          <button
            key={option}
            type="button"
            className={`quick-chip ${numeric === option ? "on" : ""}`}
            aria-pressed={numeric === option}
            onClick={() => set(option)}
          >
            {option}
            {config.quickLabels?.[option] && (
              <small>{config.quickLabels[option]}</small>
            )}
          </button>
        ))}
      </div>
      <input
        className="q-mirror"
        name={name}
        type="number"
        min={config.min}
        max={config.max}
        step={config.step}
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {helpId && (
        <p
          id={helpId}
          className={error ? "field-error" : "hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
