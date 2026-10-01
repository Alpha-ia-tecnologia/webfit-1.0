/**
 * Tema no navegador (HOJE-X2): lê e grava a escolha "Aparência" deste aparelho e a aplica no
 * <html>. "Sistema" não precisa de script (o CSS e as metas seguem prefers-color-scheme); uma
 * escolha explícita vira `data-theme`, aplicada por initTheme() antes do React montar (a CSP não
 * permite script embutido no index.html, então pode piscar um quadro).
 */
import { browserThemeColor } from "../design/tokens";
import {
  DEFAULT_THEME_PREF,
  THEME_STORAGE_KEY,
  parseThemePref,
  themeAttribute,
  type ThemePref,
} from "./theme";

const listeners = new Set<() => void>();
let current: ThemePref | null = null;

/** Preferência salva neste navegador; armazenamento bloqueado (janela anônima etc.) → "sistema". */
export function readThemePref(): ThemePref {
  try {
    return parseThemePref(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREF;
  }
}

/** `data-theme` no <html> e as metas color-scheme / theme-color do navegador. */
export function applyTheme(pref: ThemePref, doc: Document | undefined = globalThis.document): void {
  if (!doc) return;
  const attr = themeAttribute(pref);
  const root = doc.documentElement;
  if (attr) root.setAttribute("data-theme", attr);
  else root.removeAttribute("data-theme");
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", attr ?? "light dark");
  doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = attr ?? (/dark/.test(meta.getAttribute("media") ?? "") ? "dark" : "light");
    meta.setAttribute("content", browserThemeColor[scheme]);
  });
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function getThemePref(): ThemePref {
  if (current === null) current = readThemePref();
  return current;
}

/** Grava (se der), aplica e avisa quem acompanha a escolha. */
export function setThemePref(pref: ThemePref): void {
  current = pref;
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Sem armazenamento a escolha vale só até recarregar; o tema muda do mesmo jeito.
  }
  applyTheme(pref);
  emit();
}

export function subscribeThemePref(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let started = false;

/** Lê a escolha, aplica e acompanha mudanças feitas em outra aba. Chamado uma vez em main.tsx. */
export function initTheme(): void {
  current = readThemePref();
  applyTheme(current);
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    current = readThemePref();
    applyTheme(current);
    emit();
  });
}
