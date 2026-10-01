import { Pressable, ScrollView } from "react-native";
import { ALL_CATEGORIES, type FoodCategory } from "@shared/lib/food-categories";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { CategoryIcon } from "./food-icon";
import { webAttrs } from "./web-a11y";

/** Alvo de toque mínimo dos chips. */
const CHIP_HEIGHT = 44;

/**
 * Filtro da busca por categoria: "Todos" e as categorias presentes nos resultados, uma de
 * cada vez (selecionado no leitor de tela; aria-pressed no export web). Uma categoria que
 * saiu dos resultados vale como "Todos".
 */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: FoodCategory[];
  value: string;
  onChange: (key: string) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const active = categories.some((c) => c.key === value) ? value : ALL_CATEGORIES;
  const options = [
    { key: ALL_CATEGORIES, label: "Todos", category: null },
    ...categories.map((category) => ({ key: category.key, label: category.label, category })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroller}
      contentContainerStyle={styles.row}
      role="group"
      aria-label="Filtrar por categoria"
      testID="food-category-chips"
    >
      {options.map(({ key, label, category }) => {
        const isOn = active === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isOn }}
            {...webAttrs({ "aria-pressed": isOn })}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.chip, isOn && styles.chipOn, pressed && styles.pressed]}
          >
            {category ? (
              <CategoryIcon category={category} color={isOn ? colors.white : undefined} />
            ) : null}
            <AppText size={fontSize.sm} weight={700} color={isOn ? colors.white : colors.text2}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  // A rolagem lateral vai até a borda da tela; o conteúdo mantém o recuo da lista.
  scroller: { marginHorizontal: -16, flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accentFill, backgroundColor: colors.accentFill },
  pressed: { transform: [{ scale: 0.96 }] },
}));
