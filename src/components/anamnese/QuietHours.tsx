import { useId, useState } from "react";
import { BellOff } from "lucide-react";
import { TIME_PRESETS } from "../../data/anamneseOptions";
import type { Question } from "../../data/questionnaire";
import { isQuietLinked } from "../../lib/anamnese-flow";
import type { Draft } from "../../types";
import { TimePicker } from "./TimePicker";

const KEYS = ["quietStart", "quietEnd"] as const;
const time = (value: Draft[string] | undefined) =>
  String(value ?? "").slice(0, 5);

/**
 * Silêncio dos lembretes numa linha ("das 23:00 às 07:00, igual ao seu sono"), com "Alterar"
 * para os dois horários. Só existe com os lembretes ligados. Um espelho por nome: recolhido,
 * os espelhos são daqui; aberto, vêm dos seletores de horário.
 */
export function QuietHours({
  answers,
  errors,
  fields,
  onChange,
}: {
  answers: Draft;
  errors: Record<string, string>;
  fields: Question[];
  onChange: (key: string, value: string) => void;
}) {
  const panelId = useId();
  const [isOpen, setOpen] = useState(false);
  const hasError = KEYS.some((key) => errors[key]);
  const isExpanded = isOpen || hasError;
  const start = time(answers.quietStart);
  const end = time(answers.quietEnd);
  const isSleep =
    isQuietLinked(answers) &&
    start === time(answers.sleepTime) &&
    end === time(answers.wakeTime);
  const labelOf = (key: string) =>
    fields.find((f) => f.key === key)?.label ?? key;
  return (
    <div
      className="quiet-hours"
      data-testid="quiet-hours"
      data-field="quietStart"
      aria-invalid={hasError}
      tabIndex={-1}
    >
      <div className="quiet-row">
        <BellOff size={18} aria-hidden="true" />
        <p>
          Silêncio dos lembretes: das {start || "—"} às {end || "—"}
          {isSleep ? ", igual ao seu sono" : ""}
        </p>
        <button
          type="button"
          className="text-btn"
          aria-label="Alterar horário de silêncio"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setOpen(!isExpanded)}
        >
          Alterar
        </button>
      </div>
      <div id={panelId} className="quiet-panel" hidden={!isExpanded}>
        {isExpanded &&
          KEYS.map((key) => (
            <TimePicker
              key={key}
              id={`anamnese-${key}`}
              name={key}
              label={labelOf(key)}
              error={errors[key]}
              value={time(answers[key])}
              presets={TIME_PRESETS[key] ?? []}
              onChange={(value) => onChange(key, value)}
            />
          ))}
      </div>
      {!isExpanded &&
        KEYS.map((key) => (
          <input
            key={key}
            className="q-mirror"
            name={key}
            type="time"
            step={60}
            tabIndex={-1}
            aria-hidden="true"
            value={time(answers[key])}
            onChange={(e) => onChange(key, e.target.value.slice(0, 5))}
          />
        ))}
    </div>
  );
}
