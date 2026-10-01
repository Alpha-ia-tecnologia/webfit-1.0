import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import type { Domain } from "../design/tokens";
import "./IconTile.css";

/** 24 / 36 / 44 / 72 px. */
export type IconTileSize = "sm" | "md" | "lg" | "xl";

const ICON_PX: Record<IconTileSize, number> = { sm: 14, md: 18, lg: 22, xl: 32 };

export interface IconTileProps {
  tone?: Domain;
  size?: IconTileSize;
  icon?: LucideIcon;
  /** Emoji ou caractere no lugar do ícone (ex.: 🍅 de um alimento). */
  glyph?: string;
  className?: string;
  testId?: string;
}

/**
 * Bloco arredondado no tom do domínio (SIS-11), com um ícone do lucide ou um emoji.
 * Sempre decorativo: o texto ao lado já diz o que é.
 */
export function IconTile({
  tone = "neutral",
  size = "md",
  icon: Icon,
  glyph,
  className,
  testId,
}: IconTileProps) {
  const style = {
    "--tile-bg": `var(--wf-tone-${tone}-bg)`,
    "--tile-fg": `var(--wf-tone-${tone}-fg)`,
  } as CSSProperties;
  return (
    <span
      className={["icon-tile", `icon-tile-${size}`, className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
      data-testid={testId}
    >
      {Icon ? <Icon size={ICON_PX[size]} /> : glyph}
    </span>
  );
}
