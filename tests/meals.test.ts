import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMealItem,
  cloneMealItems,
  defaultMealCategory,
  dishesFrom,
  energyFromMacros,
  frequentFoods,
  mealDraftFrom,
  mealEntry,
  mergeMealItems,
  recentMeals,
  saveMealFavorite,
  MAX_SAVED_MEALS,
  RECENT_MEAL_LIMIT,
} from "../src/lib/meals";
import { mealTotals } from "../src/lib/domain";
import {
  diarySchema,
  savedMealSchema,
  stateSchema,
  type FoodItem,
  type DiaryEntry,
  type MealItem,
} from "../src/types";
import { stateFixture } from "./fixtures";

const rice: FoodItem = {
  id: "rice",
  name: "Arroz cozido",
  category: "Cereais",
  caloriesPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  source: "Tabela de teste",
};
const beans: FoodItem = {
  ...rice,
  id: "beans",
  name: "Feijão cozido",
  caloriesPer100g: 76,
};
const items = [
  { food: rice, grams: 125.5 },
  { food: beans, grams: 90 },
];
function entry(id: string, time = "12:00", date = "2026-01-02"): DiaryEntry {
  return diarySchema.parse({
    id,
    userId: "test",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type: "refeicao",
    title: "Almoço",
    categoryTag: "Almoço",
    description: "Arroz e feijão",
    items,
    ...mealTotals(items),
    imageUrl: "data:image/png;base64,AAAA",
  });
}
const favoriteInput = () => ({
  id: "favorite",
  name: "  Meu almoço  ",
  categoryTag: "Almoço",
  items,
});

test("favoritos: estados antigos recebem lista vazia e novos favoritos persistem sem anexos", () => {
  const { savedMeals, ...old } = stateFixture();
  const migrated = stateSchema.parse(old);
  assert.deepEqual(migrated.savedMeals, []);
  const saved = saveMealFavorite(migrated, {
    ...entry("photo-meal"),
    name: "Almoço de casa",
    categoryTag: "Almoço",
    items,
  });
  const restored = stateSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.savedMeals[0].name, "Almoço de casa");
  assert.deepEqual(Object.keys(restored.savedMeals[0]).sort(), [
    "categoryTag",
    "id",
    "items",
    "name",
  ]);
  assert.deepEqual(restored.diary, migrated.diary);
  assert.deepEqual(migrated.savedMeals, []);
});

test("repetir prato clona alimentos e porções sem levar data, horário, identidade ou foto", () => {
  const original = entry("original");
  const draft = mealDraftFrom(original);
  assert.deepEqual(Object.keys(draft).sort(), ["categoryTag", "items"]);
  assert.deepEqual(draft.items, original.items);
  assert.deepEqual(mealTotals(draft.items), mealTotals(original.items!));
  assert.notEqual(draft.items, original.items);
  assert.notEqual(draft.items[0].food, original.items![0].food);
  draft.items[0].grams = 200;
  draft.items[0].food.name = "Outro alimento";
  assert.equal(original.items![0].grams, 125.5);
  assert.equal(original.items![0].food.name, "Arroz cozido");
  assert.equal(cloneMealItems([]).length, 0);
});

test("favoritos têm ingredientes próprios e permanecem disponíveis após apagar o diário", () => {
  const state = stateFixture();
  state.diary = [entry("original")];
  const saved = saveMealFavorite(state, {
    ...favoriteInput(),
    items: state.diary[0].items!,
  });
  assert.equal(saved.savedMeals[0].name, "Meu almoço");
  state.diary[0].items![0].grams = 80;
  assert.equal(saved.savedMeals[0].items[0].grams, 125.5);
  const withoutDiary = stateSchema.parse({ ...saved, diary: [] });
  assert.equal(withoutDiary.savedMeals[0].items[0].grams, 125.5);
  const draft = mealDraftFrom(withoutDiary.savedMeals[0]);
  draft.items[0].grams = 300;
  assert.equal(withoutDiary.savedMeals[0].items[0].grams, 125.5);
});

test("recentes ordena pelo consumo, elimina repetições independentemente da ordem dos itens e limita a lista", () => {
  const newest = entry("newest", "18:00");
  newest.items!.reverse();
  const water = diarySchema.parse({
    id: "water",
    userId: "test",
    date: "2026-01-02",
    time: "20:00",
    createdAt: "",
    updatedAt: "",
    title: "Água",
    description: "",
    type: "agua",
    amountMl: 250,
  });
  const diary = [
    entry("old", "12:00"),
    water,
    newest,
    entry("yesterday", "19:00", "2026-01-01"),
  ];
  const snapshot = JSON.stringify(diary);
  assert.deepEqual(
    recentMeals(diary).map((meal) => meal.id),
    ["newest"],
  );
  assert.equal(JSON.stringify(diary), snapshot);
  const varied = Array.from({ length: 8 }, (_, index) => ({
    ...entry(`meal-${index}`, `1${index}:00`),
    items: [{ food: rice, grams: 100 + index }],
  }));
  assert.equal(recentMeals(varied).length, RECENT_MEAL_LIMIT);
  assert.equal(recentMeals(varied)[0].id, "meal-7");
  assert.equal(
    recentMeals([
      ...varied,
      { ...entry("other-category", "19:00"), categoryTag: "Jantar" },
    ])[0].id,
    "other-category",
  );
});

test("favoritos valida nome, limite de pratos, limite de itens e quantidades antes de persistir", () => {
  const state = stateFixture();
  for (const invalid of [
    { ...favoriteInput(), name: "  " },
    { ...favoriteInput(), name: "a".repeat(101) },
    { ...favoriteInput(), items: [] },
    { ...favoriteInput(), items: [{ food: rice, grams: 0 }] },
    { ...favoriteInput(), items: [{ food: rice, grams: 5001 }] },
    {
      ...favoriteInput(),
      items: Array.from({ length: 101 }, () => ({ food: rice, grams: 10 })),
    },
  ])
    assert.throws(() => saveMealFavorite(state, invalid));
  const one = saveMealFavorite(state, favoriteInput());
  assert.throws(() => saveMealFavorite(one, favoriteInput()), /já foi salvo/);
  const full = {
    ...state,
    savedMeals: Array.from({ length: MAX_SAVED_MEALS }, (_, index) =>
      savedMealSchema.parse({ ...favoriteInput(), id: `favorite-${index}` }),
    ),
  };
  assert.equal(stateSchema.safeParse(full).success, true);
  assert.throws(() => saveMealFavorite(full, favoriteInput()), /100 favoritos/);
  assert.equal(
    stateSchema.safeParse({
      ...full,
      savedMeals: [...full.savedMeals, savedMealSchema.parse(favoriteInput())],
    }).success,
    false,
  );
  assert.equal(state.savedMeals.length, 0);
});

test("tipo de refeição sugerido pelos horários informados na anamnese", () => {
  const times = { breakfastTime: "07:00", lunchTime: "12:00", dinnerTime: "19:30" };
  const cases: [string, string][] = [
    ["03:00", "Ceia"],
    ["06:40", "Café da manhã"],
    ["08:20", "Café da manhã"],
    ["10:00", "Lanche"],
    ["12:45", "Almoço"],
    ["16:00", "Lanche"],
    ["19:30", "Jantar"],
    ["21:00", "Jantar"],
    ["22:30", "Ceia"],
  ];
  for (const [time, category] of cases)
    assert.equal(defaultMealCategory(time, times), category, time);
});

test("frequentes: mais usados, com peso para a mesma refeição e a última porção", () => {
  const meal = (id: string, date: string, time: string, category: string, list: MealItem[]) => ({
    ...entry(id, time, date),
    categoryTag: category,
    items: list,
  });
  const diary = [
    meal("a", "2026-01-01", "12:00", "Almoço", [
      { food: rice, grams: 100 },
      { food: beans, grams: 90 },
    ]),
    meal("b", "2026-01-02", "12:00", "Almoço", [{ food: rice, grams: 120 }]),
    meal("c", "2026-01-02", "19:00", "Jantar", [{ food: beans, grams: 80 }]),
    meal("d", "2026-01-03", "19:00", "Jantar", [{ food: beans, grams: 70 }]),
  ];
  assert.deepEqual(
    frequentFoods(diary, "Jantar", "2026-01-04").map((f) => [f.food.id, f.grams, f.count]),
    [
      ["beans", 70, 3],
      ["rice", 120, 2],
    ],
  );
  assert.equal(frequentFoods(diary, "Almoço", "2026-01-04")[0].food.id, "rice");
  assert.equal(frequentFoods(diary, "Jantar", "2026-01-04", 1).length, 1);
  // Só os últimos 90 dias contam, e registros futuros não entram.
  assert.equal(frequentFoods(diary, "Jantar", "2026-06-01").length, 0);
  assert.equal(frequentFoods(diary, "Jantar", "2025-12-31").length, 0);
});

test("juntar pratos soma porções do mesmo alimento sem alterar o original", () => {
  const current = [{ food: rice, grams: 100 }];
  const merged = mergeMealItems(current, [
    { food: rice, grams: 50 },
    { food: beans, grams: 90 },
  ]);
  assert.deepEqual(
    merged.map((i) => [i.food.id, i.grams]),
    [
      ["rice", 150],
      ["beans", 90],
    ],
  );
  assert.equal(current[0].grams, 100);
  assert.notEqual(merged[1].food, beans);
  assert.equal(mergeMealItems([{ food: rice, grams: 4990 }], [{ food: rice, grams: 50 }])[0].grams, 5000);
  assert.deepEqual(
    addMealItem([], beans, 86).map((i) => [i.food.id, i.grams]),
    [["beans", 86]],
  );
});

test("mealEntry monta o registro validado com totais e descrição; rejeita data futura", () => {
  const base = {
    id: "new",
    userId: "test",
    date: "2026-01-02",
    time: "19:35",
    category: "Jantar",
    items,
    now: "2026-01-02T22:35:00.000Z",
    today: "2026-01-02",
  };
  const result = mealEntry(base);
  assert.ok(result.success);
  assert.equal(result.entry.title, "Jantar");
  assert.equal(result.entry.categoryTag, "Jantar");
  // Nome amigável e vírgula decimal, como o Diário mostra.
  assert.equal(result.entry.description, "Arroz cozido (125,5 g), Feijão cozido (90 g)");
  assert.equal(
    mealEntry({ ...base, items: [{ food: { ...rice, name: "Arroz, integral, cozido" }, grams: 100 }] })
      .entry?.description,
    "Arroz integral, cozido (100 g)",
  );
  assert.equal(result.entry.calories, mealTotals(items).calories);
  assert.equal(result.entry.createdAt, base.now);
  assert.equal(result.entry.imageUrl, undefined);
  assert.equal(mealEntry({ ...base, createdAt: "2026-01-01T00:00:00.000Z" }).entry?.createdAt, "2026-01-01T00:00:00.000Z");
  // O motivo da recusa permite mensagens específicas.
  assert.equal(mealEntry({ ...base, date: "2026-01-03" }).reason, "future");
  assert.equal(mealEntry({ ...base, items: [] }).reason, "items");
  assert.equal(mealEntry({ ...base, items: [{ food: rice, grams: 0 }] }).reason, "items");
  assert.equal(mealEntry({ ...base, items: [{ food: rice, grams: Number.NaN }] }).reason, "items");
  assert.equal(mealEntry({ ...base, time: "" }).reason, "when");
  assert.equal(mealEntry({ ...base, date: "" }).reason, "when");
});

test("pratos: favoritos primeiro, recentes com quando e nomes acessíveis únicos", () => {
  const favorite = savedMealSchema.parse({ ...favoriteInput(), name: "Meu almoço" });
  const recent = entry("recent", "12:00", "2026-01-01");
  const dishes = dishesFrom([favorite], [recent], "2026-01-02");
  assert.deepEqual(
    dishes.map((d) => [d.kind, d.title, d.when, d.loadLabel, d.logLabel]),
    [
      ["favorito", "Meu almoço", undefined, "Usar favorito Meu almoço", "Registrar Meu almoço agora"],
      ["recente", "Almoço", "ontem", "Repetir Almoço de 2026-01-01", "Registrar Almoço de 2026-01-01 agora"],
    ],
  );
  assert.equal(dishes[1].source, recent);
});

test("energia pelos macros (4/4/9 kcal por grama), para rótulos sem o valor calórico", () => {
  assert.equal(energyFromMacros({ protein: 10, carbs: 20, fat: 5 }), 165);
  assert.equal(energyFromMacros({ protein: 0.3, carbs: 0.25, fat: 0.1 }), 3.1);
  assert.equal(energyFromMacros({ protein: 100, carbs: 100, fat: 100 }), 1000);
});

test("mealEntry preserva o 'Como ficou?' na edição; sem resposta, o campo não existe (SERINGA-07)", () => {
  const base = {
    id: "edit",
    userId: "test",
    date: "2026-01-02",
    time: "12:00",
    category: "Almoço",
    items,
    now: "2026-01-02T13:00:00.000Z",
    today: "2026-01-02",
  };
  assert.equal(mealEntry({ ...base, satiety: "na_medida" }).entry?.satiety, "na_medida");
  const plain = mealEntry(base).entry;
  assert.ok(plain);
  assert.equal("satiety" in plain, false);
});
