/**
 * Descoberta do servidor do agente no app nativo (regras puras, testadas em tests/server-discovery.test.ts).
 *
 * O app envia dados de saúde ao servidor que adota. Por isso só entram sozinhos os servidores já
 * conhecidos (a lista dos que a pessoa já usou e o atalho <nome-do-computador>.local); um endereço
 * achado apenas na varredura da sub-rede só é usado depois de a pessoa confirmar. Recusou: o mesmo
 * endereço não é oferecido de novo nesta sessão.
 */

/** "known": lista salva ou atalho mDNS; "scan": achado só na varredura da sub-rede /24. */
export type DiscoverySource = "known" | "scan";

export interface DiscoveredServer {
  url: string;
  source: DiscoverySource;
}

/** Resultado de "Procurar na rede" e da busca automática. */
export type DiscoveryOutcome =
  | { kind: "adopted"; url: string }
  | { kind: "declined"; url: string }
  | { kind: "none" };

export type DiscoveryDecision = "adopt" | "confirm" | "skip";

/** Conhecido entra sozinho; da varredura pede confirmação, a não ser que já tenha sido recusado. */
export function discoveryDecision(found: DiscoveredServer, declined: ReadonlySet<string>): DiscoveryDecision {
  if (found.source === "known") return "adopt";
  return declined.has(found.url) ? "skip" : "confirm";
}

/** Nova lista de recusados (nunca muta a anterior). */
export function withDeclined(declined: ReadonlySet<string>, url: string): ReadonlySet<string> {
  return new Set([...declined, url]);
}

/** Pergunta calma antes de usar um servidor achado só na varredura. */
export function scanConfirmCopy(url: string): { title: string; message: string; confirmLabel: string } {
  return {
    title: "Usar este servidor?",
    message: `Encontramos um servidor WebFit em ${url}. Use só se for o seu computador.`,
    confirmLabel: "Usar",
  };
}

/**
 * Decide o que fazer com o endereço achado: conhecido é adotado; da varredura, só com `confirm(url)`
 * verdadeiro (recusado entra em `declined`, sem nova pergunta nesta sessão). Quem chama grava e usa o
 * endereço só quando o resultado é "adopted".
 */
export async function settleDiscovery(
  found: DiscoveredServer | null,
  declined: ReadonlySet<string>,
  confirm: (url: string) => Promise<boolean>,
): Promise<{ outcome: DiscoveryOutcome; declined: ReadonlySet<string> }> {
  if (!found) return { outcome: { kind: "none" }, declined };
  const decision = discoveryDecision(found, declined);
  if (decision === "skip") return { outcome: { kind: "none" }, declined };
  if (decision === "confirm" && !(await confirm(found.url)))
    return { outcome: { kind: "declined", url: found.url }, declined: withDeclined(declined, found.url) };
  return { outcome: { kind: "adopted", url: found.url }, declined };
}

/** Aviso depois de recusar em "Procurar na rede". */
export const DISCOVERY_DECLINED =
  "Servidor não usado. Se for o seu computador, informe o endereço e toque em Testar e salvar.";

/** True para o endereço padrão do build, que só funciona no emulador com adb reverse. */
export function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(:|$)/i.test(url);
}

/**
 * Atalhos tentados antes da varredura, todos "conhecidos": os endereços que já responderam (sem o
 * atual nem os de loopback) e o nome do computador na rede local (mDNS).
 */
export function shortcutUrls(
  known: readonly string[],
  hostname: string | null,
  port: string,
  current: string,
): string[] {
  const urls = new Set(known.filter((url) => url !== current && !isLoopbackUrl(url)));
  if (hostname) urls.add(`http://${hostname.toLowerCase()}.local:${port}`);
  return [...urls];
}

/** Endereços da sub-rede /24 do aparelho na porta dada, sem o próprio IP nem os recusados. */
export function subnetUrls(ip: string, port: string, skip: ReadonlySet<string>): string[] {
  const match = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  if (!match) return [];
  const own = `http://${ip}:${port}`;
  return Array.from({ length: 254 }, (_, i) => `http://${match[1]}.${i + 1}:${port}`).filter(
    (url) => url !== own && !skip.has(url),
  );
}
