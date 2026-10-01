import { z } from "zod";
import { AgentError } from "./graph/state";
import type { Generate, ModelPart, ModelRequest, Provider } from "./model";

/** Endpoint compatível com a Chat Completions API da OpenAI. */
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export interface DeepSeekConfig {
  apiKey: string;
  /** Modelo de texto (ex.: deepseek-chat). */
  model: string;
  /** Modelo com entrada de imagem; sem ele, fotos não são enviadas ao DeepSeek. */
  visionModel?: string;
  /**
   * Mantém o modo de raciocínio do modelo. Desligado por padrão: o raciocínio demora vários segundos por nó
   * e consome o orçamento de tokens (com orçamento curto a resposta chega vazia).
   */
  thinking?: boolean;
}

/** Assinatura mínima do fetch, injetável para testes. */
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text" | "json">>;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};
type CompletionLike = {
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null };
  }[];
};
type JsonSchema = NonNullable<ModelRequest["jsonSchema"]>;

const hasPart = (parts: ModelPart[], type: ModelPart["type"]) =>
  parts.some((part) => part.type === type);

/** O que o DeepSeek aceita: PDF nunca; imagem só com modelo de visão configurado. */
export function deepSeekAccepts(
  config: DeepSeekConfig,
  parts: ModelPart[],
): boolean {
  if (hasPart(parts, "file")) return false;
  return !hasPart(parts, "image") || !!config.visionModel;
}

function pickModel(config: DeepSeekConfig, parts: ModelPart[]): string {
  if (hasPart(parts, "file"))
    throw new AgentError(
      "provider",
      "O DeepSeek não analisa laudos em PDF. Configure a OpenAI para analisar exames.",
    );
  if (!hasPart(parts, "image")) return config.model;
  if (!config.visionModel)
    throw new AgentError(
      "provider",
      "O DeepSeek só analisa fotos com DEEPSEEK_VISION_MODEL definido. Configure esse modelo ou a OpenAI.",
    );
  return config.visionModel;
}

function userContent(parts: ModelPart[]): string | ContentPart[] {
  if (!hasPart(parts, "image"))
    return parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n");
  return parts.flatMap<ContentPart>((part) =>
    part.type === "text"
      ? [{ type: "text", text: part.text }]
      : part.type === "image"
        ? [{ type: "image_url", image_url: { url: part.dataUrl } }]
        : [],
  );
}

/** Sem json_schema estrito, o esquema vai nas instruções; o modo json_object garante só a sintaxe. */
function jsonInstructions(jsonSchema: JsonSchema): string {
  return [
    "FORMATO DA RESPOSTA: responda apenas com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.",
    "O objeto deve seguir exatamente este esquema JSON (todas as chaves obrigatórias, nenhuma chave extra):",
    JSON.stringify(jsonSchema.schema),
  ].join("\n");
}

function buildMessages(request: ModelRequest): ChatMessage[] {
  const instructions = request.jsonSchema
    ? `${request.instructions}\n\n${jsonInstructions(request.jsonSchema)}`
    : request.instructions;
  const history = request.history.map<ChatMessage>((message) => ({
    role: message.sender === "ai" ? "assistant" : "user",
    content: message.text,
  }));
  return [
    { role: "system", content: instructions },
    ...history,
    { role: "user", content: userContent(request.parts) },
  ];
}

function buildBody(request: ModelRequest, model: string, thinking: boolean) {
  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(request),
    max_tokens: request.maxOutputTokens,
  };
  if (!thinking) body.thinking = { type: "disabled" };
  if (request.jsonSchema) body.response_format = { type: "json_object" };
  return body;
}

/** O status HTTP original fica em `cause` para diagnóstico; o código decide o status da API. */
function httpError(status: number, body: string): AgentError {
  const cause = Object.assign(new Error(`DeepSeek respondeu HTTP ${status}`), {
    status,
    body: body.slice(0, 500),
  });
  if (status === 429)
    return new AgentError(
      "provider_limit",
      "O provedor atingiu o limite de uso. Tente mais tarde.",
      { cause },
    );
  return new AgentError(
    "provider",
    "Não foi possível obter uma resposta do agente. Confira a configuração e tente novamente.",
    { cause },
  );
}

function transportError(
  error: unknown,
  signal: AbortSignal | undefined,
  timeout: AbortSignal,
): AgentError {
  if (error instanceof AgentError) return error;
  if (signal?.aborted)
    return new AgentError("aborted", "Solicitação cancelada.", {
      cause: error,
    });
  if (timeout.aborted)
    return new AgentError(
      "timeout",
      "O provedor demorou demais para responder. Tente novamente.",
      { cause: error },
    );
  return new AgentError(
    "provider",
    "Não foi possível obter uma resposta do provedor. Confira a rede e tente novamente.",
    { cause: error },
  );
}

const validators = new WeakMap<Record<string, unknown>, z.ZodType>();
/** Converte o esquema JSON uma vez por objeto; os esquemas do grafo são constantes. */
function validatorFor(jsonSchema: JsonSchema): z.ZodType {
  let validator = validators.get(jsonSchema.schema);
  if (!validator) {
    validator = z.fromJSONSchema(
      jsonSchema.schema as Parameters<typeof z.fromJSONSchema>[0],
    );
    validators.set(jsonSchema.schema, validator);
  }
  return validator;
}

// A mensagem é fixa: detalhes da validação podem conter texto gerado pelo modelo.
const invalidOutput = () =>
  new AgentError(
    "invalid_output",
    "O agente devolveu uma saída fora do formato esperado. Tente novamente.",
  );

const stripFences = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

/** Garante JSON sintaticamente válido e aderente ao esquema; devolve o JSON normalizado. */
function normalizeJson(text: string, jsonSchema: JsonSchema): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw invalidOutput();
  }
  if (!validatorFor(jsonSchema).safeParse(parsed).success)
    throw invalidOutput();
  return JSON.stringify(parsed);
}

function readContent(data: CompletionLike, jsonSchema?: JsonSchema): string {
  const choice = data.choices?.[0];
  const reason = choice?.finish_reason ?? "stop";
  if (reason === "length")
    throw new AgentError(
      "provider",
      "A resposta ultrapassou o limite de tamanho e foi interrompida. Tente uma pergunta mais específica.",
    );
  if (reason !== "stop")
    throw new AgentError(
      "provider",
      `A resposta foi interrompida pelo provedor (motivo: ${reason}). Tente novamente.`,
    );
  const text = choice?.message?.content?.trim() ?? "";
  if (!text)
    throw new AgentError(
      jsonSchema ? "invalid_output" : "provider",
      "O agente não retornou uma resposta. Tente reformular sua solicitação.",
    );
  return jsonSchema ? normalizeJson(text, jsonSchema) : text;
}

/**
 * Cria a função de geração baseada na API de chat do DeepSeek (compatível com OpenAI).
 * `fetchImpl` é injetável para testes; em produção usa o fetch global.
 * Todo erro sai como AgentError para o compositor de fallback decidir a rota.
 */
export function createDeepSeekGenerate(
  config: DeepSeekConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Provider {
  const generate: Generate = async (request) => {
    const model = pickModel(config, request.parts);
    const timeout = AbortSignal.timeout(request.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    let data: CompletionLike;
    try {
      const response = await fetchImpl(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody(request, model, config.thinking === true)),
        signal,
      });
      if (!response.ok) throw httpError(response.status, await response.text());
      data = (await response.json()) as CompletionLike;
    } catch (error) {
      throw transportError(error, request.signal, timeout);
    }
    return readContent(data, request.jsonSchema);
  };
  return Object.assign(generate, {
    accepts: (parts: ModelPart[]) => deepSeekAccepts(config, parts),
  });
}
