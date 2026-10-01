import { useId, useState } from "react";
import {
  Apple,
  Check,
  ChefHat,
  Clock,
  Coffee,
  Moon,
  Plus,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { pantryEmoji } from "../../lib/pantry-view";
import {
  coverageCount,
  fmtMinutes,
  RECIPE_ALL_HOME,
  recipeCoverage,
  recipeEmoji,
  recipeMissingPill,
  recipeSeal,
  recipeSealLabel,
} from "../../lib/recipe-set";
import {
  mergeSuggestions,
  recipeShoppingSuggestions,
  shoppingKey,
} from "../../lib/shopping-list";
import { plural } from "../../lib/format";
import { visiblePlainText } from "../../lib/text";
import type { PantryItem, RecipeCard as RecipeCardData } from "../../types";
import { SegmentMeter } from "../SegmentMeter";
import { RecipeSheet } from "./RecipeSheet";
import { ShoppingSuggest } from "./ShoppingSuggestSheet";

const MEAL_ICON: Record<string, LucideIcon> = {
  "Café da manhã": Coffee,
  Almoço: UtensilsCrossed,
  Lanche: Apple,
  Jantar: Moon,
  Ceia: Moon,
};
/** Fundo do topo do cartão pela refeição: almoço âmbar→menta, jantar/ceia menta→céu. */
const heroTone = (meal: string) => (meal === "Jantar" || meal === "Ceia" ? "is-evening" : "is-day");
/** Emojis pequenos em volta do prato (decorativos): os itens da casa, sem repetir o do prato. */
const MAX_SIDE_GLYPHS = 3;

function sideGlyphs(card: RecipeCardData, dish: string): string[] {
  const glyphs = card.ingredientesCasa.map((item) => pantryEmoji(item.nome));
  return [...new Set(glyphs)].filter((glyph) => glyph !== dish).slice(0, MAX_SIDE_GLYPHS);
}

/**
 * "+ Lista": o que falta desta receita e ainda não está na lista vai para a folha de sugestões;
 * tudo já na lista → "Na lista". Sem nada a comprar (ou receita antiga), nada aparece.
 */
function RecipeListButton({ card, name, hide }: { card: RecipeCardData; name: string; hide: boolean }) {
  const { state } = useApp();
  const [isOpen, setOpen] = useState(false);
  const keys = new Set(card.faltaComprar.map((item) => shoppingKey(item.nome)));
  const own = recipeShoppingSuggestions(state, localDate(), hide).filter((s) => keys.has(s.key));
  if (!own.length) return null;
  const pending = mergeSuggestions(state.shoppingList, [own]);
  if (!pending.length)
    return (
      <span className="recipe-listed">
        <Check size={16} aria-hidden="true" />
        Na lista
      </span>
    );
  return (
    <>
      <button
        type="button"
        className="recipe-list-btn"
        aria-label={`Lista: incluir o que falta de ${name}`}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden="true" />
        Lista
      </button>
      {isOpen && <ShoppingSuggest preset={pending} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Cartão de uma receita estruturada (conceito 06): topo com o prato e os selos, tempo e porções,
 * "8 de 9 ingredientes em casa" com a barra de segmentos, o que falta e "Modo preparo".
 * A IA devolve dados; o app desenha emoji, cobertura e selo.
 */
export function RecipeCard({
  card,
  pantry,
  hide,
}: {
  card: RecipeCardData;
  pantry: readonly PantryItem[];
  hide: boolean;
}) {
  const { state } = useApp();
  const [isOpen, setOpen] = useState(false);
  const titleId = useId();
  const name = visiblePlainText(card.nome, hide);
  const coverage = recipeCoverage(card, pantry, undefined, state.kitchenBasics);
  const seal = recipeSeal(card, pantry);
  const missing = recipeMissingPill(card);
  const dish = recipeEmoji(card);
  const MealIcon = MEAL_ICON[card.refeicao] ?? UtensilsCrossed;
  const sealName = seal ? visiblePlainText(seal.itemName, hide) : "";
  return (
    <article className="recipe-card" data-testid="recipe-card" aria-labelledby={titleId}>
      <div className={`recipe-hero ${heroTone(card.refeicao)}`}>
        <span className="recipe-hero-plate" aria-hidden="true">
          <span className="recipe-hero-dish">{dish}</span>
        </span>
        {sideGlyphs(card, dish).map((glyph, i) => (
          <span key={glyph} className={`recipe-hero-side is-${i + 1}`} aria-hidden="true">
            {glyph}
          </span>
        ))}
        <span className="recipe-meal-chip">
          <MealIcon size={16} aria-hidden="true" />
          {card.refeicao}
        </span>
        {seal && (
          <span className="recipe-seal" data-testid="recipe-seal">
            <Clock size={15} aria-hidden="true" />
            <span aria-hidden="true">{recipeSealLabel(sealName)}</span>
            <span className="sr-only">
              {`Usa ${sealName}, que ${seal.pill.full.toLocaleLowerCase("pt-BR")}`}
            </span>
          </span>
        )}
      </div>
      <div className="recipe-card-body">
        <h3 id={titleId}>{name}</h3>
        <p className="recipe-meta">
          <span>
            <Clock size={16} aria-hidden="true" />
            {fmtMinutes(card.tempoMin)}
          </span>
          <span>
            <Users size={16} aria-hidden="true" />
            {plural(card.porcoes, "porção", "porções")}
          </span>
        </p>
        <div className="recipe-coverage" data-testid="recipe-coverage">
          <p>
            <strong>{coverageCount(coverage)}</strong>
            {` ${coverage.total === 1 ? "ingrediente" : "ingredientes"} em casa`}
          </p>
          <SegmentMeter
            value={coverage.have}
            total={coverage.total}
            missing={coverage.total - coverage.have}
            size="lg"
          />
        </div>
        <div className="recipe-missing-row">
          {missing ? (
            <span className="recipe-missing">
              <span>{visiblePlainText(missing.text, hide)}</span>
              {missing.isOptional && <span className="recipe-missing-note"> · opcional</span>}
              {missing.more > 0 && <span className="recipe-missing-note">{` +${missing.more}`}</span>}
            </span>
          ) : (
            <span className="recipe-all-home">{RECIPE_ALL_HOME}</span>
          )}
          {missing && <RecipeListButton card={card} name={name} hide={hide} />}
        </div>
        <button
          type="button"
          className="btn recipe-cook"
          aria-label={`Modo preparo: ${name}`}
          onClick={() => setOpen(true)}
        >
          <ChefHat size={19} aria-hidden="true" />
          Modo preparo
        </button>
      </div>
      {isOpen && (
        <RecipeSheet
          card={card}
          name={name}
          coverage={coverage}
          hide={hide}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  );
}
