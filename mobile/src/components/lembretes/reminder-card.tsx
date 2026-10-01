import { Check } from "lucide-react-native";
import { View } from "react-native";
import { REMINDER_COPY, type ReminderCard as ReminderItem } from "@shared/lib/reminder-center";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, IconButton, IconTile } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { REMINDER_ICON } from "./reminder-icons";

/** Some do leitor de tela (desenho que repete o texto ao lado). */
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Props = {
  card: ReminderItem;
  /** Atalho do tipo ("+250 ml", "Concluir", "Registrar"); só existe quando `card.quick` existe. */
  onQuick?: () => void;
  onOpen: () => void;
  onRead: () => void;
};

/**
 * Lembrete devido ou já lido (NOTIF-01), igual ao ReminderCard do web: ícone no tom do tipo, título,
 * quando, texto, progresso da água e as ações. A aplicação nunca tem atalho: só "Abrir registro"
 * (Seringa e dose) ou marcar como lido. Sem cores de alerta: não lido é só um ponto esmeralda.
 */
export function ReminderCard({ card, onQuick, onOpen, onRead }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isDue = card.status === "due";
  const isRead = card.status === "read";
  return (
    <View role="listitem">
      <Card testID="reminder-card" style={[styles.card, isRead && styles.readCard]}>
        <IconTile tone={card.tone} size="lg" icon={REMINDER_ICON[card.type]} />
        <View style={styles.main}>
          <View style={styles.head}>
            <View style={styles.titleRow}>
              {isDue && <View {...HIDDEN} testID="reminder-unread-dot" style={styles.dot} />}
              <AppText
                heading
                accessibilityRole="header"
                size={fontSize.md}
                weight={700}
                color={isRead ? colors.text2 : colors.text}
                style={styles.title}
              >
                {card.title}
              </AppText>
            </View>
            {isDue && <AppText style={srOnly}>{`${REMINDER_COPY.unread}.`}</AppText>}
            <AppText size={fontSize.xs} color={colors.muted}>
              {card.when}
            </AppText>
          </View>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            {card.description}
          </AppText>
          {card.meta ? (
            <AppText size={fontSize.sm} weight={600} color={colors.text2}>
              {card.meta}
            </AppText>
          ) : null}
          {card.progress !== null ? (
            <View {...HIDDEN} testID="reminder-progress" style={styles.track}>
              <View style={[styles.fill, { width: `${card.progress}%` }]} />
            </View>
          ) : null}
          <View style={styles.actions}>
            {card.quick && onQuick ? (
              <Button
                variant="secondary"
                size="sm"
                label={card.quick.label}
                accessibilityLabel={card.quick.aria}
                onPress={onQuick}
              />
            ) : null}
            <Button variant="text" label={REMINDER_COPY.open} onPress={onOpen} />
            {isDue ? (
              <View style={styles.readAction}>
                <IconButton icon={Check} accessibilityLabel={REMINDER_COPY.markRead(card.title)} onPress={onRead} />
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  readCard: { backgroundColor: colors.surface3 },
  main: { flex: 1, minWidth: 0, gap: 6 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  title: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: themeDomainTone(scheme).water.bg, overflow: "hidden", marginTop: 2 },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: themeDomainTone(scheme).water.fg },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 4, marginTop: 4 },
  readAction: { marginLeft: "auto" },
}));
