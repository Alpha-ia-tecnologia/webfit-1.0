// Corrige as categorias da TACO em src/data/foods.json sem reimportar a planilha.
// A planilha repete o cabeçalho "Número do Alimento" a cada página e a importação antiga o
// tomava como categoria; aqui cada alimento volta à categoria oficial do bloco em que está.
// Uso: node --import tsx scripts/fix-taco-categories.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Faixas de códigos por categoria na TACO, 4ª edição (NEPA/UNICAMP, 2011). */
export const TACO_CATEGORY_RANGES: ReadonlyArray<readonly [string, number, number]> = [
  ["Cereais e derivados", 1, 63],
  ["Verduras, hortaliças e derivados", 64, 162],
  ["Frutas e derivados", 163, 258],
  ["Gorduras e óleos", 259, 272],
  ["Pescados e frutos do mar", 273, 322],
  ["Carnes e derivados", 323, 445],
  ["Leite e derivados", 446, 469],
  ["Bebidas (alcoólicas e não alcoólicas)", 470, 483],
  ["Ovos e derivados", 484, 490],
  ["Produtos açucarados", 491, 510],
  ["Miscelâneas", 511, 519],
  ["Outros alimentos industrializados", 520, 524],
  ["Alimentos preparados", 525, 556],
  ["Leguminosas e derivados", 557, 586],
  ["Nozes e sementes", 587, 597],
];

const HEADER = /^Número/;

export function categoryForCode(code: number): string | null {
  return TACO_CATEGORY_RANGES.find(([, first, last]) => code >= first && code <= last)?.[0] ?? null;
}

/** Reescreve só os valores de "category", preservando o resto do arquivo byte a byte. */
export function fixCategories(json: string): { text: string; fixed: number } {
  let last: string | null = null;
  let fixed = 0;
  const text = json.replace(
    /("id":\s*"taco-(\d+)"[\s\S]*?"category":\s*)"([^"]*)"/g,
    (_match, prefix: string, code: string, category: string) => {
      const expected = categoryForCode(Number(code));
      const value = HEADER.test(category) ? last : category;
      if (!value || value !== expected)
        throw new Error(`taco-${code}: categoria "${value}" difere da oficial "${expected}"`);
      if (value !== category) fixed++;
      last = value;
      return `${prefix}${JSON.stringify(value)}`;
    },
  );
  return { text, fixed };
}

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = path.join(here, "..", "src", "data", "foods.json");
  const { text, fixed } = fixCategories(readFileSync(file, "utf8"));
  writeFileSync(file, text);
  console.log(`Categorias corrigidas: ${fixed}.`);
}
