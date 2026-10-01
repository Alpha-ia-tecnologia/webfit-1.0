import { Beef, BookOpen, Coffee, Droplets, Footprints, MessageCircle, Moon, type LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { HabitBlock } from "@shared/lib/agent-blocks";
import { weekSummary, type WeekRowKey } from "@shared/lib/block-charts";
import { isCalmOn } from "@shared/lib/day";
import { localDate } from "@shared/lib/domain";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Pill, SegmentMeter } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone, type Domain } from "@/theme/tokens";
import { HabitChip } from "./action-card";

const ROW_ICON: Record<WeekRowKey, LucideIcon> = {
  registros: BookOpen,
  proteina: Beef,
  agua: Droplets,
  sono: Moon,
};
const ROW_TONE: Record<WeekRowKey, Domain> = {
  registros: "food",
  proteina: "food",
  agua: "water",
  sono: "body",
};

/** Ícone decorativo da pergunta sugerida (café, água, caminhada, sono); senão um balão. */
function suggestionIcon(text: string): LucideIcon {
  if (/caf[eé]/i.test(text)) return Coffee;
  if (/[aá]gua|garrafa/i.test(text)) return Droplets;
  if (/caminhad|exerc/i.test(text)) return Footprints;
  if (/sono|dormir/i.test(text)) return Moon;
  return MessageCircle;
}

/**
 * Resumo da semana num cartão só (WeekSummaryCard do web, conceito 05): título curto, as datas, o selo de kcal (neutro,
 * nunca vermelho) e 4 linhas com barra (registros, proteína, água e sono), calculadas com os registros locais dos 7 dias
 * que terminam na data da mensagem. No fim, os combinados propostos e as perguntas sugeridas viram chips. Perfil calmo:
 * sem proteína, sem selo e sem chips.
 */
export function WeekSummaryCard({
  endDate,
  title,
  habits,
  suggestions,
  onSuggestion,
}: {
  endDate: string;
  title: string;
  habits: readonly HabitBlock[];
  suggestions: readonly string[];
  onSuggestion: (text: string) => void;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tones = themeDomainTone(scheme);
  const { state } = useApp();
  const summary = useMemo(() => weekSummary(state, endDate), [state, endDate]);
  const calm = !state.profile || isCalmOn(state.profile, localDate());
  const hasChips = !calm && habits.length + suggestions.length > 0;
  return (
    <View style={styles.card} testID="week-summary" aria-label={title} role="group">
      <View style={styles.head}>
        <View style={styles.heading}>
          <AppText heading size={fontSize.lg} weight={800} lineHeight={22} accessibilityRole="header">
            {title}
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted}>
            {summary.range}
          </AppText>
        </View>
        {summary.kcalBadge ? (
          <Pill tone="food" style={styles.badge}>
            {summary.kcalBadge}
          </Pill>
        ) : null}
      </View>
      <View role="list" style={styles.rows}>
        {summary.rows.map((row) => {
          const Icon = ROW_ICON[row.key];
          const tone = tones[ROW_TONE[row.key]];
          return (
            <View key={row.key} role="listitem" style={styles.row}>
              <View style={[styles.tile, { backgroundColor: tone.bg }]} aria-hidden importantForAccessibility="no-hide-descendants">
                <Icon size={16} color={tone.fg} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowHead}>
                  <AppText size={fontSize.base} weight={600} numberOfLines={1} style={styles.shrink}>
                    {row.label}
                  </AppText>
                  <AppText size={fontSize.sm} color={colors.muted} numberOfLines={1} style={styles.tabular}>
                    <AppText size={fontSize.base} weight={800} color={colors.text} aria-hidden>
                      {row.value}
                    </AppText>
                    <AppText size={fontSize.sm} color={colors.muted} aria-hidden>
                      {row.rest}
                    </AppText>
                    <AppText style={srOnly}>{row.text}</AppText>
                  </AppText>
                </View>
                {row.meter ? (
                  <SegmentMeter value={row.meter.value} total={row.meter.total} mode={row.meter.mode} tone={ROW_TONE[row.key]} size="lg" />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      {hasChips ? (
        <View style={styles.chipsBox}>
          <View style={styles.rule} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {Array.from({ length: 60 }, (_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroller}
            contentContainerStyle={styles.chips}
            role="group"
            aria-label="Próximos passos da semana"
          >
            {habits.map((habit) => (
              <HabitChip key={habit.titulo} block={habit} />
            ))}
            {suggestions.map((text) => {
              const Icon = suggestionIcon(text);
              return (
                <Pressable key={text} accessibilityRole="button" accessibilityLabel={text} onPress={() => onSuggestion(text)} style={styles.chipHit}>
                  {({ pressed }) => (
                    <View style={[styles.chip, pressed && styles.chipPressed]}>
                      <Icon size={16} color={colors.text2} />
                      <AppText size={fontSize.sm} weight={700} color={colors.text2} numberOfLines={1}>
                        {text}
                      </AppText>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  badge: { flexShrink: 1 },
  rows: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 },
  shrink: { flexShrink: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  chipsBox: { gap: 12, marginHorizontal: -16, marginBottom: -4 },
  rule: { flexDirection: "row", flexWrap: "wrap", height: 1, columnGap: 3, overflow: "hidden", marginHorizontal: 16 },
  dash: { width: 4, height: 1, backgroundColor: colors.border },
  chipsScroller: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chipHit: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipPressed: { transform: [{ scale: 0.97 }] },
}));
