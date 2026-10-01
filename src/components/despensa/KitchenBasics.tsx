import { useId } from "react";
import { plural } from "../../lib/format";
import {
  KITCHEN_BASICS,
  KITCHEN_BASICS_HELP,
  KITCHEN_BASICS_NONE_HINT,
} from "../../lib/kitchen-basics";
import type { KitchenBasicKey } from "../../types";

/** Básicos da cozinha (IA-X4): só os marcados podem ser presumidos pelas receitas. */
export function KitchenBasics({
  selected,
  isDisabled,
  onToggle,
}: {
  selected: readonly KitchenBasicKey[];
  isDisabled: boolean;
  onToggle: (key: KitchenBasicKey) => void;
}) {
  const titleId = useId();
  const count = selected.length;
  return (
    <div className="kitchen-basics">
      <div className="kitchen-basics-head">
        <h3 id={titleId}>Básicos da cozinha</h3>
        <span className="count-pill">{plural(count, "marcado", "marcados")}</span>
      </div>
      <p className="hint">{KITCHEN_BASICS_HELP}</p>
      {count === 0 && <p className="hint kitchen-basics-none">{KITCHEN_BASICS_NONE_HINT}</p>}
      <div className="basics-chips" role="group" aria-labelledby={titleId} data-testid="kitchen-basics">
        {KITCHEN_BASICS.map(({ key, label, emoji }) => (
          <button
            key={key}
            type="button"
            className="basics-chip"
            aria-pressed={selected.includes(key)}
            disabled={isDisabled}
            onClick={() => onToggle(key)}
          >
            <span aria-hidden="true">{emoji}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
