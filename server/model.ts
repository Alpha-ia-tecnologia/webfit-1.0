import OpenAI from "openai";
import { AgentError, MIN_CALL_MS } from "./graph/state";

export {
  createDeepSeekGenerate,
  type DeepSeekConfig,
  type FetchLike,
} from "./deepseek";

export type ModelPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string }
  | { type: "file"; dataUrl: string; filename: string };

export interface ModelRequest {
  /** Identifica o nó/papel que fez a chamada (rastreamento e testes). */
  purpose: string;
  instructions: string;
  history: { sender: "user" | "ai"; text: string }[];
  parts: ModelPart[];
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** "fast" usa o modelo auxiliar quando configurado; padrão "main". */
  tier?: "main" | "fast";
  /** Quando presente, exige JSON válido conforme o esquema (modo estrito). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

/** Função de geração injetável: o grafo depende apenas desta assinatura. */
export type Generate = (request: ModelRequest) => Promise<string>;

/** Provedor que pode declarar o que aceita; sem `accepts`, aceita qualquer pedido. */
export type Provider = Generate & {
  accepts?: (parts: ModelPart[]) => boolean;
};

const isCancellation = (error: unknown, signal?: AbortSignal) =>
  !!signal?.aborted ||
  (error instanceof AgentError && error.code === "aborted") ||
  /abort/i.test((error as { name?: string })?.name ?? "");

/**
 * Decide o provedor por pedido: o que o primário não aceita (PDF, foto sem modelo
 * de visão) vai direto ao secundário; o restante tenta o primário e recorre ao
 * secundário em qualquer erro que não seja cancelamento.
 */
export function withFallback(primary: Provider, secondary: Generate): Generate {
  return async (request) => {
    if (primary.accepts && !primary.accepts(request.parts))
      return secondary(request);
    const started = Date.now();
    try {
      return await primary(request);
    } catch (error) {
      if (isCancellation(error, request.signal)) throw error;
      // timeoutMs é o orçamento do nó calculado logo antes da chamada; a reserva só recebe o que sobrou.
      const remaining = request.timeoutMs - (Date.now() - started);
      if (remaining < MIN_CALL_MS) throw error;
      const code = error instanceof AgentError ? error.code : "provider";
      console.error(`[agent] fallback ${request.purpose}: ${code}`);
      return secondary({ ...request, timeoutMs: remaining });
    }
  };
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  fastModel?: string;
}

type ResponseLike = {
  status?: string | null;
  output_text?: string;
  incomplete_details?: { reason?: string | null } | null;
  output?: { type?: string; content?: { type?: string; refusal?: string }[] }[];
};

interface ResponsesClient {
  responses: {
    create: (
      params: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

function toInputParts(parts: ModelPart[]) {
  return parts.map((part) =>
    part.type === "text"
      ? { type: "input_text", text: part.text }
      : part.type === "image"
        ? { type: "input_image", image_url: part.dataUrl, detail: "auto" }
        : {
            type: "input_file",
            filename: part.filename,
            file_data: part.dataUrl,
          },
  );
}

function buildParams(request: ModelRequest, model: string) {
  const history = request.history.map((message) => ({
    role: message.sender === "ai" ? "assistant" : "user",
    content: message.text,
  }));
  const params: Record<string, unknown> = {
    model,
    instructions: request.instructions,
    input: [...history, { role: "user", content: toInputParts(request.parts) }],
    max_output_tokens: request.maxOutputTokens,
    // Sem retenção no provedor: a foto do rótulo e o contexto de saúde não ficam guardados (nada usa previous_response_id).
    store: false,
  };
  if (request.jsonSchema)
    params.text = {
      format: {
        type: "json_schema",
        name: request.jsonSchema.name,
        strict: true,
        schema: request.jsonSchema.schema,
      },
    };
  return params;
}

function readText(response: ResponseLike) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? "desconhecido";
    throw new Error(
      reason === "max_output_tokens"
        ? "A resposta ultrapassou o limite de tamanho e foi interrompida. Tente uma pergunta mais específica."
        : `A resposta foi interrompida pelo provedor (motivo: ${reason}). Tente novamente.`,
    );
  }
  const refusal = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "refusal");
  if (refusal)
    throw new Error(
      `O provedor recusou a solicitação: ${refusal.refusal ?? "sem detalhes"}.`,
    );
  const text = response.output_text?.trim() ?? "";
  if (!text)
    throw new Error(
      "O agente não retornou uma resposta. Tente reformular sua solicitação.",
    );
  return text;
}

/**
 * Cria a função de geração baseada na Responses API da OpenAI.
 * `client` é injetável para testes; em produção usa o SDK oficial.
 */
export function createOpenAIGenerate(
  config: ProviderConfig,
  client: ResponsesClient = new OpenAI({
    apiKey: config.apiKey,
    maxRetries: 0,
  }),
): Generate {
  return async (request) => {
    const model =
      request.tier === "fast" && config.fastModel
        ? config.fastModel
        : config.model;
    const response = (await client.responses.create(
      buildParams(request, model),
      {
        signal: request.signal,
        timeout: request.timeoutMs,
        maxRetries: 0,
      },
    )) as ResponseLike;
    return readText(response);
  };
}
