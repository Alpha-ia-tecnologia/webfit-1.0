/**
 * Central de lembretes (NOTIF-01): os avisos de agora, o resto do dia e os próximos, com um
 * atalho por tipo. Puro e compartilhado entre web e app nativo: recebe o instante (nunca lê o
 * relógio), não altera o estado e não conhece React nem ícones.
 *
 * Cuidados: nenhum número de calorias; perfis sensíveis não recebem convite a medidas (herdado
 * de notificationsFor/planReminders); a aplicação é só informativa (sem atalho que registre, título
 * "estimado", data e nunca contagem regressiva; nada na gestação); sem "+250 ml" com restrição
 * de líquidos; nenhum texto de cobrança ("atrasado").
 */
import type { Domain } from "../design/tokens";
import type { AppState, NotificationItem, Profile } from "../types";
import { dateBlock } from "./appointments";
import {
  isQuiet,
  localDate,
  localTime,
  notificationsFor,
  totalsFor,
} from "./domain";
import { fmtNumber, fmtRelDate } from "./format";
import {
  planReminders,
  type PlannedReminder,
  type ReminderType,
} from "./reminder-plan";

export type { ReminderType } from "./reminder-plan";

export const REMINDER_WATER_ML = 250;
export const REMINDER_UPCOMING_MAX = 6;
export const REMINDER_PREVIEW_MAX = 8;
/** Títulos longos de combinados na prévia do estado desligado. */
const PREVIEW_TITLE_MAX = 24;
/** Desempate no mesmo horário. */
export const REMINDER_TYPE_ORDER: readonly ReminderType[] = [
  "injecao",
  "refeicao",
  "habito",
  "agua",
  "medicao",
  "despensa",
];
export const REMINDER_TONE: Record<ReminderType, Domain> = {
  agua: "water",
  refeicao: "food",
  habito: "habit",
  medicao: "body",
  injecao: "medication",
  despensa: "food",
};
export const REMINDER_COPY = {
  sections: { agora: "Agora", hoje: "Hoje", proximos: "Próximos" },
  markAll: "Marcar todos como lidos",
  markedAll: "Lembretes marcados como lidos.",
  open: "Abrir registro",
  read: "Lido",
  unread: "Não lido",
  markRead: (title: string) => `Marcar como lido: ${title}`,
  allClearTitle: "Tudo em dia",
  /** Hoje só a hora ("Próximo: 15:00 · …"); amanhã ou depois, com o dia ("Próximo: Amanhã · 08:30 · …"). */
  allClearNext: (next: { time: string; when: string; title: string }) =>
    `Próximo: ${next.when.startsWith("Às ") ? next.time : next.when} · ${next.title}`,
  allClearNone: "Nenhum lembrete programado para os próximos dias.",
  quietNow: (end: string) =>
    `Horário de silêncio até ${end}. Os lembretes voltam depois.`,
  offTitle: "Lembretes desligados",
  offText: "Um toque gentil nos horários da sua rotina.",
  enable: "Ativar lembretes",
  enabled: "Lembretes ativados.",
  previewTitle: "Como ficaria hoje",
  previewEmpty: "Com a sua rotina de hoje, não haveria lembretes.",
  quietChip: (start: string, end: string) => `Silêncio ${start}–${end}`,
  adjust: "Ajustar horários",
  adjustPrefs: "Ajustar preferências",
  habitDone: "Combinado concluído.",
  habitUndone: "Conclusão desfeita.",
  noticeWeb:
    "Os lembretes aparecem aqui enquanto o WebFit está aberto no navegador e respeitam seu horário de silêncio.",
  noticeNative:
    "Os lembretes chegam como notificações do celular, mesmo com o app fechado, e respeitam seu horário de silêncio.",
} as const;

export type ReminderStatus = "due" | "read" | "planned";
export type ReminderQuick =
  | { kind: "water"; ml: number; label: "+250 ml"; aria: "Somar 250 ml de água" }
  /** aria: `Concluir combinado: ${title}` */
  | { kind: "habit"; habitId: string; label: "Concluir"; aria: string }
  /** aria: `Registrar ${category.toLowerCase()} agora` */
  | { kind: "meal"; category: string; label: "Registrar"; aria: string };
export interface ReminderCard {
  id: string;
  type: ReminderType;
  tone: Domain;
  title: string;
  description: string;
  date: string;
  time: string;
  status: ReminderStatus;
  /** "Agora", "Desde 12:00", "Agora · Lido", "Às 15:00", "Amanhã · 08:30", "Qui, 24 set · 08:30". */
  when: string;
  /** Só água (devida ou lida): "500 de 2.000 ml hoje" | "500 ml registrados hoje". */
  meta: string | null;
  /** Só água sem restrição de líquidos: 0–100. */
  progress: number | null;
  /** Só devidos/lidos; nunca para medidas nem para a aplicação. */
  quick: ReminderQuick | null;
}
export interface ReminderSection {
  key: "agora" | "hoje" | "proximos";
  title: string;
  items: ReminderCard[];
}
export interface ReminderCenter {
  enabled: boolean;
  /** Fim do silêncio quando o instante está dentro dele. */
  quietUntil: string | null;
  /** = sections[0].items.length */
  unread: number;
  /** Sempre as três, na ordem agora/hoje/proximos. */
  sections: [ReminderSection, ReminderSection, ReminderSection];
  /** Primeiro planejado (hoje, senão próximos). */
  next: ReminderCard | null;
}
export interface ReminderPreviewChip {
  time: string;
  label: string;
  type: ReminderType;
}
export interface ReminderPreview {
  chips: ReminderPreviewChip[];
  quiet: string | null;
}

const WATER_QUICK: ReminderQuick = {
  kind: "water",
  ml: REMINDER_WATER_ML,
  label: "+250 ml",
  aria: "Somar 250 ml de água",
};
const PREVIEW_LABEL: Partial<Record<ReminderType, string>> = {
  agua: "Água",
  medicao: "Medidas",
  injecao: "Aplicação (estimada)",
  despensa: "Use primeiro",
};

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Parte do id depois da data (a data AAAA-MM-DD não tem ":"). */
const idRest = (id: string) => id.slice(id.indexOf(":") + 1);
const idDate = (id: string) => {
  const cut = id.indexOf(":");
  return cut < 0 ? "" : id.slice(0, cut);
};
const typeRank = (type: ReminderType) => REMINDER_TYPE_ORDER.indexOf(type);
const byTitle = (a: string, b: string) => a.localeCompare(b, "pt-BR");
const compareCards = (a: ReminderCard, b: ReminderCard) =>
  a.date.localeCompare(b.date) ||
  a.time.localeCompare(b.time) ||
  typeRank(a.type) - typeRank(b.type) ||
  byTitle(a.title, b.title);
const compareFire = (a: PlannedReminder, b: PlannedReminder) =>
  a.fireAt - b.fireAt ||
  typeRank(a.type) - typeRank(b.type) ||
  byTitle(a.title, b.title);

/**
 * Assunto de um lembrete, igual para o aviso devido e o planejado: "agua", "medicao", "injecao",
 * "refeicao:Almoço", "habito:h1" (devido `2026-09-23:Almoço` e planejado `2026-09-23:refeicao:Almoço`).
 */
export function reminderSubject(item: { id: string; type: ReminderType }): string {
  if (item.type === "agua") return "agua";
  if (item.type === "medicao" || item.type === "injecao") return item.type;
  const rest = idRest(item.id);
  return rest.startsWith(`${item.type}:`) ? rest : `${item.type}:${rest}`;
}

interface CardContext {
  state: AppState;
  profile: Profile;
  today: string;
  clock: string;
}

function waterMeta(ctx: CardContext): Pick<ReminderCard, "meta" | "progress"> {
  const total = totalsFor(ctx.state.diary, ctx.today).water;
  const goal = ctx.profile.manualWater;
  if (ctx.profile.fluidRestriction === "sim" || !goal)
    return { meta: `${fmtNumber(total)} ml registrados hoje`, progress: null };
  return {
    meta: `${fmtNumber(total)} de ${fmtNumber(goal)} ml hoje`,
    progress: Math.min(100, Math.max(0, Math.round((total / goal) * 100))),
  };
}

function quickFor(item: NotificationItem, profile: Profile): ReminderQuick | null {
  const rest = idRest(item.id);
  switch (item.type) {
    case "agua":
      return profile.fluidRestriction === "sim" ? null : { ...WATER_QUICK };
    case "habito":
      return {
        kind: "habit",
        habitId: rest,
        label: "Concluir",
        aria: `Concluir combinado: ${item.title}`,
      };
    case "refeicao":
      return {
        kind: "meal",
        category: rest,
        label: "Registrar",
        aria: `Registrar ${rest.toLowerCase()} agora`,
      };
    default:
      // Medidas, aplicação e despensa: só abrir o registro ou marcar como lido, nunca registrar daqui.
      return null;
  }
}

function dueCard(item: NotificationItem, ctx: CardContext): ReminderCard {
  const water =
    item.type === "agua" ? waterMeta(ctx) : { meta: null, progress: null };
  const when = item.time >= ctx.clock ? "Agora" : `Desde ${item.time}`;
  return {
    id: item.id,
    type: item.type,
    tone: REMINDER_TONE[item.type],
    title: item.title,
    description: item.description,
    date: ctx.today,
    time: item.time,
    status: item.read ? "read" : "due",
    when: item.read ? `${when} · ${REMINDER_COPY.read}` : when,
    ...water,
    quick: quickFor(item, ctx.profile),
  };
}

/** Hoje: "Às 15:00"; amanhã: "Amanhã · 08:30"; depois: "Qui, 24 set · 08:30" (data, nunca "em N dias"). */
function plannedWhen(date: string, time: string, today: string): string {
  if (date === today) return `Às ${time}`;
  if (fmtRelDate(date, today) === "amanhã") return `Amanhã · ${time}`;
  const block = dateBlock(date);
  return `${cap(block.weekday)}, ${block.day} ${block.month} · ${time}`;
}

function plannedCard(item: PlannedReminder, today: string): ReminderCard {
  return {
    id: item.id,
    type: item.type,
    tone: REMINDER_TONE[item.type],
    title: item.title,
    description: item.body,
    date: item.date,
    time: item.time,
    status: "planned",
    when: plannedWhen(item.date, item.time, today),
    meta: null,
    progress: null,
    quick: null,
  };
}

/** Os próximos em ordem; a aplicação estimada além do corte ocupa a última vaga. */
function upcomingOf(later: readonly PlannedReminder[]): PlannedReminder[] {
  const sorted = [...later].sort(compareFire);
  const shown = sorted.slice(0, REMINDER_UPCOMING_MAX);
  const reserved = sorted
    .slice(REMINDER_UPCOMING_MAX)
    .find((item) => item.type === "injecao");
  return reserved ? [...shown.slice(0, -1), reserved] : shown;
}

function section(
  key: ReminderSection["key"],
  items: ReminderCard[],
): ReminderSection {
  return { key, title: REMINDER_COPY.sections[key], items };
}

function disabledCenter(): ReminderCenter {
  return {
    enabled: false,
    quietUntil: null,
    unread: 0,
    sections: [section("agora", []), section("hoje", []), section("proximos", [])],
    next: null,
  };
}

/**
 * Agora = devidos não lidos; Hoje = devidos já lidos + planejados para mais tarde hoje (sem repetir
 * um devido, exceto água); Próximos = os planejados a partir de amanhã (sem medidas enquanto
 * estiverem devidas hoje, sem repetir o aviso de hoje que dispara depois da meia-noite).
 */
export function reminderCenter(state: AppState, now: Date): ReminderCenter {
  const profile = state.profile;
  if (!profile?.remindersEnabled) return disabledCenter();
  const today = localDate(now);
  const clock = localTime(now);
  const ctx: CardContext = { state, profile, today, clock };
  const due = notificationsFor(state, now);
  const dueSubjects = new Set(due.map(reminderSubject));
  const plan = planReminders(state, now);
  const repeatsDue = (item: PlannedReminder) =>
    item.type !== "agua" &&
    idDate(item.id) === today &&
    dueSubjects.has(reminderSubject(item));

  const agora = due
    .filter((item) => !item.read)
    .map((item) => dueCard(item, ctx))
    .sort(compareCards);
  const hoje = [
    ...due.filter((item) => item.read).map((item) => dueCard(item, ctx)),
    ...plan
      .filter((item) => item.date === today && !repeatsDue(item))
      .map((item) => plannedCard(item, today)),
  ].sort(compareCards);
  const proximos = upcomingOf(
    plan.filter(
      (item) =>
        item.date > today &&
        !repeatsDue(item) &&
        !(item.type === "medicao" && dueSubjects.has("medicao")),
    ),
  ).map((item) => plannedCard(item, today));

  return {
    enabled: true,
    quietUntil: isQuiet(clock, profile.quietStart, profile.quietEnd)
      ? profile.quietEnd
      : null,
    unread: agora.length,
    sections: [
      section("agora", agora),
      section("hoje", hoje),
      section("proximos", proximos),
    ],
    next: hoje.find((card) => card.status === "planned") ?? proximos[0] ?? null,
  };
}

function previewLabel(item: PlannedReminder): string {
  if (item.type === "refeicao")
    return reminderSubject(item).slice("refeicao:".length);
  if (item.type === "habito")
    return item.title.length > PREVIEW_TITLE_MAX
      ? `${item.title.slice(0, PREVIEW_TITLE_MAX).trimEnd()}…`
      : item.title;
  return PREVIEW_LABEL[item.type] ?? item.title;
}

/**
 * "Como ficaria hoje" (estado desligado): a agenda do dia inteiro como se os lembretes estivessem
 * ligados. Um aviso exatamente às 00:00 não entra (planReminders só agenda depois do instante).
 */
export function reminderPreview(state: AppState, now: Date): ReminderPreview {
  const profile = state.profile;
  if (!profile) return { chips: [], quiet: null };
  const today = localDate(now);
  const start = new Date(`${today}T00:00:00`);
  const chips = planReminders(
    { ...state, profile: { ...profile, remindersEnabled: true } },
    start,
  )
    .filter((item) => item.date === today)
    .slice(0, REMINDER_PREVIEW_MAX)
    .map((item) => ({ time: item.time, label: previewLabel(item), type: item.type }));
  return {
    chips,
    quiet:
      profile.quietStart !== profile.quietEnd
        ? REMINDER_COPY.quietChip(profile.quietStart, profile.quietEnd)
        : null,
  };
}

/** Marca como lidos sem repetir ids. */
export function markRemindersRead(
  state: AppState,
  ids: readonly string[],
): AppState {
  return {
    ...state,
    readNotifications: [...new Set([...state.readNotifications, ...ids])],
  };
}

/** Conclui o combinado na data; sem efeito se já concluído ou inexistente. */
export function completeHabitOn(
  state: AppState,
  habitId: string,
  date: string,
): AppState {
  const habit = state.habits.find((item) => item.id === habitId);
  if (!habit || habit.completedDates.includes(date)) return state;
  return {
    ...state,
    habits: state.habits.map((item) =>
      item.id === habitId
        ? { ...item, completedDates: [...item.completedDates, date] }
        : item,
    ),
  };
}

/** Desfaz a conclusão do combinado na data; sem efeito se não estava concluído. */
export function reopenHabitOn(
  state: AppState,
  habitId: string,
  date: string,
): AppState {
  const habit = state.habits.find((item) => item.id === habitId);
  if (!habit || !habit.completedDates.includes(date)) return state;
  return {
    ...state,
    habits: state.habits.map((item) =>
      item.id === habitId
        ? { ...item, completedDates: item.completedDates.filter((d) => d !== date) }
        : item,
    ),
  };
}

/** Aviso da tela conforme a plataforma: no navegador só com o app aberto; no celular, notificações. */
export function reminderNotice(platform: "web" | "native"): string {
  return platform === "native" ? REMINDER_COPY.noticeNative : REMINDER_COPY.noticeWeb;
}
