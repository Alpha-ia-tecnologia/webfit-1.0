import { AccessibilityInfo, Platform, type View } from "react-native";

/**
 * Leva o foco a um elemento que acabou de aparecer: foco de teclado no export web,
 * foco do leitor de tela no aparelho.
 */
export function focusNode(node: View | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as { focus?: () => void }).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}
