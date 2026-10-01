import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Chips em linha densa: 40 px de altura (o mínimo aceito para chips agrupados). */
const CHIP_HEIGHT = 40;

type ChipProps = {
  label: string;
  isOn: boolean;
  onPress: () => void;
  /** "water" pinta o chip ligado de azul (volumes); o padrão é verde. */
  tone?: "green" | "water";
  accessibilityLabel?: string;
};

/** Chip de alternância das folhas de água e bem-estar (.entry-chips button). */
export function EntryChip({ label, isOn, onPress, tone = "green", accessibilityLabel }: ChipProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isOn }}
      {...webAttrs({ "aria-pressed": isOn })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        isOn && (tone === "water" ? styles.chipWater : styles.chipOn),
        pressed && !isOn && styles.chipPressed,
      ]}
    >
      <AppText size={fontSize.sm} weight={700} color={isOn ? colors.surface : colors.text2} style={styles.tabular}>
        {label}
      </AppText>
    </Pressable>
  );
}

type GroupProps = {
  /** Nome do grupo para o leitor de tela; com `hasLegend`, também aparece como legenda. */
  label: string;
  hasLegend?: boolean;
  isCentered?: boolean;
  children: ReactNode;
};

/** Grupo de chips (o fieldset/legend do web): a legenda à vista fica fora do leitor, que ouve o nome do grupo. */
export function ChipGroup({ label, hasLegend = false, isCentered = false, children }: GroupProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.group} role="group" aria-label={label}>
      {hasLegend ? (
        <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
          {label}
        </AppText>
      ) : null}
      <View style={[styles.row, isCentered && styles.rowCentered]}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowCentered: { justifyContent: "center" },
  chip: {
    minHeight: CHIP_HEIGHT,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.green700, backgroundColor: colors.green700 },
  chipWater: { borderColor: colors.sky600, backgroundColor: colors.sky600 },
  chipPressed: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
