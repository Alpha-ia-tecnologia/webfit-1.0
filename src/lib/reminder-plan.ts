import { isQuiet, localDate, localTime, shiftDate } from "./domain";
import { isCalmOn } from "./day";
import { fmtNumber } from "./format";
import {
  INJECTION_REMINDER_BODY,
  INJECTION_REMINDER_TITLE,
  lastInjection,
  nextDoseEstimate,
  tracksDoseSchedule,
} from "./treatment";
import { expiringSoon, firstUseId, USE_FIRST_KEY, USE_FIRST_REMINDER, USE_FIRST_TIME } from "./use-first";
import type { AppState, NotificationItem, Profile } from "../types";

export type ReminderType = NotificationItem["type"];
export interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  type: ReminderType;
  date: string;
  time: string;
  /** Instante de uma única entrega, calculado no fuso local. */
  fireAt: number;
}
/** Monta um lembrete ou devolve null se o horário já passou, cai no silêncio ou sai do horizonte. */
type ReminderBuilder = (
  date: string,
  minutes: number,
  key: string,
  title: string,
  body: string,
  type: ReminderType,
) => PlannedReminder | null;

export const REMINDER_LIMITS = {
  horizonDays: 7,
  total: 60,
  hydrationPerDay: 3,
} as const;
const MEAL_DELAY_MINUTES = 30;
const MEASUREMENT_TIME = "09:00";
const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const atMinutes = (date: string, minutes: number) => {
  const at = new Date(`${date}T00:00:00`);
  at.setMinutes(minutes);
  return at;
};

/** Horários estáveis: sincronizar mais tarde não cria outras três pausas no mesmo dia. */
function hydrationSlots(profile: Profile): number[] {
  const candidates: number[] = [];
  const wake = toMinutes(profile.wakeTime);
  const sleep = toMinutes(profile.sleepTime);
  const end = sleep > wake ? sleep : 1440;
  for (
    let minutes = wake + profile.hydrationInterval;
    minutes < end;
    minutes += profile.hydrationInterval
  ) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    if (!isQuiet(time, profile.quietStart, profile.quietEnd))
      candidates.push(minutes);
  }
  if (candidates.length <= REMINDER_LIMITS.hydrationPerDay) return candidates;
  // Distribui as pausas entre os horários disponíveis, mantendo o intervalo mínimo escolhido.
  return Array.from(
    { length: REMINDER_LIMITS.hydrationPerDay },
    (_, index) =>
      candidates[
        Math.round(
          (index * (candidates.length - 1)) /
            (REMINDER_LIMITS.hydrationPerDay - 1),
        )
      ],
  );
}

/**
 * Agenda pontual para hoje e os próximos seis dias. O app renova esse horizonte ao abrir.
 * Registros conhecidos cancelam apenas os lembretes já cumpridos na respectiva data.
 * Textos convidam ao registro: um diário incompleto não comprova falta de consumo.
 */
export function planReminders(
  state: AppState,
  now = new Date(),
): PlannedReminder[] {
  const profile = state.profile;
  if (!profile?.remindersEnabled) return [];
  const today = localDate(now);
  const end = new Date(
    `${shiftDate(today, REMINDER_LIMITS.horizonDays)}T00:00:00`,
  ).getTime();
  const reminders: PlannedReminder[] = [];
  const build: ReminderBuilder = (date, minutes, key, title, body, type) => {
    const at = atMinutes(date, minutes);
    const time = localTime(at);
    if (
      at.getTime() <= now.getTime() ||
      at.getTime() >= end ||
      isQuiet(time, profile.quietStart, profile.quietEnd)
    )
      return null;
    return {
      id: `${date}:${key}`,
      title,
      body,
      type,
      date: localDate(at),
      time,
      fireAt: at.getTime(),
    };
  };
  const add = (...args: Parameters<ReminderBuilder>) => {
    const reminder = build(...args);
    if (reminder) reminders.push(reminder);
    return reminder !== null;
  };
  const waterSlots = profile.manualWater ? hydrationSlots(profile) : [];
  let measurementPlanned = false;

  for (let offset = 0; offset < REMINDER_LIMITS.horizonDays; offset += 1) {
    const date = shiftDate(today, offset);
    const entries = state.diary.filter((entry) => entry.date === date);
    for (const [category, time] of [
      ["Café da manhã", profile.breakfastTime],
      ["Almoço", profile.lunchTime],
      ["Jantar", profile.dinnerTime],
    ] as const) {
      if (
        entries.some(
          (entry) =>
            entry.type === "refeicao" && entry.categoryTag === category,
        )
      )
        continue;
      add(
        date,
        toMinutes(time) + MEAL_DELAY_MINUTES,
        `refeicao:${category}`,
        `Registrar ${category.toLowerCase()}`,
        "Se já fez essa refeição, registre os alimentos no diário.",
        "refeicao",
      );
    }
    const water = entries.reduce(
      (sum, entry) => sum + (entry.type === "agua" ? (entry.amountMl ?? 0) : 0),
      0,
    );
    if (profile.manualWater && water < profile.manualWater)
      for (const minutes of waterSlots)
        add(
          date,
          minutes,
          `agua:${minutes}`,
          "Pausa para hidratação",
          `Sua meta informada é ${fmtNumber(profile.manualWater)} ml. Registre a água que já bebeu.`,
          "agua",
        );

    for (const habit of state.habits) {
      if (habit.createdDate > date || habit.completedDates.includes(date))
        continue;
      add(
        date,
        toMinutes(habit.timeOfDay),
        `habito:${habit.id}`,
        habit.title,
        "Seu combinado está disponível para marcar como concluído.",
        "habito",
      );
    }
    const recentMeasurement = state.measurements.some(
      (measurement) =>
        measurement.date <= date && measurement.date > shiftDate(date, -7),
    );
    // Sem convite a registrar peso em perfil calmo (transtorno alimentar, gestação ou menor de idade).
    if (!measurementPlanned && !recentMeasurement && !isCalmOn(profile, date)) {
      const time = isQuiet(
        MEASUREMENT_TIME,
        profile.quietStart,
        profile.quietEnd,
      )
        ? profile.quietEnd
        : MEASUREMENT_TIME;
      measurementPlanned = add(
        date,
        toMinutes(time),
        "medicao",
        "Atualizar medidas",
        "Se quiser, registre suas medidas para acompanhar seu histórico.",
        "medicao",
      );
    }
    // AGENTE-13: "Use primeiro" às 10:00 só hoje e amanhã (sem repetir nos "Próximos"); dispensado = lido.
    if (
      offset <= 1 &&
      expiringSoon(state.pantry, date).length &&
      !state.readNotifications.includes(firstUseId(date))
    )
      add(
        date,
        toMinutes(isQuiet(USE_FIRST_TIME, profile.quietStart, profile.quietEnd) ? profile.quietEnd : USE_FIRST_TIME),
        USE_FIRST_KEY,
        USE_FIRST_REMINDER.title,
        USE_FIRST_REMINDER.body,
        "despensa",
      );
  }
  const injection = injectionReminder(state, today, build);
  const byTime = (a: PlannedReminder, b: PlannedReminder) =>
    a.fireAt - b.fireAt || a.id.localeCompare(b.id);
  // O lembrete da aplicação sempre cabe no limite: os demais cedem uma vaga para ele.
  const others = reminders
    .sort(byTime)
    .slice(0, REMINDER_LIMITS.total - (injection ? 1 : 0));
  return injection ? [...others, injection].sort(byTime) : others;
}

/**
 * NOTIF-02: no máximo um lembrete no dia estimado da próxima aplicação, só para quem acompanha
 * a caneta (tracksDoseSchedule). Usa o horário da última aplicação, ou o fim do silêncio se ele cair nele.
 */
function injectionReminder(
  state: AppState,
  today: string,
  build: ReminderBuilder,
): PlannedReminder | null {
  const profile = state.profile;
  if (!profile || !tracksDoseSchedule(profile)) return null;
  const next = nextDoseEstimate(
    state.injections,
    today,
    profile.weightLossPenPerMonth,
  );
  const last = lastInjection(state.injections, today);
  if (!next || !last || next.date < today) return null;
  const time = isQuiet(last.time, profile.quietStart, profile.quietEnd)
    ? profile.quietEnd
    : last.time;
  return build(
    next.date,
    toMinutes(time),
    "injecao",
    INJECTION_REMINDER_TITLE,
    INJECTION_REMINDER_BODY,
    "injecao",
  );
}

/** Inclui data/fuso e apenas a agenda efetiva; alterações alheias aos lembretes não reprogramam o aparelho. */
export function reminderSignature(state: AppState, now = new Date()): string {
  return JSON.stringify([
    localDate(now),
    now.getTimezoneOffset(),
    state.profile?.remindersEnabled ?? false,
    planReminders(state, now),
  ]);
}
