import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Tone } from "../../lib/today";
import { FoodGlyph, GlyphStack, type GlyphTone } from "./FoodGlyph";
import { KcalStat } from "./KcalStat";
import { MacroBar, type MacroShare } from "./MacroBar";
import "./Meal.css";

/** Tom da refeição no cartão: café âmbar, almoço menta, lanche azul-claro, jantar/ceia índigo. */
export type MealCardTone = "amber" | "mint" | "sky" | "indigo";

/** mealTone(entry) (lib/today.ts) → tom do cartão. Lanche fica azul (rosa é só para erro). */
export function mealCardTone(tone: Tone): MealCardTone {
  return tone === "amber" ? "amber" : tone === "emerald" ? "mint" : tone === "sky" ? "sky" : "indigo";
}

type Props = {
  /**
   * card: linha do Hoje (cartão inteiro edita, com barra P/C/G e kcal empilhada).
   * slot: refeição ainda vazia, tracejada, com a ação em `trailing` (ou o cartão todo com onPress).
   * group: grupo do Diário (cabeçalho com subtotal e "+" em `trailing`; as linhas em `children`).
   * collapsed / open: refeição do plano na Dieta (recolhida com a pilha de emojis; aberta com os itens).
   */
  variant: "card" | "slot" | "group" | "collapsed" | "open";
  title: string;
  headingLevel?: 2 | 3;
  subtitle?: ReactNode;
  /** Linha extra sob o subtítulo (Dieta: "≈ 180 kcal · 9 g proteína"). */
  meta?: ReactNode;
  glyph?: string | null;
  /** collapsed: até 3 emojis sobrepostos. */
  glyphs?: readonly string[];
  /** Ícone da refeição (reserva do emoji e ícone do slot/grupo). */
  icon?: LucideIcon;
  tone: MealCardTone;
  /** Barra P/C/G (card: sob o subtítulo; open: antes do rodapé). */
  share?: MacroShare | null;
  /** Nome acessível da barra (sem ele, decorativa). */
  shareLabel?: string;
  /** kcal do registro/TACO; null ou ausente = sem número (hideCalories, perfil sensível). */
  kcal?: number | null;
  kcalApprox?: boolean;
  /** Selo no canto (Dieta: "● Próxima", "✓ Feita às 12:41"). */
  badge?: ReactNode;
  /** Controle à direita (grupo "+", pílula "+ Adicionar", "Registrar", menu ⋯). Fica acima do toque do cartão. */
  trailing?: ReactNode;
  /** O cartão inteiro vira um botão (card, slot compacto). Precisa de pressLabel. */
  onPress?: () => void;
  pressLabel?: string;
  /** collapsed/open: o cabeçalho abre e fecha o corpo (aria-expanded). */
  isExpanded?: boolean;
  onToggle?: () => void;
  /** next: borda menta e halo (próxima refeição); done: fundo menta suave (feita). */
  emphasis?: "next" | "done" | null;
  children?: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** slot compacto: meia largura (Diário), bloco 40. */
  compact?: boolean;
  className?: string;
};

const GLYPH_TONE: Record<MealCardTone, GlyphTone> = {
  amber: "amber",
  mint: "mint",
  sky: "sky",
  indigo: "indigo",
};

/**
 * Cartão de refeição compartilhado (Hoje, Diário, Dieta). Números só do registro ou da TACO; nada de
 * vermelho para "acima". Quando o cartão inteiro é tocável, um botão cobre o cartão (o título continua
 * um cabeçalho) e os controles de `trailing` ficam por cima dele.
 */
export function MealCard({
  variant,
  title,
  headingLevel = 3,
  subtitle,
  meta,
  glyph,
  glyphs,
  icon,
  tone,
  share,
  shareLabel,
  kcal,
  kcalApprox = false,
  badge,
  trailing,
  onPress,
  pressLabel,
  isExpanded,
  onToggle,
  emphasis,
  children,
  footer,
  testId,
  compact = false,
  className,
}: Props) {
  const bodyId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const hasKcal = kcal !== null && kcal !== undefined;
  const isPlan = variant === "collapsed" || variant === "open";
  const isToggleable = isPlan && !!onToggle;
  const hasBody = !!children || (variant === "open" && !!share) || !!footer;
  const classes = [
    "meal-card",
    `is-${variant}`,
    `tone-${tone}`,
    compact ? "is-compact" : "",
    onPress ? "is-pressable" : "",
    isToggleable ? "is-toggleable" : "",
    emphasis ? `is-${emphasis}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const tileSize = variant === "open" || variant === "group" || compact ? 40 : 44;
  const tile =
    variant === "collapsed" && glyphs?.length ? (
      <GlyphStack glyphs={glyphs} size={28} />
    ) : (
      <FoodGlyph
        glyph={variant === "slot" || variant === "group" ? null : glyph}
        icon={icon}
        size={tileSize}
        tone={variant === "collapsed" ? "surface" : GLYPH_TONE[tone]}
        bordered={variant === "group" || variant === "slot"}
        className="meal-card-tile"
      />
    );
  // Recolhível (Dieta): o título é um cabeçalho com o botão dentro (padrão de disclosure); o ::after do
  // botão estende o toque ao cabeçalho inteiro do cartão.
  const heading = isToggleable ? (
    <Heading className="meal-card-title">
      <button
        type="button"
        className="meal-card-toggle"
        aria-expanded={!!isExpanded}
        aria-controls={hasBody ? bodyId : undefined}
        onClick={onToggle}
      >
        {title}
      </button>
    </Heading>
  ) : (
    <Heading className="meal-card-title">{title}</Heading>
  );
  const text = (
    <div className="meal-card-text">
      {heading}
      {subtitle && <div className="meal-card-subtitle">{subtitle}</div>}
      {meta && <div className="meal-card-meta">{meta}</div>}
      {variant === "card" && share && <MacroBar share={share} size="md" label={shareLabel} />}
    </div>
  );
  const kcalBlock =
    hasKcal && (variant === "card" || variant === "group") ? (
      <KcalStat
        value={kcal}
        approx={kcalApprox}
        layout={variant === "card" ? "stack" : "inline"}
        className="meal-card-kcal"
      />
    ) : null;

  const head = (
    <div className="meal-card-head">
      {tile}
      {text}
      {kcalBlock}
      {badge && <span className="meal-card-badge">{badge}</span>}
      {trailing && <div className="meal-card-trailing">{trailing}</div>}
    </div>
  );
  // Recolhido: o corpo fica no DOM com hidden (o aria-controls do cabeçalho continua válido).
  const isHidden = isToggleable && !isExpanded;
  return (
    <article className={classes} data-testid={testId}>
      {head}
      {hasBody && (
        <div className="meal-card-body" id={bodyId} hidden={isHidden}>
          {children}
          {variant === "open" && share && (
            <MacroBar share={share} size="lg" label={shareLabel} className="meal-card-bar" />
          )}
          {footer && <div className="meal-card-footer">{footer}</div>}
        </div>
      )}
      {onPress && (
        <button type="button" className="meal-card-hit" aria-label={pressLabel ?? title} onClick={onPress} />
      )}
    </article>
  );
}
