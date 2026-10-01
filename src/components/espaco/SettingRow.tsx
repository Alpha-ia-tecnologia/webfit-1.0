import { ChevronRight, type LucideIcon } from "lucide-react";
import type { Domain } from "../../design/tokens";
import { IconTile } from "../IconTile";

/**
 * Linha de preferência com interruptor (ESPACO-10). Só o texto fica dentro do <label>, então o
 * nome acessível do switch é exatamente o rótulo.
 */
export function SwitchRow({
  id,
  icon,
  tone = "neutral",
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: LucideIcon;
  tone?: Domain;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <li className="set-row">
      <IconTile tone={tone} size="md" icon={icon} className="set-icon" />
      <label className="set-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </li>
  );
}

/** Linha que abre uma folha ou outra tela; o valor atual aparece à direita. */
export function ValueRow({
  icon,
  tone = "neutral",
  label,
  value,
  opensDialog = false,
  onClick,
}: {
  icon: LucideIcon;
  tone?: Domain;
  label: string;
  value: string;
  /** true quando abre uma folha (aria-haspopup="dialog"). */
  opensDialog?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="set-row is-button"
        aria-haspopup={opensDialog ? "dialog" : undefined}
        onClick={onClick}
      >
        <IconTile tone={tone} size="md" icon={icon} className="set-icon" />
        <span className="set-label">{label}</span>
        <span className="set-value">{value}</span>
        <ChevronRight className="set-chevron" size={18} aria-hidden="true" />
      </button>
    </li>
  );
}
