import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { localDate, shiftDate } from "../../lib/dates";
import { tapFeedback } from "../../lib/haptics";
import { PANTRY_UNITS } from "../../lib/pantry";
import {
  canDecreaseQuantity,
  EXPIRY_SHORTCUTS,
  pantryEmoji,
  stepPantryQuantity,
} from "../../lib/pantry-view";
import type { PantryDraft } from "../../types";
import { IconTile } from "../IconTile";
import { PickerField, type PickerOption } from "../PickerField";
import { SegmentedControl } from "../SegmentedControl";
import { LOCATION_SEGMENTS } from "./shared";

const UNIT_OPTIONS: PickerOption<PantryDraft["unit"]>[] = Object.entries(PANTRY_UNITS).map(
  ([value, label]) => ({ value: value as PantryDraft["unit"], label }),
);

interface Props {
  index: number;
  draft: PantryDraft;
  isEditing: boolean;
  isDisabled: boolean;
  onPatch: (value: Partial<PantryDraft>) => void;
  onRemove: () => void;
}

/** Uma linha compacta da revisão: nome, quantidade (−/+), unidade, local, validade e observação. */
export function DraftRow({ index, draft, isEditing, isDisabled, onPatch, onRemove }: Props) {
  const n = index + 1;
  const [showNotes, setShowNotes] = useState(!!draft.notes);
  const today = localDate();
  const step = (direction: 1 | -1) => {
    tapFeedback();
    onPatch({ quantity: stepPantryQuantity(draft.quantity, draft.unit, direction) });
  };
  return (
    <fieldset className="pantry-draft-row" data-testid="pantry-draft-row" disabled={isDisabled}>
      <legend className="sr-only">Item {n}</legend>
      <div className="draft-name">
        <IconTile size="md" glyph={pantryEmoji(draft.name)} />
        <input
          data-draft-name=""
          aria-label={`Nome do item ${n}`}
          placeholder="Nome do alimento"
          maxLength={120}
          value={draft.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        {!isEditing && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remover item ${n} da revisão`}
            onClick={onRemove}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="draft-amount">
        <div className="draft-stepper">
          <button
            type="button"
            className="stepper-btn"
            aria-label={`Diminuir quantidade do item ${n}`}
            disabled={!canDecreaseQuantity(draft.quantity, draft.unit)}
            onClick={() => step(-1)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            min="0.001"
            step="any"
            aria-label={`Quantidade do item ${n}`}
            placeholder="Não informada"
            value={draft.quantity ?? ""}
            onChange={(e) =>
              onPatch({ quantity: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <button
            type="button"
            className="stepper-btn"
            aria-label={`Aumentar quantidade do item ${n}`}
            onClick={() => step(1)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        <PickerField
          label={`Unidade do item ${n}`}
          hideLabel
          value={draft.unit}
          options={UNIT_OPTIONS}
          onChange={(unit) => onPatch({ unit })}
        />
        <SegmentedControl
          label={`Guardar item ${n} em`}
          segments={LOCATION_SEGMENTS}
          value={draft.location}
          onChange={(location) => onPatch({ location })}
        />
      </div>
      <div className="draft-expiry-row">
        <div className="draft-expiry" role="group" aria-label={`Validade do item ${n}`}>
          {EXPIRY_SHORTCUTS.map((days) => {
            const date = shiftDate(today, days);
            const isOn = draft.expiresOn === date;
            return (
              <button
                key={days}
                type="button"
                className="expiry-chip"
                aria-pressed={isOn}
                aria-label={`+${days} dias de validade do item ${n}`}
                onClick={() => {
                  tapFeedback();
                  onPatch({ expiresOn: isOn ? null : date });
                }}
              >
                +{days} d
              </button>
            );
          })}
          <input
            type="date"
            aria-label={`Validade do item ${n}`}
            value={draft.expiresOn ?? ""}
            onChange={(e) => onPatch({ expiresOn: e.target.value || null })}
          />
        </div>
        <button
          type="button"
          className="text-btn draft-notes-toggle"
          aria-label={`Observação do item ${n}`}
          aria-expanded={showNotes}
          onClick={() => setShowNotes(!showNotes)}
        >
          Observação
        </button>
      </div>
      {showNotes && (
        <input
          className="draft-notes"
          aria-label={`Observações do item ${n}`}
          placeholder="Ex.: aberto, metade do pacote"
          maxLength={500}
          value={draft.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      )}
    </fieldset>
  );
}
