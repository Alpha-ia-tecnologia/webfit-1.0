import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Guardas da varredura do tema escuro (HOJE-X2, O3-L4 §4.3.3). Cores com dois papéis (branco,
 * verdes escuros, navy) ficam só no papel que funciona nos dois temas; o outro papel usa os tokens
 * de papel (`--wf-surface`, `--wf-accent-fill`, `--wf-inverse`, `--wf-marker`, `--wf-art-*`…), que
 * têm no claro o mesmo valor de antes.
 */
const SRC = path.join(import.meta.dirname, "..", "src");
const TOKENS_CSS = path.join(SRC, "styles", "tokens.css");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") && path.resolve(full) !== path.resolve(TOKENS_CSS)
      ? [full]
      : [];
  });
}

interface Declaration {
  file: string;
  selector: string;
  property: string;
  value: string;
}

/** Declarações com o seletor da regra (sem comentários; @media/@supports entram pelo seletor interno). */
function declarations(file: string): Declaration[] {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const name = path.relative(SRC, file).replaceAll("\\", "/");
  const out: Declaration[] = [];
  const selectors: string[] = [];
  let buffer = "";
  const flush = () => {
    const selector = selectors.at(-1);
    if (selector !== undefined)
      for (const part of buffer.split(";")) {
        const colon = part.indexOf(":");
        if (colon < 0) continue;
        const property = part.slice(0, colon).trim().toLowerCase();
        const value = part.slice(colon + 1).trim();
        if (property && value) out.push({ file: name, selector, property, value });
      }
    buffer = "";
  };
  for (const char of css) {
    if (char === "{") {
      selectors.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (char === "}") {
      flush();
      selectors.pop();
    } else buffer += char;
  }
  return out;
}

const ALL = cssFiles(SRC).flatMap(declarations);
const where = (d: Declaration) => `${d.file} › ${d.selector} { ${d.property}: ${d.value} }`;
const isBackground = (d: Declaration) => /^background(-color)?$/.test(d.property);

/** Tintas claras que viram tokens no tema escuro (O3-L4 §4.3.3 G). */
const LIGHT_TRIPLETS = [
  "255 255 255",
  "226 232 240",
  "241 245 249",
  "248 250 252",
  "236 253 245",
  "209 250 229",
  "167 243 208",
  "110 231 183",
  "240 249 255",
  "224 242 254",
  "186 230 253",
  "254 243 199",
  "253 230 138",
  "255 241 242",
  "245 243 255",
];
/** Únicos fundos brancos fixos: botão branco sobre o cartão navy, bolinha do interruptor e pegador do slider. */
const WHITE_BACKGROUND_OK = [".next-step-cta", ".switch::after", ".mse-grip"];

test("varredura (1): nenhum `background: white` literal", () => {
  const bad = ALL.filter((d) => isBackground(d) && /^white\b/.test(d.value)).map(where);
  assert.deepEqual(bad, []);
});

test("varredura (2): verde escuro e navy como fundo passam por --wf-accent-fill / --wf-inverse / --wf-marker", () => {
  // As amostras de "Aparência" mostram as cores fixas de cada tema de propósito.
  const bad = ALL.filter(
    (d) =>
      isBackground(d) &&
      /^var\(--wf-(green-700|green-800|navy)\)/.test(d.value) &&
      !d.selector.includes(".theme-swatch"),
  ).map(where);
  assert.deepEqual(bad, []);
});

test("varredura (3): texto não usa constantes que falham no escuro", () => {
  const bad = ALL.filter(
    (d) =>
      d.property === "color" &&
      /^var\(--wf-(green-600|rose-600|sky-600|violet-600|indigo-500|slate-500)\)/.test(d.value),
  ).map(where);
  assert.deepEqual(bad, [], "use --wf-accent-text-soft, --wf-tone-danger-fg ou --wf-tone-water-fg");
});

test("varredura (4): fundos e bordas sem tintas claras literais (só branco translúcido ≤ 0,22 sobre cor)", () => {
  const triplet = new RegExp(`rgba?\\((${LIGHT_TRIPLETS.join("|")})\\s*(?:/\\s*([\\d.]+))?\\)`, "g");
  const bad: string[] = [];
  for (const d of ALL) {
    if (!isBackground(d) && !/^border/.test(d.property) && d.property !== "outline") continue;
    for (const match of d.value.matchAll(triplet)) {
      const alpha = match[2] === undefined ? 1 : Number(match[2]);
      if (match[1] === "255 255 255" && alpha <= 0.22) continue;
      bad.push(where(d));
    }
  }
  assert.deepEqual(bad, [], "use --wf-surface-glass*, --wf-glass-border ou color-mix com o token");
});

test("varredura (5): `background: var(--wf-white)` só nas três regras fixas", () => {
  const bad = ALL.filter(
    (d) =>
      isBackground(d) &&
      /^var\(--wf-white\)/.test(d.value) &&
      !WHITE_BACKGROUND_OK.some((selector) => d.selector.includes(selector)),
  ).map(where);
  assert.deepEqual(bad, [], "superfícies usam var(--wf-surface)");
  const kept = ALL.filter((d) => isBackground(d) && /^var\(--wf-white\)/.test(d.value));
  assert.equal(kept.length, WHITE_BACKGROUND_OK.length);
});

test("varredura (6): seringa e ilustrações de aplicação desenham com os tokens --wf-art-*", () => {
  for (const name of ["SyringeFigure.tsx", "MethodArt.tsx"]) {
    const source = readFileSync(path.join(SRC, "components", "injecao", name), "utf8");
    assert.doesNotMatch(source, /var\(--wf-slate-900\)/, `${name}: use --wf-art-ink`);
    assert.doesNotMatch(source, /var\(--wf-white\)/, `${name}: use --wf-art-paper`);
    assert.doesNotMatch(source, /var\(--wf-slate-\d+\)/, `${name}: use os tokens --wf-art-*`);
  }
  const mini = readFileSync(path.join(SRC, "components", "injecao", "BodyMapMini.tsx"), "utf8");
  assert.doesNotMatch(mini, /var\(--wf-white\)/, "BodyMapMini: o contorno dos pontos é a cor do cartão");
});

test("o parser das guardas enxerga as regras (sanidade)", () => {
  assert.ok(ALL.length > 5000, `${ALL.length} declarações`);
  const toast = ALL.find((d) => d.selector === ".toast" && isBackground(d));
  assert.equal(toast?.value, "var(--wf-inverse)");
  const knob = ALL.find((d) => d.selector.includes(".switch::after") && isBackground(d));
  assert.equal(knob?.value, "var(--wf-white)");
});
