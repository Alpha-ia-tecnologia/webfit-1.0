import foodsJson from "../data/foods.json";
import type { FoodItem, MealItem } from "../types";
import type { PlannedItem } from "./agent-blocks";
import { allergenIn, allergenTokens } from "./allergens";
import { macroShare } from "./diary-day";
import { mealTotals } from "./domain";
import { foodCategoryOf } from "./food-categories";
import { friendlyName, isTacoFood, normalize, searchFoods } from "./food-search";
import {
  defaultPortion,
  gramsFor,
  inferUnit,
  measureById,
  type PortionUnit,
} from "./household-measures";
import {
  quantityMatchesText,
  quantityStated,
  type MealText,
  type MealTextItem,
} from "./meal-text";
import { addMealItem, MAX_ITEM_GRAMS } from "./meals";
import type { PhotoItem, PlatePhoto } from "./plate-photo";

/**
 * Ligação conservadora entre nomes sugeridos pelo agente e a Tabela TACO. Na dúvida não há
 * correspondência: melhor pedir a busca do que registrar o alimento errado. Todo número de
 * nutrição da tela sai daqui (TACO), nunca do modelo.
 */

export const TACO_FOODS: readonly FoodItem[] = (foodsJson as FoodItem[]).filter(isTacoFood);
/** Parte mínima dos itens com correspondência para mostrar a estimativa de macros. */
export const TACO_COVERAGE = 0.7;
const CANDIDATES_PER_TERM = 3;
const DEFAULT_CANDIDATES = 3;

const CONNECTORS = new Set(["de", "do", "da", "dos", "das", "com", "e"]);
/** Formas que mudam o alimento (leite em pó, atum em conserva): só valem se a busca as pediu. */
const FORM_WORDS = new Set([
  "po",
  "condensado",
  "achocolatado",
  "desidratado",
  "desidratada",
  "instantaneo",
  "conserva",
  "calda",
  "enlatado",
  "enlatada",
  "frito",
  "frita",
  "fritos",
  "fritas",
  "empanado",
  "empanada",
  "recheado",
  "xarope",
]);
/** "com <palavra>" que descreve o próprio alimento, não um ingrediente acrescentado. */
const INTRINSIC = new Set(["sal", "casca", "pele", "semente", "sementes", "gordura"]);

const wordsOf = (text: string) => normalize(text).match(/[a-z0-9]+/g) ?? [];
const same = (a: string, b: string) => a === b || a.replace(/s$/, "") === b.replace(/s$/, "");

/**
 * O nome da TACO descreve o que a pessoa pediu? Três regras: o nome principal (antes da
 * primeira vírgula) está na busca; nenhuma forma (pó, conserva, frito…) que a busca não pediu;
 * nenhum ingrediente acrescentado ("com manteiga") que a busca não citou.
 */
export function isFaithfulMatch(query: string, tacoName: string): boolean {
  const asked = wordsOf(query);
  const has = (word: string) => asked.some((q) => same(q, word));
  const head = wordsOf(tacoName.split(",")[0] ?? "").filter((w) => !CONNECTORS.has(w));
  if (!head.every(has)) return false;
  const words = wordsOf(tacoName);
  if (words.some((w) => FORM_WORDS.has(w) && !has(w))) return false;
  return words.every((w, i) => {
    if (w !== "com") return true;
    const added = words[i + 1];
    return !added || INTRINSIC.has(added) || has(added);
  });
}

const cache = new Map<string, FoodItem | null>();

/** Alimento da TACO para um nome simples ("arroz branco cozido"), ou null quando não é fiel. */
export function matchTaco(name: string, foods: readonly FoodItem[] = TACO_FOODS): FoodItem | null {
  const cacheable = foods === TACO_FOODS;
  const key = normalize(name.trim());
  if (cacheable && cache.has(key)) return cache.get(key) ?? null;
  const { groups, partial } = searchFoods(foods, name, { limit: 1 });
  const top = groups[0]?.selected;
  const food = !top || partial || !isFaithfulMatch(name, top.name) ? null : top;
  if (cacheable) cache.set(key, food);
  return food;
}

/** Até `limit` alimentos distintos: os 3 primeiros fiéis de cada termo, sem busca parcial. */
export function tacoCandidates(
  terms: readonly string[],
  foods: readonly FoodItem[] = TACO_FOODS,
  limit = DEFAULT_CANDIDATES,
): FoodItem[] {
  const found = terms.flatMap((term) => {
    const { groups, partial } = searchFoods(foods, term, { limit: CANDIDATES_PER_TERM });
    return partial
      ? []
      : groups.map((g) => g.selected).filter((food) => isFaithfulMatch(term, food.name));
  });
  const unique = found.filter((food, i) => found.findIndex((f) => f.id === food.id) === i);
  return unique.slice(0, limit);
}

export type PlannedStatus = "ok" | "missing" | "allergen";
export interface ResolvedItem {
  item: PlannedItem;
  food: FoodItem | null;
  status: PlannedStatus;
}

/** Cada item sugerido com o alimento da TACO e o estado: ok, sem correspondência ou alergênico. */
export function resolvePlanned(
  items: readonly PlannedItem[],
  opts: { allergyDetails: string; foods?: readonly FoodItem[] },
): ResolvedItem[] {
  const tokens = allergenTokens(opts.allergyDetails);
  return items.map((item) => {
    const food = matchTaco(item.alimento, opts.foods);
    const text = `${item.alimento} ${food?.name ?? ""} ${food ? friendlyName(food.name).label : ""}`;
    const status: PlannedStatus = allergenIn(text, tokens, "food")
      ? "allergen"
      : food
        ? "ok"
        : "missing";
    return { item, food, status };
  });
}

export interface MacroEstimate {
  share: { protein: number; carbs: number; fat: number } | null;
  /** Parte dos itens com alimento da TACO e gramas sugeridas (0 a 1). */
  coverage: number;
  /** Gramas inteiras de proteína, carboidratos e gorduras dos itens com TACO (null abaixo da cobertura). */
  grams: { protein: number; carbs: number; fat: number } | null;
  /** kcal da TACO dos itens com correspondência (null abaixo da cobertura). */
  kcal: number | null;
  /** Proteína em gramas inteiras (null abaixo da cobertura); igual a grams.protein. */
  protein: number | null;
  /** Algum item ficou de fora (cobertura < 1): a tela escreve "≈" antes dos números. */
  isPartial: boolean;
}

type Matched = ResolvedItem & { food: FoodItem; item: PlannedItem & { gramas: number } };
const isMatched = (r: ResolvedItem): r is Matched =>
  r.status === "ok" && r.food !== null && r.item.gramas !== null;

/**
 * Proporção de energia de proteínas, carboidratos e gorduras, kcal e gramas, só com cobertura
 * suficiente. Números só da TACO e das gramas sugeridas no plano: nunca do texto do modelo.
 */
export function macroEstimate(resolved: readonly ResolvedItem[]): MacroEstimate {
  const matched = resolved.filter(isMatched);
  const coverage = resolved.length ? matched.length / resolved.length : 0;
  const isPartial = coverage < 1;
  if (coverage < TACO_COVERAGE)
    return { share: null, coverage, grams: null, kcal: null, protein: null, isPartial };
  const items = matched.map((r) => ({
    food: r.food,
    grams: Math.min(r.item.gramas, MAX_ITEM_GRAMS),
  }));
  const totals = mealTotals(items);
  const grams = {
    protein: Math.round(totals.macros.protein),
    carbs: Math.round(totals.macros.carbs),
    fat: Math.round(totals.macros.fat),
  };
  return {
    share: macroShare(totals.macros),
    coverage,
    grams,
    kcal: totals.calories,
    protein: grams.protein,
    isPartial,
  };
}

const list = (names: readonly string[]) => names.join(", ");

/** Prato pré-preenchido para "Conferir e registrar": só itens ok, com nota do que ficou de fora. */
export function plannedPreset(
  category: string,
  resolved: readonly ResolvedItem[],
): { category: string; items: MealItem[]; note: string } {
  const items = resolved
    .filter((r): r is ResolvedItem & { food: FoodItem } => r.status === "ok" && r.food !== null)
    .reduce<MealItem[]>((plate, r) => {
      const grams = Math.min(r.item.gramas ?? defaultPortion(r.food).grams, MAX_ITEM_GRAMS);
      return addMealItem(plate, r.food, grams);
    }, []);
  const missing = resolved.filter((r) => r.status === "missing").map((r) => r.item.alimento);
  const allergens = resolved.filter((r) => r.status === "allergen").map((r) => r.item.alimento);
  const note = [
    items.length
      ? "Itens sugeridos no prato. Confira as porções e toque em Salvar refeição."
      : "Nenhum item sugerido foi encontrado na TACO. Busque os alimentos abaixo.",
    items.length && missing.length ? ` Não encontrados na TACO: ${list(missing)}. Busque abaixo.` : "",
    allergens.length
      ? ` Fora do prato por coincidir com alergia declarada: ${list(allergens)}.`
      : "",
  ].join("");
  return { category, items, note };
}

export type PlateGroup = "vegetais" | "proteinas" | "cereais";
export const PLATE_GROUP_LABEL: Record<PlateGroup, string> = {
  vegetais: "verduras e frutas",
  proteinas: "proteínas",
  cereais: "cereais e pães",
};
const PLATE_ORDER: readonly PlateGroup[] = ["vegetais", "proteinas", "cereais"];
const GROUP_OF_CATEGORY: Record<string, PlateGroup> = {
  verduras: "vegetais",
  frutas: "vegetais",
  carnes: "proteinas",
  pescados: "proteinas",
  ovos: "proteinas",
  leguminosas: "proteinas",
  leite: "proteinas",
  cereais: "cereais",
};

/** Grupos do prato (perfil sensível: prato em vez de números), na ordem fixa e sem repetir. */
export function plateGroups(resolved: readonly ResolvedItem[]): PlateGroup[] {
  const present = new Set(
    resolved.flatMap((r) =>
      r.status === "ok" && r.food ? [GROUP_OF_CATEGORY[foodCategoryOf(r.food).key]] : [],
    ),
  );
  return PLATE_ORDER.filter((group) => present.has(group));
}

/** "Prato com verduras e frutas, proteínas e cereais e pães". */
export function plateLabel(groups: readonly PlateGroup[]): string {
  const names = groups.map((g) => PLATE_GROUP_LABEL[g]);
  if (!names.length) return "Prato";
  const joined =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `Prato com ${joined}`;
}

export interface LinkedPhotoItem {
  item: PhotoItem;
  candidates: FoodItem[];
  allergy: boolean;
  defaultChecked: boolean;
}

/** Alérgeno do item: marcado pelo modelo ou achado no nome, nos termos e nos candidatos da TACO. */
function itemAllergy(
  item: Pick<PhotoItem, "name" | "searchTerms" | "allergyMatch">,
  candidates: readonly FoodItem[],
  tokens: readonly string[],
): boolean {
  const text = [item.name, ...item.searchTerms, ...candidates.map((c) => c.name)].join(" ");
  return item.allergyMatch || !!allergenIn(text, tokens, "food");
}

/** Itens da foto com os alimentos da TACO para escolher; marcados só quando é seguro. */
export function linkPhotoItems(
  draft: PlatePhoto,
  allergyDetails: string,
  foods: readonly FoodItem[] = TACO_FOODS,
): LinkedPhotoItem[] {
  const tokens = allergenTokens(allergyDetails);
  return draft.items.map((item) => {
    const candidates = tacoCandidates(item.searchTerms, foods);
    const allergy = itemAllergy(item, candidates, tokens);
    return {
      item,
      candidates,
      allergy,
      defaultChecked: candidates.length > 0 && !allergy && item.confidence !== "low",
    };
  });
}

/** Porção dita e mapeada para a medida caseira do alimento (DIARIO-07). */
export interface StatedPortion {
  grams: number;
  unit: PortionUnit;
}

/**
 * Porção dita → gramas pelas medidas caseiras da TACO. ml conta como g (densidade 1, aproximado; a
 * tela mostra "≈"). Medida que o alimento não tem ("unidade" de paçoca, "fatia" de frango) → null.
 */
export function statedPortion(
  food: FoodItem,
  item: Pick<MealTextItem, "quantity" | "unit">,
): StatedPortion | null {
  const { quantity, unit } = item;
  if (quantity === null || unit === null) return null;
  if (unit === "g") return { grams: Math.min(quantity, MAX_ITEM_GRAMS), unit: "g" };
  if (unit === "ml") {
    const grams = Math.min(quantity, MAX_ITEM_GRAMS);
    return { grams, unit: inferUnit(food, grams) };
  }
  const measure = measureById(food, unit);
  return measure ? { grams: gramsFor(quantity, measure), unit } : null;
}

export interface LinkedMealTextItem {
  item: MealTextItem;
  candidates: FoodItem[];
  allergy: boolean;
  /** quantityText verificado na descrição; null quando não foi dito (ou o modelo parafraseou). */
  statedText: string | null;
  defaultChecked: boolean;
}

/**
 * Trecho dito que vale para a tela: está na descrição e, quando o modelo deu quantidade e unidade,
 * elas são as do trecho ("2 fatias" nunca vira 900 g). Senão null: "Falta porção".
 */
function verifiedStatedText(item: MealTextItem, source: string): string | null {
  if (!item.quantityText || !quantityStated(item, source)) return null;
  const hasAmount = item.quantity !== null && item.unit !== null;
  return !hasAmount || quantityMatchesText(item) ? item.quantityText : null;
}

/**
 * Itens da descrição com os alimentos da TACO para escolher. Alérgeno não some (a pessoa já comeu):
 * aparece com o aviso e desmarcado. A quantidade só vale quando o trecho está na descrição e o
 * número e a unidade do modelo são os do trecho.
 */
export function linkMealTextItems(
  draft: MealText,
  source: string,
  allergyDetails: string,
  foods: readonly FoodItem[] = TACO_FOODS,
): LinkedMealTextItem[] {
  const tokens = allergenTokens(allergyDetails);
  return draft.items.map((item) => {
    const candidates = tacoCandidates(item.searchTerms, foods);
    const allergy = itemAllergy(item, candidates, tokens);
    return {
      item,
      candidates,
      allergy,
      statedText: verifiedStatedText(item, source),
      defaultChecked: candidates.length > 0 && !allergy,
    };
  });
}

/** Porção de um candidato escolhido: dita e mapeável, ou null (vai com defaultPortion e "Falta porção"). */
export function mealTextPortion(entry: LinkedMealTextItem, food: FoodItem): StatedPortion | null {
  return entry.statedText ? statedPortion(food, entry.item) : null;
}
