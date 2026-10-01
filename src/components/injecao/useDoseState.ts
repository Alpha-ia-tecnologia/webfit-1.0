import { useState } from "react";
import { useApp } from "../../lib/context";
import { tapFeedback } from "../../lib/haptics";
import {
  DEFAULT_SYRINGE,
  DOSE_STEP_MG,
  applyDoseMg,
  clampConcentration,
  clampUnits,
  doseMg,
  doseOverflowText,
  fmtMl,
  isPenMethod,
  medication,
  medicationFor,
  nearestMarkText,
  presetMatches,
  rulerDoseMg,
  stepVialDose,
  unitsForDose,
  volumeMl,
  type MedicationKey,
} from "../../lib/injection";
import type { InjectionMethod, SyringeUnits } from "../../types";

/** Um único valor de dose: no frasco, UI (e a mg-alvo que as gerou); na caneta, a mg digitada. */
export interface DoseState {
  method: InjectionMethod;
  medKey: MedicationKey;
  concentration: number;
  syringe: SyringeUnits;
  units: number | null;
  targetMg: number | null;
  penDose: number | null;
}
/** Registro ou receita de onde a tela parte (mesmos nomes de campo do InjectionEntry). */
export interface DoseSource {
  method?: InjectionMethod;
  medication: string;
  concentrationMgPerMl: number | null;
  syringeUnits: SyringeUnits | null;
  units: number | null;
  doseMg: number;
}

const MAX_UNITS = 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Estado inicial: com `withDose`, a dose vem junto; receita antiga traz só frasco, seringa e método. */
export function seedDose(src: DoseSource | null, withDose: boolean, penName: string): DoseState {
  const method = src?.method ?? "frasco";
  const medKey = medicationFor(src?.medication ?? penName);
  const concentration = src?.concentrationMgPerMl ?? medication(medKey).concentration;
  const isPen = isPenMethod(method);
  const units = withDose && !isPen ? (src?.units ?? null) : null;
  const penDose = withDose && isPen && src ? src.doseMg : null;
  return {
    method,
    medKey,
    concentration,
    syringe: src?.syringeUnits ?? DEFAULT_SYRINGE,
    units,
    targetMg: units !== null ? doseMg(units, concentration) : penDose,
    penDose,
  };
}

/** "Aspire até 37 UI, 0,37 ml": o anúncio só sai depois de ações de dose, nunca a cada passo do controle. */
const aspireText = (units: number | null) =>
  units === null ? "" : `Aspire até ${units} UI, ${fmtMl(volumeMl(units))}`;

/**
 * Máquina de estados da dose (SERINGA-03/06/08). Nada é grampeado: se a mg prescrita não cabe
 * em 100 UI, as unidades ficam vazias e a tela mostra o aviso de concentração.
 */
export function useDoseState(initial: () => DoseState) {
  const { notify } = useApp();
  const [dose, setDoseState] = useState<DoseState>(initial);
  const [announcement, setAnnouncement] = useState("");
  const isPen = isPenMethod(dose.method);
  const needed =
    !isPen && dose.targetMg !== null && dose.units === null
      ? unitsForDose(dose.targetMg, dose.concentration)
      : null;
  const isOverflow = needed !== null && needed > MAX_UNITS;
  const doseValue = isPen
    ? dose.penDose
    : dose.units !== null
      ? doseMg(dose.units, dose.concentration)
      : isOverflow
        ? dose.targetMg
        : null;
  const canSave = isPen ? dose.penDose !== null : dose.units !== null;
  const overflowText =
    isOverflow && needed !== null && dose.targetMg !== null
      ? doseOverflowText(dose.targetMg, dose.concentration, needed)
      : null;
  /** Régua da bula: no frasco, a mg prescrita quando a UI é a marca mais próxima dela (0,25 mg → "Inicial"). */
  const rulerMg = isPen ? doseValue : rulerDoseMg(dose.targetMg, dose.units, dose.concentration);
  /** "50 UI é a marca mais próxima de 2,52 mg na seringa (2,50 mg)." ou null. */
  const markHint = isPen ? null : nearestMarkText(dose.targetMg, dose.units, dose.concentration);
  /** Atalho ativo: no frasco, a marca da seringa mais próxima dele (ou a mg que não coube); na caneta, a mg. */
  const isPresetOn = (mg: number) => {
    if (!isPen && dose.units !== null) return presetMatches(mg, dose.units, dose.concentration);
    return doseValue !== null && Math.abs(mg - doseValue) < 0.005;
  };
  /** Com a dose fora da seringa, os controles de UI explicam o motivo em vez de trocar a dose. */
  const warnOverflow = () => {
    if (overflowText) notify(overflowText, "warning");
  };

  const fitVial = (current: DoseState, mg: number, concentration = current.concentration): DoseState => {
    const fit = applyDoseMg(mg, concentration, current.syringe);
    return { ...current, concentration, targetMg: mg, units: fit.units, syringe: fit.syringe };
  };
  const apply = (next: DoseState, announce = true) => {
    setDoseState(next);
    if (announce) setAnnouncement(isPenMethod(next.method) ? "" : aspireText(next.units));
  };

  const setDose = (mg: number) =>
    apply(isPen ? { ...dose, penDose: mg, targetMg: mg } : fitVial(dose, mg));
  /**
   * ±0,05 mg. Sem UI (dose fora da seringa) ou subindo além de 100 UI, vai pelo caminho da dose
   * digitada (mg prescrita ± 0,05): o aviso de concentração aparece e nada é grampeado em 100 UI.
   */
  const stepDose = (direction: 1 | -1) => {
    if (isPen) return;
    const base =
      dose.targetMg ?? (dose.units !== null ? doseMg(dose.units, dose.concentration) : null);
    if (base === null) return;
    const typed = Math.max(DOSE_STEP_MG, round3(base + direction * DOSE_STEP_MG));
    const isPastSyringe =
      direction > 0 &&
      dose.units !== null &&
      (dose.units >= MAX_UNITS || unitsForDose(typed, dose.concentration) > MAX_UNITS);
    if (dose.units === null || isPastSyringe) {
      setDose(typed);
      return;
    }
    const next = stepVialDose(dose.units, dose.concentration, dose.syringe, direction);
    apply({ ...dose, ...next, targetMg: doseMg(next.units, dose.concentration) });
  };
  /** Controle deslizante e ajuste fino: sem anúncio (o aria-valuetext cobre), com vibração por UI. */
  const setUnits = (value: number) => {
    const units = clampUnits(value, dose.syringe);
    if (units === dose.units) return;
    tapFeedback();
    apply({ ...dose, units, targetMg: doseMg(units, dose.concentration) }, false);
  };
  /** Com o aviso de concentração à vista, ±1/±5 UI não trocam a dose prescrita em silêncio. */
  const stepUnits = (delta: number) => {
    if (isOverflow) {
      warnOverflow();
      return;
    }
    setUnits(dose.units === null ? Math.abs(delta) : dose.units + delta);
  };
  const setConcentration = (value: number) => {
    const concentration = clampConcentration(value);
    apply(
      dose.targetMg !== null && !isPen
        ? fitVial(dose, dose.targetMg, concentration)
        : { ...dose, concentration },
    );
  };
  const pickSyringe = (syringe: SyringeUnits) => {
    if (dose.units !== null && dose.units > syringe) {
      notify(
        `${dose.units} UI não cabem na seringa de ${syringe} UI. Use uma seringa maior ou revise a dose.`,
        "warning",
      );
      return;
    }
    apply({ ...dose, syringe });
  };
  const pickMedication = (medKey: MedicationKey) =>
    apply({
      ...dose,
      medKey,
      concentration: medication(medKey).concentration,
      units: null,
      targetMg: null,
      penDose: null,
    });
  const pickMethod = (method: InjectionMethod) => {
    if (method === dose.method) return;
    const toPen = isPenMethod(method);
    if (toPen) apply({ ...dose, method, penDose: doseValue, targetMg: doseValue }, false);
    else if (dose.penDose !== null) apply(fitVial({ ...dose, method }, dose.penDose));
    else apply({ ...dose, method, targetMg: null, units: null }, false);
  };

  return {
    dose,
    isPen,
    needed,
    isOverflow,
    overflowText,
    doseValue,
    rulerMg,
    markHint,
    canSave,
    announcement,
    isPresetOn,
    warnOverflow,
    setDose,
    stepDose,
    setUnits,
    stepUnits,
    setConcentration,
    pickSyringe,
    pickMedication,
    pickMethod,
  };
}
export type DoseController = ReturnType<typeof useDoseState>;
