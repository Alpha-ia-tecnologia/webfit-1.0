import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Botão com `disabled` nativo enquanto uma ação roda: o navegador tira o foco dele e o deixa no
 * <body>. Se a ação partiu deste botão e, ao terminar, o foco não foi para outro lugar, ele volta
 * ao botão (se o botão ainda estiver na tela). Ações de outros botões que usam o mesmo "busy"
 * (ex.: remover um favorito) não puxam o foco para cá.
 */
export function useFocusAfterBusy(isBusy: boolean, ref: RefObject<HTMLElement | null>) {
  const shouldRestore = useRef(false);
  useLayoutEffect(() => {
    const active = document.activeElement;
    const isLost = !active || active === document.body;
    if (isBusy) {
      shouldRestore.current = active === ref.current || isLost;
      return;
    }
    if (shouldRestore.current && isLost) ref.current?.focus();
    shouldRestore.current = false;
  }, [isBusy, ref]);
}
