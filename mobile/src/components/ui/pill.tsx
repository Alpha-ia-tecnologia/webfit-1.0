import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { srOnly } from "@/components/refeicao/web-a11y";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, mixColors, radius, themeDomainTone, themePillTones, type Domain, type DomainTones, type PillTone, type ThemeColors } from "@/theme/tokens";
import { AppText } from "./text";

type PillProps = {
  label: string;
  tone?: PillTone;
  style?: StyleProp<ViewStyle>;
};

/** .status-pill: situação curta ao lado de um título. */
export function StatusPill({ label, tone = "emerald", style }: PillProps) {
  const styles = useStyles();
  const t = themePillTones(useTheme().scheme)[tone];
  return (
    <View
      style={[
        styles.status,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <AppText size={fontSize["2xs"]} weight={700} color={t.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** .prot-pill: etiqueta compacta de um registro. */
export function TagPill({ label, tone = "emerald", style }: PillProps) {
  const styles = useStyles();
  const t = themePillTones(useTheme().scheme)[tone];
  return (
    <View
      style={[styles.tag, { backgroundColor: t.bg, borderColor: t.border }, style]}
    >
      <AppText size={fontSize["2xs"]} weight={600} color={t.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** .count-pill: contador cinza ao lado de um título. */
export function CountPill({ count }: { count: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.count}>
      <AppText size={fontSize["2xs"]} weight={700} color={colors.muted}>
        {count}
      </AppText>
    </View>
  );
}

type TonePillProps = {
  /** Domínio da cor: neutral (padrão), food, water, warn (validade), danger (só vencido/erro), mind… */
  tone?: Domain;
  /**
   * soft: fundo e borda claros do tom (padrão) · outline: superfície com borda cinza e texto no tom ·
   * solid: preenchido (só food = verde da marca, neutral = azul-marinho), texto claro; nos outros tons vira soft.
   */
  variant?: "soft" | "outline" | "solid";
  icon?: LucideIcon;
  /** Emoji antes do texto (decorativo). */
  emoji?: string;
  /** Texto só para leitores de tela, depois do visível (" que vence em 2 dias"). */
  srText?: string;
  /** sm 28 px (13 px) · md 34 px (14 px). */
  size?: "sm" | "md";
  testID?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type LegacyPillProps = { label: string; style?: StyleProp<ViewStyle> };

/**
 * Pílula de informação (Pill do web; não é botão): kcal/proteína das opções do agente, "O que considerei",
 * validade na despensa, selo da receita, estratégia do plano. `label` sozinho mantém a .pill esmeralda antiga.
 */
export function Pill(props: TonePillProps | LegacyPillProps) {
  if ("label" in props) return <LegacyPill {...props} />;
  return <TonePill {...props} />;
}

/** Texto (AA sobre o fundo do tom), fundo e borda de cada tom, como o .pill-chip do web. */
function pillColors(tone: Domain, colors: ThemeColors, domain: DomainTones): { fg: string; bg: string; border: string } {
  const t = domain[tone];
  switch (tone) {
    case "water":
      return { fg: colors.sky700, bg: t.bg, border: t.border };
    case "food":
      return { fg: colors.green700, bg: t.bg, border: t.border };
    case "habit":
      return { fg: colors.teal700, bg: t.bg, border: t.border };
    case "body":
      return { fg: colors.indigo700, bg: t.bg, border: t.border };
    case "mind":
      return { fg: mixColors(t.fg, colors.text, 0.75), bg: t.bg, border: t.border };
    case "attention":
      return { fg: colors.amber900, bg: colors.amber100, border: colors.amber200 };
    case "danger":
      return { fg: colors.rose700, bg: t.bg, border: t.border };
    case "neutral":
      return { fg: colors.text2, bg: t.bg, border: t.border };
    default:
      return t;
  }
}

function TonePill({ tone = "neutral", variant = "soft", icon: Icon, emoji, srText, size = "sm", testID, children, style }: TonePillProps) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const t = pillColors(tone, colors, themeDomainTone(scheme));
  const solid = variant === "solid" && (tone === "food" || tone === "neutral");
  const isOutline = variant === "outline";
  const bg = solid ? (tone === "food" ? colors.accentFill : colors.inverse) : isOutline ? colors.surface : t.bg;
  const fg = solid ? (tone === "food" ? colors.white : colors.onFillSlate) : t.fg;
  const border = solid ? bg : isOutline ? colors.border : t.border;
  const text = size === "md" ? fontSize.base : fontSize.sm;
  return (
    <View testID={testID} style={[styles.tone, size === "md" ? styles.toneMd : styles.toneSm, { backgroundColor: bg, borderColor: border }, style]}>
      {emoji ? (
        <AppText size={text} lineHeight={Math.round(text * 1.2)} maxFontSizeMultiplier={1} aria-hidden>
          {emoji}
        </AppText>
      ) : null}
      {Icon ? <Icon size={size === "sm" ? 14 : 16} color={fg} /> : null}
      <AppText size={text} weight={700} color={fg} numberOfLines={1} lineHeight={Math.round(text * 1.2)} style={styles.toneText}>
        {children}
      </AppText>
      {srText ? <AppText style={srOnly}>{` ${srText}`}</AppText> : null}
    </View>
  );
}

/** .pill: pílula esmeralda com fonte de título. */
function LegacyPill({ label, style }: LegacyPillProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.pill, style]}>
      <AppText heading size={fontSize["2xs"]} weight={600} color={colors.green700} tracking={0.02}>
        {label}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  status: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  tag: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  count: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  tone: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  toneSm: { minHeight: 28, paddingHorizontal: 10 },
  toneMd: { minHeight: 34, paddingHorizontal: 12 },
  toneText: { flexShrink: 1, fontVariant: ["tabular-nums"] },
  pill: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.mintBorder,
    backgroundColor: colors.mint50,
  },
}));
