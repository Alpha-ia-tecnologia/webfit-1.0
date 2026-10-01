import type { AgentMeta, AppState, ChatMessage } from "../types";
import { DIET_PLAN_REQUEST } from "./diet";
import { agentContext, localDate } from "./domain";
import { fmtShortDate, plural } from "./format";

/** Descreve a automação sem sugerir atendimento ou revisão por um profissional. */
export function describeAgentMeta(meta: AgentMeta): string {
  if (meta.urgency === "imediata") return "Mensagem automática de segurança";
  return meta.reviewed
    ? "Resposta de IA · revisão automática"
    : "Resposta de IA · sem revisão automática";
}

/** Complemento que sempre acompanha a revisão: nenhuma pessoa revisou a resposta. */
export const AGENT_REVIEW_NOTE = "sem revisão humana · apoio educativo";

/** Linha curta sob a última resposta ("Revisada automaticamente · apoio educativo"). */
export function describeAgentMetaShort(meta: AgentMeta): string {
  if (meta.urgency === "imediata") return "Mensagem automática de segurança";
  return meta.reviewed
    ? "Revisada automaticamente · apoio educativo"
    : "Sem revisão automática · apoio educativo";
}

/** A frase inteira (title e leitores de tela): inclui "sem revisão humana". */
export function describeAgentMetaFull(meta: AgentMeta): string {
  if (meta.urgency === "imediata") return "Mensagem automática de segurança, sem revisão humana";
  return `${describeAgentMeta(meta)}, ${AGENT_REVIEW_NOTE}`;
}

/**
 * Como cada mensagem aparece no chat. O texto salvo não muda: o pedido técnico da dieta
 * vira um aviso compacto, o plano que o segue vira um cartão-resumo e respostas com blocos
 * visuais (SIS-02) são desenhadas por blocos.
 */
export type MessageView = "text" | "diet-request" | "diet-plan" | "blocks";
export function messageViews(
  messages: ChatMessage[],
): Map<string, MessageView> {
  const views = new Map<string, MessageView>();
  messages.forEach((message, index) => {
    if (message.sender !== "user" || message.text !== DIET_PLAN_REQUEST)
      return;
    views.set(message.id, "diet-request");
    const next = messages[index + 1];
    if (next?.sender === "ai" && next.status !== "error")
      views.set(next.id, "diet-plan");
  });
  for (const message of messages)
    if (
      message.sender === "ai" &&
      message.status !== "error" &&
      message.blocks?.length &&
      !views.has(message.id)
    )
      views.set(message.id, "blocks");
  return views;
}

/** Rótulo do separador de data: "Hoje", "Ontem" ou "Qui, 24 set". */
export function chatDayLabel(timestamp: string, today: string): string {
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return "";
  const day = localDate(time);
  if (day === today) return "Hoje";
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === localDate(yesterday) ? "Ontem" : fmtShortDate(day);
}

export interface ContextChip {
  key: "anamnese" | "diario" | "medidas" | "combinados" | "doses" | "exames";
  label: string;
  detail: string;
  active: boolean;
}
/** O que vai no contexto da IA, contado a partir do próprio pacote enviado (agentContext). */
export function agentContextChips(
  state: AppState,
  date = localDate(),
): ContextChip[] {
  const context = agentContext(state, date);
  const counted = (
    key: ContextChip["key"],
    label: string,
    n: number,
    [one, many, empty, suffix = ""]: [string, string, string, string?],
  ): ContextChip => ({
    key,
    label,
    detail: n ? `${plural(n, one, many)}${suffix}` : empty,
    active: n > 0,
  });
  return [
    {
      key: "anamnese",
      label: "Anamnese",
      detail: "Saúde, rotina e preferências",
      active: true,
    },
    counted("diario", "Diário", context.diary.length, [
      "registro",
      "registros",
      "Sem registros",
      " em 7 dias",
    ]),
    counted("medidas", "Medidas", context.measurements.length, [
      "medição",
      "medições",
      "Nenhuma medição",
    ]),
    counted("combinados", "Combinados", context.habits.length, [
      "combinado",
      "combinados",
      "Nenhum combinado",
    ]),
    counted("doses", "Doses", context.injections.length, [
      "dose",
      "doses",
      "Nenhuma dose",
      " em 30 dias",
    ]),
    counted("exames", "Exames", context.exams.length, [
      "exame",
      "exames",
      "Nenhum exame",
      " (nome e data)",
    ]),
  ];
}

export interface AiProviders {
  deepseek: boolean;
  openai: boolean;
}
/** Quem processa o pedido, conforme a configuração do servidor (sem expor chaves). */
export function providerLabel(providers: AiProviders | null): string {
  if (providers?.deepseek && providers.openai)
    return "DeepSeek, com a OpenAI como alternativa";
  if (providers?.deepseek) return "DeepSeek";
  if (providers?.openai) return "OpenAI";
  return "o provedor configurado no servidor";
}

export type ChatSuggestion =
  | { kind: "send"; label: string; prompt: string }
  | { kind: "diet"; label: string };
const MEAL_SUGGESTIONS = [
  {
    until: 10,
    label: "Ideias de café da manhã",
    prompt: "Pode me sugerir um café da manhã prático para hoje?",
  },
  {
    until: 16,
    label: "Ideias de almoço",
    prompt: "Pode me sugerir um almoço prático para hoje?",
  },
  {
    until: 24,
    label: "Sugira um jantar",
    prompt: "Pode me sugerir algo prático para o jantar de hoje?",
  },
];
/** Até 4 atalhos do momento: tocar envia a pergunta (ou abre a dieta). Nunca citam calorias. */
export function chatSuggestions(input: {
  time: string;
  hasPlan: boolean;
  waterBehind: boolean;
  missingInformation: number;
}): ChatSuggestion[] {
  const hour = Number(input.time.slice(0, 2));
  const meal =
    MEAL_SUGGESTIONS.find((item) => hour < item.until) ?? MEAL_SUGGESTIONS[2];
  const list: ChatSuggestion[] = [
    { kind: "diet", label: input.hasPlan ? "Minha dieta" : "Criar minha dieta" },
    { kind: "send", label: meal.label, prompt: meal.prompt },
  ];
  if (input.waterBehind)
    list.push({
      kind: "send",
      label: "Bater a meta de água",
      prompt: "Como bater minha meta de água hoje?",
    });
  if (input.missingInformation > 0)
    list.push({
      kind: "send",
      label: "Completar anamnese",
      prompt: "Quais informações da minha anamnese precisam de esclarecimento?",
    });
  list.push({
    kind: "send",
    label: "Revisar meus registros",
    prompt: "Ajude-me a revisar meus registros recentes.",
  });
  return list.slice(0, 4);
}
