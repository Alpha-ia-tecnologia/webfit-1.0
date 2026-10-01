import type { z } from "zod";
import type { ModelRequest } from "./model";
import type { StructuredReply } from "../src/lib/structured";
import {
  AgentError,
  MAX_TOKENS,
  MIN_CALL_MS,
  type Flags,
  type GraphState,
  type Specialist,
} from "./graph/state";

/**
 * Saída estruturada dos especialistas: uma tentativa em JSON estrito e, se o provedor recusar o
 * formato ou a saída não validar, uma reserva em texto dentro do orçamento. O modelo devolve dados;
 * o texto que a guarda, o revisor e o histórico veem é sempre `spec.render(value)`.
 * Não importa specialists.ts (evita ciclo): recebe a função de chamada pronta.
 */

export type PendingRequest = Omit<ModelRequest, "timeoutMs" | "signal">;
export type StructuredRequest = Omit<PendingRequest, "jsonSchema">;
export interface StructuredContext {
  role: Specialist;
  flags: Flags;
  mode: GraphState["mode"];
}
/** Como a guarda lê o campo: alimento, nome de prato, texto corrido, rótulo de cartão ou combinado. */
export type FieldKind = "food" | "name" | "prose" | "card" | "habit";
export interface StructuredField {
  text: string;
  kind: FieldKind;
}
export interface RoleResult<T> {
  role: Specialist;
  value: T | null;
  draft: string;
}
export interface StructuredSpec<T> {
  kind: StructuredReply["kind"];
  /** json_schema.name ("chat_blocos", "dieta_v2", "foto_itens"). */
  name: string;
  /** Estrito: objetos com additionalProperties:false, required completo, opcional = tipo com "null", sem maxLength. Constante (cache do validador DeepSeek por identidade). */
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  addendum: string;
  sanitize?: (value: T, ctx: StructuredContext) => T | null;
  render: (value: T) => string;
  /** Campos que a guarda examina (alergênico, números nutricionais, medicamento, perfil sensível). */
  fields: (value: T) => StructuredField[];
  /** Monta o envelope a partir dos papéis que responderam; null = sem estrutura. */
  toReply: (results: readonly RoleResult<T>[]) => StructuredReply | null;
}
export type ParsedStructured<T> =
  | { kind: "structured"; value: T }
  | { kind: "text" }
  | { kind: "invalid" };

/** Texto que não começa com "{" é resposta em texto; JSON que não valida ou que a limpeza esvazia é inválido. */
export function parseStructured<T>(
  raw: string,
  spec: StructuredSpec<T>,
  ctx: StructuredContext,
): ParsedStructured<T> {
  if (!raw.trim().startsWith("{")) return { kind: "text" };
  try {
    const parsed = spec.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { kind: "invalid" };
    const value = spec.sanitize ? spec.sanitize(parsed.data, ctx) : parsed.data;
    return value === null ? { kind: "invalid" } : { kind: "structured", value };
  } catch {
    return { kind: "invalid" };
  }
}

export interface CallBudget {
  nodeMax: number;
  /** ms disponíveis para a chamada de reserva. */
  fallbackMax: () => number;
}

// A mensagem é fixa: detalhes da validação podem conter texto gerado pelo modelo.
const invalidOutput = () =>
  new AgentError(
    "invalid_output",
    "O agente devolveu uma saída fora do formato esperado. Tente novamente.",
  );

/** Erros que a reserva em texto resolve: formato recusado (400, recusa, truncado) ou JSON fora do esquema. */
const recoverable = (error: unknown): error is AgentError =>
  error instanceof AgentError &&
  (error.code === "invalid_output" || error.code === "provider");

/**
 * Uma tentativa em JSON (instruções + adendo, MAX_TOKENS.structured, json_schema estrito).
 * Resposta em texto é mantida sem nenhuma alteração. Formato recusado ou inválido → uma chamada
 * em texto, sem esquema nem adendo, limitada ao tempo que sobra depois de reservar o revisor.
 * provider_limit, timeout e aborted sobem sem reserva.
 */
export async function callStructured<T>(
  call: (request: PendingRequest, nodeMax: number) => Promise<string>,
  request: StructuredRequest,
  spec: StructuredSpec<T>,
  ctx: StructuredContext,
  budget: CallBudget,
): Promise<{ value: T | null; text: string; calls: number }> {
  let failure: AgentError;
  try {
    const raw = await call(
      {
        ...request,
        instructions: `${request.instructions}\n\n${spec.addendum}`,
        maxOutputTokens: MAX_TOKENS.structured,
        jsonSchema: { name: spec.name, schema: spec.jsonSchema },
      },
      budget.nodeMax,
    );
    const parsed = parseStructured(raw, spec, ctx);
    if (parsed.kind === "structured")
      return { value: parsed.value, text: spec.render(parsed.value), calls: 1 };
    if (parsed.kind === "text") return { value: null, text: raw, calls: 1 };
    failure = invalidOutput();
  } catch (error) {
    if (!recoverable(error)) throw error;
    failure = error;
  }
  const max = Math.min(budget.nodeMax, budget.fallbackMax());
  if (max < MIN_CALL_MS) throw failure;
  console.error(`[agent] structured fallback ${spec.name}: ${failure.code}`);
  const text = await call(request, max);
  return { value: null, text, calls: 2 };
}
