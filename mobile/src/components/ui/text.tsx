import { Text, type TextProps, type TextStyle } from "react-native";
import { useThemeColors } from "@/theme/theme";
import { fontFamily, type Weight } from "@/theme/tokens";

export type AppTextProps = TextProps & {
  size?: number;
  weight?: Weight;
  /** Plus Jakarta Sans (títulos) em vez de Inter. */
  heading?: boolean;
  /** Padrão: o texto do tema. */
  color?: string;
  align?: TextStyle["textAlign"];
  lineHeight?: number;
  /** Espaçamento entre letras em em (ex.: -0.02). */
  tracking?: number;
  upper?: boolean;
};

/** Teto da fonte ampliada pelo sistema: números grandes (≥ 28 px) até 1,3×, títulos (≥ 20 px) até 1,5×, texto corrido até 1,8×. */
function fontScaleCap(size: number): number {
  if (size >= 28) return 1.3;
  if (size >= 20) return 1.5;
  return 1.8;
}

/** Todo texto do app passa por aqui: fonte por peso, tamanho e cor dos tokens. */
export function AppText({
  size = 14,
  weight = 400,
  heading = false,
  color,
  align,
  lineHeight,
  tracking,
  upper = false,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const colors = useThemeColors();
  const letterSpacing =
    tracking !== undefined ? tracking * size : heading ? -0.01 * size : 0;
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap(size)}
      style={[
        {
          fontFamily: fontFamily(weight, heading),
          fontSize: size,
          color: color ?? colors.text,
          textAlign: align,
          lineHeight: lineHeight ?? Math.round(size * (heading ? 1.3 : 1.5)),
          letterSpacing,
          textTransform: upper ? "uppercase" : "none",
        },
        style,
      ]}
    />
  );
}
