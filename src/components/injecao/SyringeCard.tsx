import { useId, useState, type CSSProperties } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { fmtMl, fmtNumber2, syringeProfile, volumeMl } from "../../lib/injection";
import type { SyringeUnits } from "../../types";
import { useRadioKeys } from "../useRadioKeys";
import { SyringeFigure, SyringeLens } from "./SyringeFigure";
import type { DoseController } from "./useDoseState";

const SIZES: readonly SyringeUnits[] = [30, 50, 100];
/** Só a seringa de 100 UI (traços de 2 UI) ganha a lupa. */
const LENS_SYRINGE: SyringeUnits = 100;

type FineProps = {
  units: number | null;
  syringe: SyringeUnits;
  /** Dose fora da seringa: o ajuste fino fica aria-disabled e o toque mostra o aviso (como a barra). */
  isOverflow: boolean;
  onStep: (delta: number) => void;
  onSet: (units: number) => void;
};

/** Controle deslizante e ajuste fino por UI: desativados até existir uma dose que caiba. */
function ManualAdjust({ units, syringe, isOverflow, onStep, onSet }: FineProps) {
  const isEmpty = units === null;
  const down = (delta: number) => () => (isOverflow || !isEmpty) && onStep(-delta);
  return (
    <div className="inj-manual">
      <input
        className="inj-range"
        type="range"
        min={1}
        max={syringe}
        step={1}
        value={units ?? 1}
        disabled={isEmpty}
        aria-label="Unidades na seringa"
        aria-valuetext={isEmpty ? "Sem dose" : `${units} UI, ${fmtMl(volumeMl(units))}`}
        onChange={(e) => onSet(Number(e.target.value))}
      />
      <div className="inj-fine">
        <button type="button" className="fine-btn" aria-label="Diminuir 5 UI" aria-disabled={isEmpty} onClick={down(5)}>−5</button>
        <button type="button" className="fine-btn" aria-label="Diminuir 1 UI" aria-disabled={isEmpty} onClick={down(1)}>−1</button>
        <button type="button" className="fine-btn" aria-label="Aumentar 1 UI" aria-disabled={isOverflow} onClick={() => onStep(1)}>+1</button>
        <button type="button" className="fine-btn" aria-label="Aumentar 5 UI" aria-disabled={isOverflow} onClick={() => onStep(5)}>+5</button>
      </div>
    </div>
  );
}

/**
 * Seringa (SERINGA-03/06): tipo em segmentos, "Aspire até" em destaque, a seringa legível com
 * a lupa na de 100 UI e o ajuste manual recolhido.
 */
export function SyringeCard({ ctl }: { ctl: DoseController }) {
  const [isManualOpen, setManualOpen] = useState(false);
  const manualId = useId();
  const { dose, isOverflow } = ctl;
  const units = dose.units;
  const profile = syringeProfile(dose.syringe);
  const segments = { "--segments": SIZES.length, "--index": SIZES.indexOf(dose.syringe) } as CSSProperties;
  const sizes = useRadioKeys(SIZES, dose.syringe, ctl.pickSyringe);
  return (
    <section className="card inj-card" aria-labelledby="inj-syringe-title">
      <h2 id="inj-syringe-title">Seringa</h2>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div className="segmented inj-syringes" role="radiogroup" aria-label="Tipo de seringa" style={segments}
        onKeyDown={sizes.onKeyDown}>
        <span className="segmented-indicator" aria-hidden="true" />
        {SIZES.map((n) => {
          const isOn = n === dose.syringe;
          return (
            <button key={n} type="button" role="radio" aria-checked={isOn} aria-label={`Seringa de ${n} UI`}
              tabIndex={sizes.tabIndex(n)} className={isOn ? "active" : ""} onClick={() => ctl.pickSyringe(n)}>
              {n} UI
            </button>
          );
        })}
      </div>
      <div className="inj-hero">
        <span className="inj-hero-kicker">Aspire até</span>
        <strong className="inj-hero-units">{units !== null ? `${units} UI` : "—"}</strong>
        <span className="inj-hero-ml">
          <strong data-testid="injection-volume">{units !== null ? fmtNumber2(volumeMl(units)) : "—"}</strong> ml
        </span>
      </div>
      {units === null && !isOverflow && (
        <p className="hint inj-center">Informe a dose prescrita para ver quanto aspirar.</p>
      )}
      <p role="status" className="sr-only">{ctl.announcement}</p>
      <div className="inj-viewport">
        <SyringeFigure profile={profile} units={units} />
        {dose.syringe === LENS_SYRINGE && units !== null && <SyringeLens profile={profile} units={units} />}
        <p className="inj-caption">Leia na borda do êmbolo · imagem ilustrativa</p>
      </div>
      <div className="inj-tip">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <h3>Antes de medir</h3>
          <p>Confira o tipo da seringa antes de ler as unidades: 100 UI equivalem a 1 ml.</p>
        </div>
      </div>
      <button type="button" className="inj-toggle inj-toggle-wide" aria-expanded={isManualOpen}
        aria-controls={manualId} onClick={() => setManualOpen((v) => !v)}>
        Ajuste manual
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isManualOpen && (
        <div id={manualId}>
          <ManualAdjust units={units} syringe={dose.syringe} isOverflow={isOverflow}
            onStep={ctl.stepUnits} onSet={ctl.setUnits} />
        </div>
      )}
    </section>
  );
}
