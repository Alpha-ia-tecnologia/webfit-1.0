/**
 * "Seu ciclo da semana" (SERINGA-11): dicas gerais, curadas e locais, para cada fase depois da
 * aplicação semanal. Nenhum texto gerado por IA, nenhum número, nenhuma dose: a lista é fixa e revisada.
 * Filtros por perfil (transtorno alimentar, restrição de líquidos, alergias) valem em toda dica.
 * Nada aparece em gestação, amamentação, sem resposta ou para menores de 18.
 * Compartilhado pelo web e pelo app (sem DOM). ./domain não importa este módulo.
 */
import {
  habitSchema,
  type DiaryEntry,
  type HabitItem,
  type InjectionEntry,
  type Profile,
  type SymptomKey,
} from "../types";
import { allergenIn, allergenTokens } from "./allergens";
import { shiftDate } from "./dates";
import { daysBetween, penIntervalDays } from "./injection";
import { cycleDayOf } from "./symptoms";
import { isMinorOn, lastInjection, tracksDoseSchedule } from "./treatment";

export const CYCLE_PHASES = ["d0_2", "d3_5", "d6_7"] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];
export const PHASE_LABEL: Record<CyclePhase, string> = {
  d0_2: "Dias 0 a 2",
  d3_5: "Dias 3 a 5",
  d6_7: "Dias 6 e 7",
};
export const PHASE_SUFFIX = "depois da aplicação";
export const CYCLE_NOTE =
  "Dicas gerais para cada fase; não substituem a orientação de quem acompanha seu tratamento.";

const WEEKLY_DAYS = 7;
const TIPS_PER_PHASE = 3;
/** Janela dos efeitos que ordenam as dicas: 28 dias, inclusive hoje. */
const RANKING_WINDOW = 28;

/** 0–2 → d0_2, 3–5 → d3_5, 6–7 → d6_7; outro → null. */
export function cyclePhase(elapsedDays: number): CyclePhase | null {
  if (!Number.isInteger(elapsedDays) || elapsedDays < 0) return null;
  if (elapsedDays <= 2) return "d0_2";
  if (elapsedDays <= 5) return "d3_5";
  return elapsedDays <= WEEKLY_DAYS ? "d6_7" : null;
}

/** "Dia da aplicação", "1 dia depois da aplicação", "3 dias depois da aplicação". */
export function cycleDayLabel(elapsedDays: number): string {
  if (elapsedDays === 0) return "Dia da aplicação";
  return elapsedDays === 1
    ? `1 dia ${PHASE_SUFFIX}`
    : `${elapsedDays} dias ${PHASE_SUFFIX}`;
}

export type CycleTipKey =
  | "comer_devagar"
  | "porcoes_menores"
  | "preparacoes_leves"
  | "refeicoes_regulares"
  | "frutas_legumes"
  | "proteina_refeicoes"
  | "caminhada_leve"
  | "planejar_refeicoes"
  | "lanche_pratico"
  | "anotar_semana"
  | "goles_agua"
  | "descanso"
  | "sono_regular";
export interface CycleTip {
  key: CycleTipKey;
  phases: readonly CyclePhase[];
  text: string;
  combinado: { title: string; time: string };
  /** Fala de beber água: some com restrição de líquidos (≠ "nao"). */
  isHydration: boolean;
  /** Pode aparecer para transtorno alimentar (≠ "nao"): sem porção, proteína ou fome como meta. */
  isCalmSafe: boolean;
  /** Efeitos registrados que sobem a dica no ranking da fase. */
  symptoms: readonly SymptomKey[];
}

/** Lista fixa, revisada (nesta ordem). Sem números, dose, medicamento ou aplicação no texto. */
export const CYCLE_TIPS: readonly CycleTip[] = [
  {
    key: "comer_devagar",
    phases: ["d0_2"],
    text: "Coma devagar e faça pausas durante a refeição.",
    combinado: { title: "Comer devagar no jantar", time: "19:30" },
    isHydration: false,
    isCalmSafe: false,
    symptoms: ["nausea", "azia", "dor_barriga"],
  },
  {
    key: "porcoes_menores",
    phases: ["d0_2"],
    text: "Se o estômago estiver sensível, prefira porções menores, mais vezes ao dia.",
    combinado: { title: "Fazer um lanche no meio da tarde", time: "16:00" },
    isHydration: false,
    isCalmSafe: false,
    symptoms: ["nausea", "vomito", "azia"],
  },
  {
    key: "preparacoes_leves",
    phases: ["d0_2"],
    text: "Em dias de enjoo, preparações leves e menos gordurosas costumam cair melhor.",
    combinado: { title: "Preparar um almoço leve", time: "11:30" },
    isHydration: false,
    isCalmSafe: false,
    symptoms: ["nausea", "azia"],
  },
  {
    key: "refeicoes_regulares",
    phases: ["d3_5", "d6_7"],
    text: "Procure fazer as refeições em horários parecidos, mesmo em dias corridos.",
    combinado: { title: "Almoçar no mesmo horário", time: "12:30" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: [],
  },
  {
    key: "frutas_legumes",
    phases: ["d3_5"],
    text: "Inclua frutas, legumes e verduras ao longo do dia; eles ajudam o intestino.",
    combinado: { title: "Incluir uma fruta no lanche", time: "16:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: ["intestino_preso"],
  },
  {
    key: "proteina_refeicoes",
    phases: ["d3_5"],
    text: "Inclua uma fonte de proteína nas refeições principais.",
    combinado: { title: "Incluir proteína no café da manhã", time: "08:00" },
    isHydration: false,
    isCalmSafe: false,
    symptoms: [],
  },
  {
    key: "caminhada_leve",
    phases: ["d3_5"],
    text: "Uma caminhada leve depois de comer pode ajudar na digestão.",
    combinado: { title: "Caminhada leve depois do almoço", time: "13:00" },
    isHydration: false,
    isCalmSafe: false,
    symptoms: ["intestino_preso", "azia"],
  },
  {
    key: "planejar_refeicoes",
    phases: ["d6_7"],
    text: "Planeje as refeições dos próximos dias e deixe opções práticas à mão.",
    combinado: { title: "Planejar as refeições da semana", time: "18:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: [],
  },
  {
    key: "lanche_pratico",
    phases: ["d6_7"],
    text: "Deixe um lanche prático por perto para quando a fome aparecer.",
    combinado: { title: "Separar um lanche para a tarde", time: "10:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: [],
  },
  {
    key: "anotar_semana",
    phases: ["d6_7"],
    text: "Anote como você se sentiu nesta semana para conversar na próxima consulta.",
    combinado: { title: "Anotar como me senti na semana", time: "20:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: [],
  },
  {
    key: "goles_agua",
    phases: ["d0_2", "d3_5", "d6_7"],
    text: "Beba água em pequenos goles ao longo do dia.",
    combinado: { title: "Deixar uma garrafa de água por perto", time: "09:00" },
    isHydration: true,
    isCalmSafe: true,
    symptoms: ["nausea", "vomito", "diarreia", "tontura", "dor_cabeca"],
  },
  {
    key: "descanso",
    phases: ["d0_2", "d3_5"],
    text: "Se sentir cansaço, reserve um momento do dia para descansar.",
    combinado: { title: "Pausa para descansar à tarde", time: "15:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: ["cansaco", "tontura", "dor_cabeca"],
  },
  {
    key: "sono_regular",
    phases: ["d3_5", "d6_7"],
    text: "Tente dormir e acordar em horários parecidos.",
    combinado: { title: "Preparar para dormir no mesmo horário", time: "22:00" },
    isHydration: false,
    isCalmSafe: true,
    symptoms: ["cansaco"],
  },
];

export interface CycleInput {
  profile: Pick<
    Profile,
    | "weightLossPen"
    | "pregnancy"
    | "eatingDisorder"
    | "fluidRestriction"
    | "birthDate"
    | "weightLossPenPerMonth"
    | "allergyDetails"
  >;
  injections: readonly InjectionEntry[];
  diary: readonly DiaryEntry[];
  today: string;
}
export interface CyclePhaseView {
  phase: CyclePhase;
  label: string;
  isCurrent: boolean;
  tips: CycleTip[];
}
export interface CycleCardModel {
  phase: CyclePhase;
  label: string;
  dayLabel: string;
  top: CycleTip | null;
  phases: CyclePhaseView[];
  note: string;
}

/** Filtros do perfil: calmo com transtorno alimentar, sem hidratação com restrição de líquidos, sem alergênico (texto ou combinado). */
function allowedTips(phase: CyclePhase, profile: CycleInput["profile"]): CycleTip[] {
  const tokens = allergenTokens(profile.allergyDetails);
  return CYCLE_TIPS.filter(
    (tip) =>
      tip.phases.includes(phase) &&
      (profile.eatingDisorder === "nao" || tip.isCalmSafe) &&
      (profile.fluidRestriction === "nao" || !tip.isHydration) &&
      !allergenIn(tip.text, tokens, "food") &&
      !allergenIn(tip.combinado.title, tokens, "food"),
  );
}

/** Pares (fase, efeito) dos bem-estares dos últimos 28 dias, pela aplicação que governa cada registro. */
function symptomPairs(input: CycleInput): { phase: CyclePhase; key: SymptomKey }[] {
  const from = shiftDate(input.today, -(RANKING_WINDOW - 1));
  return input.diary
    .filter((e) => e.type === "bem_estar" && e.date >= from && e.date <= input.today)
    .flatMap((e) => {
      const gov = cycleDayOf(input.injections, e.date, input.today);
      const phase = gov ? cyclePhase(gov.day) : null;
      return phase ? (e.symptoms ?? []).map((s) => ({ phase, key: s.key })) : [];
    });
}

/** Dicas da fase depois dos filtros, pelos efeitos registrados na mesma fase (desc) e depois na ordem da lista; até 3. */
export function tipsFor(phase: CyclePhase, input: CycleInput): CycleTip[] {
  const keys = symptomPairs(input)
    .filter((pair) => pair.phase === phase)
    .map((pair) => pair.key);
  const score = (tip: CycleTip) => keys.filter((key) => tip.symptoms.includes(key)).length;
  // sort é estável: empates ficam na ordem de CYCLE_TIPS.
  return allowedTips(phase, input.profile)
    .map((tip) => ({ tip, score: score(tip) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TIPS_PER_PHASE)
    .map(({ tip }) => tip);
}

/** Cartão do ciclo: só com acompanhamento de dose (caneta "sim", gestação "nao"), adulto, aplicação semanal
 *  e a última aplicação (data ≤ today) de 0 a 7 dias atrás. */
export function cycleCard(input: CycleInput): CycleCardModel | null {
  const { profile, today } = input;
  if (!tracksDoseSchedule(profile) || isMinorOn(profile.birthDate, today)) return null;
  if (profile.weightLossPenPerMonth == null) return null;
  if (penIntervalDays(profile.weightLossPenPerMonth) !== WEEKLY_DAYS) return null;
  const last = lastInjection(input.injections, today);
  if (!last) return null;
  const elapsed = daysBetween(last.date, today);
  const phase = cyclePhase(elapsed);
  if (!phase) return null;
  const phases = CYCLE_PHASES.map(
    (p): CyclePhaseView => ({
      phase: p,
      label: PHASE_LABEL[p],
      isCurrent: p === phase,
      tips: tipsFor(p, input),
    }),
  );
  return {
    phase,
    label: PHASE_LABEL[phase],
    dayLabel: cycleDayLabel(elapsed),
    top: phases.find((view) => view.isCurrent)?.tips[0] ?? null,
    phases,
    note: CYCLE_NOTE,
  };
}

/** Combinado criado a partir da dica (título e horário da dica, criado hoje); null se o esquema recusar. */
export function habitFromTip(tip: CycleTip, id: string, today: string): HabitItem | null {
  const parsed = habitSchema.safeParse({
    id,
    title: tip.combinado.title,
    timeOfDay: tip.combinado.time,
    createdDate: today,
    completedDates: [],
  });
  return parsed.success ? parsed.data : null;
}
