import type { KeyboardEvent } from "react";

const STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Teclado de um radiogroup feito de `<button role="radio">` (padrão WAI-ARIA): uma só parada de
 * Tab, no item marcado (sem marcado, no primeiro); setas andam em círculo e Home/End vão às
 * pontas, e a escolha acompanha o foco. Os botões seguem a ordem de `values`.
 */
export function useRadioKeys<T>(
  values: readonly T[],
  checked: T | null | undefined,
  onPick: (value: T) => void,
) {
  const tabStop = values.includes(checked as T) ? checked : values[0];
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Atalhos do navegador (ex.: Alt+← para voltar) passam direto.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = STEP[event.key];
    const isEdge = event.key === "Home" || event.key === "End";
    if (step === undefined && !isEdge) return;
    const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const current = radios.findIndex((radio) => radio.contains(event.target as Node));
    if (current < 0 || radios.length !== values.length) return;
    event.preventDefault();
    const last = radios.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : (current + (step ?? 0) + radios.length) % radios.length;
    radios[next]?.focus();
    if (values[next] !== checked) onPick(values[next] as T);
  };
  return {
    onKeyDown,
    tabIndex: (value: T): 0 | -1 => (value === tabStop ? 0 : -1),
  };
}
