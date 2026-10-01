import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Modal } from "./UI";
import "./Controls.css";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Seleção em folha (SIS-08), no lugar do <select> nativo: o campo mostra o valor atual e abre
 * uma lista de opções com o rádio da marca. Um toque escolhe e fecha; no teclado, as setas trocam
 * a opção e Enter (ou Esc) fecha. O foco volta ao campo.
 */
export function PickerField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Rótulo só para leitores de tela (linhas compactas); o campo continua nomeado por ele. */
  hideLabel?: boolean;
}) {
  const [isOpen, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const valueId = useId();
  const name = useId();
  const current = options.find((o) => o.value === value)?.label ?? "Escolher";
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <div className="field">
      <span id={labelId} className={hideLabel ? "field-label sr-only" : "field-label"}>
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        className="picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span id={valueId}>{current}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {isOpen && (
        <Modal title={label} onClose={close}>
          <div className="picker-options" role="radiogroup" aria-label={label}>
            {options.map((option) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- o teclado usa o rádio nativo (setas trocam, Enter fecha); o clique no rótulo só atende toque e mouse
              <label
                key={option.value}
                className="picker-option"
                // Toque ou clique (detail ≥ 1) escolhe e fecha; as setas do teclado só trocam a opção.
                onClick={(event) => {
                  if (event.detail === 0) return;
                  onChange(option.value);
                  close();
                }}
              >
                <input
                  type="radio"
                  className="radio"
                  name={name}
                  value={option.value}
                  checked={option.value === value}
                  data-autofocus={option.value === value ? "" : undefined}
                  onChange={() => onChange(option.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      close();
                    }
                  }}
                />
                <span>{option.label}</span>
                {option.value === value && <Check size={18} aria-hidden="true" />}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
