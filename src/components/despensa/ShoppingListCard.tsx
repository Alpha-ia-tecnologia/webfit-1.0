import { useId, useRef, useState, type FormEvent } from "react";
import { ListPlus, PackageCheck, Share2, Trash2, X } from "lucide-react";
import { useApp } from "../../lib/context";
import { tapFeedback } from "../../lib/haptics";
import {
  addShoppingItems,
  manualShoppingItem,
  removeShoppingItems,
  restoreShoppingItems,
  SHOPPING_COPY,
  shoppingGroups,
  shoppingShareText,
  shoppingSummary,
  toggleShoppingItem,
} from "../../lib/shopping-list";
import { visiblePlainText } from "../../lib/text";
import type { ShoppingItem } from "../../types";
import { OverflowMenu } from "../OverflowMenu";
import { Empty } from "../UI";
import { useFocusAfterBusy } from "../useFocusAfterBusy";
import { ShopCheck } from "./ShopCheck";
import { LIST_UNDONE, ShoppingSuggest } from "./ShoppingSuggestSheet";
import { useKitchenCommit } from "./useKitchenCommit";
import "./Kitchen.css";

/** Item digitado pronto para a lista, ou a frase do erro ("Escreva o nome do item."). */
function manualPick(text: string): ReturnType<typeof manualShoppingItem> | string {
  try {
    return manualShoppingItem(text);
  } catch (error) {
    return (error as Error).message;
  }
}

type Props = {
  list: readonly ShoppingItem[];
  hide: boolean;
  /** "Guardar comprados na despensa": abre a revisão da despensa com os marcados. */
  onStore: () => void;
  isLocked: boolean;
};

/**
 * Lista de compras (AGENTE-08), só no aparelho, dentro da folha "Lista de compras" (conceito 06):
 * seções do mercado, marcar comprado, remover com "Desfazer", incluir à mão, compartilhar os
 * pendentes e guardar os comprados na despensa depois da revisão. Sem gramas nem preços.
 */
export function ShoppingListCard({ list, hide, onStore, isLocked }: Props) {
  const { commit, notify } = useApp();
  const save = useKitchenCommit();
  const baseId = useId();
  const [manual, setManual] = useState("");
  const [isSuggesting, setSuggesting] = useState(false);
  /**
   * Marca otimista: o visto aparece no toque, antes de o estado salvo chegar (commit assíncrono);
   * sem isso o input controlado volta ao valor antigo por um instante. `mark` casa o toque com o
   * seu commit, para dois toques rápidos não se atropelarem.
   */
  const [optimistic, setOptimistic] = useState<
    Readonly<Record<string, { checked: boolean; mark: number }>>
  >({});
  const toggleMark = useRef(0);
  // Trava síncrona da inclusão à mão: um toque duplo (ou Enter duas vezes) incluiria o item duas vezes.
  const addBusy = useRef(false);
  const [isAdding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(isAdding, addButton);
  const summary = shoppingSummary(list);
  const pending = summary.total - summary.checked;
  const name = (item: ShoppingItem) => visiblePlainText(item.name, hide);
  const isChecked = (item: ShoppingItem) => optimistic[item.id]?.checked ?? item.checked;
  /** Comprados como aparecem na tela (com as marcas ainda sendo salvas). */
  const checkedIds = list.filter(isChecked).map((item) => item.id);

  const toggle = (item: ShoppingItem) => {
    tapFeedback();
    const checked = !isChecked(item);
    const mark = ++toggleMark.current;
    setOptimistic((current) => ({ ...current, [item.id]: { checked, mark } }));
    // Idempotente: grava o valor pedido (não inverte de novo se outro toque já gravou).
    void commit((s) =>
      s.shoppingList.some((i) => i.id === item.id && i.checked !== checked)
        ? toggleShoppingItem(s, item.id)
        : s,
    ).finally(() =>
      setOptimistic((current) =>
        current[item.id]?.mark === mark
          ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id))
          : current,
      ),
    );
  };
  /**
   * Remove com "Desfazer": o retrato sai de dentro do commit, depois das marcas que ainda estão na
   * fila; assim o "Desfazer" devolve cada item como estava salvo (com o visto), não como na tela.
   */
  const remove = (ids: readonly string[], message: string) => {
    let removed: ShoppingItem[] = [];
    void save(
      (s) => {
        removed = s.shoppingList.filter((item) => ids.includes(item.id));
        return removeShoppingItems(s, ids);
      },
      message,
      {
        label: "Desfazer",
        onAction: () => void save((s) => restoreShoppingItems(s, removed), LIST_UNDONE),
      },
    );
  };
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addBusy.current) return;
    const pick = manualPick(manual);
    if (typeof pick === "string") {
      notify(pick, "warning");
      return;
    }
    addBusy.current = true;
    setAdding(true);
    let added: string[] = [];
    try {
      const ok = await save(
        (s) => {
          const next = addShoppingItems(s, [pick], new Date().toISOString());
          added = next.shoppingList.slice(s.shoppingList.length).map((item) => item.id);
          return next;
        },
        SHOPPING_COPY.added(1),
        {
          label: "Desfazer",
          onAction: () => void save((s) => removeShoppingItems(s, added), LIST_UNDONE),
        },
      );
      if (ok) setManual("");
    } finally {
      addBusy.current = false;
      setAdding(false);
    }
  };
  const share = async () => {
    const text = shoppingShareText(list, hide);
    if (!text) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: SHOPPING_COPY.title, text });
        return;
      } catch (error) {
        // A pessoa fechou a folha de compartilhar: nada a avisar.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(text);
      notify(SHOPPING_COPY.copied);
    } catch {
      notify(SHOPPING_COPY.shareFail, "warning");
    }
  };

  return (
    <div className="shop-list" data-testid="shopping-list">
      <div className="shop-list-head">
        <p className="shop-summary">{summary.text}</p>
        <div className="shop-list-tools">
          <button
            type="button"
            className="btn-secondary shop-share"
            aria-label={SHOPPING_COPY.shareLabel}
            disabled={!pending}
            onClick={() => void share()}
          >
            <Share2 size={16} aria-hidden="true" />
            {SHOPPING_COPY.share}
          </button>
          <OverflowMenu
            label="Mais opções da lista"
            items={[
              { label: "Adicionar sugestões", icon: ListPlus, onSelect: () => setSuggesting(true) },
              {
                label: "Remover comprados",
                icon: Trash2,
                disabled: !checkedIds.length,
                onSelect: () =>
                  remove(checkedIds, SHOPPING_COPY.removedChecked(checkedIds.length)),
              },
            ]}
          />
        </div>
      </div>
      {!list.length ? (
        <Empty
          art="pantry"
          action={{ label: SHOPPING_COPY.build, onClick: () => setSuggesting(true) }}
        >
          {SHOPPING_COPY.empty}
        </Empty>
      ) : (
        <div className="shop-sections">
          {shoppingGroups(list).map((group, g) => (
            <section
              key={group.section}
              className="shop-group"
              aria-labelledby={`${baseId}-g${g}`}
            >
              <h3 id={`${baseId}-g${g}`}>{group.label}</h3>
              <ul className="shop-rows">
                {group.items.map((item) => {
                  const id = `${baseId}-${item.id}`;
                  const meta = [item.quantity ?? "", item.note]
                    .filter((text) => text !== "")
                    .map((text) => visiblePlainText(text, hide))
                    .join(" · ");
                  return (
                    <li key={item.id} className={`shop-row${isChecked(item) ? " is-checked" : ""}`}>
                      <ShopCheck
                        id={id}
                        checked={isChecked(item)}
                        describedBy={meta ? `${id}-meta` : undefined}
                        onChange={() => toggle(item)}
                      />
                      <span className="shop-row-text">
                        <label htmlFor={id} className="shop-name">
                          {name(item)}
                        </label>
                        {meta && (
                          <span id={`${id}-meta`} className="shop-meta">
                            {meta}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="icon-btn shop-remove"
                        aria-label={`Remover ${name(item)} da lista`}
                        onClick={() => remove([item.id], SHOPPING_COPY.removed(name(item)))}
                      >
                        <X size={17} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <form className="shop-add" onSubmit={(event) => void add(event)}>
        <label htmlFor={`${baseId}-manual`}>{SHOPPING_COPY.manualLabel}</label>
        <div className="shop-add-row">
          <input
            id={`${baseId}-manual`}
            value={manual}
            maxLength={120}
            autoComplete="off"
            placeholder="Ex.: sabão em pó"
            readOnly={isAdding}
            onChange={(event) => setManual(event.target.value)}
          />
          <button
            ref={addButton}
            type="submit"
            className="btn-secondary"
            disabled={isAdding}
            aria-busy={isAdding}
          >
            {SHOPPING_COPY.manualAdd}
          </button>
        </div>
      </form>
      {list.length > 0 && (
        <button
          type="button"
          className="btn shop-store"
          disabled={!summary.checked || isLocked}
          onClick={onStore}
        >
          <PackageCheck size={17} aria-hidden="true" />
          {SHOPPING_COPY.store}
        </button>
      )}
      {isSuggesting && <ShoppingSuggest onClose={() => setSuggesting(false)} />}
    </div>
  );
}
