import type { ReactNode, RefObject } from "react";
import { History, Info } from "lucide-react";
import type { FoodCategory } from "../../lib/food-categories";
import { isTacoFood, type FoodGroup } from "../../lib/food-search";
import { fmtNumber, plural } from "../../lib/format";
import { CategoryChips } from "./CategoryChips";

/** Frequentes que sobem para o topo da busca. */
const FREQUENT_IN_SEARCH = 5;

type Props = {
  query: string;
  /** Total de grupos encontrados (antes do filtro de categoria). */
  total: number;
  /** Nenhum alimento tem todas as palavras: estes têm parte delas. */
  isPartial: boolean;
  categories: FoodCategory[];
  categoryKey: string;
  onCategory: (key: string) => void;
  /** Grupos já filtrados pela categoria escolhida. */
  groups: readonly FoodGroup[];
  /** Alimentos frequentes (id → vezes), para a seção "Seus frequentes". */
  boost: ReadonlyMap<string, number>;
  tacoShown: number;
  tacoListRef: RefObject<HTMLUListElement | null>;
  renderGroup: (group: FoodGroup) => ReactNode;
  onLabel: () => void;
  onTacoInfo: () => void;
  onMoreTaco: () => void;
};

/**
 * Resultados da busca de alimentos: filtro por categoria, aviso de resultado parcial e as seções
 * "Seus frequentes", "Seus alimentos cadastrados" e "Tabela TACO" (paginada). Sem resultado, o
 * atalho para cadastrar o alimento pelo rótulo.
 */
export function FoodSearchResults({
  query,
  total,
  isPartial,
  categories,
  categoryKey,
  onCategory,
  groups,
  boost,
  tacoShown,
  tacoListRef,
  renderGroup,
  onLabel,
  onTacoInfo,
  onMoreTaco,
}: Props) {
  if (!total)
    return (
      <div className="food-empty">
        <p>Nada encontrado para “{query}”.</p>
        <button type="button" className="btn-secondary" onClick={onLabel}>
          Cadastrar alimento do rótulo
        </button>
      </div>
    );
  const frequentGroups = groups
    .filter((g) => g.variants.some((v) => boost.has(v.id)))
    .slice(0, FREQUENT_IN_SEARCH);
  const shownKeys = new Set(frequentGroups.map((g) => g.key));
  const otherGroups = groups.filter((g) => !shownKeys.has(g.key));
  const mineGroups = otherGroups.filter((g) => !isTacoFood(g.selected));
  const tacoGroups = otherGroups.filter((g) => isTacoFood(g.selected));
  return (
    <>
      {isPartial && (
        <p className="hint food-partial">
          Nenhum alimento tem todas essas palavras. Estes têm parte delas: adicione um de cada vez.
        </p>
      )}
      {frequentGroups.length > 0 && (
        <section className="food-section" aria-labelledby="found-frequent">
          <h2 id="found-frequent" className="food-section-title">
            <History size={14} aria-hidden="true" />
            Seus frequentes
          </h2>
          <ul className="food-list">{frequentGroups.map((g) => renderGroup(g))}</ul>
        </section>
      )}
      {mineGroups.length > 0 && (
        <section className="food-section" aria-labelledby="found-mine">
          <h2 id="found-mine" className="food-section-title">
            Seus alimentos cadastrados
          </h2>
          <ul className="food-list">{mineGroups.map((g) => renderGroup(g))}</ul>
        </section>
      )}
      {/* Conceito 02: os frequentes vêm logo sob a busca; o filtro fica acima da Tabela TACO. */}
      {categories.length > 1 && (
        <CategoryChips categories={categories} value={categoryKey} onChange={onCategory} />
      )}
      {tacoGroups.length > 0 && (
        <section className="food-section" aria-labelledby="found-taco">
          <div className="food-section-head">
            <h2 id="found-taco" className="food-section-title">
              Tabela TACO
            </h2>
            <button
              type="button"
              className="section-info"
              aria-label="Sobre a Tabela TACO e as medidas caseiras"
              onClick={onTacoInfo}
            >
              <Info size={16} aria-hidden="true" />
            </button>
            <span className="food-section-count">
              {plural(tacoGroups.length, "resultado", "resultados")}
            </span>
          </div>
          <ul className="food-list" ref={tacoListRef}>
            {tacoGroups.slice(0, tacoShown).map((g) => renderGroup(g))}
          </ul>
          {tacoGroups.length > tacoShown && (
            <button type="button" className="btn-secondary food-more" onClick={onMoreTaco}>
              Mostrar mais ({fmtNumber(tacoGroups.length - tacoShown)})
            </button>
          )}
        </section>
      )}
    </>
  );
}
