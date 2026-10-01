import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { donutArcs } from "@shared/lib/charts";
import { macroShare } from "@shared/lib/diary-day";
import { circlePath } from "@/components/hoje/ring-path";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeMacroColor } from "@/theme/tokens";

const SIZE = 88;
const RADIUS = 34;
const WIDTH = 12;
const GAP = 4;
/** Folga do traço depois de cada fatia: maior que a rosca, para o padrão não se repetir. */
const DASH_REST = 1000;
const PARTS = [
  { key: "protein", label: "Proteína" },
  { key: "carbs", label: "Carboidratos" },
  { key: "fat", label: "Gorduras" },
] as const;

/**
 * Rosca P/C/G do Diário quando as calorias estão ocultas (HOJE-01): só a proporção entre os macros,
 * nas cores fixas, sem nenhum número de energia. Sem registros, não aparece.
 */
export function MacroDonut({ macros }: { macros: { protein: number; carbs: number; fat: number } }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const share = macroShare(macros);
  if (!share) return null;
  const values = PARTS.map((p) => share[p.key]);
  const arcs = donutArcs(RADIUS, values, GAP);
  const label = `Distribuição dos macros no dia: ${PARTS.map((p, i) => `${p.label} ${values[i]}%`).join(", ")}`;
  const d = circlePath(SIZE / 2, RADIUS);
  return (
    <View style={styles.donut} accessible accessibilityRole="image" accessibilityLabel={label} testID="macro-donut">
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {PARTS.map((p, i) =>
          arcs[i]!.length > 0 ? (
            <Path
              key={p.key}
              d={d}
              fill="none"
              stroke={macroColor[p.key]}
              strokeWidth={WIDTH}
              strokeDasharray={`${arcs[i]!.length} ${DASH_REST}`}
              strokeDashoffset={arcs[i]!.offset}
            />
          ) : null,
        )}
      </Svg>
      <View style={styles.legend}>
        {PARTS.map((p, i) => (
          <View key={p.key} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: macroColor[p.key] }]} />
            <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.name}>
              {p.label}
            </AppText>
            <AppText size={fontSize.sm} weight={700} color={colors.text} style={styles.value}>
              {values[i]}%
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  donut: { flexDirection: "row", alignItems: "center", gap: 16 },
  legend: { flex: 1, minWidth: 0, maxWidth: 220, gap: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1 },
  value: { paddingLeft: 12, fontVariant: ["tabular-nums"] },
}));
