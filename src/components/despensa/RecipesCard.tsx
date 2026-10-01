import { useId, useState } from "react";
import { ChefHat, RotateCcw } from "lucide-react";
import type { AppState, KitchenBasicKey } from "../../types";
import { RecipeGenerateSheet } from "./RecipeGenerateSheet";
import { RecipeList } from "./RecipeList";
import { AreaAlert, AreaStatus, type PantryBusy, type PantryError } from "./shared";
import "./Recipes.css";

interface Props {
  state: AppState;
  hide: boolean;
  /** Por que as receitas não podem ser geradas agora (dieta, anamnese, estoque); "" quando podem. */
  reason: string;
  canGenerate: boolean;
  isReviewing: boolean;
  busy: PantryBusy;
  error: PantryError | null;
  onGenerate: () => void;
  onCancel: () => void;
  onToggleBasic: (key: KitchenBasicKey) => void;
  onDiet: () => void;
}

/**
 * Receitas para a dieta (AGENTE-04, conceito 06): título com "Novas" e o carrossel de receitas. Os
 * básicos da cozinha (IA-X4) e "Criar receitas com meus alimentos" ficam na folha de "Novas"; o
 * andamento e o erro aparecem aqui, sob o título.
 */
export function RecipesCard(props: Props) {
  const { state, hide, busy } = props;
  const [isGenerating, setGenerating] = useState(false);
  const titleId = useId();
  const hasRecipes = state.recipes.length > 0;
  const open = () => setGenerating(true);
  return (
    <section className="pantry-recipes" aria-labelledby={titleId}>
      <div className="pantry-section-head">
        <h2 id={titleId}>Receitas para sua dieta</h2>
        <button
          type="button"
          className="pantry-section-link"
          aria-label="Criar novas receitas"
          onClick={open}
        >
          <RotateCcw size={18} aria-hidden="true" />
          Novas
        </button>
      </div>
      <AreaStatus area="recipes" busy={busy} onCancel={props.onCancel} />
      <AreaAlert area="recipes" error={props.error} hide={hide} />
      {hasRecipes ? (
        <RecipeList state={state} hide={hide} />
      ) : (
        <div className="recipe-empty">
          <span className="recipe-empty-icon" aria-hidden="true">
            <ChefHat size={24} />
          </span>
          <p>Receitas com o que você tem em casa, no ritmo da sua dieta.</p>
          <button type="button" className="btn" onClick={open}>
            Criar receitas
          </button>
        </div>
      )}
      {isGenerating && (
        <RecipeGenerateSheet
          state={state}
          reason={props.reason}
          canGenerate={props.canGenerate}
          isReviewing={props.isReviewing}
          isBusy={!!busy}
          onToggleBasic={props.onToggleBasic}
          onGenerate={() => {
            setGenerating(false);
            props.onGenerate();
          }}
          onDiet={props.onDiet}
          onClose={() => setGenerating(false)}
        />
      )}
    </section>
  );
}
