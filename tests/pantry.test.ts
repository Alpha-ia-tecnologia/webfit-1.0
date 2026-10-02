import { test } from "node:test";
import assert from "node:assert/strict";
import { stateFixture } from "./fixtures";
import { createDietPlan } from "../src/lib/diet";
import { agentContext, localDate, shiftDate } from "../src/lib/domain";
import { extractFlags } from "../server/graph/prepare";
import {
  expiryStatus,
  agentRequestContext,
  availablePantry,
  emptyPantryDraft,
  recipeContext,
  savePantryDrafts,
  saveRecipe,
} from "../src/lib/pantry";
import { stateSchema, type AgentReply, type AppState } from "../src/types";
import { requestSchema } from "../server/agent";
import { scanPantry } from "../server/pantry";
import { buildAgentGraph, runAgent } from "../server/graph/graph";
import type { ModelRequest } from "../server/model";

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
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
function readyState() {
  let s = stateFixture();
  s.profile = { ...s.profile!, consentAi: true };
  s.dietPlan = createDietPlan(reply, s.profile);
  return savePantryDrafts(
    s,
    [{ ...emptyPantryDraft(), name: "Arroz", quantity: 1, unit: "kg" }],
    "manual",
  );
}
test("estoque: estados antigos carregam vazios, compras confirmadas são disponíveis e persistentes", () => {
  const { pantry, recipes, ...old } = stateFixture();
  const legacy = stateSchema.parse(old);
  assert.deepEqual(legacy.pantry, []);
  assert.deepEqual(legacy.recipes, []);
  const saved = savePantryDrafts(
    legacy,
    [{ ...emptyPantryDraft("geladeira"), name: "Tomate", quantity: null }],
    "shopping_photo",
  );
  const loaded = stateSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.equal(availablePantry(loaded.pantry).length, 1);
  assert.equal(loaded.pantry[0].source, "shopping_photo");
  assert.equal(loaded.pantry[0].quantity, null);
  assert.equal(loaded.pantry[0].location, "geladeira");
  assert.deepEqual(loaded.diary, legacy.diary);
});
test("estoque: edição preserva identidade, valida valores e não mistura lotes", () => {
  const s = readyState(),
    item = s.pantry[0];
  const edited = savePantryDrafts(
    s,
    [{ ...item, quantity: 0.5, location: "geladeira" }],
    item.source,
    item.id,
  );
  assert.equal(edited.pantry.length, 1);
  assert.equal(edited.pantry[0].id, item.id);
  assert.equal(edited.pantry[0].quantity, 0.5);
  assert.throws(() =>
    savePantryDrafts(s, [{ ...item, quantity: 0 }], "manual"),
  );
  assert.throws(() => savePantryDrafts(s, [{ ...item, name: " " }], "manual"));
  assert.throws(() =>
    savePantryDrafts(s, [{ ...item, expiresOn: "2026-02-30" }], "manual"),
  );
  assert.throws(() => savePantryDrafts(s, [item], "manual", "removido"));
  assert.equal(savePantryDrafts(s, [item], "shopping_photo").pantry.length, 2);
});
test("receitas: exigem dieta atual e excluem vencidos sem excluir compras realizadas", () => {
  const s = readyState();
  const withItems = savePantryDrafts(
    s,
    [
      {
        ...emptyPantryDraft("geladeira"),
        name: "Tomate",
        expiresOn: localDate(),
      },
      {
        ...emptyPantryDraft(),
        name: "Leite vencido",
        expiresOn: shiftDate(localDate(), -1),
      },
    ],
    "shopping_photo",
  );
  const context = recipeContext(withItems);
  assert.deepEqual(
    context.pantry.map((i) => i.name),
    ["Arroz", "Tomate"],
  );
  assert.equal(context.dietPlan.id, s.dietPlan!.id);
  assert.deepEqual(context.kitchenBasics, []);
  assert.deepEqual(
    recipeContext({ ...withItems, kitchenBasics: ["sal", "alho"] }).kitchenBasics,
    ["sal", "alho"],
  );
  assert.throws(
    () => recipeContext({ ...s, dietPlan: null }),
    /Crie sua dieta/,
  );
  assert.throws(
    () =>
      recipeContext({
        ...s,
        profile: { ...s.profile!, allergyDetails: "Leite" },
      }),
    /Atualize sua dieta/,
  );
  assert.throws(
    () => recipeContext({ ...s, pantry: [] }),
    /Cadastre alimentos/,
  );
  assert.deepEqual(agentRequestContext(s, "shopping_photo", "geladeira"), {
    location: "geladeira",
  });
});
test("recipeContext omits structured: a dieta vai com os cinco campos do texto, sem o plano estruturado", () => {
  const s = readyState();
  const structured = { version: 2 } as unknown as NonNullable<AppState["dietPlan"]>["structured"];
  const withPlan: AppState = { ...s, dietPlan: { ...s.dietPlan!, structured } };
  const context = recipeContext(withPlan);
  assert.deepEqual(Object.keys(context.dietPlan).sort(), [
    "createdAt",
    "id",
    "meta",
    "profileSignature",
    "text",
  ]);
  assert.ok(!("structured" in context.dietPlan));
  assert.doesNotMatch(JSON.stringify(context.dietPlan), /"structured"/);
  const { structured: _omit, ...legacy } = withPlan.dietPlan!;
  assert.deepEqual(context.dietPlan, legacy);
});
test("receitas: resposta revisada persiste e respostas com contexto antigo são recusadas", () => {
  const s = readyState(),
    saved = saveRecipe(s, reply, s);
  assert.equal(
    stateSchema.parse(JSON.parse(JSON.stringify(saved))).recipes.length,
    1,
  );
  assert.deepEqual(saved.pantry, s.pantry);
  assert.throws(
    () =>
      saveRecipe(
        { ...s, pantry: [{ ...s.pantry[0], quantity: 0.5 }] },
        reply,
        s,
      ),
    /mudaram/,
  );
  assert.throws(() =>
    saveRecipe(
      { ...s, profile: { ...s.profile!, consentAi: false } },
      reply,
      s,
    ),
  );
  assert.throws(() => saveRecipe({ ...s, userId: "outra-pessoa" }, reply, s));
  assert.throws(
    () =>
      saveRecipe(s, { ...reply, meta: { ...reply.meta, reviewed: false } }, s),
    /revisada/,
  );
});
test("foto das compras: transcrição produz rascunho editável no destino escolhido, sem anamnese", async () => {
  let call: ModelRequest | undefined;
  const scan = await scanPantry(
    async (req) => {
      call = req;
      return JSON.stringify({
        items: [{ ...emptyPantryDraft(), name: "Tomate", quantity: 2 }],
        notes: "Confira a embalagem.",
      });
    },
    "shopping_photo",
    image,
    { location: "geladeira" },
  );
  assert.equal(scan.inventoryDraft?.items[0].location, "geladeira");
  assert.equal(scan.inventoryDraft?.items[0].quantity, 2);
  assert.equal(scan.meta.reviewed, false);
  assert.equal(call?.history.length, 0);
  assert.deepEqual(call?.parts, [{ type: "image", dataUrl: image }]);
  assert.match(call!.instructions, /JÁ REALIZADAS/);
  assert.doesNotMatch(call!.instructions, /NÃO comprova estoque/);
  assert.equal(call!.jsonSchema?.name, "pantry_scan");
});
test("foto: resposta ilegível, formato inválido e cancelamento não criam estoque", async () => {
  await assert.rejects(
    scanPantry(async () => "texto inválido", "pantry_photo", image, {}),
    /Não foi possível ler/,
  );
  let calls = 0;
  await assert.rejects(
    scanPantry(
      async () => {
        calls++;
        return "{}";
      },
      "shopping_photo",
      "data:application/pdf;base64,JVBERi0xLjQ=",
      {},
    ),
  );
  assert.equal(calls, 0);
  const control = new AbortController();
  await assert.rejects(
    scanPantry(
      async () => {
        control.abort();
        return JSON.stringify({ items: [], notes: "" });
      },
      "pantry_photo",
      image,
      {},
      control.signal,
    ),
    /cancelado/,
  );
  const empty = await scanPantry(
    async () => JSON.stringify({ items: [], notes: "Foto desfocada." }),
    "pantry_photo",
    image,
    {},
  );
  assert.deepEqual(empty.inventoryDraft?.items, []);
});
test("API: receita exige dieta e estoque válido; reconhecimento exige foto e consentimento", () => {
  const s = readyState();
  const req = {
    mode: "recipe",
    text: "Sugira receitas.",
    consent: true,
    history: [],
    context: recipeContext(s),
  };
  assert.equal(requestSchema.safeParse(req).success, true);
  assert.equal(
    requestSchema.safeParse({
      ...req,
      context: { ...req.context, currentProfileSignature: "antiga" },
    }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({ ...req, context: { ...req.context, pantry: [] } })
      .success,
    false,
  );
  assert.equal(requestSchema.safeParse({ ...req, file: image }).success, false);
  // Básicos de cozinha: válidos, ausentes (apps antigos) ou com chave desconhecida nunca dão 400.
  for (const kitchenBasics of [["sal", "alho"], [], ["sal", "gengibre"], "x", undefined])
    assert.equal(
      requestSchema.safeParse({ ...req, context: { ...req.context, kitchenBasics } })
        .success,
      true,
      JSON.stringify(kitchenBasics),
    );
  const scan = {
    mode: "shopping_photo",
    text: "Ler compras realizadas.",
    consent: true,
    history: [],
    context: {},
    file: image,
  };
  assert.equal(requestSchema.safeParse(scan).success, true);
  assert.equal(
    requestSchema.safeParse({ ...scan, file: undefined }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({ ...scan, consent: false }).success,
    false,
  );
});
test("grafo de receitas envia dieta e estoque ao nutricionista e exige revisor", async () => {
  const calls: ModelRequest[] = [];
  // Receitas estruturadas: o item da despensa vai pela ref (p1 = Arroz), nunca pelo id.
  const recipes = {
    receitas: [
      {
        nome: "Arroz com legumes",
        refeicao: "Almoço",
        porcoes: 2,
        tempoMin: 25,
        compatibilidade: "Arroz com legumes, como no almoço da sua dieta.",
        ingredientesCasa: [{ ref: "p1", quantidade: "1 xícara" }],
        basicos: [],
        faltaComprar: [{ nome: "Cenoura", quantidade: "1 unidade" }],
        passos: [
          { texto: "Cozinhe o arroz.", timerMin: 15, temperaturaC: null },
          { texto: "Junte a cenoura ralada.", timerMin: null, temperaturaC: null },
        ],
        porcao: "Sirva 1 porção.",
      },
    ],
    perguntas: [],
  };
  const graph = buildAgentGraph({
    generate: async (call) => {
      calls.push(call);
      if (call.purpose === "revisor")
        return JSON.stringify({
          veredito: "aprovado",
          problemas: [],
          observacao: "",
        });
      return call.jsonSchema?.name === "receitas"
        ? JSON.stringify(recipes)
        : reply.text;
    },
  });
  const result = await runAgent(
    {
      mode: "recipe",
      text: "Sugira receitas com os alimentos disponíveis.",
      consent: true,
      history: [],
      context: recipeContext(readyState()),
    },
    graph,
  );
  assert.deepEqual(
    calls.map((c) => c.purpose),
    ["nutricionista", "revisor"],
  );
  assert.equal(result.meta.reviewed, true);
  assert.equal(calls[0].jsonSchema?.name, "receitas");
  assert.match(calls[0].instructions, /MODO RECEITAS/);
  assert.match(JSON.stringify(calls[0].parts), /dietPlan/);
  assert.match(JSON.stringify(calls[0].parts), /Arroz/);
  assert.match(calls[1].instructions, /MODO RECEITAS/);
  assert.equal(result.structured?.kind, "recipes");
  assert.match(result.text, /^## Arroz com legumes/);
});

test("validade relativa: atenção perto do fim e depois de vencido, com o aviso das receitas", () => {
  const today = "2026-09-26";
  assert.deepEqual(expiryStatus("2026-10-10", today), { label: "Vence em 14 dias", tone: "ok" });
  assert.deepEqual(expiryStatus("2026-09-29", today), { label: "Vence em 3 dias", tone: "soon" });
  assert.deepEqual(expiryStatus("2026-09-26", today), { label: "Vence hoje", tone: "soon" });
  assert.deepEqual(expiryStatus("2026-09-24", today), {
    label: "Venceu há 2 dias — não usado nas receitas",
    tone: "expired",
  });
});

test("descrição de refeição: contexto mínimo (alergias, evitados e sinais), sem remédios, exames nem medidas", () => {
  const s = stateFixture();
  const today = localDate();
  s.profile = {
    ...s.profile!,
    medications: "Losartana 50 mg",
    conditions: "Hipertensão",
    allergies: "sim",
    allergyDetails: "Amendoim",
    avoidedFoods: "Fígado",
    pregnancy: "gestacao",
    hideCalories: true,
    hideBodyNumbers: true,
  };
  s.measurements = [{ ...(s.measurements[0] ?? {}), id: "m1", date: today, weight: 72 } as AppState["measurements"][number]];
  s.exams = [{ id: "e1", name: "Glicemia", date: today, notes: "102 mg/dL" } as AppState["exams"][number]];
  const context = agentRequestContext(s, "meal_text") as Record<string, unknown>;
  assert.deepEqual(Object.keys(context).sort(), ["age", "anamnese", "date", "missingInformation"]);
  assert.deepEqual(context.missingInformation, []);
  assert.deepEqual(Object.keys(context.anamnese as object).sort(), [
    "allergies",
    "allergyDetails",
    "avoidedFoods",
    "diet",
    "eatingDisorder",
    "fluidRestriction",
    "hideBodyNumbers",
    "hideCalories",
    "pregnancy",
  ]);
  const sent = JSON.stringify(context);
  for (const secret of ["Losartana", "Hipertensão", "Glicemia", "102 mg/dL", "injections", "measurements", "diary"])
    assert.equal(sent.includes(secret), false, secret);
  // O servidor ainda recebe alergias, evitados, idade e os sinais de segurança.
  const full = extractFlags(agentContext(s));
  const minimal = extractFlags(context);
  for (const key of [
    "allergies",
    "allergyDetails",
    "avoidedFoods",
    "pregnancy",
    "eatingDisorder",
    "fluidRestriction",
    "hideCalories",
    "hideBodyNumbers",
    "isMinor",
  ] as const)
    assert.deepEqual(minimal[key], full[key], key);
  assert.equal(minimal.medications, "");
  // Os outros modos continuam com o contexto completo.
  assert.equal(JSON.stringify(agentRequestContext(s, "chat")).includes("Losartana"), true);
  assert.throws(() => agentRequestContext({ ...s, profile: null }, "meal_text"), /Conclua a anamnese/);
});

test("conversa leva os títulos dos sinais do app como fatos; os outros modos não", () => {
  const s = stateFixture();
  const chat = agentRequestContext(s, "chat") as Record<string, unknown>;
  assert.ok(Array.isArray(chat.signals));
  assert.equal(extractFlags(chat).hideCalories, extractFlags(agentContext(s)).hideCalories);
  assert.equal("signals" in (agentRequestContext(s, "diet") as Record<string, unknown>), false);
  assert.equal("signals" in (agentRequestContext(s, "meal_text") as Record<string, unknown>), false);
});
