/**
 * Gramática única de gráficos (SISTEMA-X2): geometria pura de anéis, barras e séries,
 * a mesma no web (SVG) e no app (react-native-svg). Nenhum componente calcula a própria circunferência.
 */

export const circumference = (radius: number) => 2 * Math.PI * radius;

const clampPercent = (percent: number) => Math.min(100, Math.max(0, percent));

/** Comprimento do traço de um anel de raio `radius` preenchido até `percent` (0–100). */
export function arcLength(radius: number, percent: number): number {
  return (clampPercent(percent) / 100) * circumference(radius);
}

/** strokeDasharray para `percent` do anel; "0 C" quando vazio (sem ponto da ponta arredondada). */
export function arcDash(radius: number, percent: number): string {
  const c = circumference(radius);
  return `${arcLength(radius, percent)} ${c}`;
}

export interface RingSegment {
  /** Comprimento do segmento inteiro (trilho). */
  length: number;
  /** strokeDashoffset que posiciona o segmento a partir do topo (com rotate(-90)). */
  offset: number;
}

/**
 * Divide o anel em `count` segmentos iguais separados por `gap` (px de traço),
 * como nos anéis de presença e dos combinados.
 */
export function ringSegments(radius: number, count: number, gap: number): RingSegment[] {
  const total = circumference(radius);
  const n = Math.max(1, Math.floor(count));
  const space = n > 1 ? gap : 0;
  const length = total / n - space;
  return Array.from({ length: n }, (_, i) => ({ length, offset: -i * (length + space) }));
}

/**
 * Rosca com fatias proporcionais a `parts` (ex.: % de proteína, carbos e gorduras), com folga
 * `gap` entre fatias; fatias vazias somem sem deixar folga.
 */
export function donutArcs(radius: number, parts: readonly number[], gap: number): RingSegment[] {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part), 0);
  const full = circumference(radius);
  const visible = parts.filter((part) => part > 0).length;
  const space = visible > 1 ? gap : 0;
  let start = 0;
  return parts.map((part) => {
    const share = total > 0 ? Math.max(0, part) / total : 0;
    const length = share > 0 ? Math.max(0, share * full - space) : 0;
    const arc = { length, offset: -start };
    start += share * full;
    return arc;
  });
}

/** Parte preenchida de um segmento (0–100% do próprio segmento). */
export function segmentFill(segment: RingSegment, percent: number): number {
  return (clampPercent(percent) / 100) * segment.length;
}

/** Posição (0–100) de `value` numa régua de faixas de largura igual; dentro da faixa i o valor ocupa
 *  [i+inset, i+1-inset]/n; o limite superior pertence à faixa de baixo; fora dos limites, grampeia. */
export function bandPosition(boundaries: readonly number[], value: number, inset = 0.15): number {
  const n = boundaries.length - 1;
  if (n < 1) return 0;
  const at = (band: number, fraction: number) =>
    ((band + inset + fraction * (1 - 2 * inset)) / n) * 100;
  if (!Number.isFinite(value) || value <= boundaries[0]) return at(0, 0);
  if (value >= boundaries[n]) return at(n - 1, 1);
  let band = 0;
  while (band < n - 1 && value > boundaries[band + 1]) band += 1;
  const low = boundaries[band];
  const high = boundaries[band + 1];
  return at(band, high > low ? (value - low) / (high - low) : 0);
}

/** Alturas relativas (0–100) ao maior valor, com piso `minPercent` para valores > 0; zeros → 0. */
export function relativeHeights(values: readonly number[], minPercent = 16): number[] {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  return values.map((v) =>
    max > 0 && Number.isFinite(v) && v > 0 ? Math.max(minPercent, (v / max) * 100) : 0,
  );
}

const THIRDS = 3;
const FULL_TURN_DEG = 360;
const TOP_DEG = -90;

/** Três arcos iguais (um terço do anel cada), com `gapDeg` de folga, a partir do topo. Graus: 0 = direita, horário. */
export function thirdArcs(gapDeg = 14): { start: number; sweep: number }[] {
  const slice = FULL_TURN_DEG / THIRDS;
  const gap = Math.min(Math.max(0, gapDeg), slice);
  return Array.from({ length: THIRDS }, (_, i) => ({
    start: TOP_DEG + gap / 2 + i * slice,
    sweep: slice - gap,
  }));
}

/** 2 casas, sem "-0" (o SVG leria "-0" igual, mas o texto fica estável nos testes). */
const round2 = (n: number) => {
  const value = Math.round(n * 100) / 100;
  return Object.is(value, -0) ? 0 : value;
};
const pointAt = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: round2(cx + r * Math.cos(rad)), y: round2(cy + r * Math.sin(rad)) };
};

/** Arco SVG com 2 casas: `M${x0},${y0} A${r},${r} 0 ${sweep>180?1:0} 1 ${x1},${y1}`. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const from = pointAt(cx, cy, r, startDeg);
  const to = pointAt(cx, cy, r, startDeg + sweepDeg);
  const radius = round2(r);
  return `M${from.x},${from.y} A${radius},${radius} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${to.x},${to.y}`;
}

export interface Sparkline {
  d: string;
  last: { x: number; y: number };
}

/** x uniforme em [pad, width−pad]; y por mín./máx. em [pad, height−pad] (maior em cima); série plana no meio; < 2 valores → null. */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
  pad = 2,
): Sparkline | null {
  const series = values.filter((v) => Number.isFinite(v));
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const innerW = Math.max(0, width - 2 * pad);
  const innerH = Math.max(0, height - 2 * pad);
  const step = innerW / (series.length - 1);
  const points = series.map((v, i) => ({
    x: round2(pad + i * step),
    y: round2(max === min ? height / 2 : pad + ((max - v) / (max - min)) * innerH),
  }));
  return {
    d: points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "),
    last: points[points.length - 1]!,
  };
}
