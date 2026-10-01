/**
 * "Qualidade do dia" (DIARIO-12): variedade pelos grupos do Guia Alimentar para a População
 * Brasileira, com cereais e raízes/tubérculos num grupo só. Lê apenas tipo, data e o id/categoria
 * dos alimentos das refeições: nunca calorias, então vale igual com "Ocultar calorias". Sem
 * vermelho, sem comemoração e sem sequência de dias; óleos, açúcares, bebidas e temperos não entram.
 */
import type { DiaryEntry, FoodItem } from "../types";
import {
  foodCategoryOf,
  type FoodIconName,
  type FoodTone,
} from "./food-categories";

export type FoodGroupKey =
  | "cereais"
  | "feijoes"
  | "verduras"
  | "frutas"
  | "castanhas"
  | "leite"
  | "carnes";

export interface FoodGroup {
  key: FoodGroupKey;
  label: string;
  short: string;
  icon: FoodIconName;
  tone: FoodTone;
}

/** Ordem canônica do anel, da legenda e da fala. */
export const FOOD_GROUPS: readonly FoodGroup[] = [
  {
    key: "cereais",
    label: "Cereais, raízes e tubérculos",
    short: "Cereais e tubérculos",
    icon: "Wheat",
    tone: "attention",
  },
  {
    key: "feijoes",
    label: "Feijões e outras leguminosas",
    short: "Feijões",
    icon: "Bean",
    tone: "body",
  },
  {
    key: "verduras",
    label: "Legumes e verduras",
    short: "Legumes e verduras",
    icon: "LeafyGreen",
    tone: "food",
  },
  {
    key: "frutas",
    label: "Frutas",
    short: "Frutas",
    icon: "Apple",
    tone: "mind",
  },
  {
    key: "castanhas",
    label: "Castanhas e sementes",
    short: "Castanhas",
    icon: "Nut",
    tone: "body",
  },
  {
    key: "leite",
    label: "Leite e queijos",
    short: "Leite e queijos",
    icon: "Milk",
    tone: "water",
  },
  {
    key: "carnes",
    label: "Carnes, peixes e ovos",
    short: "Carnes e ovos",
    icon: "Beef",
    tone: "mind",
  },
];
export const FOOD_GROUP_TOTAL = 7;

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const tacoIds = (ids: readonly number[]) => ids.map((n) => `taco-${n}`);

/** Batatas, mandioca, cará, inhame, farinhas e féculas, polvilho, pão de queijo e nhoque: a TACO os põe em Verduras. */
const ROOT_IDS: ReadonlySet<string> = new Set(
  tacoIds([
    ...range(86, 94),
    99,
    102,
    103,
    ...range(121, 124),
    126,
    ...range(129, 132),
    136,
    140,
    141,
    146,
  ]),
);
/** Amendoim, paçoca e pé-de-moleque: a TACO os põe em Leguminosas. */
const NUT_IDS: ReadonlySet<string> = new Set(tacoIds([557, 558, 579, 580]));

/** Pratos prontos da TACO ("Alimentos preparados"), cada um com os grupos que contém. */
export const PREPARED_GROUPS: Readonly<
  Record<string, readonly FoodGroupKey[]>
> = {
  "taco-525": ["feijoes"],
  "taco-526": ["cereais", "carnes"],
  "taco-527": ["cereais", "feijoes"],
  "taco-528": ["carnes"],
  "taco-529": ["carnes"],
  "taco-530": ["cereais"],
  "taco-531": ["carnes"],
  "taco-532": ["verduras", "carnes"],
  "taco-533": ["cereais"],
  "taco-534": ["cereais"],
  "taco-535": ["verduras"],
  "taco-536": ["carnes"],
  "taco-537": ["carnes"],
  "taco-538": ["carnes"],
  "taco-539": ["feijoes", "cereais", "carnes"],
  "taco-540": ["feijoes", "carnes"],
  "taco-541": ["carnes"],
  "taco-542": ["cereais", "carnes"],
  "taco-543": ["verduras", "carnes"],
  "taco-544": ["verduras"],
  "taco-545": ["verduras"],
  "taco-546": ["verduras"],
  "taco-547": ["carnes", "verduras"],
  "taco-548": ["carnes"],
  "taco-549": ["cereais", "verduras"],
  "taco-550": ["cereais", "carnes"],
  "taco-551": ["cereais"],
  "taco-552": [],
  "taco-553": ["carnes", "cereais"],
  "taco-554": ["carnes", "cereais"],
  "taco-555": ["feijoes", "carnes", "cereais"],
  "taco-556": ["cereais", "verduras", "carnes"],
};

/** Chave de categoria (food-categories) → grupo; null = não conta (e nunca diminui nada). */
export const CATEGORY_GROUP: Readonly<Record<string, FoodGroupKey | null>> = {
  cereais: "cereais",
  leguminosas: "feijoes",
  verduras: "verduras",
  frutas: "frutas",
  nozes: "castanhas",
  leite: "leite",
  carnes: "carnes",
  pescados: "carnes",
  ovos: "carnes",
  gorduras: null,
  bebidas: null,
  doces: null,
  diversos: null,
  industrializados: null,
  preparados: null,
  meus: null,
  outros: null,
};

const inGroupOrder = (keys: ReadonlySet<FoodGroupKey>): FoodGroupKey[] =>
  FOOD_GROUPS.map((g) => g.key).filter((key) => keys.has(key));

/** Grupos de um alimento, na ordem de FOOD_GROUPS: exceções por id, pratos prontos, depois a categoria. */
export function foodGroupsOf(
  food: Pick<FoodItem, "id" | "category">,
): FoodGroupKey[] {
  if (ROOT_IDS.has(food.id)) return ["cereais"];
  if (NUT_IDS.has(food.id)) return ["castanhas"];
  const prepared = PREPARED_GROUPS[food.id];
  if (prepared) return inGroupOrder(new Set(prepared));
  const group = CATEGORY_GROUP[foodCategoryOf(food).key];
  return group ? [group] : [];
}

const mealsOn = (diary: readonly DiaryEntry[], date: string) =>
  diary.filter(
    (e) =>
      e.type === "refeicao" && e.date === date && (e.items?.length ?? 0) > 0,
  );

function groupsOfMeals(meals: readonly DiaryEntry[]): FoodGroupKey[] {
  const present = new Set(
    meals.flatMap((e) => (e.items ?? []).flatMap((i) => foodGroupsOf(i.food))),
  );
  return inGroupOrder(present);
}

export interface DayVariety {
  present: FoodGroupKey[];
  count: number;
  total: 7;
  /** Refeições do dia com alimentos (o cartão só aparece com pelo menos uma). */
  mealCount: number;
  speech: string;
}

/** Grupos presentes nas refeições registradas no dia. */
export function dayVariety(
  diary: readonly DiaryEntry[],
  date: string,
): DayVariety {
  const meals = mealsOn(diary, date);
  const present = groupsOfMeals(meals);
  return {
    present,
    count: present.length,
    total: FOOD_GROUP_TOTAL,
    mealCount: meals.length,
    speech: varietySpeech(present),
  };
}

const LABEL = new Map(FOOD_GROUPS.map((g) => [g.key, g.label]));

/** Nome acessível do anel: "Variedade do dia: 3 de 7 grupos de alimentos: …". */
export function varietySpeech(present: readonly FoodGroupKey[]): string {
  if (!present.length)
    return "Variedade do dia: nenhum grupo de alimentos registrado.";
  const labels = present.map((key) => LABEL.get(key) ?? key);
  return `Variedade do dia: ${present.length} de ${FOOD_GROUP_TOTAL} grupos de alimentos: ${labels.join("; ")}.`;
}

/**
 * Relatório: em quantos dias do período (de `from` a `to`, inclusive) cada grupo apareceu nas
 * refeições. Os 7 grupos na ordem canônica, inclusive os com 0 dia.
 */
export function groupDays(
  diary: readonly DiaryEntry[],
  from: string,
  to: string,
): { key: FoodGroupKey; days: number }[] {
  const dates = [
    ...new Set(
      diary
        .filter((e) => e.type === "refeicao" && e.date >= from && e.date <= to)
        .map((e) => e.date),
    ),
  ];
  const perDay = dates.map(
    (date) => new Set(groupsOfMeals(mealsOn(diary, date))),
  );
  return FOOD_GROUPS.map(({ key }) => ({
    key,
    days: perDay.filter((groups) => groups.has(key)).length,
  }));
}

export const VARIETY_COPY = {
  title: "Qualidade do dia",
  info: "Como contamos a variedade",
  infoTitle: "Como contamos",
  infoText:
    "Contamos os grupos do Guia Alimentar para a População Brasileira presentes nos alimentos registrados neste dia. Óleos, açúcares, bebidas e temperos não entram na conta. Alimentos cadastrados por você entram quando a categoria é conhecida.",
  caption: "Grupos presentes nas refeições registradas neste dia.",
  legend: "Grupos de alimentos do dia",
  absent: " (sem registro neste dia)",
} as const;
