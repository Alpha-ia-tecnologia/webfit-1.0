import type { FoodItem } from "../types";
import { normalize } from "./food-search";
import { fmtNumber } from "./format";

/**
 * Medidas caseiras (colher, concha, unidade…) para registrar sem balança, compartilhadas
 * pelo web e pelo app. São valores médios arredondados de tabelas brasileiras de medidas
 * caseiras: aproximados de propósito. A porção salva continua em gramas e a pessoa pode
 * corrigi-la a qualquer momento. Alimentos crus ou sem medida conhecida ficam em gramas.
 */

export type MeasureId =
  | "colher-sopa"
  | "colher-cha"
  | "escumadeira"
  | "concha"
  | "copo"
  | "xicara"
  | "unidade"
  | "fatia"
  | "pote"
  | "file"
  | "bife"
  | "folha";
export interface HouseholdMeasure {
  id: MeasureId;
  singular: string;
  plural: string;
  /** Rótulo do botão de unidade: "Col. de sopa". */
  label: string;
  /** Forma curta para a bandeja; terminada em "." não varia no plural ("4 col."). */
  short: string;
  /** Gramas de uma medida. */
  grams: number;
  /** Passo do − / +: 1 para medidas pequenas, ½ para as grandes. */
  step: number;
}
export type PortionUnit = MeasureId | "g";
export interface Portion {
  unit: PortionUnit;
  qty: number;
  grams: number;
}

/** Passo do − / + quando a porção está em gramas. */
export const GRAMS_STEP = 10;
export const DEFAULT_GRAMS = 100;
const MAX_INFERRED_QTY = 40;
const INFER_TOLERANCE = 0.03;
const EPSILON = 1e-9;

const UNITS: Record<MeasureId, Omit<HouseholdMeasure, "id" | "grams">> = {
  "colher-sopa": { singular: "colher de sopa", plural: "colheres de sopa", label: "Col. de sopa", short: "col.", step: 1 },
  "colher-cha": { singular: "colher de chá", plural: "colheres de chá", label: "Col. de chá", short: "col. chá", step: 1 },
  escumadeira: { singular: "escumadeira", plural: "escumadeiras", label: "Escumadeira", short: "esc.", step: 0.5 },
  concha: { singular: "concha", plural: "conchas", label: "Concha", short: "concha", step: 0.5 },
  copo: { singular: "copo", plural: "copos", label: "Copo", short: "copo", step: 0.5 },
  xicara: { singular: "xícara", plural: "xícaras", label: "Xícara", short: "xíc.", step: 0.5 },
  unidade: { singular: "unidade", plural: "unidades", label: "Unidade", short: "un.", step: 0.5 },
  fatia: { singular: "fatia", plural: "fatias", label: "Fatia", short: "fatia", step: 0.5 },
  pote: { singular: "pote", plural: "potes", label: "Pote", short: "pote", step: 0.5 },
  file: { singular: "filé", plural: "filés", label: "Filé", short: "filé", step: 0.5 },
  bife: { singular: "bife", plural: "bifes", label: "Bife", short: "bife", step: 0.5 },
  folha: { singular: "folha", plural: "folhas", label: "Folha", short: "folha", step: 1 },
};

interface Rule {
  match: (name: string, category: string) => boolean;
  measures: [MeasureId, number][];
  /** Quantidade sugerida ao adicionar (padrão: 1 medida). */
  typical?: number;
}
const named =
  (pattern: RegExp) =>
  (name: string): boolean =>
    pattern.test(name);
const inCategory =
  (category: string, pattern: RegExp) =>
  (name: string, foodCategory: string): boolean =>
    foodCategory === category && pattern.test(name);

/** A primeira regra que combina vale; a primeira medida é a sugerida. */
const RULES: Rule[] = [
  { match: named(/^arroz(, (integral|tipo \d), cozido| carreteiro)/), measures: [["colher-sopa", 25], ["escumadeira", 90]], typical: 4 },
  { match: named(/^(feijao|lentilha|grao-de-bico), .*cozid/), measures: [["concha", 100], ["colher-sopa", 20]] },
  { match: named(/^feijoada$/), measures: [["concha", 150], ["colher-sopa", 25]] },
  // Tropeiro e farofa são secos: vão de colher (farofa: 15 g por colher cheia, IBGE POF 2008–2009).
  { match: named(/^feijao tropeiro/), measures: [["colher-sopa", 20], ["escumadeira", 80]], typical: 4 },
  { match: named(/^mandioca, farofa/), measures: [["colher-sopa", 15]], typical: 3 },
  { match: named(/^(cuscuz|polenta)/), measures: [["colher-sopa", 25]], typical: 3 },
  { match: named(/^pao, trigo, frances/), measures: [["unidade", 50]] },
  { match: named(/^pao, de queijo, (assado|cru)/), measures: [["unidade", 20]], typical: 3 },
  { match: named(/^pao, (trigo, forma|aveia, forma|gluten, forma|milho, forma|de soja|trigo, sovado)/), measures: [["fatia", 25]], typical: 2 },
  { match: named(/^bolo, pronto/), measures: [["fatia", 60]] },
  { match: named(/^biscoito, salgado, cream cracker/), measures: [["unidade", 6]], typical: 4 },
  { match: named(/^biscoito, doce, maisena/), measures: [["unidade", 5]], typical: 4 },
  { match: named(/^biscoito, doce, (wafer|recheado)/), measures: [["unidade", 10]], typical: 3 },
  { match: named(/^ovo, de galinha, inteiro/), measures: [["unidade", 50]] },
  { match: named(/^ovo, de galinha, clara/), measures: [["unidade", 30]] },
  { match: named(/^ovo, de galinha, gema/), measures: [["unidade", 18]] },
  { match: named(/^ovo, de codorna/), measures: [["unidade", 10]], typical: 3 },
  { match: named(/^queijo, requeijao/), measures: [["colher-sopa", 30]] },
  { match: named(/^queijo, petit suisse/), measures: [["pote", 45]] },
  { match: named(/^queijo, parmesao/), measures: [["colher-sopa", 10]] },
  { match: named(/^queijo/), measures: [["fatia", 20]], typical: 2 },
  { match: named(/^iogurte/), measures: [["pote", 170]] },
  { match: named(/^leite, fermentado/), measures: [["pote", 80]] },
  { match: named(/^leite, condensado/), measures: [["colher-sopa", 20]] },
  { match: named(/^leite, de coco/), measures: [["colher-sopa", 15]] },
  { match: named(/^leite, .*\bpo\b/), measures: [["colher-sopa", 16]], typical: 2 },
  { match: named(/^leite/), measures: [["copo", 200]] },
  { match: named(/^cafe, infusao/), measures: [["xicara", 50]] },
  { match: named(/^cha, /), measures: [["xicara", 150]] },
  // Suco de limão puro é tempero: vai de colher.
  { match: named(/^limao, .*suco/), measures: [["colher-sopa", 15]] },
  { match: named(/suco(?! concentrado)|refrigerante|cerveja|extrato soluvel.*fluido/), measures: [["copo", 200]] },
  { match: named(/^carne, bovina, acem, moido, cozido/), measures: [["colher-sopa", 25]], typical: 4 },
  { match: named(/^carne, bovina, almondegas, fritas/), measures: [["unidade", 30]], typical: 3 },
  {
    match: named(/^carne, bovina, (contra-file|capa de contra-file|file mingnon|patinho|miolo de alcatra|picanha|maminha|fraldinha|coxao (duro|mole)|figado).*(grelhad|frit|milanesa|cozid)/),
    measures: [["bife", 100]],
  },
  { match: named(/^frango, (peito|file), .*(grelhad|assad|cozid|milanesa)/), measures: [["file", 100]] },
  { match: named(/^salsicha/), measures: [["unidade", 50]] },
  { match: named(/^(presunto|mortadela|apresuntado|salame)/), measures: [["fatia", 15]], typical: 2 },
  { match: named(/^atum, conserva/), measures: [["colher-sopa", 20]], typical: 2 },
  { match: inCategory("Pescados e frutos do mar", /file.*(grelhad|assad|frit|cozid)|^salmao, .*grelhad/), measures: [["file", 100]] },
  { match: named(/^(manteiga|margarina)/), measures: [["colher-cha", 5]] },
  { match: named(/^acucar/), measures: [["colher-cha", 5], ["colher-sopa", 12]] },
  { match: named(/^(mel, de abelha|melado)/), measures: [["colher-sopa", 20]] },
  { match: named(/^(aveia|farinha|milho, (fuba|amido)|granola|farelo|linhaca|gergelim|chia|achocolatado|soja, farinha)/), measures: [["colher-sopa", 15]], typical: 2 },
  { match: named(/^(amendoim|castanha-de-caju)/), measures: [["colher-sopa", 15]] },
  { match: named(/^castanha-do-brasil/), measures: [["unidade", 4]], typical: 3 },
  { match: named(/^banana, (da terra|pacova), crua/), measures: [["unidade", 180]] },
  { match: named(/^banana, ouro, crua/), measures: [["unidade", 40]] },
  { match: named(/^banana, .*crua/), measures: [["unidade", 70]] },
  { match: named(/^maca, .*crua/), measures: [["unidade", 130]] },
  { match: named(/^laranja, .*crua/), measures: [["unidade", 180]] },
  { match: named(/^(tangerina|mexerica), .*crua/), measures: [["unidade", 135]] },
  { match: named(/^pera, .*crua/), measures: [["unidade", 130]] },
  { match: named(/^kiwi/), measures: [["unidade", 75]] },
  { match: named(/^mamao, papaia/), measures: [["unidade", 300]], typical: 0.5 },
  { match: named(/^mamao/), measures: [["fatia", 150]] },
  { match: named(/^melancia/), measures: [["fatia", 200]] },
  { match: named(/^melao/), measures: [["fatia", 90]] },
  { match: named(/^abacaxi, cru/), measures: [["fatia", 75]] },
  { match: named(/^morango/), measures: [["unidade", 12]], typical: 5 },
  { match: named(/^abacate/), measures: [["colher-sopa", 30]], typical: 2 },
  { match: named(/^alface/), measures: [["folha", 10]], typical: 3 },
  { match: named(/^tomate, com semente, cru/), measures: [["fatia", 15]], typical: 3 },
  { match: named(/^(batata, (inglesa|doce|baroa)|mandioca), cozid/), measures: [["colher-sopa", 30]], typical: 3 },
  { match: inCategory("Verduras, hortaliças e derivados", /(cozid|refogad)/), measures: [["colher-sopa", 25]], typical: 3 },
  // Temperos frescos: um dente de alho, uma colher de ervas picadas.
  { match: named(/^alho, cru$/), measures: [["colher-cha", 5], ["colher-sopa", 10]] },
  { match: named(/^(salsa|cebolinha|manjericao|alfavaca|coentro|hortela), crua?$/), measures: [["colher-sopa", 4]] },
  // Só os crus que se servem picados ou ralados às colheradas; folhas e tubérculos crus ficam em gramas.
  {
    match: named(/^(cenoura|beterraba|repolho|pepino|cebola|pimentao|rabanete|nabo)(, [^,]+)*, crua?$/),
    measures: [["colher-sopa", 15]],
    typical: 3,
  },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

function ruleFor(food: Pick<FoodItem, "name" | "category">): Rule | undefined {
  const name = normalize(food.name);
  return RULES.find((rule) => rule.match(name, food.category));
}

/** Medidas caseiras do alimento, da sugerida às demais; vazio quando só faz sentido em gramas. */
export function measuresFor(food: Pick<FoodItem, "name" | "category">): HouseholdMeasure[] {
  return (ruleFor(food)?.measures ?? []).map(([id, grams]) => ({ id, grams, ...UNITS[id] }));
}

export function measureById(
  food: Pick<FoodItem, "name" | "category">,
  unit: PortionUnit,
): HouseholdMeasure | null {
  return measuresFor(food).find((m) => m.id === unit) ?? null;
}

export const gramsFor = (qty: number, measure: HouseholdMeasure): number => round1(qty * measure.grams);
/**
 * Quantidade exata da medida para uma porção em gramas (sem arredondar: o − / + anda a partir
 * do valor real e fmtQty arredonda só para mostrar); sem medida, a própria gramagem.
 */
export const qtyFor = (grams: number, measure: HouseholdMeasure | null): number =>
  measure ? grams / measure.grams : grams;
/** Abaixo disso a medida aparece como "< 0,1" em vez de "0". */
const MIN_SHOWN_QTY = 0.1;

/** Porção sugerida ao adicionar: a medida típica do alimento ou 100 g. */
export function defaultPortion(food: Pick<FoodItem, "name" | "category">): Portion {
  const rule = ruleFor(food);
  const [first] = measuresFor(food);
  if (!rule || !first) return { unit: "g", qty: DEFAULT_GRAMS, grams: DEFAULT_GRAMS };
  const qty = rule.typical ?? 1;
  return { unit: first.id, qty, grams: gramsFor(qty, first) };
}

/** Unidade para mostrar uma porção já salva: a medida em que ela cabe em passos inteiros, ou gramas. */
export function inferUnit(food: Pick<FoodItem, "name" | "category">, grams: number): PortionUnit {
  const fits = measuresFor(food).find((m) => {
    const steps = grams / m.grams / m.step;
    return (
      steps >= 1 - EPSILON &&
      grams / m.grams <= MAX_INFERRED_QTY &&
      Math.abs(steps - Math.round(steps)) < INFER_TOLERANCE
    );
  });
  return fits?.id ?? "g";
}

/**
 * Gramas digitadas: "12,5" ou "12.5" → 12.5; "1.000" ou "1.250,5" (milhar com ponto) →
 * 1000 e 1250.5; vazio → 0; texto que não é número ou é negativo → null (não muda a porção).
 */
export function parseGrams(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** "4", "½", "1½", "1,7"; uma fração ínfima de medida aparece como "< 0,1", nunca "0". */
export function fmtQty(qty: number): string {
  if (qty > 0 && qty < MIN_SHOWN_QTY - EPSILON) return "< 0,1";
  const whole = Math.floor(qty + EPSILON);
  const fraction = qty - whole;
  if (Math.abs(fraction) < EPSILON) return fmtNumber(whole);
  if (Math.abs(fraction - 0.5) < EPSILON) return whole ? `${fmtNumber(whole)}½` : "½";
  return fmtNumber(qty, 1);
}

/** Singular de 0 a 2 (exclusive), como em "1½ colher"; zero e 2 ou mais no plural. */
export const unitWord = (qty: number, measure: HouseholdMeasure): string =>
  qty > 0 && qty < 2 ? measure.singular : measure.plural;

/** "4 colheres de sopa", "½ escumadeira", "125,5 g" (sem medida). */
export function describePortion(qty: number, measure: HouseholdMeasure | null): string {
  if (!measure) return `${fmtNumber(qty, 1)} g`;
  return `${fmtQty(qty)} ${unitWord(qty, measure)}`;
}

/** Acima deste tamanho a porção não cabe numa linha do alimento junto de "≈ 100 g" (conceito 02). */
const ROW_PORTION_MAX = 16;

/**
 * Porção na linha do alimento: a descrição inteira ("1 colher de sopa", "3 escumadeiras"); quando ela
 * passa de 16 letras e a medida tem rótulo abreviado, o rótulo ("4 col. de sopa").
 */
export function rowPortion(qty: number, measure: HouseholdMeasure | null): string {
  const full = describePortion(qty, measure);
  if (!measure || full.length <= ROW_PORTION_MAX || !measure.label.includes(".")) return full;
  return `${fmtQty(qty)} ${measure.label.toLowerCase()}`;
}

/** Forma curta para a bandeja: "4 col.", "1 concha", "90 g". */
export function shortPortion(qty: number, measure: HouseholdMeasure | null): string {
  if (measure?.short.endsWith(".")) return `${fmtQty(qty)} ${measure.short}`;
  return describePortion(qty, measure);
}

/** Desenho da medida (colher, escumadeira, concha…) no botão da medida, na linha e na bandeja. */
export type MeasureIconKey =
  | "spoon"
  | "teaspoon"
  | "skimmer"
  | "ladle"
  | "cup"
  | "glass"
  | "unit"
  | "slice"
  | "pot"
  | "leaf"
  | "piece"
  | "scale";

const MEASURE_ICONS: Record<MeasureId, MeasureIconKey> = {
  "colher-sopa": "spoon",
  "colher-cha": "teaspoon",
  escumadeira: "skimmer",
  concha: "ladle",
  copo: "glass",
  xicara: "cup",
  unidade: "unit",
  fatia: "slice",
  pote: "pot",
  file: "piece",
  bife: "piece",
  folha: "leaf",
};

/** Ícone da unidade da porção; gramas (e qualquer unidade desconhecida) usam a balança. */
export function measureIconKey(unit: PortionUnit): MeasureIconKey {
  return unit === "g" ? "scale" : (MEASURE_ICONS[unit] ?? "scale");
}

/**
 * Próxima quantidade no − / +: anda pelo passo e encaixa valores quebrados (1,7 → 2 ou 1,5).
 * Diminuir nunca passa de um passo para baixo nem aumenta uma porção menor que o passo.
 */
export function stepQty(qty: number, direction: 1 | -1, step: number): number {
  const units = qty / step;
  const next =
    direction > 0
      ? (Math.floor(units + EPSILON) + 1) * step
      : (Math.ceil(units - EPSILON) - 1) * step;
  if (direction < 0 && next < step - EPSILON) return Math.min(qty, step);
  return round1(next);
}
