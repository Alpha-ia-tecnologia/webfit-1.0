import { useRef } from "react";
import { Check, ChevronUp } from "lucide-react";
import type { MealItem } from "../../types";
import { mealTotals } from "../../lib/domain";
import { friendlyName } from "../../lib/food-search";
import {
  describePortion,
  measureById,
  qtyFor,
  shortPortion,
  type PortionUnit,
} from "../../lib/household-measures";
import { fmtNumber, plural } from "../../lib/format";
import { KCAL_PER_GRAM } from "../../lib/meals";
import { MEAL_TEXT_COPY } from "../../lib/meal-text";
import { MacroBar } from "../meal/MacroBar";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import { FoodThumb } from "./FoodIcon";
import { MeasureIcon } from "./MeasureIcon";
import "./MealText.css";

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
  pendingIds,
  onSave,
  onShowPlate,
}: {
  items: MealItem[];
  unitOf: (item: MealItem) => PortionUnit;
  hideCalories: boolean;
  busy: boolean;
  saveLabel: string;
  /** Por que o salvar foi recusado; aparece junto do botão, à vista. */
  error?: string;
  /** Alimentos sem porção dita (Descrever refeição): ponto âmbar no item e a contagem no resumo. */
  pendingIds?: ReadonlySet<string>;
  onSave: () => void;
  onShowPlate: () => void;
}) {
  // "disabled" nativo enquanto salva (um duplo toque nunca grava duas vezes); o foco volta depois.
  const saveRef = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(busy, saveRef);
  if (!items.length) return null;
  const totals = mealTotals(items);
  const { protein, carbs, fat } = totals.macros;
  const pendingCount = pendingIds ? items.filter((i) => pendingIds.has(i.food.id)).length : 0;
  const share = {
    protein: protein * KCAL_PER_GRAM.protein,
    carbs: carbs * KCAL_PER_GRAM.carbs,
    fat: fat * KCAL_PER_GRAM.fat,
  };
  const hasShare = share.protein + share.carbs + share.fat > 0;
  // O último alimento adicionado vem primeiro e destacado (é o que está sendo ajustado).
  const newestFirst = [...items].reverse();
  return (
    <section className="meal-tray" aria-label="Resumo do prato">
      <div className="tray-top">
        <ul className="tray-chips" aria-label="Itens do prato">
          {newestFirst.map((item, index) => {
            const unit = unitOf(item);
            const measure = measureById(item.food, unit);
            const qty = qtyFor(item.grams, measure);
            const isPending = pendingIds?.has(item.food.id) ?? false;
            return (
              <li key={item.food.id} className={index === 0 ? "is-latest" : undefined}>
                <FoodThumb food={item.food} size={28} shape="circle" />
                <MeasureIcon unit={unit} size={14} />
                <span aria-hidden="true">{shortPortion(qty, measure)}</span>
                {/* Leitor de tela ouve a medida por extenso ("4 colheres de sopa"), não "col.". */}
                <span className="sr-only">
                  {describePortion(qty, measure)} de {friendlyName(item.food.name).label}
                  {isPending && MEAL_TEXT_COPY.pendingSpoken}
                </span>
                {isPending && <i className="tray-dot" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
        <button type="button" className="tray-see" onClick={onShowPlate}>
          Ver prato
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="tray-bottom">
        <div className="tray-summary">
          <p className="tray-total">
            {!hideCalories && (
              <>
                <strong>{fmtNumber(totals.calories)}</strong> kcal ·{" "}
              </>
            )}
            {plural(items.length, "item", "itens")}
          </p>
          {hasShare && (
            <MacroBar
              share={share}
              size="md"
              className="tray-macro"
              label={`Proteínas ${fmtNumber(protein, 1)} g, carboidratos ${fmtNumber(carbs, 1)} g, gorduras ${fmtNumber(fat, 1)} g`}
            />
          )}
          {pendingCount > 0 && (
            <p className="tray-pending">{MEAL_TEXT_COPY.trayMissing(pendingCount)}</p>
          )}
        </div>
        <button
          ref={saveRef}
          type="button"
          className="btn tray-save"
          disabled={busy}
          aria-busy={busy}
          onClick={onSave}
        >
          <Check size={18} aria-hidden="true" />
          {saveLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="tray-error">
          {error}
        </p>
      )}
    </section>
  );
}
