import type { AppState } from "../types";
import { dayLabels } from "../components/evolucao/chart-geometry";
import type { ChatMetric } from "./agent-blocks";
import { dailyTargets, shiftDate, totalsFor } from "./domain";
import { weightTrend, type DayPoint, type TrendPoint } from "./evolution";
import { fmtLiters, fmtNumber } from "./format";
import { isCalmOn } from "./day";
import { bodyNumbers } from "./space";

/**
 * Dados dos gráficos que o agente pode pedir no chat. O modelo só escolhe a métrica; os
 * valores saem dos registros locais da pessoa, com as mesmas regras da Evolução.
 */

type BarMetric = "agua_7d" | "refeicoes_7d";
export type BlockChart =
  | { kind: "bars"; metric: BarMetric; points: DayPoint[]; goalText: string | null }
  | { kind: "weight"; points: TrendPoint[]; start: string; end: string; hasData: boolean };

export const BAR_COPY: Record<
  BarMetric,
  { title: string; tone: "water" | "meals"; unit: string; unitLabel: string; emptyText: string }
> = {
  agua_7d: {
    title: "Água",
    tone: "water",
    unit: "ml",
    unitLabel: "L",
    emptyText: "Sem água registrada.",
  },
  refeicoes_7d: {
    title: "Refeições",
    tone: "meals",
    unit: "refeições",
    unitLabel: "refeições",
    emptyText: "Sem refeições registradas.",
  },
};

const BAR_DAYS = 7;
/** Oito semanas contando hoje. */
const WEIGHT_WINDOW_DAYS = 56;

/** Média das barras na unidade da legenda: litros com uma casa ou refeições inteiras. */
export function formatBarAverage(metric: BarMetric, value: number): string {
  return metric === "agua_7d" ? fmtNumber(value / 1000, 1) : fmtNumber(value);
}

function barChart(state: AppState, metric: BarMetric, today: string): BlockChart {
  const start = shiftDate(today, -(BAR_DAYS - 1));
  const dates = Array.from({ length: BAR_DAYS }, (_, i) => shiftDate(start, i));
  const labels = dayLabels(dates);
  // Com restrição hídrica o app não mostra meta de água (a quantidade é do profissional).
  const waterGoals = metric === "agua_7d" && state.profile?.fluidRestriction !== "sim";
  const points = dates.map((date, i): DayPoint => {
    const totals = totalsFor(state.diary, date);
    return {
      date,
      label: labels[i] ?? "",
      value: metric === "agua_7d" ? totals.water : totals.meals,
      goal: waterGoals ? dailyTargets(state, date).water : null,
    };
  });
  const goal = waterGoals ? dailyTargets(state, today).water : null;
  return { kind: "bars", metric, points, goalText: goal ? `meta ${fmtLiters(goal)}` : null };
}

/**
 * Gráfico pedido pelo agente, ou null quando não se aplica: peso só com os números do corpo
 * completos (nem perfil calmo, inclusive menor de idade, nem "Ocultar números do corpo"). O
 * resumo da semana (semana_7d) não é gráfico de barras: a tela usa weekSummary.
 */
export function blockChart(state: AppState, metric: ChatMetric, today: string): BlockChart | null {
  if (metric === "semana_7d") return null;
  if (metric !== "peso_8s") return barChart(state, metric, today);
  if (!state.profile || bodyNumbers(state.profile, today) !== "full") return null;
  // A tendência corre sobre todas as pesagens (como no cartão de peso); a tela recorta a janela.
  const points = weightTrend(state.measurements);
  const start = shiftDate(today, -(WEIGHT_WINDOW_DAYS - 1));
  return {
    kind: "weight",
    points,
    start,
    end: today,
    hasData: points.some((p) => p.date >= start),
  };
}

// ---------- Resumo da semana (semana_7d) ----------

export type WeekRowKey = "registros" | "proteina" | "agua" | "sono";

export interface WeekRow {
  key: WeekRowKey;
  label: string;
  /** Parte em destaque do valor ("6", "95", "1,9", "7 h"). */
  value: string;
  /** Resto do valor, menor e cinza ("/7 dias", "/115 g por dia", " por noite"). */
  rest: string;
  /** O valor por extenso, sem o rótulo, para leitores de tela ("6 de 7 dias com refeições registradas"). */
  text: string;
  /** Barra sob a linha (segmentos até 7, ou contínua); null quando não há referência. */
  meter: { value: number; total: number; mode: "segments" | "bar" } | null;
}

export interface WeekSummary {
  start: string;
  end: string;
  /** "17 a 23 de setembro". */
  range: string;
  rows: WeekRow[];
  /** "kcal 4% abaixo da meta" (sempre neutro); null com calorias ocultas ou perfil calmo. */
  kcalBadge: string | null;
}

const WEEK_DAYS = 7;
/** Com menos dias com refeição a média de energia não diz nada: sem selo. */
const KCAL_BADGE_MIN_DAYS = 3;
/** Diferença até 2% (arredondada) conta como "na meta". */
const KCAL_ON_TARGET_PCT = 3;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

const monthName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });
const dayOf = (date: string) => Number(date.slice(8, 10));

/** "17 a 23 de setembro"; entre meses, "28 de agosto a 3 de setembro". */
export function weekRange(start: string, end: string): string {
  const endText = `${dayOf(end)} de ${monthName(end)}`;
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${dayOf(start)} a ${endText}`
    : `${dayOf(start)} de ${monthName(start)} a ${endText}`;
}

const clockMinutes = (hhmm: string | undefined) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hhmm?.trim() ?? "");
  return match ? Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]) : null;
};

/** Horas entre dormir e acordar da anamnese (23:00 → 06:45 = 7,75 h); sem horários, as horas informadas. */
function sleepWindow(profile: NonNullable<AppState["profile"]>): number | null {
  const sleep = clockMinutes(profile.sleepTime);
  const wake = clockMinutes(profile.wakeTime);
  if (sleep !== null && wake !== null && sleep !== wake) {
    const span = (wake - sleep + HOURS_PER_DAY * MINUTES_PER_HOUR) % (HOURS_PER_DAY * MINUTES_PER_HOUR);
    return span / MINUTES_PER_HOUR;
  }
  return profile.sleepHours > 0 ? profile.sleepHours : null;
}

/**
 * Resumo dos 7 dias que terminam em `endDate` (a data da mensagem, não hoje), só com os registros
 * locais: dias com refeição, proteína e água médias contra as metas do perfil, sono médio contra a
 * janela da anamnese (nunca "meta"). Linha sem dados some. Perfil calmo (sensível ou menor): sem
 * proteína e sem selo de kcal. Restrição hídrica: só a média de água, sem meta nem barra.
 */
export function weekSummary(state: AppState, endDate: string): WeekSummary {
  const start = shiftDate(endDate, -(WEEK_DAYS - 1));
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => shiftDate(start, i));
  const profile = state.profile;
  const calm = !profile || isCalmOn(profile, endDate);
  const goals = dailyTargets(state, endDate);
  const days = dates.map((date) => totalsFor(state.diary, date));
  const mealDays = days.filter((d) => d.meals > 0);
  const rows: WeekRow[] = [
    {
      key: "registros",
      label: "Registros",
      value: fmtNumber(mealDays.length),
      rest: `/${WEEK_DAYS} dias`,
      text: `${mealDays.length} de ${WEEK_DAYS} dias com refeições registradas`,
      meter: { value: mealDays.length, total: WEEK_DAYS, mode: "segments" },
    },
  ];
  const protein = mean(mealDays.map((d) => d.protein));
  if (!calm && protein !== null) {
    const goal = goals.protein;
    rows.push({
      key: "proteina",
      label: "Proteína",
      value: fmtNumber(protein),
      rest: goal ? `/${fmtNumber(goal)} g por dia` : " g por dia",
      text: `média de ${fmtNumber(protein)} g por dia${goal ? `, de ${fmtNumber(goal)} g` : ""}`,
      meter: goal ? { value: protein, total: goal, mode: "bar" } : null,
    });
  }
  const water = mean(days.map((d) => d.water).filter((ml) => ml > 0));
  if (water !== null) {
    const goal = profile?.fluidRestriction === "sim" ? null : goals.water;
    const liters = fmtNumber(water / 1000, 1);
    rows.push({
      key: "agua",
      label: "Água",
      value: liters,
      rest: goal ? `/${fmtNumber(goal / 1000, 1)} L por dia` : " L por dia",
      text: `média de ${liters} L por dia${goal ? `, de ${fmtNumber(goal / 1000, 1)} L` : ""}`,
      meter: goal ? { value: water, total: goal, mode: "bar" } : null,
    });
  }
  const sleepDates = new Set(dates);
  const sleep = mean(
    state.diary
      .filter((e) => sleepDates.has(e.date) && e.type === "bem_estar" && typeof e.sleepHours === "number")
      .map((e) => e.sleepHours as number),
  );
  if (sleep !== null) {
    const span = profile ? sleepWindow(profile) : null;
    const hours = `${fmtNumber(sleep, 1)} h`;
    rows.push({
      key: "sono",
      label: "Sono",
      value: hours,
      rest: " por noite",
      text: `média de ${hours} por noite`,
      meter: span ? { value: sleep, total: span, mode: "bar" } : null,
    });
  }
  return { start, end: endDate, range: weekRange(start, endDate), rows, kcalBadge: kcalBadge() };

  function kcalBadge(): string | null {
    if (!profile || profile.hideCalories || calm || !goals.calories) return null;
    if (mealDays.length < KCAL_BADGE_MIN_DAYS) return null;
    const energy = mean(mealDays.map((d) => d.calories)) ?? 0;
    const pct = Math.round(((energy - goals.calories) / goals.calories) * 100);
    if (Math.abs(pct) < KCAL_ON_TARGET_PCT) return "kcal na meta";
    return `kcal ${Math.abs(pct)}% ${pct < 0 ? "abaixo" : "acima"} da meta`;
  }
}
