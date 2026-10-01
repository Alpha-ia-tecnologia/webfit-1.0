import { test } from "node:test";
import assert from "node:assert/strict";
import foods from "../src/data/foods.json";
import { domainTone } from "../src/design/tokens";
import {
  ALL_CATEGORIES,
  categoriesIn,
  FALLBACK_CATEGORY,
  FOOD_CATEGORIES,
  filterByCategory,
  foodCategoryOf,
  onePerCategory,
} from "../src/lib/food-categories";
import type { FoodItem } from "../src/types";

const taco = foods as FoodItem[];
const byName = (name: string) => {
  const food = taco.find((f) => f.name === name);
  assert.ok(food, name);
  return food;
};

test("toda categoria da TACO tem ícone, rótulo e um tom de domínio que não é vermelho", () => {
  const categories = new Set(taco.map((f) => f.category));
  for (const category of categories) {
    const entry = FOOD_CATEGORIES[category];
    assert.ok(entry, `sem mapeamento para "${category}"`);
    assert.ok(entry.label.trim(), category);
    assert.ok(entry.icon, category);
    assert.ok(entry.tone in domainTone, category);
    assert.notEqual(entry.tone as string, "danger", category);
  }
  const keys = Object.values(FOOD_CATEGORIES).map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, "chaves repetidas");
  assert.ok(!keys.includes(ALL_CATEGORIES));
  assert.ok(!keys.includes(FALLBACK_CATEGORY.key));
});

test("o id da TACO vence uma cópia salva com nome e categoria antigos", () => {
  const rice = byName("Arroz, integral, cozido");
  const stale = { ...rice, name: "Arroz de ontem", category: "Frutas e derivados" };
  assert.equal(foodCategoryOf(stale).key, "cereais");
  assert.equal(foodCategoryOf(rice), FOOD_CATEGORIES["Cereais e derivados"]);
  assert.equal(foodCategoryOf(byName("Banana, prata, crua")).key, "frutas");
});

test("sem id da TACO vale a categoria da cópia; sem categoria conhecida, o ícone genérico", () => {
  const custom = { id: "mine-1", category: "Frutas e derivados" };
  assert.equal(foodCategoryOf(custom).key, "frutas");
  assert.equal(foodCategoryOf({ id: "rotulo-1", category: "Meus alimentos" }).key, "meus");
  assert.equal(foodCategoryOf({ id: "x", category: "Receitas da vó" }), FALLBACK_CATEGORY);
  assert.equal(foodCategoryOf({ id: "taco-inexistente", category: "" }), FALLBACK_CATEGORY);
});

test("filtros: categorias na ordem dos resultados, com contagem, e filtro único", () => {
  const items = [
    byName("Arroz, integral, cozido"),
    byName("Banana, prata, crua"),
    byName("Arroz, tipo 1, cozido"),
    { ...byName("Banana, prata, crua"), id: "cópia", name: "Leite da fazenda", category: "Leite e derivados" },
  ];
  const same = (f: FoodItem) => f;
  assert.deepEqual(
    categoriesIn(items, same).map((c) => [c.key, c.count]),
    [
      ["cereais", 2],
      ["frutas", 1],
      ["leite", 1],
    ],
  );
  assert.deepEqual(
    filterByCategory(items, "cereais", same).map((f) => f.name),
    ["Arroz, integral, cozido", "Arroz, tipo 1, cozido"],
  );
  assert.equal(filterByCategory(items, ALL_CATEGORIES, same).length, 4);
  // Categoria que saiu dos resultados (a busca mudou): volta a mostrar tudo.
  assert.equal(filterByCategory(items, "pescados", same).length, 4);
});

test("ícones de um prato: um alimento por categoria, até o limite", () => {
  const foods = [
    byName("Arroz, integral, cozido"),
    byName("Arroz, tipo 1, cozido"),
    byName("Banana, prata, crua"),
    { id: "mine", category: "Meus alimentos" },
    { id: "x", category: "Receitas" },
  ];
  assert.deepEqual(
    onePerCategory(foods, 3).map((f) => f.id),
    [foods[0]!.id, foods[2]!.id, "mine"],
  );
  assert.equal(onePerCategory(foods, 10).length, 4);
});
