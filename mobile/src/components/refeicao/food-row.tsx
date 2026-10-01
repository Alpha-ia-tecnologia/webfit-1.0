import { LinearGradient } from "expo-linear-gradient";
import { Check, Plus } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { friendlyName, highlightMatches } from "@shared/lib/food-search";
import { fmtNumber } from "@shared/lib/format";
import { defaultPortion, inferUnit, measureById, qtyFor, rowPortion, type PortionUnit } from "@shared/lib/household-measures";
import { MEAL_TEXT_COPY } from "@shared/lib/meal-text";
import type { FoodItem, MealItem } from "@shared/types";
import { AppText } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { diagonalDown, fontSize, gradients, radius, shadows, themeMacroColor } from "@/theme/tokens";
import { FoodThumb } from "./food-icon";
import { MeasureIcon } from "./measure-icon";
import { PortionEditor } from "./portion-editor";
import { srOnly, webAttrs } from "./web-a11y";

/** Trecho digitado em negrito dentro do nome. */
function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightMatches(text, query).map((piece, i) =>
        piece.match ? (
          <AppText key={i} size={fontSize.lg} weight={800} lineHeight={22}>
            {piece.text}
          </AppText>
        ) : (
          piece.text
        ),
      )}
    </>
  );
}

const MACROS = [
  ["protein", "Proteínas", "proteinPer100g"],
  ["carbs", "Carboidratos", "carbsPer100g"],
  ["fat", "Gorduras", "fatPer100g"],
] as const;

/** Proteínas, carboidratos e gorduras de uma porção, com o ponto de cor de cada macro. */
function MacroDots({ food, grams }: { food: FoodItem; grams: number }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  return (
    <View style={styles.dots}>
      {MACROS.map(([key, label, field]) => (
        <View key={key} style={styles.dot} accessible>
          <View style={[styles.dotMark, { backgroundColor: macroColor[key] }]} />
          <AppText size={fontSize.xs} style={srOnly}>
            {label}{" "}
          </AppText>
          <AppText size={fontSize.sm} weight={700} color={colors.text2} style={styles.tabular}>
            {fmtNumber((food[field] * grams) / 100)} g
          </AppText>
        </View>
      ))}
    </View>
  );
}

type PrepProps = { label: string; variants: FoodItem[]; selected: FoodItem; onSelect?: (food: FoodItem) => void };

/** Preparos do alimento (cozido · cru): na bandeja, trocar mantém a porção (a linha fechada só diz o nome). */
function PrepChips({ label, variants, selected, onSelect }: PrepProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.preps} role="group" aria-label={`Preparo de ${label}`}>
      {variants.map((variant) => {
        const isOn = variant.id === selected.id;
        const text = friendlyName(variant.name).prep ?? "simples";
        return (
          <Pressable
            key={variant.id}
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ selected: isOn }}
            {...webAttrs({ "aria-pressed": isOn })}
            onPress={() => onSelect?.(variant)}
            style={styles.prepHit}
          >
            {({ pressed }) => (
              <View style={[styles.prep, isOn && styles.prepOn, pressed && styles.pressed]}>
                <AppText size={fontSize.xs} weight={700} color={isOn ? colors.white : colors.text2}>
                  {text}
                </AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

type Props = {
  label: string;
  variants: FoodItem[];
  selected: FoodItem;
  query?: string;
  hideCalories: boolean;
  /** Porção sugerida em gramas (frequentes: a da última vez). */
  suggestion?: number;
  item?: MealItem;
  unit?: PortionUnit;
  /** O alimento acabou de ser adicionado: leva o foco ao "Aumentar" do editor. */
  shouldFocusEditor?: boolean;
  /** Entrou pela descrição sem porção dita (DIARIO-07): "Falta porção" até a pessoa conferir. */
  needsPortion?: boolean;
  onKeepPortion?: () => void;
  onEditorFocused?: () => void;
  onSelect?: (food: FoodItem) => void;
  onAdd: (food: FoodItem, grams: number, unit: PortionUnit) => void;
  onChange: (food: FoodItem, grams: number, unit: PortionUnit) => void;
  onRemove: (food: FoodItem) => void;
};

/**
 * Um alimento na lista (FoodRow do web, conceito 02): emoji, nome com o preparo ("Arroz integral, cozido") e o
 * trecho buscado em negrito, porção sugerida em medida caseira, pontos P/C/G, kcal e "+". Na bandeja, o editor
 * de porção, os preparos (quando há mais de um) e o check que tira o item.
 */
export function FoodRow({
  label,
  variants,
  selected,
  query = "",
  hideCalories,
  suggestion,
  item,
  unit,
  shouldFocusEditor = false,
  needsPortion = false,
  onKeepPortion,
  onEditorFocused,
  onSelect,
  onAdd,
  onChange,
  onRemove,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const plusRef = useRef<View>(null);
  // Ao adicionar, o "+" some e o editor aparece (nesta linha ou na do prato, que acaba de
  // montar): o foco vai para o "Aumentar" do editor.
  useEffect(() => {
    if (!shouldFocusEditor || !item) return;
    focusNode(plusRef.current);
    onEditorFocused?.();
  }, [shouldFocusEditor, item, onEditorFocused]);
  const prep = friendlyName(selected.name).prep;
  const title = prep ? `${label}, ${prep}` : label;
  const portion =
    suggestion !== undefined
      ? { unit: inferUnit(selected, suggestion), grams: suggestion }
      : defaultPortion(selected);
  const measure = measureById(selected, portion.unit);
  const portionText = measure
    ? `${rowPortion(qtyFor(portion.grams, measure), measure)} ≈ ${fmtNumber(portion.grams, 1)} g`
    : `${fmtNumber(portion.grams, 1)} g`;
  return (
    <View style={[styles.card, item && styles.cardIn]} role="listitem">
      <View style={styles.main}>
        <FoodThumb food={selected} size={44} />
        <View style={styles.body}>
          <AppText size={fontSize.lg} weight={500} lineHeight={22} accessibilityRole="header">
            <Highlight text={title} query={query} />
          </AppText>
          {item ? (
            <View style={styles.inRow}>
              <View style={styles.inChip}>
                <Check size={14} color={colors.green700} />
                <AppText size={fontSize.sm} weight={800} color={colors.green700}>
                  Na bandeja
                </AppText>
              </View>
              {variants.length > 1 ? <PrepChips label={label} variants={variants} selected={selected} onSelect={onSelect} /> : null}
              {needsPortion ? (
                <>
                  <View style={styles.flag}>
                    <View style={styles.flagDot} />
                    <AppText size={fontSize.xs} weight={700} color={colors.amber900}>
                      {MEAL_TEXT_COPY.missing}
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${MEAL_TEXT_COPY.keep} de ${label}`}
                    onPress={onKeepPortion}
                    style={({ pressed }) => [styles.keep, pressed && styles.keepPressed]}
                  >
                    <AppText size={fontSize.xs} weight={700} color={colors.green700}>
                      {MEAL_TEXT_COPY.keep}
                    </AppText>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.portion}>
                <MeasureIcon unit={portion.unit} size={16} color={colors.muted} />
                <AppText size={fontSize.base} weight={600} color={colors.muted} numberOfLines={1} style={styles.shrink}>
                  {portionText}
                </AppText>
              </View>
              <MacroDots food={selected} grams={portion.grams} />
            </>
          )}
        </View>
        {item ? (
          // O check da bandeja tira o item (mesmo nome acessível do antigo "Remover").
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover ${selected.name}`}
            onPress={() => onRemove(selected)}
            style={({ pressed }) => [styles.remove, pressed && styles.addPressed]}
          >
            <LinearGradient colors={gradients.button} start={diagonalDown.start} end={diagonalDown.end} style={StyleSheet.absoluteFill} />
            {/* O ícone numa View própria: no web, a camada absoluta do gradiente pintaria por cima de um svg solto. */}
            <View>
              <Check size={20} strokeWidth={3} color={colors.white} />
            </View>
          </Pressable>
        ) : (
          <>
            {!hideCalories && (
              <View style={styles.kcal}>
                <AppText heading size={fontSize.lg} weight={800} tracking={-0.02} align="right" lineHeight={20} style={styles.tabular}>
                  {fmtNumber((selected.caloriesPer100g * portion.grams) / 100)}
                </AppText>
                <AppText size={fontSize.xs} weight={600} color={colors.muted} align="right" lineHeight={14}>
                  kcal
                </AppText>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${selected.name}`}
              onPress={() => onAdd(selected, portion.grams, portion.unit)}
              style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
            >
              <Plus size={22} color={colors.green700} />
            </Pressable>
          </>
        )}
      </View>
      {item && (
        <PortionEditor
          food={item.food}
          grams={item.grams}
          unit={unit ?? "g"}
          hideCalories={hideCalories}
          plusRef={plusRef}
          onChange={(grams, next) => onChange(item.food, grams, next)}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    padding: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  /** Na bandeja: borda menta de 2 px e um halo menta claro (conceito 02). */
  cardIn: {
    padding: 10,
    borderWidth: 2,
    borderColor: colors.mint300,
    boxShadow: `0px 0px 0px 4px ${colors.mint50}, ${shadows.card}`,
  },
  main: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  shrink: { flexShrink: 1, minWidth: 0 },
  portion: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  preps: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  /** Toque de 44 px em volta da pílula de 32 (sem hitSlop, que o web ignora), sem mudar o layout. */
  prepHit: { minHeight: 44, marginVertical: -6, justifyContent: "center" },
  prep: {
    minHeight: 32,
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  prepOn: { borderColor: colors.accentFill, backgroundColor: colors.accentFill },
  pressed: { transform: [{ scale: 0.96 }] },
  inRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  // Falta porção: ponto âmbar de 6 px e texto âmbar 900 (atenção, nunca vermelho).
  flag: { flexDirection: "row", alignItems: "center", gap: 6 },
  flagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber500 },
  /** Botão de texto com 44 px de toque reais; a margem negativa mantém a linha compacta. */
  keep: { minHeight: 44, minWidth: 44, marginVertical: -8, justifyContent: "center", paddingHorizontal: 4 },
  keepPressed: { opacity: 0.7 },
  /** "✓ Na bandeja": pílula menta de 28 px. */
  inChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 28,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
  },
  dots: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2 },
  dot: { flexDirection: "row", alignItems: "center", gap: 4 },
  dotMark: { width: 8, height: 8, borderRadius: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  kcal: { flexShrink: 0 },
  add: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  addPressed: { transform: [{ scale: 0.92 }] },
  /** Check da bandeja (tocar tira o item): círculo verde de 44 px com o check branco. */
  remove: {
    alignSelf: "flex-start",
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.float,
  },
}));
