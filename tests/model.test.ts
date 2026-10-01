import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createDeepSeekGenerate,
  createOpenAIGenerate,
  withFallback,
  type ModelRequest,
} from "../server/model";
import { DEEPSEEK_URL } from "../server/deepseek";
import { AgentError } from "../server/graph/state";
import {
  REVIEW_JSON_SCHEMA,
  TRIAGE_JSON_SCHEMA,
} from "../server/graph/prompts";
import {
  CHAT_JSON_SCHEMA,
  CHAT_JSON_SCHEMA_SENSITIVE,
  DIET_JSON_SCHEMA,
  EXAM_JSON_SCHEMA,
  MEAL_TEXT_JSON_SCHEMA,
  PHOTO_JSON_SCHEMA,
} from "../server/graph/structured-specs";
import {
  CHAT_OUTPUT,
  DIET_PLAN_V2,
  DIET_PLAN_V2_SENSITIVE,
  EXAM_RESULT,
  MEAL_TEXT_DRAFT,
  PHOTO_DRAFT,
} from "./structured-fixtures";

type Call = Record<string, unknown>;
function fakeClient(reply: (params: Call, options: Call) => unknown) {
  const calls: { params: Call; options: Call }[] = [];
  return {
    calls,
    client: {
      responses: {
        create: async (params: Call, options: Call) => {
          calls.push({ params, options });
          return reply(params, options);
        },
      },
    },
  };
}
const baseRequest = (): ModelRequest => ({
  purpose: "teste",
  instructions: "regras",
  history: [
    { sender: "user", text: "oi" },
    { sender: "ai", text: "olá" },
  ],
  parts: [{ type: "text", text: "pergunta" }],
  maxOutputTokens: 500,
  timeoutMs: 1000,
});

test("monta a requisição da Responses API com histórico, mídia e opções por chamada", async () => {
  const fake = fakeClient(() => ({
    status: "completed",
    output_text: "ok",
    output: [],
  }));
  const generate = createOpenAIGenerate(
    { apiKey: "k", model: "principal", fastModel: "rapido" },
    fake.client,
  );
  const controller = new AbortController();
  const text = await generate({
    ...baseRequest(),
    parts: [
      { type: "text", text: "pergunta" },
      { type: "image", dataUrl: "data:image/png;base64,AAAA" },
      {
        type: "file",
        dataUrl: "data:application/pdf;base64,AAAA",
        filename: "laudo.pdf",
      },
    ],
    signal: controller.signal,
  });
  assert.equal(text, "ok");
  const { params, options } = fake.calls[0];
  assert.equal(params.model, "principal");
  assert.equal(params.instructions, "regras");
  assert.equal(params.max_output_tokens, 500);
  assert.equal("temperature" in params, false);
  assert.equal(params.store, false, "foto e contexto de saúde não ficam guardados no provedor");
  const input = params.input as { role: string; content: unknown }[];
  assert.deepEqual(input.slice(0, 2), [
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
  ]);
  assert.deepEqual(input[2], {
    role: "user",
    content: [
      { type: "input_text", text: "pergunta" },
      {
        type: "input_image",
        image_url: "data:image/png;base64,AAAA",
        detail: "auto",
      },
      {
        type: "input_file",
        filename: "laudo.pdf",
        file_data: "data:application/pdf;base64,AAAA",
      },
    ],
  });
  assert.equal(options.signal, controller.signal);
  assert.equal(options.timeout, 1000);
  assert.equal(options.maxRetries, 0);
});

test("saída estruturada usa json_schema estrito e o modelo rápido quando pedido", async () => {
  const fake = fakeClient(() => ({
    status: "completed",
    output_text: '{"a":1}',
    output: [],
  }));
  const generate = createOpenAIGenerate(
    { apiKey: "k", model: "principal", fastModel: "rapido" },
    fake.client,
  );
  const text = await generate({
    ...baseRequest(),
    tier: "fast",
    jsonSchema: {
      name: "triagem",
      schema: {
        type: "object",
        properties: { a: { type: "number" } },
        required: ["a"],
        additionalProperties: false,
      },
    },
  });
  assert.equal(text, '{"a":1}');
  const { params } = fake.calls[0];
  assert.equal(params.model, "rapido");
  assert.equal(params.store, false);
  assert.deepEqual(params.text, {
    format: {
      type: "json_schema",
      name: "triagem",
      strict: true,
      schema: {
        type: "object",
        properties: { a: { type: "number" } },
        required: ["a"],
        additionalProperties: false,
      },
    },
  });
});

test("sem modelo rápido configurado, o nível fast usa o modelo principal", async () => {
  const fake = fakeClient(() => ({
    status: "completed",
    output_text: "ok",
    output: [],
  }));
  const generate = createOpenAIGenerate(
    { apiKey: "k", model: "principal" },
    fake.client,
  );
  await generate({ ...baseRequest(), tier: "fast" });
  assert.equal(fake.calls[0].params.model, "principal");
});

test("respostas truncadas, recusadas ou vazias viram erros explícitos", async () => {
  const cases: [unknown, RegExp][] = [
    [
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "parcial",
        output: [],
      },
      /limite de tamanho/i,
    ],
    [
      {
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output_text: "parcial",
        output: [],
      },
      /interrompida pelo provedor/i,
    ],
    [
      {
        status: "completed",
        output_text: "",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "não posso" }],
          },
        ],
      },
      /recusou/i,
    ],
    [{ status: "completed", output_text: "   ", output: [] }, /não retornou/i],
  ];
  for (const [reply, pattern] of cases) {
    const fake = fakeClient(() => reply);
    const generate = createOpenAIGenerate(
      { apiKey: "k", model: "m" },
      fake.client,
    );
    await assert.rejects(generate(baseRequest()), pattern);
  }
});

test("erros do provedor preservam o status HTTP para o servidor decidir a resposta", async () => {
  const fake = fakeClient(() => {
    const error = new Error("rate") as Error & { status?: number };
    error.status = 429;
    throw error;
  });
  const generate = createOpenAIGenerate(
    { apiKey: "k", model: "m" },
    fake.client,
  );
  await assert.rejects(
    generate(baseRequest()),
    (e: Error & { status?: number }) => e.status === 429,
  );
});

// --- DeepSeek (chat completions via fetch falso) ---

type FetchCall = { url: string; init: RequestInit; body: Call };
function fakeFetch(reply: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const call = { url, init, body: JSON.parse(String(init.body)) as Call };
    calls.push(call);
    return reply(call);
  };
  return { calls, fetchImpl };
}
const completion = (content: string, finish_reason = "stop") =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason, message: { role: "assistant", content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
/** Fetch que só termina quando o sinal é cancelado (prazo ou usuário). */
const hangingFetch = () =>
  fakeFetch(
    ({ init }) =>
      new Promise<Response>((_, reject) =>
        init.signal!.addEventListener("abort", () =>
          reject(init.signal!.reason),
        ),
      ),
  );
const textPart = { type: "text", text: "pergunta" } as const;
const imagePart = {
  type: "image",
  dataUrl: "data:image/png;base64,AAAA",
} as const;
const pdfPart = {
  type: "file",
  dataUrl: "data:application/pdf;base64,AAAA",
  filename: "laudo.pdf",
} as const;
const simpleSchema = {
  type: "object",
  properties: { a: { type: "number" } },
  required: ["a"],
  additionalProperties: false,
};
const isAgentError = (code: string) => (e: unknown) =>
  e instanceof AgentError && e.code === code;

test("DeepSeek: monta o pedido de chat completions com cabeçalho, histórico e texto", async () => {
  const fake = fakeFetch(() => completion("ok"));
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "deepseek-chat" },
    fake.fetchImpl,
  );
  const controller = new AbortController();
  const text = await generate({ ...baseRequest(), signal: controller.signal });
  assert.equal(text, "ok");
  const { url, init, body } = fake.calls[0];
  assert.equal(url, DEEPSEEK_URL);
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer k");
  assert.equal(headers["Content-Type"], "application/json");
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(body.model, "deepseek-chat");
  assert.equal(body.max_tokens, 500);
  assert.equal("response_format" in body, false);
  assert.equal("temperature" in body, false);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.messages, [
    { role: "system", content: "regras" },
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
    { role: "user", content: "pergunta" },
  ]);
});

test("DeepSeek: foto usa o modelo de visão com image_url", async () => {
  const fake = fakeFetch(() => completion("ok"));
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "texto", visionModel: "visao" },
    fake.fetchImpl,
  );
  await generate({ ...baseRequest(), parts: [textPart, imagePart] });
  const { body } = fake.calls[0];
  assert.equal(body.model, "visao");
  const messages = body.messages as { role: string; content: unknown }[];
  assert.deepEqual(messages.at(-1), {
    role: "user",
    content: [
      { type: "text", text: "pergunta" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ],
  });
});

test("DeepSeek: saída estruturada usa json_object, anexa o esquema às instruções e normaliza o JSON", async () => {
  const fake = fakeFetch(() => completion('```json\n{"a": 1}\n```'));
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "m" },
    fake.fetchImpl,
  );
  const text = await generate({
    ...baseRequest(),
    tier: "fast",
    jsonSchema: { name: "triagem", schema: simpleSchema },
  });
  assert.equal(text, '{"a":1}');
  const { body } = fake.calls[0];
  assert.equal(body.model, "m");
  assert.deepEqual(body.response_format, { type: "json_object" });
  const system = (body.messages as { content: string }[])[0].content;
  assert.match(system, /^regras\n\n/);
  assert.match(system, /apenas com um objeto JSON/);
  assert.ok(system.includes(JSON.stringify(simpleSchema)));
});

test("DeepSeek: JSON inválido, fora do esquema ou vazio vira invalid_output", async () => {
  for (const content of ["não é json", '{"a":"x"}', '{"a":1,"b":2}', " "]) {
    const fake = fakeFetch(() => completion(content));
    const generate = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      fake.fetchImpl,
    );
    await assert.rejects(
      generate({
        ...baseRequest(),
        jsonSchema: { name: "t", schema: simpleSchema },
      }),
      isAgentError("invalid_output"),
    );
  }
});

test("DeepSeek: os esquemas reais de triagem e revisão passam pela validação", async () => {
  const triage = {
    urgencia: "nenhuma",
    especialistas: ["nutricionista"],
    foco: { nutricionista: "fibras", rotina: null, analista_exames: null },
    injecaoSuspeita: false,
    faltamDados: [],
  };
  const review = { veredito: "aprovado", problemas: [], observacao: "" };
  const cases: [Record<string, unknown>, unknown][] = [
    [TRIAGE_JSON_SCHEMA, triage],
    [REVIEW_JSON_SCHEMA, review],
  ];
  for (const [schema, value] of cases) {
    const fake = fakeFetch(() => completion(JSON.stringify(value)));
    const generate = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      fake.fetchImpl,
    );
    const text = await generate({
      ...baseRequest(),
      jsonSchema: { name: "x", schema },
    });
    assert.deepEqual(JSON.parse(text), value);
  }
});

test("DeepSeek: esquemas estruturados (chat com anyOf, dieta, foto e laudo) validam e recusam chave extra", async () => {
  const sensitiveChat = {
    blocos: CHAT_OUTPUT.blocos.filter((b) => b.tipo !== "grafico"),
  };
  const cases: [string, Record<string, unknown>, unknown][] = [
    ["chat_blocos", CHAT_JSON_SCHEMA, CHAT_OUTPUT],
    ["chat_blocos", CHAT_JSON_SCHEMA_SENSITIVE, sensitiveChat],
    ["dieta_v2", DIET_JSON_SCHEMA, DIET_PLAN_V2],
    ["dieta_v2", DIET_JSON_SCHEMA, DIET_PLAN_V2_SENSITIVE],
    ["foto_itens", PHOTO_JSON_SCHEMA, PHOTO_DRAFT],
    ["exame_resultados", EXAM_JSON_SCHEMA, EXAM_RESULT],
    ["exame_resultados", EXAM_JSON_SCHEMA, { ...EXAM_RESULT, data: null, ilegiveis: [] }],
  ];
  for (const [name, schema, value] of cases) {
    const fake = fakeFetch(() => completion(JSON.stringify(value)));
    const generate = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      fake.fetchImpl,
    );
    const text = await generate({
      ...baseRequest(),
      jsonSchema: { name, schema },
    });
    assert.deepEqual(JSON.parse(text), value, name);
    const extra = fakeFetch(() =>
      completion(JSON.stringify({ ...(value as object), extra: 1 })),
    );
    await assert.rejects(
      createDeepSeekGenerate({ apiKey: "k", model: "m" }, extra.fetchImpl)({
        ...baseRequest(),
        jsonSchema: { name, schema },
      }),
      isAgentError("invalid_output"),
      name,
    );
  }
  // Bloco com chave a mais dentro do anyOf e métrica de peso no esquema sensível também são recusados.
  for (const [schema, value] of [
    [CHAT_JSON_SCHEMA, { blocos: [{ tipo: "texto", texto: "x", extra: 1 }] }],
    [CHAT_JSON_SCHEMA_SENSITIVE, { blocos: [{ tipo: "grafico", metrica: "peso_8s" }] }],
  ] as const) {
    const fake = fakeFetch(() => completion(JSON.stringify(value)));
    await assert.rejects(
      createDeepSeekGenerate({ apiKey: "k", model: "m" }, fake.fetchImpl)({
        ...baseRequest(),
        jsonSchema: { name: "chat_blocos", schema },
      }),
      isAgentError("invalid_output"),
    );
  }
  // Laudo: linha com chave a mais ou data fora de AAAA-MM-DD também é recusada.
  for (const value of [
    { ...EXAM_RESULT, resultados: [{ ...EXAM_RESULT.resultados[0]!, extra: 1 }] },
    { ...EXAM_RESULT, data: "10/08/2026" },
  ]) {
    const fake = fakeFetch(() => completion(JSON.stringify(value)));
    await assert.rejects(
      createDeepSeekGenerate({ apiKey: "k", model: "m" }, fake.fetchImpl)({
        ...baseRequest(),
        jsonSchema: { name: "exame_resultados", schema: EXAM_JSON_SCHEMA },
      }),
      isAgentError("invalid_output"),
    );
  }
});

test("DeepSeek: erro HTTP vira AgentError com o status preservado em cause", async () => {
  const cases: [number, string, number][] = [
    [429, "provider_limit", 429],
    [401, "provider", 502],
    [503, "provider", 502],
  ];
  for (const [httpStatus, code, apiStatus] of cases) {
    const fake = fakeFetch(() => new Response("erro", { status: httpStatus }));
    const generate = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      fake.fetchImpl,
    );
    await assert.rejects(generate(baseRequest()), (e: unknown) => {
      assert.ok(e instanceof AgentError);
      assert.equal(e.code, code);
      assert.equal(e.status, apiStatus);
      assert.equal((e.cause as { status?: number }).status, httpStatus);
      return true;
    });
  }
});

test("DeepSeek: resposta truncada, interrompida ou vazia vira erro explícito", async () => {
  const cases: [Response, RegExp][] = [
    [completion("parcial", "length"), /limite de tamanho/i],
    [completion("parcial", "content_filter"), /interrompida pelo provedor/i],
    [completion("   "), /não retornou/i],
  ];
  for (const [reply, pattern] of cases) {
    const fake = fakeFetch(() => reply);
    const generate = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      fake.fetchImpl,
    );
    await assert.rejects(generate(baseRequest()), (e: unknown) => {
      assert.ok(e instanceof AgentError);
      assert.equal(e.code, "provider");
      assert.match(e.message, pattern);
      return true;
    });
  }
});

test("DeepSeek: cancelamento vira aborted e prazo esgotado vira timeout", async () => {
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "m" },
    hangingFetch().fetchImpl,
  );
  const controller = new AbortController();
  const pending = generate({
    ...baseRequest(),
    timeoutMs: 10_000,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, isAgentError("aborted"));
  await assert.rejects(
    generate({ ...baseRequest(), timeoutMs: 5 }),
    isAgentError("timeout"),
  );
});

test("DeepSeek sozinho recusa PDF e foto sem modelo de visão de forma explícita", async () => {
  const fake = fakeFetch(() => completion("ok"));
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "m" },
    fake.fetchImpl,
  );
  await assert.rejects(
    generate({ ...baseRequest(), parts: [textPart, pdfPart] }),
    (e: unknown) => e instanceof AgentError && /PDF/.test(e.message),
  );
  await assert.rejects(
    generate({ ...baseRequest(), parts: [textPart, imagePart] }),
    (e: unknown) =>
      e instanceof AgentError && /DEEPSEEK_VISION_MODEL/.test(e.message),
  );
  assert.equal(fake.calls.length, 0);
});

// --- withFallback ---

function fakeSecondary() {
  const calls: ModelRequest[] = [];
  const generate = async (request: ModelRequest) => {
    calls.push(request);
    return "openai";
  };
  return { calls, generate };
}

test("withFallback: PDF e foto sem modelo de visão vão direto ao secundário", async () => {
  const primaryFetch = fakeFetch(() => completion("deepseek"));
  const primary = createDeepSeekGenerate(
    { apiKey: "k", model: "m" },
    primaryFetch.fetchImpl,
  );
  const secondary = fakeSecondary();
  const generate = withFallback(primary, secondary.generate);
  assert.equal(
    await generate({ ...baseRequest(), parts: [textPart, pdfPart] }),
    "openai",
  );
  assert.equal(
    await generate({ ...baseRequest(), parts: [textPart, imagePart] }),
    "openai",
  );
  assert.equal(primaryFetch.calls.length, 0);
  assert.equal(secondary.calls.length, 2);
});

test("withFallback: texto e foto com modelo de visão usam o primário", async () => {
  const primaryFetch = fakeFetch(() => completion("deepseek"));
  const primary = createDeepSeekGenerate(
    { apiKey: "k", model: "m", visionModel: "v" },
    primaryFetch.fetchImpl,
  );
  const secondary = fakeSecondary();
  const generate = withFallback(primary, secondary.generate);
  assert.equal(await generate(baseRequest()), "deepseek");
  assert.equal(
    await generate({ ...baseRequest(), parts: [textPart, imagePart] }),
    "deepseek",
  );
  assert.equal(primaryFetch.calls[1].body.model, "v");
  assert.equal(secondary.calls.length, 0);
});

test("withFallback: erro do primário registra o motivo e aciona o secundário", async () => {
  const spy = mock.method(console, "error", () => {});
  try {
    const primaryFetch = fakeFetch(
      () => new Response("indisponível", { status: 503 }),
    );
    const primary = createDeepSeekGenerate(
      { apiKey: "k", model: "m" },
      primaryFetch.fetchImpl,
    );
    const secondary = fakeSecondary();
    const generate = withFallback(primary, secondary.generate);
    // Orçamento realista: em produção timeoutFor garante pelo menos MIN_CALL_MS.
    assert.equal(await generate({ ...baseRequest(), timeoutMs: 10_000 }), "openai");
    assert.equal(secondary.calls.length, 1);
    assert.equal(secondary.calls[0].purpose, "teste");
    assert.deepEqual(spy.mock.calls[0].arguments, [
      "[agent] fallback teste: provider",
    ]);
  } finally {
    spy.mock.restore();
  }
});

test("withFallback: cancelamento não aciona o secundário", async () => {
  const primary = createDeepSeekGenerate(
    { apiKey: "k", model: "m" },
    hangingFetch().fetchImpl,
  );
  const secondary = fakeSecondary();
  const generate = withFallback(primary, secondary.generate);
  const controller = new AbortController();
  const pending = generate({ ...baseRequest(), signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, isAgentError("aborted"));
  assert.equal(secondary.calls.length, 0);
});

test("withFallback: a reserva recebe só o tempo restante e não é chamada quando o prazo acabou", async () => {
  const spy = mock.method(console, "error", () => {});
  try {
    const quick = async () => {
      throw new AgentError("provider", "indisponível");
    };
    const secondary = fakeSecondary();
    const generate = withFallback(quick, secondary.generate);
    assert.equal(await generate({ ...baseRequest(), timeoutMs: 10_000 }), "openai");
    const passed = secondary.calls[0].timeoutMs as number;
    assert.ok(passed > 9_000 && passed <= 10_000, `timeoutMs repassado: ${passed}`);

    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw new AgentError("timeout", "prazo esgotado");
    };
    const late = fakeSecondary();
    await assert.rejects(
      withFallback(slow, late.generate)({ ...baseRequest(), timeoutMs: 20 }),
      isAgentError("timeout"),
    );
    assert.equal(late.calls.length, 0);
  } finally {
    spy.mock.restore();
  }
});

test("DeepSeek: thinking=true mantém o raciocínio do modelo (sem o campo thinking)", async () => {
  const fake = fakeFetch(() => completion("ok"));
  const generate = createDeepSeekGenerate(
    { apiKey: "k", model: "deepseek-chat", thinking: true },
    fake.fetchImpl,
  );
  await generate(baseRequest());
  assert.equal("thinking" in fake.calls[0].body, false);
});

test("DeepSeek: descrição de refeição passa pela validação local; chave a mais ou unidade fora da lista não", async () => {
  const request = (value: unknown) => {
    const fake = fakeFetch(() => completion(JSON.stringify(value)));
    return createDeepSeekGenerate({ apiKey: "k", model: "m" }, fake.fetchImpl)({
      ...baseRequest(),
      jsonSchema: { name: "refeicao_texto", schema: MEAL_TEXT_JSON_SCHEMA },
    });
  };
  assert.deepEqual(JSON.parse(await request(MEAL_TEXT_DRAFT)), MEAL_TEXT_DRAFT);
  const item = MEAL_TEXT_DRAFT.items[0]!;
  for (const value of [
    { ...MEAL_TEXT_DRAFT, extra: 1 },
    { ...MEAL_TEXT_DRAFT, items: [{ ...item, extra: 1 }] },
    { ...MEAL_TEXT_DRAFT, items: [{ ...item, unit: "colher" }] },
  ])
    await assert.rejects(request(value), isAgentError("invalid_output"));
});
