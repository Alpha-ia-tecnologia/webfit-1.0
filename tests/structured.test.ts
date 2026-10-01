import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  chatOutputSchema,
  sanitizeBlocks,
  type ChatOutput,
} from "../src/lib/agent-blocks";
import { dietPlanV2Schema } from "../src/lib/diet-plan";
import { examResultSchema, renderExamText } from "../src/lib/exam-result";
import { mealTextSchema, renderMealText, sanitizeMealText } from "../src/lib/meal-text";
import { platePhotoSchema, renderPhotoText } from "../src/lib/plate-photo";
import { maskStructured, stringLeaves } from "../src/lib/structured";
import { agentReplySchema } from "../src/types";
import { SCAN_JSON_SCHEMA } from "../server/pantry";
import { REVIEW_JSON_SCHEMA, TRIAGE_JSON_SCHEMA } from "../server/graph/prompts";
import {
  CHAT_JSON_SCHEMA,
  CHAT_JSON_SCHEMA_SENSITIVE,
  CHAT_SPEC,
  CHAT_SPEC_SENSITIVE,
  DIET_JSON_SCHEMA,
  DIET_SPEC,
  EXAM_JSON_SCHEMA,
  EXAM_SPEC,
  MEAL_TEXT_JSON_SCHEMA,
  MEAL_TEXT_SPEC,
  PHOTO_JSON_SCHEMA,
  PHOTO_SPEC,
  specFor,
} from "../server/graph/structured-specs";
import { AgentError, MIN_CALL_MS, type Flags } from "../server/graph/state";
import { lintStructured } from "../server/graph/structured-guard";
import { extractFlags } from "../server/graph/prepare";
import {
  callStructured,
  parseStructured,
  type PendingRequest,
  type StructuredContext,
} from "../server/structured";
import { agentContext } from "../src/lib/domain";
import { stateFixture } from "./fixtures";
import { parity, strictProblems } from "./strict-schema";
import {
  CHAT_OUTPUT,
  CHAT_REPLY,
  DIET_PLAN_V2,
  DIET_PLAN_V2_SENSITIVE,
  EXAM_REPLY,
  EXAM_RESULT,
  MEAL_TEXT_DRAFT,
  MEAL_TEXT_REPLY,
  PHOTO_DRAFT,
} from "./structured-fixtures";

const flags: Flags = extractFlags(agentContext(stateFixture()));
const sensitiveFlags: Flags = { ...flags, eatingDisorder: "sim" };
const ctx: StructuredContext = { role: "nutricionista", flags, mode: "chat" };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("esquemas estritos: todos os objetos fechados, required completo e sem palavras recusadas", () => {
  for (const [name, schema] of Object.entries({
    TRIAGE_JSON_SCHEMA,
    REVIEW_JSON_SCHEMA,
    SCAN_JSON_SCHEMA,
    CHAT_JSON_SCHEMA,
    CHAT_JSON_SCHEMA_SENSITIVE,
    DIET_JSON_SCHEMA,
    PHOTO_JSON_SCHEMA,
    EXAM_JSON_SCHEMA,
  }))
    assert.deepEqual(strictProblems(schema), [], name);
  // O verificador de fato acusa os problemas que o modo estrito recusaria.
  assert.deepEqual(
    strictProblems({
      type: "array",
      items: {
        type: "object",
        required: ["a"],
        properties: { a: { type: "string", maxLength: 3 }, b: { type: "array" } },
      },
    }),
    [
      '$: a raiz deve ter type "object"',
      "$[]: objeto sem additionalProperties:false",
      "$[]: required deve listar exatamente as propriedades",
      '$[].a: "maxLength" não é aceito no modo estrito',
      "$[].b: array sem items",
    ],
  );
});

test("paridade: esquema JSON e zod concordam nas amostras válidas e nas recusas", () => {
  const texto = { tipo: "texto", texto: "Olá" };
  const habit = { tipo: "acao", acao: "criar_habito", titulo: "Beber água", horario: "07:00" };
  const options = clone(CHAT_OUTPUT.blocos[1]) as Record<string, unknown> & {
    opcoes: { itens: Record<string, unknown>[] }[];
  };
  const results = parity(CHAT_JSON_SCHEMA, chatOutputSchema, [
    CHAT_OUTPUT,
    { blocos: [{ tipo: "foo", texto: "x" }] },
    { blocos: [{ ...habit, horario: "7h" }] },
    { blocos: [{ tipo: "grafico", metrica: "kcal_7d" }] },
    { blocos: [{ ...texto, extra: 1 }] },
  ]);
  assert.deepEqual(
    results.map(({ json, zod }) => [json, zod]),
    [
      [true, true],
      [false, false],
      [false, false],
      [false, false],
      // Leitura tolerante: o zod descarta a chave extra; o esquema estrito nunca a produz.
      [false, true],
    ],
  );
  assert.deepEqual(chatOutputSchema.parse({ blocos: [{ ...texto, extra: 1 }] }), {
    blocos: [texto],
  });
  // Perfil sensível: o esquema enviado não oferece peso_8s; o zod aceita e a limpeza remove.
  const weight = { blocos: [texto, { tipo: "grafico", metrica: "peso_8s" }] };
  const [sensitive] = parity(CHAT_JSON_SCHEMA_SENSITIVE, chatOutputSchema, [weight]);
  assert.deepEqual([sensitive!.json, sensitive!.zod], [false, true]);
  assert.deepEqual(
    sanitizeBlocks(chatOutputSchema.parse(weight).blocos, {
      role: "nutricionista",
      sensitive: true,
      allergyDetails: "",
    }),
    [texto],
  );
  // gramas fora do tipo: o esquema recusa; a leitura tolerante vira null.
  options.opcoes[0]!.itens[0]!.gramas = "x";
  const [grams] = parity(CHAT_JSON_SCHEMA, chatOutputSchema, [{ blocos: [options] }]);
  assert.deepEqual([grams!.json, grams!.zod], [false, true]);
  const parsed = chatOutputSchema.parse({ blocos: [options] }).blocos[0]!;
  assert.equal(parsed.tipo === "opcoes_refeicao" && parsed.opcoes[0]!.itens[0]!.gramas, null);
  // Dieta e foto: válidos passam nos dois; horário fora do padrão é recusado pelo esquema.
  for (const [schema, zod, samples] of [
    [DIET_JSON_SCHEMA, dietPlanV2Schema, [DIET_PLAN_V2, DIET_PLAN_V2_SENSITIVE]],
    [PHOTO_JSON_SCHEMA, platePhotoSchema, [PHOTO_DRAFT, { items: [], uncertainties: [] }]],
  ] as const)
    for (const r of parity(schema, zod, samples)) assert.deepEqual([r.json, r.zod], [true, true]);
  const badTime = clone(DIET_PLAN_V2);
  badTime.refeicoes[0]!.horario = "7h30";
  const [diet] = parity(DIET_JSON_SCHEMA, dietPlanV2Schema, [badTime]);
  assert.equal(diet!.json, false);
});

test("paridade do laudo: esquema estrito e zod concordam; data fora do formato vira null na leitura", () => {
  const row = EXAM_RESULT.resultados[0]!;
  const results = parity(EXAM_JSON_SCHEMA, examResultSchema, [
    EXAM_RESULT,
    { ...EXAM_RESULT, extra: 1 },
    { ...EXAM_RESULT, resultados: Array.from({ length: 61 }, () => row) },
    { ...EXAM_RESULT, resultados: [{ ...row, nome: null }] },
    { ...EXAM_RESULT, data: "10/08/2026" },
    { ...EXAM_RESULT, data: null, ilegiveis: [], perguntas: [], observacoes: [] },
  ]);
  assert.deepEqual(
    results.map(({ json, zod }) => [json, zod]),
    [
      [true, true],
      // Leitura tolerante: o zod descarta a chave extra; o esquema estrito nunca a produz.
      [false, true],
      [false, false],
      [false, false],
      // Documentado: o esquema exige AAAA-MM-DD; a leitura tolerante troca por null.
      [false, true],
      [true, true],
    ],
  );
  assert.equal(examResultSchema.parse({ ...EXAM_RESULT, data: "10/08/2026" }).data, null);
});

test("especificação do laudo: limpeza, texto renderizado, sem campos para a guarda e só do analista", () => {
  const exam: StructuredContext = { ...ctx, role: "analista_exames", mode: "exam" };
  const parsed = parseStructured(JSON.stringify(EXAM_RESULT), EXAM_SPEC, exam);
  assert.deepEqual(parsed, { kind: "structured", value: EXAM_RESULT });
  assert.equal(EXAM_SPEC.render(EXAM_RESULT), renderExamText(EXAM_RESULT));
  assert.deepEqual(EXAM_SPEC.fields(EXAM_RESULT), []);
  assert.deepEqual(
    parseStructured(JSON.stringify({ ...EXAM_RESULT, resultados: [], ilegiveis: [] }), EXAM_SPEC, exam),
    { kind: "invalid" },
  );
  assert.deepEqual(EXAM_SPEC.toReply([{ role: "analista_exames", value: EXAM_RESULT, draft: "" }]), {
    kind: "exam",
    result: EXAM_RESULT,
  });
  assert.equal(EXAM_SPEC.toReply([{ role: "nutricionista", value: EXAM_RESULT, draft: "" }]), null);
  assert.equal(EXAM_SPEC.toReply([{ role: "analista_exames", value: null, draft: "Texto" }]), null);
});

test("parseStructured: JSON válido, texto, JSON quebrado e JSON que a limpeza esvazia", () => {
  const valid = parseStructured(JSON.stringify(CHAT_OUTPUT), CHAT_SPEC, ctx);
  assert.equal(valid.kind, "structured");
  // O nutricionista não propõe combinados: a limpeza por papel tira o criar_habito.
  assert.ok(
    valid.kind === "structured" &&
      !valid.value.blocos.some((b) => b.tipo === "acao" && b.acao === "criar_habito"),
  );
  assert.deepEqual(parseStructured("Olá! Posso ajudar.", CHAT_SPEC, ctx), { kind: "text" });
  assert.deepEqual(parseStructured("{quebrado", CHAT_SPEC, ctx), { kind: "invalid" });
  assert.deepEqual(parseStructured('{"blocos": []}', CHAT_SPEC, ctx), { kind: "invalid" });
  assert.deepEqual(
    parseStructured(
      JSON.stringify({ blocos: [{ tipo: "sugestoes", itens: ["Quero ideias"] }] }),
      CHAT_SPEC,
      ctx,
    ),
    { kind: "invalid" },
  );
});

interface FakeCall {
  request: PendingRequest;
  nodeMax: number;
}
function fakeCall(replies: (string | Error)[]) {
  const calls: FakeCall[] = [];
  const call = async (request: PendingRequest, nodeMax: number) => {
    calls.push({ request, nodeMax });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (next instanceof Error) throw next;
    return next;
  };
  return { call, calls };
}
const baseRequest = {
  purpose: "nutricionista",
  tier: "main" as const,
  instructions: "REGRAS",
  history: [],
  parts: [{ type: "text" as const, text: "pedido" }],
  maxOutputTokens: 6000,
};
const budget = (fallback = 60_000) => ({ nodeMax: 45_000, fallbackMax: () => fallback });

test("callStructured: saída válida em uma chamada, com esquema, adendo e teto de 9.000 tokens", async () => {
  const fake = fakeCall([JSON.stringify(CHAT_OUTPUT)]);
  const result = await callStructured(fake.call, baseRequest, CHAT_SPEC, ctx, budget());
  assert.equal(result.calls, 1);
  assert.equal(fake.calls.length, 1);
  const { request, nodeMax } = fake.calls[0]!;
  assert.equal(request.jsonSchema?.name, "chat_blocos");
  assert.equal(request.jsonSchema?.schema, CHAT_JSON_SCHEMA);
  assert.equal(request.instructions, `REGRAS\n\n${CHAT_SPEC.addendum}`);
  assert.equal(request.maxOutputTokens, 9000);
  assert.equal(nodeMax, 45_000);
  assert.ok(result.value);
  assert.equal(result.text, CHAT_SPEC.render(result.value));
});

test("callStructured: resposta em texto fica intacta (sem trim) e sem estrutura", async () => {
  const raw = "  Você pode montar o prato com arroz e feijão.\n";
  const fake = fakeCall([raw]);
  const result = await callStructured(fake.call, baseRequest, CHAT_SPEC, ctx, budget());
  assert.deepEqual(result, { value: null, text: raw, calls: 1 });
});

test("callStructured: formato recusado, JSON fora do esquema e erro do provedor usam a reserva em texto", async () => {
  const spy = mock.method(console, "error", () => {});
  try {
    for (const first of [
      new AgentError("invalid_output", "fora do formato"),
      '{"blocos": [{"tipo": "foo"}]}',
      new AgentError("provider", "esquema recusado"),
    ]) {
      const fake = fakeCall([first, "Texto da reserva."]);
      const result = await callStructured(fake.call, baseRequest, CHAT_SPEC, ctx, budget(30_000));
      assert.deepEqual(result, { value: null, text: "Texto da reserva.", calls: 2 });
      const second = fake.calls[1]!;
      assert.equal(second.request.jsonSchema, undefined);
      assert.equal(second.request.instructions, "REGRAS");
      assert.equal(second.request.maxOutputTokens, 6000);
      assert.equal(second.nodeMax, 30_000);
    }
    assert.match(String(spy.mock.calls[0]!.arguments[0]), /structured fallback chat_blocos: invalid_output/);
  } finally {
    spy.mock.restore();
  }
});

test("callStructured: limite, prazo, cancelamento e erros comuns sobem sem reserva", async () => {
  for (const error of [
    new AgentError("provider_limit", "limite"),
    new AgentError("timeout", "prazo"),
    new AgentError("aborted", "cancelado"),
    new Error("desconhecido"),
  ]) {
    const fake = fakeCall([error, "não deveria ser chamado"]);
    await assert.rejects(
      callStructured(fake.call, baseRequest, CHAT_SPEC, ctx, budget()),
      (e: unknown) => e === error,
    );
    assert.equal(fake.calls.length, 1);
  }
});

test("callStructured: sem tempo para a reserva, o erro original sobe após uma chamada", async () => {
  const provider = new AgentError("provider", "esquema recusado");
  const noTime = budget(MIN_CALL_MS - 1);
  const fake = fakeCall([provider, "reserva"]);
  await assert.rejects(
    callStructured(fake.call, baseRequest, CHAT_SPEC, ctx, noTime),
    (e: unknown) => e === provider,
  );
  assert.equal(fake.calls.length, 1);
  const invalid = fakeCall(["{quebrado", "reserva"]);
  await assert.rejects(
    callStructured(invalid.call, baseRequest, CHAT_SPEC, ctx, noTime),
    (e: unknown) => e instanceof AgentError && e.code === "invalid_output",
  );
  assert.equal(invalid.calls.length, 1);
});

test("specFor: chat (sensível ou não), dieta, foto e laudo; despensa segue em texto", () => {
  assert.equal(specFor("chat", flags)?.name, CHAT_SPEC.name);
  assert.equal(specFor("chat", flags)?.jsonSchema, CHAT_JSON_SCHEMA);
  assert.equal(specFor("chat", sensitiveFlags)?.jsonSchema, CHAT_SPEC_SENSITIVE.jsonSchema);
  // Menor de idade e "prefiro não informar" também usam o esquema sem peso.
  assert.equal(specFor("chat", { ...flags, isMinor: true })?.jsonSchema, CHAT_JSON_SCHEMA_SENSITIVE);
  assert.equal(
    specFor("chat", { ...flags, pregnancy: "nao_informado" })?.jsonSchema,
    CHAT_JSON_SCHEMA_SENSITIVE,
  );
  assert.equal(specFor("diet", flags)?.name, DIET_SPEC.name);
  assert.equal(specFor("photo", flags)?.name, PHOTO_SPEC.name);
  assert.equal(specFor("exam", flags)?.name, "exame_resultados");
  assert.equal(specFor("exam", sensitiveFlags)?.jsonSchema, EXAM_JSON_SCHEMA);
  assert.equal(specFor("pantry_photo", flags), null);
});

test("maskStructured: números do corpo ocultos em qualquer nível, junto ou sem as calorias", () => {
  const value = {
    kind: "diet",
    plan: { resumo: "Porções para seus 72 kg e 1800 kcal.", dicas: ["IMC 27 não muda o plano."] },
  };
  const before = clone(value);
  const body = maskStructured(value, false, { plain: true, hideBodyNumbers: true });
  assert.deepEqual(value, before);
  assert.equal(body.plan.resumo, "Porções para seus número oculto e 1800 kcal.");
  assert.equal(body.plan.dicas[0], "IMC número oculto não muda o plano.");
  const both = maskStructured(value, true, { hideBodyNumbers: true });
  assert.equal(both.plan.resumo, "Porções para seus número oculto e [calorias ocultas].");
  assert.equal(maskStructured(value, false, { hideBodyNumbers: false }), value);
  assert.equal(maskStructured(value, true).plan.resumo, "Porções para seus 72 kg e [calorias ocultas].");
});

test("maskStructured: oculta calorias em qualquer nível, mantém enums e nunca muta", () => {
  const value = {
    kind: "chat",
    sections: [
      {
        papel: null,
        blocos: [
          { tipo: "texto", texto: "Cerca de 500 kcal no lanche." },
          { tipo: "grafico", metrica: "agua_7d" },
          {
            tipo: "opcoes_refeicao",
            titulo: null,
            refeicao: "Lanche",
            opcoes: [{ nome: "Prato de 300 kcal", emoji: "🍌", minutos: 5, itens: [] }],
          },
        ],
      },
    ],
  };
  const before = clone(value);
  const rich = maskStructured(value, true);
  const plain = maskStructured(value, true, { plain: true });
  assert.deepEqual(value, before);
  assert.equal(maskStructured(value, false), value);
  assert.equal(rich.sections[0]!.blocos[0]!.texto, "Cerca de [calorias ocultas] no lanche.");
  assert.equal(plain.sections[0]!.blocos[0]!.texto, "Cerca de calorias ocultas no lanche.");
  assert.equal(
    (plain.sections[0]!.blocos[2] as { opcoes: { nome: string }[] }).opcoes[0]!.nome,
    "Prato de calorias ocultas",
  );
  assert.equal(rich.kind, "chat");
  assert.equal(rich.sections[0]!.blocos[1]!.metrica, "agua_7d");
  assert.ok(!stringLeaves(plain).some((s) => /kcal/.test(s)));
  assert.deepEqual(stringLeaves({ a: ["x", { b: "y", n: 1 }], c: null }), ["x", "y"]);
});

test("agentReplySchema: kind desconhecido não recusa a resposta, só descarta a estrutura", () => {
  const unknown = agentReplySchema.parse({
    ...CHAT_REPLY,
    structured: { kind: "video", url: "x" },
  });
  assert.equal(unknown.structured, undefined);
  assert.equal(unknown.text, CHAT_REPLY.text);
  assert.equal(agentReplySchema.parse(CHAT_REPLY).structured?.kind, "chat");
  const photo = agentReplySchema.parse({
    text: "x",
    meta: CHAT_REPLY.meta,
    structured: { kind: "photo", draft: PHOTO_DRAFT },
  });
  assert.deepEqual(photo.structured, { kind: "photo", draft: PHOTO_DRAFT });
  assert.deepEqual(agentReplySchema.parse(EXAM_REPLY).structured, { kind: "exam", result: EXAM_RESULT });
  const invalidExam = agentReplySchema.parse({
    ...EXAM_REPLY,
    structured: { kind: "exam", result: { ...EXAM_RESULT, resultados: "x" } },
  });
  assert.equal(invalidExam.structured, undefined);
  assert.equal(invalidExam.text, EXAM_REPLY.text);
});

test("renderPhotoText: texto exato, sem números, com e sem itens", () => {
  const text = renderPhotoText(PHOTO_DRAFT);
  assert.equal(
    text,
    [
      "**Itens identificados**",
      "- Arroz branco (confiança alta) · procurar: arroz branco cozido",
      "- Feijão (confiança média) · procurar: feijão carioca cozido",
      "- Paçoca (confiança baixa) · procurar: paçoca de amendoim",
      "",
      "**Incertezas**",
      "- A foto não mostra se há molho ou tempero no feijão.",
    ].join("\n"),
  );
  const flagged = renderPhotoText({
    items: [{ ...PHOTO_DRAFT.items[2]!, allergyMatch: true, searchTerms: ["paçoca", "doce de amendoim"] }],
    uncertainties: [],
  });
  assert.equal(
    flagged,
    "**Itens identificados**\n- Paçoca (confiança baixa) · procurar: paçoca; doce de amendoim · possível alérgeno declarado",
  );
  const empty = renderPhotoText({ items: [], uncertainties: [] });
  assert.equal(empty, "Nenhum alimento identificado com segurança na foto.");
  for (const t of [text, flagged, empty]) assert.doesNotMatch(t, /\d/);
});

test("especificações: dieta limpa gramas em perfil sensível e foto não tem limpeza", () => {
  const value = DIET_SPEC.sanitize!(DIET_PLAN_V2, { ...ctx, mode: "diet", flags: sensitiveFlags });
  assert.ok(value!.refeicoes.every((m) => m.itens.every((i) => i.gramas === null)));
  assert.equal(DIET_SPEC.sanitize!(DIET_PLAN_V2, { ...ctx, mode: "diet" }), DIET_PLAN_V2);
  assert.equal(PHOTO_SPEC.sanitize, undefined);
  const output: ChatOutput = { blocos: [{ tipo: "texto", texto: "Oi" }] };
  assert.deepEqual(
    CHAT_SPEC.toReply([
      { role: "nutricionista", value: output, draft: "Oi" },
      { role: "rotina", value: null, draft: "Durma bem." },
    ]),
    {
      kind: "chat",
      sections: [
        { papel: "nutricionista", blocos: output.blocos },
        { papel: "rotina", blocos: [{ tipo: "texto", texto: "Durma bem." }] },
      ],
    },
  );
  assert.equal(CHAT_SPEC.toReply([{ role: "nutricionista", value: null, draft: "Oi" }]), null);
  assert.equal(
    CHAT_SPEC.toReply([
      { role: "nutricionista", value: output, draft: "Oi" },
      { role: "rotina", value: null, draft: "x".repeat(4001) },
    ]),
    null,
  );
  assert.equal(DIET_SPEC.toReply([{ role: "rotina", value: DIET_PLAN_V2, draft: "" }]), null);
});

test("descrição de refeição: esquema estrito e paridade com a leitura tolerante do zod", () => {
  assert.deepEqual(strictProblems(MEAL_TEXT_JSON_SCHEMA), []);
  const item = MEAL_TEXT_DRAFT.items[0]!;
  const results = parity(MEAL_TEXT_JSON_SCHEMA, mealTextSchema, [
    MEAL_TEXT_DRAFT,
    { ...MEAL_TEXT_DRAFT, extra: 1 },
    { ...MEAL_TEXT_DRAFT, items: Array.from({ length: 13 }, () => item) },
    { ...MEAL_TEXT_DRAFT, items: [{ ...item, unit: "colher" }] },
    { ...MEAL_TEXT_DRAFT, items: [{ ...item, quantity: -1 }] },
    { items: [], uncertainties: [] },
  ]);
  assert.deepEqual(
    results.map(({ json, zod }) => [json, zod]),
    [
      [true, true],
      // Leitura tolerante: o zod descarta a chave extra; o esquema estrito nunca a produz.
      [false, true],
      [false, false],
      // Documentado: unidade fora da lista é recusada pelo esquema; a leitura tolerante troca por null.
      [false, true],
      // Documentado: o esquema estrito não tem mínimo; a leitura tolerante troca por null.
      [true, true],
      [true, true],
    ],
  );
  const read = (over: Record<string, unknown>) =>
    mealTextSchema.parse({ ...MEAL_TEXT_DRAFT, items: [{ ...item, ...over }] }).items[0]!;
  assert.equal(read({ unit: "colher" }).unit, null);
  assert.equal(read({ quantity: -1 }).quantity, null);
});

test("specFor: descrição de refeição; chat sem peso_8s com números do corpo ocultos", () => {
  assert.equal(specFor("meal_text", flags)?.name, "refeicao_texto");
  assert.equal(specFor("meal_text", flags)?.jsonSchema, MEAL_TEXT_JSON_SCHEMA);
  assert.equal(specFor("chat", { ...flags, hideBodyNumbers: true })?.jsonSchema, CHAT_JSON_SCHEMA_SENSITIVE);
  assert.equal(specFor("chat", { ...flags, hideBodyNumbers: false })?.jsonSchema, CHAT_JSON_SCHEMA);
  const mealCtx: StructuredContext = { ...ctx, mode: "meal_text" };
  assert.deepEqual(MEAL_TEXT_SPEC.sanitize?.(MEAL_TEXT_DRAFT, mealCtx), sanitizeMealText(MEAL_TEXT_DRAFT));
  assert.equal(MEAL_TEXT_SPEC.render(MEAL_TEXT_DRAFT), renderMealText(MEAL_TEXT_DRAFT));
  assert.deepEqual(MEAL_TEXT_SPEC.toReply([{ role: "nutricionista", value: MEAL_TEXT_DRAFT, draft: "" }]), {
    kind: "meal_text",
    draft: MEAL_TEXT_DRAFT,
  });
  assert.equal(MEAL_TEXT_SPEC.toReply([{ role: "rotina", value: MEAL_TEXT_DRAFT, draft: "" }]), null);
});

test("agentReplySchema: resposta da descrição de refeição; rascunho inválido só descarta a estrutura", () => {
  assert.deepEqual(agentReplySchema.parse(MEAL_TEXT_REPLY).structured, {
    kind: "meal_text",
    draft: MEAL_TEXT_DRAFT,
  });
  const invalid = agentReplySchema.parse({
    ...MEAL_TEXT_REPLY,
    structured: { kind: "meal_text", draft: { items: "x" } },
  });
  assert.equal(invalid.structured, undefined);
  assert.equal(invalid.text, MEAL_TEXT_REPLY.text);
});

test("guarda estruturada: alérgeno que a pessoa já comeu não bloqueia a descrição", () => {
  const allergyFlags: Flags = { ...flags, allergyDetails: "Amendoim" };
  const lint = (value: typeof MEAL_TEXT_DRAFT) =>
    lintStructured({ role: "nutricionista", value, spec: MEAL_TEXT_SPEC, flags: allergyFlags, mode: "meal_text" });
  assert.deepEqual(lint(MEAL_TEXT_DRAFT), []);
  // Números de calorias continuam barrados nos campos, mesmo como "card".
  assert.ok(lint({ ...MEAL_TEXT_DRAFT, uncertainties: ["Cerca de 500 kcal no prato."] }).length > 0);
});
