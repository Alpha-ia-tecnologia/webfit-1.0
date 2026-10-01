import { test } from "node:test";
import assert from "node:assert/strict";
import type { PlannedItem } from "../src/lib/agent-blocks";
import { mealTotals } from "../src/lib/domain";
import { defaultPortion } from "../src/lib/household-measures";
import type { MealTextItem } from "../src/lib/meal-text";
import {
  TACO_FOODS,
  isFaithfulMatch,
  linkMealTextItems,
  linkPhotoItems,
  macroEstimate,
  matchTaco,
  mealTextPortion,
  plannedPreset,
  plateGroups,
  plateLabel,
  resolvePlanned,
  statedPortion,
  tacoCandidates,
} from "../src/lib/taco-match";
import {
  DIET_PLAN_V2,
  MEAL_TEXT_DRAFT,
  MEAL_TEXT_SOURCE,
  PHOTO_DRAFT,
} from "./structured-fixtures";

const ALLERGY = "Amendoim";
const item = (alimento: string, gramas: number | null = 100): PlannedItem => ({
  alimento,
  medidaCaseira: "1 porção",
  gramas,
});
const resolve = (items: PlannedItem[], allergyDetails = ALLERGY) =>
  resolvePlanned(items, { allergyDetails });

test("matchTaco: nomes comuns encontram o alimento certo da TACO", () => {
  const expected: [string, string][] = [
    ["arroz branco cozido", "Arroz, tipo 1, cozido"],
    ["arroz cozido", "Arroz, tipo 1, cozido"],
    ["feijão carioca cozido", "Feijão, carioca, cozido"],
    ["frango grelhado", "Frango, peito, sem pele, grelhado"],
    ["alface", "Alface, crespa, crua"],
    ["banana prata", "Banana, prata, crua"],
    ["pão francês", "Pão, trigo, francês"],
    ["ovo cozido", "Ovo, de galinha, inteiro, cozido/10minutos"],
    ["iogurte natural", "Iogurte, natural"],
    ["tomate", "Tomate, com semente, cru"],
    ["paçoca de amendoim", "Paçoca, amendoim"],
    ["cuscuz", "Cuscuz, de milho, cozido com sal"],
    ["leite de soja", "Soja, extrato solúvel, natural, fluido"],
    ["suco de laranja", "Laranja, pêra, suco"],
  ];
  for (const [name, taco] of expected) assert.equal(matchTaco(name)?.name, taco, name);
});

test("matchTaco: na dúvida, nenhum alimento (nunca o alimento errado)", () => {
  for (const name of [
    // TACO não tem leite de vaca líquido: soja, pó e achocolatado não servem.
    "leite",
    "leite integral",
    "leite desnatado",
    "leite de vaca",
    // Alimento com ingrediente acrescentado, outro alimento ou forma diferente.
    "tapioca",
    "salada",
    "fruta",
    "legumes",
    "peixe grelhado",
    "atum",
    "castanha do pará",
    // Busca parcial.
    "café com leite",
    "macarrão cozido",
    "homus caseiro",
  ])
    assert.equal(matchTaco(name), null, name);
});

test("isFaithfulMatch: nome principal, forma e ingrediente acrescentado", () => {
  assert.equal(isFaithfulMatch("água de coco", "Coco, água de"), true);
  assert.equal(isFaithfulMatch("suco de laranja", "Laranja, pêra, suco"), true);
  assert.equal(isFaithfulMatch("leite", "Soja, extrato solúvel, natural, fluido"), false);
  assert.equal(isFaithfulMatch("legumes", "Seleta de legumes, enlatada"), false);
  assert.equal(isFaithfulMatch("castanha do pará", "Castanha-do-Brasil, crua"), false);
  assert.equal(isFaithfulMatch("leite integral", "Leite, de vaca, integral, pó"), false);
  assert.equal(isFaithfulMatch("leite integral em pó", "Leite, de vaca, integral, pó"), true);
  assert.equal(isFaithfulMatch("atum", "Atum, conserva em óleo"), false);
  assert.equal(isFaithfulMatch("tapioca", "Tapioca, com manteiga"), false);
  assert.equal(isFaithfulMatch("tapioca com manteiga", "Tapioca, com manteiga"), true);
  assert.equal(isFaithfulMatch("tomate", "Tomate, com semente, cru"), true);
  assert.equal(isFaithfulMatch("cuscuz", "Cuscuz, de milho, cozido com sal"), true);
  assert.equal(isFaithfulMatch("ovos", "Ovo, de galinha, inteiro, cozido/10minutos"), true);
});

test("matchTaco: resultado guardado por nome normalizado; lista própria não usa o cache", () => {
  const first = matchTaco("Arroz Cozido ");
  assert.ok(first);
  assert.equal(matchTaco("arroz cozido"), first);
  const custom = [{ ...first, id: "taco-x", name: "Arroz, tipo 1, cozido" }];
  assert.equal(matchTaco("arroz cozido", custom), custom[0]);
  assert.equal(matchTaco("arroz cozido"), first);
  assert.equal(TACO_FOODS.every((f) => f.id.startsWith("taco-")), true);
});

test("resolvePlanned: ok, sem correspondência e alergênico declarado", () => {
  const resolved = resolve([item("arroz cozido"), item("homus caseiro"), item("paçoca de amendoim")]);
  assert.deepEqual(
    resolved.map((r) => [r.status, r.food?.name ?? null]),
    [
      ["ok", "Arroz, tipo 1, cozido"],
      ["missing", null],
      ["allergen", "Paçoca, amendoim"],
    ],
  );
  // O nome da TACO também conta: "paçoca" sozinha é de amendoim.
  assert.equal(resolve([item("paçoca")])[0]!.status, "allergen");
  assert.equal(resolve([item("paçoca de amendoim")], "")[0]!.status, "ok");
  // Alergia declarada no plural acha o alimento no singular.
  assert.equal(resolve([item("ovo cozido")], "Ovos")[0]!.status, "allergen");
  assert.equal(resolve([item("camarão grelhado")], "camarões")[0]!.status, "allergen");
  assert.equal(resolve([item("arroz cozido")], "Ovos, camarões")[0]!.status, "ok");
});

test("macroEstimate: só com cobertura de 70% e gramas sugeridas", () => {
  const lunch = resolve(DIET_PLAN_V2.refeicoes[1]!.itens);
  const full = macroEstimate(lunch);
  assert.equal(full.coverage, 1);
  assert.ok(full.share);
  assert.equal(full.share.protein + full.share.carbs + full.share.fat, 100);
  const breakfast = macroEstimate(resolve(DIET_PLAN_V2.refeicoes[0]!.itens));
  assert.equal(breakfast.share, null);
  assert.equal(Math.round(breakfast.coverage * 100), 67);
  const noGrams = macroEstimate(
    resolve([item("arroz cozido"), item("feijão carioca cozido"), item("alface", null)]),
  );
  assert.equal(noGrams.share, null);
  assert.equal(macroEstimate([]).share, null);
});

test("plannedPreset: gramas sugeridas, porção padrão e as partes da nota", () => {
  const ok = plannedPreset("Jantar", resolve([item("frango grelhado"), item("alface", 30)]));
  assert.equal(ok.category, "Jantar");
  assert.deepEqual(
    ok.items.map((i) => [i.food.name, i.grams]),
    [
      ["Frango, peito, sem pele, grelhado", 100],
      ["Alface, crespa, crua", 30],
    ],
  );
  assert.equal(ok.note, "Itens sugeridos no prato. Confira as porções e toque em Salvar refeição.");
  const bread = matchTaco("pão francês")!;
  const fallback = plannedPreset("Café da manhã", resolve([item("pão francês", null)]));
  assert.equal(fallback.items[0]!.grams, defaultPortion(bread).grams);
  // O mesmo alimento sugerido duas vezes vira uma porção somada.
  const merged = plannedPreset("Almoço", resolve([item("arroz cozido"), item("arroz branco cozido", 50)]));
  assert.deepEqual(merged.items.map((i) => i.grams), [150]);
  const mixed = plannedPreset(
    "Lanche",
    resolve([item("banana prata"), item("homus caseiro"), item("café com leite"), item("paçoca de amendoim")]),
  );
  assert.equal(mixed.items.length, 1);
  assert.equal(
    mixed.note,
    "Itens sugeridos no prato. Confira as porções e toque em Salvar refeição. Não encontrados na TACO: homus caseiro, café com leite. Busque abaixo. Fora do prato por coincidir com alergia declarada: paçoca de amendoim.",
  );
  const none = plannedPreset("Lanche", resolve([item("homus caseiro"), item("paçoca de amendoim")]));
  assert.deepEqual(none.items, []);
  assert.equal(
    none.note,
    "Nenhum item sugerido foi encontrado na TACO. Busque os alimentos abaixo. Fora do prato por coincidir com alergia declarada: paçoca de amendoim.",
  );
  // O prato leva cópias: mexer na porção não altera a tabela.
  assert.notEqual(ok.items[0]!.food, matchTaco("frango grelhado"));
});

test("plateGroups e plateLabel: grupos do prato na ordem fixa", () => {
  const groups = plateGroups(resolve([item("arroz cozido"), item("feijão carioca cozido"), item("alface")]));
  assert.deepEqual(groups, ["vegetais", "proteinas", "cereais"]);
  assert.equal(plateLabel(groups), "Prato com verduras e frutas, proteínas e cereais e pães");
  assert.deepEqual(plateGroups(resolve([item("frango grelhado"), item("ovo cozido")])), ["proteinas"]);
  assert.equal(plateLabel(["proteinas"]), "Prato com proteínas");
  assert.equal(plateLabel(["vegetais", "cereais"]), "Prato com verduras e frutas e cereais e pães");
  // Itens sem correspondência ou alergênicos não entram.
  assert.deepEqual(plateGroups(resolve([item("homus caseiro"), item("paçoca de amendoim")])), []);
  assert.equal(plateLabel([]), "Prato");
});

test("linkPhotoItems: candidatos da TACO, alergia pelo nome e marcação padrão segura", () => {
  const linked = linkPhotoItems(PHOTO_DRAFT, ALLERGY);
  assert.deepEqual(
    linked.map((l) => [l.item.name, l.allergy, l.defaultChecked]),
    [
      ["Arroz branco", false, true],
      ["Feijão", false, true],
      ["Paçoca", true, false],
    ],
  );
  assert.equal(linked[0]!.candidates[0]!.name, "Arroz, tipo 1, cozido");
  // Sem alergia declarada, a confiança baixa ainda deixa a paçoca desmarcada.
  assert.deepEqual(
    linkPhotoItems(PHOTO_DRAFT, "").map((l) => l.defaultChecked),
    [true, true, false],
  );
  const many = linkPhotoItems(
    {
      items: [
        {
          name: "Arroz",
          searchTerms: ["arroz branco cozido", "arroz cozido", "arroz integral cozido"],
          confidence: "high",
          allergyMatch: false,
        },
        { name: "Molho", searchTerms: ["molho da casa"], confidence: "high", allergyMatch: false },
      ],
      uncertainties: [],
    },
    "",
  );
  const ids = many[0]!.candidates.map((c) => c.id);
  assert.ok(ids.length <= 3);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(many[1]!.candidates, []);
  assert.equal(many[1]!.defaultChecked, false);
  assert.deepEqual(
    tacoCandidates(["feijão carioca cozido"]).map((f) => f.name),
    ["Feijão, carioca, cozido"],
  );
});

const tacoFood = (id: string) => {
  const food = TACO_FOODS.find((f) => f.id === id);
  assert.ok(food, id);
  return food;
};

test("linkMealTextItems: candidatos, alergia, trecho dito conferido e porção pela medida caseira", () => {
  const linked = linkMealTextItems(MEAL_TEXT_DRAFT, MEAL_TEXT_SOURCE, ALLERGY);
  assert.deepEqual(
    linked.map((l) => l.candidates[0]?.id),
    ["taco-3", "taco-561", "taco-410", "taco-579"],
  );
  assert.deepEqual(
    linked.map((l) => [l.allergy, l.statedText, l.defaultChecked]),
    [
      [false, "4 colheres", true],
      [false, "duas conchas", true],
      [false, null, true],
      [true, "uma paçoca", false],
    ],
  );
  const portions = linked.map((l) => mealTextPortion(l, l.candidates[0]!));
  assert.deepEqual(portions, [
    { grams: 100, unit: "colher-sopa" },
    { grams: 200, unit: "concha" },
    null,
    // Paçoca não tem "unidade" nas medidas caseiras: entra com a porção padrão e "Falta porção".
    null,
  ]);
  // Alergia local sem a marca do modelo: o nome do candidato basta.
  const unmarked = { ...MEAL_TEXT_DRAFT, items: [{ ...MEAL_TEXT_DRAFT.items[3]!, allergyMatch: false }] };
  assert.equal(linkMealTextItems(unmarked, MEAL_TEXT_SOURCE, ALLERGY)[0]!.allergy, true);
  assert.equal(linkMealTextItems(unmarked, MEAL_TEXT_SOURCE, "")[0]!.defaultChecked, true);
});

test("statedPortion: gramas, ml como g e medida que o alimento não tem", () => {
  const chicken = tacoFood("taco-410");
  assert.deepEqual(statedPortion(chicken, { quantity: 150, unit: "g" }), { grams: 150, unit: "g" });
  assert.deepEqual(statedPortion(tacoFood("taco-215"), { quantity: 300, unit: "ml" }), {
    grams: 300,
    unit: "copo",
  });
  assert.equal(statedPortion(chicken, { quantity: 2, unit: "fatia" }), null);
  assert.equal(statedPortion(chicken, { quantity: null, unit: "g" }), null);
  assert.equal(statedPortion(chicken, { quantity: 2, unit: null }), null);
  assert.deepEqual(statedPortion(chicken, { quantity: 9000, unit: "g" }), { grams: 5000, unit: "g" });
});

test("linkMealTextItems: trecho que não está na descrição não vale como porção", () => {
  const [rice] = linkMealTextItems(
    { items: [MEAL_TEXT_DRAFT.items[0]!], uncertainties: [] },
    "arroz e feijão",
    "",
  );
  assert.ok(rice);
  assert.equal(rice.statedText, null);
  assert.equal(mealTextPortion(rice, tacoFood("taco-3")), null);
});

test("linkMealTextItems: quantidade ou unidade que não batem com o trecho dito viram 'Falta porção'", () => {
  const link = (
    source: string,
    quantityText: string,
    quantity: number,
    unit: MealTextItem["unit"],
    searchTerms: string[],
  ) =>
    linkMealTextItems(
      {
        items: [{ name: "Item", searchTerms, quantityText, quantity, unit, allergyMatch: false }],
        uncertainties: [],
      },
      source,
      "",
    )[0]!;
  const bread = link("comi 2 fatias de pão francês", "2 fatias", 900, "g", ["pão francês"]);
  assert.equal(bread.statedText, null);
  assert.equal(mealTextPortion(bread, bread.candidates[0]!), null);
  const inflated = link("comi 2 conchas de feijão", "2 conchas", 20, "concha", ["feijão carioca cozido"]);
  assert.equal(inflated.statedText, null);
  assert.equal(mealTextPortion(inflated, inflated.candidates[0]!), null);
  const beans = link("comi 2 conchas de feijão", "2 conchas", 2, "concha", ["feijão carioca cozido"]);
  assert.equal(beans.statedText, "2 conchas");
  assert.deepEqual(mealTextPortion(beans, beans.candidates[0]!), { grams: 200, unit: "concha" });
  const decimal = link("tomei 1,5 xícara de leite", "1,5 xícara", 1.5, "xicara", ["leite integral"]);
  assert.equal(decimal.statedText, "1,5 xícara");
});

test("macroEstimate: kcal e gramas só da TACO (gramas do plano), com ≈ quando algum item ficou de fora", () => {
  const rice = item("arroz branco cozido", 150);
  const beans = item("feijão carioca cozido", 80);
  const full = macroEstimate(resolve([rice, beans]));
  const foods = [matchTaco(rice.alimento)!, matchTaco(beans.alimento)!];
  const totals = mealTotals([
    { food: foods[0], grams: 150 },
    { food: foods[1], grams: 80 },
  ]);
  assert.equal(full.kcal, totals.calories);
  assert.deepEqual(full.grams, {
    protein: Math.round(totals.macros.protein),
    carbs: Math.round(totals.macros.carbs),
    fat: Math.round(totals.macros.fat),
  });
  assert.equal(full.protein, full.grams?.protein);
  assert.equal(full.isPartial, false);
  // 3 de 4 itens na TACO (75% ≥ 70%): números dos 3, marcados como parciais.
  const partial = macroEstimate(resolve([rice, beans, item("frango grelhado", 120), item("xyzzy desconhecido")]));
  assert.ok(partial.kcal !== null && partial.kcal > 0);
  assert.equal(partial.isPartial, true);
  // Abaixo da cobertura: nenhum número.
  const low = macroEstimate(resolve([rice, item("xyzzy desconhecido"), item("outra coisa rara")]));
  assert.deepEqual(
    { kcal: low.kcal, grams: low.grams, protein: low.protein, share: low.share },
    { kcal: null, grams: null, protein: null, share: null },
  );
  assert.equal(low.isPartial, true);
});
