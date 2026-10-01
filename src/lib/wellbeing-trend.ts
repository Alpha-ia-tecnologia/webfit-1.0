/**
 * Bem-estar e sono na Evolução (EVOL-07) e no resumo da semana: rosto do humor e cápsula de sono
 * por dia, médias do período e uma leitura cruzada descritiva (os dias com humor e sono separados
 * pela mediana do sono, humor médio de cada grupo). Nunca afirma causa nem sugere diagnóstico;
 * marcadores ficam de fora (fome e saciedade são sensíveis). Compartilhado pelo web e pelo app.
 */
import type { DiaryEntry } from "../types";
import { weekdayOf } from "./dates";
import { MOOD_LABELS } from "./day";
import { fmtNumber, fmtShortDate, plural } from "./format";
import type { InsightChip } from "./progress-insights";
import { WEEKDAYS_SHORT } from "./today";

/** Topo da escala da cápsula de sono: 12 h ou mais enchem a cápsula. */
export const SLEEP_SCALE_MAX_H = 12;
/** Dias com humor e sono necessários para a leitura cruzada. */
export const CROSS_MIN_DAYS = 4;
/** Cada grupo (mais sono / menos sono) precisa de pelo menos 2 dias. */
export const CROSS_MIN_GROUP = 2;
/** Diferença de humor médio (na escala de 1 a 5) a partir da qual um grupo é descrito como melhor. */
export const CROSS_MIN_DIFF = 0.5;

const WEEK_DAYS = 7;
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Arredonda para a meia hora mais próxima (6,75 h → 7 h). */
const toHalfHour = (n: number) => Math.round(n * 2) / 2;
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export interface DayWellbeing {
  mood: MoodLevel | null;
  sleep: number | null;
}

const isMood = (value: unknown): value is MoodLevel =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
const isSleep = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
/** Ordem do dia: horário, depois criação (o último vale). */
const byMoment = (a: DiaryEntry, b: DiaryEntry) =>
  a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt);

function lastWhere<T>(items: readonly T[], match: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (match(items[i]!)) return items[i];
  return undefined;
}

/** Último bem-estar do dia (time, depois createdAt): humor do último com rating; sono do último com sleepHours numérico. */
export function dayWellbeing(entries: readonly DiaryEntry[], date: string): DayWellbeing {
  const day = entries.filter((e) => e.type === "bem_estar" && e.date === date).sort(byMoment);
  const mood = lastWhere(day, (e) => isMood(e.rating))?.rating;
  const sleep = lastWhere(day, (e) => isSleep(e.sleepHours))?.sleepHours;
  return { mood: isMood(mood) ? mood : null, sleep: isSleep(sleep) ? sleep : null };
}

export interface WellbeingDay extends DayWellbeing {
  date: string;
  /** "Ter". */
  weekday: string;
  /** Dia do mês ("22"). */
  day: string;
  isToday: boolean;
  moodLabel: string | null;
  /** "7,5 h" ou "—". */
  sleepText: string;
  /** Altura da cápsula: 0–100, uma casa. */
  sleepPct: number;
  /** "Ter, 22 set: humor Bem, sono 8 h". */
  aria: string;
}

const hours = (sleep: number) => `${fmtNumber(sleep, 1)} h`;

function dayAria(date: string, { mood, sleep }: DayWellbeing): string {
  const when = fmtShortDate(date);
  const moodText = mood === null ? null : `humor ${MOOD_LABELS[mood - 1]}`;
  const sleepText = sleep === null ? null : `sono ${hours(sleep)}`;
  if (moodText && sleepText) return `${when}: ${moodText}, ${sleepText}`;
  if (moodText) return `${when}: ${moodText}, sono não informado`;
  if (sleepText) return `${when}: ${sleepText}, humor não registrado`;
  return `${when}: sem registro de bem-estar`;
}

function wellbeingDay(date: string, value: DayWellbeing, today: string): WellbeingDay {
  return {
    ...value,
    date,
    weekday: WEEKDAYS_SHORT[(weekdayOf(date) + WEEK_DAYS - 1) % WEEK_DAYS]!,
    day: String(Number(date.slice(8, 10))),
    isToday: date === today,
    moodLabel: value.mood === null ? null : MOOD_LABELS[value.mood - 1]!,
    sleepText: value.sleep === null ? "—" : hours(value.sleep),
    sleepPct:
      value.sleep === null
        ? 0
        : round1((Math.min(value.sleep, SLEEP_SCALE_MAX_H) / SLEEP_SCALE_MAX_H) * 100),
    aria: dayAria(date, value),
  };
}

export type CrossKind = "insufficient" | "flat" | "more" | "less" | "similar";
export interface CrossReading {
  kind: CrossKind;
  /** Dias com humor e sono. */
  paired: number;
  text: string;
  /** "2 de 4 dias" (só em insufficient). */
  progress: string | null;
  /** "Com 7 h ou mais de sono: humor 3,7 de 5 (3 dias) · com menos: 2,5 de 5 (2 dias)". */
  detail: string | null;
  /** Aviso fixo de que é descrição, sem relação de causa (todos menos insufficient). */
  note: string | null;
}

const CROSS_TEXT: Record<CrossKind, string> = {
  insufficient: "A leitura cruzada de humor e sono aparece com 4 dias com os dois registrados.",
  flat: "O sono ficou parecido nos dias registrados, então ainda não dá para comparar.",
  more: "Nos dias com mais sono, seu humor foi melhor em média.",
  less: "Nos dias com menos sono, seu humor foi melhor em média.",
  similar: "Seu humor foi parecido nos dias com mais e com menos sono.",
};
const CROSS_NOTE =
  "Leitura dos seus registros, sem relação de causa: humor e sono mudam por muitos motivos.";

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** "3,7 de 5 (3 dias)". */
const groupText = (moods: readonly number[]) =>
  `${fmtNumber(mean(moods), 1)} de 5 (${plural(moods.length, "dia", "dias")})`;

/**
 * Leitura cruzada: P = dias com humor e sono; menos de 4 → insufficient. Limite t = mediana do
 * sono de P arredondada para a meia hora; mais sono = sono ≥ t. Grupo com menos de 2 dias → flat.
 * Diferença de humor médio ≥ 0,5 → more; ≤ −0,5 → less; senão similar.
 */
export function crossReading(days: readonly DayWellbeing[]): CrossReading {
  const pairs = days.flatMap((d) =>
    d.mood !== null && d.sleep !== null ? [{ mood: d.mood, sleep: d.sleep }] : [],
  );
  const paired = pairs.length;
  if (paired < CROSS_MIN_DAYS)
    return {
      kind: "insufficient",
      paired,
      text: CROSS_TEXT.insufficient,
      progress: `${paired} de ${CROSS_MIN_DAYS} dias`,
      detail: null,
      note: null,
    };
  const threshold = toHalfHour(median(pairs.map((p) => p.sleep)));
  const more = pairs.filter((p) => p.sleep >= threshold).map((p) => p.mood);
  const less = pairs.filter((p) => p.sleep < threshold).map((p) => p.mood);
  if (more.length < CROSS_MIN_GROUP || less.length < CROSS_MIN_GROUP)
    return { kind: "flat", paired, text: CROSS_TEXT.flat, progress: null, detail: null, note: CROSS_NOTE };
  // Três casas bastam para a comparação e evitam ruído de ponto flutuante perto de 0,5.
  const diff = Math.round((mean(more) - mean(less)) * 1000) / 1000;
  const kind: CrossKind =
    diff >= CROSS_MIN_DIFF ? "more" : diff <= -CROSS_MIN_DIFF ? "less" : "similar";
  return {
    kind,
    paired,
    text: CROSS_TEXT[kind],
    progress: null,
    detail: `Com ${hours(threshold)} ou mais de sono: humor ${groupText(more)} · com menos: ${groupText(less)}`,
    note: CROSS_NOTE,
  };
}

export interface WellbeingTrend {
  days: WellbeingDay[];
  /** Blocos de 7 dias consecutivos (7 → 1 linha, 28 → 4). */
  rows: WellbeingDay[][];
  /** Dias da semana da 1ª linha (colunas). */
  weekdays: string[];
  moodDays: number;
  sleepDays: number;
  moodAverage: number | null;
  sleepAverage: number | null;
  /** [] quando vazio; senão "Humor em 6 de 7 dias" e, com sono informado, "Sono médio 6,8 h". */
  stats: InsightChip[];
  cross: CrossReading;
  /** "Bem-estar e sono dos últimos 7 dias". */
  aria: string;
  /** Nenhum humor e nenhum sono no período. */
  isEmpty: boolean;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

function statsChips(moods: readonly number[], sleepAverage: number | null, total: number): InsightChip[] {
  const period = plural(total, "dia", "dias");
  const mood: InsightChip = {
    key: "mood",
    text: `Humor em ${moods.length} de ${period}`,
    aria: `Humor registrado em ${moods.length} de ${period}`,
    tone: "mind",
  };
  if (sleepAverage === null) return [mood];
  return [
    mood,
    {
      key: "sleep",
      text: `Sono médio ${hours(sleepAverage)}`,
      aria: `Sono médio de ${hours(sleepAverage)} nos dias com sono informado`,
      tone: "body",
    },
  ];
}

/** Agrupa os bem_estar das `dates` num Map uma vez (O(n)), depois monta os dias. */
export function wellbeingTrend(
  diary: readonly DiaryEntry[],
  dates: readonly string[],
  today: string,
): WellbeingTrend {
  const wanted = new Set(dates);
  const byDate = new Map<string, DiaryEntry[]>();
  for (const entry of diary) {
    if (entry.type !== "bem_estar" || !wanted.has(entry.date)) continue;
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  const days = dates.map((date) =>
    wellbeingDay(date, dayWellbeing(byDate.get(date) ?? [], date), today),
  );
  const moods = days.flatMap((d) => (d.mood === null ? [] : [d.mood]));
  const sleeps = days.flatMap((d) => (d.sleep === null ? [] : [d.sleep]));
  const sleepAverage = sleeps.length ? round1(mean(sleeps)) : null;
  const isEmpty = !moods.length && !sleeps.length;
  const rows = chunk(days, WEEK_DAYS);
  return {
    days,
    rows,
    weekdays: (rows[0] ?? []).map((d) => d.weekday),
    moodDays: moods.length,
    sleepDays: sleeps.length,
    moodAverage: moods.length ? round1(mean(moods)) : null,
    sleepAverage,
    stats: isEmpty ? [] : statsChips(moods, sleepAverage, dates.length),
    cross: crossReading(days),
    aria: `Bem-estar e sono dos últimos ${plural(dates.length, "dia", "dias")}`,
    isEmpty,
  };
}
