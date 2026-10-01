/**
 * Importa a planilha oficial da TACO (NEPA/UNICAMP, 4ª edição, 2011) para src/data/foods.json e
 * data-sources/taco-metadata.json. Só usa o Node (o .xlsx é um zip lido com node:zlib), substituindo o
 * antigo scripts/import_taco.py.
 *
 *   node --import tsx scripts/import-taco.ts          # grava os dois arquivos
 *   node --import tsx scripts/import-taco.ts --check  # só compara com os arquivos atuais
 *
 * Regras (composição por 100 g, três casas decimais):
 * - "Tr" (traços) vira 0 e o alimento recebe uma nota.
 * - "NA" (não se aplica, ex.: proteína e carboidrato dos óleos, tudo no sal) vira 0, com nota.
 * - Carboidrato calculado por diferença que sai levemente negativo (resíduo até −0,1 g) vira 0, com nota.
 * - Bebida destilada sem macronutrientes na tabela (a energia vem do álcool) entra com eles em 0, com nota.
 * - "*" (valores em análise) ou qualquer outro valor ausente: o alimento fica de fora. Nenhum número é
 *   inventado: o que não está na TACO não entra no catálogo.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { categoryForCode } from "./fix-taco-categories";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const XLSX = path.join(ROOT, "data-sources/taco.xlsx");
const FOODS = path.join(ROOT, "src/data/foods.json");
const METADATA = path.join(ROOT, "data-sources/taco-metadata.json");
const SOURCE = "https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/";
/** Erro de digitação da planilha oficial (conferido na aba de ácidos graxos): o item 540 é a Feijoada. */
const NAME_FIXES: Record<string, string> = { "540": "Feijoada" };
/** Destilados: a TACO traz só a energia (do álcool), sem proteína, gordura ou carboidrato. */
const ALCOHOL_ONLY = new Set(["472"]);
/** Resíduo aceito do carboidrato por diferença (g por 100 g). */
const CARB_RESIDUE = -0.1;
/** Colunas da aba principal: energia (kcal), proteína, carboidrato e lipídeos. */
const COLUMNS = { calories: "D", protein: "F", carbs: "I", fat: "G" } as const;
type Macro = keyof typeof COLUMNS;

const NOTES = {
  trace: "Um ou mais macronutrientes classificados como traços (Tr) foram aproximados para zero no cálculo.",
  notApplicable: "Valores marcados como NA (não se aplica) na TACO foram considerados zero.",
  residue: "Carboidrato calculado por diferença saiu levemente negativo na TACO e foi considerado zero.",
  alcohol: "A TACO informa só a energia (vinda do álcool); proteína, gordura e carboidrato foram considerados zero.",
} as const;

/** Um número como o Python o escreveria: "0" para o zero de traços/NA, decimal com ".0" nos demais. */
type Value = { n: number; isWhole: boolean };

export type TacoFood = {
  id: string;
  name: string;
  category: string;
  caloriesPer100g: Value;
  proteinPer100g: Value;
  carbsPer100g: Value;
  fatPer100g: Value;
  source: string;
  sourceUrl: string;
  note?: string;
};
export type Excluded = { code: string; name: string; reason: string };

// ---------- Leitura do .xlsx (zip + XML) ----------

function zipEntries(buf: Buffer): Map<string, { method: number; size: number; local: number }> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("taco.xlsx não parece um arquivo zip");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; size: number; local: number }>();
  for (let i = 0; i < count; i++) {
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    entries.set(buf.toString("utf8", offset + 46, offset + 46 + nameLength), {
      method: buf.readUInt16LE(offset + 10),
      size: buf.readUInt32LE(offset + 20),
      local: buf.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zipText(buf: Buffer, entries: ReturnType<typeof zipEntries>, name: string): string {
  const entry = entries.get(name);
  if (!entry) throw new Error(`${name} ausente no taco.xlsx`);
  const start = entry.local + 30 + buf.readUInt16LE(entry.local + 26) + buf.readUInt16LE(entry.local + 28);
  const data = buf.subarray(start, start + entry.size);
  return (entry.method === 8 ? inflateRawSync(data) : data).toString("utf8");
}

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Linhas da aba principal como { coluna: texto }. */
export function sheetRows(buf: Buffer): Record<string, string>[] {
  const entries = zipEntries(buf);
  const strings = [...zipText(buf, entries, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheet = zipText(buf, entries, "xl/worksheets/sheet1.xml");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: Record<string, string> = {};
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[3] ?? "");
      if (!value) continue;
      cells[cell[1]] = / t="s"/.test(cell[2]) ? strings[Number(value[1])] : value[1];
    }
    return cells;
  });
}

// ---------- Regras ----------

/**
 * Arredonda a três casas como o round() do Python fazia nos dados importados: sobre o valor binário exato
 * (toFixed(20) traz os dígitos dele), com empate para o par. Math.round(n * 1000) erra casos como
 * 86,1485 (o produto já sai arredondado para cima).
 */
export function round3(n: number): number {
  const [whole, fraction] = Math.abs(n).toFixed(20).split(".");
  const rest = fraction.slice(3);
  const half = "5".padEnd(rest.length, "0");
  let scaled = BigInt(whole + fraction.slice(0, 3));
  if (rest > half || (rest === half && scaled % 2n === 1n)) scaled += 1n;
  const digits = scaled.toString().padStart(4, "0");
  const value = Number(`${digits.slice(0, -3)}.${digits.slice(-3)}`);
  return n < 0 ? -value : value;
}

type Reading = { value: Value; note?: keyof typeof NOTES } | { exclude: string };

function readMacro(raw: string | undefined, macro: Macro, code: string): Reading {
  const text = (raw ?? "").trim();
  if (text.toLowerCase() === "tr") return { value: { n: 0, isWhole: true }, note: "trace" };
  if (text === "NA") return { value: { n: 0, isWhole: true }, note: "notApplicable" };
  if (text === "*") return { exclude: "Valores em análise (*) na TACO: sem números para usar." };
  if (text === "") {
    if (macro !== "calories" && ALCOHOL_ONLY.has(code)) return { value: { n: 0, isWhole: true }, note: "alcohol" };
    return { exclude: "Valor ausente na TACO." };
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return { exclude: `Valor não numérico na TACO ("${text}").` };
  if (number < 0) {
    if (macro === "carbs" && number >= CARB_RESIDUE) return { value: { n: 0, isWhole: true }, note: "residue" };
    return { exclude: "Valor negativo na TACO." };
  }
  return { value: { n: round3(number), isWhole: false } };
}

/** Alimentos e excluídos, na ordem da planilha. */
export function importTaco(rows: Record<string, string>[]): { foods: TacoFood[]; excluded: Excluded[] } {
  const foods: TacoFood[] = [];
  const excluded: Excluded[] = [];
  for (const cells of rows) {
    const code = cells.A ?? "";
    if (!/^\d+$/.test(code)) continue;
    const name = NAME_FIXES[code] ?? cells.B ?? "";
    const category = categoryForCode(Number(code));
    if (!category) throw new Error(`alimento ${code} fora das faixas de categoria conhecidas`);
    const values = {} as Record<Macro, Value>;
    const notes = new Set<keyof typeof NOTES>();
    let reason: string | null = null;
    for (const macro of Object.keys(COLUMNS) as Macro[]) {
      const reading = readMacro(cells[COLUMNS[macro]], macro, code);
      if ("exclude" in reading) {
        reason = reading.exclude;
        break;
      }
      values[macro] = reading.value;
      if (reading.note) notes.add(reading.note);
    }
    if (reason) {
      excluded.push({ code, name, reason });
      continue;
    }
    const note = [...notes].map((key) => NOTES[key]).join(" ");
    foods.push({
      id: `taco-${code}`,
      name,
      category,
      caloriesPer100g: values.calories,
      proteinPer100g: values.protein,
      carbsPer100g: values.carbs,
      fatPer100g: values.fat,
      source: `TACO, 4ª edição, NEPA/UNICAMP (2011), alimento ${code}`,
      sourceUrl: SOURCE,
      ...(note ? { note } : {}),
    });
  }
  if (new Set(foods.map((f) => f.id)).size !== foods.length) throw new Error("códigos repetidos na planilha");
  return { foods, excluded };
}

// ---------- Saída no formato do arquivo versionado ----------

const formatValue = ({ n, isWhole }: Value) => (isWhole ? String(n) : Number.isInteger(n) ? `${n}.0` : String(n));

export function foodsJson(foods: TacoFood[]): string {
  const blocks = foods.map((food) => {
    const lines = Object.entries(food).map(([key, value]) =>
      typeof value === "object" ? `    "${key}": ${formatValue(value)}` : `    "${key}": ${JSON.stringify(value)}`,
    );
    return `  {\n${lines.join(",\n")}\n  }`;
  });
  return `[\n${blocks.join(",\n")}\n]\n`;
}

/** O catálogo como o app lê (números simples). */
export const plainFoods = (foods: TacoFood[]) =>
  foods.map((food) => JSON.parse(JSON.stringify(food, (_key, value) => (value && typeof value === "object" && "isWhole" in value ? value.n : value))));

function main() {
  const isCheck = process.argv.includes("--check");
  const buf = readFileSync(XLSX);
  const { foods, excluded } = importTaco(sheetRows(buf));
  const metadata = {
    sourceUrl: SOURCE,
    edition: "4ª edição, 2011",
    sha256: createHash("sha256").update(buf).digest("hex"),
    importedFoods: foods.length,
    excluded,
    rules:
      "Composição por 100 g. Valores arredondados a três casas decimais. Tr (traços) e NA (não se aplica) considerados zero, com nota no alimento; carboidrato por diferença levemente negativo (até −0,1 g) considerado zero; destilado sem macronutrientes na tabela entra com eles em zero. Valores em análise (*) ou ausentes não são convertidos: o alimento fica de fora.",
  };
  const foodsText = foodsJson(foods);
  const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
  if (isCheck) {
    const current = readFileSync(FOODS, "utf8");
    console.log(`${foods.length} alimentos, ${excluded.length} excluídos; foods.json ${current === foodsText ? "igual" : "diferente"} do gerado`);
    return;
  }
  writeFileSync(FOODS, foodsText, "utf8");
  writeFileSync(METADATA, metadataText, "utf8");
  console.log(`importados ${foods.length} alimentos; ${excluded.length} fora (${excluded.map((e) => e.code).join(", ")})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
