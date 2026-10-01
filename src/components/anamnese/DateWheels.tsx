import { useState } from "react";
import { WheelPicker } from "./WheelPicker";
import { daysInMonth, joinDate, MONTHS_PT, splitDate } from "./inputs";
import { localDate, shiftDate } from "../../lib/domain";

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  minYear: number;
  maxYear: number;
  /** Data usada para posicionar as rodas enquanto o campo está vazio. */
  initial: string;
  /** Exibe atalhos "Hoje" e "Ontem" antes das rodas. */
  quick?: boolean;
  onChange: (value: string) => void;
};

const longDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Data em três rodas (dia, mês, ano) com atalhos opcionais e campo espelho nativo. */
export function DateWheels({
  id,
  name,
  label,
  hint,
  error,
  value,
  minYear,
  maxYear,
  initial,
  quick,
  onChange,
}: Props) {
  const parsed = splitDate(value);
  const base = parsed ??
    splitDate(initial) ?? { year: maxYear, month: 1, day: 1 };
  const today = localDate();
  const yesterday = shiftDate(today, -1);
  const isCustom =
    quick && value !== "" && value !== today && value !== yesterday;
  const [showWheels, setShowWheels] = useState(!quick || isCustom);
  const helpId = hint || error ? `${id}-help` : undefined;
  const set = (part: Partial<typeof base>) => {
    const next = { ...base, ...part };
    onChange(joinDate(next.year, next.month, next.day));
  };
  const days = Array.from(
    { length: daysInMonth(base.year, base.month) },
    (_, i) => ({ value: i + 1, label: String(i + 1) }),
  );
  const months = MONTHS_PT.map((month, i) => ({ value: i + 1, label: month }));
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({
    value: maxYear - i,
    label: String(maxYear - i),
  }));
  const wheelsOpen = !quick || showWheels;
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
        <span className={`q-value ${parsed ? "" : "empty"}`}>
          {parsed ? longDate(value) : "Role para escolher"}
        </span>
      </div>
      {quick && (
        <div className="quick-chips">
          {[
            ["Hoje", today],
            ["Ontem", yesterday],
          ].map(([text, date]) => (
            <button
              key={date}
              type="button"
              className={`quick-chip ${value === date ? "on" : ""}`}
              aria-pressed={value === date}
              onClick={() => {
                setShowWheels(false);
                onChange(date);
              }}
            >
              {text}
            </button>
          ))}
          <button
            type="button"
            className={`quick-chip ${wheelsOpen ? "on" : ""}`}
            aria-pressed={wheelsOpen}
            onClick={() => setShowWheels(true)}
          >
            Outra data
          </button>
        </div>
      )}
      {wheelsOpen && (
        <div className="wheels">
          <WheelPicker
            label={`${label}: dia`}
            items={days}
            value={parsed?.day ?? null}
            onChange={(day) => set({ day })}
          />
          <WheelPicker
            label={`${label}: mês`}
            items={months}
            value={parsed?.month ?? null}
            onChange={(month) => set({ month })}
          />
          <WheelPicker
            label={`${label}: ano`}
            items={years}
            value={parsed?.year ?? null}
            onChange={(year) => set({ year })}
          />
        </div>
      )}
      <input
        className="q-mirror"
        name={name}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
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
