import { Plus, Utensils } from "lucide-react-native";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { macroShare, mealCategoryOf, mealSummary, mealWord, type MealSlot } from "@shared/lib/diary-day";
import { mealGlyph } from "@shared/lib/food-glyph";
import { mealTone } from "@shared/lib/today";
import type { DiaryEntry } from "@shared/types";
import { AppText, Empty, MealCard, mealCardTone, SectionHeader } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, motion, radius } from "@/theme/tokens";
import { useEnteringIds } from "./use-entering-ids";

type Item = { kind: "meal"; time: string; entry: DiaryEntry } | { kind: "slot"; time: string; slot: MealSlot };
type Rail = "none" | "solid" | "dashed";

/** Hora (40) · ponto (16) · cartão, como a grade do web; o trilho passa no meio da coluna do ponto. */
const TIME_WIDTH = 40;
const DOT_COLUMN = 16;
const DOT = 12;
/** Aro de 3 px em volta do ponto (box-shadow do web): o trilho encosta nele. */
const DOT_RING = 3;
/** Metade do espaço entre os itens: cada meia-linha avança até o meio dele. */
const HALF_GAP = 6;
/** Abaixo desta largura a vaga mostra só o "+" e o título da refeição pode ter 2 linhas (o @media 359px do web). */
const NARROW_BELOW_WIDTH = 360;
/** Traços do trilho até a vaga (3 px de traço, 4 de folga); sobra cortada pelo overflow. */
const DASHES = 16;
/** Refeição recém-registrada desce 8 px e aparece com a mola "gentle" (como no web). */
const ENTRY_IN = FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: -8 }] })
  .springify()
  .stiffness(motion.spring.gentle.stiffness)
  .damping(motion.spring.gentle.damping)
  .mass(motion.spring.gentle.mass);

type Props = {
  meals: DiaryEntry[];
  slot: MealSlot | null;
  hideCalories: boolean;
  onEdit: (entry: DiaryEntry) => void;
  onAdd: (category: string) => void;
  onSeeAll: () => void;
};

/** Meia-linha do trilho: cheia (menta) entre refeições feitas, tracejada até a vaga, nada nas pontas. */
function RailHalf({ kind, edge }: { kind: Rail; edge: "top" | "bottom" }) {
  const styles = useStyles();
  if (kind === "none") return <View style={styles.railSpace} />;
  return (
    <View style={[styles.rail, edge === "top" ? styles.railTop : styles.railBottom, kind === "solid" && styles.railSolid]}>
      {/* Traços numa camada absoluta: sem altura própria, a linha só ocupa o que o item já tem. */}
      {kind === "dashed" && (
        <View style={styles.dashes}>
          {Array.from({ length: DASHES }, (_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Coluna do ponto: meia-linha de cima, o ponto (cheio = feita; aro = vaga) e a meia-linha de baixo. */
function DotColumn({ top, bottom, isHollow }: { top: Rail; bottom: Rail; isHollow: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.dotColumn} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <RailHalf kind={top} edge="top" />
      <View style={styles.dotBox}>
        <View style={isHollow ? styles.dotHollow : styles.dot} />
      </View>
      <RailHalf kind={bottom} edge="bottom" />
    </View>
  );
}

/**
 * Refeições de hoje em linha do tempo (MealsTimeline do web): hora, ponto (feita) ou aro (vaga) e um cartão
 * por refeição com o emoji do item principal, a frase dos itens, a barra P/C/G e as kcal do registro. A próxima
 * refeição principal sem registro aparece como vaga tracejada com "+ Adicionar".
 */
export function MealsTimeline({ meals, slot, hideCalories, onEdit, onAdd, onSeeAll }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const items: Item[] = [
    ...meals.map((entry): Item => ({ kind: "meal", time: entry.time, entry })),
    ...(slot ? [{ kind: "slot" as const, time: slot.time, slot }] : []),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const entering = useEnteringIds(meals.map((m) => m.id));
  const isNarrow = useWindowDimensions().width < NARROW_BELOW_WIDTH;
  const titleLines = isNarrow ? 2 : 1;
  const railTo = (item: Item | undefined): Rail => (!item ? "none" : item.kind === "meal" ? "solid" : "dashed");
  return (
    <View style={styles.section} testID="meals-timeline">
      <SectionHeader title="Refeições" action={{ label: "Diário", accessibilityLabel: "Ver todas no Diário", onPress: onSeeAll }} />
      {items.length ? (
        <View style={styles.list}>
          {items.map((item, i) => {
            const top: Rail = i === 0 ? "none" : railTo(item);
            const bottom = railTo(items[i + 1]);
            if (item.kind === "slot")
              return (
                <View key="slot" style={styles.item}>
                  <AppText size={fontSize.base} weight={800} color={colors.muted} align="right" style={styles.time}>
                    {item.slot.time}
                  </AppText>
                  <DotColumn top={top} bottom={bottom} isHollow />
                  <View style={styles.card}>
                    <MealCard
                      variant="slot"
                      dense
                      title={item.slot.category}
                      titleLines={titleLines}
                      subtitle={
                        <AppText size={fontSize.sm} color={colors.muted} lineHeight={18}>
                          {`sugerido às ${item.slot.time}`}
                        </AppText>
                      }
                      icon={Utensils}
                      tone="mint"
                      trailing={
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Adicionar ${mealWord(item.slot.category)}`}
                          onPress={() => onAdd(item.slot.category)}
                          style={({ pressed }) => [styles.addHit, pressed && styles.pressed]}
                        >
                          <View style={[styles.add, isNarrow && styles.addRound]}>
                            <Plus size={16} strokeWidth={2.75} color={colors.white} />
                            {!isNarrow && (
                              <AppText size={fontSize.sm} weight={800} color={colors.white}>
                                Adicionar
                              </AppText>
                            )}
                          </View>
                        </Pressable>
                      }
                    />
                  </View>
                </View>
              );
            const { entry } = item;
            const category = mealCategoryOf(entry);
            return (
              <Animated.View key={entry.id} entering={entering.has(entry.id) ? ENTRY_IN : undefined} style={styles.item}>
                <AppText size={fontSize.base} weight={800} color={colors.text2} align="right" style={styles.time}>
                  {entry.time}
                </AppText>
                <DotColumn top={top} bottom={bottom} isHollow={false} />
                <View style={styles.card}>
                  <MealCard
                    variant="card"
                    title={category}
                    titleLines={titleLines}
                    subtitle={mealSummary(entry).sentence}
                    glyph={mealGlyph(entry.items, category)}
                    icon={Utensils}
                    tone={mealCardTone(mealTone(entry))}
                    share={macroShare(entry.macros)}
                    kcal={hideCalories ? null : (entry.calories ?? null)}
                    onPress={() => onEdit(entry)}
                    pressLabel={`Editar ${entry.title}`}
                  />
                </View>
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <Empty art="meals">Nenhuma refeição registrada hoje.</Empty>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 8, minWidth: 0 },
  list: { gap: HALF_GAP * 2 },
  item: { flexDirection: "row", alignItems: "center", columnGap: 2 },
  time: { width: TIME_WIDTH, fontVariant: ["tabular-nums"] },
  card: { flex: 1, minWidth: 0 },
  dotColumn: { width: DOT_COLUMN, alignSelf: "stretch", alignItems: "center" },
  dotBox: { width: DOT + DOT_RING * 2, height: DOT + DOT_RING * 2, alignItems: "center", justifyContent: "center" },
  dot: {
    width: DOT + DOT_RING * 2,
    height: DOT + DOT_RING * 2,
    borderRadius: (DOT + DOT_RING * 2) / 2,
    borderWidth: DOT_RING,
    borderColor: colors.mint100,
    backgroundColor: colors.emerald,
  },
  dotHollow: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: colors.slate300, backgroundColor: colors.bg },
  railSpace: { flex: 1 },
  rail: { flex: 1, width: 2, borderRadius: radius.pill, overflow: "hidden" },
  dashes: { position: "absolute", top: 0, left: 0, gap: 4 },
  railTop: { marginTop: -HALF_GAP },
  railBottom: { marginBottom: -HALF_GAP },
  railSolid: { backgroundColor: colors.mint200 },
  dash: { width: 2, height: 3, borderRadius: 1, backgroundColor: colors.slate400 },
  /** "+ Adicionar": pílula verde de 40 px dentro de um alvo de 44. */
  addHit: { minHeight: 44, justifyContent: "center" },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingLeft: 7,
    paddingRight: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
  },
  /** Tela estreita: só o "+" num círculo de 40 px (o nome acessível continua "Adicionar jantar"). */
  addRound: { width: 40, paddingLeft: 0, paddingRight: 0, justifyContent: "center" },
  pressed: { transform: [{ scale: 0.97 }] },
}));
