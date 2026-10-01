import { test } from "node:test";
import assert from "node:assert/strict";
import foodsJson from "../src/data/foods.json";
import { FALLBACK_CATEGORY, FOOD_CATEGORIES } from "../src/lib/food-categories";
import {
  CATEGORY_GROUP,
  FOOD_GROUPS,
  FOOD_GROUP_TOTAL,
  PREPARED_GROUPS,
  VARIETY_COPY,
  dayVariety,
  foodGroupsOf,
  groupDays,
  varietySpeech,
} from "../src/lib/food-groups";
import type { FoodItem } from "../src/types";
import { T, meal, tacoFood, water } from "./report-fixtures";

test("grupos: 7, na ordem do Guia, sem tom de alerta", () => {
  assert.equal(FOOD_GROUPS.length, FOOD_GROUP_TOTAL);
  assert.deepEqual(
    FOOD_GROUPS.map((g) => g.key),
    [
      "cereais",
      "feijoes",
      "verduras",
      "frutas",
      "castanhas",
      "leite",
      "carnes",
    ],
  );
  assert.ok(FOOD_GROUPS.every((g) => (g.tone as string) !== "danger"));
});

test("foodGroupsOf: exceções por id, pratos prontos e categoria", () => {
  const cases: [Pick<FoodItem, "id" | "category">, string[]][] = [
    [tacoFood("taco-3"), ["cereais"]],
    [tacoFood("taco-561"), ["feijoes"]],
    [tacoFood("taco-78"), ["verduras"]],
    [tacoFood("taco-91"), ["cereais"]],
    [tacoFood("taco-182"), ["frutas"]],
    [tacoFood("taco-589"), ["castanhas"]],
    [tacoFood("taco-558"), ["castanhas"]],
    [tacoFood("taco-461"), ["leite"]],
    [tacoFood("taco-410"), ["carnes"]],
    [tacoFood("taco-488"), ["carnes"]],
    [tacoFood("taco-492"), []],
    [tacoFood("taco-471"), []],
    [tacoFood("taco-540"), ["feijoes", "carnes"]],
    [{ id: "x", category: "Meus alimentos" }, []],
    [{ id: "test-rice", category: "Cereais" }, []],
  ];
  for (const [food, groups] of cases)
    assert.deepEqual(foodGroupsOf(food), groups, food.id);
  // Prato pronto com grupos fora de ordem na tabela sai na ordem canônica.
  assert.deepEqual(foodGroupsOf(tacoFood("taco-547")), ["verduras", "carnes"]);
  // Cópia salva com categoria antiga continua no grupo pelo id da TACO.
  assert.deepEqual(foodGroupsOf({ id: "taco-3", category: "Outra" }), [
    "cereais",
  ]);
});

test("mapa completo: todo prato pronto da TACO e toda categoria têm entrada", () => {
  const prepared = (foodsJson as FoodItem[])
    .filter((f) => f.category === "Alimentos preparados")
    .map((f) => f.id);
  assert.equal(prepared.length, 32);
  assert.deepEqual(Object.keys(PREPARED_GROUPS).sort(), [...prepared].sort());
  for (const category of [...Object.values(FOOD_CATEGORIES), FALLBACK_CATEGORY])
    assert.ok(category.key in CATEGORY_GROUP, category.key);
});

test("dayVariety: só refeições do dia, grupos na ordem canônica", () => {
  const diary = [
    meal(T, ["taco-3", "taco-561", "taco-78", "taco-410"]),
    meal(T, ["taco-182"], "Lanche", "16:00"),
    water(T, 250),
    meal("2026-09-27", ["taco-461"]),
  ];
  const day = dayVariety(diary, T);
  assert.deepEqual(day.present, [
    "cereais",
    "feijoes",
    "verduras",
    "frutas",
    "carnes",
  ]);
  assert.equal(day.count, 5);
  assert.equal(day.total, 7);
  assert.equal(day.mealCount, 2);
  assert.equal(day.speech, varietySpeech(day.present));
  assert.deepEqual(dayVariety(diary, "2026-09-26"), {
    present: [],
    count: 0,
    total: 7,
    mealCount: 0,
    speech: "Variedade do dia: nenhum grupo de alimentos registrado.",
  });
});

test("varietySpeech: contagem e rótulos; nenhum grupo", () => {
  assert.equal(
    varietySpeech(["cereais", "feijoes", "carnes"]),
    "Variedade do dia: 3 de 7 grupos de alimentos: Cereais, raízes e tubérculos; Feijões e outras leguminosas; Carnes, peixes e ovos.",
  );
  assert.equal(
    varietySpeech([]),
    "Variedade do dia: nenhum grupo de alimentos registrado.",
  );
});

test("sem calorias e sem depender da ordem de inserção", () => {
  const day = dayVariety(
    [meal(T, ["taco-3", "taco-561", "taco-78", "taco-410"])],
    T,
  );
  assert.doesNotMatch(JSON.stringify(day), /calor|kcal/);
  assert.doesNotMatch(JSON.stringify(VARIETY_COPY), /calor|kcal/i);
  assert.deepEqual(dayVariety([meal(T, ["taco-410", "taco-3"])], T).present, [
    "cereais",
    "carnes",
  ]);
});

test("groupDays: dias com cada grupo no período, os 7 na ordem", () => {
  const diary = [
    meal("2026-09-20", ["taco-3", "taco-410"]),
    meal("2026-09-20", ["taco-3"], "Jantar", "19:00"),
    meal("2026-09-25", ["taco-3", "taco-182"]),
    meal("2026-08-01", ["taco-461"]),
  ];
  assert.deepEqual(groupDays(diary, "2026-08-30", T), [
    { key: "cereais", days: 2 },
    { key: "feijoes", days: 0 },
    { key: "verduras", days: 0 },
    { key: "frutas", days: 1 },
    { key: "castanhas", days: 0 },
    { key: "leite", days: 0 },
    { key: "carnes", days: 1 },
  ]);
});
