/** Id do interruptor "Ocultar números do corpo" (SettingsTab usa `setting-${key}`). */
export const HIDE_BODY_SWITCH_ID = "setting-hideBodyNumbers";
/** Quadros de espera (~2 s): cobre a troca de aba e a tela Meu espaço carregada sob demanda. */
const MAX_FRAMES = 120;

/**
 * Foca o elemento assim que ele aparecer (ex.: "Ajustar em Preferências" troca a aba ou a tela e
 * o interruptor só existe alguns quadros depois); desiste em silêncio se ele não aparecer.
 */
export function focusWhenReady(id: string, frames = MAX_FRAMES): void {
  const element = document.getElementById(id);
  if (element) {
    element.focus();
    return;
  }
  if (frames > 0) requestAnimationFrame(() => focusWhenReady(id, frames - 1));
}
