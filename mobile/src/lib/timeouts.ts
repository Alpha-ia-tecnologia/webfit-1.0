import { useCallback, useEffect, useRef } from "react";

/**
 * `setTimeout` que o componente cancela ao desmontar (foco depois de fechar um painel): nada roda numa
 * tela que já saiu.
 */
export function useTimeouts(): (run: () => void, ms: number) => void {
  const ids = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = ids.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);
  return useCallback((run: () => void, ms: number) => {
    const id = setTimeout(() => {
      ids.current.delete(id);
      run();
    }, ms);
    ids.current.add(id);
  }, []);
}
