import { View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AppText } from "@/components/ui/text";

/** Marca WebFit em SVG: três barras esmeralda inclinadas, duas barras azuis e o selo circular. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const colors = useThemeColors();
  return (
    <Svg viewBox="0 0 118 100" width={size} height={Math.round(size * (100 / 118))} accessibilityElementsHidden>
      <G fill={colors.emerald}>
        <Rect x={9} y={22} width={14} height={60} rx={7} transform="rotate(22 16 52)" />
        <Rect x={29} y={22} width={14} height={60} rx={7} transform="rotate(22 36 52)" />
        <Rect x={49} y={22} width={14} height={60} rx={7} transform="rotate(22 56 52)" />
      </G>
      <G fill={colors.blue} transform="skewX(-22)">
        <Rect x={88} y={14} width={32} height={12} rx={6} />
        <Rect x={88} y={33} width={32} height={12} rx={6} />
      </G>
      <G fill="none" stroke={colors.emerald} strokeWidth={2.4} strokeLinecap="round">
        <Circle cx={86} cy={76} r={6.5} />
        <Path d="M88.6 73.9a3.1 3.1 0 1 0 0 4.2" strokeWidth={1.7} />
      </G>
    </Svg>
  );
}

/** Marca completa: símbolo + "Web" esmeralda e "Fit" azul. */
export function Logo({ size = 36, wordmark = true, wordSize = fontSize["2xl"] }: { size?: number; wordmark?: boolean; wordSize?: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.brand} accessibilityRole="image" accessibilityLabel="WebFit">
      <LogoMark size={size} />
      {wordmark && (
        <AppText heading size={wordSize} weight={800} tracking={-0.04} color={colors.emerald} lineHeight={wordSize}>
          Web
          <AppText heading size={wordSize} weight={800} tracking={-0.04} color={colors.blue} lineHeight={wordSize}>
            Fit
          </AppText>
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
}));
