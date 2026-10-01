/**
 * Categorias de alimento (web e app nativo): ícone, tom e rótulo curto do bloco do alimento e
 * dos filtros da busca. O alimento é achado primeiro pelo id na TACO, então uma cópia salva
 * com nome ou categoria antigos (num prato, favorito ou registro) ainda recebe o ícone certo.
 */
import foodsJson from "../data/foods.json";
import type { Domain } from "../design/tokens";
import type { FoodItem } from "../types";

/** Nomes de ícones que existem no lucide-react e no lucide-react-native. */
export type FoodIconName =
  | "Wheat"
  | "LeafyGreen"
  | "Apple"
  | "Droplet"
  | "Fish"
  | "Beef"
  | "Milk"
  | "CupSoda"
  | "Egg"
  | "Candy"
  | "CookingPot"
  | "Package"
  | "Soup"
  | "Bean"
  | "Nut"
  | "Tag"
  | "Utensils";

/** Tons de domínio sem o vermelho: categoria de alimento nunca é alerta. */
export type FoodTone = Exclude<Domain, "danger">;

export interface FoodCategory {
  key: string;
  /** Rótulo curto do filtro ("Frutas"). */
  label: string;
  icon: FoodIconName;
  tone: FoodTone;
}

/** Categoria da TACO → apresentação. Toda categoria de foods.json precisa estar aqui. */
export const FOOD_CATEGORIES: Readonly<Record<string, FoodCategory>> = {
  "Cereais e derivados": { key: "cereais", label: "Cereais", icon: "Wheat", tone: "attention" },
  "Verduras, hortaliças e derivados": {
    key: "verduras",
    label: "Verduras e legumes",
    icon: "LeafyGreen",
    tone: "food",
  },
  "Frutas e derivados": { key: "frutas", label: "Frutas", icon: "Apple", tone: "mind" },
  "Gorduras e óleos": { key: "gorduras", label: "Gorduras e óleos", icon: "Droplet", tone: "attention" },
  "Pescados e frutos do mar": { key: "pescados", label: "Peixes e frutos do mar", icon: "Fish", tone: "water" },
  "Carnes e derivados": { key: "carnes", label: "Carnes", icon: "Beef", tone: "mind" },
  "Leite e derivados": { key: "leite", label: "Leite e derivados", icon: "Milk", tone: "water" },
  "Bebidas (alcoólicas e não alcoólicas)": { key: "bebidas", label: "Bebidas", icon: "CupSoda", tone: "habit" },
  "Ovos e derivados": { key: "ovos", label: "Ovos", icon: "Egg", tone: "attention" },
  "Produtos açucarados": { key: "doces", label: "Doces", icon: "Candy", tone: "medication" },
  "Miscelâneas": { key: "diversos", label: "Diversos", icon: "CookingPot", tone: "neutral" },
  "Outros alimentos industrializados": {
    key: "industrializados",
    label: "Industrializados",
    icon: "Package",
    tone: "neutral",
  },
  "Alimentos preparados": { key: "preparados", label: "Pratos prontos", icon: "Soup", tone: "habit" },
  "Leguminosas e derivados": { key: "leguminosas", label: "Leguminosas", icon: "Bean", tone: "body" },
  "Nozes e sementes": { key: "nozes", label: "Nozes e sementes", icon: "Nut", tone: "body" },
  // Alimentos cadastrados pelo rótulo (LabelFoodModal / label-food-sheet).
  "Meus alimentos": { key: "meus", label: "Meus alimentos", icon: "Tag", tone: "food" },
};

/** Sem categoria conhecida (ex.: alimento vindo de outra fonte). */
export const FALLBACK_CATEGORY: FoodCategory = {
  key: "outros",
  label: "Outros",
  icon: "Utensils",
  tone: "neutral",
};

/** Categoria original de cada alimento da TACO, pelo id. */
const TACO_CATEGORY = new Map(
  (foodsJson as Pick<FoodItem, "id" | "category">[]).map((f) => [f.id, f.category]),
);

/** Categoria do alimento: pelo id na TACO, depois pela categoria da cópia, depois a genérica. */
export function foodCategoryOf(food: Pick<FoodItem, "id" | "category">): FoodCategory {
  const byId = TACO_CATEGORY.get(food.id);
  if (byId && FOOD_CATEGORIES[byId]) return FOOD_CATEGORIES[byId];
  return FOOD_CATEGORIES[food.category] ?? FALLBACK_CATEGORY;
}

/** Filtro "Todos" (sem categoria escolhida). */
export const ALL_CATEGORIES = "todos";

/**
 * Categorias presentes nos resultados, na ordem em que aparecem (a mais relevante primeiro),
 * com quantos resultados cada uma tem.
 */
export function categoriesIn<T>(
  items: readonly T[],
  foodOf: (item: T) => Pick<FoodItem, "id" | "category">,
): (FoodCategory & { count: number })[] {
  const found = new Map<string, FoodCategory & { count: number }>();
  for (const item of items) {
    const category = foodCategoryOf(foodOf(item));
    const current = found.get(category.key);
    found.set(category.key, { ...category, count: (current?.count ?? 0) + 1 });
  }
  return [...found.values()];
}

/** Resultados da categoria escolhida; "todos" ou uma categoria ausente devolve a lista inteira. */
export function filterByCategory<T>(
  items: readonly T[],
  key: string,
  foodOf: (item: T) => Pick<FoodItem, "id" | "category">,
): T[] {
  if (key === ALL_CATEGORIES) return [...items];
  const filtered = items.filter((item) => foodCategoryOf(foodOf(item)).key === key);
  return filtered.length ? filtered : [...items];
}

/** Um alimento por categoria, na ordem da lista (ícones de um prato: arroz e pão não repetem o trigo). */
export function onePerCategory<T extends Pick<FoodItem, "id" | "category">>(
  foods: readonly T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  return foods
    .filter((food) => {
      const key = foodCategoryOf(food).key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
