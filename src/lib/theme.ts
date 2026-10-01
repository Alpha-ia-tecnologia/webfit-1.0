/**
 * Tema claro/escuro (HOJE-X2), compartilhado pelo web e pelo app nativo: só regras puras.
 * A preferência é do aparelho (chave local `webfit-theme`), não do perfil: não entra no estado,
 * no backup nem no "Excluir dados e recomeçar". Aplicar no DOM fica em theme-dom.ts (web) e o
 * provedor do RN em mobile/src/theme/theme.tsx.
 */
import type { ThemeName } from "../design/tokens";

export type { ThemeName } from "../design/tokens";

export const THEME_PREFS = ["sistema", "claro", "escuro"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

export const THEME_STORAGE_KEY = "webfit-theme";

/** Padrão quando não há escolha salva (ou ela é inválida): acompanha o aparelho. */
export const DEFAULT_THEME_PREF: ThemePref = "sistema";

export const THEME_COPY = {
  row: "Aparência",
  title: "Aparência",
  group: "Tema",
  hint: "Vale só para este aparelho.",
  options: { sistema: "Sistema", claro: "Claro", escuro: "Escuro" },
  details: {
    sistema: "Acompanha o modo claro ou escuro do aparelho.",
    claro: "Fundo claro o tempo todo.",
    escuro: "Fundo escuro, mais confortável à noite.",
  },
} as const satisfies {
  row: string;
  title: string;
  group: string;
  hint: string;
  options: Record<ThemePref, string>;
  details: Record<ThemePref, string>;
};

const isThemePref = (value: unknown): value is ThemePref =>
  typeof value === "string" && (THEME_PREFS as readonly string[]).includes(value);

/** Valor salvo → preferência; qualquer outra coisa (null, vazio, "dark", número…) vira "sistema". */
export function parseThemePref(value: unknown): ThemePref {
  return isThemePref(value) ? value : DEFAULT_THEME_PREF;
}

/** Tema efetivo: a escolha explícita vence; "sistema" segue o modo do aparelho. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ThemeName {
  if (pref === "claro") return "light";
  if (pref === "escuro") return "dark";
  return systemDark ? "dark" : "light";
}

/** Valor de `data-theme` no <html>: "sistema" não fixa nada (o CSS segue prefers-color-scheme). */
export function themeAttribute(pref: ThemePref): ThemeName | null {
  if (pref === "claro") return "light";
  if (pref === "escuro") return "dark";
  return null;
}

/** Um valor por tema, criado sob demanda e reaproveitado (estilos do RN em makeStyles). */
export function memoByScheme<T>(build: (scheme: ThemeName) => T): (scheme: ThemeName) => T {
  const cache = new Map<ThemeName, T>();
  return (scheme) => {
    if (cache.has(scheme)) return cache.get(scheme) as T;
    const value = build(scheme);
    cache.set(scheme, value);
    return value;
  };
}
