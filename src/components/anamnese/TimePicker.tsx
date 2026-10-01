import { useState } from "react";
import { WheelPicker } from "./WheelPicker";
import { joinTime, minuteOptions, splitTime } from "./inputs";

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  presets: string[];
  /** false: um controle composto já desenha o campo espelho deste nome (um só por nome). */
  hasMirror?: boolean;
  onChange: (value: string) => void;
};

const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: String(h).padStart(2, "0"),
}));

/** Horário em chips sugeridos mais "Outro horário" com rodas de hora e minuto. */
export function TimePicker({
  id,
  name,
  label,
  hint,
  error,
  value,
  presets,
  hasMirror = true,
  onChange,
}: Props) {
  const parsed = splitTime(value);
  const normalized = parsed ? joinTime(parsed.hour, parsed.minute) : "";
  const isCustom = normalized !== "" && !presets.includes(normalized);
  const [showWheels, setShowWheels] = useState(isCustom);
  const helpId = hint || error ? `${id}-help` : undefined;
  const base = parsed ?? { hour: 8, minute: 0 };
  const minutes = minuteOptions(MINUTE_STEP, parsed?.minute ?? null).map(
    (m) => ({ value: m, label: String(m).padStart(2, "0") }),
  );
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
        </span>
        <span className={`q-value ${normalized ? "" : "empty"}`}>
          {normalized || "Toque para escolher"}
        </span>
      </div>
      <div className="quick-chips">
        {presets.map((time) => (
          <button
            key={time}
            type="button"
            className={`quick-chip ${normalized === time ? "on" : ""}`}
            aria-pressed={normalized === time}
            onClick={() => {
              setShowWheels(false);
              onChange(time);
            }}
          >
            {time}
          </button>
        ))}
        <button
          type="button"
          className={`quick-chip ${showWheels ? "on" : ""}`}
          aria-pressed={showWheels}
          onClick={() => setShowWheels(true)}
        >
          Outro horário
        </button>
      </div>
      {showWheels && (
        <div className="wheels time">
          <WheelPicker
            label={`${label}: hora`}
            items={HOURS}
            value={parsed?.hour ?? null}
            onChange={(hour) => onChange(joinTime(hour, base.minute))}
          />
          <span className="wheel-colon" aria-hidden="true">
            :
          </span>
          <WheelPicker
            label={`${label}: minutos`}
            items={minutes}
            value={parsed?.minute ?? null}
            onChange={(minute) => onChange(joinTime(base.hour, minute))}
          />
        </div>
      )}
      {hasMirror && (
        <input
          className="q-mirror"
          name={name}
          type="time"
          step={60}
          tabIndex={-1}
          aria-hidden="true"
          value={normalized}
          onChange={(e) => onChange(e.target.value.slice(0, 5))}
        />
      )}
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
