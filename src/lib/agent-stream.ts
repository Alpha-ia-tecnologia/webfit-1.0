import { z } from "zod";
import type { AgentMode } from "../types";

/**
 * Etapas reais do grafo do agente, transmitidas pelo servidor em NDJSON
 * (uma linha JSON por evento) enquanto a resposta é preparada.
 */
export const AGENT_STAGES = [
  "contexto",
  "especialista",
  "seguranca",
  "revisao",
] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];
export interface AgentProgress {
  stage: AgentStage;
  /** 2 ou mais quando o especialista reescreve após a guarda ou o revisor. */
  attempt: number;
}
export const NDJSON_TYPE = "application/x-ndjson";

const NODE_STAGE: Record<string, AgentStage> = {
  preparar: "contexto",
  triagem: "contexto",
  nutricionista: "especialista",
  rotina: "especialista",
  analista_exames: "especialista",
  guarda: "seguranca",
  revisor: "revisao",
};
/** Nó do grafo → etapa exibida; nós internos (urgência, finalização) não viram etapa. */
export function stageForNode(node: string): AgentStage | null {
  return NODE_STAGE[node] ?? null;
}

export type StageMode = "diet" | "chat" | "exam" | "recipe" | "rotulo" | "meal_text";
const SPECIALIST_LABEL: Record<StageMode, string> = {
  diet: "Montando suas refeições",
  chat: "Escrevendo a resposta",
  exam: "Lendo o laudo",
  recipe: "Montando a receita",
  rotulo: "Lendo o rótulo",
  meal_text: "Organizando os itens",
};
export function stageMode(mode: AgentMode): StageMode {
  return mode === "diet" ||
    mode === "exam" ||
    mode === "recipe" ||
    mode === "rotulo" ||
    mode === "meal_text"
    ? mode
    : "chat";
}
/** Texto curto de cada etapa; nunca menciona calorias. */
export function stageLabel(
  stage: AgentStage,
  mode: StageMode,
  attempt = 1,
): string {
  if (stage === "contexto")
    return mode === "diet"
      ? "Lendo sua anamnese"
      : mode === "rotulo"
        ? "Preparando a foto"
        : "Lendo seu contexto";
  if (stage === "especialista")
    return attempt > 1 ? "Ajustando após a revisão" : SPECIALIST_LABEL[mode];
  if (stage === "seguranca") return "Checando segurança";
  return mode === "diet"
    ? "Revisando o plano"
    : mode === "rotulo"
      ? "Conferindo a leitura"
      : mode === "meal_text"
        ? "Conferindo os itens"
        : "Revisando a resposta";
}

const stageEvent = z.object({
  type: z.literal("stage"),
  stage: z.enum(AGENT_STAGES),
  attempt: z.number().int().min(1).max(9),
});
const resultEvent = z.object({ type: z.literal("result"), reply: z.unknown() });
const errorEvent = z.object({
  type: z.literal("error"),
  status: z.number().int().min(400).max(599),
  error: z.string().max(1000),
});
export const agentStreamEventSchema = z.discriminatedUnion("type", [
  stageEvent,
  resultEvent,
  errorEvent,
]);
export type AgentStreamEvent = z.infer<typeof agentStreamEventSchema>;

/** Teto de uma linha: a maior (`result`) tem até ~20 mil caracteres de texto. */
export const MAX_LINE_CHARS = 512 * 1024;
const MALFORMED = "Resposta do servidor em formato inesperado.";
/** Mensagens de falha do cliente, iguais na web e no app nativo. */
export const AGENT_UNAVAILABLE = "Não foi possível consultar o agente.";
export const AGENT_OFFLINE =
  "Não foi possível conectar ao agente. Verifique a conexão e tente novamente.";

/** JSON do corpo sem lançar: texto inválido (página HTML de proxy, porta ocupada por outro serviço) vira null. */
export function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Divide o fluxo em linhas completas; o resto fica guardado até o próximo pedaço. */
export function createLineSplitter(onLine: (line: string) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
      // Linha sem fim não cresce sem limite na memória.
      if (buffer.length > MAX_LINE_CHARS) throw new Error(MALFORMED);
    },
    end() {
      if (buffer.trim()) onLine(buffer);
      buffer = "";
    },
  };
}
/** Linha inválida é ignorada: só um evento `result` válido encerra a resposta. */
export function parseStreamLine(line: string): AgentStreamEvent | null {
  const parsed = agentStreamEventSchema.safeParse(parseJsonSafe(line));
  return parsed.success ? parsed.data : null;
}

type Outcome = { reply: unknown } | { error: string };
/** Consome os eventos de texto já decodificado; útil para testes e para o app nativo. */
export function createStreamCollector(
  onProgress: (progress: AgentProgress) => void,
) {
  let outcome: Outcome | null = null;
  const splitter = createLineSplitter((line) => {
    const event = parseStreamLine(line);
    if (!event || outcome) return;
    if (event.type === "stage")
      onProgress({ stage: event.stage, attempt: event.attempt });
    else
      outcome =
        event.type === "result"
          ? { reply: event.reply }
          : { error: event.error };
  });
  return {
    push: splitter.push,
    /** Devolve o `result` bruto (validado por quem chama) ou lança o erro do servidor. */
    finish(): unknown {
      splitter.end();
      const final = outcome as Outcome | null;
      if (!final) throw new Error(MALFORMED);
      if ("error" in final) throw new Error(final.error);
      return final.reply;
    },
  };
}

/** Lê a resposta NDJSON; avisa cada etapa e devolve o conteúdo bruto do `result`. */
export async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: AgentProgress) => void,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const collector = createStreamCollector(onProgress);
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(() => {
        // Queda de rede no meio do corpo vira aviso de conexão, não o erro cru do navegador.
        throw new Error(AGENT_OFFLINE);
      });
      if (done) break;
      collector.push(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  collector.push(decoder.decode());
  return collector.finish();
}
