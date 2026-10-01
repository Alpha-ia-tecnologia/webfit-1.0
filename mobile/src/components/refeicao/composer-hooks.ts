import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Teclado aberto no aparelho: a bandeja sai da frente enquanto a pessoa digita. */
export function useKeyboardOpen(): boolean {
  const [isOpen, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return isOpen;
}

/**
 * Trava contra toque duplo: o estado só muda no próximo render, então o ref barra a segunda
 * ativação no mesmo instante; o estado desenha o botão ocupado.
 */
export function useBusy(): [boolean, { readonly current: boolean }, (value: boolean) => void] {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  const set = useCallback((value: boolean) => {
    ref.current = value;
    setBusy(value);
  }, []);
  return [busy, ref, set];
}
