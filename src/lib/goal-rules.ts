/**
 * Regras das metas automáticas (meta calórica e macros) a partir do perfil: faixas de IMC para o
 * déficit, ajuste para quem usa caneta, piso calórico, proteína por kg com peso ajustado e os
 * cuidados do perfil. Lógica pura; domain.ts reexporta o que as telas usam.
 */
import type { GoalStrategy, Profile } from "../types";
import { bmiOf, careNotesFor, parseConditionTags } from "./conditions";

/** Regras das metas automáticas; valores informados pela pessoa sempre prevalecem. */
export const GOAL_RULES = {
  /**
   * Déficit para perda de peso por faixa de IMC (da maior para a menor): fração do gasto
   * estimado, limitada a [min, max]. Abaixo de 18,5 não há déficit (manutenção com cuidado).
   */
  deficitBands: [
    { minBmi: 30, pct: 0.25, min: 500, max: 1000 },
    { minBmi: 25, pct: 0.2, min: 400, max: 600 },
    { minBmi: 18.5, pct: 0.15, min: 250, max: 400 },
  ],
  /** Quem usa caneta emagrecedora: +5 pontos percentuais no déficit de cada faixa. */
  penExtraPct: 0.05,
  /** Teto absoluto do déficit diário. */
  maxDeficit: 1000,
  /** Superávit moderado para ganho de peso. */
  surplus: 300,
  /** Piso calórico sem acompanhamento individual. */
  calorieFloor: { feminino: 1200, masculino: 1500 },
  /** Proteína por kg: base para manutenção; alta para perda ou ganho; caneta em qualquer objetivo. */
  proteinPerKg: { base: 1.2, high: 1.6, pen: 1.8 },
  /** Acima deste IMC, a proteína usa o peso de referência (IMC 25) mais 40% do excesso. */
  adjustedWeightBmi: 30,
  referenceBmi: 25,
  excessWeightShare: 0.4,
  /** Teto da proteína como fração das calorias (maior com caneta). */
  proteinMaxShare: 0.35,
  penProteinMaxShare: 0.4,
  /** Fração das calorias vinda de gorduras. */
  fatShare: 0.3,
  /**
   * Ajuste dinâmico da meta de hoje pelo dia anterior (adaptiveAdjustment). Só olha ontem, comparado
   * à meta-base de ontem (não à ajustada): sem encadear ajustes nem oscilar.
   */
  adaptive: {
    /** Ontem só conta com pelo menos 2 refeições registradas (dia sem registro não é "comeu pouco"). */
    minMeals: 2,
    /** Diferença de até 10% da meta-base de ontem não muda nada. */
    tolerance: 0.1,
    /** Metade da diferença volta para hoje, no sentido oposto. */
    factor: 0.5,
    /** Teto do ajuste: 10% da meta-base de hoje e 250 kcal (o menor dos dois). */
    maxShare: 0.1,
    maxKcal: 250,
    /** Os carboidratos absorvem o ajuste, sem ficar abaixo de 50% da meta-base; gorduras não mudam. */
    minCarbsShare: 0.5,
    /** Proteína de ontem abaixo de 80% da meta: hoje +10% (até 20 g), trocada por carboidratos. */
    proteinLowShare: 0.8,
    proteinBoostShare: 0.1,
    proteinBoostMaxG: 20,
  },
} as const;
/** IMC abaixo do qual não se aplica déficit (a menor faixa de GOAL_RULES.deficitBands). */
export const UNDERWEIGHT_BMI = 18.5;
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
const fmtKcal = (n: number) => n.toLocaleString("pt-BR");

/** Campos que as metas automáticas leem; o rascunho da anamnese também os fornece. */
export type GoalProfile = Pick<
  Profile,
  | "birthDate"
  | "sex"
  | "pregnancy"
  | "eatingDisorder"
  | "conditions"
  | "conditionTags"
  | "weightLossPen"
  | "fluidRestriction"
  | "weight"
  | "height"
  | "activityLevel"
  | "goal"
  | "manualCalories"
  | "manualWater"
  | "manualProtein"
  | "manualCarbs"
  | "manualFat"
>;
export interface CaloriePlan {
  calories: number | null;
  strategy: GoalStrategy;
  source: string;
  note: string | null;
}
const usesPen = (profile: Pick<GoalProfile, "weightLossPen">) =>
  profile.weightLossPen === "sim";
/** Piso calórico sem acompanhamento individual (1.200 kcal; 1.500 para o sexo masculino). */
export const calorieFloorFor = (profile: Pick<GoalProfile, "sex">) =>
  profile.sex === "masculino"
    ? GOAL_RULES.calorieFloor.masculino
    : GOAL_RULES.calorieFloor.feminino;
/** Teto da proteína como fração das calorias: 35%, ou 40% com caneta. */
export const proteinMaxShareFor = (profile: Pick<GoalProfile, "weightLossPen">) =>
  usesPen(profile) ? GOAL_RULES.penProteinMaxShare : GOAL_RULES.proteinMaxShare;
const profileBmi = (profile: Pick<GoalProfile, "weight" | "height">) =>
  bmiOf(profile.weight, profile.height);
/** IMC abaixo de 18,5 (qualquer objetivo): a meta do dia nunca diminui no ajuste dinâmico. */
export const isUnderweight = (profile: Pick<GoalProfile, "weight" | "height">) => {
  const bmi = profileBmi(profile);
  return bmi !== null && bmi < UNDERWEIGHT_BMI;
};
/** Objetivo de perder peso com IMC abaixo de 18,5: sem déficit e com aviso de cuidado. */
const isUnderweightForLoss = (profile: GoalProfile) =>
  profile.goal === "perder" && isUnderweight(profile);
/** Déficit pela faixa de IMC (+5 pontos percentuais com caneta), limitado à faixa e ao teto. */
export function deficitFor(
  expenditure: number,
  bmi: number | null,
  pen: boolean,
): number {
  const bands = GOAL_RULES.deficitBands;
  const band = bands.find((b) => (bmi ?? 0) >= b.minBmi) ?? bands.at(-1)!;
  const pct = band.pct + (pen ? GOAL_RULES.penExtraPct : 0);
  const max = Math.min(band.max, GOAL_RULES.maxDeficit);
  return Math.min(max, Math.max(band.min, Math.round(expenditure * pct)));
}
/** Palavras do ajuste do déficit, sem o valor do IMC nem do peso (seguro com "Ocultar números do corpo"). */
const deficitBasis = (pen: boolean) =>
  pen
    ? "ajustado ao seu perfil: IMC, estilo de vida e uso da caneta"
    : "ajustado ao seu perfil: IMC e estilo de vida";
/** Meta calórica automática a partir do gasto estimado, do objetivo, do IMC e do uso de caneta. */
export function caloriePlan(
  profile: GoalProfile,
  expenditure: number | null,
): CaloriePlan {
  if (expenditure === null)
    return {
      calories: null,
      strategy: null,
      source: "Meta calórica não definida",
      note: null,
    };
  const floor = calorieFloorFor(profile);
  const floorText = `${fmtKcal(floor)} kcal`;
  const maintenance = (note: string | null): CaloriePlan => ({
    calories: expenditure,
    strategy: "manutencao",
    source: "Estimativa de manutenção",
    note,
  });
  if (profile.goal === "manter" || profile.goal === "organizar")
    return maintenance(null);
  if (profile.goal === "ganhar")
    return {
      calories: expenditure + GOAL_RULES.surplus,
      strategy: "superavit",
      source: "Estimativa com superávit moderado para ganho de peso",
      note: `Superávit de ${GOAL_RULES.surplus} kcal/dia sobre o gasto estimado.`,
    };
  if (isUnderweightForLoss(profile))
    return maintenance(
      "Pelo seu perfil, a meta fica no gasto estimado, sem déficit.",
    );
  if (expenditure <= floor)
    return maintenance(
      `Seu gasto estimado já está no piso de ${floorText}; sem acompanhamento individual não aplicamos déficit.`,
    );
  const pen = usesPen(profile);
  const deficit = deficitFor(expenditure, profileBmi(profile), pen);
  const calories = Math.max(floor, expenditure - deficit);
  const applied = expenditure - calories;
  const floorNote =
    applied < deficit ? `, limitado pelo piso de ${floorText}` : "";
  return {
    calories,
    strategy: "deficit",
    source: "Estimativa com déficit ajustado ao seu perfil para perda de peso",
    note: `Déficit de ${fmtKcal(applied)} kcal/dia sobre o gasto estimado, ${deficitBasis(pen)}${floorNote}.`,
  };
}

export interface MacroPlan {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}
/** Peso-base da proteína: o peso atual, ou, com IMC acima de 30, a referência do IMC 25 mais 40% do excesso. */
export function proteinBaseWeight(
  profile: Pick<GoalProfile, "weight" | "height">,
): number {
  const bmi = profileBmi(profile);
  if (bmi === null || bmi <= GOAL_RULES.adjustedWeightBmi)
    return profile.weight;
  const meters = profile.height / 100;
  const reference = GOAL_RULES.referenceBmi * meters * meters;
  return (
    reference + GOAL_RULES.excessWeightShare * (profile.weight - reference)
  );
}
const proteinPerKg = (profile: GoalProfile) =>
  usesPen(profile)
    ? GOAL_RULES.proteinPerKg.pen
    : profile.goal === "perder" || profile.goal === "ganhar"
      ? GOAL_RULES.proteinPerKg.high
      : GOAL_RULES.proteinPerKg.base;
/** Macros a partir das calorias: proteína por kg (com teto), gorduras por fração, carboidratos pelo restante. */
export function macroPlan(
  profile: GoalProfile,
  calories: number | null,
): MacroPlan {
  if (calories === null)
    return {
      protein: profile.manualProtein,
      carbs: profile.manualCarbs,
      fat: profile.manualFat,
    };
  const maxShare = proteinMaxShareFor(profile);
  const proteinCap = Math.floor((calories * maxShare) / KCAL_PER_G.protein);
  // Macros automáticos nunca ultrapassam o que sobra das calorias depois dos valores manuais.
  const proteinBudget =
    profile.manualFat === null
      ? Infinity
      : Math.max(
          0,
          Math.floor(
            (calories - profile.manualFat * KCAL_PER_G.fat) /
              KCAL_PER_G.protein,
          ),
        );
  const protein =
    profile.manualProtein ??
    Math.min(
      Math.round(proteinPerKg(profile) * proteinBaseWeight(profile)),
      proteinCap,
      proteinBudget,
    );
  const fatShare = GOAL_RULES.fatShare;
  const fatBudget = Math.max(
    0,
    Math.floor((calories - protein * KCAL_PER_G.protein) / KCAL_PER_G.fat),
  );
  const fat =
    profile.manualFat ??
    Math.min(Math.round((calories * fatShare) / KCAL_PER_G.fat), fatBudget);
  const carbs =
    profile.manualCarbs ??
    Math.max(
      0,
      Math.round(
        (calories - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) /
          KCAL_PER_G.carbs,
      ),
    );
  return { protein, carbs, fat };
}

/** Cuidados do perfil que acompanham as metas; vazio quando as respostas pedem avaliação individual. */
export function goalCareNotes(
  profile: GoalProfile,
  restricted: boolean,
): string[] {
  if (restricted) return [];
  return careNotesFor({
    conditionTags: parseConditionTags(profile.conditionTags),
    usesPen: usesPen(profile),
    fluidRestriction: profile.fluidRestriction,
    underweightForLoss: isUnderweightForLoss(profile),
  });
}

/** Metas-base usadas no ajuste dinâmico (gramas e kcal inteiros). */
export interface AdaptiveBase {
  calories: number;
  protein: number;
  carbs: number;
}
export interface AdaptiveInput {
  /** Meta-base (automática) de hoje. */
  today: AdaptiveBase;
  /** Meta-base de ontem (null quando ontem não tinha meta). */
  yesterday: { calories: number | null; protein: number | null };
  /** O que foi registrado ontem. */
  eaten: { calories: number; protein: number; meals: number };
  /** Piso calórico do perfil (1.200/1.500 kcal). */
  floor: number;
  /** Teto da proteína como fração das calorias (35%, ou 40% com caneta). */
  proteinMaxShare: number;
  /** false com "Ocultar calorias": só a proteína pode subir (sem mudar as calorias). */
  adjustCalories: boolean;
  /** IMC abaixo de 18,5: a meta nunca diminui; comer mais ontem não recria um déficit hoje. */
  noDecrease?: boolean;
}
export interface AdaptiveResult {
  calories: number;
  protein: number;
  carbs: number;
  /** Ajuste em kcal sobre a meta-base de hoje (negativo: meta menor). */
  adjustment: number;
  /** Gramas de proteína somadas hoje (nunca negativo). */
  proteinBoost: number;
}

/** Ajuste em kcal: metade da diferença de ontem, no sentido oposto, com tolerância, tetos e piso. */
function kcalAdjustment(input: AdaptiveInput): number {
  const rules = GOAL_RULES.adaptive;
  const yesterday = input.yesterday.calories;
  if (!input.adjustCalories || yesterday === null || yesterday <= 0) return 0;
  const diff = input.eaten.calories - yesterday;
  if (Math.abs(diff) <= yesterday * rules.tolerance) return 0;
  const base = input.today.calories;
  const limit = Math.min(Math.round(base * rules.maxShare), rules.maxKcal);
  const clamped = Math.max(-limit, Math.min(limit, -Math.round(diff * rules.factor)));
  // IMC abaixo de 18,5: a meta só sobe; comer mais ontem não recria um déficit.
  if (input.noDecrease && clamped < 0) return 0;
  // Nunca abaixo do piso: se a base já está nele (ou abaixo), a meta não diminui.
  return Math.max(clamped, Math.min(0, input.floor - base)) || 0;
}

/** Gramas de proteína a somar hoje quando ontem ficou abaixo de 80% da meta, dentro dos tetos. */
function proteinBoostFor(input: AdaptiveInput, calories: number, carbsRoom: number): number {
  const rules = GOAL_RULES.adaptive;
  const goal = input.yesterday.protein;
  if (goal === null || goal <= 0 || input.eaten.protein >= goal * rules.proteinLowShare) return 0;
  const wanted = Math.min(
    Math.round(input.today.protein * rules.proteinBoostShare),
    rules.proteinBoostMaxG,
  );
  const shareCap =
    Math.floor((calories * input.proteinMaxShare) / KCAL_PER_G.protein) - input.today.protein;
  return Math.max(0, Math.min(wanted, shareCap, carbsRoom));
}

/**
 * Meta de hoje ajustada pelo dia anterior: calorias acima/abaixo da meta-base de ontem (fora da
 * tolerância) reduzem/aumentam a de hoje pela metade, absorvidas nos carboidratos; proteína baixa
 * ontem soma proteína hoje, trocada por carboidratos (sem mudar as calorias). Proteína nunca diminui.
 */
export function adaptiveAdjustment(input: AdaptiveInput): AdaptiveResult {
  const { today } = input;
  const unchanged = { ...today, adjustment: 0, proteinBoost: 0 };
  if (input.eaten.meals < GOAL_RULES.adaptive.minMeals) return unchanged;
  const minCarbs = Math.ceil(today.carbs * GOAL_RULES.adaptive.minCarbsShare);
  let adjustment = kcalAdjustment(input);
  let carbs = today.carbs + Math.round(adjustment / KCAL_PER_G.carbs);
  if (carbs < minCarbs) {
    // Carboidratos no mínimo: o ajuste em kcal acompanha o que eles conseguem absorver.
    carbs = minCarbs;
    adjustment = (minCarbs - today.carbs) * KCAL_PER_G.carbs;
  }
  const calories = today.calories + adjustment;
  const proteinBoost = proteinBoostFor(input, calories, carbs - minCarbs);
  return {
    calories,
    protein: today.protein + proteinBoost,
    carbs: carbs - proteinBoost,
    adjustment,
    proteinBoost,
  };
}
