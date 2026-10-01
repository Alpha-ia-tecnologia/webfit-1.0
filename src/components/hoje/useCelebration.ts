import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/** Duração do brilho; o CSS usa a mesma janela na animação .is-celebrating. */
const CELEBRATION_MS = 1800;

/**
 * Celebração gentil (SIS-09): liga por um instante quando `isReached` passa de falso para verdadeiro
 * durante o uso E o `progress` cresceu (mais água, mais combinados feitos). Excluir um combinado
 * pendente também fecha a conta, mas não é conquista. Nunca na abertura da tela; desligada com
 * movimento reduzido ou `isEnabled` falso.
 */
export function useCelebration(isReached: boolean, isEnabled: boolean, progress: number): boolean {
  const isReduced = useReducedMotion();
  const previous = useRef({ isReached, progress });
  const [isOn, setOn] = useState(false);
  useEffect(() => {
    const was = previous.current;
    previous.current = { isReached, progress };
    if (isReached && !was.isReached && progress > was.progress && isEnabled && !isReduced) setOn(true);
  }, [isReached, progress, isEnabled, isReduced]);
  useEffect(() => {
    if (!isOn) return;
    const timer = setTimeout(() => setOn(false), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [isOn]);
  return isOn;
}
