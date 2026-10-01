import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  browserThemeColor,
  contrastRatio,
  darkDomainTone,
  darkMacroColor,
  darkPalette,
  darkRoles,
  darkSemantic,
  domainTone,
  macroColor,
  motion,
  nearestFontStep,
  palette,
  roles,
  semantic,
  springCurve,
} from "../src/design/tokens";
import {
  buildTokensCss,
  darkOverrides,
  tokenMap,
  TOKENS_CSS_PATH,
  type TokenTheme,
} from "../scripts/build-tokens";

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}
const SRC = path.join(import.meta.dirname, "..", "src");

test("tokens.css é exatamente o gerado a partir de src/design/tokens.ts", () => {
  assert.equal(
    readFileSync(TOKENS_CSS_PATH, "utf8").replace(/\r\n/g, "\n"),
    buildTokensCss(),
    "Rode: node --import tsx scripts/build-tokens.ts",
  );
});

test("textos informativos passam no contraste AA sobre todas as superfícies", () => {
  for (const text of [semantic.text, semantic.text2, semantic.textMuted])
    for (const surface of [semantic.surface, semantic.surface3, semantic.bg])
      assert.ok(
        contrastRatio(text, surface) >= 4.5,
        `${text} sobre ${surface}: ${contrastRatio(text, surface).toFixed(2)}`,
      );
  assert.ok(contrastRatio(semantic.textFaint, semantic.surface) < 4.5);
});

test("tons de domínio têm contraste de ícone (3:1) sobre o próprio fundo", () => {
  for (const [domain, tone] of Object.entries(domainTone))
    assert.ok(contrastRatio(tone.fg, tone.bg) >= 3, domain);
});

/** Matiz HSL (0–360°) de uma cor #rrggbb. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}
const hueDistance = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

test("tom warn da validade: texto AA, longe do vermelho, do âmbar da gordura e distinto da atenção", () => {
  const { warn, danger, attention } = domainTone;
  assert.ok(contrastRatio(warn.fg, warn.bg) >= 4.5, contrastRatio(warn.fg, warn.bg).toFixed(2));
  assert.ok(hueDistance(warn.fg, danger.fg) >= 25, `${hueDistance(warn.fg, danger.fg).toFixed(1)}° do vermelho`);
  assert.ok(hueDistance(warn.fg, macroColor.fat) >= 15, `${hueDistance(warn.fg, macroColor.fat).toFixed(1)}° da gordura`);
  assert.notEqual(warn.fg, attention.fg);
});

test("molas assentam no alvo, com pouco passo além e duração curta", () => {
  for (const [name, config] of Object.entries(motion.spring)) {
    const curve = springCurve(config);
    assert.equal(curve.points[0], 0, name);
    assert.equal(curve.points.at(-1), 1, name);
    assert.ok(Math.max(...curve.points) < 1.08, `${name}: passa demais do alvo`);
    assert.ok(curve.durationMs > 200 && curve.durationMs < 900, `${name}: ${curve.durationMs} ms`);
  }
});

test("tamanhos livres caem no degrau mais próximo da escala", () => {
  assert.equal(nearestFontStep(10), "2xs");
  assert.equal(nearestFontStep(12.5), "sm");
  assert.equal(nearestFontStep(14), "base");
  assert.equal(nearestFontStep(16), "lg");
  assert.equal(nearestFontStep(30), "4xl");
  assert.equal(nearestFontStep(36), "5xl");
});

test("cores só vêm dos tokens: nenhum hex nos CSS fora do tokens.css gerado", () => {
  for (const file of cssFiles(SRC)) {
    if (path.resolve(file) === path.resolve(TOKENS_CSS_PATH)) continue;
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    assert.deepEqual(hex, [], `${path.relative(SRC, file)}: use var(--wf-*) (acrescente a cor em src/design/tokens.ts se faltar)`);
  }
});

test("CSS do app usa a escala tipográfica e não usa o cinza decorativo em texto", () => {
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, "utf8");
    const name = path.relative(SRC, file);
    assert.doesNotMatch(css, /font-size:\s*\d+(\.\d+)?px/, `${name}: use var(--wf-fs-*)`);
    assert.doesNotMatch(
      css,
      /(^|[\s;{])color:\s*var\(--wf-text-faint\)/m,
      `${name}: texto informativo usa --wf-text-muted`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// Tema escuro (HOJE-X2)
// ---------------------------------------------------------------------------------------------

const DARK_SURFACES = [darkSemantic.bg, darkSemantic.surface, darkSemantic.surface2, darkSemantic.surface3];
const ratio = (fg: string, bg: string) => contrastRatio(fg, bg).toFixed(2);

test("tema escuro: textos informativos passam no AA sobre todas as superfícies escuras", () => {
  for (const text of [darkSemantic.text, darkSemantic.text2, darkSemantic.textMuted])
    for (const surface of DARK_SURFACES)
      assert.ok(contrastRatio(text, surface) >= 4.5, `${text} sobre ${surface}: ${ratio(text, surface)}`);
  assert.ok(contrastRatio(darkSemantic.textFaint, darkSemantic.surface) < 4.5, "faint segue só decorativo");
});

test("tema escuro: tons de domínio servem de ícone e de texto; atenção âmbar, warn laranja, vermelho só erro", () => {
  for (const [domain, tone] of Object.entries(darkDomainTone)) {
    assert.ok(contrastRatio(tone.fg, tone.bg) >= 3, `${domain} ícone: ${ratio(tone.fg, tone.bg)}`);
    assert.ok(
      contrastRatio(tone.fg, darkSemantic.surface) >= 4.5,
      `${domain} texto na superfície: ${ratio(tone.fg, darkSemantic.surface)}`,
    );
  }
  const { warn, danger, attention } = darkDomainTone;
  assert.ok(contrastRatio(warn.fg, warn.bg) >= 4.5, ratio(warn.fg, warn.bg));
  assert.ok(hueDistance(warn.fg, danger.fg) >= 25, `${hueDistance(warn.fg, danger.fg).toFixed(1)}° do vermelho`);
  assert.ok(
    hueDistance(warn.fg, darkMacroColor.fat) >= 15,
    `${hueDistance(warn.fg, darkMacroColor.fat).toFixed(1)}° da gordura`,
  );
  assert.notEqual(warn.fg, attention.fg);
  assert.ok(hue(attention.fg) >= 35 && hue(attention.fg) <= 55, `atenção em ${hue(attention.fg).toFixed(1)}° (âmbar)`);
  assert.ok(hueDistance(attention.fg, danger.fg) >= 40, "atenção nunca parece vermelho");
});

test("tema escuro: cores dos macronutrientes visíveis (3:1) nas superfícies", () => {
  for (const [macro, color] of Object.entries(darkMacroColor))
    for (const surface of [darkSemantic.surface, darkSemantic.surface2])
      assert.ok(contrastRatio(color, surface) >= 3, `${macro} sobre ${surface}: ${ratio(color, surface)}`);
});

/** Primitivos escuros usados como texto no CSS (green-700, amber-700…): viram claros legíveis. */
const DARK_TEXT_PRIMITIVES = [
  "green700",
  "green800",
  "primary",
  "sky700",
  "sky800",
  "amber700",
  "amber900",
  "rose700",
  "indigo700",
  "teal700",
  "orange700",
  "slate550",
  "slate700",
  "slate900",
] as const satisfies readonly (keyof typeof darkPalette)[];

test("tema escuro: primitivos de texto passam no AA sobre a superfície e sobre o menta escuro", () => {
  for (const key of DARK_TEXT_PRIMITIVES)
    for (const background of [darkSemantic.surface, darkPalette.mint50])
      assert.ok(
        contrastRatio(darkPalette[key], background) >= 4.5,
        `${key} sobre ${background}: ${ratio(darkPalette[key], background)}`,
      );
});

test("papéis da varredura: preenchimentos, inverso, marcador e papel da seringa legíveis", () => {
  for (const fill of [roles.accentFill, roles.accentFillStrong])
    assert.ok(contrastRatio(palette.white, fill) >= 4.5, `branco sobre ${fill}: ${ratio(palette.white, fill)}`);
  assert.ok(contrastRatio(palette.white, darkRoles.inverse) >= 4.5, ratio(palette.white, darkRoles.inverse));
  assert.ok(contrastRatio(darkRoles.marker, darkPalette.slate100) >= 3, ratio(darkRoles.marker, darkPalette.slate100));
  assert.ok(contrastRatio(roles.artInk, darkRoles.artPaper) >= 7, ratio(roles.artInk, darkRoles.artPaper));
  assert.deepEqual(browserThemeColor, { light: palette.emerald, dark: darkSemantic.bg });
});

test("constantes da marca não mudam no escuro e os papéis têm o valor claro de hoje", () => {
  for (const constant of ["white", "navy", "emerald", "blue", "green500", "green600", "rose600"])
    assert.ok(!(constant in darkPalette), `${constant} é igual nos dois temas`);
  // Valores de hoje (literais), para a varredura do CSS não mudar nada no tema claro.
  assert.deepEqual(roles, {
    surfaceGlass: "rgba(255, 255, 255, 0.85)",
    surfaceGlassStrong: "rgba(255, 255, 255, 0.92)",
    surfaceGlassSoft: "rgba(255, 255, 255, 0.6)",
    glassBorder: "rgba(226, 232, 240, 0.7)",
    accentFill: "#047857",
    accentFillStrong: "#065f46",
    accentTextSoft: "#059669",
    inverse: "#0a192f",
    inverseBorder: "rgba(10, 25, 47, 0)",
    marker: "#0a192f",
    onFillMint: "#a7f3d0",
    onFillMint50: "#ecfdf5",
    onFillSlate: "#e2e8f0",
    onFillAmber: "#fde68a",
    onFillSky: "#e0f2fe",
    onFillRose: "#fecdd3",
    artPaper: "#ffffff",
    artInk: "#0f172a",
    artLine: "#cbd5e1",
    artMid: "#e2e8f0",
    artSoft: "#f1f5f9",
    artFaint: "#f8fafc",
    artMuted: "#94a3b8",
  });
  // Cada papel substitui um token de hoje com o mesmo valor claro.
  const light = tokenMap("light");
  const SWEEP: Record<string, string> = {
    "accent-fill": "green-700",
    "accent-fill-strong": "green-800",
    "accent-text-soft": "green-600",
    inverse: "navy",
    marker: "navy",
    "on-fill-mint": "mint-200",
    "on-fill-mint-50": "mint-50",
    "on-fill-slate": "slate-200",
    "on-fill-amber": "amber-200",
    "on-fill-sky": "sky-100",
    "on-fill-rose": "rose-200",
    "art-paper": "white",
    "art-ink": "slate-900",
    "art-line": "slate-300",
    "art-mid": "slate-200",
    "art-soft": "slate-100",
    "art-faint": "slate-50",
    "art-muted": "slate-400",
  };
  for (const [role, token] of Object.entries(SWEEP)) assert.equal(light.get(role), light.get(token), role);
});

test("mapa de tokens: mesmos nomes e ordem nos dois temas; o escuro só troca cores", () => {
  const light = tokenMap("light");
  const dark = tokenMap("dark");
  assert.deepEqual([...dark.keys()], [...light.keys()]);
  const overrides = darkOverrides();
  const overridden = new Set(overrides.map(([name]) => name));
  for (const [name, value] of overrides) {
    assert.ok(light.has(name), name);
    assert.notEqual(value, light.get(name), name);
    assert.equal(value, dark.get(name), name);
  }
  assert.deepEqual(
    overrides.map(([name]) => name),
    [...light.keys()].filter((name) => overridden.has(name)),
    "na ordem do mapa claro",
  );
  const constant = [
    "emerald",
    "blue",
    "navy",
    "white",
    "green-500",
    "green-600",
    "rose-600",
    "sky-600",
    "violet-600",
    "indigo-500",
    "slate-500",
    "gradient",
    "gradient-btn",
    "gradient-fab",
    "gradient-user",
    "accent-fill",
    "accent-fill-strong",
    "on-fill-mint",
    "on-fill-amber",
    "art-ink",
    "art-line",
    "ease",
  ];
  for (const name of constant) assert.ok(!overridden.has(name), `${name} é igual nos dois temas`);
  for (const name of light.keys())
    if (/^(fs|space|radius|spring)-/.test(name)) assert.ok(!overridden.has(name), `${name}: escala igual`);
});

test("tokens.css: :root claro, e o escuro pelo sistema (sem data-theme=light) ou pela escolha explícita", () => {
  const css = buildTokensCss();
  const root = css.match(/^:root \{\n([\s\S]*?)\n\}$/m);
  assert.ok(root, ":root claro");
  const rootLines = root[1]!.split("\n").map((line) => line.trim());
  assert.equal(rootLines[0], "color-scheme: light;");
  assert.deepEqual(
    rootLines.slice(1),
    [...tokenMap("light")].map(([name, value]) => `--wf-${name}: ${value};`),
  );
  const count = (needle: string) => css.split(needle).length - 1;
  assert.equal(count("@media (prefers-color-scheme: dark)"), 1);
  assert.equal(count(':root:not([data-theme="light"])'), 1);
  assert.equal(count(':root[data-theme="dark"]'), 1);
  const media = css.match(
    /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{\n([\s\S]*?)\n {2}\}\n\}/,
  );
  const explicit = css.match(/^:root\[data-theme="dark"\] \{\n([\s\S]*?)\n\}$/m);
  assert.ok(media, "bloco @media do sistema");
  assert.ok(explicit, "bloco da escolha explícita");
  const expected = ["color-scheme: dark;", ...darkOverrides().map(([name, value]) => `--wf-${name}: ${value};`)];
  const lines = (block: string) => block.split("\n").map((line) => line.trim());
  assert.deepEqual(lines(media[1]!), expected);
  assert.deepEqual(lines(explicit[1]!), expected);
  assert.ok(css.indexOf("@media (prefers-color-scheme: dark)") > css.indexOf("color-scheme: light;"));
});

test("tema só nos tokens: nenhum outro CSS usa prefers-color-scheme ou data-theme", () => {
  for (const file of cssFiles(SRC)) {
    if (path.resolve(file) === path.resolve(TOKENS_CSS_PATH)) continue;
    const css = readFileSync(file, "utf8");
    assert.doesNotMatch(
      css,
      /prefers-color-scheme|data-theme/,
      `${path.relative(SRC, file)}: o tema vem só de tokens.css`,
    );
  }
});

/**
 * Pares texto/superfície/tom nos dois temas, medidos nos valores que vão para o CSS (tokenMap).
 * Texto pede 4,5:1; marcas gráficas (macros, marcador) 3:1; a tinta da seringa sobre o papel 7:1.
 * Ficam de fora as constantes que a varredura tira de texto (green-600, rose-600, sky-600,
 * violet-600, indigo-500, slate-500, navy) e o text-faint (só decorativo).
 */
const PAIR_SURFACES = ["bg", "surface", "surface-2", "surface-3"];
const PAIR_TEXTS = ["text", "text-2", "text-muted"];
const PAIR_DOMAINS = Object.keys(domainTone);
const PAIR_TEXT_PRIMITIVES = DARK_TEXT_PRIMITIVES.map((key) =>
  key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase(),
);
const CONTRAST_PAIRS: { fg: string; bg: string; min: number }[] = [
  ...PAIR_TEXTS.flatMap((fg) =>
    [...PAIR_SURFACES, ...PAIR_DOMAINS.map((domain) => `tone-${domain}-bg`)].map((bg) => ({ fg, bg, min: 4.5 })),
  ),
  ...PAIR_DOMAINS.flatMap((domain) =>
    [`tone-${domain}-bg`, ...PAIR_SURFACES].map((bg) => ({ fg: `tone-${domain}-fg`, bg, min: 4.5 })),
  ),
  ...PAIR_TEXT_PRIMITIVES.flatMap((fg) => [...PAIR_SURFACES, "mint-50"].map((bg) => ({ fg, bg, min: 4.5 }))),
  ...PAIR_SURFACES.map((bg) => ({ fg: "accent-text-soft", bg, min: 4.5 })),
  { fg: "white", bg: "accent-fill", min: 4.5 },
  { fg: "white", bg: "accent-fill-strong", min: 4.5 },
  { fg: "white", bg: "inverse", min: 4.5 },
  { fg: "on-fill-amber", bg: "inverse", min: 4.5 },
  { fg: "on-fill-sky", bg: "inverse", min: 4.5 },
  ...["surface", "surface-2"].map((bg) => ({ fg: "marker", bg, min: 3 })),
  { fg: "art-ink", bg: "art-paper", min: 7 },
  ...Object.keys(macroColor).flatMap((macro) =>
    ["surface", "surface-2"].map((bg) => ({ fg: `macro-${macro}`, bg, min: 3 })),
  ),
];

function contrastFailures(theme: TokenTheme): string[] {
  const tokens = tokenMap(theme);
  return CONTRAST_PAIRS.flatMap(({ fg, bg, min }) => {
    const [fgHex, bgHex] = [tokens.get(fg) ?? "", tokens.get(bg) ?? ""];
    assert.match(fgHex, /^#[0-9a-f]{6}$/, `${fg} precisa ser hex`);
    assert.match(bgHex, /^#[0-9a-f]{6}$/, `${bg} precisa ser hex`);
    return contrastRatio(fgHex, bgHex) < min ? [`${fg}|${bg}`] : [];
  });
}

/**
 * Falhas que o tema claro já tinha antes do HOJE-X2 (registradas, não corrigidas aqui): os tons
 * saturados usados como texto sobre as superfícies e as cores dos macros como gráfico. A lista só
 * pode encolher; o escuro não pode ter nenhuma falha que o claro não tenha.
 */
const LIGHT_KNOWN_FAILURES = new Set<string>([
  // Tons como texto: sky-600, green-600, teal-600 e indigo-500 em todas as superfícies claras…
  ...["water", "food", "habit", "body"].flatMap((domain) =>
    [`tone-${domain}-bg`, "bg", "surface", "surface-2", "surface-3"].map((bg) => `tone-${domain}-fg|${bg}`),
  ),
  // …pink-600 e rose-600 fora do branco puro, slate-500 no fundo e no cinza.
  ...["mind", "danger"].flatMap((domain) =>
    [`tone-${domain}-bg`, "bg", "surface-2", "surface-3"].map((bg) => `tone-${domain}-fg|${bg}`),
  ),
  ...["tone-neutral-bg", "bg", "surface-2"].map((bg) => `tone-neutral-fg|${bg}`),
  // green-600 como texto (hoje `color: var(--wf-green-600)`, que a varredura leva a accent-text-soft).
  ...["bg", "surface", "surface-2", "surface-3"].map((bg) => `accent-text-soft|${bg}`),
  // Cores dos macros como gráfico (anéis, barras) abaixo de 3:1 no branco e no cinza.
  ...["protein", "carbs", "fat"].flatMap((macro) => ["surface", "surface-2"].map((bg) => `macro-${macro}|${bg}`)),
]);

test("contraste nos dois temas: o escuro não cria falha que o claro não tenha", () => {
  const light = contrastFailures("light");
  const dark = contrastFailures("dark");
  assert.deepEqual(light.filter((pair) => !LIGHT_KNOWN_FAILURES.has(pair)), [], "falha nova no tema claro");
  assert.deepEqual(dark.filter((pair) => !light.includes(pair)), [], "falha nova no tema escuro");
  assert.deepEqual(dark, [], "o tema escuro passa em todos os pares");
});
