import { View } from "react-native";
import type { ReminderCard as ReminderItem } from "@shared/lib/reminder-center";
import { AppText, IconTile } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { REMINDER_ICON } from "./reminder-icons";

/**
 * Lembrete planejado (NOTIF-01), como o ReminderRow do web: ícone no tom do tipo, título e horário
 * ("Às 15:00", "Amanhã · 08:30", "Qui, 24 set · 08:30"; nunca contagem regressiva). Só leitura: sem
 * ações nem foco.
 */
export function ReminderRow({ card, isFirst = false }: { card: ReminderItem; isFirst?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" testID="reminder-row" style={[styles.row, !isFirst && styles.divider]}>
      <IconTile tone={card.tone} size="md" icon={REMINDER_ICON[card.type]} />
      <AppText size={fontSize.base} weight={600} color={colors.text} style={styles.title}>
        {card.title}
      </AppText>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} align="right" style={styles.when}>
        {card.when}
      </AppText>
    </View>
  );
}

/** Os planejados de uma seção numa superfície só, separados por um fio (ul.reminder-list do web). */
export function ReminderRowList({ items }: { items: readonly ReminderItem[] }) {
  const styles = useStyles();
  if (!items.length) return null;
  return (
    <View role="list" style={styles.panel}>
      {items.map((card, index) => (
        <ReminderRow key={card.id} card={card} isFirst={index === 0} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 4,
    boxShadow: shadows.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  title: { flex: 1, minWidth: 0 },
  when: { flexShrink: 0, maxWidth: "45%" },
}));
