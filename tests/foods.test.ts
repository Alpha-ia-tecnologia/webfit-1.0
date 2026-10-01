import { test } from "node:test";
import assert from "node:assert/strict";
import foods from "../src/data/foods.json";
import { TACO_CATEGORY_RANGES } from "../scripts/fix-taco-categories";

const code = (id: string) => Number(id.replace("taco-", ""));

test("nenhum alimento da TACO herda o cabeçalho de página como categoria", () => {
  assert.equal(foods.filter((f) => /^Número/.test(f.category)).length, 0);
});

test("cada alimento está na categoria oficial da faixa do seu código", () => {
  for (const food of foods) {
    const range = TACO_CATEGORY_RANGES.find(
      ([, first, last]) => code(food.id) >= first && code(food.id) <= last,
    );
    assert.ok(range, `${food.id} fora das faixas conhecidas`);
    assert.equal(food.category, range[0], `${food.id} ${food.name}`);
  }
});

test("todo alimento tem um nome de verdade (a planilha oficial traz 'L' no item 540, a Feijoada)", () => {
  for (const food of foods) assert.ok(food.name.trim().length > 2, `${food.id} "${food.name}"`);
  assert.equal(foods.find((f) => f.id === "taco-540")?.name, "Feijoada");
});

test("exemplos conferidos na tabela oficial", () => {
  const byId = new Map(foods.map((f) => [f.id, f.category]));
  assert.equal(byId.get("taco-32"), "Cereais e derivados");
  assert.equal(byId.get("taco-70"), "Verduras, hortaliças e derivados");
  assert.equal(byId.get("taco-300"), "Pescados e frutos do mar");
  assert.equal(byId.get("taco-590"), "Nozes e sementes");
});
