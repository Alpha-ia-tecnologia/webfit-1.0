/**
 * "Recomendado para você" na anamnese (ANAM-05): metas a partir do rascunho, divisão dos
 * macronutrientes, coerência entre macros e energia e a meta de água em copos.
 * Com "Ocultar calorias", nenhum texto daqui traz número de calorias.
 */
import { z } from "zod";
import { profileSchema, type Draft, type Goals } from "../types";
import { toNumber } from "../components/anamnese/inputs";
import {
  goalsFor,
  KCAL_PER_G,
  MACRO_TOLERANCE,
  type GoalProfile,
} from "./domain";
import { fmtKcal, fmtNumber, fmtWater, plural } from "./format";
import { macroShares } from "./space";

// zod 4: .pick() não funciona no profileSchema refinado; os campos vêm de .shape.
const shape = profileSchema.shape;
const goalDraftSchema = z
  .object({
    birthDate: shape.birthDate,
    sex: shape.sex,
    pregnancy: shape.pregnancy,
    eatingDisorder: shape.eatingDisorder,
    conditions: shape.conditions,
    conditionTags: shape.conditionTags,
    // Caneta ainda sem resposta no rascunho ("") conta como não informada.
    weightLossPen: shape.weightLossPen.catch("nao_informado"),
    // Sem resposta ainda: conta como "não sei" (o cuidado da caneta sai sem o conselho de água).
    fluidRestriction: shape.fluidRestriction.catch("nao_sei"),
    weight: shape.weight,
    height: shape.height,
    activityLevel: shape.activityLevel,
    goal: shape.goal,
    manualCalories: shape.manualCalories,
    manualWater: shape.manualWater,
    manualProtein: shape.manualProtein,
    manualCarbs: shape.manualCarbs,
    manualFat: shape.manualFat,
  })
  // Sem condição marcada nem texto, a pergunta ainda não foi respondida.
  .refine((g) => g.conditionTags.length > 0 || g.conditions !== "");

/** Perfil de metas a partir do rascunho (campos de profileSchema.shape; null se faltar algum obrigatório). */
export function draftGoalProfile(a: Draft): GoalProfile | null {
  const parsed = goalDraftSchema.safeParse(a);
  return parsed.success ? parsed.data : null;
}
export const draftGoals = (a: Draft, today: string): Goals | null => {
  const g = draftGoalProfile(a);
  return g ? goalsFor(g, today) : null;
};

// ---------- Divisão dos macronutrientes ----------
/** % inteiros da energia; soma 100. */
export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}
export const MACRO_MIN_PCT = 10;
const PERCENT = 100;

export function splitOf(g: {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}): MacroSplit | null {
  const shares = macroShares(g);
  if (!shares) return null;
  const pct = (key: keyof MacroSplit) =>
    shares.find((s) => s.key === key)?.percent ?? 0;
  return { protein: pct("protein"), carbs: pct("carbs"), fat: pct("fat") };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Alça 0 fica entre proteína e carboidratos; alça 1 entre carboidratos e gorduras. Cada fatia ≥ 10 %. */
export function moveSplit(
  s: MacroSplit,
  handle: 0 | 1,
  delta: number,
): MacroSplit {
  const step = Math.round(Number.isFinite(delta) ? delta : 0);
  if (handle === 0) {
    const pair = s.protein + s.carbs;
    const protein = clamp(s.protein + step, MACRO_MIN_PCT, pair - MACRO_MIN_PCT);
    return { protein, carbs: pair - protein, fat: s.fat };
  }
  const pair = s.carbs + s.fat;
  const carbs = clamp(s.carbs + step, MACRO_MIN_PCT, pair - MACRO_MIN_PCT);
  return { protein: s.protein, carbs, fat: pair - carbs };
}

/** Posição da alça na barra (%): 0 → fim da proteína; 1 → fim dos carboidratos. */
export const handlePercent = (s: MacroSplit, handle: 0 | 1) =>
  handle === 0 ? s.protein : s.protein + s.carbs;

/** Arrasto: a alça vai para `percent` da barra, com os mesmos limites de moveSplit. */
export function splitAtPercent(
  s: MacroSplit,
  handle: 0 | 1,
  percent: number,
): MacroSplit {
  const target = clamp(Number.isFinite(percent) ? percent : 0, 0, PERCENT);
  return moveSplit(s, handle, Math.round(target) - handlePercent(s, handle));
}

export function gramsOf(
  calories: number,
  s: MacroSplit,
): { protein: number; carbs: number; fat: number } {
  return {
    protein: Math.round((calories * s.protein) / PERCENT / KCAL_PER_G.protein),
    carbs: Math.round((calories * s.carbs) / PERCENT / KCAL_PER_G.carbs),
    fat: Math.round((calories * s.fat) / PERCENT / KCAL_PER_G.fat),
  };
}

/** Valor falado de cada alça: percentuais, ou gramas com "Ocultar calorias". */
export function splitValueText(
  s: MacroSplit,
  grams: { protein: number; carbs: number; fat: number },
  handle: 0 | 1,
  hide: boolean,
): string {
  const part = (key: keyof MacroSplit) =>
    hide ? `${fmtNumber(grams[key])} g` : `${s[key]}%`;
  return handle === 0
    ? `Proteína ${part("protein")}, carboidratos ${part("carbs")}`
    : `Carboidratos ${part("carbs")}, gorduras ${part("fat")}`;
}

// ---------- Coerência entre macros e energia ----------
export interface GoalsCoherence {
  text: string;
  fixLabel: "Ajustar à meta";
  fix: { manualProtein: number; manualCarbs: number; manualFat: number };
}
const hasManualMacro = (g: GoalProfile) =>
  g.manualProtein !== null || g.manualCarbs !== null || g.manualFat !== null;

/** Só quando há meta de energia, algum macro manual e macroKcal > calorias × MACRO_TOLERANCE. */
export function goalsCoherence(
  g: GoalProfile,
  goals: Goals,
  hide: boolean,
): GoalsCoherence | null {
  const calories = goals.calories;
  if (calories === null || !hasManualMacro(g)) return null;
  const macroKcal =
    (goals.protein ?? 0) * KCAL_PER_G.protein +
    (goals.carbs ?? 0) * KCAL_PER_G.carbs +
    (goals.fat ?? 0) * KCAL_PER_G.fat;
  if (macroKcal <= calories * MACRO_TOLERANCE) return null;
  const split = splitOf(goals);
  if (!split) return null;
  const grams = gramsOf(calories, split);
  return {
    text: hide
      ? "Os macronutrientes passam da sua meta de energia."
      : `Os macronutrientes somam cerca de ${fmtKcal(macroKcal)}, acima da meta de ${fmtKcal(calories)}.`,
    fixLabel: "Ajustar à meta",
    fix: {
      manualProtein: grams.protein,
      manualCarbs: grams.carbs,
      manualFat: grams.fat,
    },
  };
}

// ---------- Cartão "Recomendado para você" ----------
export interface RecommendedModel {
  origin:
    | "Pela sua anamnese"
    | "Definida por você"
    | "Aguardando orientação profissional";
  /** "1.645"; null com hideCalories, sem meta ou perfil sensível. */
  calories: string | null;
  /** "110 g"; null no perfil sensível ou sem macros. */
  macros: { key: "protein" | "carbs" | "fat"; label: string; grams: string }[] | null;
  water: string | null;
  reason: string | null;
  actionLabel: "Personalizar" | "Informar metas de um profissional";
}
const MACRO_LABELS = {
  protein: "Proteína",
  carbs: "Carboidratos",
  fat: "Gorduras",
} as const;
/** A água não conta como meta "definida por você" (como em space.goalOrigin). */
const hasManualEnergyOrMacro = (g: GoalProfile) =>
  g.manualCalories !== null || hasManualMacro(g);

export function recommendedModel(
  g: GoalProfile,
  goals: Goals,
  hide: boolean,
  sensitive: boolean,
): RecommendedModel {
  const origin: RecommendedModel["origin"] = hasManualEnergyOrMacro(g)
    ? "Definida por você"
    : goals.reason
      ? "Aguardando orientação profissional"
      : "Pela sua anamnese";
  const macros = sensitive
    ? []
    : (["protein", "carbs", "fat"] as const).flatMap((key) => {
        const grams = goals[key];
        return grams === null
          ? []
          : [{ key, label: MACRO_LABELS[key], grams: `${fmtNumber(grams)} g` }];
      });
  return {
    origin,
    calories:
      hide || sensitive || goals.calories === null
        ? null
        : fmtNumber(goals.calories),
    macros: macros.length ? macros : null,
    water: goals.water === null ? null : fmtWater(goals.water),
    reason: goals.reason,
    actionLabel:
      goals.reason || sensitive
        ? "Informar metas de um profissional"
        : "Personalizar",
  };
}

// ---------- Água em copos ----------
export const GLASS_ML = 250;
export const MAX_WATER_ML = 6000;
/**
 * Um copo a mais ou a menos, grampeado a [250, 6000]. Sem meta e com sugestão, os botões partem
 * de suggestion.ml (o controle "começa" no consumo habitual), mas nada é gravado antes do toque.
 */
export function stepWater(ml: number | null, dir: 1 | -1): number {
  const glasses = Math.round((ml ?? 0) / GLASS_ML) + dir;
  return clamp(glasses * GLASS_ML, GLASS_ML, MAX_WATER_ML);
}

export interface WaterModel {
  glasses: number | null;
  /** "8 copos · 2 L" ou "—". */
  value: string;
  suggestion: { ml: number; label: string; hint: string } | null;
  note: string | null;
}
const glassesOf = (ml: number) => Math.round(ml / GLASS_ML);

export function waterModel(a: Draft): WaterModel {
  const manual = toNumber(a.manualWater);
  const usual = toNumber(a.usualWater);
  const restricted = a.fluidRestriction === "sim";
  const glasses = manual === null ? null : glassesOf(manual);
  const suggestionMl =
    manual === null && usual !== null && usual >= GLASS_ML && !restricted
      ? clamp(glassesOf(usual) * GLASS_ML, GLASS_ML, MAX_WATER_ML)
      : null;
  return {
    glasses,
    value:
      manual === null || glasses === null
        ? "—"
        : `${plural(glasses, "copo", "copos")} · ${fmtWater(manual)}`,
    suggestion:
      suggestionMl === null || usual === null
        ? null
        : {
            ml: suggestionMl,
            label: `Usar ${plural(glassesOf(suggestionMl), "copo", "copos")} (${fmtWater(suggestionMl)})`,
            hint: `Você contou que bebe cerca de ${fmtWater(usual)} por dia.`,
          },
    note: restricted
      ? "Com restrição de líquidos, informe só a meta de quem acompanha você."
      : null,
  };
}
