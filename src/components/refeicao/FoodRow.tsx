import { useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
import type { FoodItem, MealItem } from "../../types";
import { friendlyName, highlightMatches } from "../../lib/food-search";
import {
  defaultPortion,
  inferUnit,
  measureById,
  qtyFor,
  rowPortion,
  type PortionUnit,
} from "../../lib/household-measures";
import { fmtNumber } from "../../lib/format";
import { MEAL_TEXT_COPY } from "../../lib/meal-text";
import { KcalStat } from "../meal/KcalStat";
import { FoodThumb } from "./FoodIcon";
import { MeasureIcon } from "./MeasureIcon";
import { PortionEditor } from "./PortionEditor";
import "./MealText.css";

/** Trecho digitado em negrito dentro do nome. */
export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightMatches(text, query).map((piece, i) =>
        piece.match ? <b key={i}>{piece.text}</b> : <span key={i}>{piece.text}</span>,
      )}
    </>
  );
}

/** Proteínas, carboidratos e gorduras de uma porção, com o ponto de cor de cada macro. */
export function MacroDots({ food, grams }: { food: FoodItem; grams: number }) {
  const macros: [string, string, number][] = [
    ["p", "Proteínas", food.proteinPer100g],
    ["c", "Carboidratos", food.carbsPer100g],
    ["f", "Gorduras", food.fatPer100g],
  ];
  return (
    <span className="macro-dots">
      {macros.map(([key, label, per100]) => (
        <span key={key} className={`macro-dot ${key}`}>
          <span className="sr-only">{label} </span>
          {fmtNumber((per100 * grams) / 100)} g
        </span>
      ))}
    </span>
  );
}

/** Preparos do alimento (cozido · cru): na bandeja, trocar mantém a porção (conceito 02: a linha fechada só diz o nome). */
function PrepChips({ label, variants, selected, onSelect }: { label: string; variants: FoodItem[]; selected: FoodItem; onSelect?: (food: FoodItem) => void }) {
  return (
    <div className="prep-chips" role="group" aria-label={`Preparo de ${label}`}>
      {variants.map((variant) => (
        <button key={variant.id} type="button" aria-pressed={variant.id === selected.id} onClick={() => onSelect?.(variant)}>
          {friendlyName(variant.name).prep ?? "simples"}
        </button>
      ))}
    </div>
  );
}

/**
 * Um alimento na lista (conceito 02): emoji, nome com o preparo ("Arroz integral, cozido") e o trecho buscado
 * em negrito, porção sugerida em medida caseira, pontos P/C/G, kcal e "+". Na bandeja, o editor de porção,
 * os preparos (quando há mais de um) e o check que tira o item.
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
  focusPlus = false,
  needsPortion = false,
  onFocused,
  onSelect,
  onAdd,
  onChange,
  onRemove,
  onKeepPortion,
}: {
  label: string;
  variants: FoodItem[];
  selected: FoodItem;
  query?: string;
  hideCalories: boolean;
  /** Porção sugerida em gramas (frequentes: a da última vez). */
  suggestion?: number;
  item?: MealItem;
  unit?: PortionUnit;
  /** Recém-adicionado: leva o foco ao "Aumentar" do editor (a linha pode ter mudado de lista). */
  focusPlus?: boolean;
  /** No prato sem porção dita (Descrever refeição): aviso "Falta porção" e "Manter porção". */
  needsPortion?: boolean;
  onFocused?: () => void;
  onSelect?: (food: FoodItem) => void;
  onAdd: (food: FoodItem, grams: number, unit: PortionUnit) => void;
  onChange: (food: FoodItem, grams: number, unit: PortionUnit) => void;
  onRemove: (food: FoodItem) => void;
  onKeepPortion?: (food: FoodItem) => void;
}) {
  const plusRef = useRef<HTMLButtonElement>(null);
  // Ao adicionar, o "+" some e o editor aparece: o foco vai para o "Aumentar" do editor.
  useEffect(() => {
    if (!focusPlus || !item) return;
    plusRef.current?.focus();
    onFocused?.();
  }, [focusPlus, item, onFocused]);
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
    <li className={`food-card${item ? " is-in" : ""}`}>
      <div className="food-card-main">
        <FoodThumb food={selected} size={44} />
        <div className="food-card-body">
          <h3 className="food-card-title">
            <Highlight text={title} query={query} />
          </h3>
          {item ? (
            <>
              <div className="food-in-row">
                <span className="food-in-chip">
                  <Check size={14} aria-hidden="true" />
                  Na bandeja
                </span>
                {variants.length > 1 && <PrepChips label={label} variants={variants} selected={selected} onSelect={onSelect} />}
              </div>
              {needsPortion && (
                <div className="food-portion-pending">
                  <span className="food-portion-flag">
                    <i aria-hidden="true" />
                    {MEAL_TEXT_COPY.missing}
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    aria-label={`${MEAL_TEXT_COPY.keep} de ${label}`}
                    onClick={() => {
                      onKeepPortion?.(selected);
                      // O botão some com o aviso: o foco fica no editor da mesma porção.
                      plusRef.current?.focus();
                    }}
                  >
                    {MEAL_TEXT_COPY.keep}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="food-card-portion">
                <MeasureIcon unit={portion.unit} size={16} />
                <span className="food-card-portion-text">{portionText}</span>
              </p>
              <MacroDots food={selected} grams={portion.grams} />
            </>
          )}
        </div>
        {item ? (
          // O check da bandeja tira o item (mesmo nome acessível do antigo "Remover").
          <button
            type="button"
            className="food-remove is-in"
            aria-label={`Remover ${selected.name}`}
            onClick={() => onRemove(selected)}
          >
            <Check size={20} strokeWidth={3} aria-hidden="true" />
          </button>
        ) : (
          <>
            {!hideCalories && (
              <KcalStat
                value={(selected.caloriesPer100g * portion.grams) / 100}
                className="food-kcal"
              />
            )}
            <button
              type="button"
              className="food-add"
              aria-label={`Adicionar ${selected.name}`}
              onClick={() => onAdd(selected, portion.grams, portion.unit)}
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
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
    </li>
  );
}
