import type { AppState, KitchenBasicKey, PantryDraft, PantryItem } from "../types";
import { allergenTokens } from "./allergens";
import { shiftDate } from "./dates";
import { SLOT_LABEL, type DietPlanV2 } from "./diet-plan";
import { isAllergenFood, planForDay, PLAN_WEEK_DAYS } from "./diet-week";
import { uid } from "./domain";
import { foodCategoryOf } from "./food-categories";
import { normalize } from "./food-search";
import { plural } from "./format";
import { kitchenBasic } from "./kitchen-basics";
import { availablePantry, recipeStatus, savePantryDrafts } from "./pantry";
import { parseAmount } from "./pantry-deduct";
import {
  SHOPPING_LIMITS,
  SHOPPING_SECTIONS,
  shoppingItemSchema,
  type ShoppingItem,
  type ShoppingSection,
} from "./shopping-schema";
import { matchTaco } from "./taco-match";
import { visiblePlainText } from "./text";

/**
 * Lista de compras (AGENTE-08): sugestões do plano da semana (com a rotação das trocas revisadas)
 * e do "Falta comprar" das receitas atuais, checklist no aparelho e guarda na despensa só depois
 * da revisão. Sem totais em gramas nem preços: quantidades são contagens locais ou o texto da
 * receita. Funções puras, compartilhadas por web e app.
 */

export type ShoppingPick = Pick<ShoppingItem, "name" | "quantity" | "section" | "origin" | "note">;
export interface ShoppingSuggestion {
  /** shoppingKey(name): junta dieta e receita e compara com a lista e a despensa. */
  key: string;
  name: string;
  quantity: string | null;
  section: ShoppingSection;
  origin: "dieta" | "receita";
  note: string;
  inPantry: boolean;
  defaultChecked: boolean;
}
export interface ShoppingGroup {
  section: ShoppingSection;
  label: string;
  items: ShoppingItem[];
}

export const SECTION_LABEL: Record<ShoppingSection, string> = {
  hortifruti: "Hortifrúti",
  acougue: "Carnes, peixes e ovos",
  laticinios: "Frios e laticínios",
  padaria: "Padaria",
  mercearia: "Mercearia",
  bebidas: "Bebidas",
  outros: "Outros",
};
export const SECTION_LOCATION: Record<ShoppingSection, PantryItem["location"]> = {
  hortifruti: "geladeira",
  acougue: "geladeira",
  laticinios: "geladeira",
  padaria: "despensa",
  mercearia: "despensa",
  bebidas: "despensa",
  outros: "despensa",
};
export const SHOPPING_COPY = {
  title: "Lista de compras",
  build: "Montar lista de compras",
  sheet: "Montar lista de compras",
  entryText: "Monte a lista com o plano dos próximos 7 dias e as receitas.",
  inPantry: "Já tem na despensa",
  add: (n: number) => `Adicionar ${plural(n, "item", "itens")}`,
  added: (n: number) => `${plural(n, "item", "itens")} na lista de compras.`,
  none: "Nada novo para comprar: o plano e as receitas já estão na despensa ou na lista.",
  empty: "Sua lista está vazia.",
  summaryEmpty: "Lista vazia",
  share: "Compartilhar",
  shareLabel: "Compartilhar lista de compras",
  copied: "Lista copiada.",
  shareFail: "Não foi possível compartilhar a lista neste navegador.",
  store: "Guardar comprados na despensa",
  stored: "Comprados guardados na despensa.",
  removed: (name: string) => `${name} removido da lista.`,
  removedChecked: (n: number) =>
    `${plural(n, "comprado removido", "comprados removidos")} da lista.`,
  manualLabel: "Adicionar item à lista",
  manualAdd: "Adicionar",
  manualEmpty: "Escreva o nome do item.",
  limit: "Limite de 200 itens na lista de compras. Remova os comprados antes de adicionar.",
  quantityWeek: (n: number) => `${plural(n, "refeição", "refeições")} na semana`,
} as const;

/** Rascunhos por vez na revisão da despensa (mesmo teto do reconhecimento por foto). */
export const STORE_MAX = 60;
const NOTE_SEPARATOR = " · ";
const L = SHOPPING_LIMITS;

/** Palavras de preparo que não vão para a lista ("arroz branco cozido" → "Arroz branco"). */
const PREP_WORD =
  /^(?:(?:cozid|grelhad|assad|refogad|frit|caseir|picad|ralad)[oa]s?|crua?s?)$/;
const BAKERY = /\b(?:pao|paes|torradas?|bisnaguinhas?|bolos?|broas?)\b/;
const CATEGORY_SECTION: Readonly<Record<string, ShoppingSection>> = {
  verduras: "hortifruti",
  frutas: "hortifruti",
  carnes: "acougue",
  pescados: "acougue",
  ovos: "acougue",
  leite: "laticinios",
  bebidas: "bebidas",
  leguminosas: "mercearia",
  nozes: "mercearia",
  gorduras: "mercearia",
  doces: "mercearia",
  diversos: "mercearia",
  industrializados: "mercearia",
  preparados: "mercearia",
};
/** Sem TACO: palavras do nome (sem acento), nesta ordem ("café com leite" → laticínios). */
const KEYWORDS: readonly [ShoppingSection, RegExp][] = [
  [
    "laticinios",
    /\b(?:leites?|queijos?|iogurtes?|requeijao|manteiga|nata|coalhada|ricota|mussarela|mucarela|presunto|peito de peru|mortadela|salame|kefir)\b/,
  ],
  [
    "acougue",
    /\b(?:carnes?|frangos?|peixes?|ovos?|files?|patinho|alcatra|acem|musculo|costela|linguicas?|bacon|atum|sardinhas?|salmao|tilapia|camaroes|camarao|bifes?|hamburguer)\b/,
  ],
  ["padaria", BAKERY],
  [
    "hortifruti",
    /\b(?:alfaces?|tomates?|cebolas?|alhos?|batatas?|cenouras?|bananas?|macas?|laranjas?|limoes|limao|aboboras?|abobrinhas?|brocolis|couves?|espinafre|rucula|pepinos?|pimentoes|pimentao|beterrabas?|mandioca|macaxeira|aipim|inhame|chuchu|mamao|melancia|melao|uvas?|morangos?|abacates?|mangas?|abacaxi|kiwi|peras?|goiabas?|maracuja|salsinha|cebolinha|cheiro verde|coentro|hortela|manjericao|gengibre|legumes|verduras|frutas?|repolho|vagem|quiabo|berinjela|jilo)\b/,
  ],
  ["bebidas", /\b(?:aguas?|sucos?|refrigerantes?|chas?|kombucha|isotonicos?|cervejas?|vinhos?)\b/],
  [
    "mercearia",
    /\b(?:arroz|feijao|feijoes|lentilhas?|grao de bico|macarrao|massas?|farinhas?|aveia|acucar|sal|azeites?|oleos?|cafe|biscoitos?|bolachas?|granola|milho|ervilhas?|extrato|molhos?|temperos?|vinagre|fuba|tapioca|cuscuz|quinoa|chia|linhaca|castanhas?|amendoim|nozes|mel|geleia|achocolatado)\b/,
  ],
];

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const sectionRank = (section: ShoppingSection) => SHOPPING_SECTIONS.indexOf(section);
const addedAt = (item: ShoppingItem) => Date.parse(item.addedAt);
const byAdded = (a: ShoppingItem, b: ShoppingItem) => addedAt(a) - addedAt(b);
const capitalize = (text: string) => `${text.charAt(0).toLocaleUpperCase("pt-BR")}${text.slice(1)}`;
/** Mesma chave, ou uma é o começo da outra ("arroz" e "arroz branco"). */
const sameProduct = (a: string, b: string) =>
  a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);

/** Junta notas sem repetir, até o limite do esquema (80), sem cortar uma parte ao meio. */
function joinNotes(parts: readonly string[]): string {
  const unique = [...new Set(parts.flatMap((p) => p.split(NOTE_SEPARATOR)).filter(Boolean))];
  return unique.reduce((note, part) => {
    const next = note ? `${note}${NOTE_SEPARATOR}${part}` : part;
    return next.length <= L.note ? next : note;
  }, "");
}
const clipText = (text: string, max: number) => Array.from(text).slice(0, max).join("").trim();

/**
 * Sem palavras de preparo (cozido/a/os/as, grelhado/a/os/as, assado/a, cru/a/s, refogado/a,
 * frito/a, caseiro/a, picado/a, ralado/a), 1ª letra maiúscula; se nada sobrar, o nome original
 * aparado. "ovo cozido" → "Ovo".
 */
export function shoppingName(food: string): string {
  const original = food.trim().replace(/\s+/g, " ");
  const kept = original.split(" ").filter((word) => !PREP_WORD.test(normalize(word)));
  return capitalize(kept.join(" ") || original);
}

/**
 * normalize(shoppingName(name)) com espaços simples ("Feijão  Carioca cozido" → "feijao carioca").
 * A chave usa sempre o nome com as calorias mascaradas: "Cebola 40 kcal" da despensa, da receita
 * ou da lista (guardado mascarado ou não) é o mesmo produto, com ou sem calorias ocultas.
 */
export function shoppingKey(name: string): string {
  return normalize(shoppingName(visiblePlainText(name, true))).replace(/[\s-]+/g, " ").trim();
}

/**
 * Seção do mercado: pela categoria da TACO (cereais: padaria para pães e bolos, senão mercearia);
 * sem TACO, por palavras do nome (laticínios, açougue, padaria, hortifrúti, bebidas, mercearia);
 * senão "outros".
 */
export function sectionOf(name: string): ShoppingSection {
  const food = matchTaco(name);
  if (food) {
    const key = foodCategoryOf(food).key;
    if (key === "cereais")
      return BAKERY.test(`${normalize(name)} ${normalize(food.name)}`) ? "padaria" : "mercearia";
    const section = CATEGORY_SECTION[key];
    if (section) return section;
  }
  const text = normalize(name);
  return KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "outros";
}

/** Básico de cozinha marcado (pelo rótulo ou pela chave): não entra na lista. */
function isMarkedBasic(key: string, basics: readonly KitchenBasicKey[]): boolean {
  return basics.some(
    (basic) => key === shoppingKey(kitchenBasic(basic).label) || key === basic.replace(/_/g, " "),
  );
}

function pantryKeys(pantry: readonly PantryItem[], today: string): string[] {
  return availablePantry(pantry, today).map((item) => shoppingKey(item.name));
}

function sortSuggestions(list: readonly ShoppingSuggestion[]): ShoppingSuggestion[] {
  return [...list].sort(
    (a, b) => sectionRank(a.section) - sectionRank(b.section) || byName(a.name, b.name),
  );
}

interface Tally {
  name: string;
  /** Nome como no plano (melhor para achar a seção pela TACO). */
  source: string;
  meals: number;
  slots: number[];
}

/**
 * 7 dias a partir de `from` com planForDay; conta refeições por shoppingKey; quantity
 * "N refeição(ões) na semana"; note = rótulos dos slots na ordem do plano, " · ", máx. 80; sem
 * alergênico, sem básico marcado; inPantry = item disponível com chave igual, ou uma chave prefixo
 * da outra + " "; defaultChecked = !inPantry. Ordem: SHOPPING_SECTIONS, depois nome pt-BR.
 * `plan` já é a visão mascarada/sanitizada.
 */
export function dietShoppingSuggestions(
  plan: DietPlanV2,
  ctx: {
    anchor: string;
    from: string;
    allergyDetails: string;
    pantry: readonly PantryItem[];
    basics: readonly KitchenBasicKey[];
    today: string;
  },
): ShoppingSuggestion[] {
  const tokens = allergenTokens(ctx.allergyDetails);
  const tallies = new Map<string, Tally>();
  for (let day = 0; day < PLAN_WEEK_DAYS; day += 1) {
    const { plan: dayPlan } = planForDay(plan, {
      anchor: ctx.anchor,
      date: shiftDate(ctx.from, day),
      allergyDetails: ctx.allergyDetails,
    });
    dayPlan.refeicoes.forEach((meal, index) => {
      const counted = new Set<string>();
      for (const item of meal.itens) {
        const key = shoppingKey(item.alimento);
        if (!key || counted.has(key)) continue;
        if (isAllergenFood(item.alimento, tokens) || isMarkedBasic(key, ctx.basics)) continue;
        counted.add(key);
        const tally = tallies.get(key);
        tallies.set(
          key,
          tally
            ? {
                ...tally,
                meals: tally.meals + 1,
                slots: tally.slots.includes(index) ? tally.slots : [...tally.slots, index],
              }
            : { name: shoppingName(item.alimento), source: item.alimento, meals: 1, slots: [index] },
        );
      }
    });
  }
  const stock = pantryKeys(ctx.pantry, ctx.today);
  return sortSuggestions(
    [...tallies].map(([key, tally]) => {
      const inPantry = stock.some((have) => sameProduct(have, key));
      const labels = [...tally.slots]
        .sort((a, b) => a - b)
        .map((index) => SLOT_LABEL[plan.refeicoes[index]!.slot]);
      return {
        key,
        name: tally.name,
        quantity: SHOPPING_COPY.quantityWeek(tally.meals),
        section: sectionOf(tally.source),
        origin: "dieta" as const,
        note: joinNotes(labels),
        inPantry,
        defaultChecked: !inPantry,
      };
    }),
  );
}

/**
 * Receitas: só a geração mais recente com recipeSet e recipeStatus "current"; faltaComprar de cada
 * receita; note "Receita: {nome}" (máx. 80); nomes e quantidades mascarados quando hide; sem
 * alergênico declarado nem básico marcado.
 */
export function recipeShoppingSuggestions(
  state: AppState,
  today: string,
  hide: boolean,
): ShoppingSuggestion[] {
  const current = [...state.recipes]
    .reverse()
    .find((recipe) => recipe.recipeSet && recipeStatus(recipe, state) === "current");
  if (!current?.recipeSet) return [];
  const tokens = allergenTokens(state.profile?.allergyDetails ?? "");
  const stock = pantryKeys(state.pantry, today);
  const suggestions = current.recipeSet.receitas.flatMap((card) =>
    card.faltaComprar.flatMap((missing): ShoppingSuggestion[] => {
      const shown = visiblePlainText(missing.nome, hide);
      const key = shoppingKey(missing.nome);
      if (!key || isAllergenFood(missing.nome, tokens) || isMarkedBasic(key, state.kitchenBasics))
        return [];
      const inPantry = stock.some((have) => sameProduct(have, key));
      return [
        {
          key,
          name: shoppingName(shown),
          quantity: missing.quantidade
            ? clipText(visiblePlainText(missing.quantidade, hide), L.quantity)
            : null,
          section: sectionOf(missing.nome),
          origin: "receita",
          note: clipText(`Receita: ${visiblePlainText(card.nome, hide)}`, L.note),
          inPantry,
          defaultChecked: !inPantry,
        },
      ];
    }),
  );
  return mergeSuggestions([], [suggestions]);
}

function combine(a: ShoppingSuggestion, b: ShoppingSuggestion): ShoppingSuggestion {
  const fromRecipe = a.origin === "receita" || b.origin === "receita";
  const quantity =
    a.origin === "receita"
      ? (a.quantity ?? b.quantity)
      : b.origin === "receita"
        ? (b.quantity ?? a.quantity)
        : a.quantity;
  const inPantry = a.inPantry || b.inPantry;
  return {
    ...a,
    quantity,
    origin: fromRecipe ? "receita" : "dieta",
    note: joinNotes([a.note, b.note]),
    inPantry,
    defaultChecked: !inPantry,
  };
}

/** Junta por key (dieta+receita → quantidade da receita, notes com " · ", origin "receita"); tira o que já está na lista. */
export function mergeSuggestions(
  list: readonly ShoppingItem[],
  groups: readonly (readonly ShoppingSuggestion[])[],
): ShoppingSuggestion[] {
  const listed = new Set(list.map((item) => shoppingKey(item.name)));
  const merged = new Map<string, ShoppingSuggestion>();
  for (const suggestion of groups.flat()) {
    if (listed.has(suggestion.key)) continue;
    const previous = merged.get(suggestion.key);
    merged.set(suggestion.key, previous ? combine(previous, suggestion) : suggestion);
  }
  return sortSuggestions([...merged.values()]);
}

/** Item digitado pela pessoa: nome aparado (erro se vazio), seção pelo nome, sem quantidade. */
export function manualShoppingItem(name: string): ShoppingPick {
  const clean = clipText(name.replace(/\s+/g, " "), L.name);
  if (!clean) throw new Error(SHOPPING_COPY.manualEmpty);
  return { name: clean, quantity: null, section: sectionOf(clean), origin: "manual", note: "" };
}

/**
 * Acrescenta os itens escolhidos, validados pelo esquema; passar de 200 → erro (estado intacto).
 * addedAt = now + i ms: a ordem de inclusão fica estável, inclusive no Desfazer.
 */
export function addShoppingItems(
  state: AppState,
  picks: readonly ShoppingPick[],
  now: string,
  makeId: () => string = uid,
): AppState {
  if (state.shoppingList.length + picks.length > L.items) throw new Error(SHOPPING_COPY.limit);
  const base = Date.parse(now);
  const items = picks.map((pick, i) =>
    shoppingItemSchema.parse({
      id: makeId(),
      name: clipText(pick.name, L.name),
      quantity: pick.quantity === null ? null : clipText(pick.quantity, L.quantity),
      section: pick.section,
      origin: pick.origin,
      note: clipText(pick.note, L.note),
      checked: false,
      addedAt: new Date(base + i).toISOString(),
    }),
  );
  return { ...state, shoppingList: [...state.shoppingList, ...items] };
}

/** Marca ou desmarca como comprado; id desconhecido não muda nada. */
export function toggleShoppingItem(state: AppState, id: string): AppState {
  if (!state.shoppingList.some((item) => item.id === id)) return state;
  return {
    ...state,
    shoppingList: state.shoppingList.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    ),
  };
}

export function removeShoppingItems(state: AppState, ids: readonly string[]): AppState {
  const remove = new Set(ids);
  return { ...state, shoppingList: state.shoppingList.filter((item) => !remove.has(item.id)) };
}

/** Desfazer: repõe os que faltam (pelo id), na ordem de inclusão (addedAt). */
export function restoreShoppingItems(state: AppState, items: readonly ShoppingItem[]): AppState {
  const present = new Set(state.shoppingList.map((item) => item.id));
  const missing = items.filter((item) => !present.has(item.id));
  if (!missing.length) return state;
  const shoppingList = [...state.shoppingList, ...missing].sort(byAdded);
  if (shoppingList.length > L.items) throw new Error(SHOPPING_COPY.limit);
  return { ...state, shoppingList };
}

/** Seções não vazias na ordem do mercado; pendentes por addedAt, depois os marcados. */
export function shoppingGroups(list: readonly ShoppingItem[]): ShoppingGroup[] {
  return SHOPPING_SECTIONS.flatMap((section) => {
    const items = list.filter((item) => item.section === section);
    if (!items.length) return [];
    return [
      {
        section,
        label: SECTION_LABEL[section],
        items: [
          ...items.filter((item) => !item.checked).sort(byAdded),
          ...items.filter((item) => item.checked).sort(byAdded),
        ],
      },
    ];
  });
}

/** "1 de 8 comprados"; lista vazia → "Lista vazia". */
export function shoppingSummary(list: readonly ShoppingItem[]): {
  total: number;
  checked: number;
  text: string;
} {
  const total = list.length;
  const checked = list.filter((item) => item.checked).length;
  const text = total
    ? `${checked} de ${plural(total, "comprado", "comprados")}`
    : SHOPPING_COPY.summaryEmpty;
  return { total, checked, text };
}

/** Texto para compartilhar: só os pendentes, por seção, com calorias mascaradas; null sem pendentes. */
export function shoppingShareText(list: readonly ShoppingItem[], hide: boolean): string | null {
  const pending = list.filter((item) => !item.checked);
  if (!pending.length) return null;
  const sections = shoppingGroups(pending).map((group) =>
    [
      group.label,
      ...group.items.map((item) => {
        const name = visiblePlainText(item.name, hide);
        const quantity = item.quantity ? ` (${visiblePlainText(item.quantity, hide)})` : "";
        return `- ${name}${quantity}`;
      }),
    ].join("\n"),
  );
  return `${SHOPPING_COPY.title}\n\n${sections.join("\n\n")}`;
}

/**
 * Marcados (máx. 60, ordem da lista) → rascunhos da despensa: quantidade/unidade por parseAmount
 * (senão null/"un"), local pela seção, sem validade e sem observações; e os ids.
 */
export function storeCheckedDrafts(list: readonly ShoppingItem[]): {
  drafts: PantryDraft[];
  ids: string[];
} {
  const checked = list.filter((item) => item.checked).slice(0, STORE_MAX);
  const drafts = checked.map((item): PantryDraft => {
    const amount = parseAmount(item.quantity);
    const valid = amount !== null && amount.value <= 100000;
    return {
      name: item.name,
      quantity: valid ? amount.value : null,
      unit: valid ? amount.unit : "un",
      location: SECTION_LOCATION[item.section],
      expiresOn: null,
      notes: "",
    };
  });
  return { drafts, ids: checked.map((item) => item.id) };
}

/** savePantryDrafts(state, drafts, "shopping_list") e tira `ids` da lista, numa só troca de estado. */
export function storeShoppingPurchase(
  state: AppState,
  drafts: PantryDraft[],
  ids: readonly string[],
): AppState {
  const saved = savePantryDrafts(state, drafts, "shopping_list");
  return removeShoppingItems(saved, ids);
}
