import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { useId, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Tone } from "@shared/lib/today";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, horizontal, radius, shadows } from "@/theme/tokens";
import { FoodGlyph, GlyphStack } from "./food-glyph";
import { KcalStat } from "./kcal-stat";
import { MacroBar, type MacroShare } from "./macro-bar";
import { AppText } from "./text";

/** Tom da refeição no cartão: café âmbar, almoço menta, lanche azul-claro, jantar/ceia índigo. */
export type MealCardTone = "amber" | "mint" | "sky" | "indigo";

/** mealTone(entry) (@shared/lib/today) → tom do cartão. Lanche fica azul (rosa é só para erro). */
export function mealCardTone(tone: Tone): MealCardTone {
  return tone === "amber" ? "amber" : tone === "emerald" ? "mint" : tone === "sky" ? "sky" : "indigo";
}

type Props = {
  /**
   * card: linha do Hoje (cartão inteiro edita, com barra P/C/G e kcal empilhada).
   * slot: refeição ainda vazia, tracejada, com a ação em `trailing` (ou o cartão todo com onPress).
   * group: grupo do Diário (cabeçalho com subtotal e "+" em `trailing`; as linhas em `children`).
   * collapsed / open: refeição do plano na Dieta (recolhida com a pilha de emojis; aberta com os itens).
   */
  variant: "card" | "slot" | "group" | "collapsed" | "open";
  title: string;
  subtitle?: ReactNode;
  /** Linha extra sob o subtítulo (Dieta: "≈ 180 kcal · 9 g proteína"). */
  meta?: ReactNode;
  glyph?: string | null;
  /** collapsed: até 3 emojis sobrepostos. */
  glyphs?: readonly string[];
  /** Ícone da refeição (reserva do emoji e ícone do slot/grupo). */
  icon?: LucideIcon;
  tone: MealCardTone;
  /** Barra P/C/G (card: sob o subtítulo; open: antes do rodapé). */
  share?: MacroShare | null;
  /** Nome acessível da barra (sem ele, decorativa). */
  shareLabel?: string;
  /** kcal do registro/TACO; null ou ausente = sem número (hideCalories, perfil sensível). */
  kcal?: number | null;
  kcalApprox?: boolean;
  /** Selo no canto (Dieta: "● Próxima", "✓ Feita às 12:41"). */
  badge?: ReactNode;
  /** Controle à direita (grupo "+", pílula "+ Adicionar", "Registrar", menu ⋯). Fica acima do toque do cartão. */
  trailing?: ReactNode;
  /** O cartão inteiro vira um botão (card, slot compacto). Precisa de pressLabel. */
  onPress?: () => void;
  pressLabel?: string;
  /** collapsed/open: o cabeçalho abre e fecha o corpo (aria-expanded). */
  isExpanded?: boolean;
  onToggle?: () => void;
  /** next: borda menta e halo (próxima refeição); done: fundo menta suave (feita). */
  emphasis?: "next" | "done" | null;
  children?: ReactNode;
  footer?: ReactNode;
  testID?: string;
  /** slot compacto: meia largura (Diário), bloco 40. */
  compact?: boolean;
  /** Vaga da linha do tempo do Hoje: bloco 40, 12 px de respiro e 10 px entre as colunas (cabe "sugerido às 19:30"). */
  dense?: boolean;
  /** Linhas do título antes das reticências (2 na linha do tempo em telas estreitas). */
  titleLines?: 1 | 2;
  /** false tira o bloco do ícone (vaga de meia largura em tela estreita, onde nome e ação ocupam a largura). */
  showTile?: boolean;
  /** O selo vai na linha do título e a meta passa por baixo dele (a próxima refeição da Dieta). */
  badgeInTitle?: boolean;
};

/** Texto vira uma linha cinza de 14 px (13 no plano da Dieta); um nó (horário + barra, chips) vai como veio. */
function Line({ children, lines, isSmall = false }: { children: ReactNode; lines?: number; isSmall?: boolean }) {
  const colors = useThemeColors();
  if (typeof children !== "string") return <>{children}</>;
  return (
    <AppText size={isSmall ? fontSize.sm : fontSize.base} color={colors.muted} numberOfLines={lines} lineHeight={isSmall ? 18 : 20}>
      {children}
    </AppText>
  );
}

/**
 * Cartão de refeição compartilhado (MealCard do web): Hoje, Diário e Dieta. Números só do registro ou da TACO;
 * nada de vermelho para "acima". Quando o cartão inteiro é tocável, um botão cobre o cartão (o título continua
 * um cabeçalho) e `trailing`/`badge` ficam por cima dele; o texto deixa o toque passar.
 */
export function MealCard({
  variant,
  title,
  subtitle,
  meta,
  glyph,
  glyphs,
  icon,
  tone,
  share,
  shareLabel,
  kcal,
  kcalApprox = false,
  badge,
  trailing,
  onPress,
  pressLabel,
  isExpanded,
  onToggle,
  emphasis,
  children,
  footer,
  testID,
  compact = false,
  dense = false,
  titleLines = 1,
  showTile = true,
  badgeInTitle = false,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const bodyId = `meal-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const isPlan = variant === "collapsed" || variant === "open";
  const isToggleable = isPlan && !!onToggle;
  const hasKcal = kcal !== null && kcal !== undefined;
  const hasBody = !!children || (variant === "open" && !!share) || !!footer;
  const tileSize = variant === "open" || variant === "group" || compact || dense ? 40 : 44;
  const tile =
    variant === "collapsed" && glyphs?.length ? (
      <GlyphStack glyphs={glyphs} size={28} />
    ) : (
      <FoodGlyph
        glyph={variant === "slot" || variant === "group" ? null : glyph}
        icon={icon}
        size={tileSize}
        tone={variant === "collapsed" ? "surface" : tone}
        bordered={variant === "group" || variant === "slot"}
      />
    );
  const titleText = (
    <AppText
      heading
      size={isPlan ? fontSize.md : fontSize.lg}
      weight={variant === "slot" && compact ? 700 : 800}
      numberOfLines={titleLines}
      lineHeight={isPlan ? 20 : 22}
      accessibilityRole="header"
      style={badgeInTitle ? styles.titleFlex : undefined}
    >
      {isToggleable ? (
        // Como o <h3><button> do web: o título continua cabeçalho e o botão de abrir/fechar fica dentro dele.
        // Text puro (não AppText) para herdar a fonte, o tamanho e o peso do título.
        <Text
          accessibilityRole="button"
          accessibilityState={{ expanded: !!isExpanded }}
          {...webAttrs({ "aria-expanded": !!isExpanded, "aria-controls": hasBody ? bodyId : undefined })}
          onPress={onToggle}
        >
          {title}
        </Text>
      ) : (
        title
      )}
    </AppText>
  );
  // Recolhido: o corpo some (no web fica no DOM com hidden); aberto, aparece com os itens e o rodapé.
  const isBodyShown = hasBody && !(isToggleable && !isExpanded);
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        variant !== "slot" && styles.raisedCard,
        variant === "card" && styles.isCard,
        variant === "slot" && (compact ? [styles.slot, styles.slotCompact] : styles.slot),
        dense && styles.dense,
        variant === "collapsed" && styles.collapsed,
        variant === "open" && styles.open,
        emphasis === "next" && styles.next,
      ]}
    >
      {emphasis === "done" ? (
        <LinearGradient
          colors={[colors.mint50, colors.surface]}
          start={horizontal.start}
          end={horizontal.end}
          style={[StyleSheet.absoluteFill, styles.doneFill, variant === "collapsed" && styles.collapsedRadius]}
        />
      ) : null}
      <View style={[styles.head, isToggleable && styles.headToggle, (dense || variant === "collapsed") && styles.headDense]} pointerEvents="box-none">
        {isToggleable ? (
          // O toque no cabeçalho inteiro (o ::after do web): só para o dedo; o leitor de tela usa o botão do título.
          <Pressable
            onPress={onToggle}
            accessible={false}
            importantForAccessibility="no"
            {...webAttrs({ tabIndex: -1 })}
            aria-hidden
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {showTile && <View pointerEvents="none">{tile}</View>}
        <View style={styles.text} pointerEvents={isToggleable ? "box-none" : "none"}>
          {badgeInTitle && badge ? (
            <View style={styles.titleRow}>
              {titleText}
              <View style={styles.raised}>{badge}</View>
            </View>
          ) : (
            titleText
          )}
          {/* O resto do texto deixa o toque passar (para o cartão ou para o cabeçalho que abre e fecha). */}
          <View style={styles.textRest} pointerEvents="none">
            {subtitle ? <Line lines={1} isSmall={isPlan}>{subtitle}</Line> : null}
            {meta ? <Line isSmall={isPlan}>{meta}</Line> : null}
            {variant === "card" && share ? (
              <View style={styles.bar}>
                <MacroBar share={share} size="md" label={shareLabel} />
              </View>
            ) : null}
          </View>
        </View>
        {hasKcal && (variant === "card" || variant === "group") ? (
          <View pointerEvents="none">
            <KcalStat value={kcal} approx={kcalApprox} layout={variant === "card" ? "stack" : "inline"} />
          </View>
        ) : null}
        {badge && !badgeInTitle ? <View style={styles.raised}>{badge}</View> : null}
        {trailing ? <View style={[styles.raised, styles.trailing]}>{trailing}</View> : null}
      </View>
      {isBodyShown ? (
        <View nativeID={bodyId} style={[styles.body, variant === "group" && styles.groupBody]}>
          {children}
          {variant === "open" && share ? <MacroBar share={share} size="lg" label={shareLabel} /> : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      ) : null}
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pressLabel ?? title}
          onPress={onPress}
          style={({ pressed }) => [StyleSheet.absoluteFill, styles.hit, variant === "collapsed" && styles.collapsedRadius, pressed && styles.hitPressed]}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { minWidth: 0, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg },
  /** Superfície com a sombra de cartão (todas as variantes menos a vaga tracejada). */
  raisedCard: { backgroundColor: colors.surface, boxShadow: shadows.card },
  isCard: { minHeight: 74, justifyContent: "center" },
  /** Vaga: tracejada, sem fundo nem sombra; a ação vem em `trailing` (ou o cartão todo, no compacto). */
  slot: {
    minHeight: 64,
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.slate300,
  },
  slotCompact: { minHeight: 66, borderRadius: 20, padding: 12 },
  /** 10 px nas laterais (12 no web): com a fonte do app, "sugerido às 19:30" cabe numa linha ao lado do "+ Adicionar". */
  dense: { paddingVertical: 12, paddingHorizontal: 10 },
  headDense: { gap: 10 },
  collapsed: { minHeight: 56, justifyContent: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.card, overflow: "hidden" },
  /** Aberta (Dieta): 14 px de respiro, como o web. */
  open: { padding: 14 },
  collapsedRadius: { borderRadius: radius.card },
  doneFill: { borderRadius: radius.lg },
  /** Próxima refeição: borda menta de 2 px, halo de 6 px e a sombra do cartão. */
  next: { borderWidth: 2, borderColor: colors.mint300, boxShadow: `0px 0px 0px 6px ${colors.mint50}, ${shadows.card}` },
  head: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0, zIndex: 2 },
  headToggle: { minHeight: 44 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  titleFlex: { flex: 1, minWidth: 0 },
  textRest: { minWidth: 0, gap: 4 },
  bar: { marginTop: 4 },
  raised: { zIndex: 2, flexShrink: 0 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 8 },
  body: { gap: 10, marginTop: 12, zIndex: 2 },
  groupBody: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  /** O botão que cobre o cartão inteiro, abaixo de `trailing`/`badge` e do corpo. */
  hit: { borderRadius: radius.lg, zIndex: 1 },
  hitPressed: { backgroundColor: colors.pressedInk },
}));
