import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Domain } from "../design/tokens";
import "./Pill.css";

type Props = {
  /** Domínio da cor (--wf-tone-*): neutral, food, water, warn (validade), danger (só vencido/erro), mind… */
  tone?: Domain;
  /**
   * soft: fundo e borda claros do tom (padrão) · outline: superfície com borda cinza e texto no tom ·
   * solid: preenchido (só food = verde da marca, neutral = navy), texto claro.
   */
  variant?: "soft" | "outline" | "solid";
  icon?: LucideIcon;
  /** Emoji antes do texto (decorativo). */
  emoji?: string;
  /** Texto só para leitores de tela, depois do visível ("que vence em 2 dias"). */
  srText?: string;
  /** sm 28 px (fs-sm) · md 34 px (fs-base). */
  size?: "sm" | "md";
  testId?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Pílula de informação (não é botão): kcal/proteína das opções do agente, "O que considerei",
 * validade na despensa, selo da receita, estratégia do plano. Cores só dos tokens de domínio.
 */
export function Pill({
  tone = "neutral",
  variant = "soft",
  icon: Icon,
  emoji,
  srText,
  size = "sm",
  testId,
  className,
  children,
}: Props) {
  const solid = variant === "solid" && (tone === "food" || tone === "neutral");
  const classes = [
    "pill-chip",
    `tone-${tone}`,
    `is-${solid ? "solid" : variant === "solid" ? "soft" : variant}`,
    `is-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} data-testid={testId}>
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />}
      <span>{children}</span>
      {srText && <span className="sr-only"> {srText}</span>}
    </span>
  );
}
