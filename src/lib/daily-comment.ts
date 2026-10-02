/**
 * Comentário automático do dia ("Seu agente comentou"): uma vez por dia local, ao abrir o Hoje,
 * o app pede ao agente (modo chat, o mesmo envio da conversa) um comentário curto e proativo com
 * uma sugestão para hoje, a partir dos sinais do app (signals.ts) e do ajuste da meta de hoje.
 * Sem números escondidos pela pessoa, sem dose, nunca para perfis calmos. A data fica no estado
 * (aiDailyCommentDate) antes do pedido: falhou, não tenta de novo no mesmo dia (nem em outro aparelho).
 */
import type { AgentReply, AppState, ChatMessage } from "../types";
import type { AiQuota } from "./account";
import type { SyncStatus } from "./server-sync";
import { isCalmOn } from "./day";
import { dailyTargets, localDate, uid } from "./domain";
import { signalBriefs } from "./signals";
import { visiblePlainText } from "./text";

/** Início fixo do pedido: a conversa reconhece a mensagem e mostra só o aviso do comentário. */
export const DAILY_COMMENT_PREFIX = "Comentário automático do dia.";
/** Chave em signalDismissals do cartão do Hoje (a data é a do comentário dispensado). */
export const DAILY_COMMENT_KEY = "comentario-do-dia";
/** Aviso no lugar do pedido, na conversa. */
export const DAILY_COMMENT_CHIP = "Comentário automático do dia";

/** Pedido-base: curto, proativo, uma sugestão concreta, metas como estão, sem dose. */
export const DAILY_COMMENT_REQUEST = `${DAILY_COMMENT_PREFIX} Com base nos meus registros recentes e na minha anamnese, faça um comentário curto e proativo (no máximo 4 frases) sobre como estou indo e dê 1 sugestão concreta para hoje, respeitando as minhas preferências (alimentos favoritos e evitados, rotina, tempo para cozinhar e orçamento). Use as metas do app como estão, sem recalcular; não incentive pular refeições nem comer menos para equilibrar outro dia; não comente nem sugira doses.`;

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

/** O cartão mostra texto corrido: sem negrito, títulos ou marcadores de lista do markdown. */
export function plainComment(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface DailyComment {
  /** A resposta do agente (texto já sem calorias ou números do corpo ocultos). */
  text: string;
  date: string;
  messageId: string;
}
/**
 * O comentário de hoje para o cartão do Hoje: a resposta logo depois do pedido automático de hoje,
 * enquanto a preferência está ligada, há consentimento e o cartão não foi dispensado hoje.
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
      text: plainComment(visiblePlainText(reply.text, profile.hideCalories, profile.hideBodyNumbers)),
      date: today,
      messageId: reply.id,
    };
  }
  return null;
}
