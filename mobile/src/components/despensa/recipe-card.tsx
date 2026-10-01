import { LinearGradient } from "expo-linear-gradient";
import { Apple, Check, ChefHat, Clock, Coffee, Moon, Plus, Users, UtensilsCrossed, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { plural } from "@shared/lib/format";
import { pantryEmoji } from "@shared/lib/pantry-view";
import {
  coverageCount,
  fmtMinutes,
  RECIPE_ALL_HOME,
  recipeCoverage,
  recipeEmoji,
  recipeMissingPill,
  recipeSeal,
  recipeSealLabel,
} from "@shared/lib/recipe-set";
import { mergeSuggestions, recipeShoppingSuggestions, shoppingKey } from "@shared/lib/shopping-list";
import { visiblePlainText } from "@shared/lib/text";
import type { PantryItem, RecipeCard as Card } from "@shared/types";
import { AppText, Button, SegmentMeter } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { RecipeSheet } from "./recipe-sheet";
import { ShoppingSuggestSheet } from "./shopping-suggest-sheet";

const MEAL_ICON: Record<string, LucideIcon> = {
  "Café da manhã": Coffee,
  Almoço: UtensilsCrossed,
  Lanche: Apple,
  Jantar: Moon,
  Ceia: Moon,
};
/** Topo do cartão pela refeição: almoço âmbar→menta, jantar/ceia menta→céu. */
const isEvening = (meal: string) => meal === "Jantar" || meal === "Ceia";
/** Emojis pequenos em volta do prato (decorativos): os itens da casa, sem repetir o do prato. */
const MAX_SIDE_GLYPHS = 3;
const HERO_HEIGHT = 96;
/** O prato: círculo claro de 112 px com um halo de 10 px, centrado um pouco abaixo do meio (como o web). */
const PLATE = 112;
const HALO = 10;
const PLATE_CENTER_Y = HERO_HEIGHT / 2 + PLATE * 0.04;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;
/** No web o nome completo vem do aria-label de uma imagem; no aparelho, do elemento acessível. */
const LABELLED = Platform.OS === "web" ? ({ role: "img" } as const) : ({ accessible: true } as const);
/** Posições dos emojis pequenos em volta do prato (as do web: 34 %/54 px, 64 %/50 px e 22 px da direita/58 px). */
const SIDE_SPOTS = [
  { top: 54, left: "34%" },
  { top: 50, left: "64%" },
  { top: 58, right: 22 },
] as const;

function sideGlyphs(card: Card, dish: string): string[] {
  const glyphs = card.ingredientesCasa.map((item) => pantryEmoji(item.nome));
  return [...new Set(glyphs)].filter((glyph) => glyph !== dish).slice(0, MAX_SIDE_GLYPHS);
}

/**
 * "+ Lista": o que falta desta receita e ainda não está na lista vai para a folha de sugestões; tudo já na lista →
 * "Na lista". Sem nada a comprar (ou receita antiga), nada aparece.
 */
function RecipeListButton({ card, name, hide, today }: { card: Card; name: string; hide: boolean; today: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const [isOpen, setOpen] = useState(false);
  const keys = new Set(card.faltaComprar.map((item) => shoppingKey(item.nome)));
  const own = recipeShoppingSuggestions(state, today, hide).filter((s) => keys.has(s.key));
  if (!own.length) return null;
  const pending = mergeSuggestions(state.shoppingList, [own]);
  return (
    <>
      {pending.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lista: incluir o que falta de ${name}`}
          onPress={() => setOpen(true)}
          style={styles.listTarget}
        >
          {({ pressed }) => (
            <View style={[styles.listBtn, pressed && styles.listPressed]}>
              <Plus size={16} color={colors.green700} />
              <AppText heading size={fontSize.sm} weight={700} color={colors.green700}>
                Lista
              </AppText>
            </View>
          )}
        </Pressable>
      ) : (
        <View style={styles.listBtn}>
          <Check size={16} color={colors.green700} />
          <AppText heading size={fontSize.sm} weight={700} color={colors.green700}>
            Na lista
          </AppText>
        </View>
      )}
      <ShoppingSuggestSheet visible={isOpen} preset={pending} onClose={() => setOpen(false)} />
    </>
  );
}

/** O prato do topo: halo e disco claros (opacidade, sem rgba) e o emoji por cima, sem esmaecer. */
function Plate({ dish }: { dish: string }) {
  const styles = useStyles();
  return (
    <>
      <View style={[styles.circle, styles.halo]} {...HIDDEN} />
      <View style={[styles.circle, styles.disc]} {...HIDDEN} />
      <View style={[styles.circle, styles.dish]} {...HIDDEN}>
        <AppText size={fontSize["6xl"]} lineHeight={50} maxFontSizeMultiplier={1}>
          {dish}
        </AppText>
      </View>
    </>
  );
}

type Props = {
  card: Card;
  pantry: readonly PantryItem[];
  hide: boolean;
  today: string;
  /** Largura no carrossel. */
  width: number;
};

/**
 * Cartão de uma receita estruturada (conceito 06): topo com o prato e os selos, tempo e porções, "8 de 9 ingredientes
 * em casa" com a barra de segmentos, o que falta e "Modo preparo". A IA devolve dados; o app desenha emoji, cobertura
 * e selo (básicos marcados contam como em casa).
 */
export function RecipeCard({ card, pantry, hide, today, width }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const [isOpen, setOpen] = useState(false);
  // Um nome mascarado para o título, o botão, o painel e o nome acessível do cartão.
  const name = visiblePlainText(card.nome, hide);
  const coverage = recipeCoverage(card, pantry, today, state.kitchenBasics);
  const seal = recipeSeal(card, pantry, today);
  const missing = recipeMissingPill(card);
  const dish = recipeEmoji(card);
  const MealIcon = MEAL_ICON[card.refeicao] ?? UtensilsCrossed;
  const sealName = seal ? visiblePlainText(seal.itemName, hide) : "";
  return (
    <View role="article" accessibilityLabel={name} testID="recipe-card" style={[styles.card, { width }]}>
      <View style={styles.hero}>
        <LinearGradient
          colors={isEvening(card.refeicao) ? [colors.mint50, colors.sky50] : [colors.amber50, colors.mint50]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFill}
        />
        <Plate dish={dish} />
        {sideGlyphs(card, dish).map((glyph, i) => (
          <View key={glyph} style={[styles.side, SIDE_SPOTS[i]]} {...HIDDEN}>
            <AppText size={i === 2 ? fontSize.lg : fontSize.xl} lineHeight={24} maxFontSizeMultiplier={1}>
              {glyph}
            </AppText>
          </View>
        ))}
        <View style={styles.mealChip}>
          <MealIcon size={16} color={colors.green700} />
          <AppText size={fontSize.sm} weight={700} lineHeight={16}>
            {card.refeicao}
          </AppText>
        </View>
        {seal ? (
          <View
            {...LABELLED}
            accessibilityLabel={`Usa ${sealName}, que ${seal.pill.full.toLocaleLowerCase("pt-BR")}`}
            testID="recipe-seal"
            style={styles.seal}
          >
            <Clock size={15} color={colors.onFillAmber} />
            <AppText size={fontSize.sm} weight={800} color={colors.onFillAmber} lineHeight={16} numberOfLines={1} style={styles.shrink}>
              {recipeSealLabel(sealName)}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <AppText heading size={fontSize.lg} weight={800} lineHeight={21} numberOfLines={2} accessibilityRole="header">
          {name}
        </AppText>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Clock size={16} color={colors.muted} />
            <AppText size={fontSize.sm} weight={600} color={colors.muted}>
              {fmtMinutes(card.tempoMin)}
            </AppText>
          </View>
          <View style={styles.metaItem}>
            <Users size={16} color={colors.muted} />
            <AppText size={fontSize.sm} weight={600} color={colors.muted}>
              {plural(card.porcoes, "porção", "porções")}
            </AppText>
          </View>
        </View>
        <View style={styles.coverage} testID="recipe-coverage">
          <AppText size={fontSize.base} color={colors.text2}>
            <AppText size={fontSize.base} weight={800} color={colors.green700}>
              {coverageCount(coverage)}
            </AppText>
            {` ${coverage.total === 1 ? "ingrediente" : "ingredientes"} em casa`}
          </AppText>
          <SegmentMeter value={coverage.have} total={coverage.total} missing={coverage.total - coverage.have} size="lg" />
        </View>
        <View style={styles.missingRow}>
          {missing ? (
            <View style={styles.missing}>
              <AppText size={fontSize.sm} weight={700} color={colors.amber900} numberOfLines={1} style={styles.shrink}>
                {visiblePlainText(missing.text, hide)}
                {missing.isOptional ? (
                  <AppText size={fontSize.xs} weight={600} color={colors.amber700}>
                    {" · opcional"}
                  </AppText>
                ) : null}
                {missing.more > 0 ? (
                  <AppText size={fontSize.xs} weight={600} color={colors.amber700}>
                    {` +${missing.more}`}
                  </AppText>
                ) : null}
              </AppText>
            </View>
          ) : (
            <AppText size={fontSize.sm} weight={700} color={colors.green700}>
              {RECIPE_ALL_HOME}
            </AppText>
          )}
          {missing ? <RecipeListButton card={card} name={name} hide={hide} today={today} /> : null}
        </View>
        <Button label="Modo preparo" accessibilityLabel={`Modo preparo: ${name}`} icon={ChefHat} wide onPress={() => setOpen(true)} />
      </View>
      <RecipeSheet visible={isOpen} card={card} name={name} coverage={coverage} hide={hide} onClose={() => setOpen(false)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
    boxShadow: shadows.card,
  },
  hero: { height: HERO_HEIGHT, overflow: "hidden" },
  circle: {
    position: "absolute",
    left: "50%",
    width: PLATE,
    height: PLATE,
    marginLeft: -PLATE / 2,
    top: PLATE_CENTER_Y - PLATE / 2,
    borderRadius: PLATE / 2,
  },
  halo: {
    width: PLATE + HALO * 2,
    height: PLATE + HALO * 2,
    marginLeft: -(PLATE / 2 + HALO),
    top: PLATE_CENTER_Y - PLATE / 2 - HALO,
    borderRadius: PLATE / 2 + HALO,
    backgroundColor: colors.surface,
    opacity: 0.22,
  },
  disc: { backgroundColor: colors.surface, opacity: 0.55 },
  dish: { alignItems: "center", justifyContent: "center" },
  side: { position: "absolute" },
  mealChip: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  seal: {
    position: "absolute",
    bottom: 10,
    left: 10,
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.amber500,
  },
  shrink: { flexShrink: 1 },
  body: { gap: 10, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4, marginTop: -4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  coverage: { gap: 8, marginTop: 2 },
  missingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  missing: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.amber200,
    backgroundColor: colors.amber50,
  },
  /** "+ Lista": 30 px à vista, alvo de 44 px (margens negativas, sem crescer a linha). */
  listTarget: { minHeight: 44, marginVertical: -7, justifyContent: "center" },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.mint50,
  },
  listPressed: { backgroundColor: colors.mint100 },
}));
