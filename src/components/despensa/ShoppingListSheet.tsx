import { useEffect, useRef } from "react";
import { SHOPPING_COPY } from "../../lib/shopping-list";
import type { ShoppingItem } from "../../types";
import { Modal } from "../UI";
import { ShoppingListCard } from "./ShoppingListCard";
import "./Kitchen.css";

/**
 * Folha "Lista de compras" (conceito 06: a lista sai da página e vira um atalho). Ao abrir, o foco
 * vai para o título da folha (também pelo "Ver lista" da Dieta), não para o "Fechar".
 */
export function ShoppingListSheet({
  list,
  hide,
  isLocked,
  onStore,
  onClose,
}: {
  list: readonly ShoppingItem[];
  hide: boolean;
  isLocked: boolean;
  onStore: () => void;
  onClose: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Um quadro depois do foco inicial da folha (o efeito do Modal roda depois do nosso).
    const frame = requestAnimationFrame(() => {
      const dialog = body.current?.closest<HTMLElement>('[role="dialog"]');
      const titleId = dialog?.getAttribute("aria-labelledby");
      const title = titleId ? document.getElementById(titleId) : null;
      if (!title) return;
      title.tabIndex = -1;
      title.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Modal title={SHOPPING_COPY.title} onClose={onClose} className="shop-list-sheet">
      <div ref={body} className="shop-list-sheet-body">
        <ShoppingListCard list={list} hide={hide} isLocked={isLocked} onStore={onStore} />
      </div>
    </Modal>
  );
}
