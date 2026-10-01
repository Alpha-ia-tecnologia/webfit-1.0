/**
 * /api/admin: painel do administrador do WebFit online (só contas com papel "owner").
 *
 * - GET    /api/admin/invites                                      → { invites }
 * - POST   /api/admin/invites            { note?, days? }          → { code, invite }  (código mostrado uma vez)
 * - DELETE /api/admin/invites/:id                                  → { ok }            (só convite não usado)
 * - GET    /api/admin/accounts                                     → { accounts }
 * - POST   /api/admin/accounts/:id/reset                           → { code, expiresAt } (24 h, uma vez)
 * - POST   /api/admin/accounts/:id/status    { disabled }          → { ok }            (bloquear encerra as sessões)
 * - POST   /api/admin/accounts/:id/role      { role }              → { ok }
 *
 * A sessão é conferida por requireAccount (com a proteção de origem dos cookies); cada dono tem até 60
 * pedidos por minuto e toda mudança fica no log, sem e-mails nem códigos.
 */
import express from "express";
import type pg from "pg";
import { slidingWindow } from "../rate-limit";
import {
  AuthError,
  createPasswordResetById,
  INVITE_DAYS,
  issueInvite,
  listAccounts,
  listInvites,
  revokeInvite,
  setDisabledById,
  setRoleById,
  type Account,
  type Role,
} from "./repo";

export interface AdminConfig {
  getPool: () => pg.Pool;
  requireAccount: express.RequestHandler;
  /** Origem pública; pedidos que mudam algo e trazem Origin precisam vir dela. */
  publicOrigin: string;
}

const ADMIN_BODY_LIMIT = "16kb";
const MINUTE = 60_000;
const REQUESTS_PER_MINUTE = 60;
const NOTE_MAX = 120;
const DAYS_MIN = 1;
const DAYS_MAX = 365;
const INVITE_ID = /^[0-9a-f]{64}$/;
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORBIDDEN = "Só quem administra o WebFit pode fazer isso.";
const ACCOUNT_MISSING = "Conta não encontrada.";

type Locals = { account?: Account };
const ownAccount = (res: express.Response) => (res.locals as Locals).account!;

/** Validade do convite em dias (padrão 14); null quando não é inteiro de 1 a 365. */
function inviteDays(value: unknown): number | null {
  if (value === undefined || value === null) return INVITE_DAYS;
  return typeof value === "number" && Number.isInteger(value) && value >= DAYS_MIN && value <= DAYS_MAX ? value : null;
}

/** Nota do convite sem espaços nas pontas; null quando não é texto ou passa do limite. */
function inviteNote(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const note = value.trim();
  return note.length <= NOTE_MAX ? note : null;
}

/** Id de conta (UUID) em minúsculas; lança 400 quando não tem o formato. */
function accountId(req: express.Request): string {
  const id = String(req.params.id ?? "");
  if (!ACCOUNT_ID.test(id)) throw new AuthError(400, "Conta inválida.");
  return id.toLowerCase();
}

export function registerAdmin(app: express.Express, config: AdminConfig) {
  const perOwner = slidingWindow(REQUESTS_PER_MINUTE, MINUTE);
  const json = express.json({ limit: ADMIN_BODY_LIMIT });
  const ipOf = (req: express.Request) => req.ip ?? "desconhecido";
  /** Mudanças feitas pelo painel no log: quem fez (id), o quê e de onde; nunca e-mails ou códigos. */
  const audit = (req: express.Request, res: express.Response, event: string) =>
    console.warn(`[admin] ${event} por=${ownAccount(res).id} ip=${ipOf(req)}`);

  const withClient = async <T>(work: (client: pg.PoolClient) => Promise<T>) => {
    const client = await config.getPool().connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  };

  /** Depois de requireAccount: só o dono passa, com limite por minuto e origem pública nas mudanças. */
  const ownerOnly: express.RequestHandler = (req, res, next) => {
    const account = ownAccount(res);
    if (account.role !== "owner") return res.status(403).json({ error: FORBIDDEN });
    const origin = req.get("origin");
    if (req.method !== "GET" && origin && origin !== config.publicOrigin)
      return res.status(403).json({ error: "Origem não permitida." });
    if (perOwner.hit(account.id))
      return res.status(429).json({ error: "Muitas ações seguidas no painel. Aguarde um minuto." });
    next();
  };
  const guard = [config.requireAccount, ownerOnly];

  /** Erros de conta viram a frase segura; o resto vira 503 sem detalhes (só a mensagem no log). */
  const handle =
    (work: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
    (req, res) => {
      work(req, res).catch((error: unknown) => {
        if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
        console.error("Falha no painel de administração:", error instanceof Error ? error.message : "erro desconhecido");
        res.status(503).json({ error: "O painel de administração não está disponível agora. Tente de novo em instantes." });
      });
    };

  app.get(
    "/api/admin/invites",
    ...guard,
    handle(async (_req, res) => {
      res.json({ invites: await withClient(listInvites) });
    }),
  );

  app.post(
    "/api/admin/invites",
    ...guard,
    json,
    handle(async (req, res) => {
      const days = inviteDays(req.body?.days);
      if (days === null) throw new AuthError(400, `A validade precisa ser de ${DAYS_MIN} a ${DAYS_MAX} dias.`);
      const note = inviteNote(req.body?.note);
      if (note === null) throw new AuthError(400, `Use no máximo ${NOTE_MAX} caracteres em "Para quem".`);
      const created = await withClient((client) => issueInvite(client, note, days));
      audit(req, res, `convite gerado (${days} dias)`);
      res.json(created);
    }),
  );

  app.delete(
    "/api/admin/invites/:id",
    ...guard,
    handle(async (req, res) => {
      const id = String(req.params.id ?? "");
      if (!INVITE_ID.test(id)) throw new AuthError(400, "Convite inválido.");
      const result = await withClient((client) => revokeInvite(client, id));
      if (result === "missing") throw new AuthError(404, "Convite não encontrado.");
      if (result === "used") throw new AuthError(409, "Este convite já foi usado e não pode ser revogado.");
      audit(req, res, "convite revogado");
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/admin/accounts",
    ...guard,
    handle(async (_req, res) => {
      const rows = await withClient(listAccounts);
      res.json({
        accounts: rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          disabled: row.disabled,
          createdAt: row.created_at.toISOString(),
          aiToday: Number(row.ai_today),
        })),
      });
    }),
  );

  app.post(
    "/api/admin/accounts/:id/reset",
    ...guard,
    handle(async (req, res) => {
      const id = accountId(req);
      const reset = await withClient((client) => createPasswordResetById(client, id));
      if (!reset) throw new AuthError(404, ACCOUNT_MISSING);
      audit(req, res, `código de senha gerado conta=${id}`);
      res.json(reset);
    }),
  );

  app.post(
    "/api/admin/accounts/:id/status",
    ...guard,
    json,
    handle(async (req, res) => {
      const id = accountId(req);
      const disabled: unknown = req.body?.disabled;
      if (typeof disabled !== "boolean") throw new AuthError(400, "Informe se a conta fica bloqueada ou liberada.");
      if (id === ownAccount(res).id) throw new AuthError(400, "Você não pode bloquear a própria conta.");
      if (!(await withClient((client) => setDisabledById(client, id, disabled)))) throw new AuthError(404, ACCOUNT_MISSING);
      audit(req, res, `${disabled ? "conta bloqueada" : "conta liberada"} conta=${id}`);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/admin/accounts/:id/role",
    ...guard,
    json,
    handle(async (req, res) => {
      const id = accountId(req);
      const role: unknown = req.body?.role;
      if (role !== "owner" && role !== "member") throw new AuthError(400, "Escolha o papel da conta.");
      if (id === ownAccount(res).id && role === "member")
        throw new AuthError(400, "Você não pode tirar o próprio acesso de administração.");
      if (!(await withClient((client) => setRoleById(client, id, role as Role)))) throw new AuthError(404, ACCOUNT_MISSING);
      audit(req, res, `papel ${role === "owner" ? "dono" : "comum"} conta=${id}`);
      res.json({ ok: true });
    }),
  );
}
