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
} from "lucide-react";
import {
  foodCategoryOf,
  type FoodCategory,
  type FoodIconName,
} from "../../lib/food-categories";
import { glyphForFood } from "../../lib/food-glyph";
import type { FoodItem } from "../../types";
import { IconTile } from "../IconTile";
import { FoodGlyph, type GlyphSize } from "../meal/FoodGlyph";

/** Nome do ícone (food-categories) → componente do lucide-react. */
const ICONS: Record<FoodIconName, LucideIcon> = {
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
/** Ícone da categoria (chips de filtro): na cor do tom ou, no chip marcado, na cor do texto. */
export function CategoryIcon({
  category,
  size = 16,
  isToned = true,
}: {
  category: FoodCategory;
  size?: number;
  isToned?: boolean;
}) {
  const Icon = ICONS[category.icon];
  return (
    <Icon
      size={size}
      aria-hidden="true"
      style={isToned ? { color: `var(--wf-tone-${category.tone}-fg)` } : undefined}
    />
  );
}

/**
 * Emoji do alimento num bloco (fidelidade visual: linha da busca 48, bandeja 28); sem emoji conhecido,
 * o ícone da categoria. Decorativo: o nome ao lado diz o que é.
 */
export function FoodThumb({
  food,
  size = 48,
  shape = "tile",
  className,
}: {
  food: Pick<FoodItem, "id" | "name" | "category">;
  size?: GlyphSize;
  shape?: "tile" | "circle";
  className?: string;
}) {
  const category = foodCategoryOf(food);
  return (
    <FoodGlyph
      glyph={glyphForFood(food)}
      icon={ICONS[category.icon]}
      size={size}
      shape={shape}
      className={className}
    />
  );
}

/** Bloco arredondado com o ícone da categoria do alimento; decorativo (o nome já diz o que é). */
export function FoodIcon({
  food,
  size = "md",
}: {
  food: Pick<FoodItem, "id" | "category">;
  size?: "md" | "sm";
}) {
  const category = foodCategoryOf(food);
  return (
    <IconTile tone={category.tone} icon={ICONS[category.icon]} size={size} className="food-tile" />
  );
}
