import { useId, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { localTime, shiftDate } from "../../lib/domain";
import { fmtShortDate } from "../../lib/format";
import { Field } from "../UI";

/** "Hoje · 08:30", "Ontem · 08:30" ou "Qui, 24 set · 08:30". */
export function whenLabel(date: string, time: string, today: string, separator = " · "): string {
  const day = date === today ? "Hoje" : date === shiftDate(today, -1) ? "Ontem" : fmtShortDate(date);
  return `${day}${separator}${time}`;
}

type Props = {
  date: string;
  time: string;
  today: string;
  onDate: (date: string) => void;
  onTime: (time: string) => void;
};

/** Quando: resumo em uma linha; "Alterar" revela Agora/Ontem, a data (até hoje) e o horário. */
export function WhenRow({ date, time, today, onDate, onTime }: Props) {
  const [isOpen, setOpen] = useState(false);
  const panelId = useId();
  const yesterday = shiftDate(today, -1);
  return (
    <div className="inj-when">
      <div className="inj-row">
        <CalendarClock size={18} aria-hidden="true" />
        <span className="inj-row-text">{whenLabel(date, time, today)}</span>
        <button type="button" className="inj-toggle" aria-label="Alterar data e horário" aria-expanded={isOpen}
          aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
          Alterar
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {isOpen && (
        <div id={panelId} className="inj-when-panel">
          <div className="quick-chips">
            <button type="button" className={`quick-chip ${date === today ? "on" : ""}`} aria-pressed={date === today}
              onClick={() => {
                onDate(today);
                onTime(localTime());
              }}>
              Agora
            </button>
            <button type="button" className={`quick-chip ${date === yesterday ? "on" : ""}`} aria-pressed={date === yesterday}
              onClick={() => onDate(yesterday)}>
              Ontem
            </button>
          </div>
          <div className="form-grid">
            <Field label="Data">
              <input type="date" required max={today} value={date} onChange={(e) => onDate(e.target.value)} />
            </Field>
            <Field label="Horário">
              <input type="time" required value={time} onChange={(e) => onTime(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
