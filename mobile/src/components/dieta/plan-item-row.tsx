import { ArrowLeftRight, Salad } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { allergenIn } from "@shared/lib/allergens";
import { PLAN_DAY_COPY } from "@shared/lib/diet-week";
import { glyphForFood, glyphForName } from "@shared/lib/food-glyph";
import { fmtNumber } from "@shared/lib/format";
import type { ResolvedItem } from "@shared/lib/taco-match";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, FoodGlyph } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { AllergenBadge } from "./planned-items";

type Props = {
  entry: ResolvedItem;
  /** Trocas revisadas do item (o texto do plano). */
  swaps: readonly string[];
  /** "no lugar de arroz branco cozido": o item trocado no dia. */
  replaces?: string;
  allergyTokens: readonly string[];
  /** Gramas ao lado da medida caseira (nunca em perfil calmo ou sensível). */
  showGrams: boolean;
  isFirst: boolean;
};

/**
 * Item do plano na refeição aberta (PlanItemRow do web): emoji, nome, medida caseira em destaque e as gramas em
 * segundo plano; "⇄ Trocar" só quando há trocas revisadas (abre a lista, sem IA). Os números nutricionais
 * ficam na barra da refeição (TACO), nunca aqui.
 */
export function PlanItemRow({ entry, swaps, replaces, allergyTokens, showGrams, isFirst }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const { item, food, status } = entry;
  const glyph = (food ? glyphForFood(food) : null) ?? glyphForName(item.alimento);
  const grams = showGrams && item.gramas ? `${fmtNumber(item.gramas)} g` : null;
  const toggle = () => {
    selectionHaptic();
    setOpen(!isOpen);
  };
  return (
    <View role="listitem" style={[styles.item, !isFirst && styles.divider]}>
      <View style={styles.row}>
        <FoodGlyph glyph={glyph} icon={Salad} size={34} bordered />
        <View style={styles.text}>
          <AppText size={fontSize.md} weight={700} lineHeight={20}>
            {item.alimento}
          </AppText>
          {item.medidaCaseira || grams ? (
            <AppText size={fontSize.sm} color={colors.muted} lineHeight={18} style={styles.tabular}>
              {item.medidaCaseira ? (
                <AppText size={fontSize.sm} weight={700} color={colors.text2}>
                  {item.medidaCaseira}
                </AppText>
              ) : null}
              {item.medidaCaseira && grams ? " · " : ""}
              {grams}
            </AppText>
          ) : null}
          {replaces || status === "allergen" ? (
            <View style={styles.tags}>
              {replaces ? (
                <View style={styles.swapTag}>
                  <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                    {PLAN_DAY_COPY.swapTag(replaces)}
                  </AppText>
                </View>
              ) : null}
              {status === "allergen" ? <AllergenBadge /> : null}
            </View>
          ) : null}
        </View>
        {swaps.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PLAN_DAY_COPY.itemSwapLabel(item.alimento, swaps.length)}
            accessibilityState={{ expanded: isOpen }}
            {...webAttrs({ "aria-expanded": isOpen })}
            onPress={toggle}
            style={styles.swapHit}
          >
            {({ pressed }) => (
              <View style={[styles.swap, isOpen && styles.swapOpen, pressed && styles.pressed]}>
                <ArrowLeftRight size={14} color={colors.sky700} />
                <AppText size={fontSize.sm} weight={800} color={colors.sky700}>
                  {PLAN_DAY_COPY.itemSwap}
                </AppText>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
      {swaps.length && isOpen ? (
        <View style={styles.swaps}>
          <AppText size={fontSize.sm} weight={700} color={colors.text2}>
            Troque por:
          </AppText>
          <View role="list" aria-label={`Trocas para ${item.alimento}`} style={styles.swapList}>
            {swaps.map((swap) => (
              <View key={swap} role="listitem" style={styles.swapItem}>
                <AppText size={fontSize.sm} color={colors.text}>
                  {swap}
                </AppText>
                {allergenIn(swap, allergyTokens, "food") ? <AllergenBadge /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  item: { minHeight: 48, paddingVertical: 4, justifyContent: "center", gap: 6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  /** "no lugar de …" quebra a linha dentro da coluna a 320 px em vez de vazar para o lado. */
  swapTag: {
    flexShrink: 1,
    maxWidth: "100%",
    paddingVertical: 1,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  /** "⇄ Trocar": 28 px visíveis, 44 px de toque. */
  swapHit: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  swap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.sky100,
    backgroundColor: colors.sky50,
  },
  swapOpen: { backgroundColor: colors.sky100 },
  pressed: { transform: [{ scale: 0.96 }] },
  swaps: { gap: 4, marginBottom: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  swapList: { gap: 4 },
  swapItem: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 4 },
}));
