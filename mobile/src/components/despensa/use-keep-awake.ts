import { useEffect, useState } from "react";

/** Tela acesa no modo preparo: "on" com a tela presa, "unavailable" quando o aparelho não deixa. */
export type KeepAwakeState = "idle" | "on" | "unavailable";

type KeepAwakeApi = Pick<
  typeof import("expo-keep-awake"),
  "activateKeepAwakeAsync" | "deactivateKeepAwake" | "isAvailableAsync"
>;

const TAG = "webfit-modo-preparo";
let keepAwakeApi: KeepAwakeApi | null | undefined;

/**
 * Carrega o expo-keep-awake só no primeiro uso (require em linha, que o Metro empacota). O pacote
 * chama requireNativeModule ao ser avaliado: sem o módulo nativo, um import no topo quebraria a tela
 * (e o app) antes de qualquer .catch. Aqui a falha vira null e o hook responde "unavailable". No
 * export web o Metro resolve a versão .web do pacote (Screen Wake Lock API), como antes.
 */
function loadKeepAwake(): KeepAwakeApi | null {
  if (keepAwakeApi === undefined) {
    try {
      keepAwakeApi = require("expo-keep-awake") as KeepAwakeApi;
    } catch {
      keepAwakeApi = null;
    }
  }
  return keepAwakeApi;
}

/** Solta a tela; qualquer recusa (tag já solta, sem suporte) é ignorada. */
function release(): void {
  const api = loadKeepAwake();
  if (!api) return;
  Promise.resolve()
    .then(() => api.deactivateKeepAwake(TAG))
    .catch(() => undefined);
}

/**
 * Mantém a tela acesa enquanto `active` (AGENTE-11), pelo expo-keep-awake (dependência do expo 57,
 * já no APK). As funções são chamadas direto, cada promessa com .catch: o useKeepAwake do pacote
 * pode deixar uma rejeição solta ao desligar. Nunca vira erro na tela: sem suporte, "unavailable".
 */
export function useKeepAwakeWhile(active: boolean): KeepAwakeState {
  const [status, setStatus] = useState<Exclude<KeepAwakeState, "idle">>("unavailable");
  const [isSettled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) return;
    let isAlive = true;
    let isHeld = false;
    const settle = (next: Exclude<KeepAwakeState, "idle">) => {
      if (!isAlive) return;
      setStatus(next);
      setSettled(true);
    };
    Promise.resolve()
      .then(async () => {
        const api = loadKeepAwake();
        if (!api || !(await api.isAvailableAsync())) return settle("unavailable");
        await api.activateKeepAwakeAsync(TAG);
        isHeld = true;
        if (!isAlive) release();
        else settle("on");
      })
      .catch(() => settle("unavailable"));
    return () => {
      isAlive = false;
      setSettled(false);
      if (isHeld) release();
    };
  }, [active]);
  return active && isSettled ? status : "idle";
}
