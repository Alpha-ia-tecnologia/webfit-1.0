import {
  CHOICE_FIELDS,
  penDoseConfig,
  RULER_FIELDS,
  STEPPER_FIELDS,
  TIME_PRESETS,
} from "../../data/anamneseOptions";
import type { Question } from "../../data/questionnaire";
import { suggestActivity } from "../../lib/day-timeline";
import type { Draft } from "../../types";
import { Field } from "../UI";
import { ChoiceCards } from "./ChoiceCards";
import { ChoiceChips } from "./ChoiceChips";
import { ConditionsField } from "./ConditionsField";
import { DateWheels } from "./DateWheels";
import { DayTimeline } from "./DayTimeline";
import { GoalsWidget } from "./GoalsWidget";
import { PenSchedule } from "./PenSchedule";
import { QuietHours } from "./QuietHours";
import type { AboutSlot } from "./StageAbout";
import { Ruler } from "./Ruler";
import { Stepper } from "./Stepper";
import { SwitchField } from "./SwitchField";
import { TimePicker } from "./TimePicker";
import { WaterGlasses } from "./WaterGlasses";

const BIRTH_YEAR_MIN = 1900;
const MEASUREMENT_YEARS_BACK = 5;

type Props = {
  field: Question;
  answers: Draft;
  errors: Record<string, string>;
  /** Perguntas da etapa (rótulos e dicas das chaves de um controle composto). */
  stepFields: Question[];
  /** id do título do grupo, para os controles compostos que se rotulam por ele. */
  groupLabelId: string;
  injectionsCount: number;
  /** Falso no editor de uma seção: a caneta não oferece registrar a última aplicação. */
  canRegisterPen?: boolean;
  today: string;
  reducedMotion: boolean;
  onChange: (key: string, value: string | boolean) => void;
  /** Datas: grava e valida a faixa (ano a partir de 1900, nunca no futuro). */
  onDateChange: (key: string, value: string) => void;
  /** "ⓘ Por quê?" da etapa, na linha de ajuda da 1ª pergunta (só escolhas o desenham). */
  about?: AboutSlot;
};

/** Perguntas que desenham o "Por quê?" da etapa na própria linha de ajuda (escolhas em chips ou cartões). */
export function acceptsAbout(f: Question): boolean {
  if (f.widget) return f.widget === "numbersChoice" || f.widget === "conditions";
  return (
    f.type === "select" ||
    f.key === "weightLossPenDose" ||
    CHOICE_FIELDS[f.key] !== undefined
  );
}

/**
 * Escolhe o controle interativo de cada pergunta; só o nome continua digitado. Chaves com
 * `widget` viram um controle composto desenhado uma vez (linha do dia, metas, água, silêncio,
 * caneta e preferência de números).
 */
export function AnamneseField({
  field: f,
  answers,
  errors,
  stepFields,
  groupLabelId,
  injectionsCount,
  canRegisterPen = true,
  today,
  reducedMotion,
  onChange,
  onDateChange,
  about,
}: Props) {
  const value = answers[f.key];
  const text = String(value ?? "");
  const error = errors[f.key];
  const id = `anamnese-${f.key}`;
  const set = (next: string | boolean) => onChange(f.key, next);
  switch (f.widget) {
    case "dayTimeline":
      return (
        <DayTimeline
          answers={answers}
          errors={errors}
          fields={stepFields}
          labelledBy={groupLabelId}
          onChange={onChange}
        />
      );
    case "goals":
      return (
        <GoalsWidget
          answers={answers}
          errors={errors}
          today={today}
          onChange={onChange}
        />
      );
    case "water":
      return (
        <WaterGlasses
          answers={answers}
          error={errors.manualWater}
          onChange={onChange}
        />
      );
    case "quietHours":
      return (
        <QuietHours
          answers={answers}
          errors={errors}
          fields={stepFields}
          onChange={onChange}
        />
      );
    case "penSchedule":
      return (
        <PenSchedule
          answers={answers}
          errors={errors}
          injectionsCount={injectionsCount}
          today={today}
          canRegister={canRegisterPen}
          onChange={onChange}
        />
      );
    case "conditions":
      return (
        <ConditionsField
          answers={answers}
          errors={errors}
          fields={stepFields}
          about={about}
          onChange={onChange}
        />
      );
    case "numbersChoice":
      return (
        <ChoiceCards
          field={f}
          value={String(Boolean(value))}
          error={error}
          onChange={(next) => set(next === "true")}
          reducedMotion={reducedMotion}
          about={about}
        />
      );
  }
  if (f.type === "checkbox")
    return (
      <SwitchField
        field={f}
        checked={Boolean(value)}
        error={error}
        onChange={set}
      />
    );
  if (f.type === "select")
    return (
      <ChoiceCards
        field={f}
        value={text}
        error={error}
        onChange={set}
        reducedMotion={reducedMotion}
        suggested={
          f.key === "activityLevel"
            ? suggestActivity(answers.exerciseDays)
            : undefined
        }
        about={about}
      />
    );
  // As doses oferecidas dependem da caneta escolhida na pergunta anterior.
  const choiceConfig =
    f.key === "weightLossPenDose"
      ? penDoseConfig(String(answers.weightLossPenName ?? ""))
      : CHOICE_FIELDS[f.key];
  const common = {
    id,
    name: f.key,
    label: f.label,
    hint: f.hint,
    error,
    onChange: set,
  };
  if (choiceConfig)
    return (
      <ChoiceChips
        {...common}
        prompt={f.prompt}
        optional={f.optional}
        value={text}
        config={choiceConfig}
        about={about}
      />
    );
  if (RULER_FIELDS[f.key])
    return (
      <Ruler
        {...common}
        optional={f.optional}
        value={text}
        config={RULER_FIELDS[f.key]}
      />
    );
  if (STEPPER_FIELDS[f.key])
    return (
      <Stepper
        {...common}
        optional={f.optional}
        value={text}
        config={STEPPER_FIELDS[f.key]}
      />
    );
  if (f.type === "date") {
    const isBirth = f.key === "birthDate";
    const currentYear = Number(today.slice(0, 4));
    return (
      <DateWheels
        {...common}
        value={text}
        minYear={isBirth ? BIRTH_YEAR_MIN : currentYear - MEASUREMENT_YEARS_BACK}
        maxYear={currentYear}
        initial={isBirth ? "1990-01-01" : today}
        quick={!isBirth}
        onChange={(next) => onDateChange(f.key, next)}
      />
    );
  }
  if (f.type === "time")
    return (
      <TimePicker
        {...common}
        value={text.slice(0, 5)}
        presets={TIME_PRESETS[f.key] ?? []}
      />
    );
  return (
    <Field label={f.label} hint={f.hint} error={error}>
      <input
        name={f.key}
        type="text"
        value={text}
        required={!f.optional}
        maxLength={f.key === "name" ? 100 : 2000}
        autoComplete={f.key === "name" ? "given-name" : undefined}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  );
}
