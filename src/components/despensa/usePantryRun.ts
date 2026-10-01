import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { busyArea, type PantryArea, type PantryBusy, type PantryError } from "./shared";

const CANCELLED = "Solicitação cancelada. Você pode tentar novamente.";

/**
 * Trabalho em andamento na Despensa (foto, leitura, salvar, receitas): um por vez, com o erro no
 * cartão da área que falhou. Cada tentativa tem um número; cancelar ou sair da tela invalida as
 * anteriores, e respostas atrasadas são ignoradas. Sair no meio de um pedido desta tela o cancela.
 */
export function usePantryRun() {
  const { state, aiReady, aiBusy, cancelAi } = useApp();
  const [busy, setBusy] = useState<PantryBusy>("");
  const [error, setError] = useState<PantryError | null>(null);
  const run = useRef(0);
  const ownRequest = useRef(false);
  useEffect(
    () => () => {
      run.current++;
      if (ownRequest.current) cancelAi();
    },
    [cancelAi],
  );
  const canAi = !!state.profile?.consentAi && aiReady && !aiBusy && !busy;
  /** Nova tentativa (as anteriores deixam de valer); `isAi` marca um pedido desta tela ao agente. */
  const begin = (next: PantryBusy, isAi = false) => {
    const attempt = ++run.current;
    setError(null);
    setBusy(next);
    if (isAi) ownRequest.current = true;
    return attempt;
  };
  const isCurrent = (attempt: number) => run.current === attempt;
  /** O agente respondeu; a tentativa pode seguir (ex.: salvando as receitas). */
  const releaseAi = () => {
    ownRequest.current = false;
  };
  /** Fecha a tentativa atual; respostas de tentativas canceladas ou antigas são ignoradas. */
  const settle = (attempt: number) => {
    if (run.current !== attempt) return;
    setBusy("");
    ownRequest.current = false;
  };
  const fail = (area: PantryArea, e: unknown) => setError({ text: (e as Error).message, area });
  const cancel = () => {
    const area = busyArea(busy) ?? "add";
    run.current++;
    ownRequest.current = false;
    cancelAi();
    setBusy("");
    setError({ text: CANCELLED, area });
  };
  return { busy, setBusy, error, setError, canAi, begin, isCurrent, releaseAi, settle, fail, cancel };
}

export type PantryRun = ReturnType<typeof usePantryRun>;
