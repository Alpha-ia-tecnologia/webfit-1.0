import { fetch as streamingFetch } from "expo/fetch";
import * as Network from "expo-network";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import type { AiProviders } from "@shared/lib/agent-presentation";
import {
  AGENT_OFFLINE,
  AGENT_UNAVAILABLE,
  createStreamCollector,
  NDJSON_TYPE,
  parseJsonSafe,
  readAgentStream,
  type AgentProgress,
} from "@shared/lib/agent-stream";
import {
  isLoopbackUrl,
  shortcutUrls,
  subnetUrls,
  type DiscoveredServer,
} from "@shared/lib/server-discovery";
import { createHttpSyncRequest, type SyncRequest } from "@shared/lib/server-sync";
import type { AccountInfo, ServerMode } from "@shared/lib/account";
import { agentReplySchema, type AgentReply } from "@shared/types";
import { clearSession, readSession, writeSession } from "./session-store";

export { isLoopbackUrl };

const URL_KEY = "webfit-api-url-v1";
/** Endereços que já responderam (o mais recente primeiro): atalho antes de varrer a rede. */
const KNOWN_KEY = "webfit-api-known-v1";
/** Nome do computador informado pelo servidor; tentado como <nome>.local antes da varredura. */
const HOST_KEY = "webfit-api-host-v1";
const KNOWN_MAX = 5;
const STATUS_TIMEOUT_MS = 8000;
const DISCOVERY_TIMEOUT_MS = 1500;
const DISCOVERY_BATCH = 32;
const DEFAULT_PORT = "3000";
// "192.168.0.10:3000", "http://192.168.0.10:3000/" ou "http://meu-pc.local:3000"
const URL_PATTERN = /^(?:(https?):\/\/)?([a-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?\/*$/i;

/** Endereço padrão do servidor do agente (ver .env.example); pode ser trocado em Meu espaço. */
export const DEFAULT_API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000");
let apiUrl = DEFAULT_API_URL;

/** Aceita host, host:porta ou URL completa e devolve "http://host:porta" sem barra final. */
export function normalizeApiUrl(input: string): string {
  const match = URL_PATTERN.exec(input.trim());
  if (!match) throw new Error("Informe um endereço válido, por exemplo 192.168.0.10:3000.");
  const [, scheme = "http", host, port] = match;
  return `${scheme.toLowerCase()}://${host}${port ? `:${port}` : ""}`;
}

export function getApiUrl(): string {
  return apiUrl;
}

/** Lê o endereço salvo no aparelho (se houver) antes da primeira consulta ao servidor. */
export async function loadApiUrl(): Promise<string> {
  try {
    const saved = await Storage.getItemAsync(URL_KEY);
    if (saved) apiUrl = normalizeApiUrl(saved);
  } catch {
    apiUrl = DEFAULT_API_URL;
  }
  return apiUrl;
}

/** Grava o endereço informado; o padrão do build é representado pela ausência da chave. */
export async function saveApiUrl(input: string): Promise<string> {
  const next = normalizeApiUrl(input);
  if (next === DEFAULT_API_URL) await Storage.removeItemAsync(URL_KEY);
  else await Storage.setItemAsync(URL_KEY, next);
  apiUrl = next;
  if (!isLoopbackUrl(next)) await rememberServer(next);
  return next;
}

export const AGENT_NOT_CONFIGURED = "O servidor está conectado, mas a IA ainda não foi configurada. Configure o provedor de IA no servidor.";

export type AgentStatus = {
  ready: boolean;
  token: string;
  hostname?: string;
  /** Provedores configurados no servidor (sem chaves); null quando a resposta não os informa. */
  providers: AiProviders | null;
  /** O servidor tem banco de dados para a cópia (/api/sync). */
  sync: boolean;
  /** "online": servidor publicado com contas (precisa entrar); "local": computador ou rede Wi-Fi. */
  mode: ServerMode;
  /** Conta da sessão guardada neste aparelho (online); null sem sessão válida. */
  account: AccountInfo | null;
};

/** Token da conta no servidor online (o app não tem cookie): vai no cabeçalho Authorization. */
let sessionToken = "";

export const getSessionToken = () => sessionToken;

/** Lê a sessão guardada (token e a última conta; session-store.ts) antes da primeira consulta ao servidor. */
export async function loadSession(): Promise<AccountInfo | null> {
  try {
    const saved = parseJsonSafe((await readSession()) ?? "") as {
      token?: unknown;
      account?: unknown;
    } | null;
    sessionToken = typeof saved?.token === "string" ? saved.token : "";
    return sessionToken ? parseAccount(saved?.account) : null;
  } catch {
    sessionToken = "";
    return null;
  }
}

/** Guarda (ou apaga, com null) a sessão da conta no cofre do aparelho (session-store.ts). */
export async function saveSession(session: { token: string; account: AccountInfo } | null): Promise<void> {
  if (!session) {
    // Sair: o token deixa de valer já, mesmo se apagar do cofre falhar.
    sessionToken = "";
    await clearSession();
    return;
  }
  // Entrar: só vale depois de gravado (cofre falhou = nada muda, a entrada mostra o erro).
  await writeSession(JSON.stringify(session));
  sessionToken = session.token;
}

const bearerHeader = (): Record<string, string> => (sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {});

function parseAccount(value: unknown): AccountInfo | null {
  if (!value || typeof value !== "object") return null;
  const { id, email, name, role } = value as Record<string, unknown>;
  return typeof id === "string" && typeof email === "string"
    ? { id, email, name: typeof name === "string" ? name : "", role: role === "owner" ? "owner" : "member" }
    : null;
}

/** Mesma validação do app web: só aceita os dois indicadores booleanos. */
function parseProviders(value: unknown): AiProviders | null {
  if (!value || typeof value !== "object") return null;
  const { deepseek, openai } = value as { deepseek?: unknown; openai?: unknown };
  return typeof deepseek === "boolean" && typeof openai === "boolean" ? { deepseek, openai } : null;
}

export async function fetchStatus(): Promise<AgentStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  const unreachable = `Não foi possível conectar a ${apiUrl}. Confira se o computador está com "npm run dev:lan" e na mesma rede Wi-Fi.`;
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/status`, { signal: controller.signal, headers: bearerHeader() });
  } catch {
    throw new Error(unreachable);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`O servidor em ${apiUrl} respondeu com erro ${response.status}.`);
  // Outro serviço na mesma porta (página HTML) não vira SyntaxError cru em Meu espaço.
  const body = await response.text().catch(() => {
    throw new Error(unreachable);
  });
  const data = parseJsonSafe(body) as
    | {
        ready?: unknown;
        token?: unknown;
        hostname?: unknown;
        providers?: unknown;
        sync?: unknown;
        mode?: unknown;
        account?: unknown;
      }
    | null;
  if (!data || typeof data !== "object") throw new Error(`O endereço ${apiUrl} não respondeu como o servidor do WebFit.`);
  const online = data.mode === "online";
  const status: AgentStatus = {
    ready: data.ready === true,
    token: typeof data.token === "string" ? data.token : "",
    providers: parseProviders(data.providers),
    sync: data.sync === true,
    mode: online ? "online" : "local",
    account: online ? parseAccount(data.account) : null,
  };
  if (typeof data.hostname === "string" && data.hostname) status.hostname = data.hostname;
  void rememberServer(apiUrl, status.hostname);
  return status;
}

/** Pedidos de /api/sync no endereço atual, com o token da sessão (o mesmo cliente do app web). */
export function createSyncRequest(getToken: () => string): SyncRequest {
  return createHttpSyncRequest(() => apiUrl, getToken, getSessionToken);
}

/** Guarda o endereço que respondeu e o nome do computador, para a reconexão automática. */
export async function rememberServer(url: string, hostname?: string): Promise<void> {
  try {
    const known = await knownServers();
    const next = [url, ...known.filter((item) => item !== url)].slice(0, KNOWN_MAX);
    await Storage.setItemAsync(KNOWN_KEY, JSON.stringify(next));
    if (hostname) await Storage.setItemAsync(HOST_KEY, hostname);
  } catch {
    // memória de reconexão é só uma conveniência
  }
}

async function knownServers(): Promise<string[]> {
  try {
    const raw = await Storage.getItemAsync(KNOWN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function knownHostname(): Promise<string | null> {
  try {
    return (await Storage.getItemAsync(HOST_KEY)) || null;
  } catch {
    return null;
  }
}

export type AgentPayload = {
  mode: "chat" | "photo" | "exam" | "diet" | "pantry_photo" | "shopping_photo" | "recipe" | "rotulo" | "meal_text";
  text: string;
  file?: string;
  consent: true;
  context: Record<string, unknown>;
  history: { sender: "ai" | "user"; text: string }[];
};

/**
 * O runtime do Expo (SDK 57) instala ReadableStream e um TextDecoder com `stream: true` no Hermes, e o
 * `expo/fetch` entrega `response.body` em pedaços. Sem essas peças, o pedido segue em JSON simples.
 */
const CAN_STREAM = typeof ReadableStream === "function" && typeof TextDecoder === "function";

/** Corpo NDJSON já recebido por inteiro (sem leitura em pedaços): as etapas ainda são repassadas. */
function collectNdjson(text: string, onProgress: (progress: AgentProgress) => void): unknown {
  const collector = createStreamCollector(onProgress);
  collector.push(text);
  return collector.finish();
}

/**
 * Consulta o agente. Nos modos que passam pelo grafo (todos, exceto fotos de despensa e compras), pede NDJSON
 * para acompanhar as etapas reais; se o servidor responder JSON, o fluxo é exatamente o anterior.
 */
export async function callAgent(
  payload: AgentPayload,
  token: string,
  signal: AbortSignal,
  onProgress: (progress: AgentProgress) => void = () => undefined,
): Promise<AgentReply> {
  const staged = CAN_STREAM && payload.mode !== "pantry_photo" && payload.mode !== "shopping_photo";
  // Sem rede ou servidor fora do ar: aviso de conexão, não o erro cru do Android; o cancelamento é trocado por quem chama.
  const offline = (): never => {
    throw new Error(AGENT_OFFLINE);
  };
  const response = await streamingFetch(`${apiUrl}/api/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: staged ? `${NDJSON_TYPE}, application/json` : "application/json",
      "X-WebFit-Token": token,
      ...bearerHeader(),
    },
    body: JSON.stringify(payload),
    signal,
  }).catch(offline);
  const isStream = response.ok && (response.headers.get("content-type") ?? "").includes(NDJSON_TYPE);
  let data: unknown;
  // Corpo que não é JSON (página de proxy, outro serviço na porta) vira null, sem SyntaxError cru.
  if (!isStream) data = parseJsonSafe(await response.text().catch(offline));
  else if (response.body && typeof response.body.getReader === "function")
    data = await readAgentStream(response.body, onProgress);
  else data = collectNdjson(await response.text().catch(offline), onProgress);
  if (!response.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new Error((typeof error === "string" && error) || AGENT_UNAVAILABLE);
  }
  const reply = agentReplySchema.safeParse(data);
  if (!reply.success) throw new Error("Resposta do servidor em formato inesperado.");
  return reply.data;
}

function portOf(url: string): string {
  return /:(\d+)$/.exec(url)?.[1] ?? DEFAULT_PORT;
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/api/status`, { signal: controller.signal });
    if (!response.ok) return false;
    const data = (await response.json()) as { token?: unknown };
    return typeof data.token === "string";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Procura um servidor WebFit na rede do aparelho. Primeiro os conhecidos (endereços que já responderam e o
 * nome do computador na rede, mDNS); depois varre a sub-rede /24 do seu IP na porta do endereço atual (ou
 * 3000), pulando `skip` (os recusados nesta sessão). O IP do computador muda com o DHCP; assim o usuário não
 * precisa digitá-lo. Devolve o endereço e a origem (um achado da varredura, "scan", só é usado depois de a
 * pessoa confirmar) ou null; no export web, sempre null.
 */
export async function discoverApiUrl(skip: ReadonlySet<string> = new Set()): Promise<DiscoveredServer | null> {
  if (Platform.OS === "web") return null;
  const port = portOf(apiUrl);
  // 1) Atalhos conhecidos, em paralelo.
  const shortcuts = shortcutUrls(await knownServers(), await knownHostname(), port, apiUrl);
  if (shortcuts.length) {
    const hits = await Promise.all(shortcuts.map(async (url) => ((await probe(url)) ? url : null)));
    const hit = hits.find((url): url is string => url !== null);
    if (hit) return { url: hit, source: "known" };
  }
  // 2) Varredura da sub-rede, só em Wi-Fi ou rede cabeada (em dados móveis não há servidor a achar).
  try {
    const network = await Network.getNetworkStateAsync();
    if (network.type === Network.NetworkStateType.CELLULAR || network.type === Network.NetworkStateType.NONE) return null;
  } catch {
    // sem informação de rede: tenta mesmo assim
  }
  let ip = "";
  try {
    ip = await Network.getIpAddressAsync();
  } catch {
    return null;
  }
  const candidates = subnetUrls(ip, port, skip);
  for (let start = 0; start < candidates.length; start += DISCOVERY_BATCH) {
    const batch = candidates.slice(start, start + DISCOVERY_BATCH);
    const results = await Promise.all(batch.map(async (url) => ((await probe(url)) ? url : null)));
    const found = results.find((url): url is string => url !== null);
    if (found) return { url: found, source: "scan" };
  }
  return null;
}
