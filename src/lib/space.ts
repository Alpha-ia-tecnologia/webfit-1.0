/** Resumos do "Meu espaço" (web e app nativo): identidade, metas, inventário e backup. */
import type { StepperConfig } from "../data/anamneseOptions";
import {
  profileSchema,
  type AppState,
  type Draft,
  type Goals,
  type Profile,
  type ToastAction,
} from "../types";
import type { AiProviders } from "./agent-presentation";
import { canShowBodyNumbers } from "./anamnese-flow";
import { bmiGauge } from "./body-metrics";
import { AI_CONSENT_VERSION } from "./consent";
import { isSensitive } from "./day";
import {
  ageAt,
  goalsFor,
  KCAL_PER_G,
  localDate,
  shiftDate,
  withManualGoals,
  type ManualGoals,
} from "./domain";
import { fmtBmi, fmtDayMonth, fmtDelta, fmtNumber, fmtRelDate, plural } from "./format";

const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "set/2026" a partir de uma data YYYY-MM-DD. */
export function fmtMonthYear(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]}/${date.slice(0, 4)}`;
}

/** Data mais antiga com dados do perfil (metas, medições ou diário); null sem registros. */
export function memberSince(state: AppState): string | null {
  const dates = [
    ...state.goalHistory.map((h) => h.date),
    ...state.measurements.map((m) => m.date),
    ...state.diary.map((e) => e.date),
  ].sort();
  return dates[0] ?? null;
}

/** Dias com algum registro no diário dentro da janela que termina hoje ("23 de 30 dias"). */
export function activeDays(
  state: AppState,
  today = localDate(),
  window = 30,
): number {
  const start = shiftDate(today, -(window - 1));
  return new Set(
    state.diary
      .filter((e) => e.date >= start && e.date <= today)
      .map((e) => e.date),
  ).size;
}

export interface InventoryItem {
  key:
    | "diario"
    | "medidas"
    | "exames"
    | "consultas"
    | "mensagens"
    | "combinados";
  label: string;
  count: number;
}
/** O que está guardado neste aparelho; também compara o estado atual com um backup. */
export function inventory(state: AppState): InventoryItem[] {
  return [
    { key: "diario", label: "Registros", count: state.diary.length },
    { key: "medidas", label: "Medições", count: state.measurements.length },
    { key: "exames", label: "Exames", count: state.exams.length },
    { key: "consultas", label: "Consultas", count: state.appointments.length },
    { key: "mensagens", label: "Mensagens", count: state.messages.length },
    { key: "combinados", label: "Combinados", count: state.habits.length },
  ];
}

export interface MacroShare {
  key: "protein" | "carbs" | "fat";
  label: string;
  grams: number;
  /** Parte da energia das metas; as três somam 100. */
  percent: number;
}
const MACRO_LABELS = {
  protein: "Proteína",
  carbs: "Carbos",
  fat: "Gorduras",
} as const;

/** Divisão das metas de macronutrientes pela energia de cada um; null se faltar alguma meta. */
export function macroShares(
  goals: Pick<Goals, "protein" | "carbs" | "fat">,
): MacroShare[] | null {
  const keys = ["protein", "carbs", "fat"] as const;
  const grams = keys.map((k) => goals[k]);
  if (grams.some((g) => g === null)) return null;
  const kcal = keys.map((k, i) => (grams[i] as number) * KCAL_PER_G[k]);
  const total = kcal.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;
  const percents = kcal.map((v) => Math.round((v / total) * 100));
  // O arredondamento pode somar 99 ou 101: a diferença vai para a maior fatia.
  const largest = percents.indexOf(Math.max(...percents));
  percents[largest] += 100 - percents.reduce((sum, v) => sum + v, 0);
  return keys.map((key, i) => ({
    key,
    label: MACRO_LABELS[key],
    grams: grams[i] as number,
    percent: percents[i],
  }));
}

/** Régua "basal → meta → gasto"; null quando a estimativa não se aplica (perfil que pede avaliação). */
export function goalRuler(
  goals: Pick<Goals, "basal" | "calories" | "expenditure">,
): { basal: number; target: number; expenditure: number } | null {
  const { basal, calories, expenditure } = goals;
  if (basal === null || calories === null || expenditure === null) return null;
  return { basal, target: calories, expenditure };
}

export const LAST_BACKUP_KEY = "webfit-last-backup";
/** Até 30 dias o backup é considerado recente. */
export const BACKUP_FRESH_DAYS = 30;

/** Situação do último backup exportado neste aparelho (a data não faz parte dos dados salvos). */
export function backupStatus(
  lastIso: string | null,
  today = localDate(),
): { label: string; tone: "ok" | "attention" } {
  const last = lastIso ? new Date(lastIso) : null;
  if (!last || Number.isNaN(last.getTime()))
    return { label: "Nenhum backup exportado ainda", tone: "attention" };
  const day = localDate(last);
  const days = Math.round(
    (Date.parse(`${today}T12:00:00`) - Date.parse(`${day}T12:00:00`)) /
      86_400_000,
  );
  return {
    label: `Último backup: ${fmtRelDate(day, today)}`,
    tone: days <= BACKUP_FRESH_DAYS ? "ok" : "attention",
  };
}

/**
 * Linha do topo do Meu espaço (conceito 11): "34 anos · 165 cm". Com "Ocultar números do corpo"
 * a altura sai e fica só a idade.
 */
export function heroFacts(profile: Profile, today = localDate()): string {
  const age = `${ageAt(profile.birthDate, today)} anos`;
  return profile.hideBodyNumbers ? age : `${age} · ${fmtNumber(profile.height, 1)} cm`;
}

/** "23 de 30 dias", "8 pesagens", "2 exames": resumo neutro do perfil. */
export function profileStats(state: AppState, today = localDate()): string[] {
  return [
    `${activeDays(state, today)} de 30 dias`,
    plural(state.measurements.length, "pesagem", "pesagens"),
    plural(state.exams.length, "exame", "exames"),
  ];
}

/** Metas de energia e macros; a de água não tem estimativa automática. */
const AUTO_FIELDS = ["manualCalories", "manualProtein", "manualCarbs", "manualFat"] as const;
/** "Voltar ao automático": limpa energia e macros (a água informada continua). */
export const AUTO_GOALS: Partial<ManualGoals> = {
  manualCalories: null,
  manualProtein: null,
  manualCarbs: null,
  manualFat: null,
};

export interface GoalOrigin {
  key: "manual" | "auto" | "pending";
  label: string;
}
/** Selo do card: "Definida por você" com energia ou macro manual; "Automática" pela anamnese. */
export function goalOrigin(profile: Profile, goals: Pick<Goals, "reason">): GoalOrigin {
  if (hasManualGoals(profile)) return { key: "manual", label: "Definida por você" };
  if (goals.reason) return { key: "pending", label: "Aguardando orientação profissional" };
  return { key: "auto", label: "Automática" };
}

/** Alguma meta de energia ou macro informada pela pessoa (há o que voltar ao automático). */
export function hasManualGoals(profile: Profile): boolean {
  return AUTO_FIELDS.some((field) => profile[field] !== null);
}

/** Perfil sensível (transtorno alimentar ou gestação) mantém o card calmo, sem ajustar metas. */
export const canAdjustGoals = (profile: Profile): boolean => !isSensitive(profile);

export type GoalField = keyof ManualGoals;
export interface GoalStepper {
  field: GoalField;
  label: string;
  config: StepperConfig;
  /** O que vale com o campo em branco (estimativa automática); null sem estimativa. */
  auto: number | null;
}
const GOAL_STEPPERS: Record<
  GoalField,
  { label: string; goal: "calories" | "water" | "protein" | "carbs" | "fat"; config: StepperConfig }
> = {
  manualCalories: {
    label: "Calorias por dia",
    goal: "calories",
    config: { min: 800, max: 5000, step: 50, unit: "kcal", initial: 1800, quick: [] },
  },
  manualWater: {
    label: "Água por dia",
    goal: "water",
    config: { min: 500, max: 6000, step: 250, unit: "ml", initial: 2000, quick: [1500, 2000, 2500, 3000] },
  },
  manualProtein: {
    label: "Proteína",
    goal: "protein",
    config: { min: 20, max: 400, step: 5, unit: "g", initial: 100, quick: [] },
  },
  manualCarbs: {
    label: "Carboidratos",
    goal: "carbs",
    config: { min: 20, max: 800, step: 10, unit: "g", initial: 200, quick: [] },
  },
  manualFat: {
    label: "Gorduras",
    goal: "fat",
    config: { min: 10, max: 300, step: 5, unit: "g", initial: 60, quick: [] },
  },
};

/**
 * Metas da folha "Ajustar metas" (energia, água, proteína, carboidratos, gorduras); sem a de
 * energia com calorias ocultas. O "+" num campo em branco parte da estimativa automática.
 */
export function goalSteppers(profile: Profile, date = localDate()): GoalStepper[] {
  const fields = (Object.keys(GOAL_STEPPERS) as GoalField[]).filter(
    (field) => !(profile.hideCalories && field === "manualCalories"),
  );
  return fields.map((field) => {
    const { label, goal, config } = GOAL_STEPPERS[field];
    const auto = goalsFor({ ...profile, [field]: null }, date)[goal];
    const value = profile[field];
    const clamp = (n: number) => Math.min(config.max, Math.max(config.min, n));
    return {
      field,
      label,
      auto,
      config: {
        ...config,
        // Um valor salvo fora da faixa (a anamnese aceita mais) não salta ao tocar em − ou +.
        min: Math.min(config.min, value ?? config.min),
        max: Math.max(config.max, value ?? config.max),
        initial: auto === null ? config.initial : clamp(Math.round(auto / config.step) * config.step),
      },
    };
  });
}

/** Ajuda sob cada meta da folha: o que vale com o campo em branco. */
export function goalHint(stepper: GoalStepper): string {
  if (stepper.auto !== null)
    return `Em branco: ${fmtNumber(stepper.auto)} ${stepper.config.unit} pela estimativa.`;
  return stepper.field === "manualWater"
    ? "A meta de água é sempre informada por você."
    : "Sem estimativa automática para o seu perfil.";
}

/** Valores atuais das metas manuais (rascunho da folha). */
export function manualGoalsOf(profile: Profile): ManualGoals {
  const { manualCalories, manualWater, manualProtein, manualCarbs, manualFat } = profile;
  return { manualCalories, manualWater, manualProtein, manualCarbs, manualFat };
}

type Commit = (
  update: (state: AppState) => AppState,
  message?: string,
  action?: ToastAction,
) => Promise<boolean>;

/** Grava as metas com "Desfazer": perfil e histórico de antes são guardados dentro da gravação. */
export function commitManualGoals(
  commit: Commit,
  goals: Partial<ManualGoals>,
  message: string,
): Promise<boolean> {
  let before: Pick<AppState, "profile" | "goalHistory"> | null = null;
  return commit(
    (state) => {
      before = { profile: state.profile, goalHistory: state.goalHistory };
      return withManualGoals(state, goals);
    },
    message,
    {
      label: "Desfazer",
      onAction: () =>
        void commit((state) => (before ? { ...state, ...before } : state), "Metas anteriores restauradas."),
    },
  );
}

// ---------- Corpo (ESPACO-06) ----------

/**
 * Perfil calmo: transtorno alimentar, gestação ou amamentação (inclusive "prefiro não informar")
 * ou menor de 18 anos. Mesma regra de canShowBodyNumbers da anamnese: só o valor do peso, sem
 * tendência, IMC, lembrete de medição nem prévia de meta.
 */
export const isCalmProfile = (profile: Profile, today = localDate()): boolean =>
  !canShowBodyNumbers(profile, today);

/**
 * Números do corpo (ESPACO-13), regra única para todas as telas: "hidden" quando a pessoa ocultou
 * (mesmo em perfil calmo), "calm" só o valor do peso, "full" o resto.
 */
export type BodyNumbers = "full" | "calm" | "hidden";
export const bodyNumbers = (profile: Profile, today = localDate()): BodyNumbers =>
  profile.hideBodyNumbers ? "hidden" : isCalmProfile(profile, today) ? "calm" : "full";

export const BODY_TREND_POINTS = 8;
/** Marcas da régua do IMC: faixas de largura igual (bmiGauge), então caem em 25, 50 e 75 %. */
export const BMI_TICKS = [
  { value: 18.5, label: "18,5", position: 25 },
  { value: 25, label: "25", position: 50 },
  { value: 30, label: "30", position: 75 },
] as const;
export const BMI_REFERENCE_HINT = "Referência: 18,5 a 24,9";

export interface BodySummary {
  /** "72,4" (a unidade "kg" vai ao lado); null quando a pessoa ocultou os números do corpo. */
  weight: string | null;
  calm: boolean;
  /** "Ocultar números do corpo" (ESPACO-13): sem peso, tendência, IMC nem medidas; fica `measured`. */
  hidden: boolean;
  /**
   * Últimas pesagens (até 8, em ordem de data); null em perfil calmo ou com menos de 2.
   * `chip` é a variação com uma casa ("−4,0 kg", conceito 11) e `direction` escolhe a seta neutra.
   */
  trend: {
    values: number[];
    delta: string;
    since: string;
    speech: string;
    chip: string;
    direction: "down" | "up" | "flat";
  } | null;
  /** IMC e a posição do marcador (0–100) na régua neutra; null em perfil calmo. */
  bmi: { value: string; position: number } | null;
  /** "165 cm": `number` "165" e `unit` "cm" separados para o número grande do bloco. */
  tiles: { key: "height" | "waist"; label: string; value: string; number: string; unit: "cm" }[];
  /**
   * Trilha "Início 76,4 · Meta 66" (conceito 11): parte do caminho entre a primeira pesagem e o peso
   * desejado (0–1, nunca passa de 1). null em perfil calmo, sem peso desejado ou já no início = meta.
   */
  progress: { start: string; target: string; ratio: number; speech: string } | null;
  /** Quando foi a medição do perfil: "hoje", "ontem", "há 3 dias". */
  when: string;
  /** "Medido hoje · Balança em casa". */
  measured: string;
}

/** "−4,0 kg": sempre uma casa decimal, com o sinal de menos tipográfico. */
function fixedDelta(n: number): string {
  const value = Math.round(n * 10) / 10;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${sign}${abs} kg`;
}

/** Parte do caminho até o peso desejado, pela primeira pesagem da jornada; null sem caminho. */
function weightProgress(
  start: number,
  current: number,
  target: number | null | undefined,
): BodySummary["progress"] {
  if (target == null || !Number.isFinite(target) || Math.abs(start - target) < 0.05) return null;
  const ratio = Math.min(1, Math.max(0, (start - current) / (start - target)));
  const startText = fmtNumber(start, 1);
  const targetText = fmtNumber(target, 1);
  return {
    start: startText,
    target: targetText,
    ratio,
    speech: `Início ${startText} kg, meta ${targetText} kg.`,
  };
}

const cmTile = (key: "height" | "waist", label: string, cm: number) => {
  const number = fmtNumber(cm, 1);
  return { key, label, value: `${number} cm`, number, unit: "cm" as const };
};

/** Cartão "Corpo": peso, variação neutra, IMC sem categoria e medidas; null sem perfil. */
export function bodySummary(state: AppState, today = localDate()): BodySummary | null {
  const p = state.profile;
  if (!p) return null;
  const calm = isCalmProfile(p, today);
  const when = fmtRelDate(p.measurementDate, today);
  const measured = `Medido ${when} · ${p.measurementMethod || "método não informado"}`;
  if (bodyNumbers(p, today) === "hidden")
    return {
      weight: null,
      calm,
      hidden: true,
      trend: null,
      bmi: null,
      tiles: [],
      progress: null,
      when,
      measured,
    };
  const history = state.measurements
    .filter((m) => m.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weighIns = history.slice(-BODY_TREND_POINTS);
  const first = weighIns[0];
  const last = weighIns.at(-1);
  const trend =
    calm || weighIns.length < 2 || !first || !last
      ? null
      : (() => {
          const change = last.weight - first.weight;
          const delta = fmtDelta(change, "kg");
          const day = fmtDayMonth(first.date);
          const rounded = Math.round(change * 10) / 10;
          return {
            values: weighIns.map((m) => m.weight),
            delta,
            since: `desde ${day}`,
            speech: `Variação de ${delta} desde ${day}, em ${plural(weighIns.length, "pesagem", "pesagens")}.`,
            chip: fixedDelta(change),
            direction: rounded < 0 ? ("down" as const) : rounded > 0 ? ("up" as const) : ("flat" as const),
          };
        })();
  const gauge =
    calm || fmtBmi(p.weight, p.height) === "—"
      ? null
      : bmiGauge(p.weight / (p.height / 100) ** 2);
  const journeyStart = history[0]?.weight ?? p.weight;
  return {
    weight: fmtNumber(p.weight, 1),
    calm,
    hidden: false,
    trend,
    bmi: gauge ? { value: gauge.value, position: gauge.markerPercent } : null,
    // Perfil calmo: a altura fica; a cintura (composição corporal) não aparece.
    tiles: [
      cmTile("height", "Altura", p.height),
      ...(!calm && p.waist != null ? [cmTile("waist", "Cintura", p.waist)] : []),
    ],
    progress: calm ? null : weightProgress(journeyStart, p.weight, p.targetWeight),
    when,
    measured,
  };
}

// ---------- Preferências (ESPACO-10) ----------

export interface AgentStatus {
  label: string;
  tone: "ok" | "neutral" | "attention";
}

/** Linha "Agente" das preferências: sem consentimento, pronto (com os provedores) ou sem servidor. */
export function agentStatus(
  ready: boolean,
  consentAi: boolean,
  providers: AiProviders | null,
): AgentStatus {
  if (!consentAi) return { label: "Desativado nas suas escolhas", tone: "neutral" };
  if (!ready) return { label: "Sem conexão com o servidor do agente", tone: "attention" };
  const names = [
    ...(providers?.deepseek ? ["DeepSeek"] : []),
    ...(providers?.openai ? ["OpenAI"] : []),
  ];
  return { label: names.length ? `Pronto · ${names.join(" e ")}` : "Pronto", tone: "ok" };
}

/** 120 → "A cada 2 h", 135 → "A cada 2 h 15 min", 45 → "A cada 45 min". */
export function fmtInterval(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `A cada ${rest} min`;
  return rest ? `A cada ${hours} h ${rest} min` : `A cada ${hours} h`;
}

/** "22:00 às 07:00". */
export const quietLabel = (p: Pick<Profile, "quietStart" | "quietEnd">) =>
  `${p.quietStart} às ${p.quietEnd}`;

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | "hideCalories"
    | "hideBodyNumbers"
    | "remindersEnabled"
    | "consentAi"
    | "quietStart"
    | "quietEnd"
    | "hydrationInterval"
  >
>;

/**
 * Troca preferências do perfil (e do rascunho, se houver) sem mexer no histórico de metas.
 * Mudar a IA grava a versão atual do consentimento. Sem perfil, ou com valor inválido, lança.
 */
export function withProfilePatch(state: AppState, patch: ProfilePatch): AppState {
  if (!state.profile) throw new Error("Conclua a anamnese antes de mudar as preferências.");
  const consent = "consentAi" in patch ? { aiConsentVersion: AI_CONSENT_VERSION } : {};
  // Chave presente com undefined não apaga a resposta salva.
  const changes = Object.fromEntries(
    Object.entries({ ...patch, ...consent }).filter(([, value]) => value !== undefined),
  ) as Draft;
  return {
    ...state,
    profile: profileSchema.parse({ ...state.profile, ...changes }),
    draft: state.draft ? { ...state.draft, ...changes } : null,
  };
}
