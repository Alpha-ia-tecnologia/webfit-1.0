/**
 * Consistência da rotina em calendário de anéis (EVOL-09): o que foi registrado em cada dia do período
 * (água, refeição, combinado), dias com registro e combinados cumpridos. Nada conta dias seguidos:
 * dia sem registro é só o trilho neutro, nunca cobrança. Compartilhado pelo web e pelo app.
 */
import type { AppState, HabitItem } from "../types";
import { shiftDate } from "./dates";
import { presenceLabel, weekPresence } from "./diary-day";
import { fmtShortDate, plural } from "./format";
import { WEEKDAYS_SHORT, weekStart } from "./today";

const WEEK_DAYS = 7;

export interface ConsistencyDay {
  date: string;
  /** Dia do mês ("24"). */
  day: string;
  isToday: boolean;
  water: boolean;
  meal: boolean;
  habit: boolean;
  /** Qualquer registro no diário (bem-estar incluído) ou combinado cumprido. */
  hasRecord: boolean;
  aria: string;
}
export interface ConsistencyModel {
  /** Blocos de 7 dias consecutivos (7 → 1 linha, 28 → 4). */
  rows: ConsistencyDay[][];
  /** WEEKDAYS_SHORT da 1ª linha (colunas). */
  weekdays: string[];
  recordDays: number;
  totalDays: number;
  habitsDone: number;
  habitsPossible: number;
  /** "6 de 7 dias com registro". */
  recordText: string;
  /** "5 de 21 combinados" | "Nenhum combinado ativo no período". */
  habitsText: string;
  /** "Consistência dos últimos 7 dias". */
  aria: string;
}

const weekdayOf = (date: string) =>
  WEEKDAYS_SHORT[(new Date(`${date}T12:00:00`).getDay() + WEEK_DAYS - 1) % WEEK_DAYS]!;

/** Conclusões antes da criação do combinado não contam (nem no anel, nem na soma). */
const validCompletions = (habits: readonly HabitItem[]): HabitItem[] =>
  habits.map((h) => ({
    ...h,
    completedDates: h.completedDates.filter((d) => d >= h.createdDate),
  }));

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

function dayAria(date: string, parts: string, hasRecord: boolean): string {
  const what = parts || (hasRecord ? "outros registros" : "sem registro");
  return `${fmtShortDate(date)}: ${what}`;
}

export function consistencyModel(
  state: Pick<AppState, "diary" | "habits">,
  dates: readonly string[],
  today: string,
): ConsistencyModel {
  const habits = validCompletions(state.habits);
  const presence = weekPresence(state.diary, habits, dates);
  const diaryDays = new Set(state.diary.map((e) => e.date));
  const days = presence.map((p): ConsistencyDay => {
    const hasRecord = diaryDays.has(p.date) || p.habit;
    return {
      date: p.date,
      day: String(Number(p.date.slice(8, 10))),
      isToday: p.date === today,
      water: p.water,
      meal: p.meal,
      habit: p.habit,
      hasRecord,
      aria: dayAria(p.date, presenceLabel(p), hasRecord),
    };
  });
  const active = (date: string) => habits.filter((h) => h.createdDate <= date);
  const habitsPossible = dates.reduce((sum, date) => sum + active(date).length, 0);
  const habitsDone = dates.reduce(
    (sum, date) => sum + active(date).filter((h) => h.completedDates.includes(date)).length,
    0,
  );
  const recordDays = days.filter((d) => d.hasRecord).length;
  const totalDays = dates.length;
  const rows = chunk(days, WEEK_DAYS);
  return {
    rows,
    weekdays: (rows[0] ?? []).map((d) => weekdayOf(d.date)),
    recordDays,
    totalDays,
    habitsDone,
    habitsPossible,
    recordText: `${recordDays} de ${plural(totalDays, "dia", "dias")} com registro`,
    habitsText: habitsPossible
      ? `${habitsDone} de ${plural(habitsPossible, "combinado", "combinados")}`
      : "Nenhum combinado ativo no período",
    aria: `Consistência dos últimos ${plural(totalDays, "dia", "dias")}`,
  };
}

/** Semanas do calendário "Seus registros" da Evolução (conceito 09). */
export const CALENDAR_WEEKS = 4;

export interface CalendarDay extends ConsistencyDay {
  /** Dia depois de hoje (fim da semana atual): número apagado, sem anel nem registro. */
  isFuture: boolean;
}
export interface ConsistencyCalendar {
  /** Semanas de segunda a domingo; a última é a semana de hoje. */
  rows: CalendarDay[][];
  /** Iniciais das colunas: "S", "T", "Q", "Q", "S", "S", "D". */
  weekdays: string[];
  /** Dias (até hoje) com refeição, com água e com combinado cumprido; `elapsed` = dias até hoje. */
  counts: { meal: number; water: number; habit: number; elapsed: number };
  /** "Registros das últimas 4 semanas". */
  aria: string;
}

/**
 * Calendário "Seus registros" (EVOL-09): as últimas `weeks` semanas de segunda a domingo, terminando
 * na semana de hoje. Cada dia até hoje mostra o que foi registrado; os dias que ainda não chegaram
 * ficam sem anel. As contagens só descrevem os registros: nada de sequência ou de cobrança.
 */
export function consistencyCalendar(
  state: Pick<AppState, "diary" | "habits">,
  today: string,
  weeks: number = CALENDAR_WEEKS,
): ConsistencyCalendar {
  const total = Math.max(1, Math.round(weeks)) * WEEK_DAYS;
  const first = shiftDate(weekStart(today), -(total - WEEK_DAYS));
  const dates = Array.from({ length: total }, (_, i) => shiftDate(first, i));
  const elapsed = dates.filter((d) => d <= today);
  const past = consistencyModel(state, elapsed, today).rows.flat();
  const days = dates.map((date, i): CalendarDay => {
    const day = past[i];
    if (day && date <= today) return { ...day, isFuture: false };
    return {
      date,
      day: String(Number(date.slice(8, 10))),
      isToday: false,
      water: false,
      meal: false,
      habit: false,
      hasRecord: false,
      aria: `${fmtShortDate(date)}: ainda não chegou`,
      isFuture: true,
    };
  });
  return {
    rows: chunk(days, WEEK_DAYS),
    weekdays: WEEKDAYS_SHORT.map((w) => w.charAt(0)),
    counts: {
      meal: past.filter((d) => d.meal).length,
      water: past.filter((d) => d.water).length,
      habit: past.filter((d) => d.habit).length,
      elapsed: past.length,
    },
    aria:
      total === WEEK_DAYS
        ? "Registros da última semana"
        : `Registros das últimas ${total / WEEK_DAYS} semanas`,
  };
}
