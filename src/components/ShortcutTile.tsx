import { ChevronRight, type LucideIcon } from "lucide-react";
import type { Domain } from "../design/tokens";
import { IconTile } from "./IconTile";
import "./ShortcutTile.css";

export interface ShortcutSecondary {
  label: string;
  /** Nome acessível quando o rótulo é curto ("Registrar" → "Conferir e registrar: Almoço"); deve contê-lo ou começar por ele. */
  ariaLabel?: string;
  onClick: () => void;
}

type Props = {
  icon: LucideIcon;
  tone: Domain;
  /** Título (tile: 1 linha fs-md 800; row: cabeçalho h2/h3). Sem título, o texto ocupa o lugar. */
  title?: string;
  /** Apoio (fs-base cinza): "2 vencem logo", "Próxima refeição · Almoço · 12:00". */
  text?: string;
  /** Linhas do texto antes de cortar com "…". */
  lines?: 1 | 2;
  /** Ponto colorido antes do texto (ex.: validade perto, âmbar). */
  dot?: Domain;
  /** Ação do atalho inteiro (o cartão todo é tocável). */
  onClick: () => void;
  /** Nome acessível do atalho inteiro (padrão: o título). */
  ariaLabel?: string;
  /**
   * Segunda ação, acima do toque do cartão: row = pílula antes da seta ("Registrar");
   * tile = substitui o texto por um botão ("Ver lista (3)").
   */
  secondary?: ShortcutSecondary;
  /** tile: 72 px na grade de 2 colunas · row: linha de 72 px na largura toda, com seta. */
  layout?: "tile" | "row";
  headingLevel?: 2 | 3;
  testId?: string;
  className?: string;
};

/**
 * Atalho com ícone no tom do domínio (Dieta "Para facilitar", linhas compactas do Hoje). Um botão
 * cobre o cartão (o título continua cabeçalho) e a segunda ação fica por cima dele.
 */
export function ShortcutTile({
  icon,
  tone,
  title,
  text,
  lines = 1,
  dot,
  onClick,
  ariaLabel,
  secondary,
  layout = "tile",
  headingLevel = 3,
  testId,
  className,
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const isRow = layout === "row";
  const showSecondaryInText = !isRow && !!secondary;
  return (
    <section
      className={["shortcut-tile", `is-${layout}`, `lines-${lines}`, title ? "" : "is-text-only", className]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
    >
      <IconTile tone={tone} size={isRow ? "lg" : "md"} icon={icon} className="shortcut-tile-icon" />
      <div className="shortcut-tile-text">
        {title && <Heading className="shortcut-tile-title">{title}</Heading>}
        {showSecondaryInText ? (
          <button
            type="button"
            className="shortcut-tile-link"
            aria-label={secondary.ariaLabel}
            onClick={secondary.onClick}
          >
            {secondary.label}
          </button>
        ) : (
          text && (
            <p className="shortcut-tile-sub">
              {dot && <i className="shortcut-tile-dot" style={{ background: `var(--wf-tone-${dot}-fg)` }} aria-hidden="true" />}
              {text}
            </p>
          )
        )}
      </div>
      {isRow && secondary && (
        <button
          type="button"
          className="btn btn-sm shortcut-tile-action"
          aria-label={secondary.ariaLabel}
          onClick={secondary.onClick}
        >
          {secondary.label}
        </button>
      )}
      {isRow && <ChevronRight size={20} className="shortcut-tile-chevron" aria-hidden="true" />}
      <button
        type="button"
        className="shortcut-tile-hit"
        aria-label={ariaLabel ?? title ?? text}
        onClick={onClick}
      />
    </section>
  );
}
