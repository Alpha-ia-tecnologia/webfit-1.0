/**
 * Modo online (WebFit publicado na VPS, várias contas). Liga quando WEBFIT_PUBLIC_URL está definida;
 * sem ela, o servidor continua no modo local (este computador ou a rede Wi-Fi, token entregue pelo
 * /api/status). Online, o token nunca é entregue: cada pedido precisa da sessão de uma conta.
 *
 * Variáveis:
 * - WEBFIT_PUBLIC_URL      endereço público com https (ex.: https://webfit.exemplo.com.br)
 * - WEBFIT_AI_DAILY_LIMIT  pedidos ao agente por conta e por dia (padrão 30; o dono não tem limite)
 * - DATABASE_URL           obrigatória: contas, sessões e cópias moram no banco
 */
export const DEFAULT_AI_DAILY_LIMIT = 30;
const LOCAL_TEST_HOSTS = new Set(["localhost", "127.0.0.1"]);

export interface OnlineConfig {
  /** Origem pública, sem barra no fim (comparada com o cabeçalho Origin). */
  publicOrigin: string;
  publicHost: string;
  aiDailyLimit: number;
}

/** Lê o modo online do ambiente; null no modo local. Configuração inválida impede o servidor de subir. */
export function onlineConfig(env: NodeJS.ProcessEnv = process.env): OnlineConfig | null {
  const raw = env.WEBFIT_PUBLIC_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("WEBFIT_PUBLIC_URL inválida. Use o endereço completo, ex.: https://webfit.exemplo.com.br");
  }
  // Senhas e dados de saúde só trafegam com HTTPS; http apenas para testar no próprio computador.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_TEST_HOSTS.has(url.hostname)))
    throw new Error("WEBFIT_PUBLIC_URL precisa usar https://.");
  if (!env.DATABASE_URL) throw new Error("O modo online precisa de DATABASE_URL (contas e cópias ficam no banco).");
  const limit = env.WEBFIT_AI_DAILY_LIMIT === undefined ? DEFAULT_AI_DAILY_LIMIT : Number(env.WEBFIT_AI_DAILY_LIMIT);
  if (!Number.isInteger(limit) || limit < 0) throw new Error("WEBFIT_AI_DAILY_LIMIT precisa ser um número inteiro (0 ou mais).");
  return { publicOrigin: url.origin, publicHost: url.hostname, aiDailyLimit: limit };
}
