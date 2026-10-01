import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import "./Meal.css";

export interface SectionAction {
  label: string;
  /** Nome acessível quando o rótulo visível é curto ("Diário" → "Ver todas no Diário"); deve contê-lo. */
  ariaLabel?: string;
  onClick: () => void;
  /** Seta › depois do rótulo (padrão: sim). */
  chevron?: boolean;
}

type Props = {
  title: string;
  id?: string;
  level?: 2 | 3;
  /** title: "Refeições" fs-xl 800 · eyebrow: "SEUS FREQUENTES" fs-xs 800 caixa alta, cinza. */
  variant?: "title" | "eyebrow";
  icon?: LucideIcon;
  /** Contagem ou apoio à direita ("9 resultados", "4 dicas do agente"). */
  count?: string;
  action?: SectionAction;
  /** Outro conteúdo à direita (contador de combinados, menu ⋯). */
  extra?: ReactNode;
  className?: string;
};

/** Cabeçalho de seção fora de cartão: título à esquerda e uma ação ou contagem à direita. */
export function SectionHeader({
  title,
  id,
  level = 2,
  variant = "title",
  icon: Icon,
  count,
  action,
  extra,
  className,
}: Props) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={["section-header", `is-${variant}`, className].filter(Boolean).join(" ")}>
      <Heading id={id} className="section-header-title">
        {Icon && <Icon size={variant === "eyebrow" ? 14 : 20} aria-hidden="true" />}
        {title}
      </Heading>
      {count && <span className="section-header-count">{count}</span>}
      {extra}
      {action && (
        <button
          type="button"
          className="section-header-action"
          aria-label={action.ariaLabel}
          onClick={action.onClick}
        >
          {action.label}
          {action.chevron !== false && <ChevronRight size={16} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
