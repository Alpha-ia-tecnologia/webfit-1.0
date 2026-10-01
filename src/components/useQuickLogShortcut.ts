import { useEffect, useRef } from "react";
import { isEditableTarget, isQuickLogShortcut, type ShortcutTarget } from "../lib/shortcuts";

/** Diálogos (Modal usa aria-modal) e menus abertos: a letra fica com eles, não abre outra folha. */
const OVERLAY_SELECTOR = '[aria-modal="true"], [role="menu"]';

/**
 * Tecla N abre o "Registro rápido" (SIS-12) em qualquer tela com a navegação.
 * Um único ouvinte na janela; `open` pode mudar a cada render sem refazer o ouvinte.
 */
export function useQuickLogShortcut(open: () => void): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? (event.target as ShortcutTarget) : null;
      const context = {
        isEditable: isEditableTarget(target),
        hasOverlay: document.querySelector(OVERLAY_SELECTOR) !== null,
      };
      if (!isQuickLogShortcut(event, context)) return;
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}
