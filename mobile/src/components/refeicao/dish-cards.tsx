import { LinearGradient } from "expo-linear-gradient";
import { Plus, Star, Trash2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { mealTotals } from "@shared/lib/domain";
import { onePerCategory } from "@shared/lib/food-categories";
import { fmtNumber, plural } from "@shared/lib/format";
import type { Dish } from "@shared/lib/meals";
import { AppText } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, vertical } from "@/theme/tokens";
import { FoodIcon } from "./food-icon";
import { SectionTitle } from "./food-section";

const TILES_PER_CARD = 3;
const CARD_WIDTH = 172;

type Props = {
  dishes: Dish[];
  hideCalories: boolean;
  busy: boolean;
  /** Prato restaurado pelo "Desfazer": o foco volta para o cartão dele. */
  focusId?: string | null;
  onFocused?: () => void;
  onLoad: (dish: Dish) => void;
  onLogNow: (dish: Dish) => void;
  onRemoveFavorite: (dish: Dish) => void;
  /** Título "Seus pratos" acima (fora do painel do histórico, que já tem o título). */
  showTitle?: boolean;
  /** scroll = carrossel sob a busca; grid = duas colunas no painel do histórico do cabeçalho. */
  layout?: "scroll" | "grid";
};

/**
 * "Seus pratos": cartões que repetem uma refeição. Tocar no cartão carrega os itens para
 * conferir; o "+" registra na hora; favoritos podem ser removidos. Enquanto grava, "+" e
 * "remover" ignoram toques mas continuam focáveis.
 */
export function DishCards({
  dishes,
  hideCalories,
  busy,
  focusId,
  onFocused,
  onLoad,
  onLogNow,
  onRemoveFavorite,
  showTitle = true,
  layout = "scroll",
}: Props) {
  const isGrid = layout === "grid";
  const styles = useStyles();
  const colors = useThemeColors();
  const cards = useRef(new Map<string, View>());
  useEffect(() => {
    if (!focusId) return;
    const card = cards.current.get(focusId);
    if (!card) return;
    focusNode(card);
    onFocused?.();
  }, [focusId, dishes, onFocused]);
  const list = (
        <View style={[styles.list, isGrid && styles.grid]} role="list">
          {dishes.map((dish) => {
            const isFavorite = dish.kind === "favorito";
            const calories = mealTotals(dish.items).calories;
            return (
              <View key={`${dish.kind}-${dish.id}`} style={[styles.card, isGrid && styles.cardGrid, isFavorite && styles.favorite]} role="listitem">
                {isFavorite ? (
                  <LinearGradient
                    colors={[colors.amber50, colors.surface]}
                    locations={[0, 0.7]}
                    start={vertical.start}
                    end={vertical.end}
                    style={[StyleSheet.absoluteFill, styles.fill]}
                  />
                ) : null}
                {/* O cartão inteiro carrega o prato; "+" e "remover" ficam por cima. */}
                <Pressable
                  ref={(node) => {
                    if (node) cards.current.set(dish.id, node);
                    else cards.current.delete(dish.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={dish.loadLabel}
                  onPress={() => onLoad(dish)}
                  style={({ pressed }) => [StyleSheet.absoluteFill, styles.fill, pressed && styles.loadPressed]}
                />
                <View style={styles.content}>
                  <View style={styles.tiles} testID="dish-tiles">
                    {onePerCategory(
                      dish.items.map((i) => i.food),
                      TILES_PER_CARD,
                    ).map((food) => (
                      <FoodIcon key={food.id} food={food} />
                    ))}
                  </View>
                  <View style={[styles.title, isFavorite && styles.titleFavorite]}>
                    {isFavorite ? <Star size={14} color={colors.amber500} fill={colors.amber500} /> : null}
                    <AppText heading size={fontSize.base} weight={800} lineHeight={18} style={styles.titleText}>
                      {dish.title}
                    </AppText>
                  </View>
                  <View style={styles.meta}>
                    <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
                      {dish.when ? `${dish.when} · ` : ""}
                      {plural(dish.items.length, "item", "itens")}
                    </AppText>
                    {!hideCalories && (
                      <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
                        {fmtNumber(calories)} kcal
                      </AppText>
                    )}
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={dish.logLabel}
                  accessibilityState={{ disabled: busy, busy }}
                  disabled={busy}
                  tabIndex={0}
                  onPress={() => !busy && onLogNow(dish)}
                  style={({ pressed }) => [styles.add, pressed && styles.addPressed, busy && styles.disabled]}
                >
                  <Plus size={20} color={colors.white} />
                </Pressable>
                {isFavorite ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remover favorito ${dish.title}`}
                    accessibilityState={{ disabled: busy, busy }}
                    disabled={busy}
                    tabIndex={0}
                    onPress={() => !busy && onRemoveFavorite(dish)}
                    style={styles.removeHit}
                  >
                    {({ pressed }) => (
                      <View style={[styles.remove, pressed && styles.addPressed, busy && styles.disabled]}>
                        <Trash2 size={16} color={colors.muted} />
                      </View>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
  );
  return (
    <View style={styles.section}>
      {showTitle && <SectionTitle>Seus pratos</SectionTitle>}
      {isGrid ? (
        list
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}
          testID="dish-scroller"
        >
          {list}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 10 },
  scroller: { marginHorizontal: -16 },
  scrollerContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  list: { flexDirection: "row", gap: 10 },
  grid: { flexWrap: "wrap" },
  /** Duas colunas no painel do histórico. */
  cardGrid: { width: "auto", flexBasis: "45%", flexGrow: 1 },
  card: {
    width: CARD_WIDTH,
    minHeight: 132,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  favorite: { borderColor: colors.amber100 },
  fill: { borderRadius: 19 },
  loadPressed: { backgroundColor: colors.pressedInk },
  // O conteúdo não recebe toques: o cartão (atrás) carrega o prato.
  content: { flex: 1, gap: 6, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 14, pointerEvents: "none" },
  tiles: { flexDirection: "row", gap: 4 },
  title: { flexDirection: "row", alignItems: "center", gap: 4 },
  titleFavorite: { paddingRight: 24 },
  titleText: { flexShrink: 1 },
  meta: { marginTop: "auto", marginRight: 48 },
  add: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentFill,
    boxShadow: shadows.dishAdd,
  },
  addPressed: { transform: [{ scale: 0.92 }] },
  /** Gravando ([aria-disabled] do web): esmaecido, mas ainda focável. */
  disabled: { opacity: 0.6 },
  /** Toque de 44 px no canto (sem hitSlop, que o web ignora); o círculo visível continua com 32. */
  removeHit: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glassButton,
  },
}));
