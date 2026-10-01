import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";

/** Arraste horizontal mínimo para trocar de parte. */
const SWIPE_MIN_PX = 40;
/** Toque curto e parado: esquerda volta, o resto avança. */
const TAP_MAX_MS = 300;
const TAP_MAX_PX = 10;
const CONTROLS = "button, a, input";

type PointerStart = { x: number; y: number; time: number; isControl: boolean };

/** Aba oculta: os stories pausam até ela voltar. */
export function useDocumentHidden(): boolean {
  const [isHidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const handle = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);
  return isHidden;
}

/** Setas do teclado trocam de parte enquanto os stories são o diálogo do topo (`isActive`). */
export function useStoryArrowKeys(isActive: boolean, next: () => void, prev: () => void) {
  useEffect(() => {
    if (!isActive) return;
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [isActive, next, prev]);
}

/**
 * Gestos no palco: segurar pausa (`isHeld`), deslizar troca de parte e um toque curto no terço
 * esquerdo volta (no resto, avança). Toques em botões e links ficam com o próprio controle.
 */
export function useStorySwipe(next: () => void, prev: () => void) {
  const pointer = useRef<PointerStart | null>(null);
  const [isHeld, setHeld] = useState(false);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isControl = e.target instanceof Element && Boolean(e.target.closest(CONTROLS));
    pointer.current = { x: e.clientX, y: e.clientY, time: e.timeStamp, isControl };
    setHeld(true);
    // Captura só fora de botões: o clique neles continua indo para o próprio botão.
    if (!isControl) e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    setHeld(false);
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
      return;
    }
    const isTap = e.timeStamp - start.time < TAP_MAX_MS && Math.hypot(dx, dy) < TAP_MAX_PX;
    if (!isTap || start.isControl) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX - box.left < box.width / 3) prev();
    else next();
  };
  const onPointerCancel = () => {
    pointer.current = null;
    setHeld(false);
  };
  return { isHeld, onPointerDown, onPointerUp, onPointerCancel };
}

/** Foco de teclado dentro da parte pausa o avanço; sair do palco com o foco retoma. */
export function useKeyboardFocusPause() {
  const [hasKeyboardFocus, setKeyboardFocus] = useState(false);
  const onFocus = (e: FocusEvent<HTMLDivElement>) => setKeyboardFocus(e.target.matches(":focus-visible"));
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setKeyboardFocus(false);
  };
  return { hasKeyboardFocus, onFocus, onBlur };
}
