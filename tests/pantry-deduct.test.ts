import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/dates";
import {
  applyDeduction,
  canDecreaseRow,
  convertAmount,
  deductChoices,
  deductDetail,
  deductRows,
  deductSummary,
  parseAmount,
  setDeductChoice,
  stepDeductRow,
  undoDeduction,
  type DeductRow,
} from "../src/lib/pantry-deduct";
import type { AppState, PantryItem, RecipeCard } from "../src/types";
import { stateFixture } from "./fixtures";

const T = "2026-09-28";
const N = "2026-09-28T15:00:00.000Z";
const pantryItem = (over: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  quantity: 1,
  unit: "un",
  location: "despensa",
  expiresOn: null,
  notes: "",
  source: "manual",
  updatedAt: "2026-09-20T10:00:00.000Z",
  ...over,
});
const ARROZ = pantryItem({ id: "p-arroz", name: "Arroz", quantity: 1, unit: "kg" });
const TOMATE = pantryItem({ id: "p-tomate", name: "Tomate", quantity: 3, expiresOn: shiftDate(T, 2), location: "geladeira" });
const LEITE = pantryItem({ id: "p-leite", name: "Leite", quantity: 1, unit: "l", expiresOn: shiftDate(T, -1) });
const QUEIJO = pantryItem({ id: "p-queijo", name: "Queijo", quantity: null, unit: "g", location: "geladeira" });
const PANTRY = [ARROZ, TOMATE, LEITE, QUEIJO];
const recipe = (amounts: Record<string, string | null> = {}): RecipeCard => ({
  nome: "Arroz com tomate",
  refeicao: "Almoço",
  porcoes: 2,
  tempoMin: 30,
  compatibilidade: "Combina com o almoço do seu plano.",
  ingredientesCasa: [
    { pantryItemId: "p-arroz", nome: "Arroz", quantidade: amounts.arroz ?? "1 xícara" },
    { pantryItemId: "p-tomate", nome: "Tomate", quantidade: amounts.tomate ?? "2 unidades" },
    { pantryItemId: "p-leite", nome: "Leite", quantidade: "200 ml" },
    { pantryItemId: "p-queijo", nome: "Queijo", quantidade: "50 g" },
    { pantryItemId: "p-x", nome: "Sumiu", quantidade: "1 unidade" },
  ],
  basicos: [],
  faltaComprar: [],
  passos: [{ texto: "Cozinhe o arroz com o tomate.", timerMin: 25, temperaturaC: null }],
  porcao: "",
});
const withPantry = (pantry: PantryItem[]): AppState => ({ ...stateFixture(), pantry });
const row = (rows: readonly DeductRow[], id: string) => rows.find((r) => r.itemId === id)!;

test("quantidade da receita: número e unidade seguros; medida caseira ou texto livre ficam de fora", () => {
  assert.deepEqual(parseAmount("200 g"), { value: 200, unit: "g" });
  assert.deepEqual(parseAmount("200g"), { value: 200, unit: "g" });
  assert.deepEqual(parseAmount("1,5 kg"), { value: 1.5, unit: "kg" });
  assert.deepEqual(parseAmount("1/2 kg"), { value: 0.5, unit: "kg" });
  assert.deepEqual(parseAmount("½ kg"), { value: 0.5, unit: "kg" });
  assert.deepEqual(parseAmount("1 ½ kg"), { value: 1.5, unit: "kg" });
  assert.deepEqual(parseAmount("500ml"), { value: 500, unit: "ml" });
  assert.deepEqual(parseAmount("1 litro"), { value: 1, unit: "l" });
  assert.deepEqual(parseAmount("2 litros"), { value: 2, unit: "l" });
  assert.deepEqual(parseAmount("1 L"), { value: 1, unit: "l" });
  assert.deepEqual(parseAmount("2 unidades"), { value: 2, unit: "un" });
  assert.deepEqual(parseAmount("1 unidade"), { value: 1, unit: "un" });
  assert.deepEqual(parseAmount("3 un"), { value: 3, unit: "un" });
  assert.deepEqual(parseAmount("2"), { value: 2, unit: "un" });
  assert.deepEqual(parseAmount("1 pacote"), { value: 1, unit: "pacote" });
  assert.deepEqual(parseAmount("2 pacotes"), { value: 2, unit: "pacote" });
  assert.deepEqual(parseAmount("1.500 g"), { value: 1500, unit: "g" });
  for (const text of ["1 xícara", "a gosto", "3 refeições na semana", "", "   ", "0 g", "1/0 kg", "2 colheres de sopa"])
    assert.equal(parseAmount(text), null, text);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
});

test("conversão só na mesma família de unidade", () => {
  assert.equal(convertAmount({ value: 200, unit: "g" }, "kg"), 0.2);
  assert.equal(convertAmount({ value: 1.5, unit: "kg" }, "g"), 1500);
  assert.equal(convertAmount({ value: 500, unit: "ml" }, "l"), 0.5);
  assert.equal(convertAmount({ value: 0.25, unit: "l" }, "ml"), 250);
  assert.equal(convertAmount({ value: 2, unit: "un" }, "g"), null);
  assert.equal(convertAmount({ value: 1, unit: "pacote" }, "pacote"), 1);
  assert.equal(convertAmount({ value: 1, unit: "pacote" }, "un"), null);
});

test("linhas do desconto: itens da casa ainda disponíveis, na ordem da receita, com pré-seleção segura", () => {
  const rows = deductRows(recipe(), PANTRY, T);
  assert.deepEqual(rows, [
    { itemId: "p-arroz", name: "Arroz", unit: "kg", current: 1, used: "1 xícara", choice: "keep", remaining: 1 },
    { itemId: "p-tomate", name: "Tomate", unit: "un", current: 3, used: "2 unidades", choice: "left", remaining: 1 },
    { itemId: "p-queijo", name: "Queijo", unit: "g", current: null, used: "50 g", choice: "keep", remaining: null },
  ]);
  const gone = deductRows(recipe({ tomate: "3 unidades", arroz: "200 g" }), PANTRY, T);
  assert.equal(row(gone, "p-tomate").choice, "gone");
  assert.equal(row(gone, "p-tomate").remaining, null);
  assert.equal(row(gone, "p-arroz").choice, "left");
  assert.equal(row(gone, "p-arroz").remaining, 0.8);
  assert.deepEqual(deductChoices(row(rows, "p-queijo")), ["keep", "gone"]);
  assert.deepEqual(deductChoices(row(rows, "p-tomate")), ["keep", "left", "gone"]);
});

test("aplicar o desconto: 'Sobrou' atualiza, 'Acabou' remove, 'Não mexer' mantém o mesmo objeto", () => {
  const state = withPantry(PANTRY);
  const before = JSON.stringify(state);
  const rows = deductRows(recipe(), PANTRY, T).map((r) =>
    r.itemId === "p-queijo" ? setDeductChoice(r, "gone") : r,
  );
  const result = applyDeduction(state, rows, N);
  const tomato = result.state.pantry.find((i) => i.id === "p-tomate")!;
  assert.equal(tomato.quantity, 1);
  assert.equal(tomato.updatedAt, N);
  assert.equal(result.state.pantry.some((i) => i.id === "p-queijo"), false);
  assert.equal(result.state.pantry.find((i) => i.id === "p-arroz"), ARROZ);
  assert.equal(result.state.pantry.find((i) => i.id === "p-leite"), LEITE);
  assert.deepEqual(result.before, [TOMATE, QUEIJO]);
  assert.equal(JSON.stringify(state), before);

  const nothing = applyDeduction(state, rows.map((r) => setDeductChoice(r, "keep")), N);
  assert.equal(nothing.state, state);
  assert.deepEqual(nothing.before, []);
});

test("desfazer repõe exatamente os itens alterados e mantém o que entrou depois", () => {
  const state = withPantry(PANTRY);
  const rows = deductRows(recipe(), PANTRY, T).map((r) =>
    r.itemId === "p-queijo" ? setDeductChoice(r, "gone") : r,
  );
  const { state: deducted, before } = applyDeduction(state, rows, N);
  const added = pantryItem({ id: "p-novo", name: "Cebola" });
  const later = { ...deducted, pantry: [...deducted.pantry, added] };
  const undone = undoDeduction(later, before);
  assert.equal(undone.pantry.find((i) => i.id === "p-tomate")!.quantity, 3);
  assert.deepEqual(undone.pantry.find((i) => i.id === "p-queijo"), QUEIJO);
  assert.ok(undone.pantry.some((i) => i.id === "p-novo"));
  assert.equal(undone.pantry.length, 5);
  assert.equal(undoDeduction(later, []), later);
  const full = withPantry(Array.from({ length: 500 }, (_, i) => pantryItem({ id: `i${i}`, name: `Item ${i}` })));
  assert.throws(() => undoDeduction(full, [QUEIJO]), /Limite de 500 itens/);
});

test("'Sobrou': passo da unidade, nunca chega a zero; trocar para 'Sobrou' parte do que há", () => {
  const rows = deductRows(recipe({ arroz: "200 g" }), PANTRY, T);
  const tomato = row(rows, "p-tomate");
  assert.equal(stepDeductRow(tomato, -1).remaining, 1);
  assert.equal(canDecreaseRow(tomato), false);
  assert.equal(stepDeductRow(tomato, 1).remaining, 2);
  const rice = row(rows, "p-arroz");
  assert.equal(stepDeductRow(rice, 1).remaining, 1.3);
  assert.equal(stepDeductRow(rice, -1).remaining, 0.3);
  assert.equal(stepDeductRow(stepDeductRow(rice, -1), -1).remaining, 0.3);

  const kept = setDeductChoice(tomato, "keep");
  assert.equal(setDeductChoice(kept, "left").remaining, 1);
  const keepRow = row(deductRows(recipe(), PANTRY, T), "p-arroz");
  assert.equal(setDeductChoice(keepRow, "left").remaining, keepRow.current);
  const goneRow = row(deductRows(recipe({ tomate: "3 unidades" }), PANTRY, T), "p-tomate");
  assert.equal(setDeductChoice(goneRow, "left").remaining, 3);
  assert.equal(tomato.remaining, 1);
});

test("resumo e detalhe do desconto", () => {
  const rows = deductRows(recipe(), PANTRY, T);
  assert.equal(deductSummary(rows.map((r) => setDeductChoice(r, "keep"))), "Nada muda na despensa.");
  assert.equal(deductSummary(rows), "1 item será atualizado.");
  const two = rows.map((r) => (r.itemId === "p-queijo" ? setDeductChoice(r, "gone") : r));
  assert.equal(deductSummary(two), "2 itens serão atualizados.");
  // "Sobrou" igual ao que já havia não muda nada.
  assert.equal(deductSummary([setDeductChoice(row(rows, "p-arroz"), "left")]), "Nada muda na despensa.");
  assert.equal(deductDetail(row(rows, "p-tomate"), false), "Na despensa: 3 unidades · a receita usa 2 unidades");
  assert.equal(deductDetail(row(rows, "p-queijo"), false), "Na despensa: quantidade não informada · a receita usa 50 g");
  assert.equal(
    deductDetail({ current: 1, unit: "un", used: "1 barra de 90 kcal" }, true),
    "Na despensa: 1 unidade · a receita usa 1 barra de calorias ocultas",
  );
});
