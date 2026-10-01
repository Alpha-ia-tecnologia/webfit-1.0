import { test } from "node:test";
import assert from "node:assert/strict";
import type { MeasureId } from "../src/lib/household-measures";
import { MAX_ITEM_GRAMS } from "../src/lib/meals";
import {
  MEAL_TEXT_COPY,
  MEAL_TEXT_MASS_MAX,
  MEAL_TEXT_UNITS,
  isPtBrLocale,
  mealTextSchema,
  quantityMatchesText,
  quantityStated,
  renderMealText,
  sanitizeMealText,
  type MealText,
  type MealTextItem,
  type MealTextUnit,
} from "../src/lib/meal-text";
import { MEAL_TEXT_DRAFT, MEAL_TEXT_SOURCE } from "./structured-fixtures";

const RICE = MEAL_TEXT_DRAFT.items[0]!;
const CHICKEN = MEAL_TEXT_DRAFT.items[2]!;
const item = (extra: Partial<MealTextItem>): MealTextItem => ({
  ...RICE,
  ...extra,
});
const draft = (
  items: MealTextItem[],
  uncertainties: string[] = [],
): MealText => ({ items, uncertainties });
const onlyItem = (v: MealText | null): MealTextItem => {
  assert.ok(v);
  assert.equal(v.items.length, 1);
  return v.items[0]!;
};

// Todas as medidas caseiras cabem no modo (checado pelo tsc em npm run lint).
const EVERY_MEASURE: [Exclude<MeasureId, MealTextUnit>] extends [never]
  ? true
  : false = true;

test("limites e unidades: teto de massa igual ao do registro, todas as medidas caseiras", () => {
  assert.equal(EVERY_MEASURE, true);
  assert.equal(MEAL_TEXT_MASS_MAX, MAX_ITEM_GRAMS);
  assert.equal(new Set(MEAL_TEXT_UNITS).size, MEAL_TEXT_UNITS.length);
  assert.deepEqual(MEAL_TEXT_UNITS.slice(0, 2), ["g", "ml"]);
});

test("sanitize: rascunho limpo sai igual e a entrada não é alterada", () => {
  const before = structuredClone(MEAL_TEXT_DRAFT);
  const result = sanitizeMealText(MEAL_TEXT_DRAFT);
  assert.deepEqual(result, MEAL_TEXT_DRAFT);
  assert.notEqual(result, MEAL_TEXT_DRAFT);
  assert.deepEqual(MEAL_TEXT_DRAFT, before);
});

test("sanitize: sem trecho dito não há quantidade nem unidade", () => {
  const clean = onlyItem(
    sanitizeMealText(
      draft([item({ quantityText: null, quantity: 3, unit: "concha" })]),
    ),
  );
  assert.equal(clean.quantity, null);
  assert.equal(clean.unit, null);
  const blank = onlyItem(
    sanitizeMealText(draft([item({ quantityText: "   " })])),
  );
  assert.deepEqual(
    [blank.quantityText, blank.quantity, blank.unit],
    [null, null, null],
  );
  const noQuantity = onlyItem(
    sanitizeMealText(draft([item({ quantity: null })])),
  );
  assert.deepEqual(
    [noQuantity.quantityText, noQuantity.unit],
    ["4 colheres", null],
  );
});

test("sanitize: medida acima de 40 zera a quantidade e mantém o trecho para a tela", () => {
  const clean = onlyItem(
    sanitizeMealText(
      draft([
        item({
          quantityText: "45 colheres",
          quantity: 45,
          unit: "colher-sopa",
        }),
      ]),
    ),
  );
  assert.deepEqual(
    [clean.quantityText, clean.quantity, clean.unit],
    ["45 colheres", null, null],
  );
  const forty = onlyItem(
    sanitizeMealText(
      draft([item({ quantityText: "40 colheres", quantity: 40 })]),
    ),
  );
  assert.deepEqual([forty.quantity, forty.unit], [40, "colher-sopa"]);
});

test("sanitize: gramas e ml até 5000", () => {
  const heavy = onlyItem(
    sanitizeMealText(
      draft([item({ quantityText: "6 kg", quantity: 6000, unit: "g" })]),
    ),
  );
  assert.deepEqual(
    [heavy.quantityText, heavy.quantity, heavy.unit],
    ["6 kg", null, null],
  );
  const grams = onlyItem(
    sanitizeMealText(
      draft([item({ quantityText: "150 g", quantity: 150, unit: "g" })]),
    ),
  );
  assert.deepEqual([grams.quantity, grams.unit], [150, "g"]);
  const juice = onlyItem(
    sanitizeMealText(
      draft([item({ quantityText: "300 ml", quantity: 300, unit: "ml" })]),
    ),
  );
  assert.deepEqual([juice.quantity, juice.unit], [300, "ml"]);
});

test("sanitize: mesmo nome e mesmo trecho viram um item só (fica o primeiro)", () => {
  const result = sanitizeMealText(
    draft([item({}), item({ name: " arroz BRANCO ", searchTerms: ["arroz"] })]),
  );
  assert.ok(result);
  assert.deepEqual(result.items, [RICE]);
  const twoPortions = sanitizeMealText(
    draft([item({}), item({ quantityText: "duas colheres", quantity: 2 })]),
  );
  assert.equal(twoPortions?.items.length, 2);
});

test("sanitize: termos vazios caem para o nome; item sem nome sai; dúvidas limpas", () => {
  assert.deepEqual(
    onlyItem(sanitizeMealText(draft([item({ searchTerms: ["  "] })])))
      .searchTerms,
    ["Arroz branco"],
  );
  assert.deepEqual(
    onlyItem(sanitizeMealText(draft([item({ searchTerms: [" arroz ", ""] })])))
      .searchTerms,
    ["arroz"],
  );
  const result = sanitizeMealText(
    draft(
      [item({ name: "  " }), CHICKEN],
      [" Molho? ", "", "molho?", "Tamanho do filé."],
    ),
  );
  assert.deepEqual(result, {
    items: [CHICKEN],
    uncertainties: ["Molho?", "Tamanho do filé."],
  });
});

test("sanitize: sem itens e sem dúvidas é null; só dúvidas é válido", () => {
  assert.equal(sanitizeMealText(draft([])), null);
  assert.equal(sanitizeMealText(draft([item({ name: " " })], ["  "])), null);
  assert.deepEqual(sanitizeMealText(draft([], ["Não entendi"])), {
    items: [],
    uncertainties: ["Não entendi"],
  });
});

test("render: texto exato e estável", () => {
  assert.equal(
    renderMealText(MEAL_TEXT_DRAFT),
    [
      "**Itens descritos**",
      "- Arroz branco · quantidade dita: 4 colheres · procurar: arroz tipo 1 cozido",
      "- Feijão · quantidade dita: duas conchas · procurar: feijão carioca cozido",
      "- Frango grelhado · quantidade não dita · procurar: frango grelhado",
      "- Paçoca · quantidade dita: uma paçoca · procurar: paçoca amendoim · possível alérgeno declarado",
      "",
      "**Dúvidas**",
      "- Não ficou claro se o frango tinha molho.",
    ].join("\n"),
  );
  assert.equal(
    renderMealText(draft([], [])),
    "Nenhum alimento reconhecido na descrição.",
  );
  assert.equal(
    renderMealText(draft([], ["Não entendi"])),
    "Nenhum alimento reconhecido na descrição.\n\n**Dúvidas**\n- Não entendi",
  );
});

test("render: não acrescenta números próprios", () => {
  const text = renderMealText(draft([CHICKEN]));
  assert.doesNotMatch(text, /\d/);
  assert.doesNotMatch(renderMealText(MEAL_TEXT_DRAFT), /kcal|caloria|\bg\b/i);
});

test("quantityStated: o trecho precisa estar na descrição, sem acento, caixa ou espaço extra", () => {
  assert.equal(
    quantityStated({ quantityText: "duas conchas" }, MEAL_TEXT_SOURCE),
    true,
  );
  assert.equal(
    quantityStated({ quantityText: "Duas  Conchas" }, MEAL_TEXT_SOURCE),
    true,
  );
  assert.equal(
    quantityStated({ quantityText: "uma pacoca" }, MEAL_TEXT_SOURCE),
    true,
  );
  assert.equal(
    quantityStated({ quantityText: "3 colheres" }, MEAL_TEXT_SOURCE),
    false,
  );
  assert.equal(quantityStated({ quantityText: null }, MEAL_TEXT_SOURCE), false);
  assert.equal(quantityStated({ quantityText: "  " }, MEAL_TEXT_SOURCE), false);
  assert.equal(
    quantityStated({ quantityText: "4 colheres" }, "arroz e feijão"),
    false,
  );
});

test("quantityStated: só em fronteira de palavra (4 colheres não vale dentro de 14 colheres)", () => {
  assert.equal(
    quantityStated({ quantityText: "4 colheres" }, "Comi 14 colheres de arroz"),
    false,
  );
  assert.equal(
    quantityStated({ quantityText: "4 colher" }, "Comi 4 colheres de arroz"),
    false,
  );
  assert.equal(
    quantityStated(
      { quantityText: "4 colheres" },
      "Comi 14 colheres, depois 4 colheres de feijão",
    ),
    true,
  );
  assert.equal(
    quantityStated({ quantityText: "(2 fatias)" }, "pão(2 fatias)"),
    true,
  );
});

test("schema: unidade fora da lista e quantidade inválida viram null; o item continua", () => {
  const raw = { ...RICE, unit: "colher" };
  assert.equal(
    mealTextSchema.parse({ items: [raw], uncertainties: [] }).items[0]!.unit,
    null,
  );
  const negative = mealTextSchema.parse({
    items: [{ ...RICE, quantity: -1 }],
    uncertainties: [],
  });
  assert.equal(negative.items[0]!.quantity, null);
  assert.equal(negative.items[0]!.unit, "colher-sopa");
  const wrongText = mealTextSchema.parse({
    items: [{ ...RICE, quantityText: 4 }],
    uncertainties: [],
  });
  assert.equal(wrongText.items[0]!.quantityText, null);
  // Leitura tolerante: o zod descarta a chave extra; o esquema estrito do servidor nunca a produz.
  assert.deepEqual(
    mealTextSchema.parse({ items: [{ ...RICE, extra: 1 }], uncertainties: [] }),
    {
      items: [RICE],
      uncertainties: [],
    },
  );
  assert.equal(
    mealTextSchema.safeParse({
      items: Array.from({ length: 13 }, () => RICE),
      uncertainties: [],
    }).success,
    false,
  );
  assert.equal(
    mealTextSchema.safeParse({
      items: [{ ...RICE, searchTerms: [] }],
      uncertainties: [],
    }).success,
    false,
  );
});

test("isPtBrLocale: pt-BR e pt_BR sim, pt-PT não", () => {
  assert.equal(isPtBrLocale("pt-BR"), true);
  assert.equal(isPtBrLocale("pt_BR"), true);
  assert.equal(isPtBrLocale(" pt-br "), true);
  assert.equal(isPtBrLocale("pt-PT"), false);
  assert.equal(isPtBrLocale("pt"), false);
});

test("copy: rótulos da tela sem calorias", () => {
  assert.equal(MEAL_TEXT_COPY.title, "Descrever refeição");
  assert.equal(MEAL_TEXT_COPY.confirmOk, "Salvar assim");
  assert.doesNotMatch(JSON.stringify(MEAL_TEXT_COPY), /kcal|caloria/i);
  assert.equal(
    MEAL_TEXT_COPY.privacy,
    "O texto vai para o agente só quando você toca em Organizar itens.",
  );
  assert.equal(
    MEAL_TEXT_COPY.noItems,
    "Nenhum alimento reconhecido na descrição. Volte ao texto ou busque os itens na tela.",
  );
  assert.ok(MEAL_TEXT_COPY.noItems.startsWith(renderMealText(draft([]))));
  assert.equal(MEAL_TEXT_COPY.missingDefault, "Falta porção: entra com a medida caseira padrão");
});

test("copy: atalho e textos com nome (iguais no web e no app)", () => {
  assert.equal(MEAL_TEXT_COPY.tileSub(true), "o agente organiza os itens");
  assert.equal(MEAL_TEXT_COPY.tileSub(false), "requer o agente");
  assert.equal(MEAL_TEXT_COPY.include("Paçoca"), "Incluir Paçoca no prato");
  assert.equal(MEAL_TEXT_COPY.tacoFor("Feijão"), "Alimento da TACO para Feijão");
  assert.equal(MEAL_TEXT_COPY.search("Feijão"), "Buscar Feijão");
  assert.equal(MEAL_TEXT_COPY.stated("4 colheres de sopa ≈ 100 g"), "Porção dita: 4 colheres de sopa ≈ 100 g");
  assert.equal(
    MEAL_TEXT_COPY.saidCheck("duas conchas"),
    "Você disse “duas conchas”: confira a porção no prato",
  );
  assert.equal(MEAL_TEXT_COPY.addCount(3), "Adicionar 3 ao prato");
});

test("copy: bandeja com plural de item", () => {
  assert.equal(MEAL_TEXT_COPY.trayMissing(1), "Falta porção em 1 item");
  assert.equal(MEAL_TEXT_COPY.trayMissing(2), "Falta porção em 2 itens");
  assert.equal(MEAL_TEXT_COPY.pendingSpoken, " (sem porção dita)");
});

test("copy: aviso ao adicionar, no singular e no plural, com e sem porção faltando", () => {
  assert.equal(MEAL_TEXT_COPY.added(1, 0), "1 item adicionado ao prato.");
  assert.equal(MEAL_TEXT_COPY.added(1, 1), "1 item adicionado ao prato. Confira a porção.");
  assert.equal(MEAL_TEXT_COPY.added(3, 0), "3 itens adicionados ao prato.");
  assert.equal(
    MEAL_TEXT_COPY.added(3, 1),
    "3 itens adicionados ao prato. Falta porção em 1: confira.",
  );
  assert.equal(
    MEAL_TEXT_COPY.added(12, 2),
    "12 itens adicionados ao prato. Falta porção em 2: confira.",
  );
});

test("copy: confirmação lista os nomes em pt-BR", () => {
  const tail = ". Eles entram com a medida caseira padrão; você pode ajustar antes.";
  assert.equal(MEAL_TEXT_COPY.confirmMessage(["Frango"]), `Falta porção em Frango${tail}`);
  assert.equal(
    MEAL_TEXT_COPY.confirmMessage(["Frango", "Arroz"]),
    `Falta porção em Frango e Arroz${tail}`,
  );
  assert.equal(
    MEAL_TEXT_COPY.confirmMessage(["Frango", "Arroz", "Feijão"]),
    `Falta porção em Frango, Arroz e Feijão${tail}`,
  );
});

const said = (
  quantityText: string | null,
  quantity: number | null,
  unit: MealTextUnit | null,
) => quantityMatchesText({ quantityText, quantity, unit });

test("quantityMatchesText: o número do trecho é a quantidade (sem 900 g para '2 fatias')", () => {
  assert.equal(said("2 fatias", 900, "g"), false, "gramas que ninguém disse");
  assert.equal(said("2 conchas", 20, "concha"), false, "número diferente do dito");
  assert.equal(said("2 conchas", 2, "concha"), true);
  assert.equal(said("duas conchas", 2, "concha"), true);
  assert.equal(said("Duas  Conchas", 2, "concha"), true);
  assert.equal(said("4 colheres", 4, "colher-sopa"), true);
  assert.equal(said("uma paçoca", 1, "unidade"), true);
  assert.equal(said("2 ovos", 2, "unidade"), true);
  assert.equal(said("2 fatias", 2, "fatia"), true);
  assert.equal(said("um filé", 1, "file"), true);
  assert.equal(said("um pouco", 1, "g"), false, "sem número de gramas dito");
  assert.equal(said(null, 2, "concha"), false);
  assert.equal(said("2 conchas", null, "concha"), false);
  assert.equal(said("2 conchas", 2, null), false);
});

test("quantityMatchesText: decimais pt-BR, meia e ½", () => {
  assert.equal(said("1,5 xícara", 1.5, "xicara"), true);
  assert.equal(said("1.5 xicara", 1.5, "xicara"), true);
  assert.equal(said("1,5 xícara", 15, "xicara"), false);
  assert.equal(said("meia xícara", 0.5, "xicara"), true);
  assert.equal(said("meia xícara", 1, "xicara"), false);
  assert.equal(said("½ xícara", 0.5, "xicara"), true);
  assert.equal(said("1½ xícara", 1.5, "xicara"), true);
  assert.equal(said("1/2 copo", 0.5, "copo"), true);
  assert.equal(said("uma xícara e meia", 1.5, "xicara"), true);
});

test("quantityMatchesText: a unidade dita precisa ser a mesma (gramas e ml exigem a palavra)", () => {
  assert.equal(said("150 g", 150, "g"), true);
  assert.equal(said("150g", 150, "g"), true);
  assert.equal(said("150 gramas", 150, "g"), true);
  assert.equal(said("meio quilo", 500, "g"), true);
  assert.equal(said("300 ml", 300, "ml"), true);
  assert.equal(said("1 litro", 1000, "ml"), true);
  assert.equal(said("150 g", 150, "ml"), false);
  assert.equal(said("2 fatias", 2, "g"), false, "número certo, unidade trocada");
  assert.equal(said("4 colheres", 4, "concha"), false, "colher não é concha");
  assert.equal(said("2 colheres de chá", 2, "colher-cha"), true);
  assert.equal(said("2 colheres de chá", 2, "colher-sopa"), false);
  assert.equal(said("2 fatias", 2, "unidade"), false, "fatia dita não vira unidade");
  assert.equal(said("2 copos", 2, "copo"), true);
});
