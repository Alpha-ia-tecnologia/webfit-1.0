import { Check, ChevronUp } from "lucide-react-native";
import { Platform, Pressable, ScrollView, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { mealTotals } from "@shared/lib/domain";
import { friendlyName } from "@shared/lib/food-search";
import { fmtNumber, plural } from "@shared/lib/format";
import {
  describePortion,
  measureById,
  qtyFor,
  shortPortion,
  type PortionUnit,
} from "@shared/lib/household-measures";
import { MEAL_TEXT_COPY } from "@shared/lib/meal-text";
import { KCAL_PER_GRAM } from "@shared/lib/meals";
import type { MealItem } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, themeMacroColor } from "@/theme/tokens";
import { FoodThumb } from "./food-icon";
import { MeasureIcon } from "./measure-icon";
import { srOnly } from "./web-a11y";

type Props = {
  items: MealItem[];
  unitOf: (item: MealItem) => PortionUnit;
  hideCalories: boolean;
  busy: boolean;
  saveLabel: string;
  /** Por que o salvar foi recusado; aparece junto do botão, à vista. */
  error?: string;
  onSave: () => void;
  onShowPlate: () => void;
  /** Altura da bandeja, para o aviso ("Desfazer") aparecer acima dela. */
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Alimentos que entraram pela descrição sem porção dita (DIARIO-07). */
  pendingIds?: ReadonlySet<string>;
};

/** Até esta largura o total da bandeja desce um degrau (o @media 380px do web). */
const NARROW_MAX_WIDTH = 380;

/**
 * Um item da bandeja (conceito 02): emoji, desenho da medida e "4 col." à vista; o mais recente vem primeiro e
 * destacado. O leitor de tela ouve a medida por extenso ("4 colheres de sopa de Arroz integral"), nunca a abreviação.
 */
function TrayChip({ item, unit, isPending, isLatest }: { item: MealItem; unit: PortionUnit; isPending: boolean; isLatest: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const measure = measureById(item.food, unit);
  const qty = qtyFor(item.grams, measure);
  const spoken = `${describePortion(qty, measure)} de ${friendlyName(item.food.name).label}${isPending ? MEAL_TEXT_COPY.pendingSpoken : ""}`;
  const isWeb = Platform.OS === "web";
  return (
    <View
      style={[styles.chip, isLatest && styles.chipLatest]}
      role="listitem"
      accessible
      accessibilityLabel={isWeb ? undefined : spoken}
    >
      <FoodThumb food={item.food} size={28} shape="circle" />
      <MeasureIcon unit={unit} size={14} color={isLatest ? colors.green700 : colors.muted} />
      <AppText size={fontSize.base} weight={800} color={isLatest ? colors.green800 : colors.text2} lineHeight={18} aria-hidden importantForAccessibility="no">
        {shortPortion(qty, measure)}
      </AppText>
      {isPending ? <View style={styles.pendingDot} testID="tray-dot" /> : null}
      {isWeb ? (
        <AppText size={fontSize.xs} style={srOnly}>
          {spoken}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * Bandeja fixa, à vista assim que o prato tem um item: o que já está nele, o total e o salvar.
 * Com "Ocultar calorias", mostra só os itens e a barra de proteínas, carboidratos e gorduras.
 */
export function MealTray({
  items,
  unitOf,
  hideCalories,
  busy,
  saveLabel,
  error,
  onSave,
  onShowPlate,
  onLayout,
  pendingIds,
}: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const isNarrow = useWindowDimensions().width <= NARROW_MAX_WIDTH;
  if (!items.length) return null;
  // O último alimento adicionado vem primeiro e destacado (é o que está sendo ajustado).
  const newestFirst = [...items].reverse();
  const pendingCount = pendingIds ? items.filter((i) => pendingIds.has(i.food.id)).length : 0;
  const totals = mealTotals(items);
  const { protein, carbs, fat } = totals.macros;
  const shares = [
    ["protein", protein * KCAL_PER_GRAM.protein],
    ["carbs", carbs * KCAL_PER_GRAM.carbs],
    ["fat", fat * KCAL_PER_GRAM.fat],
  ] as const;
  return (
    <View style={styles.tray} aria-label="Resumo do prato" role="region" onLayout={onLayout}>
      <View style={styles.top}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} testID="tray-chips">
          <View style={styles.chips} role="list" aria-label="Itens do prato">
            {newestFirst.map((item, index) => (
              <TrayChip
                key={item.food.id}
                item={item}
                unit={unitOf(item)}
                isPending={pendingIds?.has(item.food.id) ?? false}
                isLatest={index === 0}
              />
            ))}
          </View>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver prato"
          onPress={onShowPlate}
          style={({ pressed }) => [styles.see, pressed && styles.pressed]}
        >
          <AppText heading size={fontSize.sm} weight={800} color={colors.green700}>
            Ver prato
          </AppText>
          <ChevronUp size={16} color={colors.green700} />
        </Pressable>
      </View>
      <View style={styles.bottom}>
        <View style={styles.summary}>
          <AppText size={fontSize.md} weight={600} color={colors.muted} lineHeight={isNarrow ? 28 : 34} numberOfLines={1}>
            {!hideCalories && (
              <>
                <AppText heading size={isNarrow ? fontSize["2xl"] : fontSize["3xl"]} weight={800} tracking={-0.02} style={styles.tabular}>
                  {fmtNumber(totals.calories)}
                </AppText>{" "}
                kcal ·{" "}
              </>
            )}
            {plural(items.length, "item", "itens")}
          </AppText>
          {pendingCount ? (
            <AppText size={fontSize.xs} weight={700} color={colors.amber900} lineHeight={16} testID="tray-pending">
              {MEAL_TEXT_COPY.trayMissing(pendingCount)}
            </AppText>
          ) : null}
          <View
            style={styles.macro}
            role="img"
            aria-label={`Proteínas ${fmtNumber(protein, 1)} g, carboidratos ${fmtNumber(carbs, 1)} g, gorduras ${fmtNumber(fat, 1)} g`}
          >
            {shares.map(([key, share]) => (
              <View key={key} style={[styles.share, { flexGrow: share, backgroundColor: macroColor[key] }]} />
            ))}
          </View>
        </View>
        <Button
          label={saveLabel}
          icon={Check}
          size="lg"
          busy={busy}
          onPress={() => !busy && onSave()}
          style={styles.save}
        />
      </View>
      {error ? (
        <AppText
          size={fontSize.sm}
          weight={600}
          lineHeight={19}
          color={colors.amber900}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={styles.error}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tray: {
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.glassBar,
    boxShadow: shadows.floatingBar,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  chipsScroll: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", gap: 6 },
  /** 4 px entre emoji, medida e porção: "4 col." e "1 concha" cabem inteiros ao lado de "Ver prato" (conceito 02). */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 14,
    backgroundColor: colors.surface2,
  },
  /** O mais recente: superfície com o contorno menta de 2 px. */
  chipLatest: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.mint300, paddingVertical: 1, paddingLeft: 2, paddingRight: 8 },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber500 },
  // 44 px de toque reais (o web ignora hitSlop); a margem negativa mantém a faixa com a mesma altura.
  see: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, marginVertical: -2, paddingHorizontal: 6 },
  pressed: { opacity: 0.7 },
  bottom: { flexDirection: "row", alignItems: "center", gap: 12 },
  summary: { flex: 1, minWidth: 0, gap: 6 },
  tabular: { fontVariant: ["tabular-nums"] },
  macro: { flexDirection: "row", gap: 3, height: 6 },
  share: { minWidth: 6, height: 6, borderRadius: radius.pill },
  save: { flexShrink: 0, paddingHorizontal: 18 },
  // .tray-error: tom de atenção (âmbar), não de erro grave, junto do botão de salvar.
  error: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.amber50,
    overflow: "hidden",
  },
}));
