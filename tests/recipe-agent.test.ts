import { mock, test } from "node:test";
import assert from "node:assert/strict";
import type { ModelRequest } from "../server/model";
import { buildAgentGraph, runAgent, type AgentInput } from "../server/graph/graph";
import { AgentError, MAX_TOKENS, type Flags } from "../server/graph/state";
import { compactContext, extractFlags } from "../server/graph/prepare";
import { lintStructured } from "../server/graph/structured-guard";
import { specFor } from "../server/graph/structured-specs";
import {
  RECIPE_ADDENDUM,
  RECIPE_JSON_ADDENDUM,
  RECIPE_JSON_SENSITIVE,
  RECIPE_REVIEW_ADDENDUM,
} from "../server/graph/prompts";
import { recipeRefs } from "../server/recipe-refs";
import {
  RECIPE_SCHEMA_NAME,
  recipeDraftSchema,
  recipeFields,
  recipeJsonAddendum,
  recipeJsonSchema,
  recipeOutputSchema,
  recipeSetFromDraft,
  recipeStructuredSpec,
} from "../server/recipes";
import { createDietPlan } from "../src/lib/diet";
import { agentContext } from "../src/lib/domain";
import { kitchenBasicsLegend } from "../src/lib/kitchen-basics";
import { emptyPantryDraft, recipeContext, savePantryDrafts, saveRecipe } from "../src/lib/pantry";
import { renderRecipeSetText } from "../src/lib/recipe-set";
import { maskStructured } from "../src/lib/structured";
import { CALORIE_PATTERN, HIDDEN_CALORIES } from "../src/lib/text";
import {
  KITCHEN_BASIC_KEYS,
  RECIPE_LIMITS,
  RECIPE_MEALS,
  agentReplySchema,
  recipeSetSchema,
  type AgentReply,
  type AppState,
  type KitchenBasicKey,
  type RecipeSet,
} from "../src/types";
import { stateFixture } from "./fixtures";
import { parity, strictProblems } from "./strict-schema";

const L = RECIPE_LIMITS;
const META: AgentReply["meta"] = {
  specialists: ["nutricionista"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 2,
};
/** A anamnese do fixture declara alergia a amendoim. */
const flags: Flags = extractFlags(agentContext(stateFixture()));
const PANTRY = [
  { id: "id-arroz", name: "Arroz" },
  { id: "id-tomate", name: "Tomate" },
];
const refs = recipeRefs({ pantry: PANTRY, kitchenBasics: ["sal"] });
const CALORIE_MENTION = new RegExp(CALORIE_PATTERN.source, "i");
const TEXT =
  "Arroz com tomate: cozinhe o arroz e junte o tomate picado. Encaixa no almoço da sua dieta.";

const card = (over: Record<string, unknown> = {}) => ({
  nome: "Arroz com tomate",
  refeicao: "Almoço",
  porcoes: 2,
  tempoMin: 20,
  compatibilidade: "Arroz e legumes, como no almoço da sua dieta.",
  ingredientesCasa: [
    { ref: "p1", quantidade: "1 xícara" },
    { ref: "p2", quantidade: "2 unidades" },
  ],
  basicos: [{ basico: "sal", quantidade: "a gosto" }],
  faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade" }],
  passos: [
    { texto: "Cozinhe o arroz.", timerMin: 15, temperaturaC: null },
    { texto: "Junte o tomate picado.", timerMin: null, temperaturaC: null },
  ],
  porcao: "Sirva 1 porção e complete o prato com salada.",
  ...over,
});
const output = (receitas: unknown[] = [card()], perguntas: string[] = []) => ({
  receitas,
  perguntas,
});
const json = (value: unknown) => JSON.stringify(value);
const step = (texto: string, timerMin: number | null = null, temperaturaC: number | null = null) => ({
  texto,
  timerMin,
  temperaturaC,
});

type Node = Record<string, unknown>;
const child = (node: unknown, ...path: string[]): Node =>
  path.reduce<Node>((current, key) => current[key] as Node, node as Node);

function readyState(
  basics: KitchenBasicKey[] = ["sal"],
  profile: Partial<NonNullable<AppState["profile"]>> = {},
): AppState {
  const base = stateFixture();
  base.profile = { ...base.profile!, consentAi: true, ...profile };
  base.dietPlan = createDietPlan({ text: "Almoço: arroz com legumes.", meta: META }, base.profile);
  const stocked = savePantryDrafts(
    base,
    [
      { ...emptyPantryDraft(), name: "Arroz", quantity: 1, unit: "kg" },
      { ...emptyPantryDraft("geladeira"), name: "Tomate", quantity: 3, unit: "un" },
    ],
    "manual",
  );
  return { ...stocked, kitchenBasics: basics };
}

type Reply = string | Error | ((request: ModelRequest) => string);
/** Fake do provedor: roteiro por `purpose`; arrays são filas (a última resposta se repete). */
function fakeGenerate(script: Partial<Record<string, Reply | Reply[]>>) {
  const calls: ModelRequest[] = [];
  const queues = new Map<string, Reply[]>();
  const generate = async (request: ModelRequest): Promise<string> => {
    calls.push(request);
    const entry = script[request.purpose];
    if (entry === undefined) throw new Error(`sem roteiro para ${request.purpose}`);
    if (!queues.has(request.purpose)) queues.set(request.purpose, Array.isArray(entry) ? [...entry] : [entry]);
    const queue = queues.get(request.purpose)!;
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(request) : next;
  };
  return { generate, calls };
}

function run(
  script: Partial<Record<string, Reply | Reply[]>>,
  state = readyState(),
  options: { now?: () => number; signal?: AbortSignal } = {},
) {
  const fake = fakeGenerate(script);
  const graph = buildAgentGraph({ generate: fake.generate, now: options.now });
  const input: AgentInput = {
    mode: "recipe",
    text: "Sugira receitas com os alimentos disponíveis.",
    consent: true,
    history: [],
    context: recipeContext(state),
  };
  return {
    reply: runAgent(input, graph, { signal: options.signal, now: options.now }),
    calls: fake.calls,
    purposes: () => fake.calls.map((c) => c.purpose),
    state,
  };
}
const review = (veredito: string, problemas: unknown[] = []) =>
  JSON.stringify({ veredito, problemas, observacao: "" });
const APPROVE = review("aprovado");
const textOf = (request: ModelRequest) =>
  request.parts.map((p) => (p.type === "text" ? p.text : `[${p.type}]`)).join("\n");
const dataBlock = (text: string, label: string) =>
  new RegExp(`<<DADOS ${label} \\w+>>\\n([\\s\\S]*?)\\n<</DADOS ${label}`).exec(text)?.[1] ?? "";
const rejectsWith = (code: string) => (error: unknown) =>
  error instanceof AgentError && error.code === code;
const setOf = (reply: AgentReply): RecipeSet => {
  assert.equal(reply.structured?.kind, "recipes");
  return reply.structured?.kind === "recipes" ? reply.structured.set : (null as never);
};
const silenceErrors = () => mock.method(console, "error", () => {});

test("esquema estrito das receitas: objetos fechados, refs da despensa, básicos ligados e limites", () => {
  const schema = recipeJsonSchema(refs);
  assert.deepEqual(strictProblems(schema), []);
  const receitas = child(schema, "properties", "receitas");
  const cardProps = child(receitas, "items", "properties");
  assert.equal(receitas.maxItems, L.receitas);
  assert.equal(child(schema, "properties", "perguntas").maxItems, L.perguntas);
  assert.deepEqual(child(cardProps, "refeicao").enum, [...RECIPE_MEALS]);
  const home = child(cardProps, "ingredientesCasa");
  assert.deepEqual([home.minItems, home.maxItems], [1, L.casa]);
  assert.deepEqual(child(home, "items", "properties", "ref").enum, ["p1", "p2"]);
  const basicos = child(cardProps, "basicos");
  assert.deepEqual(child(basicos, "items", "properties", "basico").enum, ["sal"]);
  assert.equal(basicos.maxItems, 1);
  assert.equal(child(cardProps, "faltaComprar").maxItems, L.compras);
  const passos = child(cardProps, "passos");
  assert.deepEqual([passos.minItems, passos.maxItems], [1, L.passos]);
  // Sem básicos ligados: nenhum item (o enum não pode ser vazio, então vai a lista completa).
  const none = recipeJsonSchema(recipeRefs({ pantry: PANTRY }));
  assert.deepEqual(strictProblems(none), []);
  const noBasics = child(none, "properties", "receitas", "items", "properties", "basicos");
  assert.equal(noBasics.maxItems, 0);
  assert.deepEqual(child(noBasics, "items", "properties", "basico").enum, [...KITCHEN_BASIC_KEYS]);
  const all = recipeJsonSchema(recipeRefs({ pantry: PANTRY, kitchenBasics: [...KITCHEN_BASIC_KEYS] }));
  assert.equal(child(all, "properties", "receitas", "items", "properties", "basicos").maxItems, L.basicos);
});

test("DeepSeek: o validador gerado do esquema aceita a saída válida e recusa chave extra, ref inventada e básico desligado", () => {
  const results = parity(recipeJsonSchema(refs), recipeDraftSchema(refs, flags), [
    output(),
    { ...output(), extra: 1 },
    output([card({ ingredientesCasa: [{ ref: "p9", quantidade: null }] })]),
    output([card({ basicos: [{ basico: "alho", quantidade: null }] })]),
  ]);
  assert.deepEqual(
    results.map(({ json: j, zod }) => [j, zod]),
    [
      [true, true],
      // Leitura tolerante: o zod descarta a chave extra; o esquema estrito nunca a produz.
      [false, true],
      [false, false],
      [false, false],
    ],
  );
});

test("recipeOutputSchema: refs viram ids e nomes do estoque; o rascunho do grafo guarda só refs", () => {
  const set = recipeOutputSchema(refs, flags).parse(output());
  assert.equal(set.version, 2);
  assert.deepEqual(set.receitas[0].ingredientesCasa, [
    { pantryItemId: "id-arroz", nome: "Arroz", quantidade: "1 xícara" },
    { pantryItemId: "id-tomate", nome: "Tomate", quantidade: "2 unidades" },
  ]);
  assert.deepEqual(set.receitas[0].basicos, [{ basico: "sal", quantidade: "a gosto" }]);
  assert.ok(recipeSetSchema.safeParse(set).success);
  const draft = recipeDraftSchema(refs, flags).parse(output());
  assert.deepEqual(draft.receitas[0].ingredientesCasa.map((i) => i.ref), ["p1", "p2"]);
  assert.doesNotMatch(JSON.stringify(draft), /id-arroz|id-tomate/);
  assert.deepEqual(recipeSetFromDraft(draft, refs), set);
});

test("recipeOutputSchema recusa ref desconhecida, básico desligado, resultado vazio e alergênico", () => {
  const cases: [string, unknown, Flags?, typeof refs?][] = [
    ["ref desconhecida", output([card({ ingredientesCasa: [{ ref: "p3", quantidade: null }] })])],
    ["básico desligado", output([card({ basicos: [{ basico: "alho", quantidade: null }] })])],
    ["básico inexistente", output([card({ basicos: [{ basico: "gengibre", quantidade: null }] })])],
    ["listas vazias", output([], [])],
    ["único passo vazio", output([card({ passos: [step("  ")] })])],
    ["sem item da casa", output([card({ ingredientesCasa: [] })])],
    ["refeição fora da lista", output([card({ refeicao: "Brunch" })])],
    ["nome esvaziado pela limpeza", output([card({ nome: "🍝 ##" })])],
    ["alergênico em falta comprar", output([card({ faltaComprar: [{ nome: "Amendoim torrado", quantidade: null }] })]), { ...flags, allergyDetails: "amendoim" }],
    ["alergênico no nome", output([card({ nome: "Frango com amendoim" })])],
    ["alergênico no passo", output([card({ passos: [step("Polvilhe amendoim picado.")] })])],
    [
      "alergênico no estoque",
      output([card({ ingredientesCasa: [{ ref: "p1", quantidade: null }], basicos: [] })]),
      flags,
      recipeRefs({ pantry: [{ id: "id-pasta", name: "Pasta de amendoim" }] }),
    ],
    [
      "alergênico no básico",
      output([card({ basicos: [{ basico: "farinha", quantidade: null }] })]),
      { ...flags, allergyDetails: "Trigo" },
      recipeRefs({ pantry: PANTRY, kitchenBasics: ["farinha"] }),
    ],
  ];
  for (const [label, value, f = flags, r = refs] of cases)
    assert.equal(recipeOutputSchema(r, f).safeParse(value).success, false, label);
  // "sem amendoim" no nome do prato não sugere o alergênico; sem alergia declarada, o item passa.
  assert.ok(recipeOutputSchema(refs, flags).safeParse(output([card({ nome: "Bolo sem amendoim" })])).success);
  const peanuts = output([card({ faltaComprar: [{ nome: "Amendoim torrado", quantidade: null }] })]);
  assert.ok(recipeOutputSchema(refs, { ...flags, allergyDetails: "" }).safeParse(peanuts).success);
  // Só perguntas é uma resposta válida.
  assert.ok(recipeOutputSchema(refs, flags).safeParse(output([], ["Você almoça em casa?"])).success);
});

test("recipeOutputSchema repara repetições, números fora da faixa, textos com markdown ou emoji e listas longas", () => {
  const raw = output(
    [
      card({
        nome: "🍝 ## Macarrão **caseiro**",
        porcoes: 40,
        tempoMin: 0,
        compatibilidade: `Combina com o almoço. ${"x".repeat(500)}`,
        ingredientesCasa: [
          { ref: "p1", quantidade: "" },
          { ref: "p1", quantidade: "2 xícaras" },
          { ref: "p2", quantidade: "  " },
        ],
        basicos: [
          { basico: "sal", quantidade: null },
          { basico: "sal", quantidade: "1 pitada" },
        ],
        faltaComprar: [
          { nome: "", quantidade: "1" },
          { nome: "🧅 Cebola", quantidade: null },
          ...Array.from({ length: 12 }, (_, i) => ({ nome: `Item ${i}`, quantidade: null })),
        ],
        passos: [
          step("## Arroz\n1. passo", 2.6, 20),
          step("", 5),
          step("Asse.", 500, 200),
          ...Array.from({ length: 12 }, (_, i) => step(`Passo ${i}`)),
        ],
        porcao: null,
      }),
      card(),
      card({ nome: "Terceira receita" }),
    ],
    ["", "Você almoça em casa?"],
  );
  const set = recipeOutputSchema(refs, flags).parse(raw);
  assert.equal(set.receitas.length, L.receitas);
  const [first] = set.receitas;
  assert.equal(first.nome, "Macarrão caseiro");
  assert.deepEqual([first.porcoes, first.tempoMin], [12, 1]);
  assert.equal(first.compatibilidade.length, L.compatibilidade);
  assert.deepEqual(first.ingredientesCasa, [
    { pantryItemId: "id-arroz", nome: "Arroz", quantidade: null },
    { pantryItemId: "id-tomate", nome: "Tomate", quantidade: null },
  ]);
  assert.deepEqual(first.basicos, [{ basico: "sal", quantidade: null }]);
  assert.equal(first.faltaComprar.length, L.compras);
  assert.equal(first.faltaComprar[0].nome, "Cebola");
  assert.equal(first.passos.length, L.passos);
  assert.deepEqual(first.passos[0], step("Arroz 1. passo", 3, null));
  assert.deepEqual(first.passos[1], step("Asse.", null, 200));
  assert.equal(first.porcao, "");
  assert.deepEqual(set.perguntas, ["Você almoça em casa?"]);
  assert.ok(recipeSetSchema.safeParse(set).success);
});

test("hideCalories na leitura: calorias mascaradas antes do recorte, sem tocar ids nem refeição", () => {
  const hidden = { ...flags, hideCalories: true };
  const compatibilidade = "Prato leve de 300 kcal para o almoço. ".repeat(10).slice(0, 240);
  const stock = recipeRefs({ pantry: [{ id: "id-barra", name: "Barra 200 kcal" }, ...PANTRY] });
  const set = recipeOutputSchema(stock, hidden).parse(
    output([card({ compatibilidade, basicos: [], ingredientesCasa: [{ ref: "p1", quantidade: "1 barra de 90 kcal" }] })]),
  );
  const [recipe] = set.receitas;
  assert.ok(recipe.compatibilidade.length <= L.compatibilidade);
  assert.ok(recipe.compatibilidade.includes(HIDDEN_CALORIES));
  assert.doesNotMatch(recipe.compatibilidade, /\[[^\]]*$/);
  assert.doesNotMatch(JSON.stringify(set), CALORIE_MENTION);
  assert.deepEqual(recipe.ingredientesCasa[0], {
    pantryItemId: "id-barra",
    nome: `Barra ${HIDDEN_CALORIES}`,
    quantidade: `1 barra de ${HIDDEN_CALORIES}`,
  });
  assert.equal(recipe.refeicao, "Almoço");
  // O envelope já sai mascarado: a máscara genérica do buildReply não muda nada.
  assert.deepEqual(maskStructured({ kind: "recipes", set }, true), { kind: "recipes", set });
});

test("contexto compacto: despensa com refs e sem ids; básicos normalizados; outros modos intactos", () => {
  const state = readyState(["sal"]);
  const context = recipeContext(state);
  const pantry = compactContext(context).pantry as Node[];
  assert.deepEqual(Object.keys(pantry[0]), ["ref", "name", "quantity", "unit", "location", "expiresOn", "notes"]);
  assert.deepEqual(pantry.map((row) => [row.ref, row.name]), [["p1", "Arroz"], ["p2", "Tomate"]]);
  assert.doesNotMatch(JSON.stringify(pantry), new RegExp(state.pantry.map((i) => i.id).join("|")));
  assert.deepEqual(compactContext(context).kitchenBasics, ["sal"]);
  const { kitchenBasics: _old, ...legacy } = context;
  assert.deepEqual(compactContext(legacy).kitchenBasics, []);
  assert.deepEqual(compactContext({ ...context, kitchenBasics: ["alho", "gengibre", "sal"] }).kitchenBasics, ["sal", "alho"]);
  assert.deepEqual(compactContext({ ...context, kitchenBasics: "x" }).kitchenBasics, []);
  // As refs do contexto e as do esquema são as mesmas.
  const fromContext = recipeRefs(context);
  assert.deepEqual(fromContext.refs, ["p1", "p2"]);
  assert.equal(fromContext.byRef.get("p2")?.id, state.pantry[1].id);
  const chat = compactContext(agentContext(state));
  assert.equal("pantry" in chat, false);
  assert.equal("kitchenBasics" in chat, false);
});

test("especificação das receitas: registro por pedido, adendo sensível, campos da guarda e envelope do nutricionista", () => {
  const context = recipeContext(readyState());
  const spec = specFor("recipe", flags, context);
  assert.equal(spec?.name, RECIPE_SCHEMA_NAME);
  assert.equal(spec?.kind, "recipes");
  assert.equal(specFor("recipe", flags, {}), null);
  assert.equal(specFor("recipe", flags, { pantry: [{ name: "Sem id" }] }), null);
  assert.equal(recipeJsonAddendum(flags), RECIPE_JSON_ADDENDUM);
  for (const over of [
    { eatingDisorder: "sim" },
    { eatingDisorder: "nao_informado" },
    { pregnancy: "nao_informado" },
    { pregnancy: "gestacao" },
    { isMinor: true },
  ])
    assert.equal(
      recipeJsonAddendum({ ...flags, ...over }),
      `${RECIPE_JSON_ADDENDUM}\n${RECIPE_JSON_SENSITIVE}`,
      JSON.stringify(over),
    );
  const draft = recipeDraftSchema(refs, flags).parse(output());
  assert.deepEqual(
    recipeFields(draft).map((f) => [f.kind, f.text]),
    [
      // Nomes do estoque são dados da pessoa e ficam de fora; toda quantidade do modelo entra.
      ["name", "Arroz com tomate"],
      ["prose", "Arroz e legumes, como no almoço da sua dieta."],
      ["card", "1 xícara"],
      ["card", "2 unidades"],
      ["food", "Sal"],
      ["card", "a gosto"],
      ["food", "Cebola"],
      ["card", "1 unidade"],
      ["prose", "Cozinhe o arroz."],
      ["prose", "Junte o tomate picado."],
      ["prose", "Sirva 1 porção e complete o prato com salada."],
    ],
  );
  const typed = recipeStructuredSpec(flags, { pantry: PANTRY, kitchenBasics: ["sal"] })!;
  const set = recipeSetFromDraft(draft, refs);
  assert.equal(typed.render(draft), renderRecipeSetText(set));
  assert.deepEqual(typed.toReply([{ role: "nutricionista", value: draft, draft: "" }]), { kind: "recipes", set });
  assert.equal(typed.toReply([{ role: "rotina", value: draft, draft: "" }]), null);
  assert.equal(typed.toReply([{ role: "nutricionista", value: null, draft: TEXT }]), null);
});

test("guarda estruturada nas receitas: nome do estoque não vira dado inventado; macro no que o modelo escreveu, sim", () => {
  const stock = recipeRefs({ pantry: [{ id: "id-iogurte", name: "Iogurte 0% gordura" }] });
  const spec = recipeStructuredSpec(flags, { pantry: [{ id: "id-iogurte", name: "Iogurte 0% gordura" }] })!;
  const lint = (value: unknown) =>
    lintStructured({ role: "nutricionista", value: recipeDraftSchema(stock, flags).parse(value), spec, flags, mode: "recipe" });
  const home = { ingredientesCasa: [{ ref: "p1", quantidade: "1 pote" }], basicos: [] };
  assert.deepEqual(lint(output([card(home)])), []);
  const issues = lint(output([card({ ...home, faltaComprar: [{ nome: "Whey com 30 g de proteína", quantidade: null }] })]));
  assert.deepEqual(issues.map((i) => [i.codigo, i.gravidade]), [["dado_inventado", "hard"]]);
  // Alergênico em texto corrido do modelo: a guarda aponta (a leitura já recusa nomes, itens e passos).
  const prose = lint(output([card({ ...home, compatibilidade: "Acrescente amendoim por cima, como no almoço." })]));
  assert.deepEqual(prose.map((i) => i.codigo), ["alergeno"]);
  // O passo que repete o nome do estoque ("0% gordura" é rótulo do produto) não vira dado inventado.
  const label = lint(output([card({ ...home, passos: [step("Misture o Iogurte 0% gordura com a fruta.")] })]));
  assert.deepEqual(label, []);
});

test("guarda estruturada nas receitas: número de nutrição no texto livre do modelo é hard", () => {
  const home = { ingredientesCasa: [{ ref: "p1", quantidade: "1 xícara" }], basicos: [] };
  const spec = recipeStructuredSpec(flags, { pantry: PANTRY })!;
  const draftRefs = recipeRefs({ pantry: PANTRY });
  const lint = (over: Record<string, unknown>) =>
    lintStructured({
      role: "nutricionista",
      value: recipeDraftSchema(draftRefs, flags).parse(output([card({ ...home, ...over })])),
      spec,
      flags,
      mode: "recipe",
    }).map((i) => `${i.codigo}:${i.gravidade}`);
  assert.deepEqual(lint({}), []);
  assert.deepEqual(lint({ compatibilidade: "Prato leve de 300 kcal, como no almoço." }), ["dado_inventado:hard"]);
  assert.deepEqual(lint({ passos: [step("Sirva a porção de 300 kcal.")] }), ["dado_inventado:hard"]);
  assert.deepEqual(lint({ porcao: "Uma porção tem 300 kcal." }), ["dado_inventado:hard"]);
  assert.deepEqual(lint({ faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade (40 kcal)" }] }), ["dado_inventado:hard"]);
  assert.deepEqual(lint({ ingredientesCasa: [{ ref: "p1", quantidade: "100 g de proteína" }] }), ["dado_inventado:hard"]);
  // Mesmo texto fora dos modos dieta e receita: o texto corrido segue sem essa regra.
  const chatMode = lintStructured({
    role: "nutricionista",
    value: recipeDraftSchema(draftRefs, flags).parse(output([card({ ...home, porcao: "Uma porção tem 300 kcal." })])),
    spec,
    flags,
    mode: "chat",
  });
  assert.deepEqual(chatMode, []);
});

test("contexto compacto com calorias ocultas: nome e notas da despensa mascarados, refs intactas", () => {
  const context = {
    pantry: [
      { id: "id-barra", name: "Barra 200 kcal", notes: "Lanche de 150 calorias" },
      { id: "id-arroz", name: "Arroz", notes: "" },
    ],
    kitchenBasics: ["sal"],
  };
  const hidden = compactContext(context, true).pantry as Node[];
  assert.deepEqual(
    hidden.map((row) => [row.ref, row.name, row.notes]),
    [
      ["p1", `Barra ${HIDDEN_CALORIES}`, `Lanche de ${HIDDEN_CALORIES}`],
      ["p2", "Arroz", ""],
    ],
  );
  assert.doesNotMatch(JSON.stringify(hidden), CALORIE_MENTION);
  assert.equal(recipeRefs(context).byRef.get("p1")?.name, "Barra 200 kcal");
  const shown = compactContext(context).pantry as Node[];
  assert.deepEqual(shown.map((row) => row.name), ["Barra 200 kcal", "Arroz"]);
});

test("grafo de receitas estruturadas: JSON validado vira cartão, texto determinístico e nenhum id ao modelo", async () => {
  const { reply, calls, purposes, state } = run({ nutricionista: json(output()), revisor: APPROVE });
  const result = await reply;
  assert.deepEqual(purposes(), ["nutricionista", "revisor"]);
  const [specialist, reviewer] = calls;
  assert.equal(specialist.jsonSchema?.name, "receitas");
  assert.equal(specialist.maxOutputTokens, MAX_TOKENS.structured);
  assert.match(specialist.instructions, /MODO RECEITAS[\s\S]*FORMATO RECEITAS \(JSON\)/);
  assert.equal(specialist.instructions.includes(RECIPE_JSON_SENSITIVE), false);
  const set = setOf(result);
  const ids = state.pantry.map((i) => i.id);
  assert.deepEqual(set.receitas[0].ingredientesCasa.map((i) => i.pantryItemId), ids);
  assert.equal(result.text, renderRecipeSetText(set));
  assert.equal(result.meta.llmCalls, 2);
  assert.equal(result.meta.reviewed, true);
  const draft = dataBlock(textOf(reviewer), "RASCUNHO_NUTRICIONISTA");
  assert.match(draft, /^## Arroz com tomate/);
  assert.match(draft, /- Arroz — 1 xícara/);
  for (const request of calls)
    for (const id of ids) assert.equal(textOf(request).includes(id), false, `${request.purpose}: ${id}`);
  assert.match(textOf(specialist), /"ref":"p1"/);
  assert.match(reviewer.instructions, /MODO RECEITAS[\s\S]*RASCUNHOS ESTRUTURADOS/);
  // O cliente aceita o envelope e guarda o conjunto estruturado junto do texto.
  const client = agentReplySchema.parse(JSON.parse(JSON.stringify(result)));
  const saved = saveRecipe(state, client, state).recipes.at(-1)!;
  assert.deepEqual(saved.recipeSet, set);
  assert.equal(saved.text, result.text);
});

test("receitas: JSON inválido, alergênico ou ref inventada caem uma vez para o texto, sem segunda tentativa em JSON", async () => {
  const spy = silenceErrors();
  try {
    for (const first of [
      "{quebrado",
      json(output([card({ faltaComprar: [{ nome: "Amendoim torrado", quantidade: null }] })])),
      json(output([card({ ingredientesCasa: [{ ref: "p7", quantidade: null }] })])),
    ]) {
      const { reply, calls, purposes } = run({ nutricionista: [first, TEXT], revisor: APPROVE });
      const result = await reply;
      assert.deepEqual(purposes(), ["nutricionista", "nutricionista", "revisor"]);
      assert.equal(calls[0].jsonSchema?.name, "receitas");
      assert.equal(calls[1].jsonSchema, undefined);
      assert.equal(calls[1].maxOutputTokens, MAX_TOKENS.specialist);
      assert.doesNotMatch(calls[1].instructions, /FORMATO RECEITAS/);
      assert.equal("structured" in result, false);
      assert.equal(result.text, TEXT);
      assert.equal(result.meta.llmCalls, 3);
      assert.doesNotMatch(calls[2].instructions, /RASCUNHOS ESTRUTURADOS/);
    }
  } finally {
    spy.mock.restore();
  }
});

test("receitas: a reserva em texto só roda com tempo para o revisor", async () => {
  const spy = silenceErrors();
  try {
    let late = 0;
    const lateRun = run(
      { nutricionista: [() => ((late = 70_000), "{quebrado"), TEXT], revisor: APPROVE },
      undefined,
      { now: () => late },
    );
    await assert.rejects(lateRun.reply, rejectsWith("invalid_output"));
    assert.deepEqual(lateRun.purposes(), ["nutricionista"]);
    let clock = 0;
    const inTime = run(
      { nutricionista: [() => ((clock = 40_000), "{quebrado"), TEXT], revisor: APPROVE },
      undefined,
      { now: () => clock },
    );
    const result = await inTime.reply;
    assert.deepEqual(inTime.purposes(), ["nutricionista", "nutricionista", "revisor"]);
    assert.ok(inTime.calls[1].timeoutMs <= 100_000 - 40_000 - 25_000 - 1_500);
    assert.equal(result.text, TEXT);
    assert.equal(result.meta.llmCalls, 3);
  } finally {
    spy.mock.restore();
  }
});

test("receitas: truncamento ou erro do provedor na tentativa em JSON usa o texto", async () => {
  const spy = silenceErrors();
  try {
    for (const first of [
      new Error("Resposta incompleta: max_output_tokens"),
      new AgentError("provider", "DeepSeek: finish_reason length"),
    ]) {
      const { reply, purposes } = run({ nutricionista: [first, TEXT], revisor: APPROVE });
      const result = await reply;
      assert.deepEqual(purposes(), ["nutricionista", "nutricionista", "revisor"]);
      assert.equal(result.text, TEXT);
      assert.equal("structured" in result, false);
    }
  } finally {
    spy.mock.restore();
  }
});

test("receitas: cancelamento durante a tentativa em JSON sobe como aborted, sem chamada em texto", async () => {
  const controller = new AbortController();
  const { reply, purposes } = run(
    {
      nutricionista: [
        () => {
          controller.abort();
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        },
        TEXT,
      ],
    },
    undefined,
    { signal: controller.signal },
  );
  await assert.rejects(reply, rejectsWith("aborted"));
  assert.deepEqual(purposes(), ["nutricionista"]);
});

test("receitas: revisão refaz em JSON com o rascunho anterior em refs; reescrita em texto tira a estrutura", async () => {
  const issue = {
    papel: "nutricionista",
    codigo: "dado_inventado",
    trecho: "Cozinhe o arroz.",
    correcao: "Inclua o tempo e a temperatura do forno.",
    gravidade: "hard",
  };
  const second = output([card({ nome: "Arroz de forno com tomate", passos: [step("Asse tudo.", 25, 200)] })]);
  const { reply, calls, purposes, state } = run({
    nutricionista: [json(output()), json(second)],
    revisor: [review("revisar", [issue]), APPROVE],
  });
  const result = await reply;
  assert.deepEqual(purposes(), ["nutricionista", "revisor", "nutricionista", "revisor"]);
  const rewrite = calls[2];
  assert.equal(rewrite.jsonSchema?.name, "receitas");
  assert.match(rewrite.instructions, /REVISÃO SOLICITADA[\s\S]*dado_inventado/);
  const previous = JSON.parse(dataBlock(textOf(rewrite), "RASCUNHO_ANTERIOR"));
  assert.deepEqual(previous, recipeDraftSchema(refs, flags).parse(output()));
  for (const id of state.pantry.map((i) => i.id)) assert.equal(textOf(rewrite).includes(id), false);
  const set = setOf(result);
  assert.equal(set.receitas[0].nome, "Arroz de forno com tomate");
  assert.deepEqual(set.receitas[0].passos, [step("Asse tudo.", 25, 200)]);
  assert.equal(result.text, renderRecipeSetText(set));
  assert.equal(result.meta.revisions, 1);

  const inText = run({
    nutricionista: [json(output()), TEXT],
    revisor: [review("revisar", [issue]), APPROVE],
  });
  const textual = await inText.reply;
  assert.equal("structured" in textual, false);
  assert.equal(textual.text, TEXT);
});

test("receitas com calorias ocultas: mascaradas no conjunto e no texto", async () => {
  const { reply } = run(
    {
      nutricionista: json(output([card({ compatibilidade: "Prato leve de 300 kcal, como no almoço da sua dieta." })])),
      revisor: APPROVE,
    },
    readyState(["sal"], { hideCalories: true }),
  );
  const result = await reply;
  const set = setOf(result);
  assert.equal(set.receitas[0].compatibilidade, `Prato leve de ${HIDDEN_CALORIES}, como no almoço da sua dieta.`);
  assert.ok(result.text.includes(HIDDEN_CALORIES));
  assert.doesNotMatch(result.text, CALORIE_MENTION);
  assert.doesNotMatch(JSON.stringify(result.structured), CALORIE_MENTION);
});

test("receitas em perfil sensível: a tentativa em JSON leva a cautela extra", async () => {
  for (const [profile, sensitive] of [
    [{ eatingDisorder: "sim" }, true],
    [{ pregnancy: "nao_informado" }, true],
    [{}, false],
  ] as const) {
    const { reply, calls } = run({ nutricionista: json(output()), revisor: APPROVE }, readyState(["sal"], profile));
    await reply;
    assert.equal(calls[0].instructions.includes(RECIPE_JSON_SENSITIVE), sensitive, JSON.stringify(profile));
  }
});

test("agentReplySchema: receitas válidas passam; kind desconhecido ou campo inválido só descartam a estrutura", () => {
  const set = recipeOutputSchema(refs, flags).parse(output());
  const base = { text: renderRecipeSetText(set), meta: META };
  assert.deepEqual(agentReplySchema.parse({ ...base, structured: { kind: "recipes", set } }).structured, {
    kind: "recipes",
    set,
  });
  for (const structured of [
    { kind: "desconhecido", data: {} },
    { kind: "recipes", set: { ...set, version: 3 } },
    { kind: "recipes", set: { ...set, receitas: [{ ...set.receitas[0], refeicao: "Brunch" }] } },
    { kind: "recipes", data: set },
  ]) {
    const parsed = agentReplySchema.parse({ ...base, structured });
    assert.equal(parsed.structured, undefined, JSON.stringify(structured).slice(0, 60));
    assert.equal(parsed.text, base.text);
  }
  // Pior caso mascarado: todas as listas e textos no limite, com calorias ocultas.
  const kcal = (n: number) => "300 kcal ".repeat(n).trim();
  const worst = card({
    nome: `Prato ${kcal(20)}`,
    compatibilidade: kcal(40),
    ingredientesCasa: [
      { ref: "p1", quantidade: kcal(10) },
      { ref: "p2", quantidade: kcal(10) },
    ],
    basicos: [{ basico: "sal", quantidade: kcal(10) }],
    faltaComprar: Array.from({ length: L.compras }, (_, i) => ({ nome: `Item ${i} ${kcal(10)}`, quantidade: kcal(10) })),
    passos: Array.from({ length: L.passos }, () => step(kcal(60), 240, 300)),
    porcao: kcal(40),
  });
  const maxSet = recipeOutputSchema(refs, { ...flags, hideCalories: true }).parse(
    output([worst, worst], Array.from({ length: L.perguntas }, () => kcal(40))),
  );
  const reply = agentReplySchema.parse({
    text: renderRecipeSetText(maxSet),
    meta: META,
    structured: { kind: "recipes", set: maxSet },
  });
  assert.deepEqual(reply.structured, { kind: "recipes", set: maxSet });
  assert.ok(reply.text.length <= 20_000);
  assert.doesNotMatch(JSON.stringify(maxSet), CALORIE_MENTION);
});

test("prompts das receitas: básicos com a legenda das chaves, lista vazia e formato JSON", () => {
  const legend = kitchenBasicsLegend();
  assert.ok(legend.includes("cheiro_verde=Cheiro-verde"));
  assert.match(RECIPE_ADDENDUM, /kitchenBasics/);
  assert.ok(RECIPE_ADDENDUM.includes("lista vazia significa nenhum"));
  assert.ok(RECIPE_ADDENDUM.includes(legend));
  assert.ok(RECIPE_REVIEW_ADDENDUM.includes("Básicos"));
  assert.ok(RECIPE_REVIEW_ADDENDUM.includes(legend));
  assert.match(RECIPE_JSON_ADDENDUM, /^FORMATO RECEITAS \(JSON\)/);
  assert.match(RECIPE_JSON_ADDENDUM, /Nunca inclua calorias, macronutrientes, ids, marcas ou emoji\.$/);
});

/** Resposta do mock do E2E (pantry.spec.ts, caso 6): montada a partir do pedido que o app envia. */
function e2eRecipeReply(body: { context: { pantry: { id: string; name: string }[] } }): AgentReply {
  const set: RecipeSet = {
    version: 2,
    receitas: [
      {
        nome: "Arroz com tomate",
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade: "Combina com o almoço da sua dieta.",
        ingredientesCasa: body.context.pantry.map((i) => ({ pantryItemId: i.id, nome: i.name, quantidade: null })),
        basicos: [],
        faltaComprar: [{ nome: "Cebola", quantidade: "1 unidade" }],
        passos: [
          { texto: "Cozinhe o arroz.", timerMin: 15, temperaturaC: null },
          { texto: "Junte o tomate.", timerMin: null, temperaturaC: null },
        ],
        porcao: "Sirva 1 porção.",
      },
    ],
    perguntas: [],
  };
  return { text: renderRecipeSetText(set), meta: META, structured: { kind: "recipes", set } };
}

test("mock do E2E 6: resposta montada do pedido passa no cliente e salva a receita estruturada", () => {
  const state = readyState([]);
  const body = JSON.parse(JSON.stringify({ context: recipeContext(state) }));
  const reply = agentReplySchema.parse(JSON.parse(JSON.stringify(e2eRecipeReply(body))));
  const saved = saveRecipe(state, reply, state).recipes.at(-1)!;
  assert.equal(saved.recipeSet?.receitas[0].nome, "Arroz com tomate");
  assert.equal(saved.text, renderRecipeSetText(saved.recipeSet!));
});
