import { useId, type RefObject } from "react";
import { CalendarClock, ChefHat, Clock, Sparkles } from "lucide-react";
import { compactExpiry, pantryEmoji } from "../../lib/pantry-view";
import { firstUseModel, USE_FIRST_COPY, USE_FIRST_REMINDER, type UseFirstModel } from "../../lib/use-first";
import type { PantryItem } from "../../types";
import "./Kitchen.css";

type Props = {
  /**
   * "hero": primeiro bloco da Despensa (conceito 06); "card": cartão antigo da Despensa;
   * "strip": bloco dentro do cartão da despensa no Hoje.
   */
  variant: "hero" | "card" | "strip";
  items: readonly PantryItem[];
  today: string;
  hide: boolean;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Despensa: gerar receitas priorizando o que vence (mesmas regras de "Criar receitas"). */
  canGenerate?: boolean;
  onCreate?: () => void;
  /** Hoje: abrir a Despensa no cartão "Use primeiro". */
  onRecipes?: () => void;
  /** Hoje: "Agora não" (oculta até amanhã). */
  onDismiss?: () => void;
  /** hero: por que "Receitas com eles" está desligado (descrição do botão). */
  disabledReason?: string;
};

/** Cartão do topo da Despensa: título, "Receitas com eles" e um bloco por alimento que vence. */
function HeroCard({
  model,
  today,
  titleId,
  headingRef,
  canGenerate,
  onCreate,
  disabledReason,
}: {
  model: UseFirstModel;
  today: string;
  titleId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  canGenerate: boolean;
  onCreate?: () => void;
  disabledReason?: string;
}) {
  const leadId = `${titleId}-lead`;
  const reasonId = `${titleId}-reason`;
  const hasReason = !canGenerate && !!disabledReason;
  return (
    <section className="use-first is-hero" data-testid="use-first-card" aria-labelledby={titleId}>
      <div className="use-first-hero-head">
        <div className="use-first-hero-title">
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            {USE_FIRST_REMINDER.title}
          </h2>
          <p className="use-first-window">{USE_FIRST_COPY.window}</p>
        </div>
        <button
          type="button"
          className="use-first-go"
          aria-label={USE_FIRST_COPY.create}
          aria-describedby={hasReason ? reasonId : undefined}
          disabled={!canGenerate}
          onClick={onCreate}
        >
          <ChefHat size={18} aria-hidden="true" />
          {USE_FIRST_COPY.recipes}
        </button>
      </div>
      <ul className="use-first-tiles" aria-label={USE_FIRST_COPY.listLabel} aria-describedby={leadId}>
        {model.chips.map((chip) => (
          <li key={chip.id} className="use-first-tile" data-testid="use-first-chip">
            <span className="use-first-tile-glyph" aria-hidden="true">
              {pantryEmoji(chip.name)}
            </span>
            <span className="use-first-tile-when" aria-hidden="true">
              <Clock size={14} />
              {compactExpiry(chip.expiresOn, today)}
            </span>
            <span className="use-first-tile-name" aria-hidden="true">
              {chip.name}
            </span>
            <span className="sr-only">{chip.aria}</span>
          </li>
        ))}
        {model.more > 0 && (
          <li className="use-first-tile is-more">
            <span aria-hidden="true">{USE_FIRST_COPY.more(model.more)}</span>
            <span className="sr-only">{USE_FIRST_COPY.moreLabel(model.more)}</span>
          </li>
        )}
      </ul>
      <p id={leadId} className="sr-only">{`${model.lead} ${USE_FIRST_COPY.note}`}</p>
      {hasReason && (
        <p id={reasonId} className="sr-only">
          {disabledReason}
        </p>
      )}
    </section>
  );
}

/** Chips do que vence: emoji, nome e "vence em 2 d"; o leitor de tela ouve a frase inteira. */
function Chips({ model }: { model: UseFirstModel }) {
  return (
    <ul className="use-first-chips" aria-label={USE_FIRST_COPY.listLabel}>
      {model.chips.map((chip) => (
        <li key={chip.id} className="use-first-chip" data-testid="use-first-chip">
          <span className="use-first-emoji" aria-hidden="true">
            {pantryEmoji(chip.name)}
          </span>
          <span className="use-first-name" aria-hidden="true">
            {chip.name}
          </span>
          <span className="use-first-when" aria-hidden="true">
            {chip.short}
          </span>
          <span className="sr-only">{chip.aria}</span>
        </li>
      ))}
      {model.more > 0 && (
        <li className="use-first-more">
          <span aria-hidden="true">{USE_FIRST_COPY.more(model.more)}</span>
          <span className="sr-only">{USE_FIRST_COPY.moreLabel(model.more)}</span>
        </li>
      )}
    </ul>
  );
}

/**
 * "Use primeiro" (AGENTE-13): o que vence nos próximos 3 dias, pela validade que a pessoa
 * informou. Tom de "confira antes de usar", nunca alarme nem vermelho. Nada vence → nada aparece.
 */
export function UseFirstCard({
  variant,
  items,
  today,
  hide,
  headingRef,
  canGenerate = false,
  onCreate,
  onRecipes,
  onDismiss,
  disabledReason,
}: Props) {
  const titleId = useId();
  const model = firstUseModel(items, today, hide);
  if (!model) return null;
  if (variant === "hero")
    return (
      <HeroCard
        model={model}
        today={today}
        titleId={titleId}
        headingRef={headingRef}
        canGenerate={canGenerate}
        onCreate={onCreate}
        disabledReason={disabledReason}
      />
    );
  if (variant === "strip")
    return (
      <section className="use-first-strip" data-testid="use-first-hoje" aria-labelledby={titleId}>
        <h3 id={titleId}>
          <CalendarClock size={16} aria-hidden="true" />
          {USE_FIRST_REMINDER.title}
        </h3>
        <p className="use-first-lead">{model.lead}</p>
        <Chips model={model} />
        <div className="use-first-actions">
          <button type="button" className="btn-secondary" onClick={onRecipes}>
            <ChefHat size={16} aria-hidden="true" />
            {USE_FIRST_COPY.recipes}
          </button>
          <button
            type="button"
            className="text-btn use-first-dismiss"
            aria-label={USE_FIRST_COPY.dismissLabel}
            onClick={onDismiss}
          >
            {USE_FIRST_COPY.dismiss}
          </button>
        </div>
      </section>
    );
  return (
    <section className="card use-first" data-testid="use-first-card" aria-labelledby={titleId}>
      <h2 id={titleId} ref={headingRef} tabIndex={-1}>
        <CalendarClock size={19} aria-hidden="true" />
        {USE_FIRST_REMINDER.title}
      </h2>
      <p className="use-first-lead">{model.lead}</p>
      <Chips model={model} />
      <button type="button" className="btn use-first-create" disabled={!canGenerate} onClick={onCreate}>
        <Sparkles size={17} aria-hidden="true" />
        {USE_FIRST_COPY.create}
      </button>
      <p className="hint">{USE_FIRST_COPY.note}</p>
    </section>
  );
}
