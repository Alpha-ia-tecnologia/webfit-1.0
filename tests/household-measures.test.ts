import { test } from "node:test";
import assert from "node:assert/strict";
import foods from "../src/data/foods.json";
import type { FoodItem } from "../src/types";
import {
  defaultPortion,
  describePortion,
  fmtQty,
  gramsFor,
  inferUnit,
  measureIconKey,
  measuresFor,
  parseGrams,
  qtyFor,
  rowPortion,
  shortPortion,
  stepQty,
} from "../src/lib/household-measures";

const taco = foods as FoodItem[];
const byName = (name: string) => {
  const food = taco.find((f) => f.name === name);
  assert.ok(food, name);
  return food;
};
const rice = byName("Arroz, integral, cozido");
const beans = byName("Feijão, carioca, cozido");

test("arroz cozido em colheres de sopa e escumadeiras; porção típica de 4 colheres", () => {
  assert.deepEqual(
    measuresFor(rice).map((m) => [m.id, m.grams]),
    [
      ["colher-sopa", 25],
      ["escumadeira", 90],
    ],
  );
  assert.deepEqual(defaultPortion(rice), { unit: "colher-sopa", qty: 4, grams: 100 });
});

test("medidas por tipo de alimento, só quando fazem sentido", () => {
  assert.equal(measuresFor(beans)[0].id, "concha");
  assert.equal(measuresFor(byName("Pão, trigo, francês"))[0].id, "unidade");
  assert.equal(measuresFor(byName("Ovo, de galinha, inteiro, frito"))[0].grams, 50);
  assert.equal(measuresFor(byName("Banana, prata, crua"))[0].id, "unidade");
  assert.equal(measuresFor(byName("Iogurte, natural"))[0].id, "pote");
  assert.equal(measuresFor(byName("Refrigerante, tipo cola"))[0].id, "copo");
  assert.equal(measuresFor(byName("Frango, peito, sem pele, grelhado"))[0].id, "file");
  // Cru não ganha filé nem concha: a porção fica em gramas.
  assert.deepEqual(measuresFor(byName("Frango, peito, sem pele, cru")), []);
  assert.deepEqual(measuresFor(byName("Feijão, carioca, cru")), []);
  assert.deepEqual(defaultPortion(byName("Tacacá")), { unit: "g", qty: 100, grams: 100 });
  assert.deepEqual(defaultPortion(byName("Mamão, Papaia, cru")), {
    unit: "unidade",
    qty: 0.5,
    grams: 150,
  });
});

test("toda medida da TACO tem gramas e passo positivos", () => {
  for (const food of taco)
    for (const m of measuresFor(food)) {
      assert.ok(m.grams > 0 && m.grams <= 500, `${food.name} ${m.id}`);
      assert.ok(m.step === 1 || m.step === 0.5, `${food.name} ${m.id}`);
    }
});

test("fmtQty mostra meias com ½ e o resto com vírgula", () => {
  assert.equal(fmtQty(0.5), "½");
  assert.equal(fmtQty(1.5), "1½");
  assert.equal(fmtQty(4), "4");
  assert.equal(fmtQty(1.74), "1,7");
  assert.equal(fmtQty(137.25), "137,3");
});

test("descrição da porção concorda em número e resume para a bandeja", () => {
  const [spoon, ladle] = measuresFor(rice);
  assert.equal(describePortion(1, spoon), "1 colher de sopa");
  assert.equal(describePortion(1.5, spoon), "1½ colher de sopa");
  assert.equal(describePortion(4, spoon), "4 colheres de sopa");
  assert.equal(describePortion(0.5, ladle), "½ escumadeira");
  assert.equal(describePortion(125.5, null), "125,5 g");
  assert.equal(shortPortion(4, spoon), "4 col.");
  assert.equal(shortPortion(1, measuresFor(beans)[0]), "1 concha");
  assert.equal(shortPortion(90, null), "90 g");
});

test("rowPortion: na linha do alimento, só os nomes longos viram o rótulo curto (\"4 col. de sopa\")", () => {
  const [spoon, ladle] = measuresFor(rice);
  assert.equal(rowPortion(4, spoon), "4 col. de sopa");
  assert.equal(rowPortion(1, spoon), "1 colher de sopa");
  assert.equal(rowPortion(1.5, ladle), "1½ escumadeira");
  assert.equal(rowPortion(3, ladle), "3 escumadeiras");
  assert.equal(rowPortion(1, measuresFor(beans)[0]), "1 concha");
  assert.equal(rowPortion(90, null), "90 g");
});

test("conversão entre gramas e medidas arredonda a 0,1", () => {
  const [spoon] = measuresFor(rice);
  assert.equal(gramsFor(3, spoon), 75);
  assert.equal(gramsFor(1 / 3, spoon), 8.3);
  assert.equal(qtyFor(90, spoon), 3.6);
  assert.equal(qtyFor(90, null), 90);
});

test("inferUnit reconhece porções salvas em meias medidas; o resto fica em gramas", () => {
  assert.equal(inferUnit(rice, 100), "colher-sopa");
  assert.equal(inferUnit(rice, 90), "escumadeira");
  assert.equal(inferUnit(rice, 137), "g");
  assert.equal(inferUnit(beans, 150), "concha");
  assert.equal(inferUnit(byName("Tacacá"), 100), "g");
});

test("medidas por variedade e por uso: banana-da-terra, limão, temperos e pratos secos", () => {
  const grams = (name: string) => defaultPortion(byName(name)).grams;
  assert.equal(grams("Banana, da terra, crua"), 180);
  assert.equal(grams("Banana, pacova, crua"), 180);
  assert.equal(grams("Banana, ouro, crua"), 40);
  assert.equal(grams("Banana, prata, crua"), 70);
  // Suco de limão puro é tempero: colher, nunca copo.
  assert.equal(defaultPortion(byName("Limão, galego, suco")).unit, "colher-sopa");
  assert.ok(grams("Alho, cru") <= 10);
  assert.ok(grams("Salsa, crua") <= 10);
  assert.equal(grams("Cebola, crua"), 45);
  assert.equal(grams("Cenoura, crua"), 45);
  // Crus que não se comem às colheradas ficam em gramas.
  assert.deepEqual(measuresFor(byName("Batata, inglesa, crua")), []);
  assert.deepEqual(measuresFor(byName("Mandioca, crua")), []);
  assert.equal(measuresFor(byName("Pão, de queijo, cru"))[0].id, "unidade");
  // Farofa pesa 15 g por colher (IBGE POF 2008–2009); tropeiro vai de colher, não de concha.
  assert.deepEqual(defaultPortion(byName("Mandioca, farofa, temperada")), {
    unit: "colher-sopa",
    qty: 3,
    grams: 45,
  });
  assert.equal(measuresFor(byName("Feijão tropeiro mineiro"))[0].id, "colher-sopa");
  assert.equal(measuresFor(byName("Feijoada"))[0].id, "concha");
});

test("parseGrams aceita vírgula, ponto decimal e milhar com ponto; recusa o resto", () => {
  assert.equal(parseGrams("12,5"), 12.5);
  assert.equal(parseGrams("12.5"), 12.5);
  assert.equal(parseGrams("1.000"), 1000);
  assert.equal(parseGrams("1.250,5"), 1250.5);
  assert.equal(parseGrams("  "), 0);
  assert.equal(parseGrams("0,"), 0);
  assert.equal(parseGrams("abc"), null);
  assert.equal(parseGrams("-5"), null);
  assert.equal(parseGrams("1.234,5,6"), null);
});

test("porções muito pequenas não aparecem como zero medida", () => {
  const [spoon] = measuresFor(rice);
  assert.equal(qtyFor(1, spoon), 0.04);
  assert.equal(fmtQty(0.04), "< 0,1");
  assert.equal(describePortion(0.04, spoon), "< 0,1 colher de sopa");
  assert.equal(shortPortion(0.04, spoon), "< 0,1 col.");
  assert.equal(describePortion(0, spoon), "0 colheres de sopa");
});

test("stepQty anda pelo passo da medida e encaixa valores quebrados", () => {
  assert.equal(stepQty(4, 1, 1), 5);
  assert.equal(stepQty(1.7, 1, 1), 2);
  assert.equal(stepQty(1.7, -1, 1), 1);
  assert.equal(stepQty(1, -1, 1), 1);
  assert.equal(stepQty(1.7, 1, 0.5), 2);
  assert.equal(stepQty(1.7, -1, 0.5), 1.5);
  assert.equal(stepQty(0.5, -1, 0.5), 0.5);
  assert.equal(stepQty(137, 1, 10), 140);
  assert.equal(stepQty(137, -1, 10), 130);
  // Abaixo de um passo, diminuir não aumenta a porção nem a zera.
  assert.equal(stepQty(5, -1, 10), 5);
  assert.equal(stepQty(0.04, -1, 1), 0.04);
  assert.equal(stepQty(0.08, -1, 1), 0.08);
});

test("measureIconKey: um ícone por medida caseira, balança para gramas e medidas sem desenho próprio", () => {
  assert.equal(measureIconKey("colher-sopa"), "spoon");
  assert.equal(measureIconKey("colher-cha"), "teaspoon");
  assert.equal(measureIconKey("escumadeira"), "skimmer");
  assert.equal(measureIconKey("concha"), "ladle");
  assert.equal(measureIconKey("xicara"), "cup");
  assert.equal(measureIconKey("copo"), "glass");
  assert.equal(measureIconKey("unidade"), "unit");
  assert.equal(measureIconKey("fatia"), "slice");
  assert.equal(measureIconKey("pote"), "pot");
  assert.equal(measureIconKey("folha"), "leaf");
  assert.equal(measureIconKey("file"), "piece");
  assert.equal(measureIconKey("bife"), "piece");
  assert.equal(measureIconKey("g"), "scale");
  // Toda medida do catálogo tem ícone (nenhuma cai na balança sem querer).
  for (const food of taco.slice(0, 400))
    for (const m of measuresFor(food)) assert.notEqual(measureIconKey(m.id), "scale", m.id);
});
