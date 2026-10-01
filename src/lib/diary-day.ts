import { measurementSchema, type AppState, type DiaryEntry, type HabitItem, type InjectionEntry } from "../types";
import { MOOD_LABELS } from "./day";
import { withMeasurements } from "./domain";
import { friendlyName } from "./food-search";
import { fmtMl, fmtNumber } from "./format";
import { injectionDetail, injectionTitle } from "./injection";
import { KCAL_PER_GRAM, MEAL_WINDOW_MINUTES } from "./meals";
import { symptomText } from "./symptoms";
import { mealTone, type Tone } from "./today";

/** Refeições que o diário oferece para adicionar quando ainda não há registro delas no dia. */
export const STANDARD_MEALS = ["Café da manhã", "Almoço", "Lanche", "Jantar"] as const;
/** Ordem dos tipos conhecidos (a ceia só aparece quando registrada). */
const KNOWN_MEALS = [...STANDARD_MEALS, "Ceia"] as const;
const KNOWN_TONES: Record<string, Tone> = {
  "Café da manhã": "amber",
  Almoço: "emerald",
  Lanche: "sky",
  Jantar: "teal",
  Ceia: "teal",
};
const TONE_MEAL: Record<Tone, string> = {
  amber: "Café da manhã",
  emerald: "Almoço",
  sky: "Lanche",
  teal: "Jantar",
};
/** Pedaços da categoria digitada que identificam um tipo conhecido ("cafe", "almoco"…). */
const TAG_PATTERNS: [RegExp, string][] = [
  [/cafe|manha|desjejum/, "Café da manhã"],
  [/almoco/, "Almoço"],
  [/lanche/, "Lanche"],
  [/jantar/, "Jantar"],
  [/ceia/, "Ceia"],
];
/** Método gravado nas medições criadas pelo registro rápido. */
export const QUICK_WEIGHT_METHOD = "Registro rápido";
export const WEIGHT_MIN = 20;
export const WEIGHT_MAX = 350;
const SUMMARY_CHIPS = 2;
const SUMMARY_MAX_CHARS = 80;
/** Alimentos citados na frase da refeição ("Ovos, pão integral e café"); o resto vira "…". */
const SENTENCE_MAX_ITEMS = 3;
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 60;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const byTime = (a: { time: string; createdAt: string }, b: { time: string; createdAt: string }) =>
  a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt);
const round1 = (n: number) => Math.round(n * 10) / 10;
const list = (parts: string[]) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
const shorten = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * Tipo da refeição para agrupar o dia: a categoria informada (sem acento: "almoco" é "Almoço"),
 * o título quando ele é o nome de um tipo e, na falta dos dois, o horário.
 */
export function mealCategoryOf(entry: Pick<DiaryEntry, "categoryTag" | "title" | "time">): string {
  const tag = entry.categoryTag?.trim();
  if (tag) {
    const key = normalize(tag);
    return TAG_PATTERNS.find(([pattern]) => pattern.test(key))?.[1] ?? tag;
  }
  const title = normalize(entry.title);
  const known = KNOWN_MEALS.find((meal) => normalize(meal) === title);
  return known ?? TONE_MEAL[mealTone({ time: entry.time })];
}

export interface MealGroup {
  category: string;
  tone: Tone;
  /** Em ordem de horário. */
  entries: DiaryEntry[];
  calories: number;
  macros: { protein: number; carbs: number; fat: number };
  /** Subtotal no cabeçalho do grupo: sempre (com "ocultar calorias", a tela não mostra número). */
  showSubtotal: boolean;
  /** kcal em cada linha só com 2 ou mais registros: com um só, o subtotal já é o número dele. */
  showRowKcal: boolean;
}

export interface DiaryDay {
  meals: MealGroup[];
  /** Refeições padrão ainda sem registro no dia, na ordem do dia. */
  pending: string[];
  water: { totalMl: number; entries: DiaryEntry[] };
  wellbeing: DiaryEntry[];
  injections: InjectionEntry[];
  count: number;
  isEmpty: boolean;
}

/** O dia do diário organizado: refeições por tipo, uma linha de água, bem-estar e aplicações. */
export function groupDiaryDay({
  diary,
  injections,
  date,
}: {
  diary: readonly DiaryEntry[];
  injections: readonly InjectionEntry[];
  date: string;
}): DiaryDay {
  const day = diary.filter((e) => e.date === date).sort(byTime);
  const groups = new Map<string, DiaryEntry[]>();
  for (const entry of day.filter((e) => e.type === "refeicao")) {
    const category = mealCategoryOf(entry);
    groups.set(category, [...(groups.get(category) ?? []), entry]);
  }
  const order = (category: string) => {
    const index = KNOWN_MEALS.indexOf(category as (typeof KNOWN_MEALS)[number]);
    return index < 0 ? KNOWN_MEALS.length : index;
  };
  const meals = [...groups.entries()]
    .map(([category, entries]): MealGroup => {
      const sum = (pick: (e: DiaryEntry) => number) => entries.reduce((total, e) => total + pick(e), 0);
      return {
        category,
        tone: KNOWN_TONES[category] ?? mealTone({ time: entries[0].time }),
        entries,
        calories: sum((e) => e.calories ?? 0),
        macros: {
          protein: round1(sum((e) => e.macros?.protein ?? 0)),
          carbs: round1(sum((e) => e.macros?.carbs ?? 0)),
          fat: round1(sum((e) => e.macros?.fat ?? 0)),
        },
        showSubtotal: true,
        showRowKcal: entries.length >= 2,
      };
    })
    .sort((a, b) => a.entries[0].time.localeCompare(b.entries[0].time) || order(a.category) - order(b.category));
  const waterEntries = day.filter((e) => e.type === "agua");
  const wellbeing = day.filter((e) => e.type === "bem_estar");
  const applied = injections.filter((e) => e.date === date).sort(byTime);
  const count = day.length + applied.length;
  return {
    meals,
    pending: STANDARD_MEALS.filter((meal) => !groups.has(meal)),
    water: {
      totalMl: waterEntries.reduce((total, e) => total + (e.amountMl ?? 0), 0),
      entries: waterEntries,
    },
    wellbeing,
    injections: applied,
    count,
    isEmpty: count === 0,
  };
}

export interface MealSummary {
  chips: string[];
  /** Quantos alimentos ficaram de fora dos chips. */
  more: number;
  /** "Arroz integral · Feijão carioca +2". */
  text: string;
  /** Frase para o cartão da refeição: "Ovos, pão integral e café" (até 3; mais que isso termina em "…"). */
  sentence: string;
}

/** 1º rótulo como está (maiúscula inicial), os outros com inicial minúscula, ligados por vírgula e "e". */
function mealSentence(labels: readonly string[]): string {
  const shown = labels
    .slice(0, SENTENCE_MAX_ITEMS)
    .map((label, i) =>
      i === 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label.charAt(0).toLowerCase() + label.slice(1),
    );
  return labels.length > SENTENCE_MAX_ITEMS ? `${shown.join(", ")}…` : list(shown);
}

/** Os dois primeiros alimentos pelo nome amigável; sem itens, a descrição do registro. */
export function mealSummary(entry: Pick<DiaryEntry, "items" | "description">): MealSummary {
  const labels = [...new Set((entry.items ?? []).map((i) => friendlyName(i.food.name).label))];
  if (!labels.length) {
    const text = shorten(entry.description.trim(), SUMMARY_MAX_CHARS);
    return { chips: [], more: 0, text, sentence: text };
  }
  const chips = labels.slice(0, SUMMARY_CHIPS);
  const more = labels.length - chips.length;
  return {
    chips,
    more,
    text: `${chips.join(" · ")}${more ? ` +${more}` : ""}`,
    sentence: mealSentence(labels),
  };
}

/** Parte da energia de cada macronutriente, em % inteiros que somam 100; null sem energia. */
export function macroShare(
  macros: { protein: number; carbs: number; fat: number } | undefined,
): { protein: number; carbs: number; fat: number } | null {
  if (!macros) return null;
  const protein = macros.protein * KCAL_PER_GRAM.protein;
  const carbs = macros.carbs * KCAL_PER_GRAM.carbs;
  const fat = macros.fat * KCAL_PER_GRAM.fat;
  const total = protein + carbs + fat;
  if (total <= 0) return null;
  const p = Math.round((protein / total) * 100);
  const c = Math.round((carbs / total) * 100);
  return { protein: p, carbs: c, fat: Math.max(0, 100 - p - c) };
}

export interface MealSlot {
  category: string;
  time: string;
}

/**
 * A próxima refeição principal ainda sem registro, para um único atalho na linha do tempo do Hoje.
 * Café e almoço saem da sugestão 1h30 depois do horário informado; o jantar fica até o fim do dia.
 */
export function pendingMealSlot(
  meals: readonly Pick<DiaryEntry, "categoryTag" | "title" | "time">[],
  times: { breakfastTime: string; lunchTime: string; dinnerTime: string },
  now: string,
): MealSlot | null {
  const logged = new Set(meals.map(mealCategoryOf));
  const main: MealSlot[] = [
    { category: "Café da manhã", time: times.breakfastTime },
    { category: "Almoço", time: times.lunchTime },
    { category: "Jantar", time: times.dinnerTime },
  ];
  return (
    main.find(
      (slot, index) =>
        !logged.has(slot.category) &&
        (index === main.length - 1 || toMinutes(now) <= toMinutes(slot.time) + MEAL_WINDOW_MINUTES),
    ) ?? null
  );
}

export interface DiarySearchHit {
  kind: "diary" | "injecao";
  id: string;
  date: string;
  time: string;
  title: string;
  detail: string;
}
export interface DiarySearchGroup {
  date: string;
  hits: DiarySearchHit[];
}

function diaryHit(e: DiaryEntry): { hit: DiarySearchHit; text: string } {
  const base = { kind: "diary" as const, id: e.id, date: e.date, time: e.time };
  if (e.type === "agua") {
    const detail = fmtMl(e.amountMl ?? 0);
    return { hit: { ...base, title: "Água", detail }, text: `Água hidratação ${detail} ${e.description}` };
  }
  if (e.type === "bem_estar") {
    const tags = e.tags?.join(", ") ?? "";
    // Efeitos percebidos (SERINGA-07) antes dos marcadores: "Náusea, intensidade forte · Calma".
    const parts = [...(e.symptoms ?? []).map(symptomText), ...(tags ? [tags] : [])];
    const detail = `Como me sinto: ${e.rating}/5${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
    return { hit: { ...base, title: "Bem-estar", detail }, text: `Bem-estar humor sono ${detail} ${e.description}` };
  }
  const title = mealCategoryOf(e);
  const detail = mealSummary(e).text;
  const foods = (e.items ?? []).map((i) => `${i.food.name} ${friendlyName(i.food.name).label}`).join(" ");
  return {
    hit: { ...base, title, detail },
    text: `${title} ${e.title} ${e.categoryTag ?? ""} ${e.description} ${foods}`,
  };
}

/** Busca em todo o histórico (todas as palavras, sem acento), do dia mais recente ao mais antigo. */
export function searchDiary(
  diary: readonly DiaryEntry[],
  injections: readonly InjectionEntry[],
  query: string,
  limit = SEARCH_LIMIT,
): DiarySearchGroup[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.join("").length < SEARCH_MIN_CHARS) return [];
  const candidates = [
    ...diary.map(diaryHit),
    ...injections.map((e) => {
      const hit: DiarySearchHit = {
        kind: "injecao",
        id: e.id,
        date: e.date,
        time: e.time,
        title: injectionTitle(e),
        detail: injectionDetail(e),
      };
      return { hit, text: `${hit.title} ${hit.detail} aplicação injeção ${e.notes}` };
    }),
  ];
  const hits = candidates
    .filter(({ text }) => {
      const haystack = normalize(text);
      return words.every((word) => haystack.includes(word));
    })
    .map(({ hit }) => hit)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .slice(0, limit);
  const groups: DiarySearchGroup[] = [];
  for (const hit of hits) {
    const last = groups.at(-1);
    if (last?.date === hit.date) last.hits.push(hit);
    else groups.push({ date: hit.date, hits: [hit] });
  }
  return groups;
}

export interface DayPresence {
  date: string;
  water: boolean;
  meal: boolean;
  habit: boolean;
}

/** O que foi registrado em cada dia da faixa (água, refeição, combinado), sem contar sequência. */
export function weekPresence(
  diary: readonly DiaryEntry[],
  habits: readonly HabitItem[],
  dates: readonly string[],
): DayPresence[] {
  const wanted = new Set(dates);
  const types = new Map<string, Set<DiaryEntry["type"]>>();
  for (const e of diary) {
    if (!wanted.has(e.date)) continue;
    types.set(e.date, (types.get(e.date) ?? new Set()).add(e.type));
  }
  return dates.map((date) => ({
    date,
    water: types.get(date)?.has("agua") ?? false,
    meal: types.get(date)?.has("refeicao") ?? false,
    habit: habits.some((h) => h.completedDates.includes(date)),
  }));
}

/** Parte do dia com presença (água, refeição, combinado), de 0 a 1: o arco contínuo do anel da semana. */
export function presenceFraction(presence: Pick<DayPresence, "water" | "meal" | "habit">): number {
  return [presence.water, presence.meal, presence.habit].filter(Boolean).length / 3;
}

/** "água, refeição e combinado" para o nome acessível do dia; vazio quando não há registro. */
export function presenceLabel(presence: Pick<DayPresence, "water" | "meal" | "habit">): string {
  const parts: string[] = [];
  if (presence.water) parts.push("água");
  if (presence.meal) parts.push("refeição");
  if (presence.habit) parts.push("combinado");
  return list(parts);
}

export interface BalanceEquation {
  goal: number;
  consumed: number;
  /** Sempre positivo: o que resta ou, com `over`, quanto passou do planejado. */
  result: number;
  over: boolean;
}

/** [Meta] − [Consumido] = [Restam]; null sem meta calórica. */
export function balanceEquation(consumed: number, goal: number | null): BalanceEquation | null {
  if (goal === null) return null;
  return { goal, consumed, result: Math.abs(goal - consumed), over: consumed > goal };
}

/** Copos da linha de água: a meta dividida em 10; sem meta, copos de 250 ml (8 na linha). */
const GOAL_GLASSES = 10;
const PLAIN_GLASSES = 8;
const PLAIN_GLASS_ML = 250;
/** Horários de água citados na linha; o resto vira "…". */
const WATER_TIMES_SHOWN = 3;
const EPSILON = 1e-9;

/** Copos cheios da linha de água (só exibição): acima da meta, todos cheios, nada de alerta. */
export function waterGlasses(totalMl: number, goalMl: number | null): { filled: number; total: number } {
  const hasGoal = goalMl !== null && goalMl > 0;
  const total = hasGoal ? GOAL_GLASSES : PLAIN_GLASSES;
  const glassMl = hasGoal ? goalMl / GOAL_GLASSES : PLAIN_GLASS_ML;
  return { filled: Math.min(total, Math.max(0, Math.floor(totalMl / glassMl + EPSILON))), total };
}

/** "1,75": litros com até 2 casas (o "L" fica na unidade ao lado). */
export const waterLiters = (ml: number): string => fmtNumber(ml / 1000, 2);

/** "1,75 de 2,5 L" (sem meta, "1,75 L"): o total da água dito por extenso. */
export function waterSpoken(totalMl: number, goalMl: number | null): string {
  return goalMl !== null && goalMl > 0
    ? `${waterLiters(totalMl)} de ${waterLiters(goalMl)} L`
    : `${waterLiters(totalMl)} L`;
}

/** "10:00 · 14:00": os primeiros horários de água do dia, com "…" quando há mais. */
export function waterTimes(entries: readonly Pick<DiaryEntry, "time">[]): string {
  const shown = entries.slice(0, WATER_TIMES_SHOWN).map((e) => e.time).join(" · ");
  return entries.length > WATER_TIMES_SHOWN ? `${shown}…` : shown;
}

/** Rosto de cada nota do humor (1 a 5), do "muito mal" ao "muito bem". */
export const MOOD_EMOJI = ["😣", "🙁", "😐", "🙂", "😄"] as const;

/** Emoji da nota; sem nota, o neutro. */
export function moodEmoji(rating: number | undefined): string {
  const index = Math.min(MOOD_EMOJI.length, Math.max(1, Math.round(rating ?? 3))) - 1;
  return MOOD_EMOJI[index];
}

/**
 * Título da linha de bem-estar: a anotação da pessoa ou a palavra da nota ("Bem"). Como título (conceito 03),
 * a anotação perde só um ponto final ("Acordei disposta."); reticências, "?" e "!" ficam como a pessoa escreveu.
 */
export function wellbeingTitle(entry: Pick<DiaryEntry, "description" | "rating" | "title">): string {
  const note = entry.description.trim().replace(/(?<!\.)\.$/, "").trim();
  if (note) return note;
  return entry.rating ? MOOD_LABELS[Math.min(MOOD_LABELS.length, Math.max(1, entry.rating)) - 1] : entry.title;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** Peso mais recente: da última medição ou, sem medições, do perfil. */
export function latestWeight(state: Pick<AppState, "measurements" | "profile">): number | null {
  return [...state.measurements].sort(byDate).at(-1)?.weight ?? state.profile?.weight ?? null;
}

/** Passo do seletor de peso (±0,1 kg), com uma casa decimal e dentro dos limites do cadastro. */
export function stepWeight(value: number, delta: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round((value + delta) * 10) / 10));
}

export type QuickWeightProblem = "future" | "weight" | "profile";

/**
 * Peso do registro rápido: troca só o peso da medição da data (cintura e método ficam) ou cria
 * uma medição nova com a altura mais recente. O perfil segue a medição mais recente.
 */
export function quickWeight(
  state: AppState,
  input: { id: string; date: string; weight: number; today: string },
): { success: true; state: AppState } | { success: false; reason: QuickWeightProblem } {
  if (input.date > input.today) return { success: false, reason: "future" };
  if (!state.profile) return { success: false, reason: "profile" };
  const existing = state.measurements.find((m) => m.date === input.date);
  const last = [...state.measurements].sort(byDate).at(-1);
  const parsed = measurementSchema.safeParse(
    existing
      ? { ...existing, weight: input.weight }
      : {
          id: input.id,
          date: input.date,
          weight: input.weight,
          height: last?.height ?? state.profile.height,
          method: QUICK_WEIGHT_METHOD,
        },
  );
  if (!parsed.success) return { success: false, reason: "weight" };
  const measurements = existing
    ? state.measurements.map((m) => (m.id === existing.id ? parsed.data : m))
    : [...state.measurements, parsed.data];
  return { success: true, state: withMeasurements(state, measurements, input.today) };
}

const MEAL_ARTICLES: Record<string, string> = {
  "Café da manhã": "ao café da manhã",
  Almoço: "ao almoço",
  Lanche: "ao lanche",
  Jantar: "ao jantar",
  Ceia: "à ceia",
};

/** Nome do "+" de um grupo: "Adicionar ao almoço", "Adicionar à ceia". */
export function addToLabel(category: string): string {
  const known = MEAL_ARTICLES[category];
  return known ? `Adicionar ${known}` : `Adicionar em ${category}`;
}

/** Nome do tipo dentro de uma frase: "café da manhã"; categorias próprias ficam como foram escritas. */
export function mealWord(category: string): string {
  return MEAL_ARTICLES[category] ? category.toLowerCase() : category;
}

export type DayPeriodKey = "manha" | "tarde" | "noite";

/** Período do dia para a saudação e a ilustração do "Comece seu dia". */
export function dayPeriod(time: string): { key: DayPeriodKey; greeting: string } {
  const hour = Number(time.slice(0, 2));
  if (hour >= 5 && hour < 12) return { key: "manha", greeting: "Bom dia" };
  if (hour >= 12 && hour < 18) return { key: "tarde", greeting: "Boa tarde" };
  return { key: "noite", greeting: "Boa noite" };
}
