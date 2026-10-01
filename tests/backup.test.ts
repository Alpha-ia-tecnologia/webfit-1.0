import test from "node:test";
import assert from "node:assert/strict";
import { parseBackup, prepareRestore } from "../src/lib/backup";
import { initialState, localDate } from "../src/lib/domain";
import { stateFixture } from "./fixtures";

test("backup antigo carrega defaults e recusa JSON inválido, versão incompatível e mistura de perfis", () => {
  const exported = stateFixture();
  const { savedMeals, ...legacy } = exported;
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).savedMeals, []);
  assert.throws(() => parseBackup("{"), /JSON/);
  assert.throws(
    () => parseBackup(JSON.stringify({ ...exported, version: 2 })),
    /incompatível/,
  );
  exported.diary.push({
    id: "water",
    userId: "another",
    date: localDate(),
    time: "10:00",
    createdAt: "now",
    updatedAt: "now",
    type: "agua",
    title: "Água",
    description: "",
    amountMl: 250,
  });
  assert.throws(
    () => parseBackup(JSON.stringify(exported)),
    /perfis diferentes/,
  );
  exported.diary[0].userId = exported.userId;
  exported.diary.push({ ...exported.diary[0] });
  assert.throws(() => parseBackup(JSON.stringify(exported)), /duplicados/);
});

test("restauração preserva conteúdo e identidade/revisão local sem reativar IA ou lembretes", () => {
  const backup = stateFixture();
  backup.profile!.consentAi = true;
  backup.profile!.remindersEnabled = true;
  backup.draft = { consentAi: true, remindersEnabled: true };
  backup.diary.push({
    id: "water",
    userId: backup.userId,
    date: localDate(),
    time: "10:00",
    createdAt: "now",
    updatedAt: "now",
    type: "agua",
    title: "Água",
    description: "",
    amountMl: 350,
  });
  backup.revision = 98;
  const original = JSON.stringify(backup);
  const current = { ...initialState(), revision: 4 };
  const restored = prepareRestore(parseBackup(original), current);
  assert.equal(restored.userId, current.userId);
  assert.equal(restored.revision, 4);
  assert.equal(restored.diary[0].userId, current.userId);
  assert.equal(restored.diary[0].amountMl, 350);
  assert.equal(restored.profile!.consentAi, false);
  assert.equal(restored.profile!.remindersEnabled, false);
  assert.equal(restored.draft!.consentAi, false);
  assert.ok(
    restored.goalHistory.every(
      (item) => !item.profile.consentAi && !item.profile.remindersEnabled,
    ),
  );
  assert.equal(JSON.stringify(backup), original);
});

test("despensa e receitas no backup: básicos tolerantes e receita estruturada inválida mantém o texto", () => {
  const { kitchenBasics, ...legacy } = stateFixture();
  assert.deepEqual(kitchenBasics, []);
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).kitchenBasics, []);

  const recipe = {
    id: "receita-1",
    text: "## Arroz com tomate\n1. Cozinhe o arroz.",
    meta: {
      specialists: ["nutricionista"],
      reviewed: true,
      revisions: 0,
      urgency: "nenhuma",
      notes: [],
      llmCalls: 2,
    },
    createdAt: "2026-09-20T12:00:00.000Z",
    dietPlanId: "dieta-1",
    profileSignature: "perfil",
    pantrySignature: "estoque",
  };
  const withRecipes = {
    ...legacy,
    kitchenBasics: ["sal", "gengibre"],
    recipes: [
      recipe,
      { ...recipe, id: "receita-2", recipeSet: { version: 3, receitas: "?" } },
    ],
  };
  const parsed = parseBackup(JSON.stringify(withRecipes));
  assert.deepEqual(parsed.kitchenBasics, ["sal"]);
  assert.equal(parsed.recipes.length, 2);
  assert.equal(parsed.recipes[0].recipeSet, undefined);
  assert.equal(parsed.recipes[1].recipeSet, undefined);
  assert.equal(parsed.recipes[1].text, recipe.text);

  const restored = prepareRestore(parsed, { ...initialState(), revision: 1 });
  assert.deepEqual(restored.kitchenBasics, ["sal"]);
  assert.equal(restored.recipes[1].text, recipe.text);
});

test("lista de compras no backup: antigo sem lista, itens tolerantes, ids repetidos e item guardado da lista", () => {
  const { shoppingList, ...legacy } = stateFixture();
  assert.deepEqual(shoppingList, []);
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).shoppingList, []);

  const item = {
    id: "compra-1",
    name: "Tomate",
    quantity: "2 unidades",
    section: "hortifruti",
    origin: "dieta",
    note: "Jantar",
    checked: true,
    addedAt: "2026-09-28T13:00:00.000Z",
  };
  const { checked, note, ...partial } = item;
  assert.equal(checked, true);
  assert.equal(note, "Jantar");
  const withList = {
    ...legacy,
    shoppingList: [
      item,
      { ...partial, id: "compra-2" },
      { ...item, id: "compra-3", section: "desconhecida", origin: "?" },
    ],
    pantry: [
      {
        id: "despensa-1",
        name: "Cebola",
        quantity: null,
        unit: "un",
        location: "geladeira",
        expiresOn: null,
        notes: "",
        source: "shopping_list",
        updatedAt: "2026-09-28T13:05:00.000Z",
      },
    ],
  };
  const parsed = parseBackup(JSON.stringify(withList));
  assert.equal(parsed.shoppingList.length, 3);
  assert.equal(parsed.shoppingList[1].checked, false);
  assert.equal(parsed.shoppingList[1].note, "");
  assert.equal(parsed.shoppingList[2].section, "outros");
  assert.equal(parsed.shoppingList[2].origin, "manual");
  assert.equal(parsed.pantry[0].source, "shopping_list");

  const restored = prepareRestore(parsed, { ...initialState(), revision: 1 });
  assert.deepEqual(restored.shoppingList, parsed.shoppingList);

  const duplicated = { ...withList, shoppingList: [item, { ...item, name: "Alface" }] };
  assert.throws(() => parseBackup(JSON.stringify(duplicated)), /duplicados/);
});

test("ocultar números do corpo: backup antigo carrega false e a restauração mantém a escolha", () => {
  const legacy = stateFixture();
  const { hideBodyNumbers: _hidden, ...profile } = legacy.profile!;
  const parsed = parseBackup(JSON.stringify({ ...legacy, profile }));
  assert.equal(parsed.profile!.hideBodyNumbers, false);
  const backup = stateFixture();
  backup.profile!.hideBodyNumbers = true;
  const restored = prepareRestore(parseBackup(JSON.stringify(backup)), initialState());
  assert.equal(restored.profile!.hideBodyNumbers, true);
});
