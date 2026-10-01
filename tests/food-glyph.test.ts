import { test } from "node:test";
import assert from "node:assert/strict";
import { glyphForFood, glyphForName, mealGlyph } from "../src/lib/food-glyph";
import { PANTRY_FALLBACK_GLYPH, pantryEmoji } from "../src/lib/pantry-view";
import type { FoodItem, MealItem } from "../src/types";

const food = (name: string, caloriesPer100g: number, category = ""): FoodItem => ({
  id: name,
  name,
  category,
  caloriesPer100g,
  proteinPer100g: 1,
  carbsPer100g: 1,
  fatPer100g: 1,
  source: "TACO",
});
const item = (name: string, kcal: number, grams: number, category = ""): MealItem => ({
  food: food(name, kcal, category),
  grams,
});

test("glyphForFood: emoji pelo nome, depois pela categoria; etiqueta genérica vira null", () => {
  assert.equal(glyphForFood(food("Arroz, integral, cozido", 124)), "🍚");
  assert.equal(glyphForFood(food("Pão, trigo, forma, integral", 253)), "🍞");
  assert.equal(glyphForFood(food("Alimento raro", 100, "Frutas e derivados")), "🍎");
  assert.equal(glyphForFood(food("Receita da vó", 100)), null);
});

test("glyphForName: nome inteiro, depois palavra no singular; null quando nada casa", () => {
  assert.equal(glyphForName("Tomate italiano"), "🍅");
  assert.equal(glyphForName("Ovos caipiras"), "🥚");
  assert.equal(glyphForName("Arroz"), "🍚");
  assert.equal(glyphForName(""), null);
  assert.equal(glyphForName("Receita da vó"), null);
});

test("pantryEmoji delega a glyphForName e mantém o prato como reserva", () => {
  assert.equal(pantryEmoji("Ovos caipiras"), "🥚");
  assert.equal(pantryEmoji("Receita da vó"), PANTRY_FALLBACK_GLYPH);
});

test("mealGlyph: emoji do item de maior energia (gramas × kcal/100 g)", () => {
  // Pão: 50 g × 253 = 126 kcal; ovo: 100 g × 146 = 146 kcal → o ovo é o principal.
  const breakfast = [item("Pão, trigo, forma, integral", 253, 50), item("Ovo, de galinha, inteiro, cozido", 146, 100)];
  assert.equal(mealGlyph(breakfast), "🥚");
  // Sem emoji no principal, vale o próximo.
  assert.equal(mealGlyph([item("Receita da vó", 400, 300), item("Arroz, tipo 1, cozido", 128, 100)]), "🍚");
  assert.equal(mealGlyph([]), null);
  assert.equal(mealGlyph(undefined), null);
  assert.equal(mealGlyph([item("Receita da vó", 400, 300)]), null);
});

test("mealGlyph: no café da manhã a bebida típica vem antes do item de maior energia", () => {
  const breakfast = [
    item("Pão, trigo, forma, integral", 253, 75),
    item("Ovo, de galinha, inteiro, cozido", 146, 100),
    item("Café, infusão 10%", 9, 50, "Bebidas (alcoólicas e não alcoólicas)"),
  ];
  assert.equal(mealGlyph(breakfast, "Café da manhã"), "☕");
  // Sem categoria (ou em outra refeição) continua valendo o principal.
  assert.equal(mealGlyph(breakfast), "🍞");
  assert.equal(mealGlyph(breakfast, "Lanche da tarde"), "🍞");
  // Café da manhã sem bebida: o principal.
  assert.equal(mealGlyph(breakfast.slice(0, 2), "Café da manhã"), "🍞");
});

test("mealGlyph não muda a ordem da lista recebida", () => {
  const list = [item("Pão, trigo, forma, integral", 253, 50), item("Ovo, de galinha, inteiro, cozido", 146, 100)];
  const before = list.map((i) => i.food.name);
  mealGlyph(list);
  assert.deepEqual(list.map((i) => i.food.name), before);
});
