/**
 * Alerta de ingestão para quem usa caneta emagrecedora (Hoje, web + app nativo).
 * Olha só os últimos dias já fechados e só conta dias com registro suficiente: um diário
 * incompleto não vira alerta. Nunca cita números, nunca fala de dose e não usa cobrança;
 * perfis calmos (gestação, transtorno alimentar, menor de 18) e quem tem condição que pede avaliação
 * individual (metas nulas: doença renal, insuficiência cardíaca, insulina…) nunca recebem o alerta.
 * Com restrição de líquidos informada (ou sem resposta), o texto não fala em beber água.
 */
import type { AppState, Profile } from "../types";
import { isCalmOn } from "./day";
import { GOAL_RULES, goalsForDate, needsIndividualCare, shiftDate, totalsFor } from "./domain";

export interface IntakeAlert {
  kind: "protein" | "low_intake";
  /** Título do Resumo do Hoje: até 7 palavras (o chip curto fica em INTAKE_CHIPS, day.ts). */
  title: string;
  /** Orientação da folha: até duas frases e 140 caracteres, sem números. */
  body: string;
}

/** Dias fechados olhados antes de hoje (também usado pelos sinais, signals.ts). */
export const LOOKBACK_DAYS = 5;
/** Um dia só conta com ao menos esta quantidade de refeições registradas. */
export const MIN_MEALS = 2;
/** Dias que precisam repetir o padrão para o alerta aparecer. */
export const MIN_DAYS = 3;
/** Proteína abaixo desta fração da meta do dia conta como dia baixo. */
const PROTEIN_SHARE = 0.7;

const LOW_INTAKE: IntakeAlert = {
  kind: "low_intake",
  title: "Você comeu pouco nos últimos dias",
  body: "Tente refeições menores e mais frequentes, com proteína, e beba água. Se enjoo ou falta de apetite continuarem, fale com quem prescreveu.",
};
/** Mesmo alerta sem a água: restrição de líquidos informada ou ainda sem resposta. */
const LOW_INTAKE_NO_WATER: IntakeAlert = {
  ...LOW_INTAKE,
  body: "Tente refeições menores e mais frequentes, com proteína em cada uma. Se enjoo ou falta de apetite continuarem, fale com quem prescreveu.",
};

/** Conselho de beber água só com "Não" na restrição de líquidos (como nas dicas do ciclo). */
export const canSuggestWater = (profile: Pick<Profile, "fluidRestriction">) =>
  profile.fluidRestriction === "nao";
const LOW_PROTEIN: IntakeAlert = {
  kind: "protein",
  title: "Proteína abaixo do combinado",
  body: "Inclua uma fonte de proteína em cada refeição, como ovos, iogurte, frango, peixe ou feijão, mesmo em porções pequenas.",
};

/** Piso calórico sem acompanhamento individual, o mesmo das metas automáticas. */
function calorieFloor(profile: Pick<Profile, "sex">): number {
  return profile.sex === "masculino"
    ? GOAL_RULES.calorieFloor.masculino
    : GOAL_RULES.calorieFloor.feminino;
}

/**
 * Abaixo de quanto o dia conta como "comeu pouco": o piso ou, se a meta-base daquele dia já é
 * menor (gasto estimado abaixo do piso, ou meta do profissional), a própria meta. Comer a meta
 * nunca vira alerta.
 */
function lowIntakeLimit(state: AppState, date: string, floor: number): number {
  const goal = goalsForDate(state, date).calories;
  return goal !== null && goal > 0 ? Math.min(floor, goal) : floor;
}

/** Os últimos dias antes de hoje com ao menos duas refeições registradas (dia sem registro não conta). */
export function qualifyingDays(state: AppState, today: string): string[] {
  return Array.from({ length: LOOKBACK_DAYS }, (_, i) => shiftDate(today, -(i + 1))).filter(
    (date) =>
      state.diary.filter((e) => e.date === date && e.type === "refeicao").length >= MIN_MEALS,
  );
}

/** Mede contra a meta-base do dia (goalsForDate), nunca contra a meta já ajustada pelo dia anterior. */
function isProteinLow(state: AppState, date: string, protein: number): boolean {
  const goal = goalsForDate(state, date).protein;
  return goal !== null && goal > 0 && protein < goal * PROTEIN_SHARE;
}

/**
 * null quando não há caneta, o perfil é calmo, as respostas pedem avaliação individual (o app não
 * dá metas nem conselhos de proteína e água) ou os dias registrados não mostram um padrão.
 */
export function intakeAlert(state: AppState, today: string): IntakeAlert | null {
  const profile = state.profile;
  if (!profile || profile.weightLossPen !== "sim" || isCalmOn(profile, today)) return null;
  if (needsIndividualCare(profile, today)) return null;
  const days = qualifyingDays(state, today);
  if (days.length < MIN_DAYS) return null;
  const totals = days.map((date) => ({ date, ...totalsFor(state.diary, date) }));
  const floor = calorieFloor(profile);
  // Com calorias ocultas a comparação com o piso não acontece: nada de kcal, nem implícito.
  const lowDays = totals.filter((t) => t.calories < lowIntakeLimit(state, t.date, floor));
  if (!profile.hideCalories && lowDays.length >= MIN_DAYS)
    return canSuggestWater(profile) ? LOW_INTAKE : LOW_INTAKE_NO_WATER;
  if (totals.filter((t) => isProteinLow(state, t.date, t.protein)).length >= MIN_DAYS)
    return LOW_PROTEIN;
  return null;
}
