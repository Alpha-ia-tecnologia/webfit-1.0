import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/dates";
import { createDietPlan, dietProfileSignature } from "../src/lib/diet";
import { emptyPantryDraft, pantrySignature, savePantryDrafts } from "../src/lib/pantry";
import {
  addShoppingItems,
  dietShoppingSuggestions,
  manualShoppingItem,
  mergeSuggestions,
  recipeShoppingSuggestions,
  removeShoppingItems,
  restoreShoppingItems,
  sectionOf,
  SHOPPING_COPY,
  shoppingGroups,
  shoppingKey,
  shoppingName,
  shoppingShareText,
  shoppingSummary,
  storeCheckedDrafts,
  storeShoppingPurchase,
  toggleShoppingItem,
  type ShoppingPick,
  type ShoppingSuggestion,
} from "../src/lib/shopping-list";
import {
  recipeSetSchema,
  stateSchema,
  type AppState,
  type KitchenBasicKey,
  type PantryItem,
  type ShoppingItem,
} from "../src/types";
import { stateFixture } from "./fixtures";
import { DIET_PLAN_V2, DIET_REPLY, REPLY_META } from "./structured-fixtures";

const T = "2026-09-28";
const NOW = "2026-09-28T13:00:00.000Z";
const ctx = (over: Partial<Parameters<typeof dietShoppingSuggestions>[1]> = {}) => ({
  anchor: T,
  from: T,
  allergyDetails: "",
  pantry: [] as PantryItem[],
  basics: [] as KitchenBasicKey[],
  today: T,
  ...over,
});
const pantryItem = (name: string, expiresOn: string | null = null): PantryItem => ({
  id: `p-${name}`,
  name,
  quantity: 1,
  unit: "un",
  location: "despensa",
  expiresOn,
  notes: "",
  source: "manual",
  updatedAt: "2026-09-20T10:00:00.000Z",
});
const shopItem = (over: Partial<ShoppingItem> & Pick<ShoppingItem, "id" | "name">): ShoppingItem => ({
  quantity: null,
  section: "outros",
  origin: "manual",
  note: "",
  checked: false,
  addedAt: NOW,
  ...over,
});
const pick = (name: string): ShoppingPick => ({
  name,
  quantity: null,
  section: "outros",
  origin: "manual",
  note: "",
});
const ids = () => {
  let n = 0;
  return () => `s${++n}`;
};
const withList = (shoppingList: ShoppingItem[]): AppState => ({ ...stateFixture(), shoppingList });

/** Arroz e Tomate na despensa (sem validade), Sal marcado e uma geração de receitas atual. */
function recipeState(
  over: { basics?: KitchenBasicKey[]; missing?: string; recipeName?: string; extra?: string[] } = {},
) {
  const base = stateFixture();
  const profile = { ...base.profile!, consentAi: true };
  const withPantry = savePantryDrafts(
    { ...base, profile, dietPlan: createDietPlan(DIET_REPLY, profile) },
    [
      { ...emptyPantryDraft(), name: "Arroz" },
      { ...emptyPantryDraft("geladeira"), name: "Tomate" },
      ...(over.extra ?? []).map((name) => ({ ...emptyPantryDraft(), name })),
    ],
    "manual",
  );
  const s: AppState = { ...withPantry, kitchenBasics: over.basics ?? ["sal"] };
  const set = recipeSetSchema.parse({
    version: 2,
    receitas: [
      {
        nome: over.recipeName ?? "Arroz com tomate",
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade: "Arroz e legumes, como no almoço da sua dieta.",
        ingredientesCasa: s.pantry.map((item, i) => ({
          pantryItemId: item.id,
          nome: item.name,
          quantidade: i === 0 ? "1 xícara" : "2 unidades",
        })),
        basicos: [{ basico: "sal", quantidade: "a gosto" }],
        faltaComprar: [{ nome: over.missing ?? "Cebola", quantidade: "1 unidade" }],
        passos: [{ texto: "Refogue o tomate e junte o arroz.", timerMin: 25, temperaturaC: null }],
        porcao: "Sirva 1 porção.",
      },
    ],
    perguntas: [],
  });
  return {
    ...s,
    recipes: [
      {
        id: "receita-1",
        text: "## Arroz com tomate",
        meta: REPLY_META,
        createdAt: "2026-09-28T12:00:00.000Z",
        dietPlanId: s.dietPlan!.id,
        profileSignature: dietProfileSignature(s.profile!),
        pantrySignature: pantrySignature(s.pantry, s.kitchenBasics),
        recipeSet: set,
      },
    ],
  };
}

test("nome e chave da lista: sem palavras de preparo, maiúscula inicial, sem acento na chave", () => {
  assert.equal(shoppingName("ovo cozido"), "Ovo");
  assert.equal(shoppingName("arroz branco cozido"), "Arroz branco");
  assert.equal(shoppingName("homus caseiro"), "Homus");
  assert.equal(shoppingName("iogurte natural"), "Iogurte natural");
  assert.equal(shoppingName("cozido"), "Cozido");
  assert.equal(shoppingName("  cenoura   ralada crua "), "Cenoura");
  assert.equal(shoppingKey("Feijão  Carioca cozido"), "feijao carioca");
  assert.equal(shoppingKey("Pimenta-do-reino"), "pimenta do reino");
});

test("seção do mercado pela TACO e, sem ela, por palavras do nome", () => {
  const cases: [string, string][] = [
    ["pão francês", "padaria"],
    ["arroz branco cozido", "mercearia"],
    ["batata cozida", "hortifruti"],
    ["frango grelhado", "acougue"],
    ["ovo cozido", "acougue"],
    ["iogurte natural", "laticinios"],
    ["café com leite", "laticinios"],
    ["água de coco", "bebidas"],
    ["homus caseiro", "outros"],
    ["Sabão em pó", "outros"],
    ["Cebola", "hortifruti"],
    ["Cebola roxa", "hortifruti"],
  ];
  for (const [name, section] of cases) assert.equal(sectionOf(name), section, name);
});

test("sugestões do plano: 7 dias com a rotação das trocas, contagem por refeição e ordem do mercado", () => {
  const list = dietShoppingSuggestions(DIET_PLAN_V2, ctx());
  assert.deepEqual(
    list.map((s) => s.name),
    [
      "Alface",
      "Banana prata",
      "Batata",
      "Tomate",
      "Frango",
      "Ovo",
      "Café com leite",
      "Iogurte natural",
      "Pão francês",
      "Arroz branco",
      "Arroz integral",
      "Feijão carioca",
      "Lentilha",
      "Homus",
    ],
  );
  const by = (name: string) => list.find((s) => s.name === name)!;
  assert.equal(by("Arroz branco").quantity, "3 refeições na semana");
  assert.equal(by("Arroz integral").quantity, "2 refeições na semana");
  assert.equal(by("Batata").quantity, "2 refeições na semana");
  assert.equal(by("Feijão carioca").quantity, "4 refeições na semana");
  assert.equal(by("Lentilha").quantity, "3 refeições na semana");
  for (const name of ["Alface", "Banana prata", "Tomate", "Frango", "Ovo", "Café com leite", "Iogurte natural", "Pão francês", "Homus"])
    assert.equal(by(name).quantity, "7 refeições na semana", name);
  assert.equal(by("Pão francês").note, "Café da manhã");
  assert.equal(by("Batata").note, "Almoço");
  assert.equal(by("Tomate").note, "Jantar");
  assert.equal(by("Batata").section, "hortifruti");
  assert.equal(by("Homus").section, "outros");
  assert.ok(list.every((s) => s.origin === "dieta" && s.defaultChecked && !s.inPantry));
  assert.equal(by("Feijão carioca").key, "feijao carioca");
});

test("sugestões do plano: o que há na despensa vem desmarcado; vencido não conta", () => {
  const list = dietShoppingSuggestions(DIET_PLAN_V2, ctx({ pantry: [pantryItem("Tomate"), pantryItem("Arroz")] }));
  for (const name of ["Tomate", "Arroz branco", "Arroz integral"]) {
    const s = list.find((i) => i.name === name)!;
    assert.equal(s.inPantry, true, name);
    assert.equal(s.defaultChecked, false, name);
  }
  assert.equal(list.find((i) => i.name === "Alface")!.inPantry, false);
  const expired = dietShoppingSuggestions(
    DIET_PLAN_V2,
    ctx({ pantry: [pantryItem("Tomate", shiftDate(T, -1))] }),
  );
  assert.equal(expired.find((i) => i.name === "Tomate")!.inPantry, false);
});

test("sugestões do plano: sem alergênico declarado e sem básico marcado", () => {
  const list = dietShoppingSuggestions(DIET_PLAN_V2, ctx({ allergyDetails: "Tenho alergia a lentilha" }));
  assert.equal(list.some((s) => s.name === "Lentilha"), false);
  assert.equal(list.find((s) => s.name === "Feijão carioca")!.quantity, "7 refeições na semana");
  const chicken = dietShoppingSuggestions(DIET_PLAN_V2, ctx({ allergyDetails: "Alergia a frango" }));
  assert.equal(chicken.some((s) => s.name === "Frango"), false);
  const plan = {
    ...DIET_PLAN_V2,
    refeicoes: [{ slot: "jantar" as const, horario: "19:30", itens: [{ alimento: "cebola", medidaCaseira: "1/2 unidade", gramas: 30, trocas: [] }] }],
  };
  assert.deepEqual(dietShoppingSuggestions(plan, ctx({ basics: ["cebola"] })), []);
});

test("sugestões das receitas: só a geração atual, 'Falta comprar', sem básico marcado e com calorias ocultas", () => {
  assert.deepEqual(recipeShoppingSuggestions(recipeState(), T, false), [
    {
      key: "cebola",
      name: "Cebola",
      quantity: "1 unidade",
      section: "hortifruti",
      origin: "receita",
      note: "Receita: Arroz com tomate",
      inPantry: false,
      defaultChecked: true,
    },
  ]);
  assert.deepEqual(recipeShoppingSuggestions(recipeState({ basics: ["sal", "cebola"] }), T, false), []);
  const changed = recipeState();
  const stale = { ...changed, pantry: [...changed.pantry, pantryItem("Queijo")] };
  assert.deepEqual(recipeShoppingSuggestions(stale, T, false), []);
  assert.deepEqual(recipeShoppingSuggestions({ ...changed, recipes: [] }, T, false), []);

  const hidden = recipeShoppingSuggestions(
    recipeState({ missing: "Cebola 40 kcal", recipeName: "Arroz 300 kcal com tomate" }),
    T,
    true,
  );
  assert.equal(hidden[0]!.name, "Cebola calorias ocultas");
  assert.equal(hidden[0]!.note, "Receita: Arroz calorias ocultas com tomate");
  assert.doesNotMatch(JSON.stringify(hidden), /kcal/i);
  const inStock = recipeShoppingSuggestions(recipeState({ missing: "Tomate" }), T, false);
  assert.equal(inStock[0]!.inPantry, true);
  assert.equal(inStock[0]!.defaultChecked, false);
});

test("chave com calorias mascaradas: despensa, receita e lista casam com ou sem calorias ocultas", () => {
  assert.equal(shoppingKey("Cebola 40 kcal"), shoppingKey("Cebola calorias ocultas"));
  const state = recipeState({ missing: "Cebola 40 kcal", extra: ["Cebola 40 kcal"] });
  for (const hide of [true, false]) {
    const [cebola] = recipeShoppingSuggestions(state, T, hide);
    assert.equal(cebola!.inPantry, true, `hide=${hide}`);
    assert.equal(cebola!.defaultChecked, false, `hide=${hide}`);
  }
  const listed = [shopItem({ id: "s1", name: "Cebola calorias ocultas" })];
  const fresh = recipeShoppingSuggestions(recipeState({ missing: "Cebola 40 kcal" }), T, false);
  assert.equal(fresh.length, 1);
  assert.deepEqual(mergeSuggestions(listed, [fresh]), []);
});

test("juntar sugestões: dieta + receita viram uma, com a quantidade da receita; o que já está na lista sai", () => {
  const diet: ShoppingSuggestion = {
    key: "tomate",
    name: "Tomate",
    quantity: "7 refeições na semana",
    section: "hortifruti",
    origin: "dieta",
    note: "Jantar",
    inPantry: false,
    defaultChecked: true,
  };
  const recipe: ShoppingSuggestion = { ...diet, quantity: "2 unidades", origin: "receita", note: "Receita: Salada" };
  const merged = mergeSuggestions([], [[diet], [recipe]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.quantity, "2 unidades");
  assert.equal(merged[0]!.note, "Jantar · Receita: Salada");
  assert.equal(merged[0]!.origin, "receita");
  assert.deepEqual(mergeSuggestions([shopItem({ id: "s1", name: "tomate" })], [[diet], [recipe]]), []);
  const long = { ...recipe, note: `Receita: ${"x".repeat(70)}` };
  assert.ok(mergeSuggestions([], [[diet], [long]])[0]!.note.length <= 80);
});

test("adicionar itens: validados, desmarcados, limite de 200 e item manual", () => {
  const state = withList([]);
  const before = JSON.stringify(state);
  const next = addShoppingItems(state, [pick("Tomate"), pick("Alface")], NOW, ids());
  assert.deepEqual(next.shoppingList.map((i) => [i.id, i.name, i.checked]), [
    ["s1", "Tomate", false],
    ["s2", "Alface", false],
  ]);
  assert.equal(next.shoppingList[0]!.addedAt, NOW);
  assert.ok(Date.parse(next.shoppingList[1]!.addedAt) > Date.parse(NOW));
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(next))).shoppingList, next.shoppingList);

  const full = addShoppingItems(state, Array.from({ length: 199 }, (_, i) => pick(`Item ${i}`)), NOW, ids());
  assert.throws(() => addShoppingItems(full, [pick("A"), pick("B")], NOW, ids()), {
    message: SHOPPING_COPY.limit,
  });
  assert.equal(full.shoppingList.length, 199);

  assert.deepEqual(manualShoppingItem("  Sabão em pó "), {
    name: "Sabão em pó",
    quantity: null,
    section: "outros",
    origin: "manual",
    note: "",
  });
  assert.throws(() => manualShoppingItem("   "), { message: "Escreva o nome do item." });
  assert.equal(manualShoppingItem("x".repeat(200)).name.length, 120);
});

test("marcar, remover e desfazer sem mutação, na ordem de inclusão", () => {
  const state = addShoppingItems(withList([]), [pick("Tomate"), pick("Alface"), pick("Arroz")], NOW, ids());
  const before = JSON.stringify(state);
  const toggled = toggleShoppingItem(state, "s2");
  assert.equal(toggled.shoppingList[1]!.checked, true);
  assert.equal(toggleShoppingItem(toggled, "s2").shoppingList[1]!.checked, false);
  assert.equal(toggleShoppingItem(state, "nada"), state);

  const removed = removeShoppingItems(state, ["s1", "s3"]);
  assert.deepEqual(removed.shoppingList.map((i) => i.id), ["s2"]);
  const restored = restoreShoppingItems(removed, state.shoppingList.filter((i) => i.id !== "s2"));
  assert.deepEqual(restored.shoppingList, state.shoppingList);
  assert.equal(restoreShoppingItems(state, state.shoppingList), state);
  assert.equal(JSON.stringify(state), before);
});

test("grupos por seção, resumo e texto para compartilhar", () => {
  const list = [
    shopItem({ id: "a", name: "Arroz branco", section: "mercearia", quantity: "3 refeições na semana", addedAt: "2026-09-28T13:00:00.001Z" }),
    shopItem({ id: "t", name: "Tomate", section: "hortifruti", checked: true, addedAt: "2026-09-28T13:00:00.002Z" }),
    shopItem({ id: "l", name: "Alface", section: "hortifruti", addedAt: "2026-09-28T13:00:00.003Z" }),
  ];
  const groups = shoppingGroups(list);
  assert.deepEqual(
    groups.map((g) => [g.section, g.label, g.items.map((i) => i.name)]),
    [
      ["hortifruti", "Hortifrúti", ["Alface", "Tomate"]],
      ["mercearia", "Mercearia", ["Arroz branco"]],
    ],
  );
  assert.deepEqual(shoppingSummary(list), { total: 3, checked: 1, text: "1 de 3 comprados" });
  assert.deepEqual(shoppingSummary([]), { total: 0, checked: 0, text: "Lista vazia" });

  assert.equal(
    shoppingShareText(list, false),
    "Lista de compras\n\nHortifrúti\n- Alface\n\nMercearia\n- Arroz branco (3 refeições na semana)",
  );
  assert.equal(shoppingShareText(list.map((i) => ({ ...i, checked: true })), false), null);
  const hidden = shoppingShareText([shopItem({ id: "b", name: "Barra 90 kcal" })], true);
  assert.equal(hidden, "Lista de compras\n\nOutros\n- Barra calorias ocultas");
  assert.equal(SHOPPING_COPY.added(3), "3 itens na lista de compras.");
  assert.equal(SHOPPING_COPY.add(1), "Adicionar 1 item");
  assert.equal(SHOPPING_COPY.removedChecked(2), "2 comprados removidos da lista.");
});

test("guardar comprados: rascunhos da despensa pela seção, quantidade lida quando dá", () => {
  const list = [
    shopItem({ id: "t", name: "Tomate", checked: true, quantity: "2 unidades", section: "hortifruti" }),
    shopItem({ id: "a", name: "Arroz branco", checked: true, quantity: "3 refeições na semana", section: "mercearia" }),
    shopItem({ id: "l", name: "Alface", section: "hortifruti" }),
  ];
  assert.deepEqual(storeCheckedDrafts(list), {
    drafts: [
      { name: "Tomate", quantity: 2, unit: "un", location: "geladeira", expiresOn: null, notes: "" },
      { name: "Arroz branco", quantity: null, unit: "un", location: "despensa", expiresOn: null, notes: "" },
    ],
    ids: ["t", "a"],
  });
  const many = Array.from({ length: 61 }, (_, i) => shopItem({ id: `m${i}`, name: `Item ${i}`, checked: true }));
  assert.equal(storeCheckedDrafts(many).drafts.length, 60);
  assert.equal(storeCheckedDrafts(many).ids.length, 60);
});

test("guardar na despensa e tirar da lista numa só troca; limite de 500 mantém o estado", () => {
  const list = [
    shopItem({ id: "t", name: "Tomate", checked: true, quantity: "2 unidades", section: "hortifruti" }),
    shopItem({ id: "a", name: "Arroz branco", checked: true, section: "mercearia" }),
    shopItem({ id: "l", name: "Alface", section: "hortifruti" }),
  ];
  const state = { ...withList(list), pantry: [] };
  const { drafts, ids: checked } = storeCheckedDrafts(list);
  const saved = storeShoppingPurchase(state, drafts, checked);
  assert.equal(saved.pantry.length, 2);
  assert.ok(saved.pantry.every((i) => i.source === "shopping_list"));
  assert.deepEqual(saved.shoppingList.map((i) => i.name), ["Alface"]);
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(saved))).pantry, saved.pantry);

  const crowded = { ...state, pantry: Array.from({ length: 499 }, (_, i) => pantryItem(`Item ${i}`)) };
  const before = JSON.stringify(crowded);
  assert.throws(() => storeShoppingPurchase(crowded, drafts, checked), /Limite de 500 itens/);
  assert.equal(JSON.stringify(crowded), before);
});
