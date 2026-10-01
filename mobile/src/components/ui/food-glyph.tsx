import type { LucideIcon } from "lucide-react-native";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone, type DomainTones, type ThemeColors } from "@/theme/tokens";
import { AppText } from "./text";

/** Lado do bloco em px. O emoji fica em ~55% do lado (degrau da escala por tamanho). */
export type GlyphSize = 28 | 34 | 40 | 44 | 48 | 56;
/** Fundo do bloco: neutro (surface-3) ou o tom da refeição (café âmbar, almoço menta…). */
export type GlyphTone = "surface" | "amber" | "mint" | "sky" | "indigo" | "mind";

const ICON_PX: Record<GlyphSize, number> = { 28: 14, 34: 16, 40: 18, 44: 20, 48: 22, 56: 24 };
const EMOJI_PX: Record<GlyphSize, number> = {
  28: fontSize.md,
  34: fontSize.lg,
  40: fontSize.xl,
  44: fontSize["2xl"],
  48: fontSize["2xl"],
  56: fontSize["3xl"],
};
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** Fundo, cor do ícone e borda de cada tom (os mesmos do .food-glyph do web). */
export function glyphColors(tone: GlyphTone, colors: ThemeColors, domain: DomainTones): { bg: string; fg: string; border: string } {
  switch (tone) {
    case "amber":
      return { bg: colors.amber50, fg: colors.amber700, border: colors.amber200 };
    case "mint":
      return { bg: colors.mint50, fg: colors.green700, border: colors.mint200 };
    case "sky":
      return { bg: colors.sky50, fg: colors.sky700, border: colors.sky100 };
    case "indigo":
      return { bg: colors.indigo50, fg: colors.indigo700, border: domain.body.border };
    case "mind":
      return domain.mind;
    default:
      return { bg: colors.surface3, fg: colors.text2, border: colors.borderSoft };
  }
}

type Props = {
  /** Emoji do alimento/refeição (@shared/lib/food-glyph); null/ausente usa o ícone. */
  glyph?: string | null;
  /** Ícone lucide de reserva (ex.: o da refeição). */
  icon?: LucideIcon;
  size?: GlyphSize;
  tone?: GlyphTone;
  shape?: "tile" | "circle";
  /** Borda de 1 px no tom (grupo do Diário, item da Dieta). */
  bordered?: boolean;
  /** Anel da cor do cartão (pilha de emojis). */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Bloco com o emoji do alimento (ou um ícone), FoodGlyph do web. Sempre decorativo: o texto ao lado diz o que é. */
export function FoodGlyph({ glyph, icon: Icon, size = 44, tone = "surface", shape = "tile", bordered = false, ring = false, style, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const t = glyphColors(tone, colors, themeDomainTone(scheme));
  const emoji = EMOJI_PX[size];
  return (
    <View
      {...HIDDEN}
      testID={testID}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: shape === "circle" ? size / 2 : Math.round(size * 0.32),
          backgroundColor: t.bg,
        },
        bordered && { borderWidth: 1, borderColor: t.border },
        ring && { boxShadow: `0px 0px 0px 2px ${colors.surface}` },
        style,
      ]}
    >
      {glyph ? (
        <AppText size={emoji} lineHeight={Math.round(emoji * 1.2)} align="center" maxFontSizeMultiplier={1}>
          {glyph}
        </AppText>
      ) : Icon ? (
        <Icon size={ICON_PX[size]} color={t.fg} />
      ) : null}
    </View>
  );
}

/** Até 3 emojis sobrepostos (refeição recolhida da Dieta), cada um num círculo com anel. */
export function GlyphStack({ glyphs, size = 34 }: { glyphs: readonly string[]; size?: GlyphSize }) {
  const styles = useStyles();
  const shown = glyphs.slice(0, 3);
  if (!shown.length) return null;
  return (
    <View {...HIDDEN} style={styles.stack}>
      {shown.map((glyph, i) => (
        <FoodGlyph key={`${glyph}-${i}`} glyph={glyph} size={size} shape="circle" ring style={i > 0 ? (size === 28 ? styles.overlapTight : styles.overlap) : undefined} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  tile: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stack: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  overlap: { marginLeft: -10 },
  /** Pilha de 28 px (Dieta recolhida): sobreposição de 12 px, como o web. */
  overlapTight: { marginLeft: -12 },
}));
