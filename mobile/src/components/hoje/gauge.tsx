import { useId, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { arcLength } from "@shared/lib/charts";
import { makeStyles, useThemeColors } from "@/theme/theme";

const RADIUS = 80;
const ARC = `M 20 100 A ${RADIUS} ${RADIUS} 0 0 1 180 100`;
/** Comprimento do semicírculo: metade do anel na gramática de gráficos (@shared/lib/charts). */
const ARC_LENGTH = arcLength(RADIUS, 50);

type Props = {
  percent: number | null;
  label: string;
  stops?: readonly string[];
  children: ReactNode;
};

/** Medidor semicircular com traço em gradiente da marca (.gauge). */
export function Gauge({ percent, label, stops, children }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const arcStops = stops ?? [colors.blue, colors.emerald];
  const id = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <View style={styles.gauge} accessibilityRole="image" accessibilityLabel={label}>
      <Svg viewBox="0 0 200 110" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            {arcStops.map((color, i) => (
              <Stop key={`${color}-${i}`} offset={`${(i / Math.max(1, arcStops.length - 1)) * 100}%`} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Path d={ARC} fill="none" stroke={colors.surface2} strokeWidth={16} strokeLinecap="round" />
        <Path d={ARC} fill="none" stroke={colors.slate300} strokeWidth={1} strokeDasharray="2 6" strokeLinecap="round" />
        <Path
          d={ARC}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH}`}
          strokeDashoffset={ARC_LENGTH - arcLength(RADIUS, clamped / 2)}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  gauge: { width: "100%", maxWidth: 236, aspectRatio: 200 / 110, alignSelf: "center", marginTop: 6 },
  center: { position: "absolute", left: 0, right: 0, bottom: 2, alignItems: "center" },
}));
