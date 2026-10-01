import { useRef } from "react";
import { CalendarDays } from "lucide-react";

type Props = {
  /** Data escolhida (AAAA-MM-DD). */
  value: string;
  /** Última data aceita (hoje: o diário não tem futuro). */
  max: string;
  onChange: (date: string) => void;
  /** Nome acessível do botão que abre o calendário. */
  buttonLabel?: string;
  /** Nome acessível do campo de data (continua acessível para quem digita a data). */
  inputLabel?: string;
  className?: string;
};

/**
 * Botão de calendário com o campo de data nativo por baixo (showPicker). Sem showPicker (Safari
 * antigo), o foco vai para o campo. Datas depois de `max` são ignoradas.
 */
export function DatePickerButton({
  value,
  max,
  onChange,
  buttonLabel = "Escolher data no calendário",
  inputLabel = "Escolher data",
  className,
}: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };
  return (
    <span className={["date-picker", className].filter(Boolean).join(" ")}>
      <button type="button" className="icon-btn" aria-label={buttonLabel} onClick={open}>
        <CalendarDays size={20} aria-hidden="true" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-label={inputLabel}
        value={value}
        max={max}
        onChange={(e) => {
          if (e.target.value && e.target.value <= max) onChange(e.target.value);
        }}
      />
    </span>
  );
}
