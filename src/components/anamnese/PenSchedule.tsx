import { useEffect, useId, useRef, useState, type Ref } from "react";
import { CircleCheck, Plus } from "lucide-react";
import { STEPPER_FIELDS } from "../../data/anamneseOptions";
import { localTime } from "../../lib/dates";
import { shiftDate } from "../../lib/domain";
import { METHODS, SITES } from "../../lib/injection";
import {
  isWeeklyDraft,
  PEN_FREQUENCIES,
  PEN_KEYS,
  PEN_LAST_BLOCK_TEXT,
  penFrequencyOf,
  penLastPreview,
  WEEKDAYS,
  type PenFrequency,
} from "../../lib/pen-setup";
import type { Draft } from "../../types";
import { useRadioKeys } from "../useRadioKeys";
import { DateWheels } from "./DateWheels";
import { Stepper } from "./Stepper";

type Option<T extends string> = {
  value: T;
  label: string;
  ariaLabel?: string;
  className?: string;
};

/** Radiogroup de botões (padrão WAI-ARIA, uma parada de Tab) com rótulo visível. */
function RadioButtons<T extends string>({
  label,
  options,
  checked,
  onPick,
  className = "",
  groupRef,
}: {
  label: string;
  options: readonly Option<T>[];
  checked: T | null;
  onPick: (value: T) => void;
  className?: string;
  groupRef?: Ref<HTMLDivElement>;
}) {
  const labelId = useId();
  const values = options.map((o) => o.value);
  const keys = useRadioKeys(values, checked, onPick);
  return (
    <div className="pen-field">
      <span id={labelId} className="pen-field-label">
        {label}
      </span>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div
        ref={groupRef}
        className={`pen-radios ${className}`}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={keys.onKeyDown}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked === option.value}
            aria-label={option.ariaLabel}
            tabIndex={keys.tabIndex(option.value)}
            className={`pen-radio ${option.className ?? ""} ${checked === option.value ? "on" : ""}`}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const FREQUENCY_OPTIONS = PEN_FREQUENCIES.map((f) => ({
  value: f.key as PenFrequency,
  label: f.label,
}));
const VARIES = "";
const WEEKDAY_OPTIONS: Option<string>[] = [
  ...WEEKDAYS.map((d) => ({
    value: String(d.value),
    label: d.short,
    ariaLabel: d.label,
    className: "is-day",
  })),
  { value: VARIES, label: "Varia", className: "is-varies" },
];
const SITE_OPTIONS = SITES.map((s) => ({ value: s.key as string, label: s.label }));
const METHOD_OPTIONS = METHODS.filter(
  (m) => m.key === "caneta" || m.key === "dose_unica",
).map((m) => ({ value: m.key as string, label: m.label }));
type When = "hoje" | "ontem" | "outra";
const WHEN_OPTIONS: Option<When>[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "outra", label: "Outra data" },
];
const PER_MONTH_KEY = "weightLossPenPerMonth";

/**
 * Caneta configurada na anamnese: frequência, dia da aplicação semanal e o registro opcional da
 * última aplicação, que só acontece depois de "Confirmar para registrar" e ao concluir. Nunca
 * sugere dose nem mostra a próxima aplicação. `canRegister` falso (editor de uma seção, que não
 * registra aplicações) troca o registro por um aviso que aponta para Seringa e dose.
 */
export function PenSchedule({
  answers,
  errors,
  injectionsCount,
  today,
  canRegister = true,
  onChange,
}: {
  answers: Draft;
  errors: Record<string, string>;
  injectionsCount: number;
  today: string;
  canRegister?: boolean;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const perMonth = String(answers[PER_MONTH_KEY] ?? "");
  const frequency = penFrequencyOf(perMonth);
  const [isOther, setOther] = useState(frequency === "outra");
  const showStepper = isOther || frequency === "outra";
  const selected: PenFrequency | null = showStepper ? "outra" : frequency;
  const isWeekly = isWeeklyDraft(answers);
  const weekday = String(answers.penWeekday ?? "");
  const error = errors[PER_MONTH_KEY] || errors.penWeekday;
  const pickFrequency = (next: PenFrequency) => {
    setOther(next === "outra");
    const preset = PEN_FREQUENCIES.find((f) => f.key === next)?.perMonth;
    if (preset) onChange(PER_MONTH_KEY, String(preset));
  };
  return (
    <div
      className="pen-schedule"
      data-testid="pen-schedule"
      data-field={PER_MONTH_KEY}
      aria-invalid={!!error}
      tabIndex={-1}
    >
      <RadioButtons
        label="Com que frequência?"
        options={FREQUENCY_OPTIONS}
        checked={selected}
        onPick={pickFrequency}
        className="is-pills"
      />
      {showStepper ? (
        <Stepper
          id={`anamnese-${PER_MONTH_KEY}`}
          name={PER_MONTH_KEY}
          label="Aplicações por mês"
          value={perMonth}
          config={STEPPER_FIELDS.weightLossPenPerMonth}
          onChange={(value) => onChange(PER_MONTH_KEY, value)}
        />
      ) : (
        <input
          className="q-mirror"
          name={PER_MONTH_KEY}
          type="number"
          min={1}
          max={31}
          tabIndex={-1}
          aria-hidden="true"
          value={perMonth}
          onChange={(e) => onChange(PER_MONTH_KEY, e.target.value)}
        />
      )}
      {isWeekly && (
        <>
          <RadioButtons
            label="Dia da aplicação"
            options={WEEKDAY_OPTIONS}
            checked={weekday}
            onPick={(value) => onChange("penWeekday", value)}
            className="is-days"
          />
          <input
            className="q-mirror"
            name="penWeekday"
            type="number"
            min={0}
            max={6}
            tabIndex={-1}
            aria-hidden="true"
            value={weekday}
            onChange={(e) => onChange("penWeekday", e.target.value)}
          />
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {injectionsCount > 0 ? (
        <div className="pen-last-known">
          <p>Sua última aplicação já está no diário.</p>
          <p className="hint">Novas aplicações ficam em Seringa e dose.</p>
        </div>
      ) : canRegister ? (
        <PenLastEntry answers={answers} today={today} onChange={onChange} />
      ) : (
        <div className="pen-last-known" data-testid="pen-register-elsewhere">
          <p>Para registrar uma aplicação, use Seringa e dose.</p>
        </div>
      )}
    </div>
  );
}

/** "Registrar a última aplicação": opcional, com pré-visualização e confirmação explícita. */
function PenLastEntry({
  answers,
  today,
  onChange,
}: {
  answers: Draft;
  today: string;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const panelId = useId();
  const yesterday = shiftDate(today, -1);
  const date = String(answers[PEN_KEYS.date] ?? "");
  const [isOpen, setOpen] = useState(
    date !== "" || answers[PEN_KEYS.confirmed] === true,
  );
  const [isOtherDate, setOtherDate] = useState(
    date !== "" && date !== today && date !== yesterday,
  );
  const whenGroup = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"when" | "confirm" | "undo" | null>(null);
  const preview = penLastPreview(answers, today, localTime());
  const isConfirmed =
    answers[PEN_KEYS.confirmed] === true && preview.block === null;
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "when")
      whenGroup.current
        ?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
        ?.focus();
    if (target === "confirm") confirmButton.current?.focus();
    if (target === "undo") undoButton.current?.focus();
  }, [isOpen, isConfirmed]);
  const when: When | null = isOtherDate
    ? "outra"
    : date === today
      ? "hoje"
      : date === yesterday
        ? "ontem"
        : date
          ? "outra"
          : null;
  const pickWhen = (next: When) => {
    setOtherDate(next === "outra");
    if (next === "hoje") onChange(PEN_KEYS.date, today);
    if (next === "ontem") onChange(PEN_KEYS.date, yesterday);
  };
  const currentYear = Number(today.slice(0, 4));
  return (
    <div className="pen-last">
      <button
        type="button"
        className="pen-last-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          if (!isOpen) pendingFocus.current = "when";
          setOpen((open) => !open);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        Registrar a última aplicação
      </button>
      <p className="hint">Opcional. Fica no diário, como os outros registros.</p>
      <div id={panelId} className="pen-last-panel" hidden={!isOpen}>
        {isOpen && (
          <>
            <RadioButtons
              label="Quando foi?"
              options={WHEN_OPTIONS}
              checked={when}
              onPick={pickWhen}
              className="is-pills"
              groupRef={whenGroup}
            />
            {when === "outra" && (
              <DateWheels
                id="anamnese-penLastDate"
                name={PEN_KEYS.date}
                label="Data da última aplicação"
                value={date}
                minYear={currentYear - 1}
                maxYear={currentYear}
                initial={today}
                onChange={(value) => onChange(PEN_KEYS.date, value)}
              />
            )}
            <RadioButtons
              label="Local"
              options={SITE_OPTIONS}
              checked={String(answers[PEN_KEYS.site] ?? "") || null}
              onPick={(value) => onChange(PEN_KEYS.site, value)}
              className="is-pills"
            />
            <RadioButtons
              label="Tipo de caneta"
              options={METHOD_OPTIONS}
              checked={String(answers[PEN_KEYS.method] ?? "") || null}
              onPick={(value) => onChange(PEN_KEYS.method, value)}
              className="is-pills"
            />
            <p className="hint">
              Usa frasco e seringa? Registre pela calculadora em Seringa e dose.
            </p>
            <p className="pen-last-preview">
              {preview.block
                ? PEN_LAST_BLOCK_TEXT[preview.block]
                : `Vamos registrar: ${preview.text}`}
            </p>
            {isConfirmed ? (
              <div className="pen-last-confirmed">
                <CircleCheck size={18} aria-hidden="true" />
                <p>Será registrada no diário ao concluir a anamnese.</p>
                <button
                  ref={undoButton}
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    pendingFocus.current = "confirm";
                    onChange(PEN_KEYS.confirmed, false);
                  }}
                >
                  Não registrar
                </button>
              </div>
            ) : (
              <button
                ref={confirmButton}
                type="button"
                className="btn-secondary pen-last-confirm"
                aria-disabled={preview.block !== null}
                onClick={() => {
                  if (preview.block !== null) return;
                  pendingFocus.current = "undo";
                  onChange(PEN_KEYS.confirmed, true);
                }}
              >
                Confirmar para registrar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
