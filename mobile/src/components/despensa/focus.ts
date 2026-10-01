import { AccessibilityInfo, findNodeHandle, Platform, type View } from "react-native";

/**
 * Espera o menu "⋯" fechar antes de mover o foco: o Modal do react-native-web esmaece em 250 ms e,
 * ao desmontar, devolve o foco ao "⋯" (que tomaria o foco de volta se movêssemos antes).
 */
export const AFTER_MENU_MS = 450;
/** O botão "⋯" de uma linha. */
export const ROW_MENU_SELECTOR = '[aria-label^="Mais ações:"]';

/**
 * Leva o foco ao primeiro elemento do seletor dentro de `node` (no export web, foco de teclado num
 * botão como o "⋯" ou "Começar modo preparo"); no aparelho, o leitor de tela vai para o próprio nó.
 * Devolve false quando não havia onde pôr o foco.
 */
export function focusWithin(node: View | null, selector = '[role="button"]'): boolean {
  if (!node) return false;
  if (Platform.OS === "web") {
    const element = node as unknown as HTMLElement;
    const target = element.matches?.(selector) ? element : element.querySelector?.<HTMLElement>(selector);
    if (!target) return false;
    target.focus();
    return true;
  }
  try {
    const handle = findNodeHandle(node);
    if (handle == null) return false;
    AccessibilityInfo.setAccessibilityFocus(handle);
    return true;
  } catch {
    // Nó já desmontado: o sistema decide o foco.
    return false;
  }
}
