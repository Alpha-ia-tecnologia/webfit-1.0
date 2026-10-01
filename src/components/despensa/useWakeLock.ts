import { useEffect, useState } from "react";

export type WakeLockState = "idle" | "on" | "unavailable";

/**
 * Tela acesa no modo preparo (AGENTE-11) pela Screen Wake Lock API, no próprio aparelho. Pede ao
 * entrar, pede de novo quando a aba volta a ficar visível (o navegador solta o pedido ao sair) e
 * solta ao sair do modo. Sem suporte ou negado: "unavailable" (a tela mostra uma dica, nunca erro).
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>("idle");
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator) || !navigator.wakeLock) {
      setState("unavailable");
      return;
    }
    let isActive = true;
    let sentinel: WakeLockSentinel | null = null;
    const release = (lock: WakeLockSentinel | null) => {
      if (!lock || lock.released === true) return;
      Promise.resolve()
        .then(() => lock.release())
        .catch(() => undefined);
    };
    const request = () => {
      Promise.resolve()
        .then(() => navigator.wakeLock.request("screen"))
        .then((lock) => {
          if (!isActive) {
            release(lock);
            return;
          }
          sentinel = lock;
          setState("on");
        })
        .catch(() => {
          if (isActive) setState("unavailable");
        });
    };
    request();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!sentinel || sentinel.released === true) request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      release(sentinel);
      setState("idle");
    };
  }, [active]);
  return state;
}
