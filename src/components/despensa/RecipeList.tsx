import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { recipeStatus } from "../../lib/pantry";
import {
  RECIPE_QUESTIONS_HINT,
  RECIPE_STALE_NOTICE,
  recipeGeneratedLabel,
} from "../../lib/recipe-set";
import { visiblePlainText } from "../../lib/text";
import type { AppState, SavedRecipe } from "../../types";
import { LegacyRecipe } from "./LegacyRecipe";
import { RecipeCard } from "./RecipeCard";

const STATUS_LABEL = { diet_changed: "Dieta alterada", stock_changed: "Estoque alterado" } as const;

/**
 * Receitas geradas (conceito 06): a última geração em carrossel; as anteriores ficam recolhidas em
 * "Receitas anteriores (N)", cada uma com a data em que foi criada.
 */
export function RecipeList({ state, hide }: { state: AppState; hide: boolean }) {
  const [showOlder, setShowOlder] = useState(false);
  const olderId = useId();
  const [latest, ...older] = [...state.recipes].reverse();
  if (!latest) return null;
  return (
    <div className="recipe-gens">
      <Generation recipe={latest} state={state} hide={hide} isLatest />
      {older.length > 0 && (
        <>
          <button
            type="button"
            className="text-btn recipe-toggle"
            aria-expanded={showOlder}
            aria-controls={olderId}
            onClick={() => setShowOlder(!showOlder)}
          >
            <ChevronDown size={16} aria-hidden="true" />
            {`Receitas anteriores (${older.length})`}
          </button>
          {showOlder && (
            <div id={olderId} className="recipe-gens-older">
              {older.map((recipe) => (
                <Generation key={recipe.id} recipe={recipe} state={state} hide={hide} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Generation({
  recipe,
  state,
  hide,
  isLatest = false,
}: {
  recipe: SavedRecipe;
  state: AppState;
  hide: boolean;
  /** A última geração não repete a data ("Criadas hoje às…" fica na folha "Novas"). */
  isLatest?: boolean;
}) {
  const [isOpen, setOpen] = useState(false);
  const bodyId = useId();
  const status = recipeStatus(recipe, state);
  const isStale = status !== "current";
  return (
    <div className="recipe-gen">
      {(!isLatest || isStale) && (
        <div className="recipe-gen-top">
          {!isLatest && <p className="recipe-gen-head">{recipeGeneratedLabel(recipe.createdAt)}</p>}
          {status !== "current" && <span className="status-pill neutral">{STATUS_LABEL[status]}</span>}
        </div>
      )}
      {isStale && (
        <>
          <p className="notice">{RECIPE_STALE_NOTICE}</p>
          <button
            type="button"
            className="text-btn recipe-toggle"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => setOpen(!isOpen)}
          >
            <ChevronDown size={16} aria-hidden="true" />
            {isOpen ? "Ocultar receitas" : "Consultar receitas"}
          </button>
        </>
      )}
      {(!isStale || isOpen) && (
        <div id={bodyId} className="recipe-gen-body">
          <GenerationBody recipe={recipe} state={state} hide={hide} />
          {recipe.meta.notes.map((note, i) => (
            <p className="hint" key={i}>
              {visiblePlainText(note, hide)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationBody({ recipe, state, hide }: { recipe: SavedRecipe; state: AppState; hide: boolean }) {
  const set = recipe.recipeSet;
  if (!set) return <LegacyRecipe text={recipe.text} hide={hide} />;
  return (
    <>
      {set.receitas.length > 0 && (
        <div className="recipe-carousel">
          {set.receitas.map((card, i) => (
            <RecipeCard key={i} card={card} pantry={state.pantry} hide={hide} />
          ))}
        </div>
      )}
      {set.perguntas.length > 0 && (
        <div className="recipe-questions">
          <h3>Antes de sugerir receitas</h3>
          <ul>
            {set.perguntas.map((question, i) => (
              <li key={i}>{visiblePlainText(question, hide)}</li>
            ))}
          </ul>
          <p className="hint">{RECIPE_QUESTIONS_HINT}</p>
        </div>
      )}
    </>
  );
}
