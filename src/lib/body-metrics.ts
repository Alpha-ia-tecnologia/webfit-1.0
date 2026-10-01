/**
 * Números do corpo na anamnese (ANAM-11, ANAM-13): IMC em faixas neutras, linhas de medida da
 * silhueta e projeção de peso em faixa de meses. Nunca uma data exata, nunca cor de alerta.
 * Quem pode ver cada número é decidido em anamnese-flow (canShowBodyNumbers, canShowProjection).
 */
import { MONTHS_PT } from "../components/anamnese/inputs";
import { shiftDate } from "./dates";
import { fmtNumber } from "./format";

// ---------- IMC ----------
export const BMI_BOUNDS = [10, 18.5, 25, 30, 45] as const;
export const BMI_BANDS = [
  "abaixo de 18,5",
  "18,5 a 24,9",
  "25 a 29,9",
  "30 ou mais",
] as const;
export const BMI_CAPTION =
  "Referência geral para adultos: não considera músculos nem a composição do corpo.";
/** Dentro da faixa, o marcador ocupa [0,15; 0,85] da largura dela. */
const BAND_INSET = 0.15;
export interface BmiGauge {
  bmi: number;
  value: string;
  band: 0 | 1 | 2 | 3;
  markerPercent: number;
  ariaLabel: string;
}

function bmiBand(bmi: number): 0 | 1 | 2 | 3 {
  if (bmi < BMI_BOUNDS[1]) return 0;
  if (bmi < BMI_BOUNDS[2]) return 1;
  if (bmi < BMI_BOUNDS[3]) return 2;
  return 3;
}

/**
 * Faixas de largura igual; dentro da faixa o valor ocupa [i+0,15, i+0,85]/4; fora dos limites, grampeia.
 * (25,0 fica na faixa de cima, ao contrário de charts.bandPosition.)
 */
export function bmiGauge(bmi: number | null): BmiGauge | null {
  if (bmi === null || !Number.isFinite(bmi) || bmi <= 0) return null;
  const band = bmiBand(bmi);
  const low = BMI_BOUNDS[band];
  const high = BMI_BOUNDS[band + 1];
  const fraction = Math.min(1, Math.max(0, (bmi - low) / (high - low)));
  const bands = BMI_BANDS.length;
  const markerPercent =
    ((band + BAND_INSET + fraction * (1 - 2 * BAND_INSET)) / bands) * 100;
  const value = fmtNumber(bmi, 1);
  return {
    bmi,
    value,
    band,
    markerPercent,
    ariaLabel: `IMC estimado ${value}, na faixa de ${BMI_BANDS[band]}. Referência: 18,5 a 24,9.`,
  };
}

// ---------- Silhueta com medidas ----------
/** O mesmo recorte do BodyMapMini. */
export const MEASURE_VIEWBOX = "40 4 100 224";
export const MEASURE_LINES = {
  waist: { y: 96, x1: 72, x2: 108 },
  hip: { y: 122, x1: 69, x2: 111 },
} as const;

// ---------- Projeção de peso ----------
export const PACE_KG_WEEK = { min: 0.25, max: 0.5 } as const;
export const PROJECTION_MIN_DIFF_KG = 0.5;
export const PROJECTION_MAX_WEEKS = 104;
export const PROJECTION_CAPTION =
  "No ritmo de 0,25 a 0,5 kg por semana. É uma faixa, não uma data.";
export const UNDERWEIGHT_TEXT =
  "Esse peso fica abaixo da faixa de referência para a sua altura. Vale conversar com um profissional antes de definir essa meta.";
export const LONG_PATH = {
  title: "Um caminho longo, em etapas",
  caption:
    "Nesse ritmo, levaria mais de dois anos. Metas intermediárias ajudam, e um profissional pode orientar.",
} as const;
const UNDERWEIGHT_BMI = BMI_BOUNDS[1];
const DAYS_PER_WEEK = 7;
/** Folga para diferenças de ponto flutuante (72,4 − 71,9). */
const EPSILON = 1e-9;

export interface WeightProjection {
  kind: "range" | "long" | "underweight";
  title: string;
  caption: string;
  /** Só na faixa: primeiro e último mês da janela (AAAA-MM), para o gráfico. Nunca um dia. */
  fromMonth?: string;
  toMonth?: string;
  /** Só na faixa: "0,25–0,5 kg/sem". */
  paceLabel?: string;
}
/** Ritmo da faixa, curto, para a faixa de números do plano. */
export const PACE_LABEL = "0,25–0,5 kg/sem";
export const MONTHS_SHORT = [
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
] as const;
/** "2027-03" → "mar". */
export const monthShort = (month: string) =>
  MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? "";
/** Janela curta da projeção: "dez – mar" (ou só "mar" quando é um mês). */
export function monthWindow(fromMonth: string, toMonth: string): string {
  return fromMonth === toMonth
    ? monthShort(toMonth)
    : `${monthShort(fromMonth)} – ${monthShort(toMonth)}`;
}

const monthName = (date: string) => MONTHS_PT[Number(date.slice(5, 7)) - 1];
const yearOf = (date: string) => date.slice(0, 4);

/** Nunca um dia: "Por volta de outubro", "Entre outubro e novembro", "Entre dezembro de 2026 e fevereiro de 2027". */
export function monthRange(from: string, to: string, today: string): string {
  const fromYear = yearOf(from);
  const toYear = yearOf(to);
  if (fromYear !== toYear)
    return `Entre ${monthName(from)} de ${fromYear} e ${monthName(to)} de ${toYear}`;
  const suffix = toYear !== yearOf(today) ? ` de ${toYear}` : "";
  if (from.slice(0, 7) === to.slice(0, 7))
    return `Por volta de ${monthName(to)}${suffix}`;
  return `Entre ${monthName(from)} e ${monthName(to)}${suffix}`;
}

/**
 * Faixa de meses para chegar ao peso desejado no ritmo de 0,25 a 0,5 kg por semana.
 * Outro objetivo ou diferença < 0,5 kg → null; meta de perda abaixo de IMC 18,5 → cautela, sem
 * prazo; mais de 104 semanas → caminho longo, sem prazo.
 */
export function weightProjection(i: {
  current: number;
  target: number;
  height: number;
  goal: string;
  today: string;
}): WeightProjection | null {
  if (!Number.isFinite(i.current) || !Number.isFinite(i.target)) return null;
  const diff =
    i.goal === "perder"
      ? i.current - i.target
      : i.goal === "ganhar"
        ? i.target - i.current
        : Number.NaN;
  if (!(diff >= PROJECTION_MIN_DIFF_KG - EPSILON)) return null;
  if (
    i.goal === "perder" &&
    i.height > 0 &&
    i.target / (i.height / 100) ** 2 < UNDERWEIGHT_BMI
  )
    return { kind: "underweight", title: "", caption: UNDERWEIGHT_TEXT };
  const weeksFast = diff / PACE_KG_WEEK.max;
  const weeksSlow = diff / PACE_KG_WEEK.min;
  if (weeksSlow > PROJECTION_MAX_WEEKS) return { kind: "long", ...LONG_PATH };
  const from = shiftDate(i.today, Math.ceil(weeksFast * DAYS_PER_WEEK));
  const to = shiftDate(i.today, Math.ceil(weeksSlow * DAYS_PER_WEEK));
  return {
    kind: "range",
    title: monthRange(from, to, i.today),
    caption: PROJECTION_CAPTION,
    fromMonth: from.slice(0, 7),
    toMonth: to.slice(0, 7),
    paceLabel: PACE_LABEL,
  };
}
