/**
 * Geometria única da seringa (SERINGA-03): o mesmo desenho no web (SVG) e no app (react-native-svg).
 * Nenhum SyringeFigure guarda constantes próprias; rótulos da escala são texto HTML/AppText, nunca SVG <text>.
 */
import type { SyringeProfile } from "./injection";

/** viewBox 400×120; a flange fica em 328 (e não 322) para o último traço da escala aparecer. */
export const SYRINGE_VIEW = {
  width: 400,
  height: 120,
  barrelX: 72,
  barrelW: 252,
  midY: 60,
  flangeX: 328,
  rodEnd: 396,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Posição x (viewBox) da quantidade `units` na escala da seringa; grampeia em 0–capacidade. */
export const syringeX = (units: number, p: SyringeProfile) =>
  SYRINGE_VIEW.barrelX + (SYRINGE_VIEW.barrelW * clamp(units, 0, p.units)) / p.units;
/** A mesma posição em % da largura do desenho, para rótulos HTML posicionados com `left`. */
export const syringePercent = (units: number, p: SyringeProfile) =>
  (syringeX(units, p) / SYRINGE_VIEW.width) * 100;

/**
 * Recorte da seringa fina da receita (conceito 10): o mesmo desenho visto de x 36 a 372 e de y 28 a 92, com a
 * agulha e a haste mais curtas (o apoio do polegar termina em 368): o cilindro ocupa 75% da largura (252 de 336).
 */
export const SLIM_VIEW = { x: 36, y: 28, width: 336, height: 64, rodEnd: 368 } as const;
/** Posição em % da largura do recorte fino (rótulos da escala e pílula da receita). */
export const slimPercent = (units: number, p: SyringeProfile) =>
  ((syringeX(units, p) - SLIM_VIEW.x) / SLIM_VIEW.width) * 100;

export const MIN_LABEL_GAP_PX = 20;
export interface ScaleLabel {
  units: number;
  percent: number;
}
/** Rótulos da escala: múltiplos de majorEvery × k com o menor k em que barrelPx·passo/p.units ≥ MIN_LABEL_GAP_PX; sem zero.
 *  Só entram passos que dividem a capacidade, para o rótulo final (30, 50 ou 100) sempre aparecer.
 *  `percentOf`: syringePercent (desenho inteiro) ou slimPercent (recorte fino da receita). */
export function scaleLabels(
  p: SyringeProfile,
  barrelPx: number,
  percentOf: (units: number, p: SyringeProfile) => number = syringePercent,
): ScaleLabel[] {
  const steps: number[] = [];
  for (let step = p.majorEvery; step <= p.units; step += p.majorEvery)
    if (p.units % step === 0) steps.push(step);
  const step =
    steps.find((s) => (barrelPx * s) / p.units >= MIN_LABEL_GAP_PX) ?? p.units;
  const labels: ScaleLabel[] = [];
  for (let units = step; units <= p.units; units += step)
    labels.push({ units, percent: percentOf(units, p) });
  return labels;
}

export const LENS_ZOOM = 3;
export const LENS_ASPECT = 10 / 3;
export interface LensView {
  x: number;
  y: number;
  width: number;
  height: number;
  labels: ScaleLabel[];
}
/** Recorte da lupa (100 UI): largura width/LENS_ZOOM, altura largura/LENS_ASPECT, centrado no valor e grampeado ao desenho;
 *  y cobre a faixa de traços superior (midY − barrel/2 − 4). labels = maiores dentro do recorte, em % da lupa. */
export function lensView(units: number, p: SyringeProfile): LensView {
  const width = SYRINGE_VIEW.width / LENS_ZOOM;
  const height = width / LENS_ASPECT;
  const x = clamp(syringeX(units, p) - width / 2, 0, SYRINGE_VIEW.width - width);
  const y = SYRINGE_VIEW.midY - p.barrel / 2 - 4;
  const labels: ScaleLabel[] = [];
  for (let major = p.majorEvery; major <= p.units; major += p.majorEvery) {
    const at = syringeX(major, p);
    if (at >= x && at <= x + width)
      labels.push({ units: major, percent: ((at - x) / width) * 100 });
  }
  return { x, y, width, height, labels };
}

/** Mantém a pílula "Aspire até aqui" dentro da figura. */
export const pillPercent = (percent: number) => Math.min(84, Math.max(16, percent));
