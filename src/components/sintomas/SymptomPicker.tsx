import { SYMPTOM_KEYS, SYMPTOMS_MAX, type Symptom, type SymptomKey } from "../../types";
import {
  INTENSITY_LABELS,
  STRONG_NOTICE,
  SYMPTOM_LABELS,
  hasStrong,
  setIntensity,
  toggleSymptom,
} from "../../lib/symptoms";
import { useRadioKeys } from "../useRadioKeys";
import "./Sintomas.css";

const LEVELS = [1, 2, 3] as const;
type Level = (typeof LEVELS)[number];
const levelOf = (intensity: number): Level => (intensity >= 3 ? 3 : intensity <= 1 ? 1 : 2);

/** Uma linha por efeito marcado: nome, três pontos como rádios (44 × 44) e a palavra escolhida. */
function IntensityRow({ symptom, onPick }: { symptom: Symptom; onPick: (level: Level) => void }) {
  const label = SYMPTOM_LABELS[symptom.key];
  const value = levelOf(symptom.intensity);
  const keys = useRadioKeys(LEVELS, value, onPick);
  return (
    <li className="symptom-row">
      <span className="symptom-name">{label}</span>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div className="symptom-dots" role="radiogroup" aria-label={`Intensidade de ${label}`} onKeyDown={keys.onKeyDown}>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            aria-label={INTENSITY_LABELS[level - 1]}
            tabIndex={keys.tabIndex(level)}
            className={`symptom-dot ${level <= value ? "is-on" : ""}`}
            onClick={() => onPick(level)}
          >
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className="symptom-word" aria-hidden="true">
        {INTENSITY_LABELS[value - 1]}
      </span>
    </li>
  );
}

/**
 * Efeitos percebidos no bem-estar (SERINGA-07): até 6 chips e, para cada um, a intensidade em três
 * pontos. Um efeito forte mostra uma nota neutra (sem dose, sem medicamento, sem "pare").
 */
export function SymptomPicker({ value, onChange }: { value: Symptom[]; onChange: (next: Symptom[]) => void }) {
  const isFull = value.length >= SYMPTOMS_MAX;
  const isOn = (key: SymptomKey) => value.some((s) => s.key === key);
  return (
    <fieldset className="entry-fieldset symptom-picker">
      <legend>Efeitos percebidos (opcional)</legend>
      <div className="entry-chips symptom-chips">
        {SYMPTOM_KEYS.map((key) => {
          const isBlocked = isFull && !isOn(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isOn(key)}
              aria-disabled={isBlocked || undefined}
              onClick={() => !isBlocked && onChange(toggleSymptom(value, key))}
            >
              {SYMPTOM_LABELS[key]}
            </button>
          );
        })}
      </div>
      {isFull && <p className="hint">Até 6 efeitos por registro.</p>}
      {value.length > 0 && (
        <ul className="symptom-rows">
          {value.map((symptom) => (
            <IntensityRow
              key={symptom.key}
              symptom={symptom}
              onPick={(level) => onChange(setIntensity(value, symptom.key, level))}
            />
          ))}
        </ul>
      )}
      <div aria-live="polite">
        {hasStrong(value) && (
          <div className="symptom-strong" role="note">
            <strong>{STRONG_NOTICE.title}</strong>
            <p>{STRONG_NOTICE.text}</p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
