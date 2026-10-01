/**
 * Linha do dia da anamnese (ANAM-09): acordar, refeições e dormir numa trilha de 05:00 a 01:00.
 * Lógica pura, sem DOM: web e app nativo desenham a mesma geometria.
 */
import type { Draft } from "../types";
import { toNumber } from "../components/anamnese/inputs";
import { fmtNumber } from "./format";

const MINUTES_PER_DAY = 1440;
export const DAY_START = 5 * 60; // 05:00
export const DAY_SPAN = 20 * 60; // até 01:00 do dia seguinte
/** Minutos por passo de teclado ou arrasto. */
export const TIME_STEP = 15;
export const PAGE_STEP = 60;
/** Distância mínima entre pontos vizinhos. */
export const MIN_GAP = 30;
const TICK_EVERY = 2 * 60;
const HALF_HOUR = 30;
/** Diferença (h) entre o sono informado e o derivado dos horários que vira chip de coerência. */
const SLEEP_MISMATCH_HOURS = 1;

export type DayPointKey =
  | "wakeTime"
  | "breakfastTime"
  | "lunchTime"
  | "dinnerTime"
  | "sleepTime";
export interface DayPoint {
  key: DayPointKey;
  label: string;
  short: string;
  icon: "sun" | "coffee" | "utensils" | "soup" | "moon";
}
export const DAY_POINTS: readonly DayPoint[] = [
  { key: "wakeTime", label: "Acordar", short: "Acordar", icon: "sun" },
  { key: "breakfastTime", label: "Café da manhã", short: "Café", icon: "coffee" },
  { key: "lunchTime", label: "Almoço", short: "Almoço", icon: "utensils" },
  { key: "dinnerTime", label: "Jantar", short: "Jantar", icon: "soup" },
  { key: "sleepTime", label: "Dormir", short: "Dormir", icon: "moon" },
];
/** Posição de partida de um ponto ainda vazio (os padrões do rascunho e um dia comum). */
const DEFAULT_TIMES: Record<DayPointKey, string> = {
  wakeTime: "07:00",
  breakfastTime: "08:00",
  lunchTime: "12:00",
  dinnerTime: "19:00",
  sleepTime: "23:00",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" (ou "HH:MM:SS") válido → minutos do dia; senão null. */
export function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hhmm.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
/** Minutos (módulo 1440) → "HH:MM". */
export function fromMinutes(m: number): string {
  const value =
    ((Math.round(m) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}
/** Distância desde 05:00 (0 = 05:00; 1200 = 01:00 do dia seguinte). */
export const dayOffset = (m: number) =>
  (m - DAY_START + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** Horas de sono entre dormir e acordar, arredondadas a 0,5 h; 0 ou horário inválido → null. */
export function sleepDurationHours(
  sleepTime: unknown,
  wakeTime: unknown,
): number | null {
  const sleep = toMinutes(sleepTime);
  const wake = toMinutes(wakeTime);
  if (sleep === null || wake === null) return null;
  const minutes = (wake - sleep + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.round(minutes / HALF_HOUR) / 2;
  return hours > 0 ? hours : null;
}
/** "8 h", "7,5 h". */
export const fmtHours = (h: number) => `${fmtNumber(h, 1)} h`;

export interface DayTimelineModel {
  /** percent null: vazio ou fora da janela 05:00–01:00. */
  points: {
    key: DayPointKey;
    label: string;
    short: string;
    time: string;
    percent: number | null;
  }[];
  /** Todos preenchidos, dentro de 05:00–01:00 e em ordem com MIN_GAP: só então os pontos arrastáveis aparecem. */
  isLinear: boolean;
  /** % da trilha: [0, acordar] e [dormir, 100] quando isLinear. */
  nightBands: { from: number; to: number }[];
  /** A cada 2 h: "05", "07", …, "23", "01" (11). */
  ticks: { percent: number; label: string }[];
  /** text "Sono: 8 h (23:00 às 07:00)". */
  sleep: { hours: number; text: string } | null;
}

const offsetOf = (a: Draft, key: DayPointKey): number | null => {
  const m = toMinutes(a[key]);
  return m === null ? null : dayOffset(m);
};
const inWindow = (offset: number | null): offset is number =>
  offset !== null && offset <= DAY_SPAN;
const percentOf = (offset: number) => (offset / DAY_SPAN) * 100;

function isOrdered(offsets: (number | null)[]): boolean {
  return offsets.every(
    (offset, i) =>
      inWindow(offset) &&
      (i === 0 || offset - (offsets[i - 1] as number) >= MIN_GAP),
  );
}

const TICKS = Array.from({ length: DAY_SPAN / TICK_EVERY + 1 }, (_, i) => {
  const offset = i * TICK_EVERY;
  return {
    percent: percentOf(offset),
    label: fromMinutes(DAY_START + offset).slice(0, 2),
  };
});

export function dayTimelineModel(a: Draft): DayTimelineModel {
  const offsets = DAY_POINTS.map((p) => offsetOf(a, p.key));
  const points = DAY_POINTS.map((p, i) => {
    const offset = offsets[i];
    return {
      key: p.key,
      label: p.label,
      short: p.short,
      time: offset === null ? "" : fromMinutes(DAY_START + offset),
      percent: inWindow(offset) ? percentOf(offset) : null,
    };
  });
  const isLinear = isOrdered(offsets);
  const wake = points[0].percent;
  const sleepAt = points[points.length - 1].percent;
  const hours = sleepDurationHours(a.sleepTime, a.wakeTime);
  return {
    points,
    isLinear,
    nightBands:
      isLinear && wake !== null && sleepAt !== null
        ? [
            { from: 0, to: wake },
            { from: sleepAt, to: 100 },
          ]
        : [],
    ticks: TICKS.map((t) => ({ ...t })),
    sleep:
      hours === null
        ? null
        : {
            hours,
            text: `Sono: ${fmtHours(hours)} (${points[points.length - 1].time} às ${points[0].time})`,
          },
  };
}

/** Limites (offsets, múltiplos de 15) de um ponto: a janela e MIN_GAP dos vizinhos preenchidos. */
function pointLimits(a: Draft, key: DayPointKey): { low: number; high: number } {
  const index = DAY_POINTS.findIndex((p) => p.key === key);
  const before = DAY_POINTS.slice(0, index)
    .map((p) => offsetOf(a, p.key))
    .filter(inWindow);
  const after = DAY_POINTS.slice(index + 1)
    .map((p) => offsetOf(a, p.key))
    .filter(inWindow);
  const low = before.length ? Math.max(...before) + MIN_GAP : 0;
  const high = after.length ? Math.min(...after) - MIN_GAP : DAY_SPAN;
  return {
    low: Math.ceil(low / TIME_STEP) * TIME_STEP,
    high: Math.floor(high / TIME_STEP) * TIME_STEP,
  };
}

/** Grava o ponto num offset já no passo de 15 min, preso aos limites. */
function placePoint(a: Draft, key: DayPointKey, snapped: number): string {
  const { low, high } = pointLimits(a, key);
  // Vizinhos colados demais: o ponto não tem para onde ir e fica como está.
  if (low > high) return String(a[key] ?? "") || DEFAULT_TIMES[key];
  return fromMinutes(DAY_START + Math.min(high, Math.max(low, snapped)));
}

/**
 * Novo horário de um ponto: passo de 15 min, preso à janela e a MIN_GAP dos vizinhos.
 * Um horário fora do passo (12:10) vai primeiro à marca vizinha no sentido do movimento (12:15).
 */
export function moveDayPoint(
  a: Draft,
  key: DayPointKey,
  deltaMinutes: number,
): string {
  const start =
    offsetOf(a, key) ?? dayOffset(toMinutes(DEFAULT_TIMES[key]) as number);
  const wanted = start + (Number.isFinite(deltaMinutes) ? deltaMinutes : 0);
  const snap = deltaMinutes >= 0 ? Math.floor : Math.ceil;
  return placePoint(a, key, snap(wanted / TIME_STEP) * TIME_STEP);
}

/** Arrasto: posição na trilha (0–100 %) → horário com passo de 15 min e os mesmos limites. */
export function dayPointAtPercent(
  a: Draft,
  key: DayPointKey,
  percent: number,
): string {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const wanted = (clamped / 100) * DAY_SPAN;
  return placePoint(a, key, Math.round(wanted / TIME_STEP) * TIME_STEP);
}

/** Sono informado diferente do derivado dos horários (≥ 1 h): chip de coerência. */
export function sleepMismatch(
  a: Draft,
): { derived: number; text: string; actionLabel: string } | null {
  const stored = toNumber(a.sleepHours);
  const derived = sleepDurationHours(a.sleepTime, a.wakeTime);
  if (stored === null || derived === null) return null;
  if (Math.abs(stored - derived) < SLEEP_MISMATCH_HOURS) return null;
  return {
    derived,
    text: `Você informou ${fmtHours(stored)} de sono; pelos horários são ${fmtHours(derived)}.`,
    actionLabel: `Usar ${fmtHours(derived)}`,
  };
}

/** Sugestão de nível de atividade pelos dias de treino (só uma etiqueta; nunca marca sozinha). */
export function suggestActivity(
  exerciseDays: unknown,
): "sedentario" | "leve" | "moderado" | "intenso" | null {
  const days = toNumber(exerciseDays);
  if (days === null || days < 0) return null;
  if (days === 0) return "sedentario";
  if (days <= 3) return "leve";
  if (days <= 5) return "moderado";
  return "intenso";
}
