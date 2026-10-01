import { ALL_CATEGORIES, type FoodCategory } from "../../lib/food-categories";
import { CategoryIcon } from "./FoodIcon";

/**
 * Filtro da busca por categoria: "Todos" e as categorias presentes nos resultados, uma de
 * cada vez (botões com aria-pressed). Uma categoria que saiu dos resultados vale como "Todos".
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
  const active = categories.some((c) => c.key === value) ? value : ALL_CATEGORIES;
  return (
    <div className="food-cat-chips" role="group" aria-label="Filtrar por categoria">
      <button
        type="button"
        aria-pressed={active === ALL_CATEGORIES}
        onClick={() => onChange(ALL_CATEGORIES)}
      >
        Todos
      </button>
      {categories.map((category) => {
        const isOn = active === category.key;
        return (
          <button
            key={category.key}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange(category.key)}
          >
            <CategoryIcon category={category} isToned={!isOn} />
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
