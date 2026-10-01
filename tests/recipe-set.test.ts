import { test } from "node:test";
import assert from "node:assert/strict";
import { stateFixture } from "./fixtures";
import { createDietPlan } from "../src/lib/diet";
import { localDate, shiftDate } from "../src/lib/domain";
import { toggleKitchenBasic } from "../src/lib/kitchen-basics";
import { MEAL_CATEGORIES } from "../src/lib/meals";
import {
  emptyPantryDraft,
  pantrySignature,
  recipeSetOf,
  recipeStatus,
  savePantryDrafts,
  saveRecipe,
} from "../src/lib/pantry";
import { PANTRY_FALLBACK_GLYPH } from "../src/lib/pantry-view";
import {
  cleanRecipeText,
  coverageCount,
  coverageText,
  fmtMinutes,
  RECIPE_ALL_HOME,
  RECIPE_EXPIRED_ITEM,
  RECIPE_QUESTIONS_HINT,
  RECIPE_REMOVED_ITEM,
  RECIPE_STALE_NOTICE,
  recipeChips,
  recipeCoverage,
  recipeEmoji,
  recipeGeneratedLabel,
  recipeMissingLine,
  recipeMissingPill,
  recipeSeal,
  recipeSealLabel,
  renderRecipeSetText,
  stepExtras,
  stripEmoji,
} from "../src/lib/recipe-set";
import { parseRichText, plainText, type RichInline } from "../src/lib/rich-text";
import { CALORIE_PATTERN, HIDDEN_CALORIES } from "../src/lib/text";
import {
  KITCHEN_BASIC_KEYS,
  RECIPE_LIMITS,
  RECIPE_MEALS,
  recipeSchema,
  recipeSetSchema,
  type AgentReply,
  type AppState,
  type PantryItem,
  type RecipeCard,
  type RecipeSet,
} from "../src/types";

const TODAY = "2026-09-26";
const CALORIES = new RegExp(CALORIE_PATTERN.source, "i");

const card = (extra: Partial<RecipeCard> = {}): RecipeCard => ({
  nome: "Frango ao forno com legumes",
  refeicao: "Almoço",
  porcoes: 3,
  tempoMin: 35,
  compatibilidade: "Proteína magra e legumes, como no almoço da sua dieta.",
  ingredientesCasa: [
    { pantryItemId: "frango", nome: "Peito de frango", quantidade: "400 g" },
    { pantryItemId: "cenoura", nome: "Cenoura", quantidade: "2 unidades" },
  ],
  basicos: [{ basico: "sal", quantidade: "a gosto" }],
  faltaComprar: [{ nome: "Alecrim", quantidade: null }],
  passos: [
    { texto: "Tempere o frango.", timerMin: null, temperaturaC: null },
    { texto: "Asse tudo.", timerMin: 25, temperaturaC: 200 },
  ],
  porcao: "Sirva 1 porção e complete o prato com salada.",
  ...extra,
});
const set = (extra: Partial<RecipeSet> = {}): RecipeSet => ({
  version: 2,
  receitas: [card()],
  perguntas: [],
  ...extra,
});

const GOLDEN = `## Frango ao forno com legumes
**Refeição:** Almoço · **Tempo:** 35 min · **Rendimento:** 3 porções
Proteína magra e legumes, como no almoço da sua dieta.
### Na sua cozinha
- Peito de frango — 400 g
- Cenoura — 2 unidades
### Básicos da cozinha
- Sal — a gosto
### Falta comprar
- Alecrim
### Modo de preparo
1. Tempere o frango.
2. Asse tudo. (25 min · 200 °C)
### Porção
Sirva 1 porção e complete o prato com salada.`;

let seq = 0;
const pantryItem = (id: string, name: string, extra: Partial<PantryItem> = {}): PantryItem => ({
  id,
  name,
  quantity: 1,
  unit: "un",
  location: "geladeira",
  expiresOn: null,
  notes: "",
  source: "manual",
  updatedAt: `2026-09-20T12:00:0${++seq % 10}.000Z`,
  ...extra,
});

const reply: AgentReply = {
  text: "Arroz com legumes: uma sugestão para o almoço da sua dieta.",
  meta: {
    specialists: ["nutricionista"],
    reviewed: true,
    revisions: 0,
    urgency: "nenhuma",
    notes: [],
    llmCalls: 2,
  },
};

/** Pessoa com dieta atual, consentimento e dois itens na despensa (Arroz e Tomate). */
function readyState(): AppState {
  const base = stateFixture();
  const profile = { ...base.profile!, consentAi: true };
  const s = { ...base, profile, dietPlan: createDietPlan(reply, profile) };
  return savePantryDrafts(
    s,
    [
      { ...emptyPantryDraft(), name: "Arroz", quantity: 1, unit: "kg" },
      { ...emptyPantryDraft("geladeira"), name: "Tomate", expiresOn: shiftDate(localDate(), 2) },
    ],
    "manual",
  );
}
function stateSet(s: AppState, basics: RecipeCard["basicos"] = []): RecipeSet {
  const [arroz, tomate] = s.pantry;
  return set({
    receitas: [
      card({
        nome: "Arroz com tomate",
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 20,
        ingredientesCasa: [
          { pantryItemId: arroz.id, nome: arroz.name, quantidade: "1 xícara" },
          { pantryItemId: tomate.id, nome: tomate.name, quantidade: "2 unidades" },
        ],
        basicos: basics,
        faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade" }],
      }),
    ],
  });
}
const structuredReply = (value: RecipeSet): AgentReply => ({
  ...reply,
  text: renderRecipeSetText(value),
  structured: { kind: "recipes", set: value },
});

test("esquema das receitas: aceita o conjunto válido, apara textos e recusa o que foge do contrato", () => {
  assert.deepEqual(recipeSetSchema.parse(set()), set());
  const padded = recipeSetSchema.parse(set({ receitas: [card({ nome: "  Frango  " })] }));
  assert.equal(padded.receitas[0].nome, "Frango");
  const bad: [string, unknown][] = [
    ["listas vazias", set({ receitas: [], perguntas: [] })],
    ["3 receitas", set({ receitas: [card(), card(), card()] })],
    ["timer 0", set({ receitas: [card({ passos: [{ texto: "x", timerMin: 0, temperaturaC: null }] })] })],
    ["20 °C", set({ receitas: [card({ passos: [{ texto: "x", timerMin: null, temperaturaC: 20 }] })] })],
    ["básico desconhecido", set({ receitas: [card({ basicos: [{ basico: "gengibre" as never, quantidade: null }] })] })],
    ["sem itens da casa", set({ receitas: [card({ ingredientesCasa: [] })] })],
    ["refeição fora da lista", set({ receitas: [card({ refeicao: "Brunch" as never })] })],
    [
      "item repetido",
      set({
        receitas: [
          card({
            ingredientesCasa: [
              { pantryItemId: "a", nome: "Arroz", quantidade: null },
              { pantryItemId: "a", nome: "Arroz", quantidade: null },
            ],
          }),
        ],
      }),
    ],
    [
      "básico repetido",
      set({
        receitas: [
          card({
            basicos: [
              { basico: "sal", quantidade: null },
              { basico: "sal", quantidade: null },
            ],
          }),
        ],
      }),
    ],
    ["quebra de linha", set({ receitas: [card({ compatibilidade: "linha 1\nlinha 2" })] })],
    [
      "quantidade vazia",
      set({
        receitas: [card({ faltaComprar: [{ nome: "Alecrim", quantidade: "" }] })],
      }),
    ],
  ];
  for (const [label, value] of bad)
    assert.equal(recipeSetSchema.safeParse(value).success, false, label);
  assert.equal(recipeSetSchema.safeParse(set({ receitas: [], perguntas: ["Qual o seu jantar?"] })).success, true);
});

test("receita salva: recipeSet inválido vira undefined e o texto continua valendo", () => {
  const legacy = {
    id: "r1",
    text: "## Receita antiga",
    meta: reply.meta,
    createdAt: "2026-09-20T12:00:00.000Z",
    dietPlanId: "d1",
    profileSignature: "p",
    pantrySignature: "s",
  };
  assert.equal(recipeSchema.parse(legacy).recipeSet, undefined);
  const future = recipeSchema.parse({ ...legacy, recipeSet: { ...set(), version: 3 } });
  assert.equal(future.recipeSet, undefined);
  assert.equal(future.text, "## Receita antiga");
  assert.deepEqual(recipeSchema.parse({ ...legacy, recipeSet: set() }).recipeSet, set());
});

test("refeições das receitas são as mesmas do diário", () => {
  assert.deepEqual([...RECIPE_MEALS], MEAL_CATEGORIES);
});

test("pior caso: tudo no limite renderiza abaixo dos 20.000 caracteres do texto da resposta", () => {
  const L = RECIPE_LIMITS;
  const text = (n: number, c = "a") => c.repeat(n);
  const worst: RecipeCard = {
    nome: text(L.nome),
    refeicao: "Café da manhã",
    porcoes: L.porcoes[1],
    tempoMin: L.tempoMin[1] - 1,
    compatibilidade: text(L.compatibilidade),
    ingredientesCasa: Array.from({ length: L.casa }, (_, i) => ({
      pantryItemId: `item-${i}`.padEnd(100, "x"),
      nome: text(L.itemNome),
      quantidade: text(L.quantidade),
    })),
    basicos: KITCHEN_BASIC_KEYS.slice(0, L.basicos).map((basico) => ({
      basico,
      quantidade: text(L.quantidade),
    })),
    faltaComprar: Array.from({ length: L.compras }, () => ({
      nome: text(L.compraNome),
      quantidade: text(L.quantidade),
    })),
    passos: Array.from({ length: L.passos }, () => ({
      texto: text(L.passo),
      timerMin: L.timerMin[1] - 1,
      temperaturaC: L.temperaturaC[1],
    })),
    porcao: text(L.porcao),
  };
  const full = recipeSetSchema.parse({
    version: 2,
    receitas: Array.from({ length: L.receitas }, () => worst),
    perguntas: Array.from({ length: L.perguntas }, () => text(L.pergunta)),
  });
  const rendered = renderRecipeSetText(full);
  assert.ok(rendered.length <= 20000, `${rendered.length} caracteres`);
  assert.ok(!rendered.includes("item-0"), "ids nunca entram no texto");
});

test("limpeza do texto do modelo: uma linha, sem markdown, idempotente", () => {
  assert.equal(cleanRecipeText("Tempere\n  o frango\tcom calma", 280), "Tempere o frango com calma");
  assert.equal(cleanRecipeText("## Arroz", 80), "Arroz");
  assert.equal(cleanRecipeText("- Tomate picado", 80), "Tomate picado");
  assert.equal(cleanRecipeText("1. Aqueça o forno", 80), "Aqueça o forno");
  assert.equal(cleanRecipeText("2) Sirva", 80), "Sirva");
  assert.equal(cleanRecipeText("**Arroz** integral com `feijão`", 80), "Arroz integral com feijão");
  assert.equal(cleanRecipeText("  - 1. **Passo** final ", 80), "Passo final");
  assert.equal(cleanRecipeText("1.5 kg de batata", 80), "1.5 kg de batata");
  assert.equal(cleanRecipeText("2 ovos batidos", 80), "2 ovos batidos");
  assert.equal(cleanRecipeText("abcdef", 3), "abc");
  for (const raw of ["## **Arroz**\n1. passo", "a ` b", "*`*negrito*`*", "- ", "> citação  \n\n fim", "x [nota"])
    for (const hide of [false, true]) {
      const once = cleanRecipeText(raw, 40, hide);
      assert.equal(cleanRecipeText(once, 40, hide), once, JSON.stringify(raw));
    }
});

test("limpeza com calorias ocultas: mascara antes de cortar, sem fragmento do marcador", () => {
  const raw = "Prato leve com 300 kcal por porção e legumes da estação ".repeat(6).slice(0, 240);
  const out = cleanRecipeText(raw, 240, true);
  assert.ok(out.length <= 240);
  assert.doesNotMatch(out, CALORIES);
  assert.doesNotMatch(out.split(HIDDEN_CALORIES).join(""), /\[|calorias/);
  assert.ok(out.includes(HIDDEN_CALORIES));
  assert.equal(cleanRecipeText(out, 240, true), out);
  const cut = cleanRecipeText(`${"x".repeat(230)} 300 kcal`, 240, true);
  assert.equal(cut, "x".repeat(230));
  const created = cleanRecipeText(`${"a".repeat(232)} 300 calzone`, 240, true);
  assert.doesNotMatch(created, CALORIES);
  assert.equal(created, "a".repeat(232));
  assert.equal(cleanRecipeText("Tem 300 kcal", 80, false), "Tem 300 kcal");
});

test("emoji sai do texto do modelo", () => {
  assert.equal(stripEmoji("🍝 Macarrão"), "Macarrão");
  assert.equal(stripEmoji("Arroz 🍚 com 🇧🇷 feijão ❤️"), "Arroz com feijão");
  assert.equal(stripEmoji("Omelete de 2 ovos"), "Omelete de 2 ovos");
});

test("texto das receitas: formato exato, determinístico e legível pelo RichText", () => {
  assert.equal(renderRecipeSetText(set()), GOLDEN);
  const minimal = card({
    nome: "Omelete simples",
    refeicao: "Jantar",
    porcoes: 1,
    tempoMin: 70,
    compatibilidade: "Leve para o jantar.",
    ingredientesCasa: [{ pantryItemId: "ovos", nome: "Ovos", quantidade: null }],
    basicos: [],
    faltaComprar: [],
    passos: [{ texto: "Bata e cozinhe.", timerMin: 5, temperaturaC: null }],
    porcao: "",
  });
  const both = set({ receitas: [card(), minimal], perguntas: ["Você come ovos no jantar?"] });
  const expected = `${GOLDEN}

## Omelete simples
**Refeição:** Jantar · **Tempo:** 1 h 10 min · **Rendimento:** 1 porção
Leve para o jantar.
### Na sua cozinha
- Ovos
### Modo de preparo
1. Bata e cozinhe. (5 min)

## Antes de sugerir receitas
- Você come ovos no jantar?`;
  assert.equal(renderRecipeSetText(both), expected);
  assert.equal(renderRecipeSetText(both), renderRecipeSetText(structuredClone(both)));
  assert.equal(
    renderRecipeSetText(set({ receitas: [], perguntas: ["Qual o seu horário de almoço?"] })),
    "## Antes de sugerir receitas\n- Qual o seu horário de almoço?",
  );
  assert.ok(!expected.endsWith("\n"));

  const sections = parseRichText(expected);
  assert.deepEqual(
    sections.map((s) => plainText(s.title ?? [])),
    ["Frango ao forno com legumes", "Omelete simples", "Antes de sugerir receitas"],
  );
  const meta = sections[0].blocks.find((b) => b.kind === "meta");
  assert.deepEqual(
    meta?.kind === "meta" ? meta.items.map((m) => m.label) : [],
    ["Refeição", "Tempo", "Rendimento"],
  );
  const steps = sections[0].blocks.find((b) => b.kind === "steps");
  assert.equal(steps?.kind === "steps" ? steps.items.length : 0, 2);
  const inlines: RichInline[] = sections.flatMap((s) => [
    ...(s.title ?? []),
    ...s.blocks.flatMap((b) =>
      b.kind === "heading" || b.kind === "paragraph"
        ? b.inlines
        : b.kind === "meta"
          ? b.items.flatMap((m) => m.value)
          : b.items.flat(),
    ),
  ]);
  assert.ok(!plainText(inlines).includes("**"));
});

test("chips, minutos e extras do passo", () => {
  assert.deepEqual(recipeChips(card({ tempoMin: 20, porcoes: 2 })), ["Almoço", "20 min", "2 porções"]);
  assert.deepEqual(recipeChips(card({ porcoes: 1 }))[2], "1 porção");
  assert.equal(fmtMinutes(20), "20 min");
  assert.equal(fmtMinutes(60), "1 h");
  assert.equal(fmtMinutes(70), "1 h 10 min");
  assert.deepEqual(stepExtras({ texto: "x", timerMin: 25, temperaturaC: 200 }), ["25 min", "200 °C"]);
  assert.deepEqual(stepExtras({ texto: "x", timerMin: null, temperaturaC: null }), []);
  assert.match(RECIPE_STALE_NOTICE, /Gere novas receitas/);
  assert.match(RECIPE_QUESTIONS_HINT, /anamnese/);
  assert.equal(RECIPE_ALL_HOME, "Você tem tudo em casa.");
});

test("cobertura: itens da casa disponíveis e básicos marcados contam; removidos, vencidos e básico desmarcado faltam", () => {
  const pantry = [
    pantryItem("frango", "Peito de frango", { expiresOn: shiftDate(TODAY, 1) }),
    pantryItem("cenoura", "Cenoura"),
  ];
  // Casa 2 + básico (sal) 1 + falta comprar 1 = 4; o sal só entra na receita marcado, então conta como em casa.
  const all = recipeCoverage(card(), pantry, TODAY);
  assert.deepEqual(all, { have: 3, total: 4, unavailableIds: [], expiredIds: [] });
  assert.equal(coverageText(all), "3 de 4 ingredientes em casa");
  assert.equal(coverageCount(all), "3 de 4");
  assert.deepEqual(recipeCoverage(card(), pantry, TODAY, ["sal", "azeite"]), all);
  // Desmarcado depois de gerar: o básico passa a faltar.
  const unmarked = recipeCoverage(card(), pantry, TODAY, []);
  assert.deepEqual([unmarked.have, unmarked.total], [2, 4]);
  const partial = recipeCoverage(
    card(),
    [pantryItem("frango", "Peito de frango", { expiresOn: shiftDate(TODAY, -1) })],
    TODAY,
  );
  // unavailableIds segue com removidos e vencidos; expiredIds separa o que ainda está na despensa.
  assert.deepEqual(partial, {
    have: 1,
    total: 4,
    unavailableIds: ["frango", "cenoura"],
    expiredIds: ["frango"],
  });
  const noBasics = recipeCoverage(card({ basicos: [] }), pantry, TODAY);
  assert.deepEqual([noBasics.have, noBasics.total], [2, 3]);
  assert.equal(coverageText({ have: 1, total: 1 }), "1 de 1 ingrediente em casa");
  // Conceito 06: 3 da casa + 5 básicos marcados + alecrim a comprar = "8 de 9".
  const concept = card({
    basicos: (["sal", "azeite", "alho", "limao", "pimenta"] as const).map((basico) => ({
      basico,
      quantidade: null,
    })),
    ingredientesCasa: [
      ...card().ingredientesCasa,
      { pantryItemId: "abobrinha", nome: "Abobrinha", quantidade: null },
    ],
  });
  const eight = recipeCoverage(concept, [...pantry, pantryItem("abobrinha", "Abobrinha")], TODAY);
  assert.equal(coverageText(eight), "8 de 9 ingredientes em casa");
  // Vence hoje ainda vale; vencido ontem, não.
  const today = recipeCoverage(card(), [...pantry.slice(1), pantryItem("frango", "Peito de frango", { expiresOn: TODAY })], TODAY);
  assert.deepEqual([today.unavailableIds, today.expiredIds], [[], []]);
  assert.equal(RECIPE_EXPIRED_ITEM, "venceu — não use");
  assert.equal(RECIPE_REMOVED_ITEM, "não está mais na despensa");
});

test("linha do que falta comprar: nada, um, dois e excedentes", () => {
  const buy = (...nomes: string[]) =>
    card({ faltaComprar: nomes.map((nome) => ({ nome, quantidade: null })) });
  assert.equal(recipeMissingLine(buy()), null);
  assert.equal(recipeMissingLine(buy("Cebola")), "Falta comprar: cebola");
  assert.equal(recipeMissingLine(buy("Cebola", "Alho")), "Falta comprar: cebola, alho");
  assert.equal(
    recipeMissingLine(buy("Cebola", "Alho", "Azeite", "Queijo Minas")),
    "Falta comprar: cebola, alho +2",
  );
});

test("pílula do que falta: primeiro item em minúscula, \"(opcional)\" vira marca e o resto vira +N", () => {
  const buy = (...nomes: string[]) =>
    card({ faltaComprar: nomes.map((nome) => ({ nome, quantidade: null })) });
  assert.equal(recipeMissingPill(buy()), null);
  assert.deepEqual(recipeMissingPill(buy("Cebola")), { text: "Falta: cebola", isOptional: false, more: 0 });
  assert.deepEqual(recipeMissingPill(buy("Alecrim (opcional)")), {
    text: "Falta: alecrim",
    isOptional: true,
    more: 0,
  });
  assert.deepEqual(recipeMissingPill(buy("Cebola", "Alho", "Azeite")), {
    text: "Falta: cebola",
    isOptional: false,
    more: 2,
  });
});

test("selo da receita: \"Usa\" com artigo e o alimento sem o corte", () => {
  assert.equal(recipeSealLabel("Peito de frango"), "Usa o frango");
  assert.equal(recipeSealLabel("Tomate"), "Usa o tomate");
  assert.equal(recipeSealLabel("Abobrinha"), "Usa a abobrinha");
  assert.equal(recipeSealLabel("Espinafre"), "Usa o espinafre");
  assert.equal(recipeSealLabel("Ovos"), "Usa os ovos");
  assert.equal(recipeSealLabel("Uvas"), "Usa as uvas");
  assert.equal(recipeSealLabel("Carne moída"), "Usa a carne moída");
  assert.equal(recipeSealLabel("Iogurte natural"), "Usa o iogurte natural");
  assert.equal(recipeSealLabel("Batata-doce"), "Usa a batata-doce");
});

test("selo de validade: o item disponível que vence primeiro; ignora vencidos e itens folgados", () => {
  const two = card({
    ingredientesCasa: [
      { pantryItemId: "a", nome: "Iogurte", quantidade: null },
      { pantryItemId: "b", nome: "Tomate", quantidade: null },
      { pantryItemId: "c", nome: "Leite", quantidade: null },
    ],
  });
  const pantry = [
    pantryItem("a", "Iogurte", { expiresOn: shiftDate(TODAY, 3) }),
    pantryItem("b", "Tomate", { expiresOn: shiftDate(TODAY, 1) }),
    pantryItem("c", "Leite", { expiresOn: shiftDate(TODAY, -1) }),
  ];
  const seal = recipeSeal(two, pantry, TODAY);
  assert.equal(seal?.itemName, "Tomate");
  assert.equal(seal?.pill.short, "Vence amanhã");
  assert.equal(seal?.pill.tone, "soon");
  const relaxed = pantry.map((i) => ({ ...i, expiresOn: i.id === "c" ? i.expiresOn : shiftDate(TODAY, 20) }));
  assert.equal(recipeSeal(two, relaxed, TODAY), null);
});

test("emoji da receita: pelo nome, pelo primeiro item e o prato genérico", () => {
  assert.equal(recipeEmoji(card({ nome: "Arroz com tomate" })), "🍚");
  assert.equal(recipeEmoji(card({ nome: "Omelete de espinafre" })), "🥚");
  assert.equal(recipeEmoji(card({ nome: "Refogado da casa" })), "🍗");
  assert.equal(
    recipeEmoji(
      card({
        nome: "Prato especial",
        ingredientesCasa: [{ pantryItemId: "x", nome: "Receita secreta", quantidade: null }],
      }),
    ),
    PANTRY_FALLBACK_GLYPH,
  );
});

test("rótulo da geração em hora local: hoje, ontem, dias anteriores e outro ano", () => {
  const now = new Date(2026, 8, 26, 15, 0);
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();
  assert.equal(recipeGeneratedLabel(at(2026, 8, 26, 14, 32), now), "Criadas hoje às 14:32");
  assert.equal(recipeGeneratedLabel(at(2026, 8, 25, 9, 5), now), "Criadas ontem às 09:05");
  assert.equal(recipeGeneratedLabel(at(2026, 8, 20, 18, 40), now), "Criadas em 20/09 às 18:40");
  assert.equal(recipeGeneratedLabel(at(2025, 8, 20, 18, 40), now), "Criadas em 20/09/2025 às 18:40");
});

test("situação da receita: atual, dieta alterada ou estoque alterado (inclusive receitas antigas)", () => {
  const s = readyState();
  for (const value of [structuredReply(stateSet(s)), reply]) {
    const saved = saveRecipe(s, value, s);
    const recipe = saved.recipes.at(-1)!;
    assert.equal(recipeStatus(recipe, saved), "current");
    assert.equal(recipeStatus(recipe, { ...saved, dietPlan: { ...saved.dietPlan!, id: "outra" } }), "diet_changed");
    assert.equal(
      recipeStatus(recipe, { ...saved, profile: { ...saved.profile!, allergyDetails: "Leite" } }),
      "diet_changed",
    );
    assert.equal(recipeStatus(recipe, { ...saved, profile: null }), "diet_changed");
    assert.equal(
      recipeStatus(recipe, { ...saved, pantry: [{ ...saved.pantry[0], quantity: 0.5 }, saved.pantry[1]] }),
      "stock_changed",
    );
    assert.equal(recipeStatus(recipe, toggleKitchenBasic(saved, "sal")), "stock_changed");
  }
  const legacy = {
    ...saveRecipe(s, reply, s).recipes[0],
    pantrySignature: pantrySignature(s.pantry),
  };
  assert.equal(legacy.recipeSet, undefined);
  assert.equal(recipeStatus(legacy, s), "current");
});

test("salvar receita estruturada: guarda o conjunto coerente com o estoque; senão só o texto", () => {
  const s = { ...readyState(), kitchenBasics: ["sal" as const] };
  const value = stateSet(s, [{ basico: "sal", quantidade: "a gosto" }]);
  assert.deepEqual(recipeSetOf(structuredReply(value)), value);
  assert.equal(recipeSetOf(reply), null);

  const saved = saveRecipe(s, structuredReply(value), s).recipes.at(-1)!;
  assert.deepEqual(saved.recipeSet, value);
  assert.equal(saved.text, renderRecipeSetText(value));
  assert.equal(saved.pantrySignature, pantrySignature(s.pantry, ["sal"]));
  assert.notEqual(saved.pantrySignature, pantrySignature(s.pantry));

  const unknownId = structuredClone(value);
  unknownId.receitas[0].ingredientesCasa[0].pantryItemId = "removido";
  const dropped = saveRecipe(s, structuredReply(unknownId), s).recipes.at(-1)!;
  assert.equal(dropped.recipeSet, undefined);
  assert.equal(dropped.text, renderRecipeSetText(unknownId));

  const withoutBasics = { ...s, kitchenBasics: [] };
  const disabled = saveRecipe(withoutBasics, structuredReply(value), withoutBasics).recipes.at(-1)!;
  assert.equal(disabled.recipeSet, undefined);
  assert.equal(disabled.pantrySignature, pantrySignature(s.pantry));

  const expired = { ...s, pantry: s.pantry.map((i) => ({ ...i, expiresOn: i.name === "Tomate" ? shiftDate(localDate(), -1) : i.expiresOn })) };
  assert.equal(saveRecipe(expired, structuredReply(value), expired).recipes.at(-1)!.recipeSet, undefined);

  assert.throws(
    () => saveRecipe(s, structuredReply(value), { ...s, kitchenBasics: [] }),
    /mudaram/,
  );
});
