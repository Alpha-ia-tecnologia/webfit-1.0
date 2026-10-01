import { ArrowRightLeft, MessageCircle, Plus, SlidersHorizontal } from "lucide-react";
import type { DietSlot } from "../../lib/diet-plan";
import { PLAN_DAY_COPY } from "../../lib/diet-week";

/** Ações de uma refeição de hoje (AGENTE-09), sem IA: registrar do plano, trocar e ajustar. */
export interface PlanMealHandlers {
  /** Algum item tem troca revisada e segura (sem alérgeno declarado). */
  canSwap: boolean;
  /** "Pedir outra opção" só com o agente autorizado. */
  canAsk: boolean;
  isBusy: boolean;
  onEat: () => void;
  onAdjust: () => void;
  onSwap: () => void;
  onAsk: () => void;
}

/**
 * "+ Registrar": registra do plano com Desfazer (todos os itens na TACO, sem alérgeno) ou abre a
 * revisão. primary = a próxima refeição (preenchido); outline = futura ou passada (sem cobrança).
 */
export function MealRegisterButton({
  slot,
  handlers,
  tone,
  compact = false,
}: {
  slot: DietSlot;
  handlers: PlanMealHandlers;
  tone: "primary" | "outline";
  /** Passada recolhida: botão de 40 px no cabeçalho, sem o "+". */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`plan-register is-${tone}${compact ? " is-compact" : ""}`}
      aria-label={PLAN_DAY_COPY.eatLabel(slot)}
      disabled={handlers.isBusy}
      onClick={handlers.onEat}
    >
      {!compact && <Plus size={18} strokeWidth={2.5} aria-hidden="true" />}
      {PLAN_DAY_COPY.eat}
    </button>
  );
}

/** "Ajustar e registrar": abre o prato para conferir antes de salvar (botão de texto sob as ações). */
export function MealAdjustButton({ slot, handlers }: { slot: DietSlot; handlers: PlanMealHandlers }) {
  return (
    <button
      type="button"
      className="plan-adjust"
      aria-label={PLAN_DAY_COPY.adjustLabel(slot)}
      disabled={handlers.isBusy}
      onClick={handlers.onAdjust}
    >
      <SlidersHorizontal size={14} aria-hidden="true" />
      {PLAN_DAY_COPY.adjust}
    </button>
  );
}

/**
 * Rodapé da refeição aberta: "⇄ Trocar refeição" (gira as trocas revisadas) ou "Pedir outra
 * opção" (só preenche o chat) e, fora da passada, "+ Registrar".
 */
export function MealActions({
  slot,
  handlers,
  register,
}: {
  slot: DietSlot;
  handlers: PlanMealHandlers;
  /** null = sem "Registrar" aqui (passada: ele fica no cabeçalho do cartão). */
  register: "primary" | "outline" | null;
}) {
  return (
    <div className="meal-actions-wrap">
      <div className="meal-actions">
        {handlers.canSwap ? (
          <button
            type="button"
            className="plan-swap-meal"
            aria-label={PLAN_DAY_COPY.swapLabel(slot)}
            onClick={handlers.onSwap}
          >
            <ArrowRightLeft size={16} aria-hidden="true" />
            {PLAN_DAY_COPY.swap}
          </button>
        ) : (
          handlers.canAsk && (
            <button
              type="button"
              className="plan-swap-meal"
              aria-label={PLAN_DAY_COPY.askLabel(slot)}
              onClick={handlers.onAsk}
            >
              <MessageCircle size={16} aria-hidden="true" />
              {PLAN_DAY_COPY.ask}
            </button>
          )
        )}
        {register && <MealRegisterButton slot={slot} handlers={handlers} tone={register} />}
      </div>
      <MealAdjustButton slot={slot} handlers={handlers} />
    </div>
  );
}
