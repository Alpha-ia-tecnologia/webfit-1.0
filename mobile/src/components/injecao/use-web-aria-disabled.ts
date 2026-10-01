import { useEffect, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * aria-disabled direto no DOM do export web para um botão que parece desativado mas ainda responde ao
 * toque com o aviso do que falta: o `disabled` do Pressable no react-native-web viraria um botão sem
 * clique (e sobrescreveria o aria-disabled). No aparelho basta o accessibilityState.disabled do botão.
 */
export function useWebAriaDisabled(ref: RefObject<View | null>, isDisabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.setAttribute) return;
    if (isDisabled) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
  }, [ref, isDisabled]);
}
