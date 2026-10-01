import { Send, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { z } from "zod";
import type { Generate, ModelPart } from "../model";
import { mediaPart } from "../agent";
import { callStructured, type PendingRequest, type StructuredRequest } from "../structured";
import {
  AgentError,
  MAX_TOKENS,
  MIN_CALL_MS,
  REVIEW_FILE_MS,
  REVIEW_MS,
  SAFETY_MARGIN_MS,
  SPECIALIST_FILE_MS,
  SPECIALIST_TEXT_MS,
  TRIAGE_MS,
  triageOutputSchema,
  type GraphState,
  type GraphUpdate,
  type Specialist,
  type Urgency,
} from "./state";
import {
  TRIAGE_INSTRUCTIONS,
  TRIAGE_JSON_SCHEMA,
  renderFlags,
  specialistInstructions,
} from "./prompts";
import { wrapData } from "./prepare";
import { specFor } from "./structured-specs";

export interface GraphDeps {
  generate: Generate;
  /** Relógio injetável para testes de prazo. */
  now?: () => number;
}
type Config = LangGraphRunnableConfig;
export type { PendingRequest };
const HISTORY_CHARS = 1500;

export function timeoutFor(
  state: GraphState,
  deps: GraphDeps,
  nodeMax: number,
): number {
  const now = deps.now ?? Date.now;
  const timeout = Math.min(nodeMax, state.deadline - now() - SAFETY_MARGIN_MS);
  if (timeout < MIN_CALL_MS)
    throw new AgentError(
      "timeout",
      "O agente não teve tempo suficiente para concluir a resposta. Tente novamente em instantes.",
    );
  return timeout;
}

function mapProviderError(error: unknown, config: Config): AgentError {
  if (error instanceof AgentError) return error;
  const e = error as { status?: number; name?: string };
  if (config.signal?.aborted)
    return new AgentError("aborted", "Solicitação cancelada.", {
      cause: error,
    });
  if (e?.status === 429)
    return new AgentError(
      "provider_limit",
      "O provedor atingiu o limite de uso. Tente mais tarde.",
      { cause: error },
    );
  if (/timeout|abort/i.test(e?.name ?? ""))
    return new AgentError(
      "timeout",
      "O provedor demorou demais para responder. Tente novamente.",
      { cause: error },
    );
  return new AgentError(
    "provider",
    "Não foi possível obter uma resposta do agente. Confira a configuração e tente novamente.",
    { cause: error },
  );
}

export async function callModel(
  deps: GraphDeps,
  state: GraphState,
  config: Config,
  request: PendingRequest,
  nodeMax: number,
): Promise<string> {
  const timeoutMs = timeoutFor(state, deps, nodeMax);
  try {
    return await deps.generate({
      ...request,
      timeoutMs,
      signal: config.signal,
    });
  } catch (error) {
    throw mapProviderError(error, config);
  }
}

/** Chama o modelo exigindo JSON; tenta uma segunda vez se a saída não validar. */
export async function callJson<T>(
  deps: GraphDeps,
  state: GraphState,
  config: Config,
  request: PendingRequest,
  nodeMax: number,
  schema: z.ZodType<T>,
): Promise<{ value: T; calls: number }> {
  let calls = 0;
  while (calls < 2) {
    calls++;
    const text = await callModel(deps, state, config, request, nodeMax);
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return { value: parsed.data, calls };
    } catch {
      // JSON inválido: tenta uma segunda vez e depois falha de forma honesta.
    }
  }
  // A mensagem é fixa: detalhes da validação podem conter texto gerado pelo modelo.
  throw new AgentError(
    "invalid_output",
    "O agente devolveu uma saída fora do formato esperado. Tente novamente.",
  );
}

/** Histórico vai como transcrição em bloco de dados, nunca como turnos do assistente. */
export function historyBlock(state: GraphState, limit: number): string {
  const lines = state.history
    .slice(-limit)
    .map(
      (m) =>
        `${m.sender === "ai" ? "agente" : "pessoa"}: ${m.text.slice(0, HISTORY_CHARS)}`,
    );
  return wrapData(state.nonce, "HISTORICO", lines.join("\n") || "(vazio)");
}

const mergeUrgency = (current: Urgency, triage: Urgency): Urgency =>
  current === "imediata" || triage === "imediata"
    ? "imediata"
    : triage === "atencao"
      ? "atencao"
      : current;

const uniqueRoles = (roles: Specialist[]): Specialist[] => {
  const unique = [...new Set(roles)];
  return unique.length ? unique : ["nutricionista"];
};

export function createTriageNode(deps: GraphDeps) {
  return async (state: GraphState, config: Config): Promise<GraphUpdate> => {
    const text = [
      `SINAIS:\n${renderFlags(state.flags!)}`,
      `FATOS:\n- ${state.facts.join("\n- ")}`,
      historyBlock(state, 4),
      `SOLICITAÇÃO DA PESSOA:\n${state.text}`,
    ].join("\n\n");
    const request: PendingRequest = {
      purpose: "triagem",
      tier: "fast",
      instructions: TRIAGE_INSTRUCTIONS,
      history: [],
      parts: [{ type: "text", text }],
      maxOutputTokens: MAX_TOKENS.triage,
      jsonSchema: { name: "triagem", schema: TRIAGE_JSON_SCHEMA },
    };
    try {
      const { value, calls } = await callJson(
        deps,
        state,
        config,
        request,
        TRIAGE_MS,
        triageOutputSchema,
      );
      const missing = new Set(state.flags!.missingInformation);
      const triage = {
        ...value,
        faltamDados: value.faltamDados.filter((k) => missing.has(k)),
      };
      return {
        triage,
        urgency: mergeUrgency(state.urgency, value.urgencia),
        route: uniqueRoles(value.especialistas),
        llmCalls: calls,
        trace: ["triagem"],
      };
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== "invalid_output")
        throw error;
      return {
        route: ["nutricionista"],
        llmCalls: 2,
        trace: ["triagem:fallback"],
      };
    }
  };
}

export function routeAfterTriage(state: GraphState) {
  if (state.urgency === "imediata") return "urgencia";
  return state.route.map((role) => new Send(role, state));
}

function specialistParts(state: GraphState, role: Specialist): ModelPart[] {
  const sections = [
    state.dataBlock,
    `FATOS DERIVADOS EM CÓDIGO:\n- ${state.facts.join("\n- ")}`,
  ];
  if (state.mode === "chat") sections.push(historyBlock(state, 16));
  // Rascunho estruturado volta como o JSON validado, para a reescrita manter o formato.
  const structured = state.structured[role];
  const previous = structured ? JSON.stringify(structured) : state.drafts[role];
  if (previous && state.feedback[role]?.length)
    sections.push(wrapData(state.nonce, "RASCUNHO_ANTERIOR", previous));
  sections.push(`SOLICITAÇÃO (${state.mode}):\n${state.text}`);
  const parts: ModelPart[] = [{ type: "text", text: sections.join("\n\n") }];
  if (state.file && (state.mode === "photo" || state.mode === "exam" || state.mode === "rotulo"))
    parts.push(mediaPart(state.file, state.mode === "exam" ? "exam" : "photo"));
  return parts;
}

export function createSpecialistNode(role: Specialist, deps: GraphDeps) {
  const now = deps.now ?? Date.now;
  return async (state: GraphState, config: Config): Promise<GraphUpdate> => {
    if ((state.mode === "photo" || state.mode === "exam" || state.mode === "rotulo") && !state.file)
      throw new AgentError("file", "Selecione um arquivo para analisar.");
    const feedback = state.feedback[role] ?? [];
    const instructions = specialistInstructions(role, state.flags!, {
      photo: state.mode === "photo",
      diet: state.mode === "diet",
      recipe: state.mode === "recipe",
      mealText: state.mode === "meal_text",
      rotulo: state.mode === "rotulo",
      focus: state.triage?.foco[role] ?? null,
      feedback,
      urgency: state.urgency,
    });
    const request: StructuredRequest = {
      purpose: role,
      tier: "main",
      instructions,
      history: [],
      parts: specialistParts(state, role),
      maxOutputTokens: MAX_TOKENS.specialist,
    };
    const nodeMax = state.file ? SPECIALIST_FILE_MS : SPECIALIST_TEXT_MS;
    const trace = [feedback.length ? `${role}:revisao` : role];
    const spec = specFor(state.mode, state.flags!, state.context);
    if (!spec) {
      const text = await callModel(deps, state, config, request, nodeMax);
      return { drafts: { [role]: text }, llmCalls: 1, trace };
    }
    const { value, text, calls } = await callStructured(
      (r, max) => callModel(deps, state, config, r, max),
      request,
      spec,
      { role, flags: state.flags!, mode: state.mode },
      {
        nodeMax,
        // A reserva em texto só usa o tempo que sobra depois de guardar o do revisor.
        fallbackMax: () =>
          state.deadline -
          now() -
          (state.file ? REVIEW_FILE_MS : REVIEW_MS) -
          SAFETY_MARGIN_MS,
      },
    );
    return {
      drafts: { [role]: text },
      structured: { [role]: value },
      llmCalls: calls,
      trace,
    };
  };
}

/** Curto-circuito determinístico: nenhuma chamada ao modelo em situação de urgência. */
export function urgencyNode(): GraphUpdate {
  return {
    trace: ["urgencia"],
    notes: [
      "Esta é uma mensagem automática de segurança; nenhum especialista foi consultado.",
    ],
  };
}
