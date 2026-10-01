/**
 * Pesagens em linhas (EVOL-08) e medidas com silhueta e mini tendências (EVOL-10): textos descritivos,
 * sem classificação clínica, faixas ou cores por valor. Réguas e escolhas da folha "Registrar medidas"
 * usam o kit da anamnese. Compartilhado pelo web e pelo app (sem DOM).
 */
import type { ChoiceConfig, RulerConfig } from "../components/anamnese/inputs";
import type { Measurement } from "../types";
import { fmtBmi, fmtDayMonth, fmtDelta, fmtKg, fmtNumber } from "./format";

const WEIGHT_MIN_KG = 20;
const WEIGHT_MAX_KG = 350;
/** A régua do peso cobre ±40 kg do peso atual (≈400 traços em vez de 1.650). */
const WEIGHT_RULER_SPAN_KG = 40;

const byDate = (a: Measurement, b: Measurement) => a.date.localeCompare(b.date);
const sortedByDate = (measurements: readonly Measurement[]) => [...measurements].sort(byDate);
/** Uma casa fixa ("88,0"), como o JourneyCard. */
const fixed1 = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
/** "85,5 cm" | "28,5%": o sinal de % vai colado ao número, como em fmtPct. */
const withUnit = (text: string, unit: string) => (unit === "%" ? `${text}%` : `${text} ${unit}`);

export interface DateBlock {
  day: string;
  month: string;
}
/** "2026-09-22" → { day: "22", month: "set" }. */
export function dateBlock(date: string): DateBlock {
  const [day = "", month = ""] = fmtDayMonth(date).split(" ");
  return { day, month };
}

export interface WeighInRow {
  id: string;
  date: string;
  block: DateBlock;
  weight: string;
  method: string;
  chips: string[];
  delta: string | null;
  deltaLabel: string | null;
}

function measureChips(m: Measurement): string[] {
  const chips: string[] = [];
  if (m.waist != null) chips.push(`Cintura ${fmtNumber(m.waist, 1)} cm`);
  if (m.hip != null) chips.push(`Quadril ${fmtNumber(m.hip, 1)} cm`);
  if (m.bodyFat != null) chips.push(`Gordura ${fmtNumber(m.bodyFat, 1)}%`);
  return chips;
}

/** Pesagens em [start,end], da mais nova para a mais antiga. delta = vs a pesagem anterior na lista inteira
 *  (fmtDelta(.., "kg")), null na primeira. Perfil calmo (sensível ou menor de 18, isCalmProfile) vê só
 *  o peso: sem variação e sem fichas de cintura, quadril ou gordura. */
export function weighInRows(
  measurements: readonly Measurement[],
  start: string,
  end: string,
  calm: boolean,
): WeighInRow[] {
  const sorted = sortedByDate(measurements);
  return sorted
    .map((m, i): WeighInRow => {
      const previous = i > 0 ? sorted[i - 1] : undefined;
      const delta = calm || !previous ? null : fmtDelta(m.weight - previous.weight, "kg");
      return {
        id: m.id,
        date: m.date,
        block: dateBlock(m.date),
        weight: fmtKg(m.weight),
        method: m.method,
        chips: calm ? [] : measureChips(m),
        delta,
        deltaLabel: delta === null ? null : `${delta} desde a pesagem anterior`,
      };
    })
    .filter((row) => row.date >= start && row.date <= end)
    .reverse();
}

export type MeasureKey = "waist" | "hip" | "bodyFat";
type MeasureLabel = "Cintura" | "Quadril" | "Gordura";
type MeasureUnit = "cm" | "%";
const MEASURE_META: Record<MeasureKey, { label: MeasureLabel; unit: MeasureUnit }> = {
  waist: { label: "Cintura", unit: "cm" },
  hip: { label: "Quadril", unit: "cm" },
  bodyFat: { label: "Gordura", unit: "%" },
};

export interface MeasureSeries {
  key: MeasureKey;
  label: MeasureLabel;
  unit: MeasureUnit;
  points: { date: string; value: number }[];
  /** Último valor, uma casa fixa: "83,1 cm". */
  latest: string | null;
  /** Último − primeiro com 2 ou mais pontos: "−4,9 cm". */
  delta: string | null;
  /** Data do primeiro ponto ("6 ago") com 2 ou mais pontos. */
  since: string | null;
  aria: string | null;
}
export interface BodyMeasures {
  waist: MeasureSeries;
  hip: MeasureSeries;
  bodyFat: MeasureSeries;
  chips: { text: string; aria: string }[];
  silhouetteAria: string;
  isEmpty: boolean;
}

const pointsOf = (sorted: readonly Measurement[], key: MeasureKey) =>
  sorted.flatMap((m) => {
    const value = m[key];
    return value == null ? [] : [{ date: m.date, value }];
  });

function measureSeries(sorted: readonly Measurement[], key: MeasureKey): MeasureSeries {
  const { label, unit } = MEASURE_META[key];
  const points = pointsOf(sorted, key);
  const first = points[0];
  const last = points.at(-1);
  const hasTrend = points.length >= 2 && first !== undefined && last !== undefined;
  const since = hasTrend ? fmtDayMonth(first.date) : null;
  const deltaText = hasTrend ? fmtDelta(last.value - first.value, unit) : null;
  let aria: string | null = null;
  if (hasTrend)
    aria = `${label}: de ${fixed1(first.value)} a ${withUnit(fixed1(last.value), unit)} desde ${since}`;
  else if (last)
    aria = `${label}: ${withUnit(fixed1(last.value), unit)} em ${fmtDayMonth(last.date)}`;
  return {
    key,
    label,
    unit,
    points,
    latest: last ? withUnit(fixed1(last.value), unit) : null,
    delta: deltaText === null ? null : deltaText.replace(" %", "%"),
    since,
    aria,
  };
}

function bodyChips(sorted: readonly Measurement[], bodyFat: MeasureSeries) {
  const chips: { text: string; aria: string }[] = [];
  const latest = sorted.at(-1);
  const bmi = latest ? fmtBmi(latest.weight, latest.height) : "—";
  if (bmi !== "—") chips.push({ text: `IMC ${bmi}`, aria: `IMC ${bmi} kg/m²` });
  const pair = [...sorted].reverse().find((m) => m.waist != null && m.hip != null && m.hip > 0);
  if (pair?.waist != null && pair.hip != null) {
    const ratio = fmtNumber(pair.waist / pair.hip, 2);
    chips.push({ text: `Cintura/quadril ${ratio}`, aria: `Relação cintura/quadril ${ratio}` });
  }
  const fat = bodyFat.points.at(-1);
  if (fat) {
    const value = fmtNumber(fat.value, 1);
    chips.push({ text: `Gordura ${value}%`, aria: `Gordura corporal medida ${value}%` });
  }
  return chips;
}

export function bodyMeasures(measurements: readonly Measurement[]): BodyMeasures {
  const sorted = sortedByDate(measurements);
  const waist = measureSeries(sorted, "waist");
  const hip = measureSeries(sorted, "hip");
  const bodyFat = measureSeries(sorted, "bodyFat");
  return {
    waist,
    hip,
    bodyFat,
    chips: bodyChips(sorted, bodyFat),
    silhouetteAria: `Silhueta: cintura ${waist.latest ?? "não registrada"}, quadril ${hip.latest ?? "não registrado"}`,
    isEmpty: !waist.points.length && !hip.points.length,
  };
}

/** Régua do peso centrada no peso atual (±40 kg, dentro de 20–350), passo 0,1 kg. */
export function weightRuler(current: number): RulerConfig {
  const value = Number.isFinite(current)
    ? Math.min(WEIGHT_MAX_KG, Math.max(WEIGHT_MIN_KG, current))
    : WEIGHT_MIN_KG + WEIGHT_RULER_SPAN_KG;
  return {
    min: Math.max(WEIGHT_MIN_KG, Math.floor(value) - WEIGHT_RULER_SPAN_KG),
    max: Math.min(WEIGHT_MAX_KG, Math.ceil(value) + WEIGHT_RULER_SPAN_KG),
    step: 0.1,
    tickStep: 0.2,
    majorEvery: 5,
    fineStep: 0.1,
    unit: "kg",
    decimals: 1,
    initial: value,
  };
}

type MeasureRulerBase = Omit<RulerConfig, "initial"> & { fallback: number };
const CM_RULER: Omit<MeasureRulerBase, "fallback"> = {
  min: 40,
  max: 200,
  step: 0.5,
  tickStep: 1,
  majorEvery: 5,
  fineStep: 0.5,
  unit: "cm",
  decimals: 1,
  allowNone: true,
};
const MEASURE_RULERS: Record<MeasureKey, MeasureRulerBase> = {
  waist: { ...CM_RULER, fallback: 80 },
  hip: { ...CM_RULER, fallback: 95 },
  bodyFat: {
    min: 3,
    max: 60,
    step: 0.1,
    tickStep: 0.5,
    majorEvery: 10,
    fineStep: 0.5,
    unit: "%",
    decimals: 1,
    allowNone: true,
    fallback: 25,
  },
};
/** Régua opcional (começa em "Informar"): parte do último valor registrado ou de um valor típico. */
export function measureRuler(key: MeasureKey, last: number | null): RulerConfig {
  const { fallback, ...config } = MEASURE_RULERS[key];
  return { ...config, initial: last ?? fallback };
}

export const MEASURE_METHODS: ChoiceConfig = {
  mode: "single",
  options: [
    "Balança em casa",
    "Balança e fita em casa",
    "Balança de academia ou farmácia",
    "Consultório ou clínica",
    "Bioimpedância",
  ].map((value) => ({ value })),
  otherLabel: "Outro",
  otherPlaceholder: "Ex.: balança e fita métrica em casa",
};

/** "Última: 85,5 cm em 17 set" | "Última: 28,5% em 17 set" | null. */
export function lastValueHint(measurements: readonly Measurement[], key: MeasureKey): string | null {
  const last = pointsOf(sortedByDate(measurements), key).at(-1);
  if (!last) return null;
  return `Última: ${withUnit(fixed1(last.value), MEASURE_META[key].unit)} em ${fmtDayMonth(last.date)}`;
}
