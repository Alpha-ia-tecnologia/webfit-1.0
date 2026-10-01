import { useState } from "react";

/**
 * Registros que chegaram depois da primeira renderização da lista: só eles ganham a animação de
 * entrada (SIS-09), para a tela não "piscar" inteira ao abrir.
 */
export function useEnteringIds(ids: readonly string[]): ReadonlySet<string> {
  const [initial] = useState(() => new Set(ids));
  return new Set(ids.filter((id) => !initial.has(id)));
}
