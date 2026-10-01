/**
 * /api/auth: contas do WebFit online (só quando WEBFIT_PUBLIC_URL está definida; ver server/online.ts).
 *
 * - POST /api/auth/signup          { invite, email, password, name?, client? } → { account, token? }
 * - POST /api/auth/login           { email, password, client? }               → { account, token? }
 * - POST /api/auth/logout                                                     → { ok }
 * - GET  /api/auth/me                                                         → { account, ai: { used, limit } }
 * - POST /api/auth/reset-password  { code, password }                         → { ok }
 * - POST /api/auth/change-password { current, password }                      → { ok }
 * - POST /api/auth/delete-account  { password }                               → { ok }
 *
 * Navegador: a sessão vai num cookie HttpOnly, Secure e SameSite=Strict (o JavaScript da página nunca vê o
 * token). App nativo (client: "app"): o token volta no corpo e segue no cabeçalho Authorization: Bearer.
 * Pedidos com cookie que mudam algo exigem Origin igual ao endereço público (proteção contra CSRF).
 */
import express from "express";
import type pg from "pg";
import { slidingWindow } from "../rate-limit";
import {
  aiUsage,
  AuthError,
  changePassword,
  createSession,
  deleteAccount,
  deleteSession,
  logIn,
  resetPassword,
  SESSION_DAYS,
  sessionAccount,
  signUp,
  type Account,
  type SessionClient,
} from "./repo";
import { normalizeEmail } from "./secrets";

export const SESSION_COOKIE = "wf_session";
const AUTH_BODY_LIMIT = "16kb";
const FIFTEEN_MINUTES = 15 * 60_000;
const HOUR = 60 * 60_000;

export interface AuthConfig {
  /** Origem pública (ex.: https://webfit.exemplo.com.br), sem barra no fim. */
  publicOrigin: string;
  aiDailyLimit: number;
  getPool: () => pg.Pool;
}

type Locals = { account?: Account; token?: string };

/** Lê um cookie sem dependências (o valor do token é base64url, sem caracteres especiais). */
function readCookie(req: express.Request, name: string): string {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

/** Token da sessão e de onde veio (cookie do navegador ou Bearer do app). */
export function sessionToken(req: express.Request): { token: string; viaCookie: boolean } {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
  if (bearer) return { token: bearer, viaCookie: false };
  return { token: readCookie(req, SESSION_COOKIE), viaCookie: true };
}

export function registerAuth(app: express.Express, config: AuthConfig) {
  const loginByIp = slidingWindow(10, FIFTEEN_MINUTES);
  const loginByEmail = slidingWindow(10, FIFTEEN_MINUTES);
  const signupByIp = slidingWindow(5, HOUR);
  const resetByIp = slidingWindow(10, HOUR);
  const json = express.json({ limit: AUTH_BODY_LIMIT });
  const ipOf = (req: express.Request) => req.ip ?? "desconhecido";
  /** E-mail + IP: errar a senha de outra pessoa de fora não bloqueia o login dela. */
  const emailKey = (req: express.Request, email: string) => `${email}|${ipOf(req)}`;
  /** Eventos de segurança no log (para alertas ou fail2ban), com o IP e sem o e-mail. */
  const audit = (req: express.Request, event: string) => console.warn(`[auth] ${event} ip=${ipOf(req)}`);

  const withClient = async <T>(work: (client: pg.PoolClient) => Promise<T>) => {
    const client = await config.getPool().connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  };

  /** Conta da sessão do pedido, ou null. Cookie em pedido que muda algo exige a origem pública. */
  async function accountFor(req: express.Request): Promise<{ account: Account; token: string } | null> {
    const { token, viaCookie } = sessionToken(req);
    if (!token) return null;
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (viaCookie && unsafe && req.get("origin") !== config.publicOrigin) return null;
    const account = await withClient((client) => sessionAccount(client, token));
    return account ? { account, token } : null;
  }

  /** Middleware: 401 sem sessão válida; com ela, res.locals.account e res.locals.token. */
  const requireAccount: express.RequestHandler = (req, res, next) => {
    accountFor(req)
      .then((found) => {
        if (!found) return res.status(401).json({ error: "Entre na sua conta para continuar.", auth: "required" });
        (res.locals as Locals).account = found.account;
        (res.locals as Locals).token = found.token;
        next();
      })
      .catch(next);
  };

  const setCookie = (res: express.Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api",
      maxAge: SESSION_DAYS * 24 * HOUR,
    });
  const clearCookie = (res: express.Response) =>
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "strict", path: "/api" });

  /** Abre a sessão e responde: cookie no navegador, token no corpo para o app. */
  async function startSession(req: express.Request, res: express.Response, account: Account) {
    const kind: SessionClient = req.body?.client === "app" ? "app" : "web";
    const token = await withClient((client) => createSession(client, account.id, kind));
    if (kind === "web") setCookie(res, token);
    res.json({ account, ...(kind === "app" ? { token } : {}) });
  }

  /** Erros de conta viram a frase segura; o resto vira 503 sem detalhes (só a mensagem no log). */
  const handle =
    (work: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
    (req, res) => {
      work(req, res).catch((error: unknown) => {
        if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
        console.error("Falha na conta:", error instanceof Error ? error.message : "erro desconhecido");
        res.status(503).json({ error: "O serviço de contas não está disponível agora. Tente de novo em instantes." });
      });
    };
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  /** Formulários do navegador também vêm do endereço público (CSRF). */
  const sameOrigin = (req: express.Request) => !req.get("origin") || req.get("origin") === config.publicOrigin;

  app.post(
    "/api/auth/signup",
    json,
    handle(async (req, res) => {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
      if (signupByIp.hit(ipOf(req)))
        return res.status(429).json({ error: "Muitas tentativas de cadastro. Aguarde uma hora." });
      audit(req, "cadastro com convite");
      const account = await withClient((client) =>
        signUp(client, {
          invite: text(req.body?.invite),
          email: text(req.body?.email),
          password: text(req.body?.password),
          name: text(req.body?.name),
        }),
      );
      await startSession(req, res, account);
    }),
  );

  app.post(
    "/api/auth/login",
    json,
    handle(async (req, res) => {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
      const email = normalizeEmail(text(req.body?.email)) ?? "";
      if (loginByIp.hit(ipOf(req)) || (email && loginByEmail.hit(emailKey(req, email)))) {
        audit(req, "login bloqueado por excesso de tentativas");
        return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." });
      }
      const account = await withClient((client) => logIn(client, email, text(req.body?.password)));
      if (!account) {
        audit(req, "login recusado");
        return res.status(401).json({ error: "E-mail ou senha não conferem." });
      }
      await startSession(req, res, account);
    }),
  );

  app.post(
    "/api/auth/logout",
    handle(async (req, res) => {
      const { token, viaCookie } = sessionToken(req);
      if (viaCookie && !sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
      if (token) await withClient((client) => deleteSession(client, token));
      clearCookie(res);
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/auth/me",
    requireAccount,
    handle(async (_req, res) => {
      const account = (res.locals as Locals).account!;
      const ai = await withClient((client) => aiUsage(client, account, config.aiDailyLimit));
      res.json({ account, ai });
    }),
  );

  app.post(
    "/api/auth/reset-password",
    json,
    handle(async (req, res) => {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
      if (resetByIp.hit(ipOf(req)))
        return res.status(429).json({ error: "Muitas tentativas. Aguarde uma hora." });
      await withClient((client) => resetPassword(client, text(req.body?.code), text(req.body?.password)));
      audit(req, "senha redefinida com código");
      clearCookie(res);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/auth/change-password",
    requireAccount,
    json,
    handle(async (req, res) => {
      const { account, token } = res.locals as Locals;
      if (loginByEmail.hit(emailKey(req, account!.email)))
        return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." });
      await withClient((client) =>
        changePassword(client, account!, text(req.body?.current), text(req.body?.password), token!),
      );
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/auth/delete-account",
    requireAccount,
    json,
    handle(async (req, res) => {
      const account = (res.locals as Locals).account!;
      if (loginByEmail.hit(emailKey(req, account.email)))
        return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." });
      await withClient((client) => deleteAccount(client, account, text(req.body?.password)));
      audit(req, "conta excluída");
      clearCookie(res);
      res.json({ ok: true });
    }),
  );

  return { accountFor, requireAccount };
}
