/** Vibração curta de confirmação num registro de um toque (SIS-09). */
const TAP_MS = 8;

/**
 * Só existe onde o navegador expõe a Vibration API (Chrome no Android); some com
 * movimento reduzido. O app nativo usa expo-haptics.
 */
export function tapFeedback(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(TAP_MS);
}
