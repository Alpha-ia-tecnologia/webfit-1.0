import { useState } from "react";
import { Apple, ChevronDown, Coffee, Moon, MoonStar, Sun, type LucideIcon } from "lucide-react";
import { Field, Modal } from "../UI";
import { MEAL_CATEGORIES } from "../../lib/meals";
import { localDate, shiftDate } from "../../lib/domain";

const ICONS: Record<string, LucideIcon> = {
  "Café da manhã": Coffee,
  Almoço: Sun,
  Lanche: Apple,
  Jantar: Moon,
  Ceia: MoonStar,
};

function dayLabel(day: string): string {
  const today = localDate();
  if (day === today) return "Hoje";
  if (day === shiftDate(today, -1)) return "Ontem";
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/**
 * "Jantar ⌄ │ Hoje, 19:30" no centro do cabeçalho (conceito 02): toque para trocar o tipo, a data
 * ou o horário da refeição. A folha abre fora do cabeçalho (o Modal vai para o <body>).
 */
export function MealPill({
  category,
  day,
  time,
  onChange,
}: {
  category: string;
  day: string;
  time: string;
  onChange: (next: { category?: string; day?: string; time?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[category] ?? Sun;
  return (
    <>
      <button
        type="button"
        className="meal-pill"
        aria-haspopup="dialog"
        aria-label={`${category}, ${dayLabel(day)}, ${time} — alterar tipo, data ou horário`}
        onClick={() => setOpen(true)}
      >
        <span className="meal-pill-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="meal-pill-type">{category}</span>
        <ChevronDown className="meal-pill-chevron" size={16} aria-hidden="true" />
        <span className="meal-pill-when">
          {dayLabel(day)}, {time}
        </span>
      </button>
      {open && (
        <Modal title="Quando foi a refeição?" onClose={() => setOpen(false)}>
          <div className="stack">
            <div className="meal-type-chips" role="group" aria-label="Tipo de refeição">
              {MEAL_CATEGORIES.map((c) => {
                const TypeIcon = ICONS[c] ?? Sun;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={c === category}
                    onClick={() => onChange({ category: c })}
                  >
                    <TypeIcon size={16} aria-hidden="true" />
                    {c}
                  </button>
                );
              })}
            </div>
            <div className="form-grid">
              <Field label="Data">
                <input
                  type="date"
                  required
                  max={localDate()}
                  value={day}
                  // Campo apagado não vale: a refeição mantém a data anterior.
                  onChange={(e) => e.target.value && onChange({ day: e.target.value })}
                />
              </Field>
              <Field label="Horário">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => e.target.value && onChange({ time: e.target.value })}
                />
              </Field>
            </div>
            <button type="button" className="btn btn-wide" onClick={() => setOpen(false)}>
              Pronto
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
