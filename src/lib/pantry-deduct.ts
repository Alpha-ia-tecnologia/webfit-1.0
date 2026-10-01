import type { AppState, PantryItem, RecipeCard } from "../types";
import { plural } from "./format";
import { availablePantry } from "./pantry";
import { canDecreaseQuantity, fmtPantryQuantity, stepPantryQuantity } from "./pantry-view";
import { visiblePlainText } from "./text";

/**
 * "Descontar da despensa" (AGENTE-11): depois do modo preparo, a pessoa diz o que sobrou de cada
 * item da casa usado na receita. A sugestão sai de uma leitura segura da quantidade da receita na
 * mesma família de unidade; o que não dá para ler fica "Não mexer". Nada muda sem confirmação.
 */

type Unit = PantryItem["unit"];
export interface Amount {
  value: number;
  unit: Unit;
}
export type DeductChoice = "keep" | "left" | "gone";
export interface DeductRow {
  itemId: string;
  name: string;
  unit: Unit;
  /** Quantidade na despensa; null = não informada. */
  current: number | null;
  /** Quantidade da receita, como veio ("2 unidades", "1 xícara"). */
  used: string | null;
  choice: DeductChoice;
  /** O que fica quando "Sobrou"; "Não mexer" = current. */
  remaining: number | null;
}

/** Limite de quantidade do esquema da despensa. */
const MAX_QUANTITY = 100000;
/** Limite de itens da despensa (savePantryDrafts). */
const MAX_PANTRY_ITEMS = 500;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
const UNIT_WORDS: readonly [RegExp, Unit][] = [
  [/^(g|gr|grama|gramas)$/, "g"],
  [/^(kg|quilo|quilos|kilo|kilos)$/, "kg"],
  [/^(ml|mililitro|mililitros)$/, "ml"],
  [/^(l|litro|litros)$/, "l"],
  [/^(un|und|unid|unidade|unidades)$/, "un"],
  [/^(pacote|pacotes|pct)$/, "pacote"],
];
/** Número (inteiro, decimal, fração, "½", "1 ½", "1 1/2") e, opcionalmente, uma palavra de unidade. */
const AMOUNT_RE =
  /^(\d+(?:[.,]\d+)?(?:\s*[½¼¾]|\s+\d+\/\d+)?|\d+\/\d+|[½¼¾])\s*([a-z]*)\.?$/;
const CONVERSIONS: Partial<Record<`${Unit}>${Unit}`, number>> = {
  "g>kg": 0.001,
  "kg>g": 1000,
  "ml>l": 0.001,
  "l>ml": 1000,
};

function parseNumber(text: string): number | null {
  const mixed = /^(\d+)\s*([½¼¾])$/.exec(text);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]!]!;
  const mixedFraction = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixedFraction) {
    const denominator = Number(mixedFraction[3]);
    return denominator ? Number(mixedFraction[1]) + Number(mixedFraction[2]) / denominator : null;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  if (text in FRACTIONS) return FRACTIONS[text]!;
  // "1.500" é milhar em pt-BR; "1.5" e "1,5" são decimais.
  const plain = /^\d+\.\d{3}$/.test(text) ? text.replace(".", "") : text.replace(",", ".");
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

/**
 * "200 g", "200g", "1,5 kg", "1/2 kg", "½ kg", "500 ml", "1 l|litro(s)|L", "2 unidades|un|unidade",
 * "2", "1 pacote(s)"; número seguido de outra palavra ("1 xícara", "3 refeições na semana"),
 * "a gosto", vazio, null → null.
 */
export function parseAmount(text: string | null | undefined): Amount | null {
  const clean = text?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  const match = AMOUNT_RE.exec(clean);
  if (!match) return null;
  const value = parseNumber(match[1]!.trim());
  if (value === null || !(value > 0)) return null;
  const word = match[2] ?? "";
  const unit = word ? UNIT_WORDS.find(([re]) => re.test(word))?.[1] : "un";
  return unit ? { value: round3(value), unit } : null;
}

/** g↔kg, ml↔l, mesma unidade; outras combinações → null. Arredonda a 3 casas. */
export function convertAmount(amount: Amount, to: Unit): number | null {
  if (amount.unit === to) return round3(amount.value);
  const factor = CONVERSIONS[`${amount.unit}>${to}`];
  return factor === undefined ? null : round3(amount.value * factor);
}

/** A linha muda a despensa: "Acabou", ou "Sobrou" com um restante válido e diferente do atual. */
function changes(row: DeductRow): boolean {
  if (row.choice === "gone") return true;
  return (
    row.choice === "left" &&
    row.remaining !== null &&
    row.remaining > 0 &&
    row.remaining <= MAX_QUANTITY &&
    row.remaining !== row.current
  );
}

/**
 * Um por item da casa da receita ainda disponível (availablePantry), na ordem da receita.
 * Quantidade conhecida e uso conversível: restante = current − uso; ≤ 0 → "gone"; senão "left".
 * Resto → "keep" (remaining = current).
 */
export function deductRows(
  card: RecipeCard,
  pantry: readonly PantryItem[],
  today: string,
): DeductRow[] {
  const byId = new Map(availablePantry(pantry, today).map((item) => [item.id, item]));
  return card.ingredientesCasa.flatMap<DeductRow>((ingredient) => {
    const item = byId.get(ingredient.pantryItemId);
    if (!item) return [];
    const base = {
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      current: item.quantity,
      used: ingredient.quantidade,
    };
    const amount = parseAmount(ingredient.quantidade);
    const used = amount ? convertAmount(amount, item.unit) : null;
    if (item.quantity === null || used === null)
      return [{ ...base, choice: "keep", remaining: item.quantity }];
    const remaining = round3(item.quantity - used);
    return [
      remaining > 0
        ? { ...base, choice: "left", remaining }
        : { ...base, choice: "gone", remaining: null },
    ];
  });
}

/** Opções do seletor: com quantidade desconhecida não há "Sobrou". */
export function deductChoices(row: Pick<DeductRow, "current">): DeductChoice[] {
  return row.current === null ? ["keep", "gone"] : ["keep", "left", "gone"];
}

/** Troca a escolha; "left" sem restante válido volta para a quantidade atual. */
export function setDeductChoice(row: DeductRow, choice: DeductChoice): DeductRow {
  const needsValue = choice === "left" && (row.remaining === null || row.remaining <= 0);
  return { ...row, choice, remaining: needsValue ? row.current : row.remaining };
}

/** "−"/"+" do restante (PANTRY_QTY_STEP da unidade); nunca chega a 0 nem passa do limite. */
export function stepDeductRow(row: DeductRow, direction: 1 | -1): DeductRow {
  return { ...row, remaining: stepPantryQuantity(row.remaining, row.unit, direction) };
}

/** O "−" do restante está disponível (sem chegar a 0). */
export const canDecreaseRow = (row: Pick<DeductRow, "remaining" | "unit">): boolean =>
  canDecreaseQuantity(row.remaining, row.unit);

/**
 * "Na despensa: 3 unidades · a receita usa 2 unidades". A quantidade da receita vem do modelo:
 * passa pela máscara de calorias quando a pessoa as oculta.
 */
export function deductDetail(row: Pick<DeductRow, "current" | "unit" | "used">, hide: boolean): string {
  const stock =
    row.current === null ? "quantidade não informada" : fmtPantryQuantity(row.current, row.unit);
  const used = row.used ? ` · a receita usa ${visiblePlainText(row.used, hide)}` : "";
  return `Na despensa: ${stock}${used}`;
}

/**
 * keep: nada; gone: remove; left: quantity = remaining (> 0, ≤ 100000), updatedAt = now.
 * `before` = versões anteriores só dos itens que mudaram (para o Desfazer). Um "Sobrou" sem
 * restante válido não muda o item.
 */
export function applyDeduction(
  state: AppState,
  rows: readonly DeductRow[],
  now: string,
): { state: AppState; before: PantryItem[] } {
  const byId = new Map(rows.filter(changes).map((row) => [row.itemId, row]));
  const before = state.pantry.filter((item) => byId.has(item.id));
  if (!before.length) return { state, before };
  const pantry = state.pantry.flatMap((item) => {
    const row = byId.get(item.id);
    if (!row) return [item];
    return row.choice === "gone" ? [] : [{ ...item, quantity: row.remaining, updatedAt: now }];
  });
  return { state: { ...state, pantry }, before };
}

/** Repõe exatamente os itens de `before` (substitui pelo id ou devolve), sem tocar nos demais. */
export function undoDeduction(state: AppState, before: readonly PantryItem[]): AppState {
  if (!before.length) return state;
  const byId = new Map(before.map((item) => [item.id, item]));
  const present = new Set(state.pantry.map((item) => item.id));
  const pantry = [
    ...state.pantry.map((item) => byId.get(item.id) ?? item),
    ...before.filter((item) => !present.has(item.id)),
  ];
  if (pantry.length > MAX_PANTRY_ITEMS)
    throw new Error("Limite de 500 itens. Remova itens antigos antes de adicionar novos.");
  return { ...state, pantry };
}

/** "Nada muda na despensa." | "1 item será atualizado." | "2 itens serão atualizados." */
export function deductSummary(rows: readonly DeductRow[]): string {
  const n = rows.filter(changes).length;
  if (!n) return "Nada muda na despensa.";
  return `${plural(n, "item", "itens")} ${n === 1 ? "será atualizado" : "serão atualizados"}.`;
}
