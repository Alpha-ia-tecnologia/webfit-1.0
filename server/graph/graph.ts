import { randomUUID } from "node:crypto";
import { StateGraph, START, END } from "@langchain/langgraph";
import type { z } from "zod";
import { requestSchema } from "../agent";
import {
  AgentError,
  AgentState,
  TOTAL_BUDGET_MS,
  type AgentReply,
} from "./state";
import { prepareNode, routeByMode } from "./prepare";
import {
  createSpecialistNode,
  createTriageNode,
  routeAfterTriage,
  urgencyNode,
  type GraphDeps,
} from "./specialists";
import {
  afterGuard,
  afterReview,
  createGuardNode,
  createReviewerNode,
} from "./review";
import { buildReply, finalizeNode } from "./finalize";
import { LABEL_REQUEST_TEXT } from "../../src/lib/label-read";
import {
  stageForNode,
  type AgentProgress,
  type AgentStage,
} from "../../src/lib/agent-stream";

export type AgentInput = z.infer<typeof requestSchema>;
export type { GraphDeps };

const SPECIALIST_NODES = [
  "nutricionista",
  "rotina",
  "analista_exames",
] as const;

/** Monta e compila o grafo. Deve ser chamado uma vez por processo (ou por teste). */
export function buildAgentGraph(deps: GraphDeps) {
  return new StateGraph(AgentState)
    .addNode("preparar", prepareNode)
    .addNode("triagem", createTriageNode(deps))
    .addNode("urgencia", urgencyNode)
    .addNode("nutricionista", createSpecialistNode("nutricionista", deps))
    .addNode("rotina", createSpecialistNode("rotina", deps))
    .addNode("analista_exames", createSpecialistNode("analista_exames", deps))
    .addNode("guarda", createGuardNode(deps))
    .addNode("revisor", createReviewerNode(deps))
    .addNode("finalizar", finalizeNode)
    .addEdge(START, "preparar")
    .addConditionalEdges("preparar", routeByMode, [
      "urgencia",
      "triagem",
      "nutricionista",
      "analista_exames",
    ])
    .addConditionalEdges("triagem", routeAfterTriage, [
      "urgencia",
      ...SPECIALIST_NODES,
    ])
    .addEdge("nutricionista", "guarda")
    .addEdge("rotina", "guarda")
    .addEdge("analista_exames", "guarda")
    .addEdge("urgencia", "finalizar")
    .addConditionalEdges("guarda", afterGuard, [
      "revisor",
      "finalizar",
      ...SPECIALIST_NODES,
    ])
    .addConditionalEdges("revisor", afterReview, [
      "finalizar",
      ...SPECIALIST_NODES,
    ])
    .addEdge("finalizar", END)
    .compile();
}
export type AgentGraph = ReturnType<typeof buildAgentGraph>;

function mapRunError(error: unknown, signal?: AbortSignal): AgentError {
  if (error instanceof AgentError) return error;
  const e = error as { name?: string; message?: string };
  if (signal?.aborted || /abort/i.test(e?.name ?? ""))
    return new AgentError("aborted", "Solicitação cancelada.", {
      cause: error,
    });
  if (/timeout/i.test(`${e?.name ?? ""} ${e?.message ?? ""}`))
    return new AgentError(
      "timeout",
      "O agente não concluiu a resposta dentro do tempo limite. Tente novamente.",
      { cause: error },
    );
  return new AgentError(
    "provider",
    "Não foi possível obter uma resposta do agente. Tente novamente.",
    { cause: error },
  );
}

type GraphInput = Parameters<AgentGraph["invoke"]>[0];
type GraphState = Awaited<ReturnType<AgentGraph["invoke"]>>;

/** Executa em modo stream: avisa cada etapa nova (tarefa iniciada) e devolve o estado final. */
async function streamStages(
  graph: AgentGraph,
  initial: GraphInput,
  signal: AbortSignal | undefined,
  onStage: (progress: AgentProgress) => void,
): Promise<GraphState> {
  let final: GraphState | undefined;
  let current: AgentStage | null = null;
  let attempt = 0;
  const stream = await graph.stream(initial, {
    signal,
    recursionLimit: 25,
    streamMode: ["tasks", "values"],
  });
  for await (const [mode, chunk] of stream) {
    if (mode === "values") {
      final = chunk as GraphState;
      continue;
    }
    const task = chunk as { name: string; input?: unknown };
    if (!("input" in task)) continue;
    const stage = stageForNode(task.name);
    if (!stage || stage === current) continue;
    current = stage;
    if (stage === "especialista") attempt++;
    onStage({ stage, attempt: Math.max(1, attempt) });
  }
  if (!final) throw new AgentError("provider", "O agente não concluiu.");
  return final;
}

/** Executa o grafo para uma solicitação já validada e devolve texto + metadados. */
export async function runAgent(
  input: AgentInput,
  graph: AgentGraph,
  options: {
    signal?: AbortSignal;
    now?: () => number;
    /** Com esta função, as etapas reais do grafo são avisadas enquanto ele roda. */
    onStage?: (progress: AgentProgress) => void;
  } = {},
): Promise<AgentReply> {
  if (
    (input.mode === "diet" || input.mode === "recipe") &&
    !requestSchema.safeParse(input).success
  )
    throw new AgentError(
      "input",
      "Conclua e confira a anamnese antes de solicitar sua dieta, sem anexos.",
    );
  const now = options.now ?? Date.now;
  // Rótulo (INJECAO-X2): só a foto vai ao modelo. O app manda contexto vazio, mas um cliente antigo
  // ou alterado pode mandar perfil e anamnese: o servidor descarta os dois (e o histórico) aqui, antes
  // de sinais, fatos e bloco de dados, nos caminhos JSON e NDJSON. O texto também não é da pessoa:
  // vale sempre a frase fixa do pedido, então nenhum texto livre do cliente chega aos prompts.
  const isLabel = input.mode === "rotulo";
  const initial = {
    mode: input.mode,
    text: isLabel ? LABEL_REQUEST_TEXT : input.text,
    history: isLabel ? [] : input.history,
    context: isLabel ? {} : input.context,
    file: input.file ?? null,
    deadline: now() + TOTAL_BUDGET_MS,
    nonce: randomUUID().slice(0, 8),
  };
  try {
    const state = options.onStage
      ? await streamStages(graph, initial, options.signal, options.onStage)
      : await graph.invoke(initial, {
          signal: options.signal,
          recursionLimit: 25,
        });
    return buildReply(state);
  } catch (error) {
    throw mapRunError(error, options.signal);
  }
}
