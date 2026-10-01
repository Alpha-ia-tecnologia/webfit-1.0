import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { Question } from "../../data/questionnaire";
import {
  SELECT_FACES,
  SELECT_HINTS,
  SELECT_ICONS,
  SELECT_LAYOUT,
} from "../../data/anamneseOptions";
import { RadioCard } from "../RadioCard";
import { OptionalTag } from "./OptionalTag";
import type { AboutSlot } from "./StageAbout";
import { CHOICE_ICON, FACE_ICON } from "./icons";

/** Mola curta para a marca de seleção: rápida, com leve sobressalto. */
const spring = { type: "spring" as const, stiffness: 520, damping: 26 };

type OptionProps = {
  name: string;
  option: string;
  label: string;
  hint?: string;
  checked: boolean;
  className: string;
  help?: string;
  error?: string;
  reducedMotion: boolean;
  onChange: (value: string) => void;
  /** Conteúdo antes do texto (rosto) e etiqueta dentro do texto ("Sugerido"). */
  icon?: ReactNode;
  tag?: ReactNode;
};

function OptionCard({
  name,
  option,
  label,
  hint,
  checked,
  className,
  help,
  error,
  reducedMotion,
  onChange,
  icon,
  tag,
}: OptionProps) {
  return (
    <motion.label
      className={`choice-chip anamnese-option-card ${className} ${checked ? "on" : ""}`}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: reducedMotion ? 0 : 0.16 }}
    >
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o foco no primeiro campo inválido (ScreenAnamnese) procura input[aria-invalid] */}
      <input
        type="radio"
        name={name}
        value={option}
        checked={checked}
        onChange={() => onChange(option)}
        aria-describedby={help}
        aria-invalid={!!error}
      />
      <span className="choice-check" aria-hidden="true">
        {checked && (
          <motion.span
            initial={reducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : spring}
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </span>
      {icon}
      <span className="choice-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
        {tag}
      </span>
    </motion.label>
  );
}

/**
 * Perguntas de escolha única (enums) em cartões de rádio, com o mesmo visual dos chips.
 * O select nativo continua no DOM (oculto) para quem prefere a lista e para a automação.
 * Sono e estresse ganham rostos neutros; `suggested` marca uma opção com "Sugerido".
 * Sim/Não (caneta) viram 2 blocos grandes lado a lado e "Prefiro não informar" em texto.
 */
export function ChoiceCards({
  field,
  value,
  error,
  onChange,
  reducedMotion,
  suggested,
  about,
}: {
  field: Question;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  reducedMotion: boolean;
  /** Opção sugerida pelas outras respostas (só uma etiqueta; nunca marca sozinha). */
  suggested?: string | null;
  /** "ⓘ Por quê?" da etapa (só na 1ª pergunta). */
  about?: AboutSlot;
}) {
  const id = useId();
  const [useList, setUseList] = useState(false);
  const hintId = field.hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const help = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const hints = SELECT_HINTS[field.key] ?? {};
  const faces = SELECT_FACES[field.key];
  const icons = SELECT_ICONS[field.key] ?? {};
  const isBinary = SELECT_LAYOUT[field.key] === "binary";
  const isList = useList && !isBinary;
  // Sem descrições nas opções, as respostas curtas (Sim/Não, Boa/Regular) viram pílulas.
  const isPills = Object.keys(hints).length === 0;
  const options = field.options ?? [];
  const name = `${field.key}Choice`;
  const optionProps = (option: string, label: string) => ({
    name,
    option,
    label,
    checked: value === option,
    help,
    error,
    reducedMotion,
    onChange,
  });
  const tagFor = (option: string) =>
    suggested && option === suggested ? (
      <span className="choice-tag">
        Sugerido
        <span className="sr-only"> pelos seus dias de treino</span>
      </span>
    ) : undefined;
  const group = {
    role: "radiogroup",
    "aria-labelledby": `${id}-label`,
    "aria-describedby": help,
    "aria-required": !field.optional,
    "aria-invalid": !!error,
  } as const;
  // Blocos na ordem dos ícones (Sim, Não); o resto ("Prefiro não informar") vira rádio em texto.
  const tiles = Object.keys(icons)
    .map((key) => options.find(([option]) => option === key))
    .filter((entry): entry is [string, string] => !!entry);
  const rest = options.filter(([option]) => !icons[option]);
  return (
    <div className={`anamnese-choice-field ${isBinary ? "is-binary" : ""}`}>
      <div className="anamnese-choice-heading">
        <span id={`${id}-label`} className="q-label">
          {field.prompt ?? field.label}
          {field.prompt && field.prompt !== field.label && (
            <span className="sr-only"> ({field.label})</span>
          )}
          {field.optional && <OptionalTag />}
        </span>
        <p className="q-help">
          <span id={hintId}>{field.hint ?? "Escolha uma"}</span>
          {about && (
            <>
              <span className="q-help-dot" aria-hidden="true">
                ·
              </span>
              {about.button}
            </>
          )}
          {!isBinary && (
            <button
              type="button"
              className="anamnese-choice-mode"
              onClick={() => setUseList((current) => !current)}
              aria-label={`${useList ? "Usar cards" : "Usar lista"}: ${field.label}`}
            >
              {useList ? "Usar cards" : "Usar lista"}
            </button>
          )}
        </p>
      </div>
      {about?.panel}
      {!isList && isBinary && (
        <div className="choice-binary" {...group}>
          <div className="choice-binary-tiles">
            {tiles.map(([option, label]) => {
              const Icon = CHOICE_ICON[icons[option]];
              return (
                <RadioCard
                  key={option}
                  name={name}
                  value={option}
                  checked={value === option}
                  onChange={onChange}
                  layout="tile"
                  indicator="check"
                  className={`is-${option}`}
                  title={label}
                  subtitle={hints[option]}
                  describedBy={help}
                  isInvalid={!!error}
                  media={
                    <span className="choice-binary-media" aria-hidden="true">
                      <Icon size={24} />
                    </span>
                  }
                />
              );
            })}
          </div>
          {rest.map(([option, label]) => {
            const checked = value === option;
            return (
              <label
                key={option}
                className={`choice-text-radio ${checked ? "on" : ""}`}
              >
                {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o foco no primeiro campo inválido (ScreenAnamnese) procura input[aria-invalid] */}
                <input
                  type="radio"
                  name={name}
                  value={option}
                  checked={checked}
                  onChange={() => onChange(option)}
                  aria-describedby={help}
                  aria-invalid={!!error}
                />
                {checked && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
      {!isList && !isBinary && faces && (
        <div className="choice-faces" {...group}>
          <div className="choice-face-row">
            {options
              .filter(([option]) => faces[option])
              .map(([option, label]) => {
                const Face = FACE_ICON[faces[option]];
                return (
                  <OptionCard
                    key={option}
                    {...optionProps(option, label)}
                    className="is-face"
                    icon={<Face className="choice-face" size={24} aria-hidden="true" />}
                  />
                );
              })}
          </div>
          <div className="choice-pill-row">
            {options
              .filter(([option]) => !faces[option])
              .map(([option, label]) => (
                <OptionCard
                  key={option}
                  {...optionProps(option, label)}
                  className="is-pill"
                />
              ))}
          </div>
        </div>
      )}
      {!isList && !isBinary && !faces && (
        <div className={isPills ? "choice-pill-row" : "choice-grid"} {...group}>
          {options.map(([option, label]) => (
            <OptionCard
              key={option}
              {...optionProps(option, label)}
              className={isPills ? "is-pill" : ""}
              hint={hints[option]}
              tag={tagFor(option)}
            />
          ))}
        </div>
      )}
      <select
        id={id}
        className={isList ? "" : "anamnese-native-select"}
        name={field.key}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-labelledby={`${id}-label`}
        aria-describedby={help}
        aria-invalid={!!error}
        aria-hidden={isList ? undefined : true}
        tabIndex={isList ? undefined : -1}
      >
        <option value="">Selecione…</option>
        {options.map(([option, label]) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
