import { useEffect, useId, useRef } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { mealTotals } from "../../lib/domain";
import { fmtNumber, plural } from "../../lib/format";
import { onePerCategory } from "../../lib/food-categories";
import type { Dish } from "../../lib/meals";
import { FoodThumb } from "./FoodIcon";

const TILES_PER_CARD = 3;

/**
 * "Seus pratos": cartões que repetem uma refeição. Tocar no cartão carrega os itens para
 * conferir; o "+" registra na hora; favoritos podem ser removidos.
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
}: {
  dishes: Dish[];
  hideCalories: boolean;
  busy: boolean;
  /** Prato restaurado pelo "Desfazer": o foco volta para o cartão dele. */
  focusId?: string | null;
  onFocused?: () => void;
  onLoad: (dish: Dish) => void;
  onLogNow: (dish: Dish) => void;
  onRemoveFavorite: (dish: Dish) => void;
  /** Sem o título "Seus pratos" (a folha do histórico já tem o dela). */
  showTitle?: boolean;
  /** scroll: carrossel sob a busca; grid: grade na folha do histórico do cabeçalho. */
  layout?: "scroll" | "grid";
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!focusId) return;
    const index = dishes.findIndex((d) => d.id === focusId);
    if (index < 0) return;
    listRef.current?.children[index]?.querySelector<HTMLButtonElement>(".dish-load")?.focus();
    onFocused?.();
  }, [focusId, dishes, onFocused]);
  return (
    <section
      className="dish-section"
      aria-labelledby={showTitle ? titleId : undefined}
      aria-label={showTitle ? undefined : "Seus pratos"}
    >
      {showTitle && (
        <h2 id={titleId} className="food-section-title">
          Seus pratos
        </h2>
      )}
      <ul className={layout === "grid" ? "dish-scroller is-grid" : "dish-scroller"} ref={listRef}>
        {dishes.map((dish) => {
          const calories = mealTotals(dish.items).calories;
          return (
            <li key={`${dish.kind}-${dish.id}`} className={`dish-card ${dish.kind}`}>
              <button
                type="button"
                className="dish-load"
                aria-label={dish.loadLabel}
                onClick={() => onLoad(dish)}
              />
              <span className="dish-tiles" aria-hidden="true">
                {onePerCategory(
                  dish.items.map((i) => i.food),
                  TILES_PER_CARD,
                ).map((food) => (
                  <FoodThumb key={food.id} food={food} size={34} />
                ))}
              </span>
              <h3 className="dish-title">
                {dish.kind === "favorito" && (
                  <Star size={14} className="dish-star" aria-hidden="true" />
                )}
                {dish.title}
              </h3>
              <p className="dish-meta">
                <span>
                  {dish.when && `${dish.when} · `}
                  {plural(dish.items.length, "item", "itens")}
                </span>
                {!hideCalories && <span>{fmtNumber(calories)} kcal</span>}
              </p>
              <button
                type="button"
                className="dish-add"
                aria-label={dish.logLabel}
                aria-disabled={busy}
                onClick={() => !busy && onLogNow(dish)}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
              {dish.kind === "favorito" && (
                <button
                  type="button"
                  className="dish-remove"
                  aria-label={`Remover favorito ${dish.title}`}
                  aria-disabled={busy}
                  onClick={() => !busy && onRemoveFavorite(dish)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
