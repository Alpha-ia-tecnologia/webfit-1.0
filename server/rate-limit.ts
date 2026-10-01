/**
 * Janela deslizante por chave (ex.: o IP de um aparelho na rede local). `hit` registra a consulta e
 * responde se ela passou do limite; consultas recusadas não contam. Sem relógio escondido: `now` é injetável.
 */
export interface SlidingWindow {
  hit: (key: string, now?: number) => boolean;
}

/** Acima disto, as chaves sem consulta recente saem da memória (e-mails ou IPs aleatórios não acumulam). */
const SWEEP_AT = 10_000;

export function slidingWindow(limit: number, windowMs: number): SlidingWindow {
  const hits = new Map<string, number[]>();
  const sweep = (now: number) => {
    for (const [key, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(key);
  };
  return {
    hit(key, now = Date.now()) {
      if (hits.size >= SWEEP_AT && !hits.has(key)) sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return true;
      }
      hits.set(key, [...recent, now]);
      return false;
    },
  };
}
