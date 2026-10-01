import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foodsJson, importTaco, round3, sheetRows } from "../scripts/import-taco";
import { foodSchema } from "../src/types";

const row = (code: string, cells: Record<string, string>) => ({ A: code, B: `Alimento ${code}`, ...cells });

test("round3 arredonda como o round() do Python, pelo valor binário exato", () => {
  assert.equal(round3(123.53489250000001), 123.535);
  // 86,1485 em binário fica abaixo da metade: o Python dava 86,148 (Math.round(n * 1000) daria 86,149).
  assert.equal(round3(86.1485), 86.148);
  assert.equal(round3(0.0005), 0.001);
  assert.equal(round3(2.5), 2.5);
  assert.equal(round3(884), 884);
});

test("Tr, NA, resíduo negativo do carboidrato e o álcool viram zero com a nota do motivo", () => {
  const { foods, excluded } = importTaco([
    row("1", { D: "100", F: "Tr", I: "20", G: "1" }),
    row("260", { D: "884", F: "NA", I: "NA", G: "100" }),
    row("288", { D: "128.1554", F: "17.3667", I: "-0.0267", G: "5.9867" }),
    row("472", { D: "215.6616" }),
  ]);
  assert.deepEqual(excluded, []);
  const [trace, oil, fish, spirit] = foods;
  assert.equal(trace.proteinPer100g.n, 0);
  assert.match(trace.note ?? "", /traços \(Tr\)/);
  assert.deepEqual([oil.proteinPer100g.n, oil.carbsPer100g.n, oil.fatPer100g.n, oil.caloriesPer100g.n], [0, 0, 100, 884]);
  assert.match(oil.note ?? "", /NA \(não se aplica\)/);
  assert.equal(oil.category, "Gorduras e óleos");
  assert.equal(fish.carbsPer100g.n, 0);
  assert.match(fish.note ?? "", /levemente negativo/);
  assert.deepEqual([spirit.caloriesPer100g.n, spirit.proteinPer100g.n, spirit.carbsPer100g.n, spirit.fatPer100g.n], [215.662, 0, 0, 0]);
  assert.match(spirit.note ?? "", /álcool/);
});

test("nenhum número é inventado: '*', ausente fora do álcool e negativo de verdade ficam de fora", () => {
  const { foods, excluded } = importTaco([
    row("458", { D: "*", F: "*", I: "*", G: "*" }),
    row("2", { D: "100", F: "3", G: "1" }),
    row("3", { D: "100", F: "3", I: "-0.5", G: "1" }),
    row("4", { D: "100", F: "-1", I: "2", G: "1" }),
  ]);
  assert.deepEqual(foods, []);
  assert.deepEqual(
    excluded.map((e) => [e.code, e.reason]),
    [
      ["458", "Valores em análise (*) na TACO: sem números para usar."],
      ["2", "Valor ausente na TACO."],
      ["3", "Valor negativo na TACO."],
      ["4", "Valor negativo na TACO."],
    ],
  );
});

test("a planilha oficial gera exatamente o catálogo versionado: 593 alimentos e 4 fora por falta de valores", () => {
  const { foods, excluded } = importTaco(sheetRows(readFileSync(new URL("../data-sources/taco.xlsx", import.meta.url))));
  assert.equal(foods.length, 593);
  assert.deepEqual(excluded.map((e) => e.code), ["450", "457", "458", "591"]);
  assert.ok(excluded.every((e) => e.reason.startsWith("Valores em análise")));
  assert.equal(foodsJson(foods), readFileSync(new URL("../src/data/foods.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(readFileSync(new URL("../src/data/foods.json", import.meta.url), "utf8"));
  for (const id of ["taco-260", "taco-272", "taco-337", "taco-472", "taco-517"]) {
    const food = catalog.find((f: { id: string }) => f.id === id);
    assert.ok(food && foodSchema.safeParse(food).success, id);
    assert.ok(food.note, `${id} sem a nota do ajuste`);
  }
});
