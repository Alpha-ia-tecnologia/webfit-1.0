import { test } from "node:test";
import assert from "node:assert/strict";
import { requestSchema } from "../server/agent";
import {
  buildAgentGraph,
  runAgent,
  type AgentInput,
} from "../server/graph/graph";
import { AgentError } from "../server/graph/state";
import type { ModelRequest } from "../server/model";
import { createDietPlan } from "../src/lib/diet";
import { PLAN_TIMES_NOTE, renderDietText } from "../src/lib/diet-plan";
import { agentContext } from "../src/lib/domain";
import { stateFixture } from "./fixtures";
import { DIET_PLAN_V2 } from "./structured-fixtures";

const PLAN = `## Resumo da sua anamnese
Você busca manter o peso e dispõe de 30 minutos para cozinhar.
## Seu dia de alimentação
- Café da manhã, 8h: sugestão de uma fatia de pão e uma fruta.
- Almoço, 12h: sugestão de três colheres de arroz, uma concha de feijão e legumes.
- Jantar, 19h: sugestão de uma porção de frango com legumes e arroz.
## Substituições
No almoço, você pode trocar arroz por batata cozida; no jantar, frango por feijão.
## Para facilitar
Prepare feijão em quantidade e organize as compras conforme seu orçamento semanal.`;
const approve = JSON.stringify({
  veredito: "aprovado",
  problemas: [],
  observacao: "",
});
function input(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    mode: "diet",
    text: "Crie minha dieta personalizada com base na anamnese.",
    consent: true,
    context: agentContext(stateFixture()),
    history: [],
    ...overrides,
  };
}

/** Mesmo roteiro por purpose dos testes do grafo, sem acesso a provedores reais. */
function run(
  request = input(),
  script: Record<string, string | string[]> = {
    nutricionista: PLAN,
    revisor: approve,
  },
) {
  const calls: ModelRequest[] = [];
  const queues = new Map<string, string[]>();
  const graph = buildAgentGraph({
    generate: async (call) => {
      calls.push(call);
      const entry = script[call.purpose];
      assert.ok(entry, `Chamada inesperada: ${call.purpose}`);
      if (!queues.has(call.purpose))
        queues.set(call.purpose, Array.isArray(entry) ? [...entry] : [entry]);
      const queue = queues.get(call.purpose)!;
      return queue.length > 1 ? queue.shift()! : queue[0]!;
    },
  });
  return { reply: runAgent(request, graph), calls };
}
const textOf = (call: ModelRequest) =>
  call.parts
    .map((part) => (part.type === "text" ? part.text : "[mídia]"))
    .join("\n");
const purposes = (calls: ModelRequest[]) => calls.map((call) => call.purpose);

test("dieta: exige anamnese mínima e consentimento; recusa anexos antes do modelo", async () => {
  assert.equal(requestSchema.safeParse(input()).success, true);
  const missingField = input();
  delete (missingField.context.anamnese as Record<string, unknown>).conditions;
  // Condições sem resposta: nem a lista nem o texto livre (perfil antigo em branco).
  const noConditions = input();
  Object.assign(noConditions.context.anamnese as Record<string, unknown>, {
    conditionTags: [],
    conditions: "",
  });
  // Com a lista respondida, os detalhes podem ficar em branco.
  const listedOnly = input();
  Object.assign(listedOnly.context.anamnese as Record<string, unknown>, {
    conditionTags: ["nenhuma"],
    conditions: "",
  });
  assert.equal(requestSchema.safeParse(listedOnly).success, true);
  const noAllergyDetails = input();
  (
    noAllergyDetails.context.anamnese as Record<string, unknown>
  ).allergyDetails = " ";
  const malformedGoals = input();
  malformedGoals.context.goals = "inválido";
  for (const request of [
    input({ context: {} }),
    input({ context: { age: 34, anamnese: {} } }),
    input({ context: { ...input().context, age: null } }),
    input({ context: { ...input().context, age: -1 } }),
    input({ file: "data:image/png;base64,AAAA" }),
    input({ file: "" }),
    missingField,
    noConditions,
    noAllergyDetails,
    malformedGoals,
  ]) {
    assert.equal(requestSchema.safeParse(request).success, false);
    const { reply, calls } = run(request);
    await assert.rejects(
      reply,
      (error: unknown) =>
        error instanceof AgentError &&
        error.code === "input" &&
        error.status === 400,
    );
    assert.equal(calls.length, 0);
  }
  assert.equal(
    requestSchema.safeParse({ ...input(), consent: false }).success,
    false,
  );
  // O chat continua aceitando contexto parcial, sem impor a nova anamnese mínima.
  assert.equal(
    requestSchema.safeParse(input({ mode: "chat", context: {} })).success,
    true,
  );
});

test("dieta: nutricionista recebe anamnese e plano sai apenas após guarda e revisor", async () => {
  const { reply, calls } = run();
  const result = await reply;
  assert.deepEqual(purposes(calls), ["nutricionista", "revisor"]);
  assert.equal(result.text, PLAN);
  assert.deepEqual(result.meta.specialists, ["nutricionista"]);
  assert.equal(result.meta.reviewed, true);
  assert.equal(result.meta.llmCalls, 2);
  assert.match(calls[0].instructions, /MODO DIETA PERSONALIZADA APÓS ANAMNESE/);
  assert.match(calls[0].instructions, /porções sugeridas em medidas caseiras/);
  assert.match(calls[0].instructions, /Substituições/);
  assert.match(calls[0].instructions, /foodBudget, cookingTime, favoriteFoods/);
  assert.match(calls[1].instructions, /MODO DIETA/);
  assert.match(calls[1].instructions, /apenas um resumo/);
  for (const call of calls) {
    assert.match(textOf(call), /Café às 8h, almoço às 12h e jantar às 19h/);
    assert.match(textOf(call), /Arroz e feijão/);
    assert.match(textOf(call), /Amendoim/);
    assert.match(textOf(call), /Camarão/);
    assert.match(textOf(call), /Meta calórica: 1800 kcal/);
    assert.doesNotMatch(textOf(call), /Pessoa Teste|1992-06-15|\[mídia\]/);
    assert.deepEqual(call.history, []);
  }
});

test("dieta: revisor exige completar cardápio e recebe a versão reescrita", async () => {
  const summary = "Sua prioridade é organizar a alimentação.";
  const revise = JSON.stringify({
    veredito: "revisar",
    problemas: [
      {
        papel: "nutricionista",
        codigo: "outro",
        trecho: summary,
        correcao:
          "Inclua as refeições, porções sugeridas e substituições do dia.",
        gravidade: "hard",
      },
    ],
    observacao: "",
  });
  const { reply, calls } = run(input(), {
    nutricionista: [summary, PLAN],
    revisor: [revise, approve],
  });
  const result = await reply;
  assert.deepEqual(purposes(calls), [
    "nutricionista",
    "revisor",
    "nutricionista",
    "revisor",
  ]);
  assert.equal(result.meta.revisions, 1);
  assert.equal(result.text, PLAN);
  assert.match(
    calls[2].instructions,
    /Inclua as refeições, porções sugeridas e substituições/,
  );
  assert.match(textOf(calls[3]), /Seu dia de alimentação/);
});

test("dieta: alergênico em uma refeição pode bloquear a entrega no revisor", async () => {
  const { reply, calls } = run(input(), {
    nutricionista: "Café da manhã às 8h: pão com pasta de amendoim.",
    revisor: JSON.stringify({
      veredito: "bloquear",
      problemas: [
        {
          papel: "nutricionista",
          codigo: "alergeno",
          trecho: "pasta de amendoim",
          correcao: "Remova o alimento que causa alergia.",
          gravidade: "hard",
        },
      ],
      observacao: "",
    }),
  });
  await assert.rejects(
    reply,
    (error: unknown) =>
      error instanceof AgentError && error.code === "review_failed",
  );
  assert.deepEqual(purposes(calls), ["nutricionista", "revisor"]);
});

test("dieta: restrição numérica em caso sensível é barrada antes do revisor", async () => {
  const request = input();
  (request.context.anamnese as Record<string, unknown>).eatingDisorder = "sim";
  const flexible =
    "Organize refeições regulares, com variedade e porções conforme sua fome. Converse com um nutricionista para o acompanhamento individual.";
  const { reply, calls } = run(request, {
    nutricionista: ["Faça um plano de 1200 kcal por dia.", flexible],
    revisor: approve,
  });
  const result = await reply;
  assert.deepEqual(purposes(calls), [
    "nutricionista",
    "nutricionista",
    "revisor",
  ]);
  assert.equal(result.text, flexible);
  assert.equal(result.meta.revisions, 1);
  assert.match(calls[0].instructions, /RESTRIÇÃO OBRIGATÓRIA/);
  assert.match(
    calls[2].instructions,
    /Segurança tem prioridade sobre a completude/,
  );
});

test("dieta: alergias desconhecidas e metas indisponíveis preservam orientação conservadora", async () => {
  const request = input();
  Object.assign(request.context.anamnese as Record<string, unknown>, {
    allergies: "nao_sei",
    allergyDetails: "",
    fluidRestriction: "nao_sei",
    conditions: "Prefiro não informar",
  });
  request.context.goals = {
    calories: null,
    water: null,
    reason: "Informações de saúde incompletas.",
  };
  const { reply, calls } = run(request, {
    nutricionista:
      "Antes de detalhar os alimentos, você tem alguma alergia ou orientação profissional sobre a alimentação?",
    revisor: approve,
  });
  assert.equal((await reply).meta.reviewed, true);
  assert.match(
    calls[0].instructions,
    /Alergias\/intolerâncias declaradas: nao_sei/,
  );
  assert.match(
    calls[0].instructions,
    /Metas automáticas desativadas: Informações de saúde incompletas/,
  );
  assert.match(
    calls[0].instructions,
    /Se metas estiverem indisponíveis, não as invente/,
  );
  assert.match(
    calls[1].instructions,
    /alergias desconhecidas ou detalhes insuficientes/,
  );
  assert.doesNotMatch(textOf(calls[0]), /Meta calórica:/);
});

test("dieta: calorias ocultas são mascaradas mesmo quando geradas pelo provedor", async () => {
  const state = stateFixture();
  state.profile!.hideCalories = true;
  const { reply, calls } = run(input({ context: agentContext(state) }), {
    nutricionista: `${PLAN}\nSua meta informada é 1800 kcal.`,
    revisor: approve,
  });
  const result = await reply;
  assert.doesNotMatch(result.text, /1800|kcal/);
  assert.match(calls[0].instructions, /hideCalories=true/);
  assert.doesNotMatch(textOf(calls[0]), /Meta calórica:|"calories"/);
});

test("dieta: sinal grave no pedido interrompe sem gerar cardápio", async () => {
  const { reply, calls } = run(
    input({ text: "Crie minha dieta, estou com falta de ar agora." }),
  );
  const result = await reply;
  assert.equal(calls.length, 0);
  assert.equal(result.meta.urgency, "imediata");
  assert.equal(result.meta.reviewed, false);
  assert.match(result.text, /SAMU/);
});

test("dieta estruturada: JSON validado, texto renderizado e perfil sensível sem gramas", async () => {
  const { reply, calls } = run(input(), {
    nutricionista: JSON.stringify(DIET_PLAN_V2),
    revisor: approve,
  });
  const result = await reply;
  assert.deepEqual(purposes(calls), ["nutricionista", "revisor"]);
  assert.equal(calls[0].jsonSchema?.name, "dieta_v2");
  assert.equal(calls[0].maxOutputTokens, 9000);
  // O adendo em JSON vem depois das instruções de sempre, que continuam lá.
  assert.match(calls[0].instructions, /MODO DIETA PERSONALIZADA APÓS ANAMNESE/);
  assert.match(calls[0].instructions, /porções sugeridas em medidas caseiras/);
  assert.match(calls[0].instructions, /Substituições/);
  assert.match(calls[0].instructions, /foodBudget, cookingTime, favoriteFoods/);
  assert.match(calls[0].instructions, /FORMATO DA DIETA: responda apenas com o JSON/);
  assert.match(calls[1].instructions, /MODO DIETA[\s\S]*RASCUNHOS ESTRUTURADOS/);
  assert.match(textOf(calls[1]), /### Almoço · 12:00/);
  assert.equal(result.text, renderDietText(DIET_PLAN_V2));
  assert.ok(result.text.includes(PLAN_TIMES_NOTE));
  assert.deepEqual(result.structured, { kind: "diet", plan: DIET_PLAN_V2 });
  assert.equal(result.meta.llmCalls, 2);
  const plan = createDietPlan(result, stateFixture().profile!);
  assert.deepEqual(plan.structured, DIET_PLAN_V2);

  const sensitive = input();
  (sensitive.context.anamnese as Record<string, unknown>).eatingDisorder = "sim";
  const safe = await run(sensitive, {
    nutricionista: JSON.stringify(DIET_PLAN_V2),
    revisor: approve,
  }).reply;
  assert.ok(safe.structured?.kind === "diet");
  assert.ok(
    safe.structured.plan.refeicoes.every((m) => m.itens.every((i) => i.gramas === null)),
  );
  assert.doesNotMatch(safe.text, /≈ \d+ g/);
});

test("dieta estruturada: JSON fora do esquema cai para o texto de sempre", async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const { reply, calls } = run(input(), {
      nutricionista: ['{"resumo": {"destaques": []}}', PLAN],
      revisor: approve,
    });
    const result = await reply;
    assert.deepEqual(purposes(calls), ["nutricionista", "nutricionista", "revisor"]);
    assert.equal(calls[1].jsonSchema, undefined);
    assert.equal(calls[1].maxOutputTokens, 6000);
    assert.doesNotMatch(calls[1].instructions, /FORMATO DA DIETA/);
    assert.equal(result.text, PLAN);
    assert.equal("structured" in result, false);
    assert.equal(result.meta.llmCalls, 3);
    assert.doesNotMatch(calls[2].instructions, /RASCUNHOS ESTRUTURADOS/);
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
  }
});

test("descrição de refeição: texto até 600 caracteres e sem anexo", () => {
  const meal = { mode: "meal_text", text: "arroz e feijão", consent: true, context: {}, history: [] };
  assert.equal(requestSchema.safeParse(meal).success, true);
  assert.equal(
    requestSchema.safeParse({ ...meal, file: "data:image/png;base64,iVBORw0KGgo=" }).success,
    false,
  );
  assert.equal(requestSchema.safeParse({ ...meal, text: "a".repeat(600) }).success, true);
  const long = requestSchema.safeParse({ ...meal, text: "a".repeat(601) });
  assert.equal(long.success, false);
  assert.match(JSON.stringify(long.error?.issues), /até 600 caracteres/);
});
