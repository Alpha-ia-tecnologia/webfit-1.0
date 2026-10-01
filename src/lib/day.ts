/**
 * Leitura do dia para a tela Hoje (web + app nativo): anel de energia e o cartão "Próximo passo".
 * Tudo é determinístico e local; nenhum texto menciona calorias e perfis sensíveis
 * (transtorno alimentar, gestação ou amamentação) não recebem cobrança de proteína.
 */
import type { HabitItem, PantryItem, Profile } from "../types";
import { fmtMl, fmtNumber, fmtRelDate } from "./format";
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

export type InsightAction =
  | { kind: "water"; ml: number; label: string }
  | { kind: "meal"; label: string }
  | { kind: "habit"; habitId: string; label: string }
  | { kind: "agent"; label: string };
/** Contexto do cartão Resumo, com ícone pelo tipo (gota, combinado, despensa). */
export interface InsightChip {
  kind: "water" | "habit" | "pantry";
  /** Texto curto do chip: "faltam 750 ml", "chá às 21:30". */
  text: string;
  /** Texto completo (title e nome acessível): "Chá calmante e higiene do sono às 21:30". */
  full: string;
}
export interface DayInsight {
  domain: "water" | "food" | "habit" | "neutral";
  /** Até 7 palavras. */
  headline: string;
  /** Consequência curta depois do título ("O jantar resolve."); só no caso da proteína. */
  followUp?: string;
  /** "Resumo · fim de tarde": o período do dia em que o cartão foi montado. */
  kicker: string;
  /** Até 2 contextos curtos, com ícone. */
  chipItems: InsightChip[];
  /** Os textos curtos de chipItems (quem só precisa do texto). */
  chips: string[];
  action: InsightAction | null;
  /** Pergunta pronta para "Perguntar ao agente". */
  prompt: string;
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
}

const WATER_STEP = 250;
const HABIT_WINDOW_MIN = 180;
const PROTEIN_EVENING = "17:00";
const PROTEIN_SHARE = 0.8;
const EXPIRY_DAYS = 2;
/** O cartão Resumo mostra no máximo dois contextos. */
const MAX_CHIPS = 2;
/** Títulos de combinado até este tamanho entram inteiros no chip; os maiores, só a 1ª palavra. */
const HABIT_CHIP_MAX = 14;
const DINNER = /jantar|ceia/i;
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

type InsightBody = Omit<DayInsight, "kicker" | "chips" | "chipItems">;

/** Completa o cartão: kicker do período e no máximo dois chips (os textos curtos também em `chips`). */
function finish(input: DayInsightInput, body: InsightBody, chips: InsightChip[]): DayInsight {
  const chipItems = chips.slice(0, MAX_CHIPS);
  return {
    ...body,
    kicker: `Resumo · ${periodLabel(input.time)}`,
    chipItems,
    chips: chipItems.map((chip) => chip.text),
  };
}

/** Um único próximo passo para o dia, escolhido por prioridade: refeição, água, combinado, proteína. */
export function dayInsight(input: DayInsightInput): DayInsight {
  const meal = missingMeal(input);
  if (meal) {
    return finish(
      input,
      {
        domain: "food",
        headline: `Como foi o seu ${meal.name}?`,
        action: { kind: "meal", label: `Registrar ${meal.name}` },
        prompt: `Me ajude a montar um ${meal.name} prático dentro da minha dieta.`,
      },
      chipsFor(input, "food"),
    );
  }
  const water = waterBehind(input);
  if (water !== null) {
    return finish(
      input,
      {
        domain: "water",
        headline: "Hora de um copo d'água",
        // Nome diferente do "+" de água do topo: a tela tem um só botão com cada nome.
        action: { kind: "water", ml: WATER_STEP, label: "Registrar um copo" },
        prompt: "Como posso lembrar de beber água ao longo do dia?",
      },
      [plainChip("water", `faltam ${fmtMl(water)}`), ...chipsFor(input, "water")],
    );
  }
  const now = minutes(input.time);
  const due = input.habits
    .filter((h) => !h.completedDates.includes(input.date))
    .filter((h) => now >= minutes(h.timeOfDay) && now - minutes(h.timeOfDay) <= HABIT_WINDOW_MIN)
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))[0];
  if (due) {
    return finish(
      input,
      {
        domain: "habit",
        headline: "Hora do seu combinado",
        action: { kind: "habit", habitId: due.id, label: "Marcar como feito" },
        prompt: `Tenho o combinado "${due.title}". Como encaixo isso na minha rotina?`,
      },
      [habitChip(due), ...chipsFor(input, "habit")],
    );
  }
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
    return finish(
      input,
      {
        domain: "food",
        headline: `Faltam ${fmtNumber(missing)} g de proteína`,
        followUp,
        action: { kind: "agent", label: "Sugerir um jantar" },
        prompt: `Sugira um jantar prático com cerca de ${fmtNumber(missing)} g de proteína, dentro da minha dieta.`,
      },
      chipsFor(input, "food"),
    );
  }
  return finish(
    input,
    {
      domain: "neutral",
      headline: "Tudo em dia por aqui",
      action: { kind: "agent", label: "Conversar com o agente" },
      prompt: "Como posso fechar bem o meu dia?",
    },
    chipsFor(input, "neutral"),
  );
}
