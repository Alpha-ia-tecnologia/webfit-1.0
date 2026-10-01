import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import "./Meal.css";

/** Lado do bloco em px. O emoji fica em ~55% do lado (degrau da escala por tamanho). */
export type GlyphSize = 28 | 34 | 40 | 44 | 48 | 56;
/** Fundo do bloco: neutro (surface-3) ou o tom da refeição (café âmbar, almoço menta…). */
export type GlyphTone = "surface" | "amber" | "mint" | "sky" | "indigo" | "mind";

const ICON_PX: Record<GlyphSize, number> = { 28: 14, 34: 16, 40: 18, 44: 20, 48: 22, 56: 24 };

type Props = {
  /** Emoji do alimento/refeição (food-glyph.ts); null/ausente usa o ícone. */
  glyph?: string | null;
  /** Ícone lucide de reserva (ex.: o da refeição). */
  icon?: LucideIcon;
  size?: GlyphSize;
  tone?: GlyphTone;
  shape?: "tile" | "circle";
  /** Borda de 1 px no tom (grupo do Diário, item da Dieta). */
  bordered?: boolean;
  /** Anel da cor do cartão (pilha de emojis). */
  ring?: boolean;
  className?: string;
};

/** Bloco com o emoji do alimento (ou um ícone). Sempre decorativo: o texto ao lado diz o que é. */
export function FoodGlyph({
  glyph,
  icon: Icon,
  size = 44,
  tone = "surface",
  shape = "tile",
  bordered = false,
  ring = false,
  className,
}: Props) {
  const style = { "--glyph-size": `${size}px` } as CSSProperties;
  const classes = [
    "food-glyph",
    `is-${size}`,
    `tone-${tone}`,
    shape === "circle" ? "is-circle" : "",
    bordered ? "is-bordered" : "",
    ring ? "has-ring" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} style={style} aria-hidden="true">
      {glyph ? glyph : Icon ? <Icon size={ICON_PX[size]} /> : null}
    </span>
  );
}

/** Até 3 emojis sobrepostos (refeição recolhida da Dieta), cada um num círculo com anel. */
export function GlyphStack({ glyphs, size = 34 }: { glyphs: readonly string[]; size?: GlyphSize }) {
  const shown = glyphs.slice(0, 3);
  if (!shown.length) return null;
  return (
    <span className="glyph-stack" aria-hidden="true">
      {shown.map((glyph, i) => (
        <FoodGlyph key={`${glyph}-${i}`} glyph={glyph} size={size} shape="circle" ring />
      ))}
    </span>
  );
}
