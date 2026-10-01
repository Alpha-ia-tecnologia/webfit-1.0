/**
 * Cópia do estado no servidor (PostgreSQL, rotas /api/sync), igual no app web e no nativo. Só funciona
 * quando a pessoa liga "Cópia no servidor" (state.serverSync) e o servidor tem banco configurado.
 *
 * - Envio: alguns segundos depois da última gravação, só a versão mais recente, um envio por vez; falha de
 *   rede tenta de novo depois. Conflito (o servidor tem uma revisão mais nova) espera a decisão da pessoa.
 * - Restauração: a cópia volta pelas mesmas conferências de um backup em arquivo (validateBackup) e entra
 *   pelo mesmo caminho (prepareRestore): o aparelho mantém o próprio código e a IA e os lembretes desligam.
 * Sem React e sem fetch fixo: cada app entrega o `request` com o endereço e o token da sessão.
 */
import { parseJsonSafe } from "./agent-stream";
import { validateBackup } from "./backup";
import type { AppState } from "../types";

export const SERVER_SYNC_COPY = {
  title: "Cópia no servidor",
  hint: "Guarda seus dados também no banco de dados do servidor (PostgreSQL), para restaurar se este aparelho for limpo ou trocado.",
  unavailable: "Este servidor não tem banco de dados configurado: seus dados ficam só neste aparelho.",
  offline: "Servidor fora do alcance: a cópia é enviada quando a conexão voltar.",
  conflict: "O servidor tem uma cópia mais nova que a deste aparelho.",
  sendMine: "Enviar a deste aparelho",
  restore: "Restaurar do servidor",
  codeLabel: "Código de restauração",
  codeHint: "Cada aparelho tem o seu. Guarde-o com seus backups: ele dá acesso à cópia no servidor.",
  notFound: "O servidor não tem cópia para este código.",
  invalidCode: "Confira o código: ele tem 36 caracteres, como o deste aparelho.",
  restored: "Cópia do servidor restaurada. IA e lembretes permanecem desativados.",
  deleteFailed:
    "Não foi possível apagar a cópia no servidor agora, então nada foi excluído. Tente de novo com o servidor ligado ou desligue a cópia no servidor antes.",
  deleteCopy: "Apagar a cópia deste código",
  copyDeleteFailed: "Não foi possível apagar a cópia no servidor agora. Ela continua lá; tente de novo mais tarde.",
  copyDeleted: "Cópia apagada do servidor.",
  turnOffTitle: "Apagar também a cópia no servidor?",
  turnOffMessage: "A cópia deixa de ser atualizada. Você pode apagá-la agora ou mantê-la para restaurar depois.",
} as const;

/** Situação da cópia, mostrada em Ajustes e dados. */
export type SyncStatus =
  | { kind: "off" }
  | { kind: "unavailable" }
  | { kind: "pending" }
  | { kind: "synced"; at: string }
  | { kind: "conflict"; serverRevision: number }
  /** `retry`: falha passageira (rede, servidor ocupado ou fora do ar); sem ela, a cópia foi recusada. */
  | { kind: "error"; message: string; retry: boolean };

const hhmm = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return Number.isNaN(date.getTime()) ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Selo da linha "Situação" (tons de Ajustes: ok, attention ou neutro). */
export function syncStatusLabel(status: SyncStatus): { label: string; tone: "ok" | "attention" | "" } {
  switch (status.kind) {
    case "off":
      return { label: "Desligada", tone: "" };
    case "unavailable":
      return { label: "Servidor sem banco", tone: "attention" };
    case "pending":
      return { label: "Enviando…", tone: "" };
    case "synced":
      return { label: `Atualizada às ${hhmm(status.at)}`, tone: "ok" };
    case "conflict":
      return { label: "Servidor mais novo", tone: "attention" };
    case "error":
      return { label: status.retry ? "Aguardando conexão" : "Cópia recusada", tone: "attention" };
  }
}

/** O que as telas de Ajustes recebem do app (web e nativo). */
export interface ServerSyncControls {
  /** O servidor tem banco configurado (/api/status → sync). */
  available: boolean;
  status: SyncStatus;
  /** Liga ou desliga a cópia; ao desligar, `deleteCopy` também apaga a do servidor. */
  setEnabled: (enabled: boolean, deleteCopy?: boolean) => Promise<boolean>;
  /** Resolve um conflito com a versão deste aparelho. */
  sendMine: () => Promise<boolean>;
  /** Restaura a cópia de um código (o deste aparelho ou o de uma instalação anterior). */
  restoreFromServer: (code: string) => Promise<boolean>;
  /** Apaga a cópia de um código (ex.: a de uma instalação anterior, já restaurada). */
  deleteCopy: (code: string) => Promise<boolean>;
}

/** Um pedido ao servidor; `data` é o JSON da resposta (ou null). */
export type SyncRequest = (
  path: string,
  init: { method: "GET" | "POST" | "PUT" | "DELETE"; body?: string },
) => Promise<{ status: number; data: unknown }>;

/** O estado inteiro pode levar fotos e laudos: tempo de sobra para enviar pela rede local. */
export const SYNC_TIMEOUT_MS = 120_000;

/**
 * Pedidos de /api/sync com o token da sessão e prazo máximo (sem ele, um envio travado prenderia a fila e
 * o "Excluir todos os meus dados"). O web passa a própria origem; o nativo, o endereço do servidor.
 */
export function createHttpSyncRequest(
  baseUrl: () => string,
  getToken: () => string,
  /** Sessão da conta no app nativo (servidor online); o navegador usa o cookie. */
  getBearer: () => string = () => "",
): SyncRequest {
  return async (path, { method, body }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    const bearer = getBearer();
    try {
      const response = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: {
          "X-WebFit-Token": getToken(),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
        signal: controller.signal,
      });
      return { status: response.status, data: parseJsonSafe(await response.text()) };
    } finally {
      clearTimeout(timer);
    }
  };
}

const CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRestoreCode = (code: string) => CODE.test(code.trim());

const errorOf = (data: unknown) =>
  data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
    ? (data as { error: string }).error
    : null;

/** Envia o estado; `force` substitui uma cópia mais nova (a pessoa escolheu a deste aparelho). */
export async function pushState(request: SyncRequest, state: AppState, force = false): Promise<SyncStatus> {
  try {
    const { status, data } = await request(`/api/sync${force ? "?force=1" : ""}`, {
      method: "PUT",
      body: JSON.stringify(state),
    });
    if (status === 200) return { kind: "synced", at: new Date().toISOString() };
    if (status === 409) {
      const serverRevision = Number((data as { serverRevision?: unknown } | null)?.serverRevision);
      // A mesma revisão já está lá (um envio repetido depois de uma resposta perdida): está em dia.
      if (serverRevision === state.revision) return { kind: "synced", at: new Date().toISOString() };
      return { kind: "conflict", serverRevision: Number.isFinite(serverRevision) ? serverRevision : 0 };
    }
    // Sem banco configurado para de vez; banco fora do ar (também 503) tenta de novo.
    if (status === 503 && (data as { configured?: unknown } | null)?.configured === false) return { kind: "unavailable" };
    // Sessão trocada (o token volta na próxima consulta de /api/status), limite, prazo ou servidor fora do ar;
    // 507 é o limite de cópias do servidor: não passa sozinho.
    const retry = status === 401 || status === 408 || status === 429 || (status >= 500 && status !== 507);
    return {
      kind: "error",
      message: retry ? SERVER_SYNC_COPY.offline : (errorOf(data) ?? "O servidor recusou a cópia."),
      retry,
    };
  } catch {
    return { kind: "error", message: SERVER_SYNC_COPY.offline, retry: true };
  }
}

export type ServerRelation = {
  /** O aparelho está atrás, igual ou à frente da cópia; "unavailable" sem resposta válida. */
  relation: "unavailable" | "same" | "behind" | "ahead";
  revision: number | null;
};

/** Compara a revisão do servidor com a do aparelho ao abrir o app. */
export async function compareWithServer(request: SyncRequest, state: AppState): Promise<ServerRelation> {
  const unavailable: ServerRelation = { relation: "unavailable", revision: null };
  try {
    const { status, data } = await request(`/api/sync/status?userId=${encodeURIComponent(state.userId)}`, { method: "GET" });
    const body = (data ?? {}) as { configured?: unknown; revision?: unknown };
    if (status !== 200 || body.configured !== true) return unavailable;
    const revision = typeof body.revision === "number" ? body.revision : null;
    if (revision === null || revision < state.revision) return { relation: "behind", revision };
    return { relation: revision === state.revision ? "same" : "ahead", revision };
  } catch {
    return unavailable;
  }
}

/** Busca e confere a cópia de um código; erros viram frases para a pessoa. */
export async function fetchServerState(request: SyncRequest, code: string): Promise<AppState> {
  const userId = code.trim().toLowerCase();
  if (!isRestoreCode(userId)) throw new Error(SERVER_SYNC_COPY.invalidCode);
  let response: { status: number; data: unknown };
  try {
    response = await request(`/api/sync/state?userId=${encodeURIComponent(userId)}`, { method: "GET" });
  } catch {
    throw new Error(SERVER_SYNC_COPY.offline);
  }
  if (response.status === 404) throw new Error(SERVER_SYNC_COPY.notFound);
  if (response.status === 503) throw new Error(SERVER_SYNC_COPY.unavailable);
  if (response.status !== 200) throw new Error(errorOf(response.data) ?? "Não foi possível buscar a cópia.");
  return validateBackup((response.data as { state?: unknown } | null)?.state);
}

/** Apaga a cópia do servidor (ao excluir os dados do aparelho); devolve se conseguiu. */
export async function deleteServerCopy(request: SyncRequest, userId: string): Promise<boolean> {
  try {
    const { status } = await request(`/api/sync?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    return status === 200;
  } catch {
    return false;
  }
}

export const SYNC_DELAY_MS = 4000;
export const SYNC_RETRY_MS = 30_000;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Fila de envio: guarda só o estado mais recente e envia `delayMs` depois da última gravação, um envio de
 * cada vez. Falha passageira tenta de novo em `retryMs`; cópia recusada, conflito e servidor sem banco
 * param até a próxima gravação ou a pessoa agir. `cancel` também descarta o resultado do envio em andamento.
 */
export function createSyncQueue({
  push,
  onStatus,
  delayMs = SYNC_DELAY_MS,
  retryMs = SYNC_RETRY_MS,
}: {
  push: (state: AppState) => Promise<SyncStatus>;
  onStatus: (status: SyncStatus) => void;
  delayMs?: number;
  retryMs?: number;
}) {
  let latest: AppState | null = null;
  let timer: Timer | null = null;
  let running: Promise<void> | null = null;
  /** Muda a cada cancel: o envio que já estava no ar não mexe mais na situação nem agenda nova tentativa. */
  let generation = 0;
  const wait = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, ms);
  };
  const run = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (latest) {
        const state = latest;
        const round = generation;
        latest = null;
        onStatus({ kind: "pending" });
        const status = await push(state);
        // Cancelado durante o envio: o resultado é descartado; só segue se algo foi agendado depois.
        if (round !== generation) continue;
        onStatus(status);
        if (status.kind === "error" && status.retry) {
          // Mantém a versão mais nova (pode ter chegado outra durante o envio) e tenta de novo depois.
          latest ??= state;
          wait(retryMs);
          break;
        }
        if (status.kind !== "synced") {
          latest = null;
          break;
        }
      }
    })().finally(() => {
      running = null;
    });
    return running;
  };
  return {
    schedule(state: AppState) {
      latest = state;
      wait(delayMs);
    },
    /** Envia já o que estiver pendente (ex.: logo ao ligar a cópia). */
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      await run();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      latest = null;
      generation += 1;
    },
    /** Espera o envio em andamento terminar (ex.: antes de apagar a cópia, para ela não voltar). */
    async settle() {
      await running;
    },
  };
}
