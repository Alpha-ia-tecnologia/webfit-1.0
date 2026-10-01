import { useState, type Ref, type CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import type { FoodItem } from "../../types";
import {
  GRAMS_STEP,
  describePortion,
  fmtQty,
  gramsFor,
  measuresFor,
  parseGrams,
  qtyFor,
  stepQty,
  unitWord,
  type PortionUnit,
} from "../../lib/household-measures";
import { MAX_ITEM_GRAMS } from "../../lib/meals";
import { fmtKcal } from "../../lib/format";
import { MeasureIcon } from "./MeasureIcon";

/**
 * Porção de um alimento do prato: − / + pela medida caseira, troca de medida e gramas exatos.
 * O campo "Porção de … em gramas" existe sempre; digitar nele nunca troca a medida (o foco
 * fica) e guarda o texto como foi digitado ("0,", "12,") até sair do campo.
 */
export function PortionEditor({
  food,
  grams,
  unit,
  hideCalories,
  onChange,
  plusRef,
}: {
  food: FoodItem;
  grams: number;
  unit: PortionUnit;
  hideCalories: boolean;
  onChange: (grams: number, unit: PortionUnit) => void;
  plusRef?: Ref<HTMLButtonElement>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Anunciado só depois de − / + ou da troca de medida, não a cada tecla no campo de gramas.
  const [announcement, setAnnouncement] = useState("");
  const measures = measuresFor(food);
  const measure = measures.find((m) => m.id === unit) ?? null;
  const qty = qtyFor(grams, measure);
  const step = (direction: 1 | -1) => {
    const next = Math.min(
      MAX_ITEM_GRAMS,
      measure
        ? gramsFor(stepQty(qty, direction, measure.step), measure)
        : stepQty(grams, direction, GRAMS_STEP),
    );
    setDraft(null);
    setAnnouncement(describePortion(qtyFor(next, measure), measure));
    onChange(next, unit);
  };
  const switchUnit = (next: PortionUnit) => {
    const nextMeasure = measures.find((m) => m.id === next) ?? null;
    setDraft(null);
    setAnnouncement(describePortion(qtyFor(grams, nextMeasure), nextMeasure));
    onChange(grams, next);
  };
  const invalid = !(grams > 0) || (draft !== null && parseGrams(draft) === null);
  const gramsText = draft ?? (grams > 0 ? String(grams).replace(".", ",") : "");
  const gramsInput = (
    <input
      className="portion-grams"
      // Largura pelo número ("≈ 100 g" sem vãos; o CSS usa --grams-chars na linha de apoio).
      style={{ "--grams-chars": Math.max(2, gramsText.length) } as CSSProperties}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={`Porção de ${food.name} em gramas`}
      aria-invalid={invalid}
      required
      // Vírgula decimal, como no resto do app ("112,5"); o campo aceita ponto também.
      value={gramsText}
      onChange={(e) => {
        setDraft(e.target.value);
        const value = parseGrams(e.target.value);
        if (value !== null) onChange(Math.min(MAX_ITEM_GRAMS, value), unit);
      }}
      onBlur={() => setDraft(null)}
    />
  );
  const kcal =
    !hideCalories && grams > 0 ? fmtKcal((food.caloriesPer100g * grams) / 100) : null;
  return (
    <div className="portion-editor">
      <div className="portion-stepper">
        <button
          type="button"
          className="portion-step"
          aria-label={`Diminuir ${food.name}`}
          onClick={() => step(-1)}
        >
          <Minus size={20} aria-hidden="true" />
        </button>
        <div className="portion-value">
          {measure ? (
            <p className="portion-main">
              <strong>{fmtQty(qty)}</strong> {unitWord(qty, measure)}
            </p>
          ) : (
            <p className="portion-main portion-main-grams">
              {gramsInput}
              <span aria-hidden="true">g</span>
            </p>
          )}
          {(measure || kcal) && (
            <p className="portion-sub">
              {measure && (
                <>
                  <span aria-hidden="true">≈</span>
                  {gramsInput}
                  <span aria-hidden="true">g</span>
                </>
              )}
              {measure && kcal && <span aria-hidden="true">·</span>}
              {kcal && <span>{kcal}</span>}
            </p>
          )}
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
        </div>
        <button
          ref={plusRef}
          type="button"
          className="portion-step plus"
          aria-label={`Aumentar ${food.name}`}
          onClick={() => step(1)}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
      {measures.length > 0 && (
        <div className="portion-units" role="group" aria-label={`Medida de ${food.name}`}>
          {measures.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={unit === m.id}
              onClick={() => switchUnit(m.id)}
            >
              <MeasureIcon unit={m.id} size={18} />
              {m.label}
            </button>
          ))}
          <button type="button" aria-pressed={unit === "g"} onClick={() => switchUnit("g")}>
            <MeasureIcon unit="g" size={18} />
            Gramas
          </button>
        </div>
      )}
    </div>
  );
}
