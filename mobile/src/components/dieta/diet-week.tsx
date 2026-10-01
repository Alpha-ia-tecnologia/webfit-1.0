import { useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import { PLAN_DAY_COPY, type WeekDay } from "@shared/lib/diet-week";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

type Props = {
  days: readonly WeekDay[];
  value: string;
  onChange: (date: string) => void;
};

/** Teclas do grupo de rádios (useRadioKeys do web): setas andam, Home/End vão às pontas. */
const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * "Semana do plano" (IA-X5): segunda a domingo da semana atual como rádios; o ponto marca os dias
 * com as trocas revisadas do plano e hoje fica contornado. Escolher outro dia mostra a prévia dele.
 */
export function DietWeek({ days, value, onChange }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).food;
  const chips = useRef<(View | null)[]>([]);
  const index = Math.max(0, days.findIndex((d) => d.date === value));
  const pick = (next: number, focus: boolean) => {
    const day = days[next];
    if (!day) return;
    if (day.date !== value) {
      selectionHaptic();
      onChange(day.date);
    }
    if (focus && Platform.OS === "web") (chips.current[next] as unknown as HTMLElement | null)?.focus();
  };
  const onKey = (event: { key: string; preventDefault: () => void }) => {
    const last = days.length - 1;
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? last : STEP[event.key] !== undefined ? (index + STEP[event.key]! + days.length) % days.length : null;
    if (next === null) return;
    event.preventDefault();
    pick(next, true);
  };
  return (
    <View testID="diet-week" style={styles.root}>
      {/* Conceito 04: "Outros dias do plano" depois da linha do tempo (o grupo continua "Semana do plano"). */}
      <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
        {PLAN_DAY_COPY.otherDays}
      </AppText>
      <View role="radiogroup" aria-label={PLAN_DAY_COPY.week} style={styles.strip}>
        {days.map((day, i) => {
          const isChecked = day.date === value;
          const ink = isChecked ? colors.white : day.isToday ? colors.green800 : colors.text2;
          return (
            <Pressable
              key={day.date}
              ref={(node) => {
                chips.current[i] = node;
              }}
              accessibilityRole="radio"
              accessibilityLabel={day.aria}
              accessibilityState={{ checked: isChecked }}
              {...webAttrs({ "aria-checked": isChecked, tabIndex: isChecked ? 0 : -1 })}
              {...(Platform.OS === "web" ? { onKeyDown: onKey } : {})}
              testID="diet-week-day"
              onPress={() => pick(i, false)}
              style={({ pressed }) => [
                styles.chip,
                isChecked && styles.checked,
                day.isToday && styles.today,
                pressed && styles.pressed,
              ]}
            >
              <AppText size={fontSize["2xs"]} weight={700} color={isChecked ? colors.onFillMint : colors.muted} lineHeight={14}>
                {day.letter}
              </AppText>
              <AppText heading size={fontSize.sm} weight={800} color={ink} lineHeight={18} style={styles.tabular}>
                {day.day}
              </AppText>
              <View style={[styles.dot, day.hasVariation && { backgroundColor: isChecked ? colors.onFillMint : tone.fg }]} />
            </Pressable>
          );
        })}
      </View>
      <AppText size={fontSize.xs} color={colors.muted}>
        {PLAN_DAY_COPY.legend}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8, alignSelf: "stretch", maxWidth: 440, width: "100%" },
  strip: { flexDirection: "row", gap: 3 },
  /** 38 × 56 px a 320 px (mesma exceção da faixa da semana do Hoje); 44 px de largura a partir de ~360. */
  chip: {
    flex: 1,
    minWidth: 0,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  /** Dia escolhido: preenchido no verde de destaque, texto branco (como o web). */
  checked: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  today: { borderWidth: 2, borderColor: colors.marker },
  pressed: { transform: [{ scale: 0.95 }] },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
