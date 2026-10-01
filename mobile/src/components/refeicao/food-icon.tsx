import {
  Apple,
  Bean,
  Beef,
  Candy,
  CookingPot,
  CupSoda,
  Droplet,
  Egg,
  Fish,
  LeafyGreen,
  Milk,
  Nut,
  Package,
  Soup,
  Tag,
  Utensils,
  Wheat,
  type LucideIcon,
} from "lucide-react-native";
import {
  foodCategoryOf,
  type FoodCategory,
  type FoodIconName,
} from "@shared/lib/food-categories";
import { glyphForFood } from "@shared/lib/food-glyph";
import type { FoodItem } from "@shared/types";
import { FoodGlyph, type GlyphSize } from "@/components/ui";
import { IconTile } from "@/components/ui/icon-tile";
import { useTheme } from "@/theme/theme";
import { themeDomainTone } from "@/theme/tokens";

/** Nome do ícone (food-categories) → componente do lucide-react-native. */
export const ICONS: Record<FoodIconName, LucideIcon> = {
  Wheat,
  LeafyGreen,
  Apple,
  Droplet,
  Fish,
  Beef,
  Milk,
  CupSoda,
  Egg,
  Candy,
  CookingPot,
  Package,
  Soup,
  Bean,
  Nut,
  Tag,
  Utensils,
};
/** Ícone da categoria (chips de filtro): na cor do tom ou na cor pedida (chip marcado). */
export function CategoryIcon({
  category,
  size = 16,
  color,
}: {
  category: FoodCategory;
  size?: number;
  color?: string;
}) {
  const domainTone = themeDomainTone(useTheme().scheme);
  const Icon = ICONS[category.icon];
  return <Icon size={size} color={color ?? domainTone[category.tone].fg} />;
}

/**
 * Bloco arredondado com o ícone da categoria do alimento (36 px na lista e nos pratos, 24 px na
 * bandeja); decorativo (o nome já diz o que é).
 */
export function FoodIcon({
  food,
  size = "md",
}: {
  food: Pick<FoodItem, "id" | "category">;
  size?: "md" | "sm";
}) {
  const category = foodCategoryOf(food);
  return <IconTile tone={category.tone} icon={ICONS[category.icon]} size={size} testID="food-tile" />;
}

/**
 * Emoji do alimento num bloco (FoodThumb do web: linha da busca 44, bandeja 28); sem emoji conhecido, o ícone
 * da categoria. Decorativo: o nome ao lado diz o que é.
 */
export function FoodThumb({
  food,
  size = 44,
  shape = "tile",
}: {
  food: Pick<FoodItem, "id" | "name" | "category">;
  size?: GlyphSize;
  shape?: "tile" | "circle";
}) {
  const category = foodCategoryOf(food);
  return <FoodGlyph glyph={glyphForFood(food)} icon={ICONS[category.icon]} size={size} shape={shape} testID="food-tile" />;
}
