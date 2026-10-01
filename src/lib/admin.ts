/**
 * Painel do administrador (servidor online, só para quem é dono): convites e contas.
 * Mesmo `request` da cópia no servidor (SyncRequest); o navegador manda o cookie da sessão.
 * Nada de dados de saúde aqui: só e-mail, nome, papel, bloqueio e quantos pedidos de IA a conta fez hoje.
 */
import { AUTH_COPY, errorOf, type AccountControls, type AccountRole } from "./account";
import type { SyncRequest } from "./server-sync";

export type InviteStatus = "pending" | "used" | "expired";
export interface AdminInvite {
  /** code_hash do convite (64 caracteres hexadecimais); o código em si só aparece ao gerar. */
  id: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  /** E-mail de quem usou. */
  usedBy: string | null;
  status: InviteStatus;
}
export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  disabled: boolean;
  createdAt: string;
  /** Pedidos de IA de hoje. */
  aiToday: number;
}
/** O que o painel recebe do app (só para o dono): o pedido com a sessão e o endereço público do WebFit. */
export type AdminAccess = NonNullable<AccountControls["admin"]>;

export const INVITE_DAYS_DEFAULT = 14;
export const INVITE_DAYS_MAX = 365;
export const INVITE_NOTE_MAX = 120;

export const ADMIN_COPY = {
  open: "Administração",
  title: "Painel do administrador",
  sections: "Seções do painel",
  invites: "Convites",
  accounts: "Contas",
  note: "Para quem",
  noteHint: "Só para você lembrar a quem entregou. Opcional.",
  days: "Validade (dias)",
  daysHint: `De 1 a ${INVITE_DAYS_MAX} dias. O convite vale para uma conta.`,
  generate: "Gerar convite",
  generated: "Convite gerado. Copie agora: o código não aparece de novo.",
  copyCode: "Copiar código",
  copyMessage: "Copiar mensagem",
  copied: "Copiado.",
  copyFailed: "Não foi possível copiar. Selecione o texto e copie manualmente.",
  revoke: "Revogar",
  revokeTitle: "Revogar este convite?",
  revokeMessage: "O código deixa de valer e ninguém consegue mais criar conta com ele.",
  revoked: "Convite revogado.",
  noInvites: "Nenhum convite ainda. Gere o primeiro acima.",
  noNote: "Sem identificação",
  pending: "Pendente",
  expired: "Vencido",
  owner: "Dono",
  disabled: "Bloqueada",
  you: "Você",
  noName: "Sem nome",
  resetCode: "Gerar código de senha",
  resetHint: "Vale 24 horas, uma vez. Entregue só para a dona ou o dono da conta.",
  block: "Bloquear",
  unblock: "Liberar",
  makeOwner: "Tornar dono",
  makeMember: "Tornar comum",
  loading: "Carregando…",
  invalidDays: `A validade vai de 1 a ${INVITE_DAYS_MAX} dias.`,
  longNote: `Use até ${INVITE_NOTE_MAX} caracteres em "Para quem".`,
  failed: "Não foi possível concluir agora. Tente de novo.",
  offline: AUTH_COPY.offline,
} as const;

/** Pedido ao /api/admin; sem resposta vira a frase de conexão e as recusas trazem a frase do servidor. */
async function call<T>(
  request: SyncRequest,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  let response: { status: number; data: unknown };
  try {
    response = await request(path, body ? { method, body: JSON.stringify(body) } : { method });
  } catch {
    throw new Error(ADMIN_COPY.offline);
  }
  if (response.status !== 200) throw new Error(errorOf(response.data, ADMIN_COPY.failed));
  if (!response.data || typeof response.data !== "object") throw new Error(ADMIN_COPY.failed);
  return response.data as T;
}

/** Lista que o servidor deveria mandar; outra coisa é resposta inválida. */
function listOf<T>(data: Record<string, unknown>, key: string): T[] {
  const list = data[key];
  if (!Array.isArray(list)) throw new Error(ADMIN_COPY.failed);
  return list as T[];
}

const accountPath = (id: string, action: string) => `/api/admin/accounts/${encodeURIComponent(id)}/${action}`;

export async function fetchInvites(request: SyncRequest): Promise<AdminInvite[]> {
  return listOf<AdminInvite>(await call(request, "GET", "/api/admin/invites"), "invites");
}

/** Gera um convite; o código volta só desta vez. Validade e nota são conferidas antes de pedir. */
export async function createInviteCode(
  request: SyncRequest,
  input: { note?: string; days?: number } = {},
): Promise<{ code: string; invite: AdminInvite }> {
  const days = input.days ?? INVITE_DAYS_DEFAULT;
  if (!Number.isInteger(days) || days < 1 || days > INVITE_DAYS_MAX) throw new Error(ADMIN_COPY.invalidDays);
  const note = (input.note ?? "").trim();
  if (note.length > INVITE_NOTE_MAX) throw new Error(ADMIN_COPY.longNote);
  return call(request, "POST", "/api/admin/invites", { note, days });
}

export async function revokeInvite(request: SyncRequest, id: string): Promise<void> {
  await call(request, "DELETE", `/api/admin/invites/${encodeURIComponent(id)}`);
}

export async function fetchAccounts(request: SyncRequest): Promise<AdminAccount[]> {
  return listOf<AdminAccount>(await call(request, "GET", "/api/admin/accounts"), "accounts");
}

/** Código de redefinição de senha (24 horas, uma vez). */
export const createResetCode = (request: SyncRequest, id: string) =>
  call<{ code: string; expiresAt: string }>(request, "POST", accountPath(id, "reset"));

export async function setAccountDisabled(request: SyncRequest, id: string, disabled: boolean): Promise<void> {
  await call(request, "POST", accountPath(id, "status"), { disabled });
}

export async function setAccountRole(request: SyncRequest, id: string, role: AccountRole): Promise<void> {
  await call(request, "POST", accountPath(id, "role"), { role });
}

// ---------- Textos ----------

/** "dd/mm/aaaa" no fuso deste aparelho; data inválida vira "". */
export function fmtAdminDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Mensagem pronta para mandar com o convite (WhatsApp, e-mail…). */
export function inviteMessage(code: string, publicUrl: string, expiresAt: string): string {
  const url = publicUrl.trim().replace(/\/+$/, "");
  return `Seu convite para o WebFit: ${code}. Acesse ${url}, toque em Criar conta e use este código. Ele vale até ${fmtAdminDate(expiresAt)}, para uma conta.`;
}

/** Selo do convite na lista. */
export function inviteStatusLabel(invite: Pick<AdminInvite, "status" | "usedBy">): string {
  if (invite.status === "used") return invite.usedBy ? `Usado por ${invite.usedBy}` : "Usado";
  return invite.status === "expired" ? ADMIN_COPY.expired : ADMIN_COPY.pending;
}
