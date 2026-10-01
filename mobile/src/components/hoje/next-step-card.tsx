import { LinearGradient } from "expo-linear-gradient";
import { CalendarClock, Clock, Droplet, MessageCircle, Sparkles, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { insightTitle, type DayInsight, type InsightChip } from "@shared/lib/day";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { diagonal, fontSize, gradients, radius, shadows, type ThemeColors } from "@/theme/tokens";
import { habitIcon } from "./habit-icon";

type Props = {
  insight: DayInsight;
  onAction: () => void;
  onAsk: () => void;
};

const ICON_BOX = 40;

/** Ícone do chip: gota (água), o ícone do combinado (lua para chá/sono) ou relógio; relógio-calendário na despensa. */
function chipIcon(chip: InsightChip): LucideIcon {
  if (chip.kind === "water") return Droplet;
  if (chip.kind === "pantry") return CalendarClock;
  const { icon } = habitIcon(chip.full);
  return icon === Sparkles ? Clock : icon;
}

const chipIconColor = (chip: InsightChip, colors: ThemeColors) =>
  chip.kind === "water" ? colors.sky400 : chip.kind === "pantry" ? colors.onFillAmber : colors.onFillSky;

/**
 * Cartão "Resumo" do dia (NextStepCard do web): ícone à esquerda, o período, um título com a consequência,
 * até dois contextos com ícone e uma ação só, mais o atalho para o agente. Tudo calculado localmente.
 */
export function NextStepCard({ insight, onAction, onAsk }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.card} testID="next-step">
      {/* Brilhos do web: esmeralda no canto de cima à direita, azul no de baixo à esquerda. */}
      <LinearGradient colors={gradients.nextStepGlowEmerald} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.nextStepGlow} start={{ x: 0, y: 1 }} end={{ x: 0.7, y: 0.2 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.fab} start={diagonal.start} end={diagonal.end} style={styles.icon}>
        <Sparkles size={20} color={colors.white} />
      </LinearGradient>
      <View style={styles.body}>
        <AppText size={fontSize.xs} weight={800} upper tracking={0.08} color={colors.onFillMint} lineHeight={16}>
          {insight.kicker}
        </AppText>
        <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} lineHeight={29} color={colors.white} accessibilityRole="header" style={styles.title}>
          {insightTitle(insight)}
        </AppText>
        {insight.chipItems.length > 0 && (
          <View style={styles.chips}>
            {insight.chipItems.map((chip) => {
              const Icon = chipIcon(chip);
              return (
                <View key={chip.full} style={styles.chip} accessible accessibilityLabel={chip.full}>
                  <Icon size={16} color={chipIconColor(chip, colors)} />
                  <AppText size={fontSize.sm} weight={700} color={colors.onFillSlate} numberOfLines={1} style={styles.chipText}>
                    {chip.text}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.actions}>
          {insight.action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={insight.action.label}
              onPress={onAction}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <Sparkles size={18} color={colors.accentFill} />
              <AppText heading size={fontSize.md} weight={800} color={colors.navy} style={styles.shrink}>
                {insight.action.label}
              </AppText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Perguntar ao agente"
            onPress={onAsk}
            style={({ pressed }) => [styles.ask, pressed && styles.pressed]}
          >
            <MessageCircle size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 28,
    backgroundColor: colors.navy,
    overflow: "hidden",
    boxShadow: shadows.float,
  },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: 10 },
  title: { marginTop: -4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.onFillOverlay,
    backgroundColor: colors.onFillChip,
  },
  chipText: { flexShrink: 1, minWidth: 0 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    flexShrink: 1,
  },
  shrink: { flexShrink: 1 },
  ask: {
    width: 48,
    height: 48,
    marginLeft: "auto",
    borderRadius: radius.md,
    backgroundColor: colors.onFillOverlayFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.97 }] },
}));
