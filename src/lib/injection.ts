import {
  injectionSchema,
  type InjectionEntry,
  type InjectionMethod,
  type InjectionSide,
  type InjectionSite,
  type SyringeUnits,
} from "../types";
import { bandPosition } from "./charts";
import { shiftDate } from "./dates";
import { fmtDayMonth } from "./format";

/** Seringas de insulina: a escala em unidades (UI) segue a regra 100 UI = 1 ml. */
export interface SyringeProfile {
  units: SyringeUnits;
  capacityMl: number;
  /** Intervalo entre traços da escala, em UI. */
  tickStep: number;
  /** Traços numerados a cada N UI. */
  majorEvery: number;
  gauge: string;
  title: string;
  caption: string;
  tag: string;
  /** Altura do cilindro no desenho (px do viewBox); seringas menores são mais finas. */
  barrel: number;
}

export const SYRINGES: readonly SyringeProfile[] = [
  { units: 100, capacityMl: 1, tickStep: 2, majorEvery: 10, gauge: "29G", title: "100 UI",
    caption: "1,0 ml padrão", tag: "Padrão 29G · 1,0 ml", barrel: 60 },
  { units: 50, capacityMl: 0.5, tickStep: 1, majorEvery: 5, gauge: "30G", title: "50 UI",
    caption: "0,5 ml média", tag: "Média 30G · 0,5 ml", barrel: 52 },
  { units: 30, capacityMl: 0.3, tickStep: 1, majorEvery: 5, gauge: "31G", title: "30 UI",
    caption: "0,3 ml micro", tag: "Micro 31G · 0,3 ml", barrel: 44 },
];
export const DEFAULT_SYRINGE: SyringeUnits = 30;
/** Maior seringa disponível: acima disso a dose não cabe e nunca é grampeada. */
const MAX_UNITS = 100;

export function syringeProfile(units: SyringeUnits): SyringeProfile {
  return SYRINGES.find((s) => s.units === units) ?? SYRINGES[0];
}
/** Menor seringa em que a quantidade cabe; acima de 100 UI, a de 100. */
export function syringeFor(units: number): SyringeUnits {
  if (units <= 30) return 30;
  if (units <= 50) return 50;
  return 100;
}
export function clampUnits(units: number, syringe: SyringeUnits): number {
  const rounded = Math.round(Number.isFinite(units) ? units : 1);
  return Math.min(syringe, Math.max(1, rounded));
}

export type MedicationKey = "semaglutida" | "tirzepatida" | "personalizado";
export interface Medication {
  key: MedicationKey;
  label: string;
  /** Concentração sugerida do frasco (mg/ml); pode ser ajustada na tela. */
  concentration: number;
  /** Doses prescritas comuns (mg) usadas nos atalhos. */
  presetsMg: number[];
}
export const MEDICATIONS: readonly Medication[] = [
  { key: "semaglutida", label: "Semaglutida", concentration: 1.34, presetsMg: [0.25, 0.5, 1, 1.7, 2.4] },
  { key: "tirzepatida", label: "Tirzepatida", concentration: 5, presetsMg: [2.5, 5, 7.5, 10, 12.5, 15] },
  { key: "personalizado", label: "Personalizado", concentration: 2, presetsMg: [0.25, 0.5, 1, 2.5, 5] },
];
export function medication(key: MedicationKey): Medication {
  return MEDICATIONS.find((m) => m.key === key) ?? MEDICATIONS[0];
}
/**
 * Chave da medicação a partir de um texto: o nome da caneta informado na anamnese
 * ou o rótulo salvo em um registro. Sem informação, começa pela semaglutida.
 */
export function medicationFor(text: string): MedicationKey {
  const value = text.trim().toLowerCase();
  if (/tirzepatida|mounjaro|zepbound/.test(value)) return "tirzepatida";
  if (!value || /semaglutida|ozempic|wegovy|n[aã]o sei/.test(value))
    return "semaglutida";
  return "personalizado";
}
/** Rótulo da opção "Personalizado": o nome da caneta da anamnese quando for outro medicamento. */
export function customMedicationLabel(penName: string): string {
  const name = penName.trim();
  return name && medicationFor(name) === "personalizado"
    ? name.slice(0, 120)
    : "Personalizado";
}

export const CONCENTRATION_MIN = 0.1;
export const CONCENTRATION_MAX = 50;
export const CONCENTRATION_STEP = 0.1;
export const CONCENTRATION_QUICK = [1, 1.34, 2, 2.5, 5, 10];
export function clampConcentration(value: number): number {
  const v = Number.isFinite(value) ? value : CONCENTRATION_MIN;
  return (
    Math.round(
      Math.min(CONCENTRATION_MAX, Math.max(CONCENTRATION_MIN, v)) * 100,
    ) / 100
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
export const volumeMl = (units: number) => Math.round(units) / 100;
/** 4 casas: arredondar para 3 e depois para 2 na tela erraria (19 UI a 1,34 = 0,2546 → 0,255 → "0,26"). */
export const doseMg = (units: number, concentration: number) =>
  round4(volumeMl(units) * concentration);
export const unitsForDose = (mg: number, concentration: number) =>
  concentration > 0 ? Math.max(1, Math.round((mg / concentration) * 100)) : 1;

/** O atalho está ativo quando a UI atual é a marca da seringa mais próxima dele. */
export function presetMatches(
  presetMg: number,
  units: number | null,
  concentration: number,
): boolean {
  return units !== null && units === unitsForDose(presetMg, concentration);
}
/** A dose alvo cabe no arredondamento de meia UI da marca atual (tolerância de conta em ponto flutuante). */
const isNearestMark = (targetMg: number, units: number, concentration: number) =>
  Math.abs((units * concentration) / 100 - targetMg) <= concentration / 200 + 1e-9;
/**
 * Dose da régua da bula no frasco: a prescrita quando a UI é a marca mais próxima dela (0,25 mg a
 * 1,34 mg/ml = 19 UI = 0,2546 mg fica em "Inicial"); senão a dose real. Sem UI, a prescrita
 * (dose que não cabe na seringa) ou null sem dose.
 */
export function rulerDoseMg(
  targetMg: number | null,
  units: number | null,
  concentration: number,
): number | null {
  if (units === null) return targetMg;
  if (targetMg !== null && isNearestMark(targetMg, units, concentration)) return targetMg;
  return doseMg(units, concentration);
}
/**
 * "50 UI é a marca mais próxima de 2,52 mg na seringa (2,50 mg)."; null sem dose, quando a UI
 * não é a marca mais próxima da prescrita ou quando as duas aparecem iguais na tela.
 */
export function nearestMarkText(
  targetMg: number | null,
  units: number | null,
  concentration: number,
): string | null {
  if (targetMg === null || units === null || units !== unitsForDose(targetMg, concentration))
    return null;
  const real = doseMg(units, concentration);
  if (fmtMg(real) === fmtMg(targetMg)) return null;
  return `${units} UI é a marca mais próxima de ${fmtMg(targetMg)} na seringa (${fmtMg(real)}).`;
}
export const fillPercent = (units: number, syringe: SyringeUnits) =>
  Math.min(100, Math.max(0, (units / syringe) * 100));

/** Como a pessoa aplica (SERINGA-08). */
export interface MethodInfo {
  key: InjectionMethod;
  label: string;
  short: string;
  hint: string;
}
export const METHODS: readonly MethodInfo[] = [
  { key: "frasco", label: "Frasco e seringa", short: "Frasco", hint: "Seringa de insulina" },
  { key: "caneta", label: "Caneta com seletor", short: "Caneta", hint: "Gira até a dose" },
  { key: "dose_unica", label: "Caneta de dose única", short: "Dose única", hint: "Dose pronta" },
];
export const methodInfo = (key: InjectionMethod): MethodInfo =>
  METHODS.find((m) => m.key === key) ?? METHODS[0];
/** Registros sem `method` (objetos crus antigos) contam como frasco. */
export const isPenMethod = (m: InjectionMethod | undefined): boolean =>
  m === "caneta" || m === "dose_unica";
const methodOf = (e: InjectionEntry): InjectionMethod => e.method ?? "frasco";

/* Entrada da dose prescrita em mg (SERINGA-06): um único valor, nunca grampeado. */
export const DOSE_STEP_MG = 0.05;
const MAX_DOSE_MG = 100;
const DOSE_TEXT = /^(\d+([.,]\d*)?|[.,]\d+)$/;
/** "2,5" | "2.50 mg" | " 0,125 " → número (3 casas); vazio, ≤0, >100, mais de um separador ou inválido → null. */
export function parseDoseMg(text: string): number | null {
  const value = text.trim().toLowerCase().replace(/\s*mg$/, "");
  if (!DOSE_TEXT.test(value)) return null;
  const mg = round3(Number(value.replace(",", ".")));
  return Number.isFinite(mg) && mg > 0 && mg <= MAX_DOSE_MG ? mg : null;
}
export interface DoseFit {
  units: number | null;
  syringe: SyringeUnits;
  neededUnits: number;
  fits: boolean;
}
/** neededUnits = unitsForDose(mg, conc). Cabe (≤100): units = neededUnits e a menor seringa em que cabe
 *  (mantém a atual se já couber). Não cabe: units = null, syringe = 100, fits = false. Nunca grampeia. */
export function applyDoseMg(
  mg: number,
  concentration: number,
  syringe: SyringeUnits,
): DoseFit {
  const neededUnits = unitsForDose(mg, concentration);
  if (neededUnits > MAX_UNITS)
    return { units: null, syringe: MAX_UNITS, neededUnits, fits: false };
  return {
    units: neededUnits,
    syringe: neededUnits <= syringe ? syringe : syringeFor(neededUnits),
    neededUnits,
    fits: true,
  };
}
/** "3,00 mg a 1,34 mg/ml precisaria de 224 UI, mais que a seringa de 100 UI. Confira a concentração do frasco." */
export function doseOverflowText(
  mg: number,
  concentration: number,
  neededUnits: number,
): string {
  return `${fmtMg(mg)} a ${fmtConcentration(concentration)} precisaria de ${neededUnits} UI, mais que a seringa de ${MAX_UNITS} UI. Confira a concentração do frasco.`;
}
/** ±0,05 mg a partir da dose real (UI arredondada); se repetir a mesma UI anda ±1 UI; limita 1–100 e troca a seringa se não couber. */
export function stepVialDose(
  units: number,
  concentration: number,
  syringe: SyringeUnits,
  direction: 1 | -1,
): { units: number; syringe: SyringeUnits } {
  const current = clampUnits(units, MAX_UNITS);
  const wanted = unitsForDose(
    doseMg(current, concentration) + direction * DOSE_STEP_MG,
    concentration,
  );
  const moved =
    direction > 0
      ? Math.max(wanted, current + 1)
      : Math.min(wanted, current - 1);
  const next = Math.min(MAX_UNITS, Math.max(1, moved));
  return { units: next, syringe: next <= syringe ? syringe : syringeFor(next) };
}

export type DoseTone = "emerald" | "sky" | "rose" | "neutral";
export interface DoseBand {
  tone: DoseTone;
  title: string;
  text: string;
}
interface BandStep {
  max: number;
  band: DoseBand;
}
const SEMAGLUTIDE_BANDS: BandStep[] = [
  { max: 0.25, band: { tone: "emerald", title: "Faixa inicial",
    text: "Corresponde à dose de início habitual da semaglutida, usada nas primeiras semanas de adaptação." } },
  { max: 1, band: { tone: "sky", title: "Faixa de titulação",
    text: "Dose intermediária de ajuste gradual da semaglutida." } },
  { max: 2.4, band: { tone: "sky", title: "Faixa de manutenção",
    text: "Dose de manutenção habitual da semaglutida para controle de peso." } },
];
const TIRZEPATIDE_BANDS: BandStep[] = [
  { max: 2.5, band: { tone: "emerald", title: "Faixa inicial",
    text: "Corresponde à dose de início habitual da tirzepatida." } },
  { max: 7.5, band: { tone: "sky", title: "Faixa de titulação",
    text: "Dose intermediária de ajuste gradual da tirzepatida." } },
  { max: 15, band: { tone: "sky", title: "Faixa de manutenção",
    text: "Dose de manutenção habitual da tirzepatida para controle de peso." } },
];
type BulaKey = Exclude<MedicationKey, "personalizado">;
const NAMES: Record<BulaKey, string> = {
  semaglutida: "semaglutida",
  tirzepatida: "tirzepatida",
};
const BANDS: Record<BulaKey, BandStep[]> = {
  semaglutida: SEMAGLUTIDE_BANDS,
  tirzepatida: TIRZEPATIDE_BANDS,
};
const BAND_TOLERANCE_MG = 0.0005;
/** Índice da faixa da bula (0–2) ou o número de faixas quando a dose supera todas. */
const bandIndex = (steps: readonly BandStep[], mg: number) => {
  const index = steps.findIndex((s) => mg <= s.max + BAND_TOLERANCE_MG);
  return index === -1 ? steps.length : index;
};
/** Faixa informativa da dose calculada; nunca sugere ajuste, só sinaliza o que confirmar. */
export function doseBand(key: MedicationKey, mg: number): DoseBand {
  if (key === "personalizado")
    return {
      tone: "neutral",
      title: "Concentração personalizada",
      text: "A dose depende da concentração impressa no rótulo do frasco; confira o valor em mg/ml antes de aspirar.",
    };
  const steps = BANDS[key];
  const index = bandIndex(steps, mg);
  if (index < steps.length) return steps[index].band;
  return {
    tone: "rose",
    title: "Acima das doses habituais",
    text: `Supera ${fmtMg(steps[steps.length - 1].max)}, a maior dose de ${NAMES[key]} na bula. Confira o frasco e a prescrição.`,
  };
}

/* Régua da bula (SERINGA-05): as mesmas faixas de doseBand, com "Acima" até 1,5× a maior dose. */
export type RulerKey = "inicial" | "titulacao" | "manutencao" | "acima";
export interface DoseRuler {
  bands: { key: RulerKey; label: string; isHatched: boolean }[];
  active: RulerKey;
  markerPercent: number;
  ariaLabel: string;
}
const RULER_BANDS: readonly DoseRuler["bands"][number][] = [
  { key: "inicial", label: "Inicial", isHatched: false },
  { key: "titulacao", label: "Titulação", isHatched: false },
  { key: "manutencao", label: "Manutenção", isHatched: false },
  { key: "acima", label: "Acima", isHatched: true },
];
const ABOVE_RANGE_FACTOR = 1.5;
/** null para "personalizado". Limites: sema [0,0.25,1,2.4,3.6], tirze [0,2.5,7.5,15,22.5] (acima = até 1,5× a maior). */
export function doseRuler(key: MedicationKey, mg: number): DoseRuler | null {
  if (key === "personalizado") return null;
  const steps = BANDS[key];
  const top = steps[steps.length - 1].max;
  const limits = [0, ...steps.map((s) => s.max), round3(top * ABOVE_RANGE_FACTOR)];
  const index = bandIndex(steps, mg);
  const band = RULER_BANDS[index];
  return {
    bands: RULER_BANDS.map((b) => ({ ...b })),
    active: band.key,
    // A tolerância da faixa ativa vale também para o marcador: ele nunca cai na faixa vizinha.
    markerPercent: bandPosition(limits, Math.min(mg, limits[index + 1])),
    ariaLabel: `Faixa da bula: ${band.label} (${fmtMg(mg)})`,
  };
}

export interface SyringeTick {
  units: number;
  kind: "major" | "mid" | "minor";
  label: string | null;
}
/** Traços da escala: numerados a cada `majorEvery`, sem número no zero. */
export function syringeTicks(profile: SyringeProfile): SyringeTick[] {
  const ticks: SyringeTick[] = [];
  const half = profile.majorEvery / 2;
  for (let u = 0; u <= profile.units; u += profile.tickStep) {
    const isMajor = u % profile.majorEvery === 0;
    const isMid = !isMajor && Number.isInteger(half) && u % half === 0;
    ticks.push({
      units: u,
      kind: isMajor ? "major" : isMid ? "mid" : "minor",
      label: isMajor && u > 0 ? String(u) : null,
    });
  }
  return ticks;
}

export interface SiteInfo {
  key: InjectionSite;
  label: string;
  hint: string;
}
export const SITES: readonly SiteInfo[] = [
  { key: "abdomen", label: "Abdômen", hint: "A 5 cm do umbigo" },
  { key: "coxa", label: "Coxa", hint: "Parte anterior" },
  { key: "braco", label: "Braço", hint: "Parte posterior" },
];
export const siteLabel = (key: InjectionSite) =>
  SITES.find((s) => s.key === key)?.label ?? key;

/* Lado do corpo (SERINGA-04): sempre o da pessoa, nunca o de quem olha a figura. */
export interface SideInfo {
  key: InjectionSide;
  label: "Esquerdo" | "Direito";
}
export const SIDES: readonly SideInfo[] = [
  { key: "esquerdo", label: "Esquerdo" },
  { key: "direito", label: "Direito" },
];
const SPOT_LABELS: Record<InjectionSite, Record<InjectionSide, string>> = {
  abdomen: { esquerdo: "Abdômen à esquerda", direito: "Abdômen à direita" },
  coxa: { esquerdo: "Coxa esquerda", direito: "Coxa direita" },
  braco: { esquerdo: "Braço esquerdo", direito: "Braço direito" },
};
/** "Coxa esquerda"; sem lado (registros antigos) só o local: "Coxa". */
export function spotLabel(
  site: InjectionSite,
  side: InjectionSide | null | undefined,
): string {
  return (side && SPOT_LABELS[site]?.[side]) || siteLabel(site);
}
export const otherSide = (side: InjectionSide): InjectionSide =>
  side === "esquerdo" ? "direito" : "esquerdo";
/** Lado sugerido em `site`: o oposto do último lado conhecido nesse local (data ≤ today, registros sem lado ignorados);
 *  null quando o local nunca teve lado registrado. Sugere, nunca bloqueia. */
export function suggestedSide(
  list: readonly InjectionEntry[],
  site: InjectionSite,
  today: string,
): InjectionSide | null {
  const known = sortInjections(
    list.filter((e) => e.date <= today && e.site === site && (e.side ?? null) !== null),
  );
  const side = known.at(-1)?.side;
  return side ? otherSide(side) : null;
}
/** Rodízio simples de locais: abdômen → coxa → braço → abdômen. */
export function nextSite(last: InjectionSite | null): InjectionSite {
  if (!last) return SITES[0].key;
  const index = SITES.findIndex((s) => s.key === last);
  return SITES[(index + 1) % SITES.length].key;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) /
      86_400_000,
  );
}
export function sortInjections(list: readonly InjectionEntry[]) {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
export interface InjectionSummary {
  /** Aplicações nos últimos 30 dias, inclusive hoje. */
  recentCount: number;
  last: InjectionEntry | null;
  daysSinceLast: number | null;
  /** Semana corrente contada a partir da primeira aplicação registrada. */
  weekNumber: number | null;
  suggestedSite: InjectionSite;
  /** Lado sugerido no local sugerido (suggestedSide); null sem lado conhecido nesse local. */
  suggestedSide: InjectionSide | null;
}
export function injectionSummary(
  list: readonly InjectionEntry[],
  today: string,
): InjectionSummary {
  const past = sortInjections(list.filter((e) => e.date <= today));
  const last = past[past.length - 1] ?? null;
  const first = past[0] ?? null;
  const since = shiftDate(today, -29);
  const site = nextSite(last?.site ?? null);
  return {
    recentCount: past.filter((e) => e.date >= since).length,
    last,
    daysSinceLast: last ? daysBetween(last.date, today) : null,
    weekNumber: first
      ? Math.floor(daysBetween(first.date, today) / 7) + 1
      : null,
    suggestedSite: site,
    suggestedSide: suggestedSide(past, site, today),
  };
}

/* Intervalo e validade da receita: só para estimativas (o aviso de aplicação recente segue 30/perMonth). */
export const DEFAULT_INTERVAL_DAYS = 7;
const DAILY_FROM_PER_MONTH = 28;
const KNOWN_INTERVALS: Record<number, number> = { 1: 30, 2: 14, 4: 7 };
/** Aplicações por mês → dias entre doses: 1→30, 2→14, 4→7, ≥28→1, outros Math.round(28/n); nulo/0→7. */
export function penIntervalDays(perMonth: number | null | undefined): number {
  if (!perMonth || !Number.isFinite(perMonth) || perMonth <= 0)
    return DEFAULT_INTERVAL_DAYS;
  if (perMonth >= DAILY_FROM_PER_MONTH) return 1;
  return (
    KNOWN_INTERVALS[perMonth] ??
    Math.max(1, Math.round(DAILY_FROM_PER_MONTH / perMonth))
  );
}
const INTERVAL_LABELS: Record<number, string> = {
  1: "diária",
  7: "semanal",
  14: "quinzenal",
  30: "mensal",
};
export function intervalLabel(days: number): string {
  return INTERVAL_LABELS[days] ?? `a cada ${days} dias`;
}
export const RECIPE_FRESH_MIN_DAYS = 21;
/** Depois disso a última dose não é oferecida em um toque nem gera estimativa. */
export const recipeFreshDays = (perMonth: number | null | undefined) =>
  Math.max(2 * penIntervalDays(perMonth), RECIPE_FRESH_MIN_DAYS);
export const STALE_RECIPE_TEXT =
  "Faz tempo desde a última aplicação: confirme a dose com quem prescreveu.";

export interface RecentInjection {
  entry: InjectionEntry;
  /** Dias entre a aplicação registrada e a data escolhida agora. */
  days: number;
  sameDay: boolean;
}
/** Frequência padrão quando a anamnese não informa: uma aplicação por semana. */
const DEFAULT_PER_MONTH = 4;
/**
 * Aplicação registrada há menos da metade do intervalo esperado (ex.: 0–2 dias numa caneta
 * semanal; só o mesmo dia numa diária). Serve para um aviso gentil que nunca bloqueia o registro.
 */
export function recentInjectionWarning(
  list: readonly InjectionEntry[],
  date: string,
  perMonth: number | null | undefined,
): RecentInjection | null {
  const interval = 30 / (perMonth && perMonth > 0 ? perMonth : DEFAULT_PER_MONTH);
  const minGap = Math.max(1, Math.floor(interval / 2));
  const last = sortInjections(list.filter((e) => e.date <= date)).at(-1);
  if (!last) return null;
  const days = daysBetween(last.date, date);
  return days < minGap ? { entry: last, days, sameDay: days === 0 } : null;
}
/** Texto factual do aviso, sem orientação clínica. Com `today`, um registro no mesmo dia escolhido
 *  que não é hoje (data mudada na folha) vira "nesse dia". */
export function recentInjectionText(recent: RecentInjection, today?: string): string {
  const what = injectionTitle(recent.entry);
  if (!recent.sameDay) return `Você registrou ${what} ${daysAgoLabel(recent.days)}.`;
  const when = today && recent.entry.date !== today ? "nesse dia" : "hoje";
  return `Você já registrou ${what} ${when} às ${recent.entry.time}.`;
}
export function daysAgoLabel(days: number | null): string {
  if (days === null) return "sem registro";
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/* Dose recorrente (SERINGA-01). */
export interface DoseRecipe {
  method: InjectionMethod;
  medication: string;
  medicationKey: MedicationKey;
  doseMg: number;
  concentrationMgPerMl: number | null;
  syringeUnits: SyringeUnits | null;
  units: number | null;
  volumeMl: number | null;
  lastDate: string;
  /** Local sugerido para repetir a dose: o próximo do rodízio a partir da última aplicação. */
  site: InjectionSite;
  /** Lado sugerido nesse local (suggestedSide); não faz parte da receita. */
  side: InjectionSide | null;
  /** Aplicações seguidas, da mais recente para trás, com a mesma receita. */
  repeats: number;
}
const PEN_SAME_DOSE_MG = 0.005 + 1e-9;
function sameRecipe(a: InjectionEntry, b: InjectionEntry): boolean {
  const method = methodOf(a);
  if (method !== methodOf(b) || a.medication !== b.medication) return false;
  return isPenMethod(method)
    ? Math.abs(a.doseMg - b.doseMg) <= PEN_SAME_DOSE_MG
    : a.concentrationMgPerMl === b.concentrationMgPerMl &&
        a.syringeUnits === b.syringeUnits &&
        a.units === b.units;
}
/** Última aplicação com data ≤ today; futuras ignoradas; null sem histórico.
 *  Mesma receita: mesmo method e medication; no frasco, mesma concentração, seringa e UI; na caneta, dose ±0,005 mg. */
export function lastRecipe(
  list: readonly InjectionEntry[],
  today: string,
): DoseRecipe | null {
  const past = sortInjections(list.filter((e) => e.date <= today));
  const last = past.at(-1);
  if (!last) return null;
  let repeats = 0;
  for (let i = past.length - 1; i >= 0 && sameRecipe(past[i], last); i -= 1)
    repeats += 1;
  const method = methodOf(last);
  const isPen = isPenMethod(method);
  const site = nextSite(last.site);
  return {
    method,
    medication: last.medication,
    medicationKey: medicationFor(last.medication),
    doseMg: last.doseMg,
    concentrationMgPerMl: isPen ? null : last.concentrationMgPerMl,
    syringeUnits: isPen ? null : last.syringeUnits,
    units: isPen ? null : last.units,
    volumeMl: isPen ? null : last.volumeMl,
    lastDate: last.date,
    site,
    side: suggestedSide(past, site, today),
    repeats,
  };
}
export const isRecipeFresh = (
  r: DoseRecipe,
  today: string,
  perMonth: number | null | undefined,
) => daysBetween(r.lastDate, today) <= recipeFreshDays(perMonth);
/** "Minha dose de sempre" quando repeats ≥ 2; senão "Minha última dose" (conceito 10). */
export function recipeHeading(r: DoseRecipe): string {
  return r.repeats >= 2 ? "Minha dose de sempre" : "Minha última dose";
}
/** Botão da receita: "de hoje" só no dia estimado da aplicação (PROPOSTA, nota da Seringa). */
export function recipeCta(isDue: boolean): string {
  return isDue ? "Registrar aplicação de hoje" : "Registrar aplicação";
}

/* "Antes de aplicar" (conceito 10): conferências informativas, nunca bloqueiam nem ficam salvas. */
export type SafetyKey = "conc" | "syringe" | "needle" | "pen";
export interface SafetyItem {
  key: SafetyKey;
  title: string;
  sub: string;
}
const NEEDLE_ITEM: SafetyItem = { key: "needle", title: "Agulha nova", sub: "e local novo" };
/** Frasco: concentração do rótulo, seringa U-100 e agulha nova; caneta (ou frasco sem dados): caneta e agulha. */
export function safetyItems(plan: {
  method: InjectionMethod;
  concentration: number | null;
}): SafetyItem[] {
  if (isPenMethod(plan.method) || plan.concentration === null)
    return [{ key: "pen", title: "Caneta", sub: "confira a dose na janela" }, NEEDLE_ITEM];
  return [
    { key: "conc", title: fmtConcentration(plan.concentration), sub: "confira o rótulo" },
    { key: "syringe", title: "100 UI = 1 ml", sub: "seringa U-100" },
    NEEDLE_ITEM,
  ];
}

const INTERVAL_PLURALS: Record<number, string> = {
  1: "diárias",
  7: "semanais",
  14: "quinzenais",
  30: "mensais",
};
/** "semanais", "quinzenais"…; outros intervalos: "a cada 10 dias". */
export function intervalPlural(days: number): string {
  return INTERVAL_PLURALS[days] ?? `a cada ${days} dias`;
}
/** Quantas aplicações passadas a faixa "Últimas aplicações" mostra (a próxima estimada vem à parte). */
export const RECENT_STRIP_LIMIT = 3;
const SIDE_SHORT: Record<InjectionSide, string> = { esquerdo: "esq.", direito: "dir." };
/** "Braço esq.", "Coxa dir."; sem lado (registros antigos), só o local: "Abdômen". */
export function shortSpotLabel(site: InjectionSite, side: InjectionSide | null | undefined): string {
  return side ? `${siteLabel(site)} ${SIDE_SHORT[side]}` : siteLabel(site);
}
export interface RecentStripItem {
  entry: InjectionEntry;
  /** "8 set" */
  dateLabel: string;
  /** "há 16 dias" */
  agoLabel: string;
  /** "Braço esq." */
  shortLabel: string;
}
/**
 * Faixa "Últimas aplicações": as `limit` mais recentes (data ≤ today), da mais antiga para a mais nova,
 * e o subtítulo "Todas com 2,50 mg · semanais" quando todas têm a mesma dose (senão "3 aplicações").
 */
export function recentSummary(
  list: readonly InjectionEntry[],
  today: string,
  perMonth: number | null | undefined,
  limit = RECENT_STRIP_LIMIT,
): { items: RecentStripItem[]; subtitle: string } {
  const recent = sortInjections(list.filter((e) => e.date <= today)).slice(-Math.max(1, limit));
  const items = recent.map((entry) => ({
    entry,
    dateLabel: fmtDayMonth(entry.date),
    agoLabel: daysAgoLabel(daysBetween(entry.date, today)),
    shortLabel: shortSpotLabel(entry.site, entry.side ?? null),
  }));
  const first = recent[0];
  const isSameDose =
    recent.length >= 2 && first !== undefined && recent.every((e) => Math.abs(e.doseMg - first.doseMg) < 1e-9);
  if (!isSameDose || !first)
    return { items, subtitle: recent.length === 1 ? "1 aplicação" : `${recent.length} aplicações` };
  const same = `Todas com ${fmtMg(first.doseMg)}`;
  return { items, subtitle: perMonth ? `${same} · ${intervalPlural(penIntervalDays(perMonth))}` : same };
}
/** "igual a 22/09" (a mesma receita da última aplicação, n ≥ 2; conceito 10) ou `Aplicada ${daysAgoLabel(dias)}`. */
export function recipeBadge(r: DoseRecipe, today: string): string {
  return r.repeats >= 2
    ? `igual a ${r.lastDate.slice(8, 10)}/${r.lastDate.slice(5, 7)}`
    : `Aplicada ${daysAgoLabel(daysBetween(r.lastDate, today))}`;
}

/**
 * Arredonda o valor binário antes de formatar: o Intl arredondaria a forma decimal curta
 * ("1.005" → "1,01"), e 75 UI a 1,34 mg/ml (1,005 mg, a marca de 1 mg) deve aparecer "1,00".
 */
const decimals = (n: number, digits: number) => {
  const factor = 10 ** digits;
  return (Math.round(n * factor) / factor).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
export const fmtNumber2 = (n: number) => decimals(n, 2);
export const fmtMg = (n: number) => `${decimals(n, 2)} mg`;
export const fmtMl = (n: number) => `${decimals(n, 2)} ml`;
export const fmtConcentration = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mg/ml`;
export const injectionTitle = (e: InjectionEntry) =>
  `${e.medication} ${fmtMg(e.doseMg)}`;
/** "37 UI · 0,37 ml · Coxa direita" no frasco; "Caneta · Braço esquerdo" ou "Dose única · Braço" nas canetas.
 *  Sem lado (registros antigos ou objetos crus), só o local. */
export const injectionDetail = (e: InjectionEntry) => {
  const spot = spotLabel(e.site, e.side ?? null);
  if (isPenMethod(e.method)) return `${methodInfo(e.method).short} · ${spot}`;
  return e.units === null || e.volumeMl === null
    ? `${methodInfo("frasco").short} · ${spot}`
    : `${e.units} UI · ${fmtMl(e.volumeMl)} · ${spot}`;
};

/* Rascunho do registro: um único caminho de gravação para web e app. */
export interface InjectionInput {
  id: string;
  userId: string;
  now: string;
  today: string;
  createdAt?: string;
  date: string;
  time: string;
  method: InjectionMethod;
  medication: string;
  /** Frasco. */
  units: number | null;
  concentration: number | null;
  syringe: SyringeUnits | null;
  /** Caneta. */
  doseMg: number | null;
  site: InjectionSite;
  /** Opcional: chamadas antigas não informam o lado (fica null). */
  side?: InjectionSide | null;
  notes: string;
}
export type InjectionDraft =
  | { ok: true; entry: InjectionEntry }
  | { ok: false; reason: "dose" | "future" | "invalid" };
function doseFields(input: InjectionInput) {
  if (isPenMethod(input.method))
    return input.doseMg === null
      ? null
      : {
          concentrationMgPerMl: null,
          syringeUnits: null,
          units: null,
          volumeMl: null,
          doseMg: round3(input.doseMg),
        };
  if (input.units === null) return null;
  return {
    concentrationMgPerMl: input.concentration,
    syringeUnits: input.syringe,
    units: input.units,
    volumeMl: volumeMl(input.units),
    doseMg:
      input.concentration === null
        ? null
        : doseMg(input.units, input.concentration),
  };
}
/** Frasco: doseMg = doseMg(units, conc), volume = volumeMl(units); caneta: campos da seringa null, dose com 3 casas.
 *  "dose" sem UI (frasco) ou sem dose (caneta); "future" se date > today; "invalid" se o zod recusar. */
export function draftInjection(input: InjectionInput): InjectionDraft {
  const fields = doseFields(input);
  if (!fields) return { ok: false, reason: "dose" };
  if (input.date > input.today) return { ok: false, reason: "future" };
  const result = injectionSchema.safeParse({
    id: input.id,
    userId: input.userId,
    date: input.date,
    time: input.time,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
    method: input.method,
    medication: input.medication,
    ...fields,
    site: input.site,
    side: input.side ?? null,
    notes: input.notes,
  });
  return result.success
    ? { ok: true, entry: result.data }
    : { ok: false, reason: "invalid" };
}
