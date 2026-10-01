import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { localDate, notificationsFor } from "@shared/lib/domain";
import type { AppState, InjectionEntry } from "@shared/types";
import type { PopupContent } from "@/components/ui/popup";
import {
  configureNotifications,
  reminderSignature,
  routeForReminder,
  syncReminders,
  useReminderReceived,
  useReminderTap,
  type ReceivedReminder,
} from "@/lib/reminders";
import type { AppContextValue, InjectionView } from "./app-context-types";

type Options = {
  state: AppState | null;
  clock: Date;
  stateRef: RefObject<AppState | null>;
  notify: AppContextValue["notify"];
  setDate: Dispatch<SetStateAction<string>>;
  setEditingInjection: Dispatch<SetStateAction<InjectionEntry | null>>;
  setInjectionView: Dispatch<SetStateAction<InjectionView>>;
  setPopup: Dispatch<SetStateAction<PopupContent | null>>;
  popupRef: RefObject<PopupContent | null>;
};

/**
 * Lembretes locais: reprogramados quando perfil ou combinados mudam, o toque na notificação abre a
 * tela correspondente e o que vence com o app aberto vira pop-up (uma vez por id).
 */
export function useAppReminders({
  state,
  clock,
  stateRef,
  notify,
  setDate,
  setEditingInjection,
  setInjectionView,
  setPopup,
  popupRef,
}: Options) {
  const router = useRouter();
  // Ids dos lembretes já vistos nesta sessão: só o que vence com o app aberto vira pop-up.
  const seenReminders = useRef<Set<string> | null>(null);
  const permissionWarned = useRef(false);

  useEffect(() => {
    configureNotifications();
  }, []);
  const signature = state ? reminderSignature(state, clock) : "";
  useEffect(() => {
    const current = stateRef.current;
    if (!current || !signature) return;
    const timer = setTimeout(() => {
      syncReminders(current)
        .then((granted) => {
          if (!granted && !permissionWarned.current) {
            permissionWarned.current = true;
            notify(
              "Permita notificações nas configurações do aparelho para receber lembretes.",
              "warning",
            );
          }
        })
        .catch(() =>
          notify(
            "Não foi possível atualizar os lembretes. Tente reabrir o aplicativo.",
            "warning",
          ),
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [signature, notify, stateRef]);
  const onReminderTap = useCallback(
    (type: Parameters<typeof routeForReminder>[0]) => {
      setDate(localDate());
      if (type === "injecao") {
        setEditingInjection(null);
        setInjectionView("auto");
      }
      router.replace(routeForReminder(type));
    },
    [router, setDate, setEditingInjection, setInjectionView],
  );
  useReminderTap(onReminderTap);
  const onReminderReceived = useCallback(
    ({ title, body, type }: ReceivedReminder) =>
      setPopup({
        kind: "reminder",
        title,
        text: body,
        action: {
          label: "Abrir",
          onPress: () => {
            setDate(localDate());
            if (type === "injecao") {
              setEditingInjection(null);
              setInjectionView("auto");
            }
            router.push(routeForReminder(type));
          },
        },
      }),
    [router, setDate, setEditingInjection, setInjectionView, setPopup],
  );
  useReminderReceived(onReminderReceived);

  // Alertas ao longo do dia: um lembrete que vence enquanto o app está aberto vira pop-up (uma vez por id).
  useEffect(() => {
    if (!state) return;
    const due = notificationsFor(state, clock).filter((n) => !n.read);
    if (!seenReminders.current) {
      seenReminders.current = new Set(due.map((n) => n.id));
      return;
    }
    const fresh = due.find((n) => !seenReminders.current?.has(n.id));
    for (const n of due) seenReminders.current.add(n.id);
    if (!fresh || popupRef.current) return;
    setPopup({
      kind: "reminder",
      title: fresh.title,
      text: fresh.description,
      action: {
        label: "Abrir",
        onPress: () => {
          setDate(localDate());
          if (fresh.type === "injecao") {
            setEditingInjection(null);
            setInjectionView("auto");
          }
          router.push(routeForReminder(fresh.type));
        },
      },
    });
  }, [state, clock, router, popupRef, setDate, setEditingInjection, setInjectionView, setPopup]);

  /** De volta ao primeiro plano: os lembretes são reprogramados com o estado atual. */
  const resyncReminders = useCallback(() => {
    const current = stateRef.current;
    if (current)
      void syncReminders(current).catch(() =>
        notify(
          "Não foi possível atualizar os lembretes. Tente reabrir o aplicativo.",
          "warning",
        ),
      );
  }, [notify, stateRef]);

  return { seenReminders, resyncReminders };
}
