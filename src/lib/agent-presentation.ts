import type { Domain } from "../design/tokens";
import type { AgentMeta, AppState, ChatMessage } from "../types";
import { layoutSections, type ChatBlock, type ChatSection } from "./agent-blocks";
import { isDailyCommentRequest } from "./daily-comment";
import { DIET_PLAN_REQUEST } from "./diet";
import { agentContext, localDate } from "./domain";
import { fmtShortDate, plural } from "./format";
import { maskStructured } from "./structured";

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

/** Início fixo do pedido de análise: conversas com o pedido antigo continuam reconhecidas por ele. */
export const PROFILE_ANALYSIS_PREFIX = "Faça uma análise detalhada do meu perfil";
export const isProfileAnalysisRequest = (text: string) => text.startsWith(PROFILE_ANALYSIS_PREFIX);

/** Títulos literais das 4 listas do relatório, na ordem em que o cartão as desenha. */
export const PROFILE_REPORT_TITLES = {
  well: "Indo bem",
  attention: "Atenção",
  suggestions: "Sugestões para os próximos dias",
  talk: "Para conversar com quem acompanha você",
} as const;
export type ReportSectionKey = keyof typeof PROFILE_REPORT_TITLES;
/** Rótulos curtos do cartão (cabem numa linha a 320 px); os títulos longos ficam só no pedido. */
export const PROFILE_REPORT_LABELS: Record<ReportSectionKey, string> = {
  well: "Indo bem",
  attention: "Atenção",
  suggestions: "Sugestões",
  talk: "Para conversar",
};

/**
 * Pedido pronto de "Analisar meu perfil" (modo chat): cruza anamnese, registros e preferências
 * usando as metas do app como estão e dita a estrutura em blocos que o cartão-relatório desenha
 * (1 texto, as 4 listas de PROFILE_REPORT_TITLES, sugestões). Nunca pede números novos de meta
 * nem comentário de dose. O esquema do servidor não muda: são blocos que ele já aceita.
 */
export const PROFILE_ANALYSIS_REQUEST = `${PROFILE_ANALYSIS_PREFIX}, cruzando a minha anamnese (objetivo, condições de saúde declaradas, uso de caneta, nível de atividade, sono e estresse), o meu diário recente, as medidas, as aplicações e os sintomas registrados, e as minhas preferências (alimentos favoritos e evitados, rotina, tempo para cozinhar e orçamento). Use as metas do app como estão, sem recalcular, e não comente nem sugira doses. Responda só com blocos, nesta ordem: 1 bloco "texto" com uma síntese de até 120 caracteres; depois exatamente 4 blocos "lista" (ordenada=false) com estes títulos literais: "${PROFILE_REPORT_TITLES.well}", "${PROFILE_REPORT_TITLES.attention}", "${PROFILE_REPORT_TITLES.suggestions}" (refeições práticas que respeitem as minhas preferências) e "${PROFILE_REPORT_TITLES.talk}", cada lista com 2 a 3 itens de até 80 caracteres, em frases diretas, sem markdown e sem números de dose; por fim 1 bloco "sugestoes".`;

export interface ReportSection {
  key: ReportSectionKey;
  title: string;
  /** indo bem = positivo (verde-água), atenção = informativo (azul), sugestões = agente (menta), conversar = neutro. */
  tone: Domain;
  items: string[];
}
export interface ProfileReport {
  /** A síntese (o bloco "texto"), sem markdown. */
  summary: string;
  /** As 4 seções, na ordem do cartão. */
  sections: ReportSection[];
  /** Próximas perguntas (bloco "sugestoes"), quando houver. */
  suggestions: string[];
}

const REPORT_TONE: Record<ReportSectionKey, Domain> = {
  well: "habit",
  attention: "water",
  suggestions: "food",
  talk: "neutral",
};
const REPORT_KEYS = Object.keys(PROFILE_REPORT_TITLES) as ReportSectionKey[];

const foldText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
/** Sem negrito, marcador ou numeração à frente e com os espaços normalizados. */
const plainItem = (text: string) =>
  text
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/** A que seção o título de uma lista pertence: aceita numeração, dois-pontos e variações ("Pontos de atenção"). */
function reportKey(title: string | null): ReportSectionKey | null {
  if (!title) return null;
  const folded = foldText(plainItem(title)).replace(/[:.!]+$/, "").trim();
  if (folded.includes("indo bem")) return "well";
  if (folded.includes("conversar")) return "talk";
  if (folded.startsWith("sugest")) return "suggestions";
  if (folded.includes("atencao")) return "attention";
  return null;
}

const isText = (b: ChatBlock): b is Extract<ChatBlock, { tipo: "texto" }> => b.tipo === "texto";
const isList = (b: ChatBlock): b is Extract<ChatBlock, { tipo: "lista" }> => b.tipo === "lista";

/**
 * Lê a resposta ao pedido de análise como relatório: exatamente 1 bloco "texto" (a síntese) e as
 * 4 listas com os títulos pedidos, em qualquer ordem, com "sugestoes" opcional. Qualquer outro
 * bloco, lista repetida, ausente ou vazia devolve null: a resposta segue no desenho normal.
 */
export function profileReport(sections: readonly ChatSection[]): ProfileReport | null {
  const blocks = sections.flatMap((section) => section.blocos);
  const texts = blocks.filter(isText);
  const lists = blocks.filter(isList);
  const others = blocks.filter((b) => !isText(b) && !isList(b) && b.tipo !== "sugestoes");
  if (texts.length !== 1 || lists.length !== 4 || others.length) return null;
  const found = new Map<ReportSectionKey, string[]>();
  for (const list of lists) {
    const key = reportKey(list.titulo);
    const items = list.itens.map(plainItem).filter(Boolean);
    if (!key || found.has(key) || !items.length) return null;
    found.set(key, items);
  }
  const summary = plainItem(texts[0].texto);
  if (!summary) return null;
  return {
    summary,
    sections: REPORT_KEYS.map((key) => ({
      key,
      title: PROFILE_REPORT_LABELS[key],
      tone: REPORT_TONE[key],
      items: found.get(key) ?? [],
    })),
    suggestions: blocks.flatMap((b) => (b.tipo === "sugestoes" ? b.itens : [])),
  };
}

export interface ReportContext {
  sensitive: boolean;
  allergyDetails: string;
  hideCalories: boolean;
  hideBodyNumbers: boolean;
}
/**
 * O relatório como a tela o desenha: blocos limpos para o perfil (layoutSections: sugestões sem
 * medicamento, incentivo sensível ou alergênico) e todo texto já sem calorias ou números do corpo
 * ocultos. Null quando, depois da limpeza, a estrutura não bate: a tela volta aos blocos normais.
 */
export function visibleProfileReport(
  sections: readonly ChatSection[],
  ctx: ReportContext,
): ProfileReport | null {
  const layout = layoutSections(sections, ctx);
  const plain = maskStructured(layout, ctx.hideCalories, {
    plain: true,
    hideBodyNumbers: ctx.hideBodyNumbers,
  });
  const report = profileReport(plain.sections);
  return report ? { ...report, suggestions: plain.suggestions } : null;
}

/**
 * Respostas com desenho próprio: a que segue o pedido de análise, quando veio na estrutura pedida,
 * é o cartão-relatório ("report"); a que segue o comentário automático do dia é o recado compacto
 * ("daily"). Respostas com erro, ou após um pedido que falhou, seguem o desenho de sempre.
 */
export type ReplyView = "report" | "daily";
export function replyViews(messages: ChatMessage[]): Map<string, ReplyView> {
  const views = new Map<string, ReplyView>();
  messages.forEach((message, index) => {
    const request = messages[index - 1];
    if (message.sender !== "ai" || message.status === "error") return;
    if (request?.sender !== "user" || request.status === "error") return;
    if (isDailyCommentRequest(request.text)) views.set(message.id, "daily");
    else if (isProfileAnalysisRequest(request.text) && profileReport(message.blocks ?? []))
      views.set(message.id, "report");
  });
  return views;
}

/**
 * Como cada mensagem aparece no chat. O texto salvo não muda: o pedido técnico da dieta
 * vira um aviso compacto, o plano que o segue vira um cartão-resumo, o pedido de análise do
 * perfil e o pedido do comentário automático do dia viram avisos (as respostas deles têm desenho
 * próprio em replyViews) e respostas com blocos visuais (SIS-02) são desenhadas por blocos.
 */
export type MessageView =
  | "text"
  | "diet-request"
  | "diet-plan"
  | "profile-request"
  | "daily-request"
  | "blocks";
export function messageViews(
  messages: ChatMessage[],
): Map<string, MessageView> {
  const views = new Map<string, MessageView>();
  messages.forEach((message, index) => {
    // Pedido de análise que falhou continua como texto, com o "Tentar de novo" da bolha.
    if (
      message.sender === "user" &&
      isProfileAnalysisRequest(message.text) &&
      message.status !== "error"
    )
      views.set(message.id, "profile-request");
    // Comentário automático do dia: o pedido técnico vira o aviso "Comentário automático do dia".
    if (
      message.sender === "user" &&
      isDailyCommentRequest(message.text) &&
      message.status !== "error"
    )
      views.set(message.id, "daily-request");
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
