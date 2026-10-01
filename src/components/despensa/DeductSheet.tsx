import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { COOK_COPY } from "../../lib/cook-timer";
import {
  canDecreaseRow,
  deductChoices,
  deductDetail,
  deductSummary,
  setDeductChoice,
  stepDeductRow,
  type DeductChoice,
  type DeductRow,
} from "../../lib/pantry-deduct";
import { fmtPantryQuantity } from "../../lib/pantry-view";
import { visiblePlainText } from "../../lib/text";
import { SegmentedControl } from "../SegmentedControl";
import { Modal } from "../UI";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import "./Cook.css";

type Props = {
  rows: readonly DeductRow[];
  hide: boolean;
  /** "Atualizar despensa" gravando: o botão fica desativado (um toque duplo desconta uma vez). */
  isBusy?: boolean;
  onConfirm: (rows: DeductRow[]) => void;
  onClose: () => void;
};

/**
 * "Descontar da despensa" (AGENTE-11): para cada item da casa usado na receita, a pessoa diz se
 * não mexe, se sobrou (quanto) ou se acabou. A sugestão vem de uma leitura segura da receita; nada
 * muda antes de "Atualizar despensa".
 */
export function DeductSheet({ rows: initial, hide, isBusy = false, onConfirm, onClose }: Props) {
  const [rows, setRows] = useState<DeductRow[]>(() => [...initial]);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(isBusy, confirmButton);
  const update = (index: number, change: (row: DeductRow) => DeductRow) =>
    setRows((current) => current.map((row, i) => (i === index ? change(row) : row)));
  return (
    <Modal title={COOK_COPY.deduct} onClose={onClose} className="deduct-sheet">
      <ul className="deduct-rows">
        {rows.map((row, index) => {
          const name = visiblePlainText(row.name, hide);
          return (
            <li key={row.itemId} className="deduct-row">
              <h3>{name}</h3>
              <p className="deduct-detail">{deductDetail(row, hide)}</p>
              <SegmentedControl<DeductChoice>
                label={`O que ficou de ${name}`}
                segments={deductChoices(row).map((choice) => ({
                  value: choice,
                  label: COOK_COPY.deductChoices[choice],
                }))}
                value={row.choice}
                onChange={(choice) => update(index, (r) => setDeductChoice(r, choice))}
              />
              {row.choice === "left" && (
                <div className="deduct-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label={`Diminuir quantidade de ${name}`}
                    disabled={!canDecreaseRow(row)}
                    onClick={() => update(index, (r) => stepDeductRow(r, -1))}
                  >
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <output className="deduct-amount" aria-live="polite">
                    {fmtPantryQuantity(row.remaining, row.unit)}
                  </output>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label={`Aumentar quantidade de ${name}`}
                    onClick={() => update(index, (r) => stepDeductRow(r, 1))}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="deduct-summary" role="status">
        {deductSummary(rows)}
      </p>
      <div className="form-actions deduct-actions">
        <button
          ref={confirmButton}
          type="button"
          className="btn"
          disabled={isBusy}
          aria-busy={isBusy}
          onClick={() => onConfirm(rows)}
        >
          {COOK_COPY.deductConfirm}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
