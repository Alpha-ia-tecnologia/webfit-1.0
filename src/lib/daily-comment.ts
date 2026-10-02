/**
 * Recado do dia ("Seu agente · 07:10" no Resumo do Hoje): uma vez por dia local, ao abrir o Hoje,
 * o app pede ao agente (modo chat, o mesmo envio da conversa) um recado curto, uma frase só com
 * uma sugestão para hoje ou um incentivo, a partir dos sinais do app (signals.ts) e do ajuste da
 * meta de hoje. Sem números escondidos pela pessoa, sem dose, nunca para perfis calmos. A data fica
 * no estado (aiDailyCommentDate) antes do pedido: falhou, não tenta de novo no mesmo dia (nem em
 * outro aparelho). A resposta vira o título do Resumo (`headline`); o chat a mostra como cartão.
 */
import type { AgentReply, AppState, ChatMessage } from "../types";
import type { AiQuota } from "./account";
import type { SyncStatus } from "./server-sync";
import { DAILY_COMMENT_KEY, isCalmOn } from "./day";
import { localTime } from "./dates";
import { dailyTargets, localDate, uid } from "./domain";
import { signalBriefs } from "./signals";
import { visiblePlainText } from "./text";

/** Chave em signalDismissals do recado no Hoje (definida em day.ts, que monta o Resumo). */
export { DAILY_COMMENT_KEY };
/** Início fixo do pedido: a conversa reconhece a mensagem e mostra só o aviso do comentário. */
export const DAILY_COMMENT_PREFIX = "Comentário automático do dia.";
/** Aviso no lugar do pedido, na conversa (o horário vem ao lado; a nota logo abaixo traz só a frase). */
export const DAILY_COMMENT_CHIP = "Recado do dia";
/** O recado: uma frase até este tamanho (o título do Resumo cabe em duas linhas a 390 px). */
export const HEADLINE_MAX = 90;
/** Observação opcional (um segundo bloco "texto", se vier): uma frase até este tamanho. */
export const DETAIL_MAX = 110;

/**
 * Pedido-base: um único bloco "texto" com uma frase (≤ 90 caracteres), sem saudação, amigável e
 * concreto (sugestão para hoje ou incentivo breve), metas como estão, sem dose.
 */
export const DAILY_COMMENT_REQUEST = `${DAILY_COMMENT_PREFIX} Com base nos meus registros recentes e na minha anamnese, deixe um recado curto para hoje. Responda com exatamente um bloco de texto, de uma frase só, com no máximo ${HEADLINE_MAX} caracteres, sem saudação, amigável e concreto: uma sugestão para hoje ou um incentivo breve, respeitando as minhas preferências (alimentos favoritos e evitados, rotina, tempo para cozinhar e orçamento). Use as metas do app como estão, sem recalcular; não incentive pular refeições nem comer menos para equilibrar outro dia; não comente nem sugira doses.`;

/** O pedido do dia: o pedido-base, o que o app observou (títulos, sem números) e o ajuste de hoje. */
export function dailyCommentRequest(state: AppState, today: string): string {
  const profile = state.profile;
  const hideCalories = profile?.hideCalories ?? false;
  const hideBody = profile?.hideBodyNumbers ?? false;
  const briefs = signalBriefs(state, today);
  const note = profile ? dailyTargets(state, today).adjustmentNote : null;
  return [
    DAILY_COMMENT_REQUEST,
    briefs.length ? `O que o app observou nos últimos dias: ${briefs.join("; ")}.` : null,
    note ? `Ajuste da meta de hoje feito pelo app: ${visiblePlainText(note, hideCalories, hideBody)}` : null,
    hideCalories ? "Não cite calorias." : null,
    hideBody ? "Não cite peso, medidas nem outros números do corpo." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export const isDailyCommentRequest = (text: string) => text.startsWith(DAILY_COMMENT_PREFIX);

/** Cota diária do servidor online esgotada (sem limite ou desconhecida não conta como esgotada). */
export const isQuotaExhausted = (quota: AiQuota | null | undefined): boolean =>
  !!quota && quota.limit !== null && quota.used >= quota.limit;

/** A cópia no servidor, como o app a vê (useServerSync: controls.available e controls.status). */
export interface DailyCommentSync {
  /** O servidor tem banco e, online, a sessão está aberta. */
  available: boolean;
  status: SyncStatus;
}
/**
 * A cópia no servidor já foi comparada com a deste aparelho (ou não está em uso)? Com a cópia
 * ligada e o servidor ao alcance, só "synced" serve: antes da 1ª comparação ("off" ainda,
 * "pending"), em conflito ou com erro, o aiDailyCommentDate do servidor (outro aparelho pode já ter
 * rodado hoje) ainda não chegou, e rodar agora gastaria um pedido a mais da cota.
 */
export function isSyncSettled(state: AppState | null, sync: DailyCommentSync | undefined): boolean {
  if (!state?.serverSync || !sync?.available) return true;
  return sync.status.kind === "synced";
}

export interface DailyCommentGate {
  state: AppState | null;
  today: string;
  aiReady: boolean;
  aiBusy: boolean;
  quota?: AiQuota | null;
  /** Sem ele, a cópia no servidor conta como desligada. */
  sync?: DailyCommentSync;
}
/**
 * Roda hoje? Consentimento, agente pronto e livre, preferência ligada, ainda não rodou, perfil não
 * calmo, cota e a cópia no servidor já comparada (isSyncSettled).
 */
export function shouldRunDailyComment({ state, today, aiReady, aiBusy, quota, sync }: DailyCommentGate): boolean {
  const profile = state?.profile;
  return (
    !!profile &&
    isSyncSettled(state, sync) &&
    profile.consentAi &&
    aiReady &&
    !aiBusy &&
    state.aiDailyComment !== false &&
    state.aiDailyCommentDate !== today &&
    !isCalmOn(profile, today) &&
    !isQuotaExhausted(quota)
  );
}

export interface DailyCommentRun {
  today: string;
  getState: () => AppState | null;
  /** O envio do chat (aiRequest no modo "chat"). */
  request: (mode: "chat", text: string) => Promise<AgentReply>;
  commit: (update: (state: AppState) => AppState) => Promise<boolean>;
  /** Online: cota atual da conta (null quando não deu para saber: não roda). */
  checkQuota?: () => Promise<AiQuota | null>;
}

/** Grava a data de hoje se ainda não estava; true só para quem gravou (nunca roda duas vezes). */
async function claimToday(run: DailyCommentRun): Promise<boolean> {
  let isClaimed = false;
  const saved = await run.commit((state) => {
    if (state.aiDailyCommentDate === run.today) return state;
    isClaimed = true;
    return { ...state, aiDailyCommentDate: run.today };
  });
  return saved && isClaimed;
}

/** Pedido e resposta entram juntos na conversa; sem consentimento no meio do caminho, nada entra. */
function withComment(state: AppState, text: string, reply: AgentReply): AppState {
  if (!state.profile?.consentAi) return state;
  const now = new Date().toISOString();
  const blocks = reply.structured?.kind === "chat" ? { blocks: reply.structured.sections } : {};
  const messages: ChatMessage[] = [
    { id: uid(), sender: "user", text, timestamp: now, status: "sent" },
    { id: uid(), sender: "ai", text: reply.text, meta: reply.meta, ...blocks, timestamp: now, status: "sent" },
  ];
  return { ...state, messages: [...state.messages, ...messages] };
}

/**
 * Executa o comentário do dia: cota (online), reserva da data, pedido no modo chat e gravação.
 * Falhas são silenciosas (sem nova tentativa, sem aviso): devolve true só quando gravou.
 */
export async function runDailyComment(run: DailyCommentRun): Promise<boolean> {
  try {
    if (run.checkQuota) {
      const quota = await run.checkQuota();
      if (!quota || isQuotaExhausted(quota)) return false;
    }
    const current = run.getState();
    if (!current?.profile || !(await claimToday(run))) return false;
    const text = dailyCommentRequest(current, run.today);
    const reply = await run.request("chat", text);
    return await run.commit((state) => withComment(state, text, reply));
  } catch {
    return false;
  }
}

/** Texto corrido: sem negrito, títulos ou marcadores de lista do markdown. */
export function plainComment(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Corta numa fronteira de palavra (com reticências) quando passa de `max`; sem quebras de linha. */
function clipAt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, "")}…`;
}
/** [primeira frase, o resto]; sem pontuação final, o texto inteiro é a frase. */
function splitSentence(text: string): [string, string] {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = /^.*?[.!?…](?=\s|$)/.exec(clean);
  if (!match) return [clean, ""];
  return [match[0], clean.slice(match[0].length).trim()];
}
/** A primeira frase do texto, cortada em `max` caracteres (o título do Resumo). */
export function firstSentence(text: string, max = HEADLINE_MAX): string {
  return clipAt(splitSentence(text)[0], max);
}
/** Os blocos "texto" da resposta, já legíveis (sem markdown nem números ocultos) e sem vazios. */
function textBlocks(message: Pick<ChatMessage, "blocks">, hideCalories: boolean, hideBody: boolean): string[] {
  return (message.blocks ?? [])
    .flatMap((section) => section.blocos)
    .flatMap((block) => (block.tipo === "texto" ? [plainComment(visiblePlainText(block.texto, hideCalories, hideBody))] : []))
    .filter(Boolean);
}
export interface DailyCommentParts {
  /** O recado: o 1º bloco "texto" (ou a 1ª frase do texto salvo), até 90 caracteres. */
  headline: string;
  /** A observação: o 2º bloco "texto" (ou o resto do texto), até 110 caracteres; null sem ela. */
  detail: string | null;
}
/**
 * Contrato do recado para o Hoje e para o cartão compacto do chat: `headline` sempre existe (com
 * fallback a partir do texto); `detail` só quando a resposta trouxe mais que a frase.
 */
export function commentParts(
  reply: Pick<ChatMessage, "text" | "blocks">,
  hideCalories = false,
  hideBody = false,
): DailyCommentParts {
  const text = plainComment(visiblePlainText(reply.text, hideCalories, hideBody));
  const [first, second] = textBlocks(reply, hideCalories, hideBody);
  const [sentence, rest] = splitSentence(first ?? text);
  const extra = second ?? rest;
  return { headline: clipAt(sentence, HEADLINE_MAX), detail: extra.trim() ? clipAt(extra, DETAIL_MAX) : null };
}

export interface DailyComment extends DailyCommentParts {
  /** A resposta inteira do agente (texto já sem calorias ou números do corpo ocultos). */
  text: string;
  /** "HH:MM" local da resposta, para o kicker "Seu agente · 07:10". */
  time: string;
  date: string;
  messageId: string;
}
/**
 * O recado de hoje para o Resumo do Hoje: a resposta logo depois do pedido automático de hoje,
 * enquanto a preferência está ligada, há consentimento e o recado não foi dispensado hoje.
 */
export function latestDailyComment(state: AppState, today: string): DailyComment | null {
  const profile = state.profile;
  if (!profile?.consentAi || state.aiDailyComment === false || isCalmOn(profile, today)) return null;
  if (state.signalDismissals?.[DAILY_COMMENT_KEY] === today) return null;
  for (let index = state.messages.length - 2; index >= 0; index--) {
    const request = state.messages[index];
    if (request.sender !== "user" || !isDailyCommentRequest(request.text)) continue;
    if (localDate(new Date(request.timestamp)) !== today) return null;
    const reply = state.messages[index + 1];
    if (reply.sender !== "ai" || reply.status === "error") return null;
    return {
      ...commentParts(reply, profile.hideCalories, profile.hideBodyNumbers),
      text: plainComment(visiblePlainText(reply.text, profile.hideCalories, profile.hideBodyNumbers)),
      time: localTime(new Date(reply.timestamp)),
      date: today,
      messageId: reply.id,
    };
  }
  return null;
}
