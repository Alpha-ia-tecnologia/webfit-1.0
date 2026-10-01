import { z } from "zod";
import { clip, plannedItemSchema, TIME_RE, type BlockMeal } from "./agent-blocks";
import { fmtNumber } from "./format";

/**
 * Dieta estruturada (AGENTE-02). Módulo folha (pode importar agent-blocks): sem números
 * nutricionais e sem tacoId vindos do modelo; o app estima pela TACO.
 */

export const DIET_SLOTS = [
  "cafe_da_manha",
  "lanche_da_manha",
  "almoco",
  "lanche_da_tarde",
  "jantar",
  "ceia",
] as const;
export type DietSlot = (typeof DIET_SLOTS)[number];
export const dietItemSchema = plannedItemSchema.extend({ trocas: z.array(clip(80)).max(3) });
export const dietMealSchema = z.object({
  slot: z.enum(DIET_SLOTS),
  horario: z.string().regex(TIME_RE).nullable().catch(null),
  itens: z.array(dietItemSchema).min(1).max(8),
});
export const dietPlanV2Schema = z.object({
  resumo: z.object({ destaques: z.array(clip(200)).min(1).max(3) }),
  refeicoes: z.array(dietMealSchema).min(1).max(8),
  dicas: z.array(clip(200)).max(4),
  perguntas: z.array(clip(200)).max(3),
});
export type DietPlanV2 = z.infer<typeof dietPlanV2Schema>;
export type DietMeal = z.infer<typeof dietMealSchema>;
export type DietItem = z.infer<typeof dietItemSchema>;

export const SLOT_LABEL: Record<DietSlot, string> = {
  cafe_da_manha: "Café da manhã",
  lanche_da_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_da_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};
/** Categoria do diário em que cada refeição do plano é registrada. */
export const SLOT_CATEGORY: Record<DietSlot, BlockMeal> = {
  cafe_da_manha: "Café da manhã",
  lanche_da_manha: "Lanche",
  almoco: "Almoço",
  lanche_da_tarde: "Lanche",
  jantar: "Jantar",
  ceia: "Ceia",
};
/** Quanto tempo depois do horário sugerido a refeição ainda é a "próxima" (= MEAL_WINDOW_MINUTES). */
export const PLAN_WINDOW_MINUTES = 90;
export const PLAN_TIMES_NOTE = "Os horários são sugestões; ajuste à sua rotina.";

/** "Almoço · 12:00" ou só "Almoço" quando o plano não sugere horário. */
export function mealHeading(meal: DietMeal): string {
  return meal.horario ? `${SLOT_LABEL[meal.slot]} · ${meal.horario}` : SLOT_LABEL[meal.slot];
}

const bullets = (items: readonly string[]) => items.map((item) => `- ${item}`);

function itemLine(item: DietItem): string {
  const grams = item.gramas ? ` (≈ ${fmtNumber(item.gramas)} g)` : "";
  const swaps = item.trocas.length ? ` · trocas: ${item.trocas.join(", ")}` : "";
  return `- ${item.alimento}: ${item.medidaCaseira}${grams}${swaps}`;
}

/**
 * Texto estável do plano: é o que a guarda, o revisor e o chat leem e o que fica salvo em
 * dietPlan.text. Seções separadas por linha em branco; linhas de uma seção por quebra simples.
 */
export function renderDietText(plan: DietPlanV2): string {
  const meals = plan.refeicoes
    .map((meal) => [`### ${mealHeading(meal)}`, ...meal.itens.map(itemLine)].join("\n"))
    .join("\n\n");
  const timed = plan.refeicoes.some((meal) => meal.horario);
  const sections = [
    ["## Resumo", ...bullets(plan.resumo.destaques)].join("\n"),
    `## Seu dia de alimentação\n${timed ? `${PLAN_TIMES_NOTE}\n\n` : ""}${meals}`,
    plan.dicas.length ? ["## Para facilitar", ...bullets(plan.dicas)].join("\n") : null,
    plan.perguntas.length
      ? ["## Perguntas para ajustar", ...bullets(plan.perguntas)].join("\n")
      : null,
  ];
  return sections.filter((s): s is string => s !== null).join("\n\n");
}

/** Perfil sensível: porções só em medida caseira (sem gramas). Nunca muta o plano. */
export function sanitizeDietPlan(plan: DietPlanV2, ctx: { sensitive: boolean }): DietPlanV2 {
  if (!ctx.sensitive) return plan;
  return {
    ...plan,
    refeicoes: plan.refeicoes.map((meal) => ({
      ...meal,
      itens: meal.itens.map((item) => ({ ...item, gramas: null })),
    })),
  };
}

export interface NextPlannedMeal {
  /** Posição da refeição em plan.refeicoes. */
  index: number;
  meal: DietMeal;
  category: BlockMeal;
  /** Minutos até o horário sugerido; 0 quando ele já passou (nunca "atrasado"). */
  minutesUntil: number;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Próxima refeição do plano ainda sem registro. Só contam refeições com horário, em ordem de
 * horário; cada categoria registrada hoje consome uma refeição dessa categoria. Uma refeição
 * segue como próxima até 90 min depois do horário; a última, até o fim do dia.
 */
export function nextPlannedMeal(
  plan: DietPlanV2,
  now: string,
  loggedCategories: readonly string[],
): NextPlannedMeal | null {
  const timed = plan.refeicoes
    .map((meal, index) => ({ meal, index, at: meal.horario ? toMinutes(meal.horario) : null }))
    .filter((m): m is { meal: DietMeal; index: number; at: number } => m.at !== null)
    .sort((a, b) => a.at - b.at);
  const pending = timed.filter((m, position) => {
    const category = SLOT_CATEGORY[m.meal.slot];
    const logged = loggedCategories.filter((c) => c === category).length;
    const earlier = timed
      .slice(0, position)
      .filter((other) => SLOT_CATEGORY[other.meal.slot] === category).length;
    return earlier >= logged;
  });
  const current = toMinutes(now);
  const last = timed[timed.length - 1];
  const next = pending.find((m) => m === last || current <= m.at + PLAN_WINDOW_MINUTES);
  if (!next) return null;
  return {
    index: next.index,
    meal: next.meal,
    category: SLOT_CATEGORY[next.meal.slot],
    minutesUntil: Math.max(0, next.at - current),
  };
}
