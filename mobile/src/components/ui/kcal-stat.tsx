import { View } from "react-native";
import { fmtNumber } from "@shared/lib/format";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AppText } from "./text";

type Props = {
  /** kcal do registro (entry.calories) ou da TACO (macroEstimate().kcal). Nunca do texto do modelo. */
  value: number;
  /** Estimativa (plano, sugestão): escreve "≈" antes. */
  approx?: boolean;
  /** stack: "420" sobre "kcal" (cartão do Hoje); inline: "420 kcal" (grupo do Diário, bandeja). */
  layout?: "stack" | "inline";
  unit?: string;
  testID?: string;
};

/**
 * Número de kcal com a unidade menor (KcalStat do web). A tela não o desenha com "ocultar calorias"
 * (hideCalories): este componente não sabe da preferência.
 */
export function KcalStat({ value, approx = false, layout = "stack", unit = "kcal", testID }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const number = `${approx ? "≈ " : ""}${fmtNumber(value)}`;
  const a11y = { accessible: true, accessibilityLabel: `${number} ${unit}`, testID } as const;
  if (layout === "inline")
    return (
      <AppText {...a11y} heading size={fontSize.lg} weight={800} tracking={-0.02} style={styles.tabular} numberOfLines={1}>
        {number}
        <AppText size={fontSize.sm} weight={600} tracking={0} color={colors.muted}>
          {` ${unit}`}
        </AppText>
      </AppText>
    );
  return (
    <View {...a11y} style={styles.stack}>
      <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} lineHeight={22} style={styles.tabular} numberOfLines={1}>
        {number}
      </AppText>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} lineHeight={14}>
        {unit}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { alignItems: "flex-end", flexShrink: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
