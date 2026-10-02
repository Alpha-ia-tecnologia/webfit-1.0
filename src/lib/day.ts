/**
 * Leitura do dia para a tela Hoje (web + app nativo): anel de energia e o cartão "Resumo", a única
 * voz proativa do Hoje. O cartão junta o recado do dia do agente, o alerta de ingestão (caneta), os
 * sinais do app e o ajuste da meta num título de até duas linhas, até três chips e uma ação; o
 * detalhe de cada item fica na folha (InsightSheet), a um toque. Tudo é determinístico e local;
 * nenhum texto menciona calorias ocultas e perfis sensíveis (transtorno alimentar, gestação ou
 * amamentação) não recebem cobrança de proteína nem nudges.
 */
import type { HabitItem, PantryItem, Profile } from "../types";
import { fmtMl, fmtNumber, fmtRelDate } from "./format";
import type { AdjustmentView } from "./balance-explain";
import type { IntakeAlert } from "./intake-alert";
import { visiblePlainText } from "./text";

export const MOOD_LABELS = ["Muito mal", "Mal", "Regular", "Bem", "Muito bem"] as const;

export interface EnergyRing {
  /** 0–100; acima da meta fica em 100 (neutro, sem alarme). */
  percent: number;
  remaining: number;
  reached: boolean;
}
export function energyRing(consumed: number, goal: number | null): EnergyRing | null {
  if (!goal) return null;
  const ratio = consumed / goal;
  return {
    percent: Math.min(100, Math.round(ratio * 100)),
    remaining: Math.max(0, Math.round(goal - consumed)),
    reached: ratio >= 1,
  };
}

/** Chave em signalDismissals do recado do dia (daily-comment.ts a reexporta; a data é a do recado dispensado). */
export const DAILY_COMMENT_KEY = "comentario-do-dia";

export type InsightAction =
  | { kind: "water"; ml: number; label: string }
  | { kind: "meal"; label: string }
  | { kind: "habit"; habitId: string; label: string }
  | { kind: "agent"; label: string }
  /** Abre a conversa com o agente, sem pergunta pronta (o recado do dia). */
  | { kind: "chat"; label: string };

/** Ação da folha (InsightSheet): pergunta pronta ao agente, abrir a conversa ou "Como calculamos". */
export type InsightSheetAction =
  | { kind: "agent"; label: string; prompt: string }
  | { kind: "chat"; label: string }
  | { kind: "explain"; label: string };

/** Tom do chip e da folha: cuidado (azul), reforço (verde-água), agente (menta), ajuste da meta, contexto. */
export type InsightTone = "info" | "positive" | "agent" | "adjust" | "neutral";

/** A folha de um chip ou do título: o detalhe que saiu da tela, uma ação e, quando cabe, dispensar. */
export interface InsightSheetModel {
  /** Identidade estável: id do sinal, "comment", "alert", "adjust" ou "protein". */
  id: string;
  tone: InsightTone;
  title: string;
  /** Uma ou duas frases, até 140 caracteres. */
  body: string;
  /**
   * Ajuste da meta em linhas (`Meta-base 1.806 → hoje 1.953`, delta, proteína), como em "Como calculamos":
   * quando vem, a folha mostra as linhas no lugar da frase (que fica como nome acessível).
   */
  rows?: AdjustmentView;
  action?: InsightSheetAction;
  /** "Dispensar por 3 dias" (sinais) ou "Dispensar o recado de hoje": a chave de signalDismissals e o rótulo. */
  dismiss?: { key: string; label: string };
}

/** Chip do cartão Resumo (e da linha de chips do Hoje em branco), com ícone pelo tipo. */
export interface InsightChip {
  kind: "water" | "habit" | "pantry" | "adjust" | "protein" | "alert" | "signal" | "comment";
  /** Texto curto do chip: "faltam 750 ml", "chá às 21:30", "↑ +147 kcal hoje", "Água abaixo". */
  text: string;
  /** Texto completo (title e nome acessível): "Chá calmante e higiene do sono às 21:30". */
  full: string;
  /** Chips com folha abrem o detalhe ao toque; os de contexto (água, combinado, despensa) só informam. */
  sheet?: InsightSheetModel;
}
export interface DayInsight {
  domain: "water" | "food" | "habit" | "neutral";
  /** De onde vem o título: recado do dia, alerta da caneta, sinal do app ou o próximo passo. */
  source: "comment" | "alert" | "signal" | "insight";
  /** Até duas linhas (≤ 90 caracteres). */
  headline: string;
  /** Consequência curta depois do título ("O jantar resolve."); só no caso da proteína. */
  followUp?: string;
  /** "Resumo · fim de tarde" ou, com o recado do dia no título, "Seu agente · 07:10". */
  kicker: string;
  /** Até 3 chips em ordem fixa: ajuste da meta, proteína, alerta e sinais fora do título, contextos. */
  chipItems: InsightChip[];
  /** Os textos curtos de chipItems (quem só precisa do texto). */
  chips: string[];
  action: InsightAction | null;
  /** Pergunta pronta para "Perguntar ao agente". */
  prompt: string;
  /** Folha do título (recado, alerta ou sinal): detalhe, ação e dispensar. O próximo passo comum não tem. */
  sheet?: InsightSheetModel;
  /** O título em forma de chip (recado, alerta ou sinal): o Hoje em branco mostra só a linha de chips. */
  titleChip?: InsightChip;
}
/** Sinal do app (signals.ts) como o Resumo o lê; a forma estrutural evita o ciclo de módulos. */
export interface InsightSignal {
  id: string;
  tone: "info" | "positive";
  title: string;
  body: string;
  action?: { label: string; prompt: string };
}
/** O recado do dia (daily-comment.ts): a frase e o horário da resposta. */
export interface InsightComment {
  /** Uma frase, até 90 caracteres. */
  headline: string;
  /** "HH:MM" da resposta, para o kicker "Seu agente · 07:10". */
  time: string;
}
/** Ajuste dinâmico (dailyTargets): kcal sobre a meta-base (negativo = meta menor) e proteína somada. */
export interface AdjustmentDelta {
  adjustment: number;
  proteinBoost: number;
}
export interface InsightAdjustment extends AdjustmentDelta {
  /** adjustmentNote de hoje, já sem kcal com "Ocultar calorias"; null sem ajuste. */
  note: string | null;
  /** As linhas do ajuste (adjustmentView do DailyTarget), para a folha dos chips; sem elas, a frase. */
  view?: AdjustmentView | null;
}
export interface DayInsightInput {
  profile: Pick<
    Profile,
    | "wakeTime"
    | "sleepTime"
    | "fluidRestriction"
    | "eatingDisorder"
    | "pregnancy"
    | "hideCalories"
    | "birthDate"
  >;
  totals: { water: number; protein: number };
  goals: { water: number | null; protein: number | null };
  /** Combinados válidos na data. */
  habits: HabitItem[];
  meals: { title: string; categoryTag?: string; time: string }[];
  pantry: PantryItem[];
  date: string;
  /** Horário atual "HH:MM". */
  time: string;
  /** Alerta dos últimos dias para quem usa caneta (intakeAlert); ausente ou null não muda nada. */
  intakeAlert?: IntakeAlert | null;
  /** Recado do dia do agente (latestDailyComment); ausente ou null, nada muda. */
  comment?: InsightComment | null;
  /** Sinais ativos do Hoje em ordem de prioridade (activeSignals): o 1º pode virar o título, os outros chips. */
  signals?: InsightSignal[];
  /** Ajuste da meta de hoje; sem ajuste (0 kcal e 0 g) não gera chip. */
  adjustment?: InsightAdjustment | null;
}

const WATER_STEP = 250;
const HABIT_WINDOW_MIN = 180;
const PROTEIN_EVENING = "17:00";
const PROTEIN_SHARE = 0.8;
const EXPIRY_DAYS = 2;
/** O cartão Resumo mostra no máximo três chips. */
const MAX_CHIPS = 3;
/** Chip curto do alerta de ingestão (Hoje e sinal da Seringa): sem números, sem dose. */
export const INTAKE_CHIPS: Record<IntakeAlert["kind"], string> = {
  low_intake: "Comendo pouco",
  protein: "Proteína baixa",
};
const ALERT_ACTION = "Pedir ideias ao agente";
const COMMENT_ACTION = "Abrir a conversa";
const COMMENT_CHIP = "Recado do agente";
const COMMENT_SHEET_TITLE = "Recado do seu agente";
const DISMISS_SIGNAL = "Dispensar por 3 dias";
const DISMISS_COMMENT = "Dispensar o recado de hoje";
const EXPLAIN = "Como calculamos";
/** Sinal de menos tipográfico dos chips ("↓ −99 kcal"). */
const MINUS = "−";
/** Corpo das folhas do ajuste quando a frase do dia não veio (defensivo; nunca cita kcal). */
const ADJUST_FALLBACK = "A meta de hoje mudou um pouco pelo dia de ontem, dentro de limites fixos.";
const PROTEIN_FALLBACK = "Hoje a proteína está um pouco maior para recuperar a de ontem.";
/** Títulos de combinado até este tamanho entram inteiros no chip; os maiores, só a 1ª palavra. */
const HABIT_CHIP_MAX = 14;
const DINNER = /jantar|ceia/i;
/** Pergunta pronta do alerta de ingestão: ideias de refeição, nunca dose nem números (também no sinal da Seringa). */
export const INTAKE_PROMPTS: Record<IntakeAlert["kind"], string> = {
  low_intake:
    "Tenho comido pouco nos últimos dias. Pode me sugerir refeições pequenas, fáceis de comer e com proteína, dentro da minha dieta?",
  protein:
    "Minha proteína ficou abaixo do combinado nos últimos dias. Pode me sugerir fontes de proteína práticas para cada refeição, dentro da minha dieta?",
};
/** Limites dos períodos do kicker: manhã, tarde, fim de tarde e noite (madrugada conta como noite). */
const PERIODS = [
  { until: "05:00", label: "noite" },
  { until: "12:00", label: "manhã" },
  { until: "17:00", label: "tarde" },
  { until: "19:00", label: "fim de tarde" },
] as const;
/** Refeições principais e a janela em que o registro delas é lembrado. */
const MAIN_MEALS = [
  { name: "café da manhã", pattern: /caf[eé]/i, from: "08:00", until: "10:30" },
  { name: "almoço", pattern: /almo[cç]/i, from: "12:30", until: "15:00" },
  { name: "jantar", pattern: /jantar|ceia/i, from: "19:30", until: "23:59" },
] as const;

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const daysUntil = (date: string, from: string) => {
  const utc = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(date) - utc(from)) / 86_400_000);
};
function missingMeal(input: DayInsightInput) {
  const now = minutes(input.time);
  const slot = MAIN_MEALS.find((m) => now >= minutes(m.from) && now <= minutes(m.until));
  if (!slot) return null;
  const logged = input.meals.some((m) => slot.pattern.test(`${m.categoryTag ?? ""} ${m.title}`));
  return logged ? null : slot;
}

/** Quanto falta para a meta quando a água está atrás do esperado para a hora; null sem meta ou com restrição hídrica. */
export function waterBehind(
  input: Pick<DayInsightInput, "goals" | "profile" | "totals" | "time">,
): number | null {
  const goal = input.goals.water;
  if (!goal || input.profile.fluidRestriction === "sim") return null;
  const wake = minutes(input.profile.wakeTime);
  const sleep = minutes(input.profile.sleepTime);
  const span = sleep > wake ? sleep - wake : 16 * 60;
  const fraction = Math.min(1, Math.max(0, (minutes(input.time) - wake) / span));
  return input.totals.water + WATER_STEP <= goal * fraction ? goal - input.totals.water : null;
}

/** Como em goalsFor: qualquer resposta diferente de "não" (inclusive "prefiro não informar") pede cautela. */
export function isSensitive(
  profile: Pick<Profile, "eatingDisorder" | "pregnancy">,
): boolean {
  return profile.eatingDisorder !== "nao" || profile.pregnancy !== "nao";
}

const ADULT_AGE = 18;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Menor de 18 em `today` (data inválida conta como menor; 18 anos no próprio dia já é adulto). */
export function isMinorOn(birthDate: string, today: string): boolean {
  if (!DATE_ONLY.test(birthDate)) return true;
  const adultFrom = `${Number(birthDate.slice(0, 4)) + ADULT_AGE}${birthDate.slice(4)}`;
  return today < adultFrom;
}

/**
 * Perfil calmo: a mesma regra de isCalmProfile (space.ts), sensível ou menor de 18. Aqui para os
 * módulos que não podem importar ./space (domain, reminder-plan, treatment, wellbeing).
 */
export function isCalmOn(
  profile: Pick<Profile, "eatingDisorder" | "pregnancy" | "birthDate">,
  today: string,
): boolean {
  return isSensitive(profile) || isMinorOn(profile.birthDate, today);
}

/** Período do dia para o kicker do Resumo: "manhã", "tarde", "fim de tarde" ou "noite". */
export function periodLabel(time: string): string {
  const now = minutes(time);
  return PERIODS.find((p) => now < minutes(p.until))?.label ?? "noite";
}

/** Título do cartão Resumo com a consequência, quando houver: "Faltam 33 g de proteína. O jantar resolve." */
export function insightTitle(insight: Pick<DayInsight, "headline" | "followUp">): string {
  return insight.followUp ? `${insight.headline}. ${insight.followUp}` : insight.headline;
}

/** Até estes tamanhos o título do Resumo fica no degrau cheio ("base") e no degrau "long"; acima, "xlong". */
export const TITLE_TIERS = { long: 36, xlong: 60 } as const;
export type TitleTier = "base" | "long" | "xlong";
/**
 * Degrau tipográfico do título do Resumo pelo tamanho do texto: o recado e o alerta podem ter até 90
 * caracteres e o cartão mostra no máximo duas linhas (web: data-length; app: tamanho da fonte), então
 * títulos maiores descem um ou dois degraus; o que ainda passar fica inteiro na folha.
 */
export function titleTier(title: string): TitleTier {
  if (title.length > TITLE_TIERS.xlong) return "xlong";
  return title.length > TITLE_TIERS.long ? "long" : "base";
}

/** Chip de combinado: título curto inteiro, ou só a 1ª palavra ("chá às 21:30"); o completo fica em `full`. */
function habitChip(habit: Pick<HabitItem, "title" | "timeOfDay">): InsightChip {
  const title = habit.title.trim();
  const short = title.length <= HABIT_CHIP_MAX ? title : (title.split(/\s+/)[0] ?? title);
  return {
    kind: "habit",
    text: `${short.charAt(0).toLowerCase()}${short.slice(1)} às ${habit.timeOfDay}`,
    full: `${title} às ${habit.timeOfDay}`,
  };
}

const plainChip = (kind: InsightChip["kind"], text: string): InsightChip => ({ kind, text, full: text });

const signedKcal = (kcal: number) => `${kcal > 0 ? "+" : MINUS}${fmtNumber(Math.abs(kcal))} kcal`;

export interface AdjustmentChipOptions {
  hideCalories: boolean;
  /** Diário em outra data: "Neste dia +147 kcal" (padrão: hoje). */
  isToday?: boolean;
  /** Resumo do Hoje: sem o motivo ("↑ +147 kcal hoje"); o Diário acrescenta o motivo. */
  compact?: boolean;
}
/**
 * Chip do ajuste de kcal (Hoje e Diário): "↑ +147 kcal hoje", "↓ −99 kcal · para equilibrar ontem",
 * "Neste dia +147 kcal"; com "Ocultar calorias", só a direção em palavras ("Meta um pouco maior").
 * null sem ajuste de kcal.
 */
export function adjustmentChipText(
  delta: Pick<AdjustmentDelta, "adjustment">,
  { hideCalories, isToday = true, compact = false }: AdjustmentChipOptions,
): string | null {
  const kcal = delta.adjustment;
  if (!kcal) return null;
  const isUp = kcal > 0;
  if (hideCalories) return `Meta um pouco ${isUp ? "maior" : "menor"}`;
  if (!isToday) return `Neste dia ${signedKcal(kcal)}`;
  const arrow = isUp ? "↑" : "↓";
  if (compact) return `${arrow} ${signedKcal(kcal)} hoje`;
  return `${arrow} ${signedKcal(kcal)} · ${isUp ? "ontem você comeu menos" : "para equilibrar ontem"}`;
}
/** Chip da proteína somada hoje: "prot. +9 g" no Resumo, "Proteína +9 g" no Diário; null sem reforço. */
export function proteinChipText(proteinBoost: number, compact = false): string | null {
  if (proteinBoost <= 0) return null;
  return `${compact ? "prot." : "Proteína"} +${fmtNumber(proteinBoost)} g`;
}

/** Chips do ajuste de hoje: kcal e proteína, cada um com a folha (a frase do dia e "Como calculamos"). */
function adjustmentChips(adjustment: InsightAdjustment | null | undefined, hideCalories: boolean): InsightChip[] {
  if (!adjustment) return [];
  // "Como calculamos" só existe com as calorias à vista.
  const action: InsightSheetAction | undefined = hideCalories ? undefined : { kind: "explain", label: EXPLAIN };
  const chips: InsightChip[] = [];
  // Linhas estruturadas na folha (sem parágrafo); a frase continua em body para leitores de tela.
  const rows = adjustment.view ? { rows: adjustment.view } : {};
  const kcal = adjustmentChipText(adjustment, { hideCalories, compact: true });
  // `full` = o próprio texto: a frase do ajuste fica na folha (e no title do Diário), não no nome do chip.
  if (kcal)
    chips.push({
      kind: "adjust",
      text: kcal,
      full: kcal,
      sheet: {
        id: "adjust",
        tone: "adjust",
        title: `Meta um pouco ${adjustment.adjustment > 0 ? "maior" : "menor"} hoje`,
        body: adjustment.note ?? ADJUST_FALLBACK,
        ...rows,
        action,
      },
    });
  const protein = proteinChipText(adjustment.proteinBoost, true);
  if (protein)
    chips.push({
      kind: "protein",
      text: protein,
      full: protein,
      sheet: {
        id: "protein",
        tone: "adjust",
        title: "Proteína um pouco maior hoje",
        body: adjustment.note ?? PROTEIN_FALLBACK,
        ...rows,
        action,
      },
    });
  return chips;
}

function signalSheet(signal: InsightSignal): InsightSheetModel {
  return {
    id: signal.id,
    tone: signal.tone,
    title: signal.title,
    body: signal.body,
    action: signal.action ? { kind: "agent", label: signal.action.label, prompt: signal.action.prompt } : undefined,
    dismiss: { key: signal.id, label: DISMISS_SIGNAL },
  };
}
/** Sinal do app em forma de chip: o título curto no chip; corpo, ação e "Dispensar por 3 dias" na folha. */
export function signalChip(signal: InsightSignal): InsightChip {
  return { kind: "signal", text: signal.title, full: signal.title, sheet: signalSheet(signal) };
}
/** Alerta da caneta em forma de chip ("Comendo pouco"); a orientação e a pergunta pronta ficam na folha. */
function alertChip(alert: IntakeAlert): InsightChip {
  return {
    kind: "alert",
    text: INTAKE_CHIPS[alert.kind],
    full: alert.title,
    sheet: {
      id: "alert",
      tone: "info",
      title: alert.title,
      body: alert.body,
      action: { kind: "agent", label: ALERT_ACTION, prompt: INTAKE_PROMPTS[alert.kind] },
    },
  };
}
/** O recado do dia em forma de chip; a folha repete a frase, abre a conversa e dispensa o recado de hoje. */
function commentChip(comment: InsightComment): InsightChip {
  return {
    kind: "comment",
    text: COMMENT_CHIP,
    full: comment.headline,
    sheet: {
      id: "comment",
      tone: "agent",
      title: COMMENT_SHEET_TITLE,
      body: comment.headline,
      action: { kind: "chat", label: COMMENT_ACTION },
      dismiss: { key: DAILY_COMMENT_KEY, label: DISMISS_COMMENT },
    },
  };
}

function chipsFor(input: DayInsightInput, skip: DayInsight["domain"]): InsightChip[] {
  const chips: InsightChip[] = [];
  const goal = input.goals.water;
  if (skip !== "water" && goal && input.profile.fluidRestriction !== "sim" && input.totals.water < goal)
    chips.push(plainChip("water", `faltam ${fmtMl(goal - input.totals.water)}`));
  const now = minutes(input.time);
  const next = input.habits
    .filter((h) => !h.completedDates.includes(input.date) && minutes(h.timeOfDay) > now)
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))[0];
  if (next) chips.push(habitChip(next));
  const soon = input.pantry
    .filter((p) => p.expiresOn !== null && p.expiresOn >= input.date)
    .filter((p) => daysUntil(p.expiresOn!, input.date) <= EXPIRY_DAYS)
    .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!))[0];
  if (soon) {
    // O nome vem da pessoa ("Barra 200 kcal"): a tela Hoje nunca mostra calorias ocultas.
    const name = visiblePlainText(soon.name, input.profile.hideCalories);
    chips.push(plainChip("pantry", `${name} vence ${fmtRelDate(soon.expiresOn!, input.date)}`));
  }
  return chips;
}

type InsightBody = Pick<DayInsight, "domain" | "headline" | "followUp" | "action" | "prompt">;
interface NextStep {
  body: InsightBody;
  chips: InsightChip[];
  /** Refeição, água ou combinado na hora: a ação do cartão fica com eles mesmo com outro título. */
  isDue: boolean;
}

/** O próximo passo do dia, por prioridade: refeição, água, combinado (na hora), proteína da noite, nada. */
function nextStep(input: DayInsightInput): NextStep {
  const meal = missingMeal(input);
  if (meal)
    return {
      isDue: true,
      body: {
        domain: "food",
        headline: `Como foi o seu ${meal.name}?`,
        action: { kind: "meal", label: `Registrar ${meal.name}` },
        prompt: `Me ajude a montar um ${meal.name} prático dentro da minha dieta.`,
      },
      chips: chipsFor(input, "food"),
    };
  const water = waterBehind(input);
  if (water !== null)
    return {
      isDue: true,
      body: {
        domain: "water",
        headline: "Hora de um copo d'água",
        // Nome diferente do "+" de água do topo: a tela tem um só botão com cada nome.
        action: { kind: "water", ml: WATER_STEP, label: "Registrar um copo" },
        prompt: "Como posso lembrar de beber água ao longo do dia?",
      },
      chips: [plainChip("water", `faltam ${fmtMl(water)}`), ...chipsFor(input, "water")],
    };
  const now = minutes(input.time);
  const due = input.habits
    .filter((h) => !h.completedDates.includes(input.date))
    .filter((h) => now >= minutes(h.timeOfDay) && now - minutes(h.timeOfDay) <= HABIT_WINDOW_MIN)
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))[0];
  if (due)
    return {
      isDue: true,
      body: {
        domain: "habit",
        headline: "Hora do seu combinado",
        action: { kind: "habit", habitId: due.id, label: "Marcar como feito" },
        prompt: `Tenho o combinado "${due.title}". Como encaixo isso na minha rotina?`,
      },
      chips: [habitChip(due), ...chipsFor(input, "habit")],
    };
  const proteinGoal = input.goals.protein;
  if (
    proteinGoal &&
    !isSensitive(input.profile) &&
    now >= minutes(PROTEIN_EVENING) &&
    input.totals.protein < proteinGoal * PROTEIN_SHARE
  ) {
    const missing = Math.round(proteinGoal - input.totals.protein);
    const hasDinner = input.meals.some((m) => DINNER.test(`${m.categoryTag ?? ""} ${m.title}`));
    // A consequência só enquanto o jantar está por vir, e nunca para menores (perfil calmo).
    const followUp = hasDinner || isMinorOn(input.profile.birthDate, input.date) ? undefined : "O jantar resolve.";
    return {
      isDue: false,
      body: {
        domain: "food",
        headline: `Faltam ${fmtNumber(missing)} g de proteína`,
        followUp,
        action: { kind: "agent", label: "Sugerir um jantar" },
        prompt: `Sugira um jantar prático com cerca de ${fmtNumber(missing)} g de proteína, dentro da minha dieta.`,
      },
      chips: chipsFor(input, "food"),
    };
  }
  return {
    isDue: false,
    body: {
      domain: "neutral",
      headline: "Tudo em dia por aqui",
      action: { kind: "agent", label: "Conversar com o agente" },
      prompt: "Como posso fechar bem o meu dia?",
    },
    chips: chipsFor(input, "neutral"),
  };
}

type Head = Pick<DayInsight, "source" | "headline" | "followUp" | "action" | "prompt" | "sheet" | "titleChip">;
interface Voices {
  comment: InsightComment | null;
  alert: IntakeAlert | null;
  signals: InsightSignal[];
}

/**
 * O título do cartão, por prioridade: recado do dia > alerta da caneta > 1º sinal do Hoje > próximo
 * passo. Um passo na hora (refeição, água, combinado) segura a ação e a pergunta pronta seja qual
 * for o título; sem passo na hora, a ação é a do título (abrir a conversa, pedir ideias, a do sinal).
 */
function headOf(step: NextStep, { comment, alert, signals }: Voices): Head {
  const due = step.isDue ? step.body : null;
  if (comment) {
    const chip = commentChip(comment);
    return {
      source: "comment",
      headline: comment.headline,
      action: due?.action ?? { kind: "chat", label: COMMENT_ACTION },
      prompt: step.body.prompt,
      sheet: chip.sheet,
      titleChip: chip,
    };
  }
  if (alert) {
    const chip = alertChip(alert);
    return {
      source: "alert",
      headline: alert.title,
      action: due?.action ?? { kind: "agent", label: ALERT_ACTION },
      prompt: due ? step.body.prompt : INTAKE_PROMPTS[alert.kind],
      sheet: chip.sheet,
      titleChip: chip,
    };
  }
  const signal = signals[0];
  if (signal) {
    const chip = signalChip(signal);
    return {
      source: "signal",
      headline: signal.title,
      action: due?.action ?? (signal.action ? { kind: "agent", label: signal.action.label } : step.body.action),
      prompt: due ? step.body.prompt : (signal.action?.prompt ?? step.body.prompt),
      sheet: chip.sheet,
      titleChip: chip,
    };
  }
  return {
    source: "insight",
    headline: step.body.headline,
    followUp: step.body.followUp,
    action: step.body.action,
    prompt: step.body.prompt,
  };
}

/**
 * O cartão Resumo: título pela prioridade de headOf, kicker do período (ou do agente), até três chips
 * em ordem fixa (ajuste da meta, proteína, alerta e sinais que não viraram título, contextos do passo)
 * e uma ação. Perfis calmos não recebem recado, alerta nem sinais (as fontes já filtram; aqui é a rede).
 */
export function dayInsight(input: DayInsightInput): DayInsight {
  const step = nextStep(input);
  const calm = isCalmOn(input.profile, input.date);
  const voices: Voices = {
    comment: calm ? null : (input.comment ?? null),
    alert: calm ? null : (input.intakeAlert ?? null),
    signals: calm ? [] : (input.signals ?? []),
  };
  const head = headOf(step, voices);
  const restSignals = head.source === "signal" ? voices.signals.slice(1) : voices.signals;
  const extras = [
    ...adjustmentChips(input.adjustment, input.profile.hideCalories),
    ...(voices.alert && head.source !== "alert" ? [alertChip(voices.alert)] : []),
    ...restSignals.map(signalChip),
  ];
  const chipItems = [...extras, ...step.chips].slice(0, MAX_CHIPS);
  return {
    domain: step.body.domain,
    ...head,
    kicker: voices.comment ? `Seu agente · ${voices.comment.time}` : `Resumo · ${periodLabel(input.time)}`,
    chipItems,
    chips: chipItems.map((chip) => chip.text),
  };
}
