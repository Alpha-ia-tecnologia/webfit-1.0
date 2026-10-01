/**
 * Caneta configurada na anamnese (ANAM-12): frequência, dia da aplicação e o registro opcional da
 * última aplicação. Nunca sugere dose nem estima a próxima; o registro só acontece com confirmação
 * explícita e apenas como primeira aplicação.
 */
import type {
  AppState,
  Draft,
  InjectionEntry,
  InjectionMethod,
  InjectionSite,
  Profile,
} from "../types";
import { CHOICE_FIELDS } from "../data/anamneseOptions";
import {
  composeChoices,
  parseChoices,
  toNumber,
} from "../components/anamnese/inputs";
import { shiftDate } from "./dates";
import { updateProfile } from "./domain";
import { fmtShortDate } from "./format";
import {
  customMedicationLabel,
  draftInjection,
  fmtMg,
  medication,
  medicationFor,
  methodInfo,
  parseDoseMg,
  penIntervalDays,
  siteLabel,
  SITES,
} from "./injection";

export { WEEKDAYS, weekdayOf } from "./dates";

export type PenFrequency = "semanal" | "diaria" | "outra";
export const PEN_FREQUENCIES = [
  { key: "semanal", label: "Semanal", perMonth: 4 },
  { key: "diaria", label: "Diária", perMonth: 30 },
  { key: "outra", label: "Outra", perMonth: null },
] as const;
const WEEKLY_PER_MONTH = 4;
const DAILY_FROM_PER_MONTH = 28;
const WEEKLY_INTERVAL_DAYS = 7;

/** Vazio → null; 4 → semanal; ≥ 28 → diária; outro número → outra. */
export function penFrequencyOf(perMonth: unknown): PenFrequency | null {
  const n = toNumber(perMonth);
  if (n === null) return null;
  if (n === WEEKLY_PER_MONTH) return "semanal";
  return n >= DAILY_FROM_PER_MONTH ? "diaria" : "outra";
}

/** Caneta em uso com aplicação semanal: só então o dia da aplicação faz sentido. */
export const isWeeklyDraft = (a: Draft) => {
  const n = toNumber(a.weightLossPenPerMonth);
  return (
    a.weightLossPen === "sim" &&
    n !== null &&
    n > 0 &&
    penIntervalDays(n) === WEEKLY_INTERVAL_DAYS
  );
};

/** Chaves só do rascunho (profileSchema as descarta ao concluir). */
export const PEN_KEYS = {
  date: "penLastDate",
  site: "penLastSite",
  method: "penMethod",
  confirmed: "penLastConfirmed",
} as const;
/** Mudar qualquer uma destas desfaz a confirmação do registro. */
export const PEN_ENTRY_KEYS = [
  "weightLossPen",
  "weightLossPenName",
  "weightLossPenDose",
  PEN_KEYS.date,
  PEN_KEYS.site,
  PEN_KEYS.method,
] as const;

const NO_MEDICATIONS = "Não uso medicamentos";
const PEN_MEDICATION = "Medicamento para emagrecer";

/** "Não uso medicamentos" marcado junto com a caneta. */
export function penMedicationConflict(
  a: Draft,
): { text: string; actionLabel: string; fix: string } | null {
  if (a.weightLossPen !== "sim") return null;
  const config = CHOICE_FIELDS.medications;
  const parsed = parseChoices(String(a.medications ?? ""), config);
  if (!parsed.selected.includes(NO_MEDICATIONS)) return null;
  return {
    text: "Você marcou “Não uso medicamentos”, mas usa uma caneta. Ela também conta como medicamento.",
    actionLabel: "Incluir nos medicamentos",
    fix: composeChoices([PEN_MEDICATION], parsed.other, config),
  };
}

/** Rótulo do registro: o da calculadora (Semaglutida/Tirzepatida) ou o nome informado; null sem nome conhecido. */
export function penMedicationLabel(name: string): string | null {
  const value = name.trim();
  if (!value || /n[aã]o sei/i.test(value)) return null;
  const key = medicationFor(value);
  return key === "personalizado"
    ? customMedicationLabel(value)
    : medication(key).label;
}

export type PenLastBlock = "caneta" | "dose" | "data" | "local" | "tipo";
export const PEN_LAST_BLOCK_TEXT: Record<PenLastBlock, string> = {
  caneta: "Para registrar, escolha qual caneta você usa.",
  dose: "Para registrar, escolha a dose em mg.",
  data: "Escolha quando foi a última aplicação.",
  local: "Escolha o local da aplicação.",
  tipo: "Escolha o tipo de caneta.",
};
/** Horário registrado para dias passados (hoje usa a hora atual); aparece antes de confirmar. */
export const PEN_PAST_TIME = "12:00";
export const PEN_LAST_MAX_DAYS = 60;
export const penLastTime = (date: string, today: string, now: string) =>
  date === today ? now : PEN_PAST_TIME;
/** Métodos de caneta aceitos aqui; frasco e seringa ficam com a calculadora. */
const PEN_METHODS: readonly InjectionMethod[] = ["caneta", "dose_unica"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PenLastPreview {
  block: PenLastBlock | null;
  text: string;
}
interface PenLastData {
  medication: string;
  doseMg: number;
  date: string;
  site: InjectionSite;
  method: InjectionMethod;
}
type PenLastCheck =
  | { block: PenLastBlock; data: null }
  | { block: null; data: PenLastData };

const isRecentDate = (date: string, today: string) =>
  DATE_PATTERN.test(date) &&
  !Number.isNaN(Date.parse(`${date}T12:00:00`)) &&
  date <= today &&
  date >= shiftDate(today, -PEN_LAST_MAX_DAYS);

/** Bloqueios nesta ordem: caneta, dose, data (vazia, futura ou > 60 dias), local e tipo. */
function checkPenLast(a: Draft, today: string): PenLastCheck {
  const medicationLabel = penMedicationLabel(String(a.weightLossPenName ?? ""));
  if (medicationLabel === null) return { block: "caneta", data: null };
  const doseMg = parseDoseMg(String(a.weightLossPenDose ?? ""));
  if (doseMg === null) return { block: "dose", data: null };
  const date = String(a[PEN_KEYS.date] ?? "");
  if (!isRecentDate(date, today)) return { block: "data", data: null };
  const site = SITES.find((s) => s.key === a[PEN_KEYS.site])?.key;
  if (!site) return { block: "local", data: null };
  const method = PEN_METHODS.find((m) => m === a[PEN_KEYS.method]);
  if (!method) return { block: "tipo", data: null };
  return {
    block: null,
    data: { medication: medicationLabel, doseMg, date, site, method },
  };
}

const whenLabel = (date: string, today: string) =>
  date === today
    ? "hoje"
    : date === shiftDate(today, -1)
      ? "ontem"
      : fmtShortDate(date);

/** Texto do registro ("Tirzepatida 5,00 mg · Caneta · Abdômen · ontem, 12:00") ou o motivo do bloqueio. */
export function penLastPreview(
  a: Draft,
  today: string,
  now: string,
): PenLastPreview {
  const check = checkPenLast(a, today);
  if (check.block !== null)
    return { block: check.block, text: PEN_LAST_BLOCK_TEXT[check.block] };
  const { medication: name, doseMg, date, site, method } = check.data;
  return {
    block: null,
    text: `${name} ${fmtMg(doseMg)} · ${methodInfo(method).short} · ${siteLabel(site)} · ${whenLabel(date, today)}, ${penLastTime(date, today, now)}`,
  };
}

/** Registro da última aplicação: só com confirmação explícita (penLastConfirmed === true) e pré-visualização válida. */
export function penFirstEntry(
  a: Draft,
  ctx: { id: string; userId: string; nowIso: string; today: string; now: string },
): InjectionEntry | null {
  if (a.weightLossPen !== "sim" || a[PEN_KEYS.confirmed] !== true) return null;
  const check = checkPenLast(a, ctx.today);
  if (check.block !== null) return null;
  const { medication: name, doseMg, date, site, method } = check.data;
  const result = draftInjection({
    id: ctx.id,
    userId: ctx.userId,
    now: ctx.nowIso,
    today: ctx.today,
    date,
    time: penLastTime(date, ctx.today, ctx.now),
    method,
    medication: name,
    units: null,
    concentration: null,
    syringe: null,
    doseMg,
    site,
    notes: "",
  });
  return result.ok ? result.entry : null;
}

/** Conclusão: perfil (updateProfile) e, se houver, a primeira aplicação; nunca quando já existe alguma aplicação. */
export function completeAnamnese(
  state: AppState,
  profile: Profile,
  entry: InjectionEntry | null,
): AppState {
  const next = updateProfile(state, profile);
  if (!entry || state.injections.length > 0) return next;
  return { ...next, injections: [entry] };
}
