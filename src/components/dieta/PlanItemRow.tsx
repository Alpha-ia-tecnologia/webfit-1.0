import { useId, useState } from "react";
import { ArrowRightLeft, Salad } from "lucide-react";
import { allergenIn } from "../../lib/allergens";
import { PLAN_DAY_COPY } from "../../lib/diet-week";
import { glyphForFood, glyphForName } from "../../lib/food-glyph";
import { fmtNumber } from "../../lib/format";
import type { ResolvedItem } from "../../lib/taco-match";
import { FoodGlyph } from "../meal/FoodGlyph";
import "../Plate.css";

type Props = {
  entry: ResolvedItem;
  /** Trocas revisadas do item no dia mostrado. */
  swaps: readonly string[];
  /** "no lugar de …" quando o item já é uma troca do dia (IA-X5). */
  replaces?: string;
  /** Alergias atuais: uma troca de plano antigo pode ser alérgeno hoje. */
  allergyTokens: readonly string[];
  /** Gramas ao lado da medida só fora dos perfis calmos (decisão A-D2). */
  showGrams: boolean;
};

/**
 * Item do plano na refeição aberta (Dieta): emoji, nome, medida caseira em destaque e as gramas em
 * segundo plano; "⇄ Trocar" só quando há trocas revisadas (abre a lista, sem IA). Os números
 * nutricionais ficam na barra da refeição (TACO), nunca aqui.
 */
export function PlanItemRow({ entry, swaps, replaces, allergyTokens, showGrams }: Props) {
  const [isOpen, setOpen] = useState(false);
  const listId = useId();
  const { item, food, status } = entry;
  const glyph = (food ? glyphForFood(food) : null) ?? glyphForName(item.alimento);
  const grams = showGrams && item.gramas ? `${fmtNumber(item.gramas)} g` : null;
  return (
    <li className="plan-item">
      <FoodGlyph glyph={glyph} icon={Salad} size={34} bordered className="plan-item-glyph" />
      <div className="plan-item-text">
        <span className="plan-item-name">{item.alimento}</span>
        {(item.medidaCaseira || grams) && (
          <span className="plan-item-portion">
            {item.medidaCaseira && <strong>{item.medidaCaseira}</strong>}
            {item.medidaCaseira && grams && " · "}
            {grams}
          </span>
        )}
        {(replaces || status === "allergen") && (
          <span className="plan-item-tags">
            {replaces && (
              <span className="diet-swap-tag">{PLAN_DAY_COPY.swapTag(replaces)}</span>
            )}
            {status === "allergen" && <span className="allergen-badge">Possível alérgeno</span>}
          </span>
        )}
      </div>
      {swaps.length > 0 && (
        <button
          type="button"
          className="plan-item-swap"
          aria-label={PLAN_DAY_COPY.itemSwapLabel(item.alimento, swaps.length)}
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => setOpen(!isOpen)}
        >
          <ArrowRightLeft size={15} aria-hidden="true" />
          {PLAN_DAY_COPY.itemSwap}
        </button>
      )}
      {swaps.length > 0 && (
        <div id={listId} className="diet-swaps" hidden={!isOpen}>
          <span className="diet-swaps-label">Troque por:</span>
          <ul>
            {swaps.map((swap) => (
              <li key={swap}>
                {swap}
                {allergenIn(swap, allergyTokens, "food") && (
                  <span className="allergen-badge">Possível alérgeno</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
