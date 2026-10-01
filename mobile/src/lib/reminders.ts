import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { planReminders, type ReminderType } from "@shared/lib/reminder-plan";
import type { AppState } from "@shared/types";
import { themeColors } from "@/theme/tokens";

export { planReminders, reminderSignature } from "@shared/lib/reminder-plan";
export type { PlannedReminder, ReminderType } from "@shared/lib/reminder-plan";
const CHANNEL_ID = "lembretes";
const isNative = Platform.OS !== "web";

/** Configura a exibição em primeiro plano; chamar uma vez na raiz do app. */
export function configureNotifications() {
  if (!isNative) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function permissionAllowsNotifications(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    permission.granted ||
    permission.ios?.status ===
      Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const current = await Notifications.getPermissionsAsync();
  if (permissionAllowsNotifications(current)) return true;
  if (!current.canAskAgain || current.status === "denied") return false;
  return permissionAllowsNotifications(
    await Notifications.requestPermissionsAsync(),
  );
}

async function replaceReminders(state: AppState): Promise<boolean> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!state.profile?.remindersEnabled) return true;
  // O Android precisa do canal antes de solicitar a permissão de notificações.
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Lembretes",
      importance: Notifications.AndroidImportance.DEFAULT,
      // Luz do canal: superfície do sistema, com a cor da marca de sempre nos dois temas.
      lightColor: themeColors("light").emerald,
    });
  if (!(await ensureNotificationPermission())) return false;
  try {
    for (const item of planReminders(state, new Date())) {
      if (item.fireAt <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.title,
          body: item.body,
          data: { type: item.type },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.fireAt,
          channelId: CHANNEL_ID,
        },
      });
    }
    return true;
  } catch (error) {
    // Uma falha não deve deixar uma agenda parcial silenciosamente ativa.
    await Notifications.cancelAllScheduledNotificationsAsync();
    throw error;
  }
}

let reminderQueue: Promise<boolean> = Promise.resolve(true);
/**
 * Substitui a agenda por notificações de data única. O horizonte é renovado ao abrir o app.
 * A fila impede que cancelar/agendar de duas sincronizações se intercalem; desativar ou
 * revogar a permissão termina com a agenda vazia. Falhas não bloqueiam sincronizações futuras.
 */
export function syncReminders(state: AppState): Promise<boolean> {
  if (!isNative) return Promise.resolve(true);
  const next = reminderQueue
    .catch(() => true)
    .then(() => replaceReminders(state));
  reminderQueue = next;
  return next;
}

/** Tela que cada tipo de lembrete abre ao ser tocado (mesmo destino do app web). */
export const routeForReminder = (type: ReminderType) =>
  type === "medicao"
    ? "/evolucao"
    : type === "habito"
      ? "/"
      : type === "injecao"
        ? "/injecao"
        : type === "despensa"
          ? "/despensa"
          : "/diario";

/** Reage ao toque em uma notificação, inclusive a que abriu o app. */
export function useReminderTap(onTap: (type: ReminderType) => void) {
  useEffect(() => {
    if (!isNative) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      const type = response?.notification.request.content.data?.type;
      if (typeof type === "string") onTap(type as ReminderType);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      handle(response);
      if (response) void Notifications.clearLastNotificationResponseAsync();
    });
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [onTap]);
}

/** Lembrete recebido com o app aberto: título, texto e tipo (para o pop-up em primeiro plano). */
export interface ReceivedReminder {
  title: string;
  body: string;
  type: ReminderType;
}
export function useReminderReceived(
  onReceived: (item: ReceivedReminder) => void,
) {
  useEffect(() => {
    if (!isNative) return;
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body, data } = notification.request.content;
        const type = data?.type;
        if (typeof type === "string")
          onReceived({
            title: title ?? "Lembrete",
            body: body ?? "",
            type: type as ReminderType,
          });
      },
    );
    return () => subscription.remove();
  }, [onReceived]);
}
