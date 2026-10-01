import {
  CHOICE_FIELDS,
  penDoseConfig,
  RULER_FIELDS,
  STEPPER_FIELDS,
  TIME_PRESETS,
} from "@shared/data/anamneseOptions";
import type { Question } from "@shared/data/questionnaire";
import { suggestActivity } from "@shared/lib/day-timeline";
import type { Draft } from "@shared/types";
import { Field, TextField } from "@/components/ui";
import { ChoiceCards } from "./choice-cards";
import { ChoiceChips } from "./choice-chips";
import { DateWheels } from "./date-wheels";
import { DayTimeline } from "./day-timeline";
import { GoalsWidget } from "./goals-widget";
import { PenSchedule } from "./pen-schedule";
import { QuietHours } from "./quiet-hours";
import type { AboutSlot } from "./stage-about";
import { Ruler } from "./ruler";
import { Stepper } from "./stepper";
import { SwitchField } from "./switch-field";
import { TimePicker } from "./time-picker";
import { WaterGlasses } from "./water-glasses";

const BIRTH_YEAR_MIN = 1900;
const MEASUREMENT_YEARS_BACK = 5;

export type FieldProps = {
  field: Question;
  answers: Draft;
  errors: Record<string, string>;
  /** Campos da etapa (widgets que cobrem várias chaves leem rótulos e dicas daqui). */
  fields: Question[];
  today: string;
  injectionsCount: number;
  /** Falso no editor de uma seção: a caneta não oferece registrar a última aplicação. */
  canRegisterPen?: boolean;
  set: (key: string, value: string | boolean) => void;
  setMany: (values: Record<string, string>) => void;
  /** Datas: ano mínimo e futuro viram erro na hora (mensagem vazia limpa). */
  onDateChecked: (key: string, message: string) => void;
  /** "ⓘ Por quê?" da etapa, na linha de ajuda da 1ª pergunta (só em escolhas; ver acceptsAbout). */
  about?: AboutSlot;
};

/** Perguntas com linha de ajuda ("Escolha uma", "Marque todos que se aplicam"), onde cabe o "Por quê?". */
export function acceptsAbout(f: Question): boolean {
  if (f.widget) return f.widget === "numbersChoice";
  return f.type === "select" || f.key === "weightLossPenDose" || CHOICE_FIELDS[f.key] !== undefined;
}

/** Escolhe o controle de cada pergunta: widgets compostos, chips, réguas, rodas; só o nome é digitado. */
export function AnamneseField(props: FieldProps) {
  const { field: f, answers, errors, fields, today, injectionsCount, canRegisterPen = true, set, setMany, onDateChecked, about } = props;
  const value = answers[f.key];
  const text = String(value ?? "");
  const error = errors[f.key];
  switch (f.widget) {
    case "dayTimeline":
      return <DayTimeline answers={answers} errors={errors} set={set} fields={fields} />;
    case "goals":
      return <GoalsWidget answers={answers} errors={errors} setMany={setMany} today={today} />;
    case "water":
      return <WaterGlasses answers={answers} error={error} set={set} />;
    case "quietHours":
      return <QuietHours answers={answers} errors={errors} set={set} fields={fields} />;
    case "penSchedule":
      return <PenSchedule answers={answers} errors={errors} set={set} injectionsCount={injectionsCount} today={today} canRegister={canRegisterPen} />;
    case "numbersChoice":
      return <ChoiceCards field={f} value={String(Boolean(value))} error={error} about={about} onChange={(next) => set(f.key, next === "true")} />;
    default:
      break;
  }
  if (f.type === "checkbox")
    return <SwitchField field={f} checked={Boolean(value)} error={error} onChange={(next) => set(f.key, next)} />;
  if (f.type === "select")
    return (
      <ChoiceCards
        field={f}
        value={text}
        error={error}
        suggested={f.key === "activityLevel" ? suggestActivity(answers.exerciseDays) : undefined}
        about={about}
        onChange={(next) => set(f.key, next)}
      />
    );
  // As doses oferecidas dependem da caneta escolhida na pergunta anterior.
  const choiceConfig = f.key === "weightLossPenDose" ? penDoseConfig(String(answers.weightLossPenName ?? "")) : CHOICE_FIELDS[f.key];
  if (choiceConfig)
    return (
      <ChoiceChips
        label={f.label}
        prompt={f.prompt}
        hint={f.hint}
        error={error}
        optional={f.optional}
        value={text}
        config={choiceConfig}
        about={about}
        onChange={(next) => set(f.key, next)}
      />
    );
  if (RULER_FIELDS[f.key])
    return <Ruler label={f.label} hint={f.hint} error={error} optional={f.optional} value={text} config={RULER_FIELDS[f.key]!} onChange={(next) => set(f.key, next)} />;
  if (STEPPER_FIELDS[f.key])
    return <Stepper label={f.label} hint={f.hint} error={error} optional={f.optional} value={text} config={STEPPER_FIELDS[f.key]!} onChange={(next) => set(f.key, next)} />;
  if (f.type === "date") {
    const isBirth = f.key === "birthDate";
    const currentYear = Number(today.slice(0, 4));
    return (
      <DateWheels
        label={f.label}
        hint={f.hint}
        error={error}
        value={text}
        minYear={isBirth ? BIRTH_YEAR_MIN : currentYear - MEASUREMENT_YEARS_BACK}
        maxYear={currentYear}
        initial={isBirth ? "1990-01-01" : today}
        quick={!isBirth}
        onChange={(next) => {
          set(f.key, next);
          const year = Number(next.slice(0, 4));
          onDateChecked(f.key, !next ? "" : year < BIRTH_YEAR_MIN ? "Informe um ano a partir de 1900." : next > today ? "A data não pode estar no futuro." : "");
        }}
      />
    );
  }
  if (f.type === "time")
    return <TimePicker label={f.label} hint={f.hint} error={error} value={text.slice(0, 5)} presets={TIME_PRESETS[f.key] ?? []} onChange={(next) => set(f.key, next)} />;
  return (
    <Field label={f.label} hint={f.hint} error={error}>
      <TextField
        value={text}
        maxLength={f.key === "name" ? 100 : 2000}
        autoComplete={f.key === "name" ? "given-name" : undefined}
        invalid={!!error}
        onChangeText={(next) => set(f.key, next)}
        accessibilityLabel={f.label}
      />
    </Field>
  );
}
