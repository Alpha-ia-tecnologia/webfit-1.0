import { ChevronDown, Clock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { localDate, localTime, shiftDate } from "@shared/lib/domain";
import { fmtShortDate } from "@shared/lib/format";
import { AppText, DateField, TimeField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { PressChip } from "./dose-card";

/** "Hoje", "Ontem" ou "Qui, 24 set". */
export function whenDay(day: string, today = localDate()): string {
  if (day === today) return "Hoje";
  if (day === shiftDate(today, -1)) return "Ontem";
  return fmtShortDate(day);
}

type Props = {
  day: string;
  time: string;
  onDay: (day: string) => void;
  onTime: (time: string) => void;
};

/**
 * "Hoje · 08:30  Alterar ▾": data e horário recolhidos; o botão (nome "Alterar data e horário", que
 * começa pelo texto à vista) revela Agora/Ontem, a data (até hoje) e o horário.
 */
export function WhenRow({ day, time, onDay, onTime }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const today = localDate();
  const yesterday = shiftDate(today, -1);
  return (
    <View style={styles.when}>
      <View style={styles.summary}>
        <Clock size={16} color={colors.muted} />
        <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.label}>
          {whenDay(day, today)} · {time}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alterar data e horário"
          accessibilityState={{ expanded: isOpen }}
          aria-expanded={isOpen}
          onPress={() => setOpen(!isOpen)}
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        >
          <AppText size={fontSize.sm} weight={700} color={colors.green700}>
            Alterar
          </AppText>
          <View style={isOpen && styles.chevronOpen}>
            <ChevronDown size={14} color={colors.green700} />
          </View>
        </Pressable>
      </View>
      {isOpen && (
        <View style={styles.fields}>
          <View style={styles.chips}>
            <PressChip
              label="Agora"
              isOn={day === today}
              onPress={() => {
                onDay(today);
                onTime(localTime());
              }}
            />
            <PressChip label="Ontem" isOn={day === yesterday} onPress={() => onDay(yesterday)} />
          </View>
          <View style={styles.pickers}>
            <DateField label="Data" value={day} onChange={onDay} max={today} />
            <TimeField label="Horário" value={time} onChange={onTime} />
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  when: { gap: 12 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  label: { flex: 1, minWidth: 0, fontVariant: ["tabular-nums"] },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.pill },
  togglePressed: { backgroundColor: colors.mint50 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  fields: { gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickers: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
}));
