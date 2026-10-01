import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { themeMacroColor } from "@/theme/tokens";

// Largura máxima do .starter-art do web; a altura segue a proporção do viewBox (200 × 140).
const ART_WIDTH = 240;
const ART_HEIGHT = Math.round(ART_WIDTH * (140 / 200));

/** Ilustração leve (SVG próprio, sem imagem externa): prato, gota d'água e um check. */
export function WelcomeArt() {
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  return (
    <Svg
      viewBox="0 0 200 140"
      width={ART_WIDTH}
      height={ART_HEIGHT}
      style={{ maxWidth: "100%" }}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={100} cy={72} r={62} fill={colors.mint50} />
      <Ellipse cx={100} cy={92} rx={54} ry={14} fill={colors.mint100} />
      <Path d="M52 80a48 26 0 0 0 96 0z" fill={colors.white} stroke={colors.mint200} strokeWidth={3} />
      <Circle cx={84} cy={74} r={10} fill={colors.emerald} opacity={0.85} />
      <Circle cx={104} cy={70} r={8} fill={macroColor.carbs} opacity={0.8} />
      <Circle cx={120} cy={76} r={7} fill={macroColor.fat} opacity={0.85} />
      <Path d="M150 30c8 11 13 18 13 25a13 13 0 0 1-26 0c0-7 5-14 13-25z" fill={colors.blue} />
      <Circle cx={48} cy={38} r={15} fill={colors.green700} />
      <Path
        d="m41 38 5 5 9-10"
        fill="none"
        stroke={colors.white}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
