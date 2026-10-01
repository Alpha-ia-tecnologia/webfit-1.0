import { useRouter } from "expo-router";
import { Moon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, Text, View } from "react-native";
import { localDate } from "@shared/lib/domain";
import {
  completeHabitOn,
  markRemindersRead,
  REMINDER_COPY,
  REMINDER_WATER_ML,
  reminderCenter,
  reminderNotice,
  reminderPreview,
  reopenHabitOn,
  type ReminderCard as ReminderItem,
  type ReminderSection,
} from "@shared/lib/reminder-center";
import { withProfilePatch } from "@shared/lib/space";
import { Screen } from "@/components/layout/screen";
import { ReminderCard } from "@/components/lembretes/reminder-card";
import { ReminderRowList } from "@/components/lembretes/reminder-row";
import { RemindersOff } from "@/components/lembretes/reminders-off";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, EmptyArt, Notice } from "@/components/ui";
import { espacoHref } from "@/lib/espaco-link";
import { focusNode } from "@/lib/focus";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { useDiaryActions } from "@/state/use-diary-actions";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontFamily, fontSize, radius, themeDomainTone } from "@/theme/tokens";

/**
 * Central de lembretes (NOTIF-01): "Agora" (não lidos, com atalhos), "Hoje" (lidos e o resto do dia)
 * e "Próximos". Desligados, mostra como ficaria o dia. Tudo vem de reminderCenter (compartilhado com
 * o web); os atalhos não marcam nada como lido: registrar a água, concluir o combinado ou abrir a
 * refeição já tira o aviso de "Agora".
 */
export function NotificacoesScreen() {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const mind = themeDomainTone(scheme).mind;
  const { state, commit, clock, setDate, editMeal, openInjection } = useApp();
  const actions = useDiaryActions();
  const router = useRouter();
  const agoraHeading = useRef<Text>(null);
  const [focusTick, setFocusTick] = useState(0);
  const center = useMemo(() => reminderCenter(state, clock), [state, clock]);
  const today = localDate(clock);

  // Depois de cada ação na tela, o foco volta ao título "Agora" (o cartão tocado some da lista).
  useEffect(() => {
    if (!focusTick) return;
    const frame = requestAnimationFrame(() => focusNode(agoraHeading.current as unknown as View | null));
    return () => cancelAnimationFrame(frame);
  }, [focusTick]);
  const focusAgora = () => setFocusTick((tick) => tick + 1);

  const markAll = async () => {
    const ids = center.sections[0].items.map((item) => item.id);
    if (await commit((s) => markRemindersRead(s, ids), REMINDER_COPY.markedAll)) focusAgora();
  };
  const markRead = async (card: ReminderItem) => {
    if (await commit((s) => markRemindersRead(s, [card.id]))) focusAgora();
  };
  const openRecord = async (card: ReminderItem) => {
    if (!(await commit((s) => markRemindersRead(s, [card.id])))) return;
    setDate(today);
    // Dia da aplicação estimado: abre Seringa e dose já com a dose de sempre (registro novo).
    if (card.type === "injecao") openInjection(null);
    else router.replace(card.type === "medicao" ? "/evolucao" : card.type === "habito" ? "/" : card.type === "despensa" ? "/despensa" : "/diario");
  };
  const runQuick = async (card: ReminderItem) => {
    const quick = card.quick;
    if (!quick) return;
    if (quick.kind === "water") {
      if (await actions.addWater(REMINDER_WATER_ML, today)) focusAgora();
      return;
    }
    if (quick.kind === "habit") {
      selectionHaptic();
      const saved = await commit((s) => completeHabitOn(s, quick.habitId, today), REMINDER_COPY.habitDone, {
        label: "Desfazer",
        onAction: () => void commit((s) => reopenHabitOn(s, quick.habitId, today), REMINDER_COPY.habitUndone),
      });
      if (saved) focusAgora();
      return;
    }
    // Refeição: só abre Registrar refeição com o tipo escolhido; nada é registrado daqui.
    if (await commit((s) => markRemindersRead(s, [card.id]))) {
      setDate(today);
      editMeal(null, { category: quick.category });
    }
  };
  const enable = async () => {
    if (await commit((s) => withProfilePatch(s, { remindersEnabled: true }), REMINDER_COPY.enabled)) focusAgora();
  };

  const cardOf = (card: ReminderItem) => (
    <ReminderCard
      key={card.id}
      card={card}
      onQuick={card.quick ? () => void runQuick(card) : undefined}
      onOpen={() => void openRecord(card)}
      onRead={() => void markRead(card)}
    />
  );
  const [agora, hoje, proximos] = center.sections;
  const next = center.next;

  return (
    <Screen
      header={{ variant: "default", title: "Lembretes", showBell: false }}
      actions={
        center.unread > 0 ? <Button label={REMINDER_COPY.markAll} variant="text" onPress={() => void markAll()} /> : undefined
      }
    >
      {!center.enabled ? (
        <RemindersOff
          preview={reminderPreview(state, clock)}
          onEnable={() => void enable()}
          onAdjust={() => router.push(espacoHref("preferencias"))}
        />
      ) : (
        <>
          <Notice>
            <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
              {reminderNotice(Platform.OS === "web" ? "web" : "native")}
            </AppText>
            <Button label={REMINDER_COPY.adjustPrefs} variant="text" onPress={() => router.push(espacoHref("preferencias"))} />
          </Notice>
          {center.quietUntil ? (
            <View testID="reminders-quiet" style={styles.quiet}>
              <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Moon size={16} color={mind.fg} />
              </View>
              <AppText role="status" size={fontSize.sm} weight={600} color={colors.text2} lineHeight={20} style={styles.grow}>
                {REMINDER_COPY.quietNow(center.quietUntil)}
              </AppText>
            </View>
          ) : null}
          <Section section={agora} headingRef={agoraHeading}>
            {agora.items.length ? (
              <View role="list" style={styles.list}>
                {agora.items.map(cardOf)}
              </View>
            ) : (
              <Card testID="reminders-all-clear" style={styles.allClear}>
                <EmptyArt kind="habits" />
                <AppText heading accessibilityRole="header" size={fontSize.md} weight={700} align="center">
                  {REMINDER_COPY.allClearTitle}
                </AppText>
                <AppText size={fontSize.sm} color={colors.muted} align="center" lineHeight={20} style={styles.allClearText}>
                  {next ? REMINDER_COPY.allClearNext(next) : REMINDER_COPY.allClearNone}
                </AppText>
              </Card>
            )}
          </Section>
          {hoje.items.length ? (
            <Section section={hoje}>
              <SectionItems items={hoje.items} cardOf={cardOf} />
            </Section>
          ) : null}
          {proximos.items.length ? (
            <Section section={proximos}>
              <ReminderRowList items={proximos.items} />
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** Seção com título focável (o foco volta a "Agora" depois de cada ação). */
function Section({
  section,
  headingRef,
  children,
}: {
  section: ReminderSection;
  headingRef?: RefObject<Text | null>;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View testID={`reminder-section-${section.key}`} style={styles.section}>
      <Text
        ref={headingRef}
        accessibilityRole="header"
        {...webAttrs({ tabIndex: -1 })}
        maxFontSizeMultiplier={1.5}
        style={styles.sectionTitle}
      >
        {section.title}
      </Text>
      {children}
    </View>
  );
}

/**
 * "Hoje": os lidos em cartões e os planejados em linhas, na ordem da central. Os lidos são sempre
 * anteriores (já aconteceram) aos planejados (depois de agora), então separar mantém a ordem.
 */
function SectionItems({
  items,
  cardOf,
}: {
  items: readonly ReminderItem[];
  cardOf: (card: ReminderItem) => ReactNode;
}) {
  const styles = useStyles();
  const cards = items.filter((item) => item.status !== "planned");
  const rows = items.filter((item) => item.status === "planned");
  return (
    <>
      {cards.length ? (
        <View role="list" style={styles.list}>
          {cards.map(cardOf)}
        </View>
      ) : null}
      <ReminderRowList items={rows} />
    </>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  section: { gap: 10 },
  sectionTitle: {
    fontFamily: fontFamily(800, true),
    fontSize: fontSize.lg,
    lineHeight: 22,
    letterSpacing: -0.17,
    color: colors.text,
  },
  list: { gap: 10 },
  quiet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).mind.border,
    backgroundColor: themeDomainTone(scheme).mind.bg,
  },
  grow: { flex: 1, minWidth: 0 },
  allClear: { alignItems: "center", paddingVertical: 20, gap: 8 },
  allClearText: { maxWidth: 280 },
}));
