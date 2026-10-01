import { Moon } from "lucide-react";
import { REMINDER_COPY, type ReminderPreview } from "../../lib/reminder-center";
import { EmptyArt } from "../EmptyArt";
import { REMINDER_ICON } from "./ReminderCard";

interface RemindersOffProps {
  preview: ReminderPreview;
  onEnable: () => void;
  onAdjust: () => void;
}

/**
 * Lembretes desligados: um convite calmo para ligar e a prévia "Como ficaria hoje" com os
 * horários da rotina (perfis sensíveis não veem Medidas; a prévia vem pronta de reminderPreview).
 */
export function RemindersOff({ preview, onEnable, onAdjust }: RemindersOffProps) {
  return (
    <section
      className="card reminders-off"
      data-testid="reminders-off"
      aria-labelledby="reminders-off-title"
    >
      <EmptyArt kind="notifications" />
      <h2 id="reminders-off-title">{REMINDER_COPY.offTitle}</h2>
      <p className="reminders-off-text">{REMINDER_COPY.offText}</p>
      <button type="button" className="btn" onClick={onEnable}>
        {REMINDER_COPY.enable}
      </button>
      <div className="reminders-off-preview">
        <h3 id="reminders-preview-title">{REMINDER_COPY.previewTitle}</h3>
        {preview.chips.length ? (
          <ul
            className="reminder-preview"
            aria-labelledby="reminders-preview-title"
            data-testid="reminders-preview"
          >
            {preview.chips.map((chip, index) => {
              const Icon = REMINDER_ICON[chip.type];
              return (
                <li
                  key={`${chip.time}-${chip.label}-${index}`}
                  className="reminder-preview-chip"
                  data-type={chip.type}
                >
                  <Icon size={14} aria-hidden="true" />
                  <strong>{chip.time}</strong> {chip.label}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">{REMINDER_COPY.previewEmpty}</p>
        )}
        {preview.quiet && (
          <p className="reminder-quiet-chip">
            <Moon size={14} aria-hidden="true" />
            {preview.quiet}
          </p>
        )}
      </div>
      <button type="button" className="text-btn reminders-adjust" onClick={onAdjust}>
        {REMINDER_COPY.adjust}
      </button>
    </section>
  );
}
