import { View } from "react-native";
import { fmtNumber } from "@shared/lib/format";
import { MACROS } from "@shared/lib/today";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeMacroColor } from "@/theme/tokens";
import { AppText } from "./text";

export type MacroKey = (typeof MACROS)[number]["key"];

export type MacroColumn = {
  key: MacroKey;
  /** Gramas (meta, consumo ou TACO); null = "—". */
  grams: number | null;
  /** "82 / 115 g": a meta vira o texto menor depois da barra. */
  goal?: number | null;
  /** Parte da energia (%), mostrada com showPercent: "115 g · 29%". */
  percent?: number | null;
};

type Props = {
  items: readonly MacroColumn[];
  showPercent?: boolean;
  testID?: string;
};

const LABEL = Object.fromEntries(MACROS.map((m) => [m.key, m.label])) as Record<MacroKey, string>;

/**
 * Três colunas de macros com o ponto na cor fixa (MacroColumns do web): "● Proteína / 115 g · 29%" (plano da
 * anamnese, metas do Meu espaço) ou "82 / 115 g" (com meta). O leitor de tela ouve cada coluna inteira.
 */
export function MacroColumns({ items, showPercent = false, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  return (
    <View style={styles.columns} role="list" testID={testID}>
      {items.map(({ key, grams, goal, percent }) => {
        const value = grams === null ? "—" : fmtNumber(grams);
        const hasGoal = goal !== null && goal !== undefined;
        const hasPercent = showPercent && percent !== null && percent !== undefined;
        const rest = `${hasGoal ? ` / ${fmtNumber(goal)} g` : " g"}${hasPercent ? ` · ${percent}%` : ""}`;
        return (
          <View key={key} role="listitem" accessible accessibilityLabel={`${LABEL[key]}: ${value}${rest}`} style={styles.column}>
            <View style={styles.label}>
              <View style={[styles.dot, { backgroundColor: macroColor[key] }]} />
              <AppText size={fontSize.md} weight={600} color={colors.text2} numberOfLines={1}>
                {LABEL[key]}
              </AppText>
            </View>
            <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} numberOfLines={1} style={styles.tabular}>
              {value}
              <AppText size={fontSize.md} weight={500} tracking={0} color={colors.muted}>
                {rest}
              </AppText>
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  columns: { flexDirection: "row", gap: 8 },
  column: { flex: 1, minWidth: 0, gap: 4 },
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
