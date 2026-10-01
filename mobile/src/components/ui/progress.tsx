import { LinearGradient } from "expo-linear-gradient";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { horizontal } from "@/theme/tokens";

type Props = {
  percent: number | null;
  /** Padrão: esmeralda. */
  color?: string;
  /** Gradiente horizontal no preenchimento (ex.: gradients.kcal). */
  gradient?: readonly [string, string, ...string[]];
  /** Padrão: a linha suave do tema. */
  trackColor?: string;
  height?: number;
  /** Espaço interno da trilha (.kcal-bar usa 2). */
  inset?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Barra de progresso arredondada (.progress, .kcal-bar). */
export function ProgressBar({
  percent,
  color,
  gradient,
  trackColor,
  height = 8,
  inset = 0,
  accessibilityLabel,
  style,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const value = Math.max(0, Math.min(100, percent ?? 0));
  const width = `${value}%` as const;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={[
        styles.track,
        { height, backgroundColor: trackColor ?? colors.hairline, padding: inset },
        style,
      ]}
    >
      {value > 0 &&
        (gradient ? (
          <LinearGradient
            colors={gradient}
            start={horizontal.start}
            end={horizontal.end}
            style={[styles.fill, { width }]}
          />
        ) : (
          <View style={[styles.fill, { width, backgroundColor: color ?? colors.emerald }]} />
        ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  track: { width: "100%", borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
}));
