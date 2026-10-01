/**
 * Atalhos de teclado (SIS-12). Puro: recebe só o que precisa do evento e do alvo,
 * para ser testado sem DOM. O gancho `useQuickLogShortcut` liga isto à janela.
 */

/** Tecla do "Registro rápido" (valor de `aria-keyshortcuts` e da dica visual). */
export const QUICK_LOG_SHORTCUT = "N";

export interface ShortcutKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
}

export interface ShortcutTarget {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Tipos de input em que uma letra não é digitação (marcar, escolher, arrastar, enviar). */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
const EDITABLE_ANCESTOR = '[role="textbox"],[contenteditable="true"],[contenteditable=""]';

/** Campo onde a letra é digitação: input de texto, textarea, select, contenteditable ou [role=textbox]. */
export function isEditableTarget(target: ShortcutTarget | null): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.(EDITABLE_ANCESTOR));
}

/** "n"/"N" sem Alt/Ctrl/Meta, sem repetição nem composição, fora de campos e sem diálogo ou menu aberto. */
export function isQuickLogShortcut(
  event: ShortcutKeyEvent,
  ctx: { isEditable: boolean; hasOverlay: boolean },
): boolean {
  if (event.key.toLowerCase() !== QUICK_LOG_SHORTCUT.toLowerCase()) return false;
  return !(
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.repeat ||
    event.isComposing ||
    event.defaultPrevented ||
    ctx.isEditable ||
    ctx.hasOverlay
  );
}

/** Parâmetro dos atalhos do app instalado (manifest, HOJE-13). */
export const LAUNCH_PARAM = "atalho";
export type LaunchShortcut = "agua" | "refeicao" | "registro";
const LAUNCH_SHORTCUTS: readonly LaunchShortcut[] = ["agua", "refeicao", "registro"];
/** "?atalho=agua" → "agua"; ausente ou desconhecido → null (nada é registrado sem a pessoa confirmar). */
export function launchShortcut(search: string): LaunchShortcut | null {
  const value = new URLSearchParams(search).get(LAUNCH_PARAM);
  return LAUNCH_SHORTCUTS.find((s) => s === value) ?? null;
}
