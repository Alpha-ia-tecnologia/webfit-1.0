import { Apple, ChevronDown, Coffee, Moon, MoonStar, Sun, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { localDate, shiftDate } from "@shared/lib/domain";
import { MEAL_CATEGORIES } from "@shared/lib/meals";
import { AppText, Button, DateField, Sheet, TimeField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { webAttrs } from "./web-a11y";

const ICONS: Record<string, LucideIcon> = {
  "Café da manhã": Coffee,
  Almoço: Sun,
  Lanche: Apple,
  Jantar: Moon,
  Ceia: MoonStar,
};

/** "Hoje", "Ontem" ou "dd/mm". */
export function dayLabel(day: string): string {
  const today = localDate();
  if (day === today) return "Hoje";
  if (day === shiftDate(today, -1)) return "Ontem";
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

type Props = {
  category: string;
  day: string;
  time: string;
  onChange: (next: { category?: string; day?: string; time?: string }) => void;
};

/** Até esta largura a pílula fica sem o ícone e com 12 px nas laterais (o @media 380px do web). */
const NARROW_MAX_WIDTH = 380;

/**
 * "☾ Jantar ⌄ │ Hoje, 19:30" no centro do cabeçalho (conceito 02): toque para trocar o tipo, a data ou o
 * horário da refeição.
 */
export function MealPill({ category, day, time, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const Icon = ICONS[category] ?? Sun;
  // Telas estreitas (como o web até 380 px): sem o ícone, a pílula cabe entre voltar e o histórico.
  const isNarrow = useWindowDimensions().width <= NARROW_MAX_WIDTH;
  const when = `${dayLabel(day)}, ${time}`;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${category}, ${when} — alterar tipo, data ou horário`}
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, isNarrow && styles.pillNarrow, pressed && styles.pressed]}
      >
        {!isNarrow && (
          <View style={styles.icon}>
            <Icon size={16} color={colors.indigo700} />
          </View>
        )}
        <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} numberOfLines={1} style={styles.type}>
          {category}
        </AppText>
        <ChevronDown size={16} color={colors.text2} />
        <View style={[styles.when, isNarrow && styles.whenNarrow]}>
          <AppText size={fontSize.md} weight={600} color={colors.muted} numberOfLines={1}>
            {when}
          </AppText>
        </View>
      </Pressable>
      <Sheet
        visible={isOpen}
        title="Quando foi a refeição?"
        onClose={() => setOpen(false)}
        footer={<Button label="Pronto" onPress={() => setOpen(false)} wide />}
      >
        <View style={styles.chips} role="group" aria-label="Tipo de refeição">
          {MEAL_CATEGORIES.map((c) => {
            const TypeIcon = ICONS[c] ?? Sun;
            const isOn = c === category;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={c}
                accessibilityState={{ selected: isOn }}
                {...webAttrs({ "aria-pressed": isOn })}
                onPress={() => onChange({ category: c })}
                style={({ pressed }) => [styles.chip, isOn && styles.chipOn, pressed && styles.pressed]}
              >
                <TypeIcon size={16} color={isOn ? colors.white : colors.text2} />
                <AppText size={fontSize.sm} weight={700} color={isOn ? colors.white : colors.text2}>
                  {c}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {/* Valor vazio não vale: a refeição mantém a data e o horário anteriores. */}
        <View style={styles.grid}>
          <DateField label="Data" value={day} max={localDate()} onChange={(next) => next && onChange({ day: next })} />
          <TimeField label="Horário" value={time} onChange={(next) => next && onChange({ time: next })} />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    minHeight: 52,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pillNarrow: { paddingLeft: 12, paddingRight: 12 },
  pressed: { transform: [{ scale: 0.98 }] },
  icon: {
    width: 28,
    height: 28,
    marginRight: 4,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.indigo50,
  },
  type: { flexShrink: 0 },
  when: { flexShrink: 1, minWidth: 0, marginLeft: 6, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border },
  whenNarrow: { marginLeft: 4, paddingLeft: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accentFill, backgroundColor: colors.accentFill },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
}));
