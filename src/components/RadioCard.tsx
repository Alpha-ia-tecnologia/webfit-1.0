import type { ReactNode } from "react";
import { Check } from "lucide-react";
import "./RadioCard.css";

type Props = {
  /** name do grupo (setas do teclado e o contrato input[name][value] dos testes). */
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Bloco à esquerda (row) ou em cima (tile): emoji, ícone. */
  media?: ReactNode;
  /** Pílulas ou dica abaixo do texto. */
  footer?: ReactNode;
  /** radio: bolinha vazia/cheia · check: círculo com ✓ quando marcado. */
  indicator?: "radio" | "check";
  /** row: cartão largo (opções de refeição) · tile: bloco grande lado a lado (Sim/Não). */
  layout?: "row" | "tile";
  describedBy?: string;
  isInvalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Cartão selecionável: um <label> em volta de um rádio nativo visualmente oculto (setas, Tab, leitor
 * de tela e formulários continuam nativos). Marcado: borda verde de 2 px e halo menta; o foco do
 * teclado aparece no cartão inteiro.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  subtitle,
  media,
  footer,
  indicator = "check",
  layout = "row",
  describedBy,
  isInvalid = false,
  disabled = false,
  className,
}: Props) {
  const classes = [
    "radio-card",
    `is-${layout}`,
    checked ? "is-checked" : "",
    disabled ? "is-disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={classes}>
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o foco no primeiro campo inválido (ScreenAnamnese) procura input[aria-invalid] */}
      <input
        type="radio"
        className="radio-card-input"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        onChange={() => onChange(value)}
      />
      {media && <span className="radio-card-media">{media}</span>}
      <span className="radio-card-body">
        <span className="radio-card-title">{title}</span>
        {subtitle && <span className="radio-card-subtitle">{subtitle}</span>}
        {footer && <span className="radio-card-footer">{footer}</span>}
      </span>
      <span className={`radio-card-indicator is-${indicator}`} aria-hidden="true">
        {checked && indicator === "check" && <Check size={14} strokeWidth={3} />}
      </span>
    </label>
  );
}
