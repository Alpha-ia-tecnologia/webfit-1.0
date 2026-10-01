import { lazy, type ComponentType } from "react";

/**
 * Tela carregada sob demanda (code splitting): `Component` vai no lugar da tela e `preload`
 * aquece o arquivo antes do toque. Preload e navegação dividem o mesmo pedido; uma falha não
 * fica guardada, então a próxima tentativa baixa de novo.
 */
export interface LazyScreen {
  Component: ComponentType;
  preload: () => void;
}
export function lazyScreen<M>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType,
): LazyScreen {
  let pending: Promise<{ default: ComponentType }> | null = null;
  const loadScreen = () => {
    pending ??= load().then(
      (module) => ({ default: pick(module) }),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
  return {
    Component: lazy(loadScreen),
    // Só aquece: se falhar, a própria navegação mostra o aviso de recarregar.
    preload: () => void loadScreen().catch(() => undefined),
  };
}

/** Agenda `task` para quando o navegador estiver ocioso (sem atrasar o primeiro desenho). */
interface IdleHost {
  requestIdleCallback?: (task: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (task: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
}
/** Sem requestIdleCallback (Safari), espera um pouco com setTimeout. Devolve o cancelamento. */
export function whenIdle(task: () => void, host: IdleHost = window): () => void {
  if (host.requestIdleCallback && host.cancelIdleCallback) {
    const handle = host.requestIdleCallback(task, { timeout: 4000 });
    const cancel = host.cancelIdleCallback;
    return () => cancel(handle);
  }
  const timer = host.setTimeout(task, 1500);
  return () => host.clearTimeout(timer);
}
