import {
  diarySchema,
  savedMealSchema,
  type AppState,
  type DiaryEntry,
  type FoodItem,
  type MealItem,
  type SatietyKey,
  type SavedMeal,
} from "../types";
import { mealTotals, shiftDate } from "./domain";
import { fmtNumber, fmtRelDate } from "./format";
import { friendlyName } from "./food-search";

export const MAX_SAVED_MEALS = 100;
export const RECENT_MEAL_LIMIT = 5;
export const MEAL_CATEGORIES = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"];
/** Limite de uma porção, igual ao do esquema do diário. */
export const MAX_ITEM_GRAMS = 5000;
export const FREQUENT_WINDOW_DAYS = 90;
const FREQUENT_LIMIT = 8;
/** Distância, em minutos, de um horário de refeição informado que ainda conta como ela. */
export const MEAL_WINDOW_MINUTES = 90;
const round1 = (n: number) => Math.round(n * 10) / 10;
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

type MealSource = { categoryTag?: string; items?: MealItem[] };

/** Copia somente alimentos e porções; o diário e os favoritos permanecem independentes. */
export function cloneMealItems(items: readonly MealItem[]): MealItem[] {
  return items.map((item) => ({ food: { ...item.food }, grams: item.grams }));
}

/** Data, horário, identidade e foto nunca são reaproveitados no novo registro. */
export function mealDraftFrom(source: MealSource) {
  return {
    categoryTag: source.categoryTag || "Almoço",
    items: cloneMealItems(source.items ?? []),
  };
}

function mealSignature(meal: MealSource): string {
  const items = (meal.items ?? [])
    .map(({ food, grams }) =>
      JSON.stringify([
        food.id,
        food.name,
        food.caloriesPer100g,
        food.proteinPer100g,
        food.carbsPer100g,
        food.fatPer100g,
        food.source,
        grams,
      ]),
    )
    .sort();
  return JSON.stringify([meal.categoryTag || "Almoço", items]);
}

/** As cinco combinações mais recentes, sem repetir pratos com as mesmas porções. */
export function recentMeals(diary: readonly DiaryEntry[]): DiaryEntry[] {
  const ordered = diary
    .filter((entry) => entry.type === "refeicao" && entry.items?.length)
    .slice()
    .sort(
      (a, b) =>
        `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const seen = new Set<string>();
  const result: DiaryEntry[] = [];
  for (const meal of ordered) {
    const key = mealSignature(meal);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(meal);
    if (result.length === RECENT_MEAL_LIMIT) break;
  }
  return result;
}

export function saveMealFavorite(
  state: AppState,
  input: Pick<SavedMeal, "id" | "name" | "categoryTag" | "items">,
): AppState {
  if (state.savedMeals.length >= MAX_SAVED_MEALS) {
    throw new Error(
      "Você chegou a 100 favoritos. Para salvar outro, remova um em Seus pratos.",
    );
  }
  const result = savedMealSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      "Dê um nome ao prato e confira os alimentos e as porções antes de favoritar.",
    );
  }
  if (state.savedMeals.some((meal) => meal.id === result.data.id)) {
    throw new Error("Esse favorito já foi salvo.");
  }
  return { ...state, savedMeals: [...state.savedMeals, result.data] };
}

/**
 * Tipo de refeição sugerido pelo horário: perto (até 1h30) do café, do almoço ou do jantar
 * informados na anamnese; entre eles, lanche; de madrugada ou tarde da noite, ceia.
 */
export function defaultMealCategory(
  time: string,
  times: { breakfastTime: string; lunchTime: string; dinnerTime: string },
): string {
  const now = toMinutes(time);
  const meals: [string, number][] = [
    ["Café da manhã", toMinutes(times.breakfastTime)],
    ["Almoço", toMinutes(times.lunchTime)],
    ["Jantar", toMinutes(times.dinnerTime)],
  ];
  const [nearest, distance] = meals
    .map(([category, at]): [string, number] => [category, Math.abs(now - at)])
    .reduce((a, b) => (b[1] < a[1] ? b : a));
  if (distance <= MEAL_WINDOW_MINUTES) return nearest;
  return now < meals[0][1] || now > meals[2][1] ? "Ceia" : "Lanche";
}

export interface FrequentFood {
  food: FoodItem;
  /** Porção da vez mais recente. */
  grams: number;
  /** Refeições com o alimento nos últimos 90 dias. */
  count: number;
}

/**
 * Alimentos mais registrados nos últimos 90 dias, contando em dobro os da mesma refeição
 * (ex.: o que costuma entrar no jantar), com a porção usada da última vez.
 */
export function frequentFoods(
  diary: readonly DiaryEntry[],
  category: string,
  today: string,
  limit = FREQUENT_LIMIT,
): FrequentFood[] {
  const since = shiftDate(today, -FREQUENT_WINDOW_DAYS);
  const meals = diary
    .filter(
      (e) => e.type === "refeicao" && e.items?.length && e.date >= since && e.date <= today,
    )
    .slice()
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const stats = new Map<string, { food: FoodItem; grams: number; count: number; same: number }>();
  for (const meal of meals)
    for (const item of meal.items ?? []) {
      const previous = stats.get(item.food.id);
      stats.set(item.food.id, {
        food: item.food,
        grams: item.grams,
        count: (previous?.count ?? 0) + 1,
        same: (previous?.same ?? 0) + (meal.categoryTag === category ? 1 : 0),
      });
    }
  const weight = (s: { count: number; same: number }) => s.count + 2 * s.same;
  return [...stats.values()]
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, limit)
    .map(({ food, grams, count }) => ({ food: { ...food }, grams, count }));
}

/** Acrescenta um alimento; se já estiver no prato, soma a porção (até o limite de 5 kg). */
export function addMealItem(
  items: readonly MealItem[],
  food: FoodItem,
  grams: number,
): MealItem[] {
  return items.some((i) => i.food.id === food.id)
    ? items.map((i) =>
        i.food.id === food.id
          ? { ...i, grams: Math.min(MAX_ITEM_GRAMS, round1(i.grams + grams)) }
          : i,
      )
    : [...items, { food: { ...food }, grams }];
}

/** "Juntar" um prato aos itens atuais: soma porções do mesmo alimento, sem alterar os originais. */
export function mergeMealItems(
  current: readonly MealItem[],
  incoming: readonly MealItem[],
): MealItem[] {
  return cloneMealItems(incoming).reduce<MealItem[]>(
    (merged, item) => addMealItem(merged, item.food, item.grams),
    cloneMealItems(current),
  );
}

/** "Arroz integral, cozido": o nome amigável com o preparo, como a tela mostra. */
function itemTitle(name: string): string {
  const { label, prep } = friendlyName(name);
  return prep ? `${label}, ${prep}` : label;
}

/** Por que um registro foi recusado: data futura, porções inválidas ou data/horário ausentes. */
export type MealEntryProblem = "future" | "items" | "when";

/** Registro de refeição validado, com totais e descrição; data futura ou prato vazio são recusados. */
export function mealEntry(input: {
  id: string;
  userId: string;
  date: string;
  time: string;
  category: string;
  items: MealItem[];
  now: string;
  today: string;
  createdAt?: string;
  imageUrl?: string;
  /** "Como ficou?" preservado na edição (SERINGA-07). */
  satiety?: SatietyKey;
}):
  | { success: true; entry: DiaryEntry; reason?: undefined }
  | { success: false; entry?: undefined; reason: MealEntryProblem } {
  const validItems =
    input.items.length > 0 &&
    input.items.every((i) => Number.isFinite(i.grams) && i.grams > 0 && i.grams <= MAX_ITEM_GRAMS);
  if (!validItems) return { success: false, reason: "items" };
  if (input.date > input.today) return { success: false, reason: "future" };
  const result = diarySchema.safeParse({
    id: input.id,
    userId: input.userId,
    date: input.date,
    time: input.time,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
    type: "refeicao",
    title: input.category,
    categoryTag: input.category,
    items: input.items,
    description: input.items.map((i) => `${itemTitle(i.food.name)} (${fmtNumber(i.grams, 1)} g)`).join(", "),
    ...mealTotals(input.items),
    imageUrl: input.imageUrl || undefined,
    ...(input.satiety ? { satiety: input.satiety } : {}),
  });
  return result.success
    ? { success: true, entry: result.data }
    : { success: false, reason: "when" };
}

/** Energia (kcal) de cada grama de macronutriente. */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };
const MAX_KCAL_PER_100G = 1000;

/** kcal por 100 g a partir dos macros, para rótulos cadastrados com as calorias ocultas. */
export function energyFromMacros(macros: { protein: number; carbs: number; fat: number }): number {
  const kcal =
    macros.protein * KCAL_PER_GRAM.protein +
    macros.carbs * KCAL_PER_GRAM.carbs +
    macros.fat * KCAL_PER_GRAM.fat;
  return Math.min(MAX_KCAL_PER_100G, round1(kcal));
}

export interface Dish {
  id: string;
  kind: "favorito" | "recente";
  title: string;
  /** Recentes: "ontem", "há 3 dias". */
  when?: string;
  items: MealItem[];
  /** Nome acessível do cartão que carrega o prato (mantido pelos testes de ponta a ponta). */
  loadLabel: string;
  /** Nome acessível do "+" que registra na hora. */
  logLabel: string;
  source: SavedMeal | DiaryEntry;
}

/** "Seus pratos": favoritos primeiro, depois as combinações recentes. */
export function dishesFrom(
  saved: readonly SavedMeal[],
  recent: readonly DiaryEntry[],
  today: string,
): Dish[] {
  return [
    ...saved.map(
      (meal): Dish => ({
        id: meal.id,
        kind: "favorito",
        title: meal.name,
        items: meal.items,
        loadLabel: `Usar favorito ${meal.name}`,
        logLabel: `Registrar ${meal.name} agora`,
        source: meal,
      }),
    ),
    ...recent.map((meal): Dish => {
      const title = meal.categoryTag || meal.title;
      return {
        id: meal.id,
        kind: "recente",
        title,
        when: fmtRelDate(meal.date, today),
        items: meal.items ?? [],
        loadLabel: `Repetir ${title} de ${meal.date}`,
        logLabel: `Registrar ${title} de ${meal.date} agora`,
        source: meal,
      };
    }),
  ];
}
