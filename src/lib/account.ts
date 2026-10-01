/**
 * Conta do WebFit online, igual no web e no nativo. O servidor online (/api/status → mode "online")
 * exige entrar numa conta; o modo local (este computador ou a rede Wi-Fi) continua sem conta.
 *
 * Os dados continuam primeiro no aparelho. Ao entrar, o estado passa a ser da conta: o userId vira o id
 * da conta e a cópia no servidor fica sempre ligada. Sair apaga os dados deste aparelho (outra pessoa pode
 * usar o mesmo navegador ou celular); eles voltam ao entrar de novo, pela cópia da conta.
 */
import { stateSchema, type AppState } from "../types";
import { initialState } from "./domain";
import { compareWithServer, fetchServerState, type SyncRequest } from "./server-sync";

/** Última conta que entrou neste aparelho (só o id; conveniência local, apagada ao sair). */
export const LAST_ACCOUNT_KEY = "webfit-last-account";

/** O que as telas recebem do app quando o servidor é online (web e nativo). */
export interface AccountControls {
  info: AccountInfo;
  /** Pedidos de IA de hoje; null até a primeira consulta. */
  quota: AiQuota | null;
  refreshQuota: () => Promise<void>;
  /** Pergunta antes; os dados saem do aparelho e continuam na conta. */
  logOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  /** Pede a senha; apaga a conta, a cópia e os dados do aparelho. */
  deleteAccount: (password: string) => Promise<boolean>;
  /** Só para o dono, no web: pedidos do painel do administrador e o endereço público do WebFit (convites). */
  admin?: { request: SyncRequest; publicUrl: string };
}

export type AccountRole = "owner" | "member";
export interface AccountInfo {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
}
export interface AiQuota {
  used: number;
  /** null: sem limite (dono do servidor). */
  limit: number | null;
}
export type ServerMode = "local" | "online";

export const AUTH_COPY = {
  title: "Entre na sua conta",
  subtitle: "Seus registros ficam neste aparelho e numa cópia protegida na sua conta.",
  login: "Entrar",
  signup: "Criar conta",
  forgot: "Esqueci minha senha",
  invite: "Código de convite",
  inviteHint: "Peça o convite a quem administra o WebFit. Ele vale para uma conta.",
  resetCode: "Código de redefinição",
  resetHint: "Peça o código a quem administra o WebFit. Ele vale por 24 horas, uma vez.",
  email: "E-mail",
  password: "Senha",
  newPassword: "Nova senha",
  passwordHint: "Pelo menos 8 caracteres. Uma frase fácil de lembrar funciona bem.",
  name: "Como quer ser chamado(a)",
  resetDone: "Senha trocada. Entre com a nova senha.",
  offline: "Sem conexão com o servidor. Confira a internet e tente de novo.",
  sessionEnded: "Sua sessão terminou. Entre de novo para continuar.",
  chooseTitle: "Esta conta já tem dados",
  chooseMessage:
    "Este aparelho também tem registros. Usar os da conta substitui os deste aparelho; enviar os deste aparelho substitui a cópia da conta.",
  useAccount: "Usar os dados da conta",
  useDevice: "Enviar os deste aparelho",
  logoutTitle: "Sair da conta?",
  logoutMessage: "Os dados saem deste aparelho e continuam na sua conta. Para vê-los de novo, é só entrar.",
  logoutPending:
    "Ainda há registros deste aparelho que não chegaram à sua conta. Se sair agora, eles se perdem. Conecte-se à internet e espere a cópia ficar em dia, ou saia mesmo assim.",
  deleteTitle: "Excluir a conta?",
  deleteMessage:
    "A conta e a cópia dos seus dados no servidor são apagadas para sempre. Os dados deste aparelho também saem.",
} as const;

/** Algum registro que a pessoa não gostaria de perder (o estado novo, sem nada, não conta). */
export function hasPersonalData(state: AppState): boolean {
  return Boolean(
    state.profile ||
      state.draft ||
      state.diary.length ||
      state.measurements.length ||
      state.habits.length ||
      state.messages.length ||
      state.injections.length ||
      state.exams.length ||
      state.appointments.length ||
      state.foods.length ||
      state.pantry.length ||
      state.recipes.length,
  );
}

/** O estado do aparelho passa a ser da conta: mesmo conteúdo, userId da conta e cópia sempre ligada. */
export function adoptIntoAccount(state: AppState, accountId: string): AppState {
  return stateSchema.parse({
    ...state,
    userId: accountId,
    serverSync: true,
    accountBound: true,
    diary: state.diary.map((entry) => ({ ...entry, userId: accountId })),
    injections: state.injections.map((entry) => ({ ...entry, userId: accountId })),
  });
}

/** O que fazer com os dados ao entrar, conforme o aparelho e a cópia da conta. */
export type SignInPlan =
  /** O aparelho já é desta conta: segue (a cópia compara as revisões sozinha). */
  | "keep"
  /** A conta não tem cópia: os dados do aparelho passam a ser da conta e sobem. */
  | "adopt"
  /** O aparelho está vazio (ou é de outra conta): os dados da conta descem. */
  | "download"
  /** Os dados do aparelho são de outra conta e esta não tem cópia: começa do zero. */
  | "fresh"
  /** Os dois têm dados: a pessoa escolhe. */
  | "choose";

/**
 * `previousAccountId`: a última conta que entrou neste aparelho (guardada ao entrar, apagada ao sair).
 * Dados de outra conta nunca vão para esta: só descem os desta conta, ou o aparelho começa vazio.
 */
export function signInPlan(
  state: AppState,
  accountId: string,
  serverRevision: number | null,
  previousAccountId: string | null = null,
): SignInPlan {
  if (state.userId === accountId) return "keep";
  // De outra conta: pelo próprio estado (accountBound) ou pela última conta lembrada neste aparelho.
  const foreign = state.accountBound || (!!previousAccountId && previousAccountId !== accountId);
  if (foreign && hasPersonalData(state)) return serverRevision === null ? "fresh" : "download";
  if (serverRevision === null) return "adopt";
  if (!hasPersonalData(state)) return "download";
  return "choose";
}

/** O aparelho vazio, já da conta (começar do zero depois de outra conta). */
export const freshAccountState = (accountId: string): AppState =>
  stateSchema.parse({ ...initialState(), userId: accountId, serverSync: true, accountBound: true, revision: 0 });

/**
 * Ao entrar (web e nativo): compara com a cópia da conta e devolve o estado que deve ocupar o aparelho,
 * ou null quando ele já é da conta ("keep"). `choose` pergunta à pessoa quando os dois lados têm dados
 * (true: usar os da conta). Sem resposta do servidor, lança o erro de conexão (nada muda no aparelho).
 */
export async function prepareSignIn(
  request: SyncRequest,
  current: AppState,
  accountId: string,
  previousAccountId: string | null,
  choose: () => Promise<boolean>,
): Promise<{ next: AppState | null; message?: string }> {
  const { relation, revision } = await compareWithServer(request, { ...current, userId: accountId });
  if (relation === "unavailable") throw new Error(AUTH_COPY.offline);
  let plan = signInPlan(current, accountId, revision, previousAccountId);
  if (plan === "choose") plan = (await choose()) ? "download" : "adopt";
  if (plan === "keep") return { next: null };
  if (plan === "fresh") return { next: freshAccountState(accountId) };
  if (plan === "download") {
    // Os dados da conta passam pelas mesmas conferências de um backup antes de entrar no aparelho.
    const remote = await fetchServerState(request, accountId);
    return {
      next: { ...remote, serverSync: true, accountBound: true },
      message: "Dados da sua conta carregados neste aparelho.",
    };
  }
  // A versão do aparelho fica à frente da cópia da conta (que ela substitui, se houver).
  const adopted = adoptIntoAccount(current, accountId);
  return {
    next: { ...adopted, revision: Math.max(current.revision, (revision ?? -1) + 1) },
    message: "Seus registros agora estão guardados na sua conta.",
  };
}

// ---------- Pedidos ----------

/** A frase de erro que o servidor mandou ({ error }), ou a reserva. */
export const errorOf = (data: unknown, fallback: string) =>
  data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;

/** POST com JSON em /api/auth/*; erros viram frases para a pessoa. */
async function post<T>(request: SyncRequest, path: string, body: Record<string, unknown>): Promise<T> {
  let response: { status: number; data: unknown };
  try {
    response = await request(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    throw new Error(AUTH_COPY.offline);
  }
  if (response.status !== 200) throw new Error(errorOf(response.data, "Não foi possível concluir agora. Tente de novo."));
  return response.data as T;
}

/** `client: "app"` faz o servidor devolver o token (o navegador usa o cookie da sessão). */
export type AuthClient = "web" | "app";
export interface SignInResult {
  account: AccountInfo;
  token?: string;
}

export const logIn = (request: SyncRequest, email: string, password: string, client: AuthClient = "web") =>
  post<SignInResult>(request, "/api/auth/login", { email, password, client });

export const signUp = (
  request: SyncRequest,
  input: { invite: string; email: string; password: string; name: string },
  client: AuthClient = "web",
) => post<SignInResult>(request, "/api/auth/signup", { ...input, client });

export const resetPassword = (request: SyncRequest, code: string, password: string) =>
  post<{ ok: true }>(request, "/api/auth/reset-password", { code, password });

export const changePassword = (request: SyncRequest, current: string, password: string) =>
  post<{ ok: true }>(request, "/api/auth/change-password", { current, password });

export const deleteAccount = (request: SyncRequest, password: string) =>
  post<{ ok: true }>(request, "/api/auth/delete-account", { password });

/** Sair nunca falha para a pessoa: sem conexão, a sessão vence sozinha no servidor. */
export async function logOut(request: SyncRequest): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // a sessão expira no servidor
  }
}

/** Conta e uso de IA de hoje; null quando a sessão não vale mais (ou sem conexão). */
export async function fetchMe(request: SyncRequest): Promise<{ account: AccountInfo; ai: AiQuota } | null> {
  try {
    const { status, data } = await request("/api/auth/me", { method: "GET" });
    return status === 200 ? (data as { account: AccountInfo; ai: AiQuota }) : null;
  } catch {
    return null;
  }
}

/** Frase do uso de IA para Ajustes ("3 de 30 hoje" ou "sem limite"). */
export function quotaLabel(quota: AiQuota): string {
  if (quota.limit === null) return `${quota.used} hoje · sem limite`;
  return `${quota.used} de ${quota.limit} hoje`;
}
