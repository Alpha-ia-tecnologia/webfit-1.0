import { Plus, Utensils } from "lucide-react";
import { macroShare, mealCategoryOf, mealSummary, mealWord, type MealSlot } from "../../lib/diary-day";
import { mealGlyph } from "../../lib/food-glyph";
import { mealTone } from "../../lib/today";
import type { DiaryEntry } from "../../types";
import { Empty } from "../UI";
import { MealCard, mealCardTone } from "../meal/MealCard";
import { SectionHeader } from "../meal/SectionHeader";
import { useEnteringIds } from "../useEnteringIds";

type Item = { kind: "meal"; time: string; entry: DiaryEntry } | { kind: "slot"; time: string; slot: MealSlot };

type Props = {
  meals: DiaryEntry[];
  slot: MealSlot | null;
  hideCalories: boolean;
  onEdit: (entry: DiaryEntry) => void;
  onAdd: (category: string) => void;
  onSeeAll: () => void;
};

/**
 * Refeições de hoje em linha do tempo: hora, ponto (feita) ou aro (vaga) e um cartão por refeição
 * com o emoji do item principal, a frase dos itens, a barra P/C/G e as kcal do registro. A próxima
 * refeição principal sem registro aparece como vaga tracejada com "+ Adicionar".
 */
export function MealsTimeline({ meals, slot, hideCalories, onEdit, onAdd, onSeeAll }: Props) {
  const items: Item[] = [
    ...meals.map((entry): Item => ({ kind: "meal", time: entry.time, entry })),
    ...(slot ? [{ kind: "slot" as const, time: slot.time, slot }] : []),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const entering = useEnteringIds(meals.map((m) => m.id));
  return (
    <section className="meals-section stagger-4" aria-labelledby="hoje-meals-title">
      <SectionHeader
        id="hoje-meals-title"
        title="Refeições"
        action={{ label: "Diário", ariaLabel: "Ver todas no Diário", onClick: onSeeAll }}
      />
      {items.length ? (
        <ol className="meal-timeline">
          {items.map((item, i) => {
            const next = items[i + 1];
            // O trilho até o próximo ponto: cheio entre refeições feitas, tracejado até a vaga.
            const rail = [
              !next ? "" : next.kind === "meal" ? "rail-solid" : "rail-dashed",
              i > 0 ? "has-prev" : "",
            ].join(" ");
            if (item.kind === "slot")
              return (
                <li key="slot" className={`timeline-item is-slot ${rail}`}>
                  <span className="timeline-time">{item.slot.time}</span>
                  <span className="timeline-dot is-hollow" aria-hidden="true" />
                  <MealCard
                    variant="slot"
                    title={item.slot.category}
                    subtitle={`sugerido às ${item.slot.time}`}
                    icon={Utensils}
                    tone="mint"
                    trailing={
                      <button
                        type="button"
                        className="timeline-add"
                        aria-label={`Adicionar ${mealWord(item.slot.category)}`}
                        onClick={() => onAdd(item.slot.category)}
                      >
                        <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
                        <span className="timeline-add-text">Adicionar</span>
                      </button>
                    }
                  />
                </li>
              );
            const { entry } = item;
            return (
              <li key={entry.id} className={`timeline-item ${rail} ${entering.has(entry.id) ? "is-entering" : ""}`}>
                <span className="timeline-time">{entry.time}</span>
                <span className="timeline-dot" aria-hidden="true" />
                <MealCard
                  variant="card"
                  title={mealCategoryOf(entry)}
                  subtitle={mealSummary(entry).sentence}
                  glyph={mealGlyph(entry.items, mealCategoryOf(entry))}
                  icon={Utensils}
                  tone={mealCardTone(mealTone(entry))}
                  share={macroShare(entry.macros)}
                  kcal={hideCalories ? null : (entry.calories ?? null)}
                  onPress={() => onEdit(entry)}
                  pressLabel={`Editar ${entry.title}`}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty art="meals">Nenhuma refeição registrada hoje.</Empty>
      )}
    </section>
  );
}
