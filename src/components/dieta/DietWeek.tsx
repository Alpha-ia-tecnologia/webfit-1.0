import { useId } from "react";
import { PLAN_DAY_COPY, type WeekDay } from "../../lib/diet-week";
import { useRadioKeys } from "../useRadioKeys";

/**
 * "Semana do plano" (IA-X5): seg a dom da semana atual; o ponto marca os dias que usam as trocas
 * revisadas. Escolher outro dia mostra a prévia daquele dia (registrar, só no próprio dia). Fica
 * depois da linha do tempo, com o título "Outros dias do plano" (o grupo segue "Semana do plano").
 */
export function DietWeek({
  days,
  value,
  onChange,
}: {
  days: readonly WeekDay[];
  value: string;
  onChange: (date: string) => void;
}) {
  const titleId = useId();
  const keys = useRadioKeys(
    days.map((day) => day.date),
    value,
    onChange,
  );
  return (
    <section className="diet-week" data-testid="diet-week" aria-labelledby={titleId}>
      <h2 id={titleId} className="diet-week-title">
        {PLAN_DAY_COPY.otherDays}
      </h2>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div
        className="diet-week-days"
        role="radiogroup"
        aria-label={PLAN_DAY_COPY.week}
        onKeyDown={keys.onKeyDown}
      >
        {days.map((day) => {
          const isChecked = day.date === value;
          return (
            <button
              key={day.date}
              type="button"
              role="radio"
              aria-checked={isChecked}
              aria-label={day.aria}
              tabIndex={keys.tabIndex(day.date)}
              className={`diet-week-day${day.isToday ? " is-today" : ""}`}
              onClick={() => onChange(day.date)}
            >
              <span className="diet-week-letter" aria-hidden="true">
                {day.letter}
              </span>
              <span className="diet-week-num" aria-hidden="true">
                {day.day}
              </span>
              <span
                className={`diet-week-dot${day.hasVariation ? " is-on" : ""}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <p className="diet-week-legend">{PLAN_DAY_COPY.legend}</p>
    </section>
  );
}
