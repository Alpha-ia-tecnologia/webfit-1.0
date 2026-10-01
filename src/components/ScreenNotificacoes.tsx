import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Info, Moon } from "lucide-react";
import { useApp } from "../lib/context";
import {
  completeHabitOn,
  markRemindersRead,
  REMINDER_COPY,
  reminderCenter,
  reminderNotice,
  reminderPreview,
  reopenHabitOn,
  type ReminderCard as ReminderCardData,
  type ReminderSection,
  type ReminderType,
} from "../lib/reminder-center";
import { withProfilePatch } from "../lib/space";
import type { ScreenType } from "../types";
import { EmptyArt } from "./EmptyArt";
import { ReminderCard } from "./lembretes/ReminderCard";
import { ReminderRow } from "./lembretes/ReminderRow";
import { RemindersOff } from "./lembretes/RemindersOff";
import { Page } from "./UI";
import { useDiaryActions } from "./useDiaryActions";
import "./lembretes/Lembretes.css";

/** A tela recalcula o que está devido a cada 30 s. */
const TICK_MS = 30000;
/** "Abrir registro": onde cada tipo é registrado (a aplicação abre Seringa e dose). */
const OPEN_SCREEN: Record<Exclude<ReminderType, "injecao">, ScreenType> = {
  agua: "diario",
  refeicao: "diario",
  habito: "hoje",
  medicao: "evolucao",
  despensa: "despensa",
};

function SectionFrame({
  section,
  headingRef,
  count,
  children,
}: {
  section: ReminderSection;
  headingRef?: Ref<HTMLHeadingElement>;
  count?: number;
  children: ReactNode;
}) {
  const id = `rs-${section.key}`;
  return (
    <section
      className="reminder-section"
      aria-labelledby={id}
      data-testid={`reminder-section-${section.key}`}
    >
      <div className="reminder-section-head">
        <h2 id={id} tabIndex={-1} ref={headingRef}>
          {section.title}
        </h2>
        {count ? (
          <span className="reminder-count" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Central de lembretes (NOTIF-01): Agora (devidos, com atalho), Hoje (lidos e o resto do dia) e
 * Próximos. Cada atalho é um único commit com "Desfazer"; nada aqui registra uma aplicação, e o
 * foco volta ao título "Agora" porque o cartão tocado some da lista.
 */
export function ScreenNotificacoes() {
  const { state, commit, navigate, setDate, openInjection, openEspaco, editMeal } = useApp();
  const actions = useDiaryActions();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const agoraRef = useRef<HTMLHeadingElement>(null);
  // Ao ligar os lembretes o título "Agora" ainda não existe: o foco vai para ele no próximo render.
  const pendingFocus = useRef(false);
  useLayoutEffect(() => {
    if (!pendingFocus.current || !agoraRef.current) return;
    pendingFocus.current = false;
    agoraRef.current.focus();
  });
  // Trava síncrona: um segundo toque antes do fim do primeiro não grava de novo.
  const busyRef = useRef(false);

  const focusAgora = () => {
    if (agoraRef.current) agoraRef.current.focus();
    else pendingFocus.current = true;
  };
  const run = async (task: () => Promise<boolean>, refocus = true) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if ((await task()) && refocus) focusAgora();
    } finally {
      busyRef.current = false;
    }
  };
  const markRead = (ids: readonly string[], message?: string) =>
    commit((s) => markRemindersRead(s, ids), message);
  const completeHabit = (habitId: string, date: string) => {
    let changed = false;
    return commit(
      (s) => {
        const next = completeHabitOn(s, habitId, date);
        changed = next !== s;
        return next;
      },
      REMINDER_COPY.habitDone,
      {
        label: "Desfazer",
        onAction: () => {
          if (changed)
            void commit((s) => reopenHabitOn(s, habitId, date), REMINDER_COPY.habitUndone);
        },
      },
    );
  };
  /** Água e combinado gravam aqui; a refeição marca como lido e abre o registro com o tipo escolhido. */
  const quick = async (card: ReminderCardData) => {
    const action = card.quick;
    if (!action) return false;
    if (action.kind === "water") return actions.addWater(action.ml, card.date);
    if (action.kind === "habit") return completeHabit(action.habitId, card.date);
    if (!(await markRead([card.id]))) return false;
    setDate(card.date);
    editMeal(null, { category: action.category });
    return true;
  };
  const openRecord = async (card: ReminderCardData) => {
    if (card.status !== "read" && !(await markRead([card.id]))) return false;
    setDate(card.date);
    // Dia da aplicação (estimado): só abre Seringa e dose; registrar pede confirmação lá.
    if (card.type === "injecao") openInjection(null);
    else navigate(OPEN_SCREEN[card.type]);
    return true;
  };
  const cardHandlers = {
    onQuick: (card: ReminderCardData) =>
      void run(() => quick(card), card.quick?.kind !== "meal"),
    onOpen: (card: ReminderCardData) => void run(() => openRecord(card), false),
    onRead: (card: ReminderCardData) => void run(() => markRead([card.id])),
  };

  const center = reminderCenter(state, now);
  if (!center.enabled)
    return (
      <Page title="Lembretes">
        <RemindersOff
          preview={reminderPreview(state, now)}
          onEnable={() =>
            void run(() =>
              commit(
                (s) => withProfilePatch(s, { remindersEnabled: true }),
                REMINDER_COPY.enabled,
              ),
            )
          }
          onAdjust={() => openEspaco("preferencias")}
        />
      </Page>
    );

  const [agora, hoje, proximos] = center.sections;
  return (
    <Page
      title="Lembretes"
      action={
        center.unread > 0 ? (
          <button
            type="button"
            className="text-btn reminders-mark-all"
            onClick={() =>
              void run(() =>
                markRead(
                  agora.items.map((item) => item.id),
                  REMINDER_COPY.markedAll,
                ),
              )
            }
          >
            {REMINDER_COPY.markAll}
          </button>
        ) : undefined
      }
    >
      <p className="reminders-notice">
        <Info size={16} aria-hidden="true" />
        <span>{reminderNotice("web")}</span>
        <button type="button" className="text-btn" onClick={() => openEspaco("preferencias")}>
          {REMINDER_COPY.adjustPrefs}
        </button>
      </p>
      {center.quietUntil && (
        <p className="reminders-quiet" role="status" data-testid="reminders-quiet">
          <Moon size={18} aria-hidden="true" />
          {REMINDER_COPY.quietNow(center.quietUntil)}
        </p>
      )}
      <SectionFrame section={agora} headingRef={agoraRef} count={agora.items.length}>
        {agora.items.length ? (
          <ul className="reminder-list">
            {agora.items.map((card) => (
              <ReminderCard key={card.id} card={card} {...cardHandlers} />
            ))}
          </ul>
        ) : (
          <div className="reminders-all-clear" data-testid="reminders-all-clear">
            <EmptyArt kind="habits" />
            <h3>{REMINDER_COPY.allClearTitle}</h3>
            <p>
              {center.next
                ? REMINDER_COPY.allClearNext(center.next)
                : REMINDER_COPY.allClearNone}
            </p>
          </div>
        )}
      </SectionFrame>
      {hoje.items.length > 0 && (
        <SectionFrame section={hoje}>
          <ul className="reminder-list">
            {hoje.items.map((card) =>
              card.status === "planned" ? (
                <ReminderRow key={card.id} card={card} />
              ) : (
                <ReminderCard key={card.id} card={card} {...cardHandlers} />
              ),
            )}
          </ul>
        </SectionFrame>
      )}
      {proximos.items.length > 0 && (
        <SectionFrame section={proximos}>
          <ul className="reminder-list">
            {proximos.items.map((card) => (
              <ReminderRow key={card.id} card={card} />
            ))}
          </ul>
        </SectionFrame>
      )}
    </Page>
  );
}
