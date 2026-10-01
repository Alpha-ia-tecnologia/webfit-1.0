import { localTime } from "@shared/lib/domain";
import {
  DEFAULT_SYRINGE,
  doseMg,
  injectionSummary,
  isPenMethod,
  isRecipeFresh,
  lastRecipe,
  medication,
  medicationFor,
  suggestedSide,
  type DoseRecipe,
  type MedicationKey,
} from "@shared/lib/injection";
import type { InjectionEntry, InjectionMethod, InjectionSide, InjectionSite, Profile, SyringeUnits } from "@shared/types";

/** Estado inicial da calculadora: vista, modo, medicação, frasco, seringa, dose, local e quando. */
export interface InjectionSeed {
  view: "recipe" | "form";
  /** Receita fresca (dose de sempre em um toque); null se velha ou sem histórico. */
  recipe: DoseRecipe | null;
  /** Há histórico, mas antigo demais: o formulário abre com a dose vazia e o aviso. */
  isStale: boolean;
  method: InjectionMethod;
  medKey: MedicationKey;
  /** Nome salvo no registro de origem (mantém "Mounjaro" ou o nome personalizado). */
  medication: string | null;
  concentration: number;
  syringe: SyringeUnits;
  units: number | null;
  targetMg: number | null;
  penDose: number | null;
  site: InjectionSite;
  /** Lado do registro em edição; nos outros casos, o sugerido para o local (null sem lado conhecido). */
  side: InjectionSide | null;
  day: string;
  time: string;
  notes: string;
}

/**
 * Edição: tudo do registro. Receita fresca: tudo da receita, inclusive a dose (vista "recipe", a menos que o
 * Hoje peça o formulário). Receita velha: modo, medicação, frasco e seringa, com a dose vazia. Sem histórico:
 * frasco e seringa, medicação e concentração da anamnese, seringa de 30 UI e dose vazia.
 */
export function seedFor({
  editing,
  list,
  profile,
  today,
  view,
}: {
  editing: InjectionEntry | null;
  list: readonly InjectionEntry[];
  profile: Pick<Profile, "weightLossPenName" | "weightLossPenPerMonth">;
  today: string;
  view: "auto" | "form";
}): InjectionSeed {
  const summary = injectionSummary(list, today);
  const blank = { day: today, time: localTime(), notes: "", site: summary.suggestedSite, side: summary.suggestedSide };
  if (editing) {
    const method = editing.method ?? "frasco";
    const isPen = isPenMethod(method);
    const medKey = medicationFor(editing.medication);
    const concentration = editing.concentrationMgPerMl ?? medication(medKey).concentration;
    const units = isPen ? null : editing.units;
    return {
      view: "form",
      recipe: null,
      isStale: false,
      method,
      medKey,
      medication: editing.medication,
      concentration,
      syringe: editing.syringeUnits ?? DEFAULT_SYRINGE,
      units,
      targetMg: isPen ? editing.doseMg : units === null ? null : doseMg(units, concentration),
      penDose: isPen ? editing.doseMg : null,
      site: editing.site,
      side: editing.side ?? null,
      day: editing.date,
      time: editing.time,
      notes: editing.notes,
    };
  }
  const latest = lastRecipe(list, today);
  if (latest) {
    const fresh = isRecipeFresh(latest, today, profile.weightLossPenPerMonth);
    const isPen = isPenMethod(latest.method);
    const concentration = latest.concentrationMgPerMl ?? medication(latest.medicationKey).concentration;
    const base = {
      method: latest.method,
      medKey: latest.medicationKey,
      medication: latest.medication,
      concentration,
      syringe: latest.syringeUnits ?? DEFAULT_SYRINGE,
      ...blank,
      site: latest.site,
      side: suggestedSide(list, latest.site, today),
    };
    if (fresh)
      return {
        ...base,
        view: view === "form" ? "form" : "recipe",
        recipe: latest,
        isStale: false,
        units: isPen ? null : latest.units,
        targetMg: latest.doseMg,
        penDose: isPen ? latest.doseMg : null,
      };
    return { ...base, view: "form", recipe: null, isStale: true, units: null, targetMg: null, penDose: null };
  }
  const medKey = medicationFor(profile.weightLossPenName);
  return {
    view: "form",
    recipe: null,
    isStale: false,
    method: "frasco",
    medKey,
    medication: null,
    concentration: medication(medKey).concentration,
    syringe: DEFAULT_SYRINGE,
    units: null,
    targetMg: null,
    penDose: null,
    ...blank,
  };
}
