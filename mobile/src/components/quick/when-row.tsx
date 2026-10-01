import { ChevronRight, ChevronUp, Clock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { localDate, shiftDate } from "@shared/lib/domain";
import { whenDayLabel } from "@shared/lib/wellbeing";
import { AppText, DateField, TimeField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/**
 * "alterar" tem 36 px de altura visual. O react-native-web ignora hitSlop no Pressable: o toque de 44 px
 * é real e a margem negativa devolve o espaço dentro da faixa (que já tem 44 px).
 */
const TOGGLE_PAD = 4;

type Props = {
  day: string;
  time: string;
  /** "agora" enquanto o horário não foi tocado e o dia é hoje. */
  isNow: boolean;
  onDay: (day: string) => void;
  onTime: (time: string) => void;
};

/** "Hoje · agora ▸ alterar": a data e o horário ficam recolhidos até a pessoa querer trocar. */
export function WhenRow({ day, time, isNow, onDay, onTime }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const today = localDate();
  const Chevron = isOpen ? ChevronUp : ChevronRight;
  return (
    <View style={styles.when}>
      <View style={styles.summary}>
        <Clock size={16} color={colors.muted} />
        <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.label}>
          {whenDayLabel(day, today, shiftDate(today, -1))} · {isNow ? "agora" : time}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isOpen ? "Recolher data e horário" : "Alterar data e horário"}
          accessibilityState={{ expanded: isOpen }}
          aria-expanded={isOpen}
          onPress={() => setOpen(!isOpen)}
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        >
          <AppText size={fontSize.sm} weight={700} color={colors.green700}>
            {isOpen ? "pronto" : "alterar"}
          </AppText>
          <Chevron size={14} color={colors.green700} />
        </Pressable>
      </View>
      {isOpen && (
        <View style={styles.fields}>
          <DateField label="Data" value={day} onChange={onDay} max={today} />
          <TimeField label="Horário" value={time} onChange={onTime} />
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
    minHeight: 44,
    paddingVertical: 4,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  label: { flex: 1, fontVariant: ["tabular-nums"] },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
    marginVertical: -TOGGLE_PAD,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  togglePressed: { backgroundColor: colors.mint50 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
}));
