import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone, type Domain } from "@/theme/tokens";
import { Button } from "./button";
import { IconTile } from "./icon-tile";
import { AppText } from "./text";

export type ShortcutSecondary = {
  label: string;
  /** Nome acessível quando o rótulo é curto ("Registrar" → "Conferir e registrar: Almoço"); deve contê-lo. */
  accessibilityLabel?: string;
  onPress: () => void;
};

type Props = {
  icon: LucideIcon;
  tone: Domain;
  /** Título (tile: 1 linha 15 px 800; row: 17 px). Sem título, o texto ocupa o lugar. */
  title?: string;
  /** Apoio (14 px cinza): "2 vencem logo", "Próxima refeição · Almoço · 12:00". */
  text?: string;
  /** Linhas do texto antes de cortar com "…". */
  lines?: 1 | 2;
  /** Ponto colorido antes do texto (ex.: validade perto, âmbar). */
  dot?: Domain;
  /** Ação do atalho inteiro (o cartão todo é tocável). */
  onPress: () => void;
  /** Nome acessível do atalho inteiro (padrão: o título, ou o texto). */
  accessibilityLabel?: string;
  /** Segunda ação, acima do toque do cartão: row = botão antes da seta ("Registrar"); tile = no lugar do texto ("Ver lista (3)"). */
  secondary?: ShortcutSecondary;
  /** tile: 72 px na grade de 2 colunas · row: linha de 72 px na largura toda, com seta. */
  layout?: "tile" | "row";
  /** Sem fundo nem sombra: a linha fica dentro de outro cartão (a despensa do Hoje, com o "Use primeiro" embaixo). */
  isFlat?: boolean;
  /** Grade de 2 colunas da Dieta (conceito 04): 10 px entre ícone e texto e apoio em 13 px ("2 vencem logo" cabe). */
  isDense?: boolean;
  testID?: string;
};

/**
 * Atalho com ícone no tom do domínio (ShortcutTile do web): "Para facilitar" da Dieta, linhas compactas do Hoje.
 * Um botão cobre o cartão (o título continua cabeçalho) e a segunda ação fica por cima dele.
 */
/** Abaixo desta largura a linha perde a seta (o cartão todo continua tocável), como o @media 359px do web. */
const NARROW_BELOW_WIDTH = 360;

export function ShortcutTile({ icon, tone, title, text, lines = 1, dot, onPress, accessibilityLabel, secondary, layout = "tile", isFlat = false, isDense = false, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const isRow = layout === "row";
  const isNarrow = useWindowDimensions().width < NARROW_BELOW_WIDTH;
  const showSecondaryInText = !isRow && !!secondary;
  return (
    <View style={[styles.tile, !isFlat && styles.surface, isRow && styles.row, isRow && isNarrow && styles.rowNarrow, isDense && styles.dense]} testID={testID}>
      <IconTile tone={tone} size={isRow ? "lg" : "md"} icon={icon} />
      <View style={styles.text} pointerEvents="box-none">
        {title ? (
          <View pointerEvents="none">
            <AppText heading size={isRow ? fontSize.lg : fontSize.md} weight={800} numberOfLines={1} lineHeight={isRow ? 22 : 20} accessibilityRole="header">
              {title}
            </AppText>
          </View>
        ) : null}
        {showSecondaryInText ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary.accessibilityLabel ?? secondary.label}
            onPress={secondary.onPress}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <AppText size={isDense ? fontSize.sm : fontSize.base} weight={700} color={colors.green700} numberOfLines={1}>
              {secondary.label}
            </AppText>
          </Pressable>
        ) : text ? (
          <View pointerEvents="none" style={styles.sub}>
            {dot ? <View style={[styles.dot, { backgroundColor: themeDomainTone(scheme)[dot].fg }]} /> : null}
            <AppText size={isDense ? fontSize.sm : fontSize.base} color={colors.muted} numberOfLines={lines} lineHeight={isDense ? 18 : 19} style={styles.shrink}>
              {text}
            </AppText>
          </View>
        ) : null}
      </View>
      {isRow && secondary ? (
        <View style={styles.raised}>
          <Button label={secondary.label} accessibilityLabel={secondary.accessibilityLabel} size="sm" onPress={secondary.onPress} />
        </View>
      ) : null}
      {isRow && !isNarrow ? <ChevronRight size={20} color={colors.muted} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title ?? text}
        onPress={onPress}
        style={({ pressed }) => [StyleSheet.absoluteFill, styles.hit, isRow && styles.hitRow, pressed && styles.hitPressed]}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  /** Cartão próprio (fora de `isFlat`): superfície e sombra de cartão. */
  surface: { backgroundColor: colors.surface, boxShadow: shadows.card },
  row: { borderRadius: radius.lg, paddingRight: 12 },
  rowNarrow: { gap: 10 },
  dense: { gap: 10, paddingLeft: 12, paddingRight: 10 },
  text: { flex: 1, minWidth: 0, gap: 2, zIndex: 2 },
  sub: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  shrink: { flexShrink: 1 },
  /** "Ver lista (3)": alvo de 44 px de altura; a margem negativa mantém o tile em 72 px. */
  link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginVertical: -12 },
  raised: { zIndex: 2, flexShrink: 0 },
  pressed: { opacity: 0.7 },
  /** O botão que cobre o atalho inteiro, abaixo da segunda ação. */
  hit: { borderRadius: 20, zIndex: 1 },
  hitRow: { borderRadius: radius.lg },
  hitPressed: { backgroundColor: colors.pressedInk },
}));
