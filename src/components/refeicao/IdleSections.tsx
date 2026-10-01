import type { ReactNode, RefObject } from "react";
import { History, Star } from "lucide-react";
import { plural } from "../../lib/format";
import type { FoodItem, MealItem } from "../../types";
import { Empty, Field } from "../UI";

/** Alimentos cadastrados (os mais recentes) que aparecem sem busca. */
const MINE_WHEN_IDLE = 6;

type Favorite = {
  name: string;
  error: string;
  isBusy: boolean;
  /** Chegou ao limite de favoritos: o botão fica desativado com a dica. */
  isFull: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onName: (name: string) => void;
  onSave: () => void;
};

/** "Salvar como favorito" do prato: nome, botão (Enter também salva), erro e limite. */
function PlateFavorite({ name, error, isBusy, isFull, buttonRef, onName, onSave }: Favorite) {
  return (
    <div className="plate-favorite">
      <Field label="Nome do prato favorito">
        <input
          maxLength={100}
          value={name}
          placeholder="Ex.: meu almoço de casa"
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onSave();
          }}
        />
      </Field>
      <button
        ref={buttonRef}
        type="button"
        className="btn-secondary"
        disabled={isFull || isBusy}
        aria-busy={isBusy}
        onClick={onSave}
      >
        <Star size={16} aria-hidden="true" />
        {isBusy ? "Salvando favorito…" : "Salvar como favorito"}
      </button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {isFull && (
        <p className="hint">Você chegou a 100 favoritos. Para salvar outro, remova um em Seus pratos.</p>
      )}
    </div>
  );
}

type Props = {
  /** Aviso do prato carregado (atalho, prato favorito ou itens vindos da foto/descrição). */
  notice: string;
  items: readonly MealItem[];
  plateRef: RefObject<HTMLHeadingElement | null>;
  /** Frequentes desta categoria de refeição (com a porção da vez mais recente). */
  frequent: readonly { food: FoodItem; grams: number }[];
  /** Alimentos cadastrados pela pessoa (os mais recentes no fim). */
  foods: readonly FoodItem[];
  renderFood: (food: FoodItem, suggestion?: number) => ReactNode;
  favorite: Favorite;
};

/**
 * Sem busca: o aviso do prato, "Seu prato" com o favorito, os frequentes e os alimentos cadastrados
 * que ainda não estão no prato; com tudo vazio, a dica de busca.
 */
export function IdleSections({ notice, items, plateRef, frequent, foods, renderFood, favorite }: Props) {
  const inPlate = (id: string) => items.some((i) => i.food.id === id);
  const idleFrequent = frequent.filter((f) => !inPlate(f.food.id));
  const idleMine = foods
    .slice(-MINE_WHEN_IDLE)
    .reverse()
    .filter((f) => !inPlate(f.id) && !idleFrequent.some((fr) => fr.food.id === f.id));
  return (
    <>
      {notice && <p className="notice">{notice}</p>}
      {items.length > 0 && (
        <section className="food-section plate-section" aria-labelledby="plate-title">
          <h2 id="plate-title" ref={plateRef} tabIndex={-1} className="food-section-title">
            Seu prato · {plural(items.length, "item", "itens")}
          </h2>
          <ul className="food-list">{items.map((item) => renderFood(item.food))}</ul>
          <PlateFavorite {...favorite} />
        </section>
      )}
      {idleFrequent.length > 0 && (
        <section className="food-section" aria-labelledby="idle-frequent">
          <h2 id="idle-frequent" className="food-section-title">
            <History size={16} aria-hidden="true" />
            Seus frequentes
          </h2>
          <ul className="food-list">{idleFrequent.map((f) => renderFood(f.food, f.grams))}</ul>
        </section>
      )}
      {idleMine.length > 0 && (
        <section className="food-section" aria-labelledby="idle-mine">
          <h2 id="idle-mine" className="food-section-title">
            Seus alimentos cadastrados
          </h2>
          <ul className="food-list">{idleMine.map((food) => renderFood(food))}</ul>
        </section>
      )}
      {!items.length && !idleFrequent.length && !idleMine.length && (
        <Empty art="search">Busque pelo nome, como arroz, frango ou banana.</Empty>
      )}
    </>
  );
}
