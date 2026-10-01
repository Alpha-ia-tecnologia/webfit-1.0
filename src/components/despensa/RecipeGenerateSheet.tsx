import { Sparkles } from "lucide-react";
import { recipeGeneratedLabel } from "../../lib/recipe-set";
import type { AppState, KitchenBasicKey } from "../../types";
import { Modal } from "../UI";
import { KitchenBasics } from "./KitchenBasics";
import "./Recipes.css";

/**
 * Folha "Novas receitas" (conceito 06): o que antes ocupava ~560 px da tela — básicos da cozinha,
 * o motivo quando não dá para gerar, a autorização do agente — e "Criar receitas com meus
 * alimentos". Gerar fecha a folha; o andamento aparece sob "Receitas para sua dieta".
 */
export function RecipeGenerateSheet({
  state,
  reason,
  canGenerate,
  isReviewing,
  isBusy,
  onToggleBasic,
  onGenerate,
  onDiet,
  onClose,
}: {
  state: AppState;
  reason: string;
  canGenerate: boolean;
  isReviewing: boolean;
  isBusy: boolean;
  onToggleBasic: (key: KitchenBasicKey) => void;
  onGenerate: () => void;
  onDiet: () => void;
  onClose: () => void;
}) {
  const latest = state.recipes.at(-1);
  return (
    <Modal title="Novas receitas" onClose={onClose} className="recipe-generate-sheet">
      <p className="muted">
        Receitas com os alimentos que você cadastrou, de acordo com o seu plano.
      </p>
      {reason && <p className="notice">{reason}</p>}
      <KitchenBasics selected={state.kitchenBasics} isDisabled={isBusy} onToggle={onToggleBasic} />
      {!state.profile?.consentAi && (
        <p className="hint">Para criar receitas, autorize o agente em Meu espaço.</p>
      )}
      {isReviewing && (
        <p className="hint">Confirme ou descarte a revisão antes de gerar receitas.</p>
      )}
      <div className="form-actions recipe-actions">
        <button type="button" className="btn" disabled={!canGenerate} onClick={onGenerate}>
          <Sparkles size={17} aria-hidden="true" />
          Criar receitas com meus alimentos
        </button>
        <button type="button" className="btn-secondary" onClick={onDiet}>
          Ver minha dieta
        </button>
      </div>
      {latest && <p className="hint recipe-generated">{`Últimas: ${recipeGeneratedLabel(latest.createdAt)}`}</p>}
    </Modal>
  );
}
