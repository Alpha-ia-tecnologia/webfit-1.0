import { useId, useState } from "react";
import { ChevronRight, ChevronUp, Clock, Minus, Plus } from "lucide-react";
import { diarySchema, type DiaryEntry, type Symptom } from "../types";
import { useApp } from "../lib/context";
import { MOOD_LABELS } from "../lib/day";
import { localDate, localTime, shiftDate, uid } from "../lib/domain";
import { fmtNumber } from "../lib/format";
import { visibleTags } from "../lib/symptoms";
import { shouldShowTreatment } from "../lib/treatment";
import { SLEEP_CHIPS, WELLBEING_TAGS, toggleTag, whenDayLabel } from "../lib/wellbeing";
import { MoodFace } from "./hoje/MoodCard";
import { SymptomPicker } from "./sintomas/SymptomPicker";
import { Field } from "./UI";
import "./QuickEntryForm.css";

const WATER_STEP_ML = 50;
const WATER_MIN_ML = 50;
const WATER_MAX_ML = 5000;
const WATER_PRESETS = [150, 200, 250, 300, 500, 750] as const;

/** "Hoje · agora ▸ alterar": a data e o horário ficam recolhidos até a pessoa querer trocar. */
function WhenRow({
  day,
  time,
  isNow,
  onDay,
  onTime,
}: {
  day: string;
  time: string;
  isNow: boolean;
  onDay: (day: string) => void;
  onTime: (time: string) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const fieldsId = useId();
  const today = localDate();
  return (
    <div className="when-row">
      <div className="when-summary">
        <Clock size={16} aria-hidden="true" />
        <span>
          {whenDayLabel(day, today, shiftDate(today, -1))} · {isNow ? "agora" : time}
        </span>
        <button
          type="button"
          className="when-toggle"
          aria-expanded={isOpen}
          aria-controls={fieldsId}
          aria-label={isOpen ? "Recolher data e horário" : "Alterar data e horário"}
          onClick={() => setOpen(!isOpen)}
        >
          {isOpen ? "pronto" : "alterar"}
          {isOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
      </div>
      {isOpen && (
        <div id={fieldsId} className="form-grid">
          <Field label="Data">
            <input type="date" required max={today} value={day} onChange={(e) => onDay(e.target.value)} />
          </Field>
          <Field label="Horário">
            <input type="time" required value={time} onChange={(e) => onTime(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Volume em destaque com ±50 ml e tamanhos comuns em um toque; o campo aceita qualquer valor. */
function WaterAmount({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  const current = Number(value) || 0;
  const step = (delta: number) =>
    onChange(String(Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, current + delta))));
  return (
    <div className="water-editor">
      <label htmlFor={inputId} className="water-editor-label">
        Volume (ml)
      </label>
      <div className="water-editor-row">
        <button
          type="button"
          className="water-step"
          aria-label={`Diminuir ${WATER_STEP_ML} ml`}
          disabled={current <= WATER_MIN_ML}
          onClick={() => step(-WATER_STEP_ML)}
        >
          <Minus size={20} />
        </button>
        <span className="water-editor-big">
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min="1"
            max={WATER_MAX_ML}
            step="1"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span aria-hidden="true">ml</span>
        </span>
        <button
          type="button"
          className="water-step"
          aria-label={`Aumentar ${WATER_STEP_ML} ml`}
          disabled={current >= WATER_MAX_ML}
          onClick={() => step(WATER_STEP_ML)}
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="entry-chips" role="group" aria-label="Volumes comuns">
        {WATER_PRESETS.map((ml) => (
          <button key={ml} type="button" aria-pressed={current === ml} onClick={() => onChange(String(ml))}>
            {fmtNumber(ml)} ml
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cinco rostos de 48 px como botões de rádio; nenhum usa vermelho. */
function MoodPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const name = useId();
  return (
    <fieldset className="mood-picker">
      <legend>Como você se sente?</legend>
      <div className="mood-options">
        {MOOD_LABELS.map((label, i) => (
          <label key={label} className="mood-option">
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={i + 1}
              checked={value === i + 1}
              onChange={() => onChange(i + 1)}
            />
            <MoodFace rating={i + 1} size={48} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Sono em chips de horas cheias; "Outro valor" abre o campo para meias horas ou exceções. */
function SleepChips({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const isPreset = value === "" || SLEEP_CHIPS.some((h) => String(h) === value);
  const [isCustom, setCustom] = useState(!isPreset);
  const pick = (hours: number) => {
    setCustom(false);
    onChange(value === String(hours) && !isCustom ? "" : String(hours));
  };
  const toggleCustom = () => {
    if (isCustom) onChange("");
    setCustom(!isCustom);
  };
  return (
    <fieldset className="entry-fieldset">
      <legend>Horas de sono (opcional)</legend>
      <div className="entry-chips">
        {SLEEP_CHIPS.map((hours) => (
          <button
            key={hours}
            type="button"
            aria-pressed={!isCustom && value === String(hours)}
            onClick={() => pick(hours)}
          >
            {hours} h
          </button>
        ))}
        <button type="button" aria-pressed={isCustom} onClick={toggleCustom}>
          Outro valor
        </button>
      </div>
      {isCustom && (
        <Field label="Horas de sono">
          <input type="number" min="0" max="24" step="0.5" value={value} onChange={(e) => onChange(e.target.value)} />
        </Field>
      )}
    </fieldset>
  );
}

function TagChips({
  tags,
  options = WELLBEING_TAGS,
  onChange,
}: {
  tags: string[];
  /** Com os efeitos à vista, os marcadores que repetem um efeito saem (SERINGA-07). */
  options?: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  return (
    <fieldset className="entry-fieldset">
      <legend>Marcadores (opcional)</legend>
      <div className="entry-chips">
        {options.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.includes(tag)}
            onClick={() => onChange(toggleTag(tags, tag))}
          >
            {tag}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Folhas de água e de bem-estar (HOJE-03, HOJE-07): número grande com ±50 ml, rostos de 48 px,
 * sono em chips e marcadores; data e horário ficam em "Hoje · agora ▸ alterar".
 */
export function QuickEntryForm({
  type,
  onDone,
  entry,
}: {
  type: "agua" | "bem_estar";
  onDone: () => void;
  entry?: DiaryEntry;
}) {
  const { state, date, commit } = useApp();
  const [day, setDay] = useState(entry?.date ?? date),
    [time, setTime] = useState(entry?.time ?? localTime()),
    [isTimeTouched, setTimeTouched] = useState(Boolean(entry)),
    [amount, setAmount] = useState(String(entry?.amountMl ?? 250)),
    [rating, setRating] = useState(entry?.rating ?? 3),
    [tags, setTags] = useState<string[]>(entry?.tags ?? []),
    [description, setDescription] = useState(entry?.description ?? ""),
    [sleep, setSleep] = useState(entry?.sleepHours?.toString() ?? ""),
    [symptoms, setSymptoms] = useState<Symptom[]>(entry?.symptoms ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Efeitos percebidos (SERINGA-07): com tratamento, ou num registro antigo que já os tem.
  const showsSymptoms =
    (state.profile ? shouldShowTreatment(state.profile, state.injections) : false) ||
    (entry?.symptoms?.length ?? 0) > 0;
  return (
    <form
      className="stack quick-entry"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const now = new Date().toISOString();
        const result = diarySchema.safeParse({
          id: entry?.id ?? uid(),
          userId: state.userId,
          date: day,
          time,
          createdAt: entry?.createdAt ?? now,
          updatedAt: now,
          type,
          title: type === "agua" ? "Água" : "Bem-estar",
          description,
          ...(type === "agua"
            ? { amountMl: Number(amount) }
            : {
                rating,
                sleepHours: sleep === "" ? undefined : Number(sleep),
                tags: tags.length ? tags : undefined,
                symptoms: symptoms.length ? symptoms : undefined,
              }),
        });
        if (!result.success || day > localDate()) {
          setError("Confira a data e os valores informados.");
          return;
        }
        setBusy(true);
        if (
          await commit(
            (s) => ({
              ...s,
              diary: [...s.diary.filter((d) => d.id !== result.data.id), result.data],
            }),
            "Registro salvo.",
          )
        )
          onDone();
        setBusy(false);
      }}
    >
      {type === "agua" ? (
        <WaterAmount value={amount} onChange={setAmount} />
      ) : (
        <>
          <MoodPicker value={rating} onChange={setRating} />
          {showsSymptoms && <SymptomPicker value={symptoms} onChange={setSymptoms} />}
          <SleepChips value={sleep} onChange={setSleep} />
          <TagChips tags={tags} options={visibleTags(showsSymptoms, tags)} onChange={setTags} />
        </>
      )}
      <Field label="Observações (opcional)">
        <textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <WhenRow
        day={day}
        time={time}
        isNow={!isTimeTouched && day === localDate()}
        onDay={setDay}
        onTime={(next) => {
          setTimeTouched(true);
          setTime(next);
        }}
      />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy}>
        {busy ? "Salvando…" : "Salvar registro"}
      </button>
    </form>
  );
}
