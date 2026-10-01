import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import {
  CONCENTRATION_MAX,
  CONCENTRATION_MIN,
  CONCENTRATION_QUICK,
  CONCENTRATION_STEP,
  MEDICATIONS,
  fmtConcentration,
  fmtMg,
  fmtNumber2,
  medication,
  parseDoseMg,
} from "../../lib/injection";
import { useRadioKeys } from "../useRadioKeys";
import { DoseRuler } from "./DoseRuler";
import type { DoseController } from "./useDoseState";

const STEP_LABEL = CONCENTRATION_STEP.toLocaleString("pt-BR");
const concText = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

type ValueProps = {
  value: number | null;
  onApply: (mg: number) => void;
  onInvalid: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
};

/** Valor da dose: botão que vira campo em mg. Enter ou sair do campo aplica; Esc cancela. */
function DoseValue({ value, onApply, onInvalid, buttonRef }: ValueProps) {
  const [isEditing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const isDone = useRef(false);
  const close = () => {
    isDone.current = true;
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const submit = (keepOpenOnError: boolean) => {
    if (!text.trim()) return close();
    const mg = parseDoseMg(text);
    if (mg === null) {
      onInvalid();
      if (!keepOpenOnError) close();
      return;
    }
    onApply(mg);
    close();
  };
  if (isEditing)
    return (
      <input
        className="inj-dose-input"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- o campo só aparece depois do toque no valor da dose; o foco precisa passar do botão para ele
        autoFocus
        inputMode="decimal"
        aria-label="Dose prescrita em mg"
        placeholder="Ex.: 2,5"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (!isDone.current) submit(false);
        }}
      />
    );
  return (
    <button
      ref={buttonRef}
      type="button"
      className="inj-dose-value"
      aria-label={value !== null ? `Dose prescrita: ${fmtMg(value)}. Digitar outra dose` : "Digitar a dose prescrita"}
      onClick={() => {
        isDone.current = false;
        setText(value !== null ? fmtNumber2(value) : "");
        setEditing(true);
      }}
    >
      <strong data-testid="injection-dose">{value !== null ? fmtNumber2(value) : "—"}</strong>
      <span>mg</span>
    </button>
  );
}

/** Caneta desenhada com a janela da dose; o valor (HTML) fica sobre a janela. */
function PenWindow({ children }: { children: ReactNode }) {
  return (
    <div className="inj-pen">
      <svg viewBox="0 0 320 64" aria-hidden="true" focusable="false" preserveAspectRatio="none">
        <rect x="18" y="14" width="262" height="36" rx="18" fill="var(--wf-tone-medication-bg)" stroke="var(--wf-tone-medication-fg)" strokeWidth="2" />
        <rect x="280" y="18" width="26" height="28" rx="8" fill="var(--wf-tone-medication-fg)" />
        <rect x="4" y="24" width="16" height="16" rx="4" fill="var(--wf-slate-300)" />
      </svg>
      <div className="inj-pen-window">{children}</div>
    </div>
  );
}

type FrascoProps = {
  concentration: number;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (value: number) => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** "Ler rótulo por foto" (INJECAO-X2), só com a IA autorizada e pronta. */
  labelAction?: ReactNode;
};

/** "Frasco: 1,34 mg/ml · Alterar": o editor da concentração só abre quando pedido. */
function FrascoRow({ concentration, isOpen, onToggle, onChange, toggleRef, labelAction }: FrascoProps) {
  const editorId = useId();
  return (
    <>
      <div className="inj-frasco">
        <span>
          Frasco: <strong data-testid={isOpen ? undefined : "injection-concentration"}>{concText(concentration)}</strong> mg/ml
        </span>
        <button
          ref={toggleRef}
          type="button"
          className="inj-toggle"
          aria-expanded={isOpen}
          aria-controls={editorId}
          onClick={onToggle}
        >
          Alterar<span className="sr-only"> a concentração do frasco</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {isOpen && (
        <div id={editorId} className="inj-conc">
          <p className="hint">Confira no rótulo (mg/ml)</p>
          {labelAction}
          <div className="inj-stepper">
            <button type="button" className="stepper-btn" aria-label={`Diminuir ${STEP_LABEL} mg/ml`}
              disabled={concentration <= CONCENTRATION_MIN} onClick={() => onChange(concentration - CONCENTRATION_STEP)}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <div className="stepper-value">
              <strong data-testid="injection-concentration">{concText(concentration)}</strong>
              <span>mg/ml</span>
            </div>
            <button type="button" className="stepper-btn" aria-label={`Aumentar ${STEP_LABEL} mg/ml`}
              disabled={concentration >= CONCENTRATION_MAX} onClick={() => onChange(concentration + CONCENTRATION_STEP)}>
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="quick-chips center">
            {CONCENTRATION_QUICK.map((value) => {
              const isOn = Math.abs(value - concentration) < 0.001;
              return (
                <button key={value} type="button" className={`quick-chip ${isOn ? "on" : ""}`} aria-pressed={isOn} onClick={() => onChange(value)}>
                  {fmtConcentration(value)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

type Props = {
  ctl: DoseController;
  customLabel: string;
  isFrascoOpen: boolean;
  onToggleFrasco: () => void;
  frascoRef: RefObject<HTMLButtonElement | null>;
  doseRef: RefObject<HTMLButtonElement | null>;
  onInvalidDose: () => void;
  /** Ação extra no editor do frasco (INJECAO-X2: "Ler rótulo por foto"). */
  labelAction?: ReactNode;
};

/** Medicação, frasco e a dose prescrita (um único valor), com a régua da bula quando há dose. */
export function DoseCard({
  ctl,
  customLabel,
  isFrascoOpen,
  onToggleFrasco,
  frascoRef,
  doseRef,
  onInvalidDose,
  labelAction,
}: Props) {
  const { dose, isPen, doseValue, overflowText, rulerMg, markHint } = ctl;
  const presets = medication(dose.medKey).presetsMg;
  const hasDose = doseValue !== null;
  const meds = useRadioKeys(MEDICATIONS.map((m) => m.key), dose.medKey, ctl.pickMedication);
  const value = <DoseValue value={doseValue} onApply={ctl.setDose} onInvalid={onInvalidDose} buttonRef={doseRef} />;
  return (
    <section className="card inj-card" aria-labelledby="inj-dose-title">
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div className="inj-seg inj-meds" role="radiogroup" aria-label="Medicação" onKeyDown={meds.onKeyDown}>
        {MEDICATIONS.map((m) => {
          const isOn = m.key === dose.medKey;
          const label = m.key === "personalizado" ? customLabel : m.label;
          return (
            <button key={m.key} type="button" role="radio" aria-checked={isOn} aria-label={label}
              tabIndex={meds.tabIndex(m.key)} className={isOn ? "on" : ""} onClick={() => ctl.pickMedication(m.key)}>
              {label}
            </button>
          );
        })}
      </div>
      {!isPen && (
        <FrascoRow concentration={dose.concentration} isOpen={isFrascoOpen} onToggle={onToggleFrasco}
          onChange={ctl.setConcentration} toggleRef={frascoRef} labelAction={labelAction} />
      )}
      <div className="inj-dose-head">
        <h2 id="inj-dose-title">Dose prescrita</h2>
        <p className="inj-note">Da sua prescrição: o app não sugere nem ajusta doses.</p>
      </div>
      {isPen ? (
        <PenWindow>{value}</PenWindow>
      ) : (
        <div className="inj-dose-row">
          {/* Na menor marca da seringa (1 UI) não há como diminuir: o botão diz isso em vez de calar. */}
          <button type="button" className="fine-btn" aria-label="Diminuir 0,05 mg"
            aria-disabled={!hasDose || (dose.units !== null && dose.units <= 1)}
            onClick={() => hasDose && !(dose.units !== null && dose.units <= 1) && ctl.stepDose(-1)}>
            <Minus size={18} aria-hidden="true" />
          </button>
          {value}
          <button type="button" className="fine-btn" aria-label="Aumentar 0,05 mg" aria-disabled={!hasDose}
            onClick={() => hasDose && ctl.stepDose(1)}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {markHint && <p className="hint inj-center">{markHint}</p>}
      <div className="quick-chips center inj-presets">
        {presets.map((mg) => {
          const isOn = ctl.isPresetOn(mg);
          return (
            <button key={mg} type="button" className={`quick-chip ${isOn ? "on" : ""}`} aria-pressed={isOn}
              aria-label={`Dose de ${fmtMg(mg)}`} onClick={() => ctl.setDose(mg)}>
              {fmtMg(mg)}
            </button>
          );
        })}
      </div>
      {!hasDose && <p className="hint inj-center">Escolha a dose da receita ou digite o valor em mg.</p>}
      {overflowText && (
        <p className="inj-alert neutral" role="status">
          {overflowText}
        </p>
      )}
      {rulerMg !== null && <DoseRuler medKey={dose.medKey} mg={rulerMg} />}
    </section>
  );
}
