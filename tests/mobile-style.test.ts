import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fontSize } from "../src/design/tokens";

/**
 * Varredura de estilo do app nativo (SIS-01): cores e tamanhos de texto vêm dos tokens.
 * O único arquivo com valores fixos é mobile/src/theme/tokens.ts, que reexporta a paleta compartilhada.
 */
const ROOT = path.resolve(import.meta.dirname, "../mobile/src");
const TOKENS_FILE = path.join("theme", "tokens.ts");

/**
 * Exceções deliberadas, por arquivo relativo a mobile/src, com o motivo. Hoje nenhuma: novas entradas
 * precisam de um comentário explicando por que o token não serve.
 */
const HEX_ALLOW = new Set<string>([]);
const SIZE_ALLOW = new Set<string>([]);

const SCALE = new Set<number>(Object.values(fontSize));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(ROOT)
  .map((file) => ({ file, rel: path.relative(ROOT, file) }))
  .filter(({ rel }) => rel !== TOKENS_FILE);

/** Remove comentários, preservando as quebras de linha para os números de linha continuarem certos. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (_, before: string) => before);
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** Atributos de cada <AppText …> (o `>` dentro de chaves, como em arrow functions, não fecha a tag). */
function appTextTags(source: string): { index: number; tag: string }[] {
  const tags: { index: number; tag: string }[] = [];
  let from = 0;
  for (;;) {
    const index = source.indexOf("<AppText", from);
    if (index === -1) return tags;
    from = index + "<AppText".length;
    if (!/[\s>/]/.test(source[from] ?? "")) continue;
    let depth = 0;
    let end = from;
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0) break;
    }
    tags.push({ index, tag: source.slice(index, end) });
    from = end;
  }
}

test("app nativo não declara cores hexadecimais fora de theme/tokens.ts", () => {
  const found: string[] = [];
  for (const { file, rel } of files) {
    if (HEX_ALLOW.has(rel)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g))
      found.push(`${rel}:${lineOf(source, match.index)} ${match[0]}`);
  }
  assert.deepEqual(found, [], `use colors/palette de theme/tokens.ts:\n${found.join("\n")}`);
});

test("tamanhos numéricos de <AppText> estão na escala fontSize (mínimo de 12 px)", () => {
  const found: string[] = [];
  for (const { file, rel } of files) {
    if (!rel.endsWith(".tsx") || SIZE_ALLOW.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const { index, tag } of appTextTags(source)) {
      const size = /\bsize=\{([^{}]*)\}/.exec(tag)?.[1]?.trim();
      if (!size) continue;
      // Literal puro (size={11}) ou ramos literais de um ternário (size={isOn ? 17 : 14}).
      const literals = /^[\d.]+$/.test(size)
        ? [size]
        : [...size.matchAll(/[?:]\s*([\d.]+)(?=\s*(?:[:?]|$))/g)].map((m) => m[1]!);
      for (const literal of literals)
        if (!SCALE.has(Number(literal))) found.push(`${rel}:${lineOf(source, index)} size={${size}}`);
    }
  }
  assert.deepEqual(found, [], `use fontSize de theme/tokens.ts (nearestFontStep ajuda):\n${found.join("\n")}`);
});

test("fontSize numérico em estilos do app nativo está na escala", () => {
  const found: string[] = [];
  for (const { file, rel } of files) {
    if (SIZE_ALLOW.has(rel)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/\bfontSize:\s*([\d.]+)\b/g))
      if (!SCALE.has(Number(match[1]))) found.push(`${rel}:${lineOf(source, match.index)} ${match[0]}`);
  }
  assert.deepEqual(found, [], found.join("\n"));
});

test("a varredura enxerga o app nativo (sanidade do caminho)", () => {
  assert.ok(files.length > 50, `só ${files.length} arquivos em ${ROOT}`);
  assert.ok(files.some(({ rel }) => rel.endsWith(path.join("ui", "text.tsx"))));
});
