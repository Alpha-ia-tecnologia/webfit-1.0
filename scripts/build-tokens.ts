// Gera src/styles/tokens.css a partir de src/design/tokens.ts (fonte única web + app nativo).
// Uso: node --import tsx scripts/build-tokens.ts   (tests/tokens.test.ts falha se o CSS divergir)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  darkDomainTone,
  darkMacroColor,
  darkPalette,
  darkRoles,
  darkSemantic,
  darkShadows,
  domainTone,
  fontSize,
  gradients,
  macroColor,
  motion,
  palette,
  radius,
  roles,
  semantic,
  shadows,
  space,
  springCurve,
} from "../src/design/tokens";

export type TokenTheme = "light" | "dark";

const kebab = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
const rem = (px: number) => `${Number((px / 16).toFixed(4))}rem`;

type Palette = Record<keyof typeof palette, string>;
type Semantic = Record<keyof typeof semantic, string>;
type Shadows = Record<keyof typeof shadows, string>;

/** As cores de cada tema; o resto (escala, espaços, raios, molas, gradientes) é igual nos dois. */
interface ThemeSource {
  palette: Palette;
  semantic: Semantic;
  domainTone: typeof domainTone;
  macroColor: Record<keyof typeof macroColor, string>;
  shadows: Shadows;
  roles: Record<keyof typeof roles, string>;
}

function themeSource(theme: TokenTheme): ThemeSource {
  if (theme === "light") return { palette, semantic, domainTone, macroColor, shadows, roles };
  return {
    palette: { ...palette, ...darkPalette },
    semantic: darkSemantic,
    domainTone: darkDomainTone,
    macroColor: darkMacroColor,
    shadows: darkShadows,
    roles: { ...roles, ...darkRoles },
  };
}

/** Nomes --wf-* históricos mantidos para não quebrar o CSS existente. */
function legacy(p: Palette, s: Semantic, sh: Shadows): Record<string, string> {
  return {
    emerald: p.emerald,
    blue: p.blue,
    navy: p.navy,
    "green-500": p.green500,
    "green-600": p.green600,
    "green-700": p.green700,
    "green-800": p.green800,
    primary: p.primary,
    "mint-50": p.mint50,
    "mint-100": p.mint100,
    "mint-200": p.mint200,
    "sky-50": p.sky50,
    "sky-100": p.sky100,
    "sky-600": p.sky600,
    "amber-50": p.amber50,
    "amber-100": p.amber100,
    "amber-200": p.amber200,
    "amber-500": p.amber500,
    "amber-700": p.amber700,
    "amber-900": p.amber900,
    "rose-400": p.rose400,
    "rose-600": p.rose600,
    "indigo-50": p.indigo50,
    "indigo-500": p.indigo500,
    "indigo-700": p.indigo700,
    "violet-50": p.violet50,
    "violet-600": p.violet600,
    bg: s.bg,
    surface: s.surface,
    "surface-2": s.surface2,
    "surface-3": s.surface3,
    text: s.text,
    "text-2": s.text2,
    "text-muted": s.textMuted,
    "text-faint": s.textFaint,
    border: s.border,
    "border-soft": s.borderSoft,
    gradient: gradients.brand,
    "gradient-btn": gradients.button,
    "gradient-fab": gradients.fab,
    "gradient-user": gradients.user,
    "shadow-card": sh.card,
    "shadow-float": sh.float,
    "radius-lg": `${radius.lg}px`,
    "radius-md": `${radius.md}px`,
    "radius-sm": `${radius.sm}px`,
    "radius-xs": `${radius.xs}px`,
    ease: motion.ease,
  };
}

/**
 * Mapa completo --wf-* (sem o prefixo) na ordem histórica, com os papéis (HOJE-X2) no fim.
 * "dark" aplica darkPalette/darkSemantic/darkDomainTone/darkMacroColor/darkShadows/darkRoles.
 */
export function tokenMap(theme: TokenTheme): Map<string, string> {
  const source = themeSource(theme);
  const tokens = new Map<string, string>();
  const add = (name: string, value: string | number) => tokens.set(name, String(value));
  // Toda a paleta vira token (--wf-rose-800, --wf-slate-300…); os nomes históricos vêm depois.
  for (const [name, value] of Object.entries(source.palette)) add(kebab(name), value);
  for (const [name, value] of Object.entries(legacy(source.palette, source.semantic, source.shadows)))
    add(name, value);
  for (const [domain, tone] of Object.entries(source.domainTone)) {
    add(`tone-${domain}-fg`, tone.fg);
    add(`tone-${domain}-bg`, tone.bg);
    add(`tone-${domain}-border`, tone.border);
  }
  for (const [macro, color] of Object.entries(source.macroColor)) add(`macro-${kebab(macro)}`, color);
  for (const [step, px] of Object.entries(fontSize)) add(`fs-${step}`, rem(px));
  for (const [step, px] of Object.entries(space)) add(`space-${step}`, `${px}px`);
  for (const [name, config] of Object.entries(motion.spring)) {
    const curve = springCurve(config);
    add(`spring-${name}`, `linear(${curve.points.join(", ")})`);
    add(`spring-${name}-duration`, `${curve.durationMs}ms`);
  }
  for (const [name, value] of Object.entries(source.roles)) add(kebab(name), value);
  return tokens;
}

/** Só os nomes cujo valor escuro difere do claro, na ordem do mapa claro. */
export function darkOverrides(): [string, string][] {
  const dark = tokenMap("dark");
  return [...tokenMap("light")].flatMap(([name, value]): [string, string][] => {
    const darkValue = dark.get(name);
    return darkValue !== undefined && darkValue !== value ? [[name, darkValue]] : [];
  });
}

const declarations = (entries: Iterable<[string, string]>, indent: string) =>
  [...entries].map(([name, value]) => `${indent}--wf-${name}: ${value};`);

/**
 * `:root` claro e, depois, o escuro duas vezes com as mesmas linhas: por @media (segue o sistema,
 * a menos que `data-theme="light"`) e por `:root[data-theme="dark"]` (escolha explícita).
 */
export function buildTokensCss(): string {
  const overrides = darkOverrides();
  return [
    "/* Gerado por scripts/build-tokens.ts a partir de src/design/tokens.ts. Não edite à mão. */",
    ":root {",
    "  color-scheme: light;",
    ...declarations(tokenMap("light"), "  "),
    "}",
    '/* Tema escuro (HOJE-X2): segue o sistema, a menos que a pessoa escolha "Claro" em Aparência. */',
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    "    color-scheme: dark;",
    ...declarations(overrides, "    "),
    "  }",
    "}",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    ...declarations(overrides, "  "),
    "}",
    "",
  ].join("\n");
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const TOKENS_CSS_PATH = path.join(here, "..", "src", "styles", "tokens.css");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(TOKENS_CSS_PATH, buildTokensCss());
  console.log(`Tokens gravados em ${path.relative(process.cwd(), TOKENS_CSS_PATH)}.`);
}
