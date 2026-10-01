/**
 * Tratamento com medicação injetável (HOJE-05, NOTIF-02, ESPACO-X3): estimativa da próxima dose,
 * modelo do card do Hoje e o resumo "Meu tratamento". Tudo é estimativa pela frequência informada:
 * os textos dizem "estimada" e nunca "atrasada". Não importa ./domain (o domain importa este módulo).
 */
import type { InjectionEntry, InjectionSide, InjectionSite, Profile } from "../types";
import { shiftDate, WEEKDAYS, weekdayOf } from "./dates";
import { isCalmOn, isMinorOn } from "./day";
import { fmtDayMonth, fmtRelDate, fmtShortDate, plural } from "./format";
import {
  DOSE_STEP_MG,
  daysAgoLabel,
  daysBetween,
  fmtMg,
  injectionSummary,
  injectionTitle,
  intervalLabel,
  isRecipeFresh,
  lastRecipe,
  medicationFor,
  methodInfo,
  penIntervalDays,
  recipeFreshDays,
  sortInjections,
  spotLabel,
  type DoseRecipe,
  type InjectionSummary,
} from "./injection";

/** Lembrete do dia estimado: sem nome de medicamento nem dose, porque aparece na tela bloqueada. */
export const INJECTION_REMINDER_TITLE = "Dia da aplicação (estimado)";
export const INJECTION_REMINDER_BODY =
  "Pela frequência informada, a próxima aplicação é estimada para hoje. Se já aplicou, registre no app.";
const OVERDUE_HINT = "Se já aplicou, registre para atualizar a estimativa.";
const FIRST_DOSE_LINE = "Registre a primeira aplicação para estimar a próxima dose.";
const FALLBACK_MEDICATION = "Medicação injetável";
/** O ciclo em dias (faixa da semana) só aparece em intervalos de 2 a 7 dias. */
const CYCLE_MIN_DAYS = 2;
const CYCLE_MAX_DAYS = 7;
const DEFAULT_STEP_LIMIT = 6;
const WEEK_DAYS = 7;

type ScheduleProfile = Pick<Profile, "weightLossPen" | "pregnancy">;
type TreatmentProfile = ScheduleProfile &
  Pick<Profile, "weightLossPenPerMonth" | "weightLossPenName"> &
  Partial<Pick<Profile, "penWeekday">>;

/** Contagem, promoção e lembrete só para quem declarou caneta ("sim") e respondeu "não" à gestação/amamentação. */
export function tracksDoseSchedule(p: ScheduleProfile): boolean {
  return p.weightLossPen === "sim" && p.pregnancy === "nao";
}

/** Última aplicação com data ≤ today (futuras ignoradas); null sem histórico. */
export function lastInjection(
  list: readonly InjectionEntry[],
  today: string,
): InjectionEntry | null {
  return sortInjections(list.filter((e) => e.date <= today)).at(-1) ?? null;
}

export interface NextDose {
  date: string;
  daysUntil: number;
  elapsedDays: number;
  intervalDays: number;
  /** 0–100 = min(100, elapsed/interval). */
  progress: number;
  /** -intervalDays < daysUntil ≤ 0. */
  isDue: boolean;
  /** elapsedDays + 1 quando 2 ≤ interval ≤ 7 e elapsed < interval; senão null. */
  cycleDay: number | null;
}
/** Última aplicação com data ≤ today; null sem ela ou quando elapsed > recipeFreshDays(perMonth). */
export function nextDoseEstimate(
  list: readonly InjectionEntry[],
  today: string,
  perMonth: number | null | undefined,
): NextDose | null {
  const last = lastInjection(list, today);
  if (!last) return null;
  const elapsedDays = daysBetween(last.date, today);
  if (elapsedDays > recipeFreshDays(perMonth)) return null;
  const intervalDays = penIntervalDays(perMonth);
  const daysUntil = intervalDays - elapsedDays;
  const hasCycle =
    intervalDays >= CYCLE_MIN_DAYS &&
    intervalDays <= CYCLE_MAX_DAYS &&
    elapsedDays < intervalDays;
  return {
    date: shiftDate(last.date, intervalDays),
    daysUntil,
    elapsedDays,
    intervalDays,
    progress: Math.min(100, (elapsedDays / intervalDays) * 100),
    isDue: daysUntil <= 0 && daysUntil > -intervalDays,
    cycleDay: hasCycle ? elapsedDays + 1 : null,
  };
}

export interface NextDoseText {
  ring: string;
  unit: string;
  line: string;
  /**
   * Linha curta do widget do Hoje: "Próxima: terça, 29" (o anel diz "estimada"). No dia e depois dele a linha
   * diz "estimada" por extenso ("Aplicação estimada para hoje"): a data é só uma estimativa.
   */
  short: string;
  aria: string;
  hint: string | null;
}
/** "terça", "sábado": dia da semana por extenso, sem "-feira". */
const weekdayWord = (date: string) =>
  WEEKDAYS[weekdayOf(date)]!.label.replace("-feira", "").toLowerCase();
/** ", dia 3 de 7 do ciclo" no nome do anel, quando há ciclo (2 a 7 dias). */
const cycleAria = (next: NextDose) =>
  next.cycleDay === null ? "" : `, dia ${next.cycleDay} de ${next.intervalDays} do ciclo`;
/** Textos do anel e da linha: sempre "estimada", nunca "atrasada". */
export function nextDoseText(next: NextDose, today: string): NextDoseText {
  const day = fmtShortDate(next.date);
  const d = next.daysUntil;
  const shortDay = `${weekdayWord(next.date)}, ${Number(next.date.slice(8))}`;
  if (d >= 2)
    return {
      ring: String(d),
      unit: "dias",
      line: `Próxima estimada: ${day}`,
      short: `Próxima: ${shortDay}`,
      aria: `Próxima dose estimada em ${d} dias, ${day}${cycleAria(next)}`,
      hint: null,
    };
  if (d === 1)
    return {
      ring: "1",
      unit: "dia",
      line: "Próxima estimada: amanhã",
      short: "Próxima: amanhã",
      aria: `Próxima dose estimada para amanhã, ${day}${cycleAria(next)}`,
      hint: null,
    };
  if (d === 0)
    return {
      ring: "Hoje",
      unit: "",
      line: "Aplicação estimada para hoje",
      short: "Aplicação estimada para hoje",
      aria: "Próxima dose estimada para hoje",
      hint: null,
    };
  return {
    ring: "",
    unit: "",
    line: `Aplicação estimada para ${day}`,
    short: `Aplicação estimada para ${shortDay}`,
    aria: `Dose estimada para ${day}, ${fmtRelDate(next.date, today)}`,
    hint: OVERDUE_HINT,
  };
}

/* Seringa e dose (SERINGA-01): cartão "Próxima aplicação". Informativo: nunca mostra dose, nunca
   "atrasada"; na gestação ou sem acompanhar a frequência, só a última aplicação (sem estimativa). */
/** O mínimo de um lembrete planejado (planReminders) que o cartão usa; sem importar ./reminder-plan (ciclo). */
export interface ReminderSlot {
  type: string;
  date: string;
  time: string;
}
export interface NextApplicationModel {
  /** estimate: acompanha a frequência (anel + data estimada); history: só a última aplicação. */
  variant: "estimate" | "history";
  next: NextDose | null;
  text: NextDoseText | null;
  /** "Próxima aplicação estimada" | "Última aplicação". */
  kicker: string;
  /** "Terça, 29 set" | "Hoje, 29 set" | "Estimada para terça, 29 set" | (history) "Terça, 22 set". */
  dateTitle: string;
  /** "08:30 · lembrete ativo" (lembrete planejado), senão o horário da última; history: "há 2 dias · Abdômen". */
  timeLine: string;
  /** Dica neutra quando a data estimada passou (se já aplicou, registre). */
  hint: string | null;
  /** Local sugerido para a próxima aplicação ("Coxa direita"). */
  suggestedLabel: string;
  suggestedSite: InjectionSite;
  suggestedSide: InjectionSide | null;
}
export const NEXT_APPLICATION_KICKER = "Próxima aplicação estimada";
export const LAST_APPLICATION_KICKER = "Última aplicação";
const REMINDER_ON = "lembrete ativo";
/** "Terça, 29 set": dia da semana com maiúscula e data curta. */
const titleDate = (date: string) => {
  const word = weekdayWord(date);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}, ${fmtDayMonth(date)}`;
};
/** Modelo do cartão; null sem nenhuma aplicação registrada (a tela mostra o primeiro registro). */
export function nextApplicationModel(
  p: TreatmentProfile,
  list: readonly InjectionEntry[],
  today: string,
  reminders: readonly ReminderSlot[] = [],
): NextApplicationModel | null {
  const summary = injectionSummary(list, today);
  const last = summary.last;
  if (!last) return null;
  const suggested = {
    suggestedLabel: spotLabel(summary.suggestedSite, summary.suggestedSide),
    suggestedSite: summary.suggestedSite,
    suggestedSide: summary.suggestedSide,
  };
  const next = tracksDoseSchedule(p) ? nextDoseEstimate(list, today, p.weightLossPenPerMonth) : null;
  if (!next)
    return {
      variant: "history",
      next: null,
      text: null,
      kicker: LAST_APPLICATION_KICKER,
      dateTitle: titleDate(last.date),
      timeLine: `${daysAgoLabel(summary.daysSinceLast)} · ${spotLabel(last.site, last.side ?? null)}`,
      hint: null,
      ...suggested,
    };
  const reminder = reminders.find((r) => r.type === "injecao" && r.date === next.date);
  const d = next.daysUntil;
  return {
    variant: "estimate",
    next,
    text: nextDoseText(next, today),
    kicker: NEXT_APPLICATION_KICKER,
    dateTitle:
      d === 0
        ? `Hoje, ${fmtDayMonth(next.date)}`
        : d < 0
          ? `Estimada para ${weekdayWord(next.date)}, ${fmtDayMonth(next.date)}`
          : titleDate(next.date),
    timeLine: reminder ? `${reminder.time} · ${REMINDER_ON}` : last.time,
    hint: d < 0 ? OVERDUE_HINT : null,
    ...suggested,
  };
}

export interface CycleCell {
  date: string;
  weekday: string;
  state: "aplicacao" | "passado" | "hoje" | "futuro";
  isToday: boolean;
}
/** Dia da semana curto, sem ponto ("seg", "sáb"), como na faixa de datas do Hoje. */
const shortWeekday = (date: string) =>
  new Date(`${date}T12:00:00`)
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "")
    .slice(0, 3);
/** interval células a partir de lastDate; a célula 0 é sempre "aplicacao" (isToday quando elapsed = 0). null quando cycleDay === null. */
export function cycleStrip(next: NextDose, lastDate: string): CycleCell[] | null {
  if (next.cycleDay === null) return null;
  const elapsed = next.elapsedDays;
  return Array.from({ length: next.intervalDays }, (_, i): CycleCell => {
    const date = shiftDate(lastDate, i);
    const state: CycleCell["state"] =
      i === 0
        ? "aplicacao"
        : i < elapsed
          ? "passado"
          : i === elapsed
            ? "hoje"
            : "futuro";
    return { date, weekday: shortWeekday(date), state, isToday: i === elapsed };
  });
}

export interface InjectionCardModel {
  summary: InjectionSummary;
  /** Só a receita fresca (isRecipeFresh); null se velha ou sem histórico. */
  recipe: DoseRecipe | null;
  tracks: boolean;
  /** estimate: tracks && next; first: sem histórico; history: o resto. */
  variant: "estimate" | "first" | "history";
  next: NextDose | null;
  text: NextDoseText | null;
  strip: CycleCell[] | null;
  /** variant === "estimate" && next.isDue && recipe !== null. */
  isPromoted: boolean;
}
export function injectionCardModel(
  p: TreatmentProfile,
  list: readonly InjectionEntry[],
  today: string,
): InjectionCardModel {
  const summary = injectionSummary(list, today);
  const perMonth = p.weightLossPenPerMonth;
  const latest = lastRecipe(list, today);
  const recipe = latest && isRecipeFresh(latest, today, perMonth) ? latest : null;
  const tracks = tracksDoseSchedule(p);
  const next = tracks ? nextDoseEstimate(list, today, perMonth) : null;
  return {
    summary,
    recipe,
    tracks,
    variant: next ? "estimate" : summary.last ? "history" : "first",
    next,
    text: next ? nextDoseText(next, today) : null,
    strip: next && summary.last ? cycleStrip(next, summary.last.date) : null,
    isPromoted: next !== null && next.isDue && recipe !== null,
  };
}

export interface DoseStep {
  doseMg: number;
  medication: string;
  from: string;
  to: string;
  count: number;
}
/** Degrau de dose: medicationFor(medicamento) + Math.round(dose/0,05) ("tirzepatida:100" = 5 mg). */
export const doseStepKey = (e: Pick<InjectionEntry, "medication" | "doseMg">) =>
  `${medicationFor(e.medication)}:${Math.round(e.doseMg / DOSE_STEP_MG)}`;
/** Sequências consecutivas (ordem cronológica, data ≤ today) com a mesma chave medicationFor(medication) + Math.round(dose/0,05);
 *  doseMg e medication são os da aplicação mais recente da sequência; últimas `limit`. */
export function doseSteps(
  list: readonly InjectionEntry[],
  today: string,
  limit = DEFAULT_STEP_LIMIT,
): DoseStep[] {
  const past = sortInjections(list.filter((e) => e.date <= today));
  const steps: DoseStep[] = [];
  let lastKey: string | null = null;
  for (const e of past) {
    const key = doseStepKey(e);
    const current = steps.at(-1);
    // Cada degrau é um objeto novo; só a lista local cresce ou troca o último item.
    if (current && key === lastKey)
      steps[steps.length - 1] = {
        ...current,
        doseMg: e.doseMg,
        medication: e.medication,
        to: e.date,
        count: current.count + 1,
      };
    else
      steps.push({ doseMg: e.doseMg, medication: e.medication, from: e.date, to: e.date, count: 1 });
    lastKey = key;
  }
  return limit > 0 ? steps.slice(-limit) : [];
}

export interface TreatmentModel {
  /** Última aplicação ?? nome da caneta na anamnese ?? "Medicação injetável". */
  medication: string;
  interval: string;
  method: string | null;
  nextLine: string | null;
  steps: DoseStep[];
  stepsAria: string;
}
/** "Degraus de dose: 2,50 mg desde 8 set (3 aplicações); 5,00 mg desde 6 out (1 aplicação)". */
function stepsAria(steps: readonly DoseStep[]): string {
  if (!steps.length) return "Degraus de dose: nenhuma aplicação registrada";
  const parts = steps.map(
    (s) =>
      `${fmtMg(s.doseMg)} desde ${fmtDayMonth(s.from)} (${plural(s.count, "aplicação", "aplicações")})`,
  );
  return `Degraus de dose: ${parts.join("; ")}`;
}
/** "semanal, às quintas" quando a pessoa informou o dia da aplicação semanal (ANAM-12); senão o intervalo. */
function treatmentInterval(p: TreatmentProfile): string {
  const days = penIntervalDays(p.weightLossPenPerMonth);
  const weekday = p.penWeekday == null ? undefined : WEEKDAYS[p.penWeekday];
  return days === 7 && weekday ? `semanal, às ${weekday.plural}` : intervalLabel(days);
}
export function treatmentModel(
  p: TreatmentProfile,
  list: readonly InjectionEntry[],
  today: string,
): TreatmentModel {
  const last = lastInjection(list, today);
  const tracks = tracksDoseSchedule(p);
  const next = tracks
    ? nextDoseEstimate(list, today, p.weightLossPenPerMonth)
    : null;
  const steps = doseSteps(list, today);
  return {
    medication:
      last?.medication ?? (p.weightLossPenName.trim() || FALLBACK_MEDICATION),
    interval: treatmentInterval(p),
    method: last ? methodInfo(last.method ?? "frasco").label : null,
    nextLine: next
      ? `Próxima dose estimada: ${fmtShortDate(next.date)}`
      : tracks && !last
        ? FIRST_DOSE_LINE
        : null,
    steps,
    stepsAria: stepsAria(steps),
  };
}
/** O card "Meu tratamento" aparece para quem declarou caneta ou já registrou alguma aplicação. */
export const shouldShowTreatment = (
  p: Pick<Profile, "weightLossPen">,
  list: readonly InjectionEntry[],
) => p.weightLossPen === "sim" || list.length > 0;

/* Evolução (EVOL-04): degraus de dose registrados ao longo do tempo. Só o que foi registrado:
   nenhum nível estimado, nenhuma comparação de peso por dose. */
export interface DoseSpan {
  /** Único por degrau: doseStepKey (medicationFor + Math.round(dose/0,05)), início e posição. */
  key: string;
  doseMg: number;
  /** "2,50 mg" (fmtMg). */
  label: string;
  /** "2,50 mg/sem" quando a frequência é semanal; senão igual a label. Para o chip do gráfico. */
  rate: string;
  /** Da aplicação mais recente do degrau. */
  medication: string;
  from: string;
  lastDate: string;
  /** Exclusivo: min(início do próximo degrau, lastDate + penIntervalDays(perMonth)). */
  end: string;
  count: number;
}
export interface DoseApplication {
  date: string;
  site: InjectionSite;
  side: InjectionSide | null;
}
export interface DoseTimeline {
  spans: DoseSpan[];
  applications: DoseApplication[];
}
type OpenSpan = Omit<DoseSpan, "key" | "end"> & { step: string };

/** Degraus contínuos (cronológicos, data ≤ today). Novo degrau quando a chave muda OU o intervalo entre aplicações
 *  seguidas passa de recipeFreshDays(perMonth) (pausa longa). Sem aplicações → null. Nenhum nível estimado. */
export function doseTimeline(
  list: readonly InjectionEntry[],
  today: string,
  perMonth: number | null | undefined,
): DoseTimeline | null {
  const past = sortInjections(list.filter((e) => e.date <= today));
  if (!past.length) return null;
  const pause = recipeFreshDays(perMonth);
  const interval = penIntervalDays(perMonth);
  const open: OpenSpan[] = [];
  let previous: InjectionEntry | null = null;
  for (const e of past) {
    const step = doseStepKey(e);
    const current = open.at(-1);
    const isSame =
      current !== undefined &&
      previous !== null &&
      current.step === step &&
      daysBetween(previous.date, e.date) <= pause;
    const label = fmtMg(e.doseMg);
    const fields = {
      doseMg: e.doseMg,
      label,
      rate: interval === WEEK_DAYS ? `${label}/sem` : label,
      medication: e.medication,
      lastDate: e.date,
    };
    // Cada degrau é um objeto novo; só a lista local cresce ou troca o último item.
    if (isSame) open[open.length - 1] = { ...current, ...fields, count: current.count + 1 };
    else open.push({ step, ...fields, from: e.date, count: 1 });
    previous = e;
  }
  const spans = open.map(({ step, ...span }, i): DoseSpan => {
    const cap = shiftDate(span.lastDate, interval);
    const next = open[i + 1]?.from;
    return {
      key: `${step}:${span.from}:${i}`,
      ...span,
      end: next !== undefined && next < cap ? next : cap,
    };
  });
  return {
    spans,
    applications: past.map((e) => ({ date: e.date, site: e.site, side: e.side ?? null })),
  };
}

/** "desde 3 set" (degrau em curso), "em 6 ago" (uma data só) ou o intervalo no formato pedido. */
function spanPeriod(span: DoseSpan, today: string, range: (from: string, to: string) => string): string {
  if (span.end > today) return `desde ${fmtDayMonth(span.from)}`;
  if (span.from === span.lastDate) return `em ${fmtDayMonth(span.from)}`;
  return range(fmtDayMonth(span.from), fmtDayMonth(span.lastDate));
}
const applicationsText = (count: number) => plural(count, "aplicação", "aplicações");

/** "Doses registradas no período: Tirzepatida 2,50 mg de 6 ago a 27 ago (4 aplicações); Tirzepatida 5,00 mg desde 3 set (4 aplicações)". */
export function doseTimelineAria(spans: readonly DoseSpan[], today: string): string {
  const head = "Doses registradas no período:";
  if (!spans.length) return `${head} nenhuma aplicação`;
  const parts = spans.map(
    (s) =>
      `${s.medication} ${s.label} ${spanPeriod(s, today, (a, b) => `de ${a} a ${b}`)} (${applicationsText(s.count)})`,
  );
  return `${head} ${parts.join("; ")}`;
}

export const DOSE_OVERLAY_NOTE =
  "Registro informativo: o peso varia por muitos motivos, e a dose é decidida com quem prescreveu.";

export interface DoseCard {
  key: string;
  dose: string;
  medication: string;
  period: string;
  count: string;
  isLatest: boolean;
}
/** Cartões "Por dose", do mais recente para o mais antigo (até 6): "desde 3 set" | "6 ago – 27 ago" | "em 6 ago". */
export function doseCards(timeline: DoseTimeline, today: string): DoseCard[] {
  return [...timeline.spans]
    .reverse()
    .slice(0, DEFAULT_STEP_LIMIT)
    .map((s, i) => ({
      key: s.key,
      dose: s.label,
      medication: s.medication,
      period: spanPeriod(s, today, (a, b) => `${a} – ${b}`),
      count: applicationsText(s.count),
      isLatest: i === 0,
    }));
}

/* Folha "Aplicação registrada" (SERINGA-10): confirma o que foi gravado, sem conselho de dose. */
export interface SavedSheetModel {
  lead: string;
  when: string;
  nextDose: string | null;
  nextDoseHint: string | null;
  nextSite: string;
  showMeasures: boolean;
}
const SAVED_NEXT_HINT = "Pela frequência informada no seu perfil.";
/** "Hoje", "Ontem" ou "Qui, 24 set" (mesma regra do WhenRow). */
const dayWord = (date: string, today: string) =>
  date === today ? "Hoje" : date === shiftDate(today, -1) ? "Ontem" : fmtShortDate(date);

// isMinorOn e isCalmOn moram em ./day (sem ./domain nem ./space); reexportado para quem já importa daqui.
export { isMinorOn };

/** `list` já contém `entry`. Próxima dose só com tracksDoseSchedule; "Registrar medidas" nunca em perfil calmo. */
export function savedSheetModel(
  p: Pick<
    Profile,
    "weightLossPen" | "pregnancy" | "eatingDisorder" | "weightLossPenPerMonth" | "birthDate"
  >,
  list: readonly InjectionEntry[],
  entry: InjectionEntry,
  today: string,
): SavedSheetModel {
  const next = tracksDoseSchedule(p)
    ? nextDoseEstimate(list, today, p.weightLossPenPerMonth)
    : null;
  const nextDose = next
    ? next.daysUntil >= 1
      ? `Próxima dose estimada: ${fmtShortDate(next.date)}`
      : nextDoseText(next, today).line
    : null;
  const summary = injectionSummary(list, today);
  return {
    lead: `Aplicação registrada no diário: ${injectionTitle(entry)}.`,
    when: `${dayWord(entry.date, today)}, ${entry.time} · ${spotLabel(entry.site, entry.side ?? null)}`,
    nextDose,
    nextDoseHint: nextDose ? SAVED_NEXT_HINT : null,
    nextSite: `Próximo local sugerido: ${spotLabel(summary.suggestedSite, summary.suggestedSide)}`,
    showMeasures: !isCalmOn(p, today),
  };
}
