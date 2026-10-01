/**
 * Lógica da tela Evolução, compartilhada pelo web e pelo app (sem DOM):
 * tendência do peso, ritmo, jornada até a meta, gráfico de peso em pixels reais,
 * barras dos dias e a linha de partida da primeira visita.
 */
import { dayLabels } from "../components/evolucao/chart-geometry";
import { dailyTargets, shiftDate, totalsFor } from "./domain";
import { fmtShortDate } from "./format";
import { planReminders } from "./reminder-plan";
import { isCalmProfile, memberSince } from "./space";
import { doseTimelineAria, type DoseTimeline } from "./treatment";
import type { AppState, Measurement } from "../types";

/** Períodos do gráfico de peso (conceito 09: 1M, 3M, 6M e Tudo, pequenos ao lado do título). */
export const WEIGHT_RANGES = [
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 180 },
  { key: "tudo", label: "Tudo", days: null },
] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number]["key"];

/** Constante de tempo da tendência: cada pesagem puxa a linha sem seguir cada oscilação do dia. */
const TREND_TAU_DAYS = 10;
/** Janela do ritmo semanal. */
const PACE_WINDOW_DAYS = 28;
/** Menor intervalo entre pesagens para calcular ritmo. */
const PACE_MIN_SPAN_DAYS = 7;
/** Período mínimo do gráfico em "Tudo": uma semana. */
const MIN_RANGE_DAYS = 7;
/** Folga acima do maior valor das barras. */
const BAR_HEADROOM = 1.1;
const PROTEIN_G_PER_KG = { min: 1.2, max: 1.6 } as const;
const FIRST_DAYS_GOAL = 3;
/** Janela da linha de partida: registros das últimas duas semanas. */
const START_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** "6 ago": dia e mês curtos, sem ponto de abreviação. */
export function fmtDayMonth(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}`;
}

export interface TrendPoint {
  id: string;
  date: string;
  weight: number;
  /** Peso de tendência (média exponencial ponderada pelo tempo entre pesagens). */
  trend: number;
}

/** Pesagens em ordem de data com a linha de tendência. */
export function weightTrend(
  measurements: readonly Pick<Measurement, "id" | "date" | "weight">[],
): TrendPoint[] {
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  let previous: TrendPoint | null = null;
  return sorted.map((m) => {
    const trend: number =
      previous === null
        ? m.weight
        : round2(
            previous.trend +
              (1 - Math.exp(-(dayNumber(m.date) - dayNumber(previous.date)) / TREND_TAU_DAYS)) *
                (m.weight - previous.trend),
          );
    previous = { id: m.id, date: m.date, weight: m.weight, trend };
    return previous;
  });
}

/** kg por semana pela regressão da tendência nas últimas 4 semanas; null com pouco histórico. */
export function pacePerWeek(
  points: readonly TrendPoint[],
  today: string,
  windowDays = PACE_WINDOW_DAYS,
): number | null {
  const recent = points.filter((p) => p.date > shiftDate(today, -windowDays));
  if (recent.length < 2) return null;
  const xs = recent.map((p) => dayNumber(p.date));
  if (xs[xs.length - 1]! - xs[0]! < PACE_MIN_SPAN_DAYS) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = recent.reduce((a, p) => a + p.trend, 0) / recent.length;
  let num = 0;
  let den = 0;
  recent.forEach((p, i) => {
    num += (xs[i]! - meanX) * (p.trend - meanY);
    den += (xs[i]! - meanX) ** 2;
  });
  return den === 0 ? null : round1((num / den) * 7);
}

export interface Journey {
  current: { weight: number; date: string };
  start: { weight: number; date: string };
  trendWeight: number;
  /** Variação desde a primeira pesagem; null em perfil sensível. */
  delta: number | null;
  /** Peso desejado; null sem meta ou em perfil sensível. */
  target: number | null;
  /** Parte do caminho início → meta já percorrida (0 a 1). */
  progress: number | null;
  pace: number | null;
  /** Cintura e quadril; null sem medida ou em perfil calmo. */
  waist: { value: number; delta: number } | null;
  hip: { value: number; delta: number } | null;
  count: number;
  /** Perfil calmo (isCalmProfile: sensível ou menor de 18): só o valor do peso. */
  isSensitive: boolean;
}

function measureChange(
  sorted: readonly Measurement[],
  key: "waist" | "hip",
): { value: number; delta: number } | null {
  const withValue = sorted.filter((m) => m[key] !== null && m[key] !== undefined);
  if (!withValue.length) return null;
  const first = withValue[0]![key]!;
  const last = withValue[withValue.length - 1]![key]!;
  return { value: last, delta: round1(last - first) };
}

/**
 * "Sua jornada": peso atual, variação, caminho até a meta, ritmo e medidas.
 * Perfil calmo (transtorno alimentar, gestação ou menor de 18) vê só o valor: sem variação,
 * meta, caminho, ritmo nem cintura e quadril, mesmo com uma meta antiga salva.
 */
export function journeyFor(state: AppState, today: string): Journey | null {
  const sorted = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const sensitive = state.profile ? isCalmProfile(state.profile, today) : false;
  const trend = weightTrend(sorted);
  const target = sensitive ? null : (state.profile?.targetWeight ?? null);
  const progress =
    target === null || first.weight === target
      ? null
      : clamp01((first.weight - last.weight) / (first.weight - target));
  return {
    current: { weight: last.weight, date: last.date },
    start: { weight: first.weight, date: first.date },
    trendWeight: trend[trend.length - 1]!.trend,
    delta: sensitive ? null : round1(last.weight - first.weight),
    target,
    progress,
    pace: sensitive ? null : pacePerWeek(trend, today),
    waist: sensitive ? null : measureChange(sorted, "waist"),
    hip: sensitive ? null : measureChange(sorted, "hip"),
    count: sorted.length,
    isSensitive: sensitive,
  };
}

/** Intervalo sugerido entre pesagens: o mesmo do lembrete "Atualizar medidas". */
export const WEIGH_IN_INTERVAL_DAYS = 7;

export interface NextWeighIn {
  date: string;
  /** "overdue": passou do intervalo e a pesagem é sugerida para hoje. */
  status: "future" | "today" | "overdue";
  label: string;
}

/** "Seg, 29 set" → "seg, 29 set" (no meio da frase). */
const inSentence = (date: string) => {
  const text = fmtShortDate(date);
  return text.charAt(0).toLowerCase() + text.slice(1);
};

/**
 * "Próxima pesagem": pela agenda do lembrete de medidas, quando ativo, ou pela última pesagem
 * mais 7 dias. Atrasada vira "Pesagem sugerida hoje" (sem cobrança). Perfil calmo (sensível ou
 * menor de idade) não recebe.
 */
export function nextWeighIn(
  state: AppState,
  today: string,
  now = new Date(),
): NextWeighIn | null {
  if (!state.profile || isCalmProfile(state.profile, today) || !state.measurements.length) return null;
  const last = state.measurements.reduce((a, m) => (m.date > a ? m.date : a), "");
  const due = shiftDate(last, WEIGH_IN_INTERVAL_DAYS);
  if (due < today) return { date: today, status: "overdue", label: "Pesagem sugerida hoje" };
  if (due === today) return { date: today, status: "today", label: "Próxima pesagem hoje" };
  const reminder = planReminders(state, now).find((r) => r.type === "medicao");
  const date = reminder && reminder.date > today ? reminder.date : due;
  return { date, status: "future", label: `Próxima pesagem: ${inSentence(date)}` };
}

/** Até esta distância da primeira pesagem, o gráfico abre em "Tudo" (colado aos dados). */
const DEFAULT_ALL_MAX_DAYS = 180;

/** Período inicial do gráfico de peso: "Tudo" com até 6 meses de histórico, "6M" depois disso. */
export function defaultRange(firstDate: string, today: string): WeightRange {
  return dayNumber(today) - dayNumber(firstDate) <= DEFAULT_ALL_MAX_DAYS ? "tudo" : "6m";
}

/** Início do período do gráfico de peso; "Tudo" vai da primeira pesagem (no mínimo uma semana). */
export function rangeStart(range: WeightRange, today: string, firstDate: string): string {
  const option = WEIGHT_RANGES.find((r) => r.key === range)!;
  if (option.days !== null) return shiftDate(today, -(option.days - 1));
  const minimum = shiftDate(today, -(MIN_RANGE_DAYS - 1));
  return firstDate < minimum ? firstDate : minimum;
}

export interface WeightDot extends TrendPoint {
  x: number;
  y: number;
  trendY: number;
}
/** Degrau de dose sobre o gráfico (EVOL-04): faixa violeta neutra, sem peso por dose. */
export interface DoseSegment {
  key: string;
  x: number;
  width: number;
  label: string;
  /** Rótulo do chip no topo da faixa: "2,50 mg/sem" (semanal) ou igual a `label`. */
  rate: string;
  showLabel: boolean;
  isAlt: boolean;
}
export interface DoseMark {
  x: number;
  date: string;
}
export interface DoseOverlay {
  segments: DoseSegment[];
  marks: DoseMark[];
  /** Próxima aplicação estimada (só quem acompanha a frequência; nunca perfil calmo ou gestação). */
  next: DoseMark | null;
  aria: string;
}
/** Faixa "Aplicações" dentro do gráfico (Evolução): limites e centro em y. */
export interface DoseLane {
  top: number;
  bottom: number;
  y: number;
}
export interface WeightChartModel {
  plot: { left: number; right: number; top: number; bottom: number };
  dots: WeightDot[];
  trendPath: string;
  targetY: number | null;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  /** Degraus de dose registrados no período; null sem dose (ou perfil sensível, que não passa `dose`). */
  dose: DoseOverlay | null;
  /** Faixa das aplicações (com `laneHeight` e dose visível); null no relatório e sem dose. */
  lane: DoseLane | null;
}

const CHART_PAD = { left: 10, right: 38, top: 18, bottom: 26 } as const;
/** Espaço extra no topo para o chip da dose ("2,50 mg/sem") quando há faixa de aplicações. */
const DOSE_CHIP_ROOM = 12;
/** Folga entre a área do peso e a faixa de aplicações, e entre a faixa e as datas. */
const LANE_GAP = 8;
const LANE_BOTTOM_GAP = 4;
/** Largura mínima (px) de um degrau para caber o chip "2,50 mg/sem". */
const DOSE_LABEL_MIN_PX = 56;
/** Degraus mais estreitos que isso não são desenhados. */
const DOSE_MIN_WIDTH_PX = 1;
const Y_TICK_COUNT = 3;
/** Passos "redondos" do eixo do peso, em kg. */
const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 50] as const;
const X_TICK_COUNT = 4;
/**
 * Espaço mínimo (px) entre duas datas do eixo: a primeira fica alinhada à esquerda ("6 ago", ~34 px em 12 px) e a
 * segunda centrada; abaixo disso, "6 ago20 ago" se encostam a 320 px. O número de datas cai com a largura.
 */
export const MIN_TICK_SPACING_PX = 56;
/** Distância mínima (px) entre o "hoje" forçado e outra data do eixo (rótulos de 12 px: "17 set" cabe ao lado, como no conceito). */
export const TODAY_TICK_GAP_PX = 32;
/** Dias depois da próxima aplicação estimada: o disco tracejado não encosta no eixo do peso. */
export const NEXT_DOSE_TAIL_DAYS = 2;

/** Fim do gráfico de peso: hoje, ou logo depois da próxima aplicação estimada quando ela é futura. */
export function weightChartEnd(today: string, nextDose: string | null): string {
  return nextDose && nextDose > today ? shiftDate(nextDose, NEXT_DOSE_TAIL_DAYS) : today;
}

/**
 * Degraus e aplicações no período [start, end], com o mesmo x() do gráfico; null sem degrau visível. O nome acessível
 * usa `today` (não o fim do gráfico, que a próxima aplicação estimada estende): o degrau em curso segue "desde…".
 */
function doseOverlay(
  dose: DoseTimeline,
  start: string,
  end: string,
  right: number,
  x: (date: string) => number,
  nextDose: string | null,
  today: string,
): DoseOverlay | null {
  const next = nextDose && nextDose >= start && nextDose <= end ? { x: x(nextDose), date: nextDose } : null;
  const visible = dose.spans
    .filter((s) => s.from <= end && s.end > start)
    .map((span, i, all) => {
      const left = x(span.from > start ? span.from : start);
      // O degrau em curso segue até a borda quando a próxima aplicação estimada está no gráfico.
      const edge = next && i === all.length - 1 ? right : Math.min(x(span.end), right);
      return { span, x: left, width: round1(edge - left) };
    })
    .filter((s) => s.width >= DOSE_MIN_WIDTH_PX);
  if (!visible.length) return null;
  return {
    segments: visible.map((s, i) => ({
      key: s.span.key,
      x: s.x,
      width: s.width,
      label: s.span.label,
      rate: s.span.rate,
      showLabel: s.width >= DOSE_LABEL_MIN_PX,
      isAlt: i % 2 === 1,
    })),
    marks: dose.applications
      .filter((a) => a.date >= start && a.date <= end)
      .map((a) => ({ x: x(a.date), date: a.date })),
    next,
    aria: doseTimelineAria(
      visible.map((s) => s.span),
      today,
    ),
  };
}

/**
 * Datas do eixo x: `count` datas igualmente espaçadas; com "hoje" no meio do período (a próxima
 * aplicação estimada estende o gráfico), as datas depois dele saem e um "hoje" entra no x de hoje.
 */
function xTicksFor(
  start: string,
  end: string,
  days: number,
  count: number,
  today: string,
  x: (date: string) => number,
): { x: number; label: string }[] {
  const ticks = Array.from({ length: count }, (_, i) => {
    const date = shiftDate(start, Math.round((days * i) / (count - 1)));
    return { date, x: x(date), label: date === today ? "hoje" : fmtDayMonth(date) };
  });
  const inside = today > start && today < end && !ticks.some((t) => t.date === today);
  if (!inside) return ticks.map(({ x: at, label }) => ({ x: at, label }));
  const todayX = x(today);
  return [
    ...ticks
      .filter((t) => t.date < today && todayX - t.x >= TODAY_TICK_GAP_PX)
      .map(({ x: at, label }) => ({ x: at, label })),
    { x: todayX, label: "hoje" },
  ];
}

/**
 * Gráfico de peso em pixels reais (o web e o app passam a largura medida): pontos das
 * pesagens do período, linha de tendência, linha da meta e rótulos de eixo legíveis.
 * Com `dose` (nunca em perfil sensível), os degraus registrados vão numa faixa à parte; com
 * `laneHeight` (Evolução), as aplicações ganham uma faixa dentro do gráfico, abaixo do peso.
 * `targetFit: "near"` (Evolução) só põe a meta na escala quando ela fica a até um passo dos
 * dados; longe, a linha some (`targetY` null) e a meta vai só como texto na legenda.
 */
export function weightChartModel({
  points,
  start,
  end,
  target,
  width,
  height,
  today = end,
  dose = null,
  targetFit = "fit",
  xTickCount = X_TICK_COUNT,
  laneHeight = 0,
  nextDose = null,
}: {
  points: readonly TrendPoint[];
  start: string;
  end: string;
  target: number | null;
  width: number;
  height: number;
  today?: string;
  dose?: DoseTimeline | null;
  /** "fit" (padrão, relatório): a meta sempre entra na escala. "near": só perto dos dados. */
  targetFit?: "fit" | "near";
  /** Datas no eixo x (padrão 4; a Evolução usa 5). */
  xTickCount?: number;
  /** Altura da faixa "Aplicações" dentro do gráfico (0 = sem faixa). */
  laneHeight?: number;
  /** Próxima aplicação estimada (AAAA-MM-DD), só para quem acompanha a frequência. */
  nextDose?: string | null;
}): WeightChartModel {
  const left = CHART_PAD.left;
  const right = Math.max(CHART_PAD.left + 1, width - CHART_PAD.right);
  const days = Math.max(1, dayNumber(end) - dayNumber(start));
  const x = (date: string) =>
    round1(left + ((dayNumber(date) - dayNumber(start)) / days) * (right - left));
  const overlay = dose ? doseOverlay(dose, start, end, right, x, nextDose, today) : null;
  const hasLane = overlay !== null && laneHeight > 0;
  const top = CHART_PAD.top + (hasLane ? DOSE_CHIP_ROOM : 0);
  const laneBottom = height - CHART_PAD.bottom - LANE_BOTTOM_GAP;
  const plot = {
    left,
    right,
    top,
    bottom: Math.max(
      top + 1,
      hasLane ? laneBottom - laneHeight - LANE_GAP : height - CHART_PAD.bottom,
    ),
  };
  const inRange = points.filter((p) => p.date >= start && p.date <= end);
  const data = inRange.flatMap((p) => [p.weight, p.trend]);
  const scale = (values: readonly number[]) => {
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 1;
    const pad = Math.max(0.5, (rawMax - rawMin) * 0.08);
    const min = rawMin - pad;
    // Três marcas em passos redondos (ex.: 70, 75, 80); a escala cresce para caber a última.
    const step =
      NICE_STEPS.find((s) => s * (Y_TICK_COUNT - 0.5) >= rawMax + pad - min) ??
      NICE_STEPS[NICE_STEPS.length - 1];
    return { rawMin, rawMax, pad, min, step };
  };
  const dataScale = scale(data);
  // "near": a meta só entra quando fica a até um passo dos dados (senão achataria a curva).
  const targetInScale =
    target !== null &&
    (targetFit === "fit" ||
      !data.length ||
      (target >= dataScale.rawMin - dataScale.step && target <= dataScale.rawMax + dataScale.step));
  const { rawMax, pad, min, step } = targetInScale ? scale([...data, target]) : dataScale;
  const firstTick = Math.ceil(min / step) * step;
  const tickValues = Array.from({ length: Y_TICK_COUNT }, (_, i) => firstTick + i * step);
  const max = Math.max(rawMax + pad, tickValues[tickValues.length - 1]! + step * 0.25);
  const span = max - min;
  const y = (v: number) => round1(plot.bottom - ((v - min) / span) * (plot.bottom - plot.top));
  const dots = inRange.map((p) => ({ ...p, x: x(p.date), y: y(p.weight), trendY: y(p.trend) }));
  const trendPath = dots.map((d, i) => `${i ? "L" : "M"}${d.x},${d.trendY}`).join(" ");
  const decimals = step < 1 ? 1 : 0;
  const yTicks = tickValues.map((value) => ({
    y: y(value),
    label: value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  }));
  return {
    plot,
    dots,
    trendPath,
    targetY: targetInScale && target !== null ? y(target) : null,
    yTicks,
    xTicks: xTicksFor(
      start,
      end,
      days,
      Math.max(2, Math.min(xTickCount, Math.floor((plot.right - plot.left) / MIN_TICK_SPACING_PX) + 1)),
      today,
      x,
    ),
    dose: overlay,
    lane:
      overlay && hasLane
        ? {
            top: laneBottom - laneHeight,
            bottom: laneBottom,
            y: round1(laneBottom - laneHeight / 2),
          }
        : null,
  };
}

export interface DayPoint {
  date: string;
  label: string;
  value: number;
  goal: number | null;
}
export interface DayBar extends DayPoint {
  heightPct: number;
  hasRecord: boolean;
  isToday: boolean;
}

/**
 * Barras dos dias em porcentagem da altura (HTML e View), com média dos dias registrados.
 * `reference` desenha uma faixa (ex.: proteína de 1,2 a 1,6 g/kg) e entra na escala.
 */
export function dayBars(
  points: readonly DayPoint[],
  today: string,
  reference: { min: number; max: number } | null = null,
): {
  bars: DayBar[];
  goal: number | null;
  goalPct: number | null;
  average: number | null;
  bandPct: { min: number; max: number } | null;
} {
  const goals = points.flatMap((p) => (p.goal === null ? [] : [p.goal]));
  const top =
    Math.max(1, ...points.map((p) => p.value), ...goals, reference?.max ?? 0) * BAR_HEADROOM;
  const recorded = points.filter((p) => p.value > 0);
  const goal = goals.length ? goals[goals.length - 1]! : null;
  return {
    bars: points.map((p) => ({
      ...p,
      heightPct: round1((p.value / top) * 100),
      hasRecord: p.value > 0,
      isToday: p.date === today,
    })),
    goal,
    goalPct: goal === null ? null : round1((goal / top) * 100),
    average: recorded.length
      ? Math.round(recorded.reduce((sum, p) => sum + p.value, 0) / recorded.length)
      : null,
    bandPct: reference
      ? { min: round1((reference.min / top) * 100), max: round1((reference.max / top) * 100) }
      : null,
  };
}

export type DailyKind = "calories" | "water" | "protein" | "meals";

/**
 * Séries dos mini gráficos (Evolução e folha de detalhes): os `days` dias até hoje, com rótulos
 * do eixo e a meta vigente em cada data (só calorias e água têm meta).
 */
export function dailySeries(
  state: AppState,
  today: string,
  days: number,
): Record<DailyKind, DayPoint[]> {
  const start = shiftDate(today, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => shiftDate(start, i));
  const labels = dayLabels(dates);
  const daily = dates.map((date, i) => ({
    date,
    label: labels[i] ?? "",
    totals: totalsFor(state.diary, date),
    target: dailyTargets(state, date),
  }));
  type Day = (typeof daily)[number];
  const series = (value: (d: Day) => number, goal?: (d: Day) => number | null): DayPoint[] =>
    daily.map((d) => ({ date: d.date, label: d.label, value: value(d), goal: goal ? goal(d) : null }));
  return {
    calories: series((d) => d.totals.calories, (d) => d.target.calories),
    water: series((d) => d.totals.water, (d) => d.target.water),
    protein: series((d) => d.totals.protein),
    meals: series((d) => d.totals.meals),
  };
}

/** Faixa de referência de proteína (1,2 a 1,6 g por kg), só para perfis não sensíveis. */
export function proteinBand(weight: number): { min: number; max: number } {
  return {
    min: Math.round(weight * PROTEIN_G_PER_KG.min),
    max: Math.round(weight * PROTEIN_G_PER_KG.max),
  };
}

export interface StartItem {
  key: "pesagem" | "refeicoes" | "agua";
  label: string;
  done: number;
  total: number;
}

/** "Sua linha de partida": primeiros registros que dão vida aos gráficos (sem pesagem para perfil calmo). */
export function startChecklist(state: AppState, today: string): StartItem[] {
  const since = shiftDate(today, -(START_WINDOW_DAYS - 1));
  const daysWith = (type: "refeicao" | "agua") =>
    new Set(
      state.diary
        .filter((e) => e.type === type && e.date >= since && e.date <= today)
        .map((e) => e.date),
    ).size;
  const calm = state.profile ? isCalmProfile(state.profile, today) : false;
  const items: StartItem[] = [];
  if (!calm)
    items.push({
      key: "pesagem",
      label: "Registrar a segunda pesagem",
      done: Math.min(2, state.measurements.length),
      total: 2,
    });
  items.push(
    {
      key: "refeicoes",
      label: "Registrar refeições em 3 dias",
      done: Math.min(FIRST_DAYS_GOAL, daysWith("refeicao")),
      total: FIRST_DAYS_GOAL,
    },
    {
      key: "agua",
      label: "Registrar água em 3 dias",
      done: Math.min(FIRST_DAYS_GOAL, daysWith("agua")),
      total: FIRST_DAYS_GOAL,
    },
  );
  return items;
}

const WEEK = 7;

/**
 * Subtítulo do cabeçalho da Evolução (EVOL-01): "Qui, 24 set · 7 semanas de registros". Conta as
 * semanas desde o primeiro registro (metas, medidas ou diário); na primeira semana, "primeira semana
 * de registros"; sem nenhum registro, só a data. Informativo: sem sequência, nada que zera.
 */
export function evolutionSubtitle(state: AppState, today: string): string {
  const day = fmtShortDate(today);
  const since = memberSince(state);
  if (!since || since > today) return day;
  const weeks = Math.floor((dayNumber(today) - dayNumber(since)) / WEEK);
  const span =
    weeks < 1
      ? "primeira semana de registros"
      : `${weeks} ${weeks === 1 ? "semana" : "semanas"} de registros`;
  return `${day} · ${span}`;
}
