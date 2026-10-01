import { test } from "node:test";
import assert from "node:assert/strict";
import { stateFixture } from "./fixtures";
import { localDate, shiftDate } from "../src/lib/domain";
import {
  KITCHEN_BASICS,
  KITCHEN_BASICS_HELP,
  KITCHEN_BASICS_NONE_HINT,
  kitchenBasic,
  kitchenBasicsLegend,
  toggleKitchenBasic,
} from "../src/lib/kitchen-basics";
import { availablePantry, pantrySignature } from "../src/lib/pantry";
import {
  KITCHEN_BASIC_KEYS,
  stateSchema,
  type AppState,
  type KitchenBasicKey,
  type PantryItem,
} from "../src/types";

const item = (id: string, name: string, extra: Partial<PantryItem> = {}): PantryItem => ({
  id,
  name,
  quantity: 1,
  unit: "un",
  location: "despensa",
  expiresOn: null,
  notes: "",
  source: "manual",
  updatedAt: "2026-09-20T12:00:00.000Z",
  ...extra,
});

/** Cópia literal da assinatura anterior ao Lote 7 (sem básicos). */
function legacySignature(items: PantryItem[]): string {
  const value = JSON.stringify(
    availablePantry(items)
      .map(({ id, name, quantity, unit, location, expiresOn, notes }) => ({
        id,
        name,
        quantity,
        unit,
        location,
        expiresOn,
        notes,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

test("básicos: 12 entradas na ordem canônica, com rótulo e emoji únicos", () => {
  assert.deepEqual(
    KITCHEN_BASICS.map((b) => b.key),
    [...KITCHEN_BASIC_KEYS],
  );
  assert.equal(KITCHEN_BASICS.length, 12);
  for (const field of ["label", "emoji"] as const) {
    const values = KITCHEN_BASICS.map((b) => b[field]);
    assert.ok(values.every((v) => v.trim().length > 0), field);
    assert.equal(new Set(values).size, values.length, field);
  }
  assert.equal(kitchenBasic("pimenta").label, "Pimenta-do-reino");
  assert.equal(kitchenBasic("cheiro_verde").emoji, "🌱");
  assert.match(KITCHEN_BASICS_HELP, /não contam como alimentos da despensa/);
  assert.match(KITCHEN_BASICS_NONE_HINT, /“Falta comprar”/);
});

test("básicos: alternar liga e desliga sem mutar o estado e mantém a ordem canônica", () => {
  const base = stateFixture();
  const frozen: AppState = Object.freeze({
    ...base,
    kitchenBasics: Object.freeze([]) as unknown as KitchenBasicKey[],
  });
  const withAlho = toggleKitchenBasic(frozen, "alho");
  assert.deepEqual(withAlho.kitchenBasics, ["alho"]);
  assert.deepEqual(frozen.kitchenBasics, []);
  const withSal = toggleKitchenBasic(withAlho, "sal");
  assert.deepEqual(withSal.kitchenBasics, ["sal", "alho"]);
  assert.deepEqual(withAlho.kitchenBasics, ["alho"]);
  assert.deepEqual(toggleKitchenBasic(withSal, "alho").kitchenBasics, ["sal"]);
  assert.deepEqual(toggleKitchenBasic(toggleKitchenBasic(withSal, "sal"), "sal").kitchenBasics, [
    "sal",
    "alho",
  ]);
  assert.equal(withSal.pantry, base.pantry);
});

test("básicos no estado: ausente vira [], duplicados e chaves desconhecidas saem", () => {
  const { kitchenBasics, ...legacy } = stateFixture();
  assert.deepEqual(kitchenBasics, []);
  assert.deepEqual(stateSchema.parse(legacy).kitchenBasics, []);
  const parse = (value: unknown) => stateSchema.parse({ ...legacy, kitchenBasics: value }).kitchenBasics;
  assert.deepEqual(parse(["alho", "sal", "alho"]), ["sal", "alho"]);
  assert.deepEqual(parse(["sal", "gengibre"]), ["sal"]);
  assert.deepEqual(parse("x"), []);
  assert.deepEqual(parse([1, "sal"]), []);
});

test("assinatura do estoque: sem básicos é idêntica à anterior; com básicos muda e ignora a ordem", () => {
  const today = localDate();
  const items = [
    item("b", "Tomate", { expiresOn: shiftDate(today, 2), location: "geladeira" }),
    item("a", "Arroz", { quantity: 1.5, unit: "kg" }),
    item("c", "Leite", { expiresOn: shiftDate(today, -1) }),
  ];
  const legacy = legacySignature(items);
  assert.equal(pantrySignature(items), legacy);
  assert.equal(pantrySignature(items, []), legacy);
  const withBasics = pantrySignature(items, ["sal", "azeite"]);
  assert.notEqual(withBasics, legacy);
  assert.equal(pantrySignature(items, ["azeite", "sal"]), withBasics);
  assert.notEqual(pantrySignature(items, ["sal"]), withBasics);
  assert.equal(pantrySignature([]), legacySignature([]));
});

test("legenda dos básicos para os prompts usa chave=rótulo", () => {
  const legend = kitchenBasicsLegend();
  assert.match(legend, /^sal=Sal, azeite=Azeite, /);
  assert.ok(legend.includes("cheiro_verde=Cheiro-verde"));
  assert.equal(legend.split(", ").length, 12);
});
