import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { friendlyName } from "../../lib/food-search";
import { describePortion, measureById, qtyFor } from "../../lib/household-measures";
import { fmtNumber } from "../../lib/format";
import { MEAL_TEXT_COPY, type MealText } from "../../lib/meal-text";
import {
  linkMealTextItems,
  mealTextPortion,
  type LinkedMealTextItem,
} from "../../lib/taco-match";
import type { FoodItem } from "../../types";
import type { MealTextSelection } from "./useMealText";
import "../Plate.css";
import "./PhotoDraft.css";
import "./MealText.css";

/** O rascunho chega no lugar do texto: o foco vai para o título dele. */
const focusOnMount = (element: HTMLElement | null) => {
  element?.focus();
};

/**
 * Porção de um item: a dita, em medida caseira e gramas da TACO; ou o aviso âmbar quando a medida
 * dita não existe para o alimento escolhido ou nada foi dito (entra com a medida caseira padrão).
 */
function PortionLine({ entry, food }: { entry: LinkedMealTextItem; food: FoodItem }) {
  const portion = mealTextPortion(entry, food);
  if (portion) {
    const measure = measureById(food, portion.unit);
    const grams = `${fmtNumber(portion.grams, 1)} g`;
    const said = measure
      ? `${describePortion(qtyFor(portion.grams, measure), measure)} ≈ ${grams}`
      : grams;
    return <p className="meal-text-portion">{MEAL_TEXT_COPY.stated(said)}</p>;
  }
  return (
    <p className="meal-text-portion is-missing">
      <i className="meal-text-dot" aria-hidden="true" />
      {entry.statedText
        ? MEAL_TEXT_COPY.saidCheck(entry.statedText)
        : MEAL_TEXT_COPY.missingDefault}
    </p>
  );
}

/**
 * Rascunho da descrição (DIARIO-07): cada item dito com os alimentos da TACO para escolher, a
 * porção dita (só quando o trecho está na descrição) e o aviso de alergia. Alérgeno aparece
 * desmarcado, nunca some (a pessoa já comeu). Gramas só das medidas caseiras da TACO; nunca kcal.
 * `draft` já chega mascarado (hideCalories).
 */
export function MealTextDraft({
  draft,
  source,
  allergyDetails,
  onAdd,
  onSearch,
  onBack,
}: {
  draft: MealText;
  /** O texto exato enviado ao agente: a quantidade só vale se o trecho estiver nele. */
  source: string;
  allergyDetails: string;
  onAdd: (selections: MealTextSelection[]) => void;
  onSearch: (name: string) => void;
  onBack: () => void;
}) {
  const linked = useMemo(
    () => linkMealTextItems(draft, source, allergyDetails),
    [draft, source, allergyDetails],
  );
  const [checked, setChecked] = useState<boolean[]>(() =>
    linked.map((entry) => entry.defaultChecked),
  );
  const [choice, setChoice] = useState<(string | null)[]>(() =>
    linked.map((entry) => entry.candidates[0]?.id ?? null),
  );
  const baseId = useId();
  const chosenFood = (entry: LinkedMealTextItem, index: number): FoodItem | undefined =>
    entry.candidates.find((candidate) => candidate.id === choice[index]) ?? entry.candidates[0];
  const selected: MealTextSelection[] = linked.flatMap((entry, index) => {
    const food = checked[index] ? chosenFood(entry, index) : undefined;
    return food ? [{ food, portion: mealTextPortion(entry, food) }] : [];
  });
  const setAt = <T,>(values: readonly T[], index: number, value: T) =>
    values.map((current, i) => (i === index ? value : current));

  return (
    <section
      className="meal-text-draft"
      data-testid="meal-text-draft"
      aria-labelledby={`${baseId}-title`}
    >
      <h3 id={`${baseId}-title`} ref={focusOnMount} tabIndex={-1}>
        {MEAL_TEXT_COPY.draft}
      </h3>
      {linked.length ? (
        <p className="hint">{MEAL_TEXT_COPY.draftHint}</p>
      ) : (
        <p className="notice">{MEAL_TEXT_COPY.noItems}</p>
      )}
      {linked.length > 0 && (
        <ul className="photo-items">
          {linked.map((entry, index) => {
            const name = entry.item.name;
            const food = chosenFood(entry, index);
            return (
              <li key={`${index}-${name}`} className="photo-item">
                <div className="photo-item-head">
                  <input
                    type="checkbox"
                    aria-label={MEAL_TEXT_COPY.include(name)}
                    checked={checked[index] ?? false}
                    disabled={!food}
                    onChange={(e) => setChecked((current) => setAt(current, index, e.target.checked))}
                  />
                  <span className="photo-item-name">{name}</span>
                  {entry.allergy && <span className="allergen-badge">Possível alérgeno</span>}
                </div>
                {food ? (
                  <>
                    <fieldset className="photo-candidates">
                      <legend className="sr-only">{MEAL_TEXT_COPY.tacoFor(name)}</legend>
                      {entry.candidates.map((candidate) => {
                        const friendly = friendlyName(candidate.name);
                        return (
                          <label key={candidate.id} className="photo-candidate">
                            <input
                              type="radio"
                              name={`${baseId}-item-${index}`}
                              value={candidate.id}
                              checked={food.id === candidate.id}
                              onChange={() =>
                                setChoice((current) => setAt(current, index, candidate.id))
                              }
                            />
                            <span>
                              {friendly.label}
                              {friendly.prep && (
                                <small className="photo-candidate-prep"> · {friendly.prep}</small>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </fieldset>
                    <PortionLine entry={entry} food={food} />
                  </>
                ) : (
                  <div className="photo-missing">
                    <span>{MEAL_TEXT_COPY.noMatch}</span>
                    <button type="button" className="text-btn" onClick={() => onSearch(name)}>
                      <Search size={14} aria-hidden="true" />
                      {MEAL_TEXT_COPY.search(name)}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {draft.uncertainties.length > 0 && (
        <div className="notice photo-uncertain">
          <p className="photo-uncertain-title">{MEAL_TEXT_COPY.doubts}</p>
          <ul>
            {draft.uncertainties.map((doubt, index) => (
              <li key={`${index}-${doubt}`}>{doubt}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="meal-text-actions">
        {linked.length > 0 && (
          <button
            type="button"
            className="btn"
            disabled={!selected.length}
            onClick={() => onAdd(selected)}
          >
            {MEAL_TEXT_COPY.addCount(selected.length)}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onBack}>
          {MEAL_TEXT_COPY.back}
        </button>
      </div>
    </section>
  );
}
