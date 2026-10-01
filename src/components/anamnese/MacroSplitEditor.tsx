import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  gramsOf,
  handlePercent,
  MACRO_MIN_PCT,
  moveSplit,
  splitAtPercent,
  splitOf,
  splitValueText,
  type MacroSplit,
} from "../../lib/goal-editor";
import { fmtNumber } from "../../lib/format";
import type { Goals } from "../../types";

type Grams = { protein: number; carbs: number; fat: number };
const HANDLES = [
  { index: 0, label: "Divisão entre proteína e carboidratos" },
  { index: 1, label: "Divisão entre carboidratos e gorduras" },
] as const;
const SLICES = [
  { key: "protein", label: "Proteína" },
  { key: "carbs", label: "Carboidratos" },
  { key: "fat", label: "Gorduras" },
] as const;
const KEY_DELTA: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 5,
  PageDown: -5,
};
/** Divisão mostrada (sem editar) enquanto não há meta de energia. */
const PLACEHOLDER: MacroSplit = { protein: 20, carbs: 50, fat: 30 };
const MAX_PCT = 100 - MACRO_MIN_PCT;

/**
 * Barra de proteína, carboidratos e gorduras com duas alças: cada movimento grava os três
 * macros em gramas a partir da meta de energia atual. Com "Ocultar calorias", tudo em gramas.
 */
export function MacroSplitEditor({
  goals,
  hide,
  onChange,
}: {
  goals: Goals;
  hide: boolean;
  onChange: (grams: Grams) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<0 | 1 | null>(null);
  const calories = goals.calories;
  const current = splitOf(goals);
  const isDisabled = calories === null || current === null;
  const split = current ?? PLACEHOLDER;
  const grams = gramsOf(calories ?? 0, split);
  const apply = (next: MacroSplit) => {
    if (isDisabled || calories === null) return;
    if (
      next.protein === split.protein &&
      next.carbs === split.carbs &&
      next.fat === split.fat
    )
      return;
    onChange(gramsOf(calories, next));
  };
  const onKeyDown = (handle: 0 | 1) => (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = KEY_DELTA[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    apply(moveSplit(split, handle, delta));
  };
  const onPointerDown = (handle: 0 | 1) => (e: PointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    dragging.current = handle;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  };
  const onPointerMove = (handle: 0 | 1) => (e: PointerEvent<HTMLDivElement>) => {
    const rect = bar.current?.getBoundingClientRect();
    if (dragging.current !== handle || !rect || rect.width <= 0) return;
    apply(splitAtPercent(split, handle, ((e.clientX - rect.left) / rect.width) * 100));
  };
  const endDrag = () => {
    dragging.current = null;
  };
  return (
    <div
      className={`macro-split-editor ${isDisabled ? "is-disabled" : ""}`}
      data-testid="macro-split"
      role="group"
      aria-label="Divisão dos macronutrientes"
    >
      <ul className="mse-labels" aria-hidden="true">
        {SLICES.map((slice) => (
          <li key={slice.key} className={slice.key}>
            <i />
            {slice.label}{" "}
            <strong>
              {isDisabled
                ? "—"
                : hide
                  ? `${fmtNumber(grams[slice.key])} g`
                  : `${split[slice.key]}%`}
            </strong>
          </li>
        ))}
      </ul>
      <div ref={bar} className="mse-bar">
        {SLICES.map((slice) => (
          <span
            key={slice.key}
            className={`mse-slice ${slice.key}`}
            style={{ flexGrow: split[slice.key] }}
          />
        ))}
        {HANDLES.map(({ index, label }) => (
          <div
            key={index}
            className="mse-handle"
            style={{ left: `${handlePercent(split, index)}%` }}
            role="slider"
            tabIndex={isDisabled ? -1 : 0}
            aria-label={label}
            aria-disabled={isDisabled || undefined}
            aria-valuemin={MACRO_MIN_PCT}
            aria-valuemax={MAX_PCT}
            aria-valuenow={handlePercent(split, index)}
            aria-valuetext={splitValueText(split, grams, index, hide)}
            onKeyDown={onKeyDown(index)}
            onPointerDown={onPointerDown(index)}
            onPointerMove={onPointerMove(index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="mse-grip" aria-hidden="true" />
          </div>
        ))}
      </div>
      {isDisabled && (
        <p className="hint">
          Informe uma meta de energia para dividir os macronutrientes.
        </p>
      )}
    </div>
  );
}
