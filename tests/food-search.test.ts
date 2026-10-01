import { test } from "node:test";
import assert from "node:assert/strict";
import foods from "../src/data/foods.json";
import type { FoodItem } from "../src/types";
import {
  foodEmoji,
  friendlyName,
  highlightMatches,
  searchFoods,
} from "../src/lib/food-search";

const taco = foods as FoodItem[];
const byName = (name: string) => {
  const food = taco.find((f) => f.name === name);
  assert.ok(food, name);
  return food;
};
const mine: FoodItem = {
  id: "mine",
  name: "Pão de fermentação natural",
  category: "Meus alimentos",
  caloriesPer100g: 250,
  proteinPer100g: 9,
  carbsPer100g: 50,
  fatPer100g: 1,
  source: "Rótulo da padaria",
};
const top = (query: string) => searchFoods(taco, query).groups[0];

test("friendlyName separa o preparo e mostra o nome como se fala", () => {
  const cases: [string, string, string | null][] = [
    ["Arroz, integral, cozido", "Arroz integral", "cozido"],
    ["Arroz, tipo 1, cozido", "Arroz branco (tipo 1)", "cozido"],
    ["Frango, peito, sem pele, grelhado", "Peito de frango sem pele", "grelhado"],
    ["Frango, filé, à milanesa", "Filé de frango", "à milanesa"],
    ["Ovo, de galinha, inteiro, cozido/10minutos", "Ovo inteiro", "cozido"],
    ["Leite, de vaca, achocolatado", "Leite de vaca, achocolatado", null],
    ["Pão, trigo, francês", "Pão francês", null],
    ["Tangerina, Poncã, crua", "Tangerina Poncã", "crua"],
    ["Mortadela", "Mortadela", null],
    // Cortes: o nome do corte na frente, "bovina" só onde ele sozinho é ambíguo.
    ["Carne, bovina, patinho, sem gordura, grelhado", "Patinho sem gordura", "grelhado"],
    ["Carne, bovina, costela, assada", "Costela bovina", "assada"],
    ["Carne, bovina, acém, moído, cozido", "Carne moída (acém)", "cozido"],
    ["Porco, bisteca, grelhada", "Bisteca de porco", "grelhada"],
    ["Lingüiça, porco, grelhada", "Linguiça de porco", "grelhada"],
    // Nomes invertidos da TACO e qualificadores que pedem "de".
    ["Coco, água de", "Água de coco", null],
    ["Cana, caldo de", "Caldo de cana", null],
    ["Bolo, mistura para", "Mistura para bolo", null],
    ["Açaí, polpa, congelada", "Polpa de açaí", "congelada"],
    ["Laranja, baía, suco", "Suco de laranja baía", null],
    ["Tomate, molho industrializado", "Molho de tomate industrializado", null],
    ["Feijão, broto, cru", "Broto de feijão", "cru"],
    ["Mandioca, farofa, temperada", "Farofa de mandioca temperada", null],
    ["Café, pó, torrado", "Café em pó", "torrado"],
    ["Aveia, flocos, crua", "Aveia em flocos", "crua"],
    ["Cerveja, pilsen 2", "Cerveja pilsen", null],
    ["Soja, extrato solúvel, natural, fluido", "Leite de soja", null],
  ];
  for (const [name, label, prep] of cases)
    assert.deepEqual(friendlyName(name), { label, prep }, name);
});

test("todo alimento da TACO ganha um nome amigável sem vírgulas soltas", () => {
  for (const food of taco) {
    const { label, prep } = friendlyName(food.name);
    assert.ok(label.trim().length > 0, food.name);
    assert.doesNotMatch(label, /,\s*,|,$|^\s|\s$|\s(de|para)$/, food.name);
    if (prep !== null) assert.ok(prep.length > 0, food.name);
  }
});

test("busca parcial e sem acento agrupa os preparos e sugere o pronto antes do cru", () => {
  const { groups } = searchFoods(taco, "arroz integral");
  assert.equal(groups[0].label, "Arroz integral");
  assert.deepEqual(
    groups[0].variants.map((v) => v.name),
    ["Arroz, integral, cozido", "Arroz, integral, cru"],
  );
  assert.equal(groups[0].selected.name, "Arroz, integral, cozido");
  assert.equal(top("FEIJAO carioca").selected.name, "Feijão, carioca, cozido");
  assert.equal(top("cenoura").selected.name, "Cenoura, cozida");
  assert.equal(top("arroz").label, "Arroz branco (tipo 1)");
  assert.equal(top("banana").label, "Banana prata");
  // O ovo cozido não perde para o frito por causa do "/10minutos" da TACO.
  assert.equal(top("ovo").label, "Ovo inteiro");
  assert.equal(top("ovo").selected.name, "Ovo, de galinha, inteiro, cozido/10minutos");
});

test("o nome amigável também é pesquisável e ganha do nome cru da TACO", () => {
  assert.equal(top("arroz branco").label, "Arroz branco (tipo 1)");
  assert.equal(top("leite de soja").label, "Leite de soja");
  assert.match(top("coxa de frango").label, /^Coxa de frango/);
  assert.equal(top("batata frita").selected.name, "Batata, inglesa, frita");
  // Palavra exata vale mais que o mesmo radical ("prato" não é "prata").
  assert.equal(top("prato").label, "Queijo prato");
});

test("o nome completo da TACO e o preparo digitado escolhem a variação certa", () => {
  assert.equal(top("Arroz, integral, cozido").selected.name, "Arroz, integral, cozido");
  assert.equal(top("arroz integral cru").selected.name, "Arroz, integral, cru");
  // "cozido" encontra "cozida" e "fritas" encontra "frita".
  assert.equal(top("mandioca cozido").selected.name, "Mandioca, cozida");
  assert.equal(top("batata inglesa fritas").selected.name, "Batata, inglesa, frita");
});

test("sinônimos populares e plurais encontram o nome da TACO", () => {
  assert.equal(top("macaxeira").label, "Mandioca");
  assert.equal(top("aipim cozido").selected.name, "Mandioca, cozida");
  assert.match(top("bergamota").label, /^Tangerina/);
  assert.match(top("mussarela").label, /mozarela/);
  // A TACO grafa "mingnon"; o nome mostrado é o correto.
  assert.match(top("filé mignon").label, /^Filé-mignon/);
  assert.equal(top("ovos").label, "Ovo inteiro");
  assert.equal(top("feijoada").selected.id, "taco-540");
  assert.match(top("bolacha").label, /^Biscoito/);
  assert.equal(top("coca").label, "Refrigerante tipo cola");
  assert.match(top("strogonoff").label, /^Estrogonofe/);
  assert.match(top("bacon").label, /^Toucinho/);
  assert.equal(top("cafezinho").label, "Café coado");
  // "bife" traz cortes de bife (e o "Bife à cavalo" da TACO), nunca carne moída.
  const bife = searchFoods(taco, "bife").groups.slice(0, 4).map((g) => g.label);
  assert.ok(!bife.some((label) => /moída/.test(label)), bife.join(" | "));
  assert.ok(bife.some((label) => /^(Patinho|Picanha|Contra-filé|Maminha)/.test(label)));
  assert.equal(searchFoods(taco, "zzzz").groups.length, 0);
  assert.deepEqual(searchFoods(taco, "  "), { groups: [], total: 0, partial: false });
});

test("sem alimento com todas as palavras, mostra os que têm parte delas", () => {
  const result = searchFoods(taco, "cafe com leite");
  assert.equal(result.partial, true);
  assert.equal(result.groups[0].label, "Café coado");
  assert.equal(searchFoods(taco, "arroz integral").partial, false);
});

test("limite de grupos, total de resultados e reforço dos alimentos frequentes", () => {
  const carne = searchFoods(taco, "carne", { limit: 5 });
  assert.equal(carne.groups.length, 5);
  assert.ok(carne.total > 5);
  const boosted = searchFoods([...taco, mine], "pao", {
    boost: new Map([["mine", 3]]),
  });
  assert.equal(boosted.groups[0].selected.id, "mine");
});

test("destaca a parte digitada, sem acento e pelo sinônimo", () => {
  assert.deepEqual(highlightMatches("Feijão carioca", "feija"), [
    { text: "Feijã", match: true },
    { text: "o carioca", match: false },
  ]);
  assert.deepEqual(highlightMatches("Arroz integral", "arroz"), [
    { text: "Arroz", match: true },
    { text: " integral", match: false },
  ]);
  assert.deepEqual(highlightMatches("Mandioca", "macaxeira"), [
    { text: "Mandioca", match: true },
  ]);
  assert.deepEqual(highlightMatches("Mandioca, cozida", "cozido"), [
    { text: "Mandioca, ", match: false },
    { text: "cozida", match: true },
  ]);
  assert.deepEqual(highlightMatches("Pão", ""), [{ text: "Pão", match: false }]);
});

test("emoji pelo nome do alimento e, na falta, pela categoria", () => {
  const cases: [string, string][] = [
    ["Banana, prata, crua", "🍌"],
    ["Arroz, integral, cozido", "🍚"],
    ["Frango, peito, sem pele, grelhado", "🍗"],
    ["Pipoca, com óleo de soja, sem sal", "🌽"],
    ["Leite, de coco", "🥛"],
    ["Tucumã, cru", "🍎"],
    ["Corvina de água doce, crua", "🐟"],
    ["Caqui, chocolate, cru", "🍎"],
    ["Fruta-pão, crua", "🍎"],
    ["Polvilho, doce", "🌾"],
    ["Omelete, de queijo", "🥚"],
    ["Mexerica, Rio, crua", "🍊"],
    ["Azeitona, verde, conserva", "🫒"],
    ["Peru, congelado, assado", "🍗"],
    ["Maria mole, coco queimado", "🍬"],
    ["Bebida láctea, pêssego", "🥛"],
    ["Tapioca, com manteiga", "🫓"],
  ];
  for (const [name, emoji] of cases) assert.equal(foodEmoji(byName(name)), emoji, name);
  assert.equal(foodEmoji(mine), "🍞");
  assert.equal(foodEmoji({ ...mine, name: "Receita da vó" }), "🏷️");
});
