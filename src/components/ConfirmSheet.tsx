import { useCallback } from "react";
import type { ConfirmOptions } from "../types";
import { Modal } from "./UI";

export type { ConfirmOptions };

/**
 * Confirmação do app no lugar do window.confirm, só para o que não tem volta
 * (ou substitui um dado). O resto usa o aviso com "Desfazer".
 */
export function ConfirmSheet({
  options,
  onClose,
}: {
  options: ConfirmOptions;
  onClose: (confirmed: boolean) => void;
}) {
  const cancel = useCallback(() => onClose(false), [onClose]);
  return (
    <Modal title={options.title} onClose={cancel}>
      <div className="confirm-sheet">
        <p>{options.message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={cancel}>
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            className={options.tone === "danger" ? "btn btn-danger" : "btn"}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
