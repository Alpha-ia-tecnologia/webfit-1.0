import { useWindowDimensions, View } from "react-native";
import { fmtNumber } from "@shared/lib/format";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeMacroColor, type MacroColors } from "@/theme/tokens";
import { CountUp } from "./metric";
import { AppText } from "./text";

export type MacroKey = keyof MacroColors;

type Props = {
  macro: MacroKey;
  label: string;
  value: number;
  goal: number | null;
  percent: number | null;
  showBar?: boolean;
  /** Balanço do Diário (conceito 03): rótulo 13 px muted, valor 20 px e unidade 13 px, como na tela estreita. */
  isCompact?: boolean;
};

/** Abaixo desta largura rótulo e valor descem um degrau para caberem na coluna (o @media 379px do web). */
const NARROW_BELOW_WIDTH = 380;
/** No balanço compacto do Diário, abaixo desta largura "82 / 115 g" desce mais um degrau (colunas de ~84 px a 320). */
const TINY_BELOW_WIDTH = 360;

/**
 * Um macronutriente na gramática de gráficos (SISTEMA-X2): ponto na cor fixa do macro, rótulo,
 * gramas (com a meta, quando há) e, opcionalmente, a barra até a meta. A barra é decorativa: o
 * texto já diz o valor (MacroStat do web).
 */
export function MacroStat({ macro, label, value, goal, percent, showBar = false, isCompact = false }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const color = themeMacroColor(scheme)[macro];
  const fill = Math.min(100, Math.max(0, percent ?? 0)) / 100;
  const { width } = useWindowDimensions();
  const isSmall = width < NARROW_BELOW_WIDTH || isCompact;
  const isTiny = isCompact && width < TINY_BELOW_WIDTH;
  const labelSize = isTiny ? fontSize.xs : isSmall ? fontSize.sm : fontSize.md;
  const valueSize = isTiny ? fontSize.lg : isSmall ? fontSize.xl : fontSize["2xl"];
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={`${label}: ${fmtNumber(value)}${goal !== null ? ` de ${fmtNumber(goal)}` : ""} g`}
      testID={`macro-stat-${macro}`}
    >
      <View style={styles.label}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <AppText size={labelSize} weight={600} color={isCompact ? colors.muted : colors.text2} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText heading size={valueSize} weight={800} tracking={-0.02} numberOfLines={1} style={styles.tabular}>
        <CountUp value={value} />
        <AppText size={labelSize} weight={500} color={colors.muted}>
          {goal !== null ? ` / ${fmtNumber(goal)} g` : " g"}
        </AppText>
      </AppText>
      {showBar && (
        <View style={styles.track}>
          <View style={[styles.fill, { backgroundColor: color, transform: [{ scaleX: fill }] }]} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  macro: { gap: 4 },
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  track: { height: 4, marginTop: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { width: "100%", height: "100%", borderRadius: radius.pill, transformOrigin: "left" },
}));
