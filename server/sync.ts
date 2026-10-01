/**
 * /api/sync: cópia do estado do aplicativo no PostgreSQL (server/db/state-repo.ts).
 *
 * - GET  /api/sync/status?userId=…  → { configured, revision }  (revision null: o servidor ainda não tem cópia)
 * - PUT  /api/sync[?force=1]        → { revision } | 409 { error, serverRevision } | 422 { error }
 * - GET  /api/sync/state?userId=…   → { state } | 404
 * - DELETE /api/sync?userId=…       → { deleted }  (excluir os dados também apaga a cópia)
 *
 * Acesso (`authorize`):
 * - no computador ou na rede local, o token de sessão do agente (X-WebFit-Token) e o userId da instalação,
 *   um UUID aleatório que só o aparelho dono dos dados conhece;
 * - online, a conta da sessão: só a cópia cujo userId é o id da conta.
 * Sem DATABASE_URL, tudo responde { configured: false } ou 503 e o aplicativo segue só no aparelho.
 * Registrar antes do express.json geral de /api: o estado completo passa dos 8 MB do resto da API.
 */
import express from "express";
import type pg from "pg";
import { createPool } from "./db/client";
import {
  deleteUserState,
  isUuid,
  loadUserState,
  MAX_SYNC_USERS,
  saveUserState,
  StateConflict,
  StateError,
  userRevision,
} from "./db/state-repo";
import { slidingWindow } from "./rate-limit";

/** O estado completo pode passar dos 8 MB do resto da API (fotos de refeição, laudos). */
export const SYNC_BODY_LIMIT = "64mb";
/** Por aparelho ou conta: o app envia no máximo uma cópia a cada poucos segundos. */
const SYNC_LIMIT_PER_MINUTE = 30;

const OFFLINE = "O banco de dados não está disponível agora. Seus dados continuam neste aparelho.";
const BAD_SESSION = "Sessão inválida. Recarregue o aplicativo.";
const OTHER_ACCOUNT = "Esta cópia é de outra conta.";

/** Quem fez o pedido: `accountId` null no modo local (vale o código da instalação). */
export interface SyncIdentity {
  accountId: string | null;
}

export interface SyncOptions {
  /** null quando o pedido não tem acesso (token ou sessão inválidos). */
  authorize: (req: express.Request) => Promise<SyncIdentity | null>;
  env?: NodeJS.ProcessEnv;
  /** Pool compartilhado com as contas (online); sem ele, um pool próprio criado na primeira vez. */
  getPool?: () => pg.Pool;
}

type Locals = { identity?: SyncIdentity };

export function registerSync(app: express.Express, { authorize, env = process.env, getPool: shared }: SyncOptions) {
  const configured = Boolean(env.DATABASE_URL);
  let pool: pg.Pool | null = null;
  const window = slidingWindow(SYNC_LIMIT_PER_MINUTE, 60_000);
  const getPool = shared ?? (() => (pool ??= createPool(env.DATABASE_URL)));

  async function withDb<T>(res: express.Response, work: (client: pg.PoolClient) => Promise<T>): Promise<T | undefined> {
    let client: pg.PoolClient | undefined;
    try {
      client = await getPool().connect();
      return await work(client);
    } catch (error) {
      if (error instanceof StateConflict)
        res.status(409).json({ error: error.message, serverRevision: error.serverRevision });
      else if (error instanceof StateError) res.status(error.status).json({ error: error.message });
      else {
        // Só a mensagem (sem dados da pessoa nem a URL do banco).
        console.error("Falha na sincronização:", error instanceof Error ? error.message : "erro desconhecido");
        res.status(503).json({ error: OFFLINE });
      }
      return undefined;
    } finally {
      client?.release();
    }
  }

  /** Acesso, limite por aparelho ou conta e banco configurado, antes de ler qualquer corpo. */
  const guard =
    ({ requireDb = true } = {}): express.RequestHandler =>
    (req, res, next) => {
      authorize(req)
        .then((identity) => {
          if (!identity) return res.status(401).json({ error: BAD_SESSION, auth: "required" });
          if (window.hit(identity.accountId ?? req.ip ?? "local"))
            return res.status(429).json({ error: "Muitas sincronizações seguidas. Aguarde um minuto." });
          if (requireDb && !configured) return res.status(503).json({ error: OFFLINE, configured: false });
          (res.locals as Locals).identity = identity;
          next();
        })
        .catch(next);
    };

  /** Online, só o userId da própria conta (403 para qualquer outro); no modo local, qualquer código. */
  function owned(res: express.Response, userId: string): boolean {
    const accountId = (res.locals as Locals).identity?.accountId;
    if (accountId && userId !== accountId) {
      res.status(403).json({ error: OTHER_ACCOUNT });
      return false;
    }
    return true;
  }
  const userIdOf = (req: express.Request) => String(req.query.userId ?? "");
  // Online, cada conta só envia a própria cópia (o convite já limita as contas); o teto vale no modo local.
  const maxUsers = (res: express.Response) => ((res.locals as Locals).identity?.accountId ? Infinity : MAX_SYNC_USERS);

  app.get("/api/sync/status", guard({ requireDb: false }), async (req, res) => {
    if (!configured) return res.json({ configured: false, revision: null });
    const userId = userIdOf(req);
    if (!isUuid(userId)) return res.json({ configured: true, revision: null });
    if (!owned(res, userId)) return;
    const revision = await withDb(res, (client) => userRevision(client, userId));
    if (revision !== undefined) res.json({ configured: true, revision });
  });

  app.put("/api/sync", guard(), express.json({ limit: SYNC_BODY_LIMIT }), async (req, res) => {
    if (!owned(res, String(req.body?.userId ?? ""))) return;
    const force = req.query.force === "1";
    const revision = await withDb(res, (client) => saveUserState(client, req.body, { force, maxUsers: maxUsers(res) }));
    if (revision !== undefined) res.json({ revision });
  });

  app.get("/api/sync/state", guard(), async (req, res) => {
    const userId = userIdOf(req);
    if (!isUuid(userId)) return res.status(400).json({ error: "Código de restauração inválido." });
    if (!owned(res, userId)) return;
    const state = await withDb(res, (client) => loadUserState(client, userId));
    if (state === undefined) return;
    if (!state) return res.status(404).json({ error: "O servidor não tem cópia para este código." });
    res.json({ state });
  });

  app.delete("/api/sync", guard(), async (req, res) => {
    const userId = userIdOf(req);
    if (!isUuid(userId)) return res.status(400).json({ error: "Código de restauração inválido." });
    if (!owned(res, userId)) return;
    const deleted = await withDb(res, (client) => deleteUserState(client, userId));
    if (deleted !== undefined) res.json({ deleted });
  });

  /** Fecha as conexões do pool próprio (testes e desligamento do servidor). */
  return {
    close: async () => {
      const open = pool;
      pool = null;
      await open?.end();
    },
  };
}
