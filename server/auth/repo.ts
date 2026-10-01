/**
 * Contas do WebFit online no schema webfit (migração 0016). Toda consulta é parametrizada; tokens e
 * códigos entram e saem em texto só nesta camada e são guardados como SHA-256.
 */
import type pg from "pg";
import {
  hashPassword,
  needsRehash,
  newCode,
  newSessionToken,
  normalizeCode,
  normalizeEmail,
  passwordProblem,
  sha256,
  verifyPassword,
} from "./secrets";

export const SESSION_DAYS = 60;
export const INVITE_DAYS = 14;
export const RESET_HOURS = 24;
/** A validade da sessão é renovada no máximo uma vez por dia de uso. */
const SESSION_REFRESH_HOURS = 24;
/** Mesmo em uso, uma sessão vale no máximo 180 dias; depois, entrar de novo. */
const SESSION_MAX_DAYS = 180;
/** Aparelhos com sessão aberta por conta (a mais antiga sai ao entrar no 11º). */
const MAX_SESSIONS = 10;

export type Role = "owner" | "member";
export type SessionClient = "web" | "app";
export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Erro com status HTTP e frase segura para mostrar à pessoa. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const ACCOUNT_COLUMNS = "a.id, a.email, a.name, a.role";
/** Hash de uma senha qualquer: o login de e-mail inexistente custa o mesmo tempo de um e-mail real. */
let dummyHash: Promise<string> | null = null;

async function transaction<T>(client: pg.ClientBase, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

function requireEmail(input: string) {
  const email = normalizeEmail(input);
  if (!email) throw new AuthError(400, "Confira o e-mail.");
  return email;
}

function requirePassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AuthError(400, problem);
}

// ---------- Convites (dono do servidor) ----------

export async function createInvite(client: pg.ClientBase, note = "", days = INVITE_DAYS): Promise<string> {
  const code = newCode();
  await client.query(
    "insert into webfit.invites (code_hash, note, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [sha256(normalizeCode(code)!), note.slice(0, 120), days],
  );
  return code;
}

// ---------- Cadastro e login ----------

export async function signUp(
  client: pg.ClientBase,
  input: { invite: string; email: string; password: string; name?: string },
): Promise<Account> {
  const code = normalizeCode(input.invite);
  if (!code) throw new AuthError(400, "Confira o código de convite.");
  const email = requireEmail(input.email);
  requirePassword(input.password);
  const name = (input.name ?? "").trim().slice(0, 80);
  return transaction(client, async () => {
    const invite = await client.query(
      "select 1 from webfit.invites where code_hash = $1 and used_at is null and expires_at > now() for update",
      [sha256(code)],
    );
    if (!invite.rowCount) throw new AuthError(400, "Este convite não vale mais. Peça um novo a quem administra o WebFit.");
    // O scrypt (caro) só roda com convite válido: código inventado não gasta processamento.
    const passwordHash = await hashPassword(input.password);
    const created = await client.query<Account>(
      `insert into webfit.accounts (email, name, password_hash) values ($1, $2, $3)
       on conflict (email) do nothing
       returning id, email, name, role`,
      [email, name, passwordHash],
    );
    if (!created.rowCount) throw new AuthError(409, "Já existe uma conta com este e-mail. Entre com ela.");
    const account = created.rows[0];
    await client.query("update webfit.invites set used_at = now(), used_by = $2 where code_hash = $1", [sha256(code), account.id]);
    return account;
  });
}

/** Conta quando e-mail e senha conferem (e a conta está ativa); null em qualquer outro caso. */
export async function logIn(client: pg.ClientBase, emailInput: string, password: string): Promise<Account | null> {
  const email = normalizeEmail(emailInput);
  const found = email
    ? await client.query<Account & { password_hash: string; disabled: boolean }>(
        `select ${ACCOUNT_COLUMNS}, a.password_hash, a.disabled from webfit.accounts a where a.email = $1`,
        [email],
      )
    : null;
  const row = found?.rows[0];
  if (!row) {
    dummyHash ??= hashPassword("senha-que-nao-existe");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash)) || row.disabled) return null;
  // Senha antiga com custo menor: refeita agora que o texto foi conferido.
  if (needsRehash(row.password_hash))
    await client.query("update webfit.accounts set password_hash = $2 where id = $1", [row.id, await hashPassword(password)]);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

// ---------- Sessões ----------

export async function createSession(client: pg.ClientBase, accountId: string, kind: SessionClient): Promise<string> {
  const token = newSessionToken();
  await client.query(
    "insert into webfit.sessions (token_hash, account_id, client, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))",
    [sha256(token), accountId, kind, SESSION_DAYS],
  );
  // Só as sessões mais recentes de cada conta continuam valendo.
  await client.query(
    `delete from webfit.sessions where account_id = $1 and token_hash not in (
       select token_hash from webfit.sessions where account_id = $1 order by created_at desc limit $2)`,
    [accountId, MAX_SESSIONS],
  );
  return token;
}

/** Conta da sessão (válida e ativa); renova a validade uma vez por dia de uso. */
export async function sessionAccount(client: pg.ClientBase, token: string): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  const hash = sha256(token);
  const found = await client.query<Account & { stale: boolean }>(
    `select ${ACCOUNT_COLUMNS}, s.last_seen_at < now() - make_interval(hours => $2) as stale
     from webfit.sessions s join webfit.accounts a on a.id = s.account_id
     where s.token_hash = $1 and s.expires_at > now() and not a.disabled
       and s.created_at > now() - make_interval(days => $3)`,
    [hash, SESSION_REFRESH_HOURS, SESSION_MAX_DAYS],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (row.stale)
    await client.query(
      "update webfit.sessions set last_seen_at = now(), expires_at = now() + make_interval(days => $2) where token_hash = $1",
      [hash, SESSION_DAYS],
    );
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function deleteSession(client: pg.ClientBase, token: string): Promise<void> {
  await client.query("delete from webfit.sessions where token_hash = $1", [sha256(token)]);
}

/** Sessões vencidas saem do banco (chamado de vez em quando pelo servidor). */
export async function purgeExpired(client: pg.ClientBase): Promise<void> {
  await client.query("delete from webfit.sessions where expires_at < now()");
  await client.query("delete from webfit.password_resets where expires_at < now() - interval '7 days'");
  await client.query("delete from webfit.ai_usage where day < current_date - 90");
}

// ---------- Senha ----------

/** Código de redefinição para o dono do servidor mandar à pessoa; null quando o e-mail não tem conta. */
export async function createPasswordReset(client: pg.ClientBase, emailInput: string): Promise<string | null> {
  const email = requireEmail(emailInput);
  const code = newCode();
  const created = await client.query(
    `insert into webfit.password_resets (code_hash, account_id, expires_at)
     select $1, a.id, now() + make_interval(hours => $3) from webfit.accounts a where a.email = $2`,
    [sha256(normalizeCode(code)!), email, RESET_HOURS],
  );
  return created.rowCount ? code : null;
}

/** Troca a senha com o código de redefinição; encerra todas as sessões da conta. */
export async function resetPassword(client: pg.ClientBase, codeInput: string, password: string): Promise<void> {
  const code = normalizeCode(codeInput);
  if (!code) throw new AuthError(400, "Confira o código de redefinição.");
  requirePassword(password);
  await transaction(client, async () => {
    const reset = await client.query<{ account_id: string }>(
      `select account_id from webfit.password_resets
       where code_hash = $1 and used_at is null and expires_at > now() for update`,
      [sha256(code)],
    );
    const accountId = reset.rows[0]?.account_id;
    if (!accountId) throw new AuthError(400, "Este código não vale mais. Peça um novo a quem administra o WebFit.");
    // O scrypt (caro) só roda com código válido.
    const passwordHash = await hashPassword(password);
    await client.query("update webfit.password_resets set used_at = now() where code_hash = $1", [sha256(code)]);
    await client.query("update webfit.accounts set password_hash = $2 where id = $1", [accountId, passwordHash]);
    await client.query("delete from webfit.sessions where account_id = $1", [accountId]);
  });
}

/** Troca de senha com a sessão aberta: confere a atual e encerra as outras sessões. */
export async function changePassword(
  client: pg.ClientBase,
  account: Account,
  current: string,
  next: string,
  keepToken: string,
): Promise<void> {
  requirePassword(next);
  if (!(await logIn(client, account.email, current))) throw new AuthError(400, "A senha atual não confere.");
  const passwordHash = await hashPassword(next);
  await client.query("update webfit.accounts set password_hash = $2 where id = $1", [account.id, passwordHash]);
  await client.query("delete from webfit.sessions where account_id = $1 and token_hash <> $2", [account.id, sha256(keepToken)]);
}

// ---------- Conta ----------

/** Exclui a conta e a cópia dos dados no servidor (cascata em users); pede a senha de novo. */
export async function deleteAccount(client: pg.ClientBase, account: Account, password: string): Promise<void> {
  if (!(await logIn(client, account.email, password))) throw new AuthError(400, "A senha não confere.");
  await transaction(client, async () => {
    await client.query("delete from webfit.users where id = $1", [account.id]);
    await client.query("delete from webfit.accounts where id = $1", [account.id]);
  });
}

// ---------- Administração (scripts/admin.ts) ----------

export async function setRole(client: pg.ClientBase, emailInput: string, role: Role): Promise<boolean> {
  const updated = await client.query("update webfit.accounts set role = $2 where email = $1", [requireEmail(emailInput), role]);
  return updated.rowCount === 1;
}

/** Desativa ou reativa; desativar encerra as sessões na hora. */
export async function setDisabled(client: pg.ClientBase, emailInput: string, disabled: boolean): Promise<boolean> {
  const updated = await client.query<{ id: string }>(
    "update webfit.accounts set disabled = $2 where email = $1 returning id",
    [requireEmail(emailInput), disabled],
  );
  const id = updated.rows[0]?.id;
  if (id && disabled) await client.query("delete from webfit.sessions where account_id = $1", [id]);
  return Boolean(id);
}

export async function listAccounts(client: pg.ClientBase) {
  const rows = await client.query<{
    email: string;
    name: string;
    role: Role;
    disabled: boolean;
    created_at: Date;
    ai_today: number;
  }>(
    `select a.email, a.name, a.role, a.disabled, a.created_at, coalesce(u.requests, 0) as ai_today
     from webfit.accounts a left join webfit.ai_usage u on u.account_id = a.id and u.day = current_date
     order by a.created_at`,
  );
  return rows.rows;
}

// ---------- Limite diário da IA ----------

/**
 * Conta um pedido ao agente no dia; false quando a conta já chegou ao limite (o pedido não é contado).
 * O dono do servidor não tem limite.
 */
export async function consumeAiRequest(client: pg.ClientBase, account: Account, limit: number): Promise<boolean> {
  if (account.role === "owner") return true;
  if (limit <= 0) return false;
  const counted = await client.query(
    `insert into webfit.ai_usage (account_id, day, requests) values ($1, current_date, 1)
     on conflict (account_id, day) do update set requests = webfit.ai_usage.requests + 1
     where webfit.ai_usage.requests < $2`,
    [account.id, limit],
  );
  return counted.rowCount === 1;
}

/** Pedidos de IA usados hoje e o limite (null sem limite). */
export async function aiUsage(client: pg.ClientBase, account: Account, limit: number) {
  const row = await client.query<{ requests: number }>(
    "select requests from webfit.ai_usage where account_id = $1 and day = current_date",
    [account.id],
  );
  return { used: row.rows[0]?.requests ?? 0, limit: account.role === "owner" ? null : limit };
}
