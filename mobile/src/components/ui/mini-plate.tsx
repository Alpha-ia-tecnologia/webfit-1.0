import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { ringSegments } from "@shared/lib/charts";
import { PLATE_GROUP_LABEL, plateLabel, type PlateGroup } from "@shared/lib/taco-match";
import { circlePath } from "@/components/hoje/ring-path";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeMacroColor, type MacroColors, type ThemeColors } from "@/theme/tokens";
import { AppText } from "./text";

const SIZE = 56;
const RADIUS = 20;
const STROKE = 9;
const GAP = 5;
/** Folga do traço depois de cada arco: maior que o círculo, para o padrão não se repetir. */
const DASH_REST = 1000;

/** Mesmas cores do web (.plate-veg, .plate-protein, .plate-grain). */
function groupColors(colors: ThemeColors, macroColor: MacroColors): Record<PlateGroup, string> {
  return {
    // Verde-escuro: o green500 é a mesma cor da proteína (macroColor.protein), como no web.
    vegetais: colors.plateVeg,
    proteinas: macroColor.protein,
    cereais: macroColor.carbs,
  };
}

/**
 * Prato em perfil sensível (no lugar da barra de macros): só os grupos presentes, sem números e
 * sem marcar o que falta. A borda é o prato; cada grupo é um arco.
 */
export function MiniPlate({ groups }: { groups: readonly PlateGroup[] }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  if (!groups.length) return null;
  const color = groupColors(colors, themeMacroColor(scheme));
  const arcs = ringSegments(RADIUS, groups.length, GAP);
  const d = circlePath(SIZE / 2, RADIUS);
  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={plateLabel(groups)}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} fill={colors.surface} stroke={colors.border} strokeWidth={1.5} />
        {groups.map((group, i) => (
          <Path
            key={group}
            d={d}
            fill="none"
            stroke={color[group]}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={`${arcs[i]!.length} ${DASH_REST}`}
            strokeDashoffset={arcs[i]!.offset}
          />
        ))}
      </Svg>
      <View style={styles.legend}>
        {groups.map((group) => (
          <View key={group} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: color[group] }]} />
            <AppText size={fontSize.xs} weight={600} color={colors.text2} lineHeight={16}>
              {PLATE_GROUP_LABEL[group]}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  legend: { flexShrink: 1, gap: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));
