import { useId, useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { isDietPlanStale } from "../../lib/diet";
import type { DietPlanV2 } from "../../lib/diet-plan";
import { planAnchor } from "../../lib/diet-week";
import {
  addShoppingItems,
  dietShoppingSuggestions,
  mergeSuggestions,
  recipeShoppingSuggestions,
  removeShoppingItems,
  SECTION_LABEL,
  SHOPPING_COPY,
  type ShoppingSuggestion,
} from "../../lib/shopping-list";
import { SHOPPING_SECTIONS, type AppState } from "../../types";
import { Modal } from "../UI";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import { useStructuredPlan } from "../usePlannedMeal";
import { ShopCheck } from "./ShopCheck";
import { useKitchenCommit } from "./useKitchenCommit";
import "./Kitchen.css";

/** Desfazer de uma inclusão ou remoção na lista. */
export const LIST_UNDONE = "Lista como antes.";

/**
 * Sugestões do plano (7 dias a partir de hoje, com a rotação das trocas) e do "Falta comprar" da
 * receita atual, sem o que já está na lista. Plano desatualizado não entra (só as receitas).
 */
function buildSuggestions(state: AppState, view: DietPlanV2 | null): ShoppingSuggestion[] {
  const today = localDate();
  const profile = state.profile;
  const hide = profile?.hideCalories ?? true;
  const plan = state.dietPlan;
  const diet =
    view && plan && profile && !isDietPlanStale(plan, profile)
      ? dietShoppingSuggestions(view, {
          anchor: planAnchor(plan.createdAt),
          from: today,
          allergyDetails: profile.allergyDetails,
          pantry: state.pantry,
          basics: state.kitchenBasics,
          today,
        })
      : [];
  return mergeSuggestions(state.shoppingList, [diet, recipeShoppingSuggestions(state, today, hide)]);
}

/**
 * "Montar lista de compras" (Dieta e Despensa): monta as sugestões ao abrir e grava só o que a
 * pessoa marcou, com "Desfazer". `preset`: só estas sugestões (o "+ Lista" de uma receita).
 */
export function ShoppingSuggest({
  onClose,
  preset,
}: {
  onClose: () => void;
  preset?: readonly ShoppingSuggestion[];
}) {
  const { state } = useApp();
  const view = useStructuredPlan();
  const save = useKitchenCommit();
  // Retrato do momento em que a folha abriu: a lista não se rearruma enquanto a pessoa marca.
  const [suggestions] = useState(() => (preset ? [...preset] : buildSuggestions(state, view)));
  // Trava síncrona: um toque duplo em "Adicionar N itens" gravaria a lista duas vezes.
  const busy = useRef(false);
  const [isSaving, setSaving] = useState(false);
  const confirm = async (picked: readonly ShoppingSuggestion[]) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    const picks = picked.map(({ name, quantity, section, origin, note }) => ({
      name,
      quantity,
      section,
      origin,
      note,
    }));
    let added: string[] = [];
    try {
      const ok = await save(
        (s) => {
          const next = addShoppingItems(s, picks, new Date().toISOString());
          added = next.shoppingList.slice(s.shoppingList.length).map((item) => item.id);
          return next;
        },
        SHOPPING_COPY.added(picks.length),
        {
          label: "Desfazer",
          onAction: () => void save((s) => removeShoppingItems(s, added), LIST_UNDONE),
        },
      );
      if (ok) onClose();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <ShoppingSuggestSheet
      suggestions={suggestions}
      isBusy={isSaving}
      onConfirm={(picked) => void confirm(picked)}
      onClose={onClose}
    />
  );
}

/**
 * Folha de sugestões por seção do mercado: marcado vem o que falta; "Já tem na despensa" vem
 * desmarcado. Nomes já chegam mascarados (calorias ocultas); nada de gramas.
 */
export function ShoppingSuggestSheet({
  suggestions,
  isBusy = false,
  onConfirm,
  onClose,
}: {
  suggestions: readonly ShoppingSuggestion[];
  /** Gravando: "Adicionar N itens" fica desativado até a lista salvar. */
  isBusy?: boolean;
  onConfirm: (picked: ShoppingSuggestion[]) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(isBusy, addButton);
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(suggestions.filter((s) => s.defaultChecked).map((s) => s.key)),
  );
  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const groups = SHOPPING_SECTIONS.flatMap((section) => {
    const items = suggestions.filter((s) => s.section === section);
    return items.length ? [{ section, items }] : [];
  });
  const count = suggestions.filter((s) => picked.has(s.key)).length;
  return (
    <Modal title={SHOPPING_COPY.sheet} onClose={onClose} className="shop-sheet">
      {!suggestions.length ? (
        <p className="shop-none">{SHOPPING_COPY.none}</p>
      ) : (
        groups.map((group, g) => (
          <section key={group.section} className="shop-group" aria-labelledby={`${baseId}-g${g}`}>
            <h3 id={`${baseId}-g${g}`}>{SECTION_LABEL[group.section]}</h3>
            <ul className="shop-rows">
              {group.items.map((item, i) => {
                const id = `${baseId}-${g}-${i}`;
                const meta = [item.quantity, item.note].filter(Boolean).join(" · ");
                return (
                  <li key={item.key} className="shop-row">
                    <ShopCheck
                      id={id}
                      label={`Incluir ${item.name}`}
                      checked={picked.has(item.key)}
                      describedBy={`${id}-meta${item.inPantry ? ` ${id}-tag` : ""}`}
                      onChange={() => toggle(item.key)}
                    />
                    <span className="shop-row-text">
                      <label htmlFor={id} className="shop-name">
                        {item.name}
                      </label>
                      <span id={`${id}-meta`} className="shop-meta">
                        {meta}
                      </span>
                      {item.inPantry && (
                        <span id={`${id}-tag`} className="shop-tag">
                          {SHOPPING_COPY.inPantry}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <div className="form-actions shop-sheet-actions">
        {suggestions.length > 0 && (
          <button
            ref={addButton}
            type="button"
            className="btn"
            disabled={!count || isBusy}
            aria-busy={isBusy}
            onClick={() => onConfirm(suggestions.filter((s) => picked.has(s.key)))}
          >
            {SHOPPING_COPY.add(count)}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
