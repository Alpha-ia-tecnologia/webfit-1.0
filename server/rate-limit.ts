/**
 * Janela deslizante por chave (ex.: o IP de um aparelho na rede local). `hit` registra a consulta e
 * responde se ela passou do limite; consultas recusadas não contam. Sem relógio escondido: `now` é injetável.
 */
export interface SlidingWindow {
  hit: (key: string, now?: number) => boolean;
}

export function slidingWindow(limit: number, windowMs: number): SlidingWindow {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
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
