import type { LucideIcon } from "lucide-react-native";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type Domain } from "@/theme/tokens";
import { AppText } from "./text";

export type IconTileSize = "sm" | "md" | "lg" | "xl";

/** Bloco, raio, ícone e emoji de cada tamanho (os mesmos do IconTile do web). */
const SIZES: Record<IconTileSize, { box: number; radius: number; icon: number; emoji: number }> = {
  sm: { box: 24, radius: radius.xs, icon: 14, emoji: fontSize.xs },
  md: { box: 36, radius: radius.sm, icon: 18, emoji: fontSize.xl },
  lg: { box: 44, radius: radius.sm, icon: 22, emoji: fontSize["2xl"] },
  xl: { box: 72, radius: radius.lg, icon: 32, emoji: fontSize["6xl"] },
};
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Props = {
  tone?: Domain;
  size?: IconTileSize;
  icon?: LucideIcon;
  /** Emoji no lugar do ícone (alimentos da despensa, receitas). */
  glyph?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bloco arredondado no tom do domínio com um ícone ou emoji (SIS-11). Sempre decorativo: o texto
 * ao lado já diz o que é.
 */
export function IconTile({ tone = "neutral", size = "md", icon: Icon, glyph, testID = "icon-tile", style }: Props) {
  const styles = useStyles();
  const toneColors = themeDomainTone(useTheme().scheme)[tone];
  const s = SIZES[size];
  return (
    <View
      {...HIDDEN}
      testID={testID}
      style={[styles.tile, { width: s.box, height: s.box, borderRadius: s.radius, backgroundColor: toneColors.bg }, style]}
    >
      {Icon ? (
        <Icon size={s.icon} color={toneColors.fg} />
      ) : glyph ? (
        <AppText size={s.emoji} lineHeight={Math.round(s.emoji * 1.25)} align="center" maxFontSizeMultiplier={1}>
          {glyph}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  tile: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
}));
