import { View } from "react-native";
import type { InsightChip, InsightTone } from "@shared/lib/progress-insights";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ColorScheme, type ThemeColors } from "@/theme/tokens";

/** Ponto do domínio antes do texto; o neutro (refeições) fica na cor da borda, como o web. */
function dotColor(tone: InsightTone, colors: ThemeColors, scheme: ColorScheme): string {
  return tone === "neutral" ? colors.border : themeDomainTone(scheme)[tone].fg;
}

/**
 * Destaques calculados (EVOL-06): pílulas "94% da meta" · "6 de 7 dias" numa lista com nome
 * ("Destaques de Água"). O texto curto fica à vista; o leitor de tela ouve a frase completa.
 * Nenhuma cor de julgamento: acima de 100% é a mesma pílula neutra.
 */
export function InsightChips({ chips, label }: { chips: readonly InsightChip[]; label: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  if (!chips.length) return null;
  return (
    <View role="list" aria-label={label} style={styles.list}>
      {chips.map((chip) => (
        <View key={chip.key} role="listitem" style={styles.chip}>
          <View style={[styles.dot, { backgroundColor: dotColor(chip.tone, colors, scheme) }]} aria-hidden />
          <AppText size={fontSize.xs} weight={700} color={colors.text2} lineHeight={16} style={styles.text} aria-hidden>
            {chip.text}
          </AppText>
          <AppText style={srOnly}>{chip.aria}</AppText>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Num mini gráfico estreito (150 pt), a pílula mais longa quebra a linha em vez de passar da borda.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flexShrink: 1, fontVariant: ["tabular-nums"] },
}));
