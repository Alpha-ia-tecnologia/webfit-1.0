import { LinearGradient } from "expo-linear-gradient";
import { CalendarClock, ChefHat, Clock } from "lucide-react-native";
import type { Ref } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { compactExpiry, pantryEmoji } from "@shared/lib/pantry-view";
import { USE_FIRST_COPY, USE_FIRST_REMINDER, type UseFirstChip, type UseFirstModel } from "@shared/lib/use-first";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { diagonalDown, fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";

const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;
/** Duas colunas de blocos quando cabem 2 × 140 px (a grade auto-fill do web); abaixo disso, uma. */
const TWO_COLUMNS_FROM = 354;

/** Chips do "Use primeiro" no Hoje: emoji, nome e "vence em 2 d"; o leitor de tela ouve a data completa. */
function UseFirstChips({ model }: { model: UseFirstModel }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const warn = themeDomainTone(scheme).warn;
  return (
    <View role="list" aria-label={USE_FIRST_COPY.listLabel} style={styles.chips}>
      {model.chips.map((chip) => (
        <View key={chip.id} role="listitem" testID="use-first-chip" style={styles.chip}>
          <View style={styles.chipLook} aria-hidden importantForAccessibility="no-hide-descendants">
            <AppText size={fontSize.md} lineHeight={18} accessibilityElementsHidden>
              {pantryEmoji(chip.name)}
            </AppText>
            <AppText size={fontSize.sm} weight={700} color={colors.text} numberOfLines={1} style={styles.chipName}>
              {chip.name}
            </AppText>
            <AppText size={fontSize.xs} weight={700} color={warn.fg} numberOfLines={1}>
              {chip.short}
            </AppText>
          </View>
          <AppText style={srOnly}>{chip.aria}</AppText>
        </View>
      ))}
      {model.more > 0 ? (
        <View role="listitem" testID="use-first-more" style={[styles.chip, styles.more]}>
          <AppText size={fontSize.sm} weight={700} color={colors.text2} aria-hidden>
            {USE_FIRST_COPY.more(model.more)}
          </AppText>
          <AppText style={srOnly}>{USE_FIRST_COPY.moreLabel(model.more)}</AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Um bloco do que vence: emoji, "⏱ 2 dias" no canto e o nome; o leitor de tela ouve a frase completa. */
function UseFirstTile({ chip, today }: { chip: UseFirstChip; today: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" testID="use-first-chip" style={styles.tile}>
      <View style={styles.tileLook} {...HIDDEN}>
        <View style={styles.tileTop}>
          <View style={styles.tileGlyph}>
            <AppText size={fontSize.xl} lineHeight={24} maxFontSizeMultiplier={1}>
              {pantryEmoji(chip.name)}
            </AppText>
          </View>
          <View style={styles.tileWhen}>
            <Clock size={14} color={colors.amber900} />
            <AppText size={fontSize.xs} weight={700} color={colors.amber900} lineHeight={16} numberOfLines={1}>
              {compactExpiry(chip.expiresOn, today)}
            </AppText>
          </View>
        </View>
        <AppText heading size={fontSize.base} weight={700} numberOfLines={1}>
          {chip.name}
        </AppText>
      </View>
      <AppText style={srOnly}>{chip.aria}</AppText>
    </View>
  );
}

type CardProps = {
  model: UseFirstModel;
  today: string;
  /** Título que recebe o foco quando o Hoje abre a Despensa aqui ("Receitas com eles"). */
  headingRef?: Ref<View>;
  /** Posição do cartão na rolagem da tela (o aparelho rola até ele no "Receitas com eles"). */
  onLayout?: (event: LayoutChangeEvent) => void;
  canCreate: boolean;
  /** Por que não dá para criar receitas agora (sem dieta, revisão aberta…); vazio = pode. Vai como descrição do botão. */
  reason: string;
  onCreate: () => void;
};

/**
 * "Use primeiro" no topo da Despensa (AGENTE-13, conceito 06): cartão âmbar com "Receitas com eles" e um bloco por
 * alimento que vence nos próximos 3 dias, pela validade que a pessoa informou. Tom de "confira antes de usar", nunca
 * alarme nem vermelho. A frase e "A validade é a que você informou." ficam para o leitor de tela.
 */
export function UseFirstCard({ model, today, headingRef, onLayout, canCreate, reason, onCreate }: CardProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const columns = width >= TWO_COLUMNS_FROM ? 2 : 1;
  const isNarrow = width < 360;
  const isDisabled = !canCreate || !!reason;
  const tiles = [
    ...model.chips.map((chip) => <UseFirstTile key={chip.id} chip={chip} today={today} />),
    ...(model.more > 0
      ? [
          <View key="more" role="listitem" testID="use-first-more" style={[styles.tile, styles.moreTile]}>
            <AppText heading size={fontSize.lg} weight={800} color={colors.text2} aria-hidden>
              {USE_FIRST_COPY.more(model.more)}
            </AppText>
            <AppText style={srOnly}>{USE_FIRST_COPY.moreLabel(model.more)}</AppText>
          </View>,
        ]
      : []),
  ];
  const rows = Array.from({ length: Math.ceil(tiles.length / columns) }, (_, i) => tiles.slice(i * columns, i * columns + columns));
  return (
    <View testID="use-first-card" onLayout={onLayout} style={styles.hero}>
      <LinearGradient
        colors={[colors.amber50, colors.surface]}
        start={diagonalDown.start}
        end={diagonalDown.end}
        style={[StyleSheet.absoluteFill, styles.heroFill]}
      />
      <View style={[styles.heroHead, isNarrow && styles.heroHeadNarrow]}>
        <View style={styles.heroTitle}>
          <View ref={headingRef} collapsable={false} accessible role="heading" {...webAttrs({ tabIndex: -1 })} style={styles.headingBox}>
            <AppText heading size={fontSize.lg} weight={800} lineHeight={21}>
              {USE_FIRST_REMINDER.title}
            </AppText>
          </View>
          <AppText size={fontSize.sm} color={colors.muted} lineHeight={18}>
            {USE_FIRST_COPY.window}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={USE_FIRST_COPY.create}
          accessibilityHint={isDisabled && reason ? reason : undefined}
          accessibilityState={{ disabled: isDisabled }}
          disabled={isDisabled}
          onPress={onCreate}
          style={styles.goTarget}
        >
          {({ pressed }) => (
            <View style={[styles.go, pressed && styles.pressed, isDisabled && styles.disabled]}>
              <View>
                <ChefHat size={18} color={colors.onFillSlate} />
              </View>
              <AppText heading size={fontSize.sm} weight={700} color={colors.onFillSlate} numberOfLines={1}>
                {USE_FIRST_COPY.recipes}
              </AppText>
            </View>
          )}
        </Pressable>
      </View>
      <View role="list" aria-label={USE_FIRST_COPY.listLabel} style={styles.tiles}>
        {rows.map((row, i) => (
          <View key={i} style={styles.tileRow}>
            {row}
            {row.length < columns ? <View style={styles.tileSpacer} /> : null}
          </View>
        ))}
      </View>
      <AppText style={srOnly}>{`${model.lead} ${USE_FIRST_COPY.note}`}</AppText>
      {isDisabled && reason ? <AppText style={srOnly}>{reason}</AppText> : null}
    </View>
  );
}

type StripProps = {
  model: UseFirstModel;
  onRecipes: () => void;
  onDismiss: () => void;
};

/**
 * "Use primeiro" dentro do cartão da despensa no Hoje: chips, "Receitas com eles" e "Agora não". O título e os
 * chips já dizem o que vence: a frase fica só para o leitor de tela (densidade do conceito, como o web).
 */
export function UseFirstStrip({ model, onRecipes, onDismiss }: StripProps) {
  const styles = useStyles();
  const { scheme } = useTheme();
  return (
    <View testID="use-first-hoje" style={styles.strip}>
      <View style={styles.stripHead}>
        <CalendarClock size={16} color={themeDomainTone(scheme).warn.fg} />
        <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
          Use primeiro
        </AppText>
      </View>
      <AppText style={srOnly}>{model.lead}</AppText>
      <UseFirstChips model={model} />
      <View style={styles.actions}>
        <Button label={USE_FIRST_COPY.recipes} icon={ChefHat} variant="secondary" size="sm" onPress={onRecipes} />
        <Button
          label={USE_FIRST_COPY.dismiss}
          accessibilityLabel={USE_FIRST_COPY.dismissLabel}
          variant="text"
          style={styles.textButton}
          onPress={onDismiss}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  hero: {
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.amber200,
    boxShadow: shadows.card,
  },
  heroFill: { borderRadius: radius.lg },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroHeadNarrow: { flexDirection: "column", alignItems: "stretch" },
  heroTitle: { flexShrink: 1, minWidth: 0, gap: 2 },
  headingBox: { alignSelf: "flex-start" },
  /** Alvo de 44 px; o botão escuro visível tem 36 px, como no conceito. */
  goTarget: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  go: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.inverse,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.5 },
  tiles: { gap: 8 },
  tileRow: { flexDirection: "row", gap: 8 },
  tileSpacer: { flex: 1 },
  tile: {
    flex: 1,
    minWidth: 0,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 18,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  tileLook: { gap: 6 },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  tileGlyph: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.amber50,
    alignItems: "center",
    justifyContent: "center",
  },
  tileWhen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.amber100,
  },
  moreTile: { alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    paddingVertical: 6,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: themeDomainTone(scheme).warn.bg,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).warn.border,
  },
  chipLook: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 1 },
  more: { backgroundColor: colors.surface2, borderColor: colors.surface2, paddingLeft: 12 },
  chipName: { flexShrink: 1 },
  strip: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  stripHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 8 },
  textButton: { minWidth: 44, paddingHorizontal: 6 },
}));
