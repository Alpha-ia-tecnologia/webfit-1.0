/**
 * Figuras de frente e de costas do mapa de rodízio (SERINGA-04) e da silhueta das medidas (EVOL-10).
 * Só geometria (sistema 0 0 180 230 da silhueta gerada), sem React: o web e o app desenham a partir daqui.
 */
import type { InjectionSide, InjectionSite } from "../../types";
import { SIDES } from "../../lib/injection";
import {
  SITE_FACE,
  type BodyFace,
  type RotationCallout,
  type RotationCallouts,
  type RotationMark,
  type SpotStatus,
} from "../../lib/rotation";
import { SILHOUETTE, type Marker, type Shape } from "./bodySilhouette";

/** Recorte do corpo (sem margens) das figuras de frente/costas, miniaturas e pictogramas. */
export const FIGURE_VIEW = { x: 40, y: 4, width: 100, height: 224 } as const;
export const FIGURE_VIEWBOX = "40 4 100 224";
/** Contorno + cabeça (iguais de frente e de costas). */
export const OUTLINE: Shape[] = SILHOUETTE.slice(0, 2);
/** Peito, abdômen, joelhos, umbigo (desenho gerado). */
export const FRONT_DETAILS: Shape[] = SILHOUETTE.slice(2);
/** Costas: coluna, escápulas, dobra glútea e dobra dos joelhos. Só geometria: a cor (slate-300) vem de quem desenha. */
export const BACK_DETAILS: Shape[] = [
  { type: "path", d: "M90 50 L90 116", opacity: 0.45 },
  { type: "path", d: "M70.5 58 C73 64.5 76.5 70 82 73.5", opacity: 0.5 },
  { type: "path", d: "M109.5 58 C107 64.5 103.5 70 98 73.5", opacity: 0.5 },
  { type: "path", d: "M90 112 L90 126", opacity: 0.4 },
  { type: "path", d: "M73.5 128 C78 131.2 84 131.8 88.5 130", opacity: 0.4 },
  { type: "path", d: "M106.5 128 C102 131.2 96 131.8 91.5 130", opacity: 0.4 },
  { type: "path", d: "M78.8 173.6 C80.2 175 83.8 175 85.2 173.6", opacity: 0.5 },
  { type: "path", d: "M94.8 173.6 C96.2 175 99.8 175 101.2 173.6", opacity: 0.5 },
];

/** Pontos (sistema 0 0 180 230). De frente, o lado ESQUERDO da pessoa fica à DIREITA de quem olha; de costas, à esquerda. */
export const SPOT_POINTS: Record<InjectionSite, Record<InjectionSide, Marker>> = {
  abdomen: { esquerdo: { cx: 103, cy: 96, r: 3.5 }, direito: { cx: 77, cy: 96, r: 3.5 } },
  coxa: { esquerdo: { cx: 99.4, cy: 147, r: 3.5 }, direito: { cx: 80.6, cy: 147, r: 3.5 } },
  braco: { esquerdo: { cx: 60.97, cy: 75.54, r: 3.5 }, direito: { cx: 119.03, cy: 75.54, r: 3.5 } },
};

/** Letras nas bordas: de frente "D" à esquerda de quem olha e "E" à direita; de costas o contrário. */
export const FACE_SIDE_ORDER: Record<BodyFace, readonly [InjectionSide, InjectionSide]> = {
  frente: ["direito", "esquerdo"],
  costas: ["esquerdo", "direito"],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** % da figura (left, top) de um ponto do desenho, 1 casa. */
export function figurePercent(p: { cx: number; cy: number }): { left: number; top: number } {
  return {
    left: round1(((p.cx - FIGURE_VIEW.x) / FIGURE_VIEW.width) * 100),
    top: round1(((p.cy - FIGURE_VIEW.y) / FIGURE_VIEW.height) * 100),
  };
}

export interface BadgeGroup {
  site: InjectionSite;
  side: InjectionSide;
  face: BodyFace;
  /** Posições no histórico, em ordem crescente (1 = a mais recente). */
  ranks: number[];
  /** "1" ou "1 · 3". */
  text: string;
  left: number;
  top: number;
}

/** Selos navy: agrupa marcas no mesmo ponto ("1 · 3"); marcas sem lado ficam FORA do desenho (nada inventado). */
export function badgeGroups(marks: readonly RotationMark[]): BadgeGroup[] {
  const groups = new Map<string, { site: InjectionSite; side: InjectionSide; ranks: number[] }>();
  for (const mark of marks) {
    if (!mark.side) continue;
    const key = `${mark.site}:${mark.side}`;
    const current = groups.get(key);
    groups.set(key, {
      site: mark.site,
      side: mark.side,
      ranks: [...(current?.ranks ?? []), mark.rank],
    });
  }
  return [...groups.values()].map((g) => {
    const ranks = [...g.ranks].sort((a, b) => a - b);
    return {
      site: g.site,
      side: g.side,
      face: SITE_FACE[g.site],
      ranks,
      text: ranks.join(" · "),
      ...figurePercent(SPOT_POINTS[g.site][g.side]),
    };
  });
}

/* ---------- Cartão "Rodízio de locais" e faixa "Últimas aplicações" (conceito 10) ----------
   De frente aparecem os três locais (o braço na lateral externa, visível de frente, como no conceito);
   de costas, a parte posterior do braço. */
export const CARD_FACE_SITES: Record<BodyFace, readonly InjectionSite[]> = {
  frente: ["abdomen", "coxa", "braco"],
  costas: ["braco"],
};
/** Recorte horizontal do corpo no cartão (x 46–134 da silhueta): a figura ocupa 90 × 224 px. */
export const CARD_VIEW = { x: 45, y: 4, width: 90, height: 224 } as const;
export const CARD_VIEWBOX = "45 4 90 224";
/** Centro do abdômen: um registro sem lado ocupa a zona inteira, sem inventar lado. */
export const ABDOMEN_CENTER = { cx: 90, cy: 96 } as const;
/** Ponto do local na face: de frente o braço espelha o desenho das costas (esquerdo à direita de quem olha). */
export function cardSpotPoint(
  face: BodyFace,
  site: InjectionSite,
  side: InjectionSide,
): { cx: number; cy: number } {
  if (face === "frente" && site === "braco") return SPOT_POINTS.braco[side === "esquerdo" ? "direito" : "esquerdo"];
  return SPOT_POINTS[site][side];
}
/** Elipses dos marcadores por local (unidades do desenho; a figura do cartão fica em 1:1 px). */
export const CARD_SPOT_SIZE: Record<InjectionSite, { rx: number; ry: number }> = {
  abdomen: { rx: 10, ry: 10 },
  coxa: { rx: 8, ry: 15 },
  braco: { rx: 6.5, ry: 10.5 },
};
/** Raio do marcador central do abdômen (registro sem lado). */
export const ABDOMEN_CENTER_R = 15;
/**
 * Posições verticais das legendas ao lado da figura: separa vizinhas em pelo menos `min` e mantém
 * todas entre `lo` e `hi` (relaxamento simples; entrada e saída em ordem crescente).
 */
export function spreadLabels(ys: readonly number[], min: number, lo: number, hi: number): number[] {
  const out = [...ys].sort((a, b) => a - b);
  if (!out.length) return out;
  for (let iter = 0; iter < 40; iter += 1) {
    for (let i = 1; i < out.length; i += 1) {
      const gap = out[i]! - out[i - 1]!;
      if (gap < min) {
        const d = (min - gap) / 2;
        out[i - 1] = out[i - 1]! - d;
        out[i] = out[i]! + d;
      }
    }
    out[0] = Math.max(lo, out[0]!);
    out[out.length - 1] = Math.min(hi, out[out.length - 1]!);
  }
  return out.map((y) => Math.round(y * 10) / 10);
}
export type CardMarkerKind = SpotStatus | "sugestao";
export interface CardMarker {
  key: string;
  site: InjectionSite;
  /** null = centro do abdômen (registro sem lado). */
  side: InjectionSide | null;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  kind: CardMarkerKind;
}
export interface CardCallout {
  callout: RotationCallout;
  /** Borda direita do marcador (unidades do desenho). */
  x: number;
  y: number;
  /** Centro da legenda, em px a partir do topo da figura (1:1). */
  labelY: number;
}
export interface RotationFaceLayout {
  markers: CardMarker[];
  callouts: CardCallout[];
  /** Borda esquerda do marcador sugerido e o centro da caixa "Sugestão" (px da figura). */
  suggestion: { x: number; y: number; labelY: number } | null;
}
/** Distância mínima entre legendas vizinhas e margem até o topo/pé da figura (px). */
export const CALLOUT_MIN_GAP = 44;
export const CALLOUT_EDGE = 22;
const SUGGESTION_EDGE = 30;

const matches = (m: CardMarker, site: InjectionSite, side: InjectionSide | null) =>
  m.site === site && (side === null || m.side === null || m.side === side);

/**
 * Marcadores e legendas de uma face do cartão: sugestão > estado da aplicação mais recente no ponto
 * (última, recente) > livre. Abdômen sem lado vira um marcador no centro da zona (nada inventado).
 */
export function rotationFace(face: BodyFace, view: RotationCallouts): RotationFaceLayout {
  const { suggested, callouts } = view;
  const markers: CardMarker[] = [];
  for (const site of CARD_FACE_SITES[face]) {
    const own = callouts.filter((c) => c.site === site);
    const isSuggestedSite = suggested.site === site;
    const usesCenter = site === "abdomen" && (own.some((c) => c.side === null) || (isSuggestedSite && suggested.side === null));
    if (usesCenter) {
      const kind = isSuggestedSite ? "sugestao" : (own[0]?.status ?? "livre");
      markers.push({ key: "abdomen", site, side: null, ...ABDOMEN_CENTER, rx: ABDOMEN_CENTER_R, ry: ABDOMEN_CENTER_R, kind });
      continue;
    }
    for (const { key: side } of SIDES) {
      const p = cardSpotPoint(face, site, side);
      const isSuggested = isSuggestedSite && (suggested.side === null || suggested.side === side);
      const covering = own.find((c) => c.side === null || c.side === side);
      const kind = isSuggested ? "sugestao" : (covering?.status ?? "livre");
      markers.push({ key: `${site}-${side}`, site, side, cx: p.cx, cy: p.cy, ...CARD_SPOT_SIZE[site], kind });
    }
  }
  const anchored = callouts
    .map((callout) => {
      const target = markers
        .filter((m) => matches(m, callout.site, callout.side))
        .sort((a, b) => b.cx - a.cx)[0];
      return target ? { callout, x: target.cx + target.rx, y: target.cy } : null;
    })
    .filter((c): c is Omit<CardCallout, "labelY"> => c !== null)
    .sort((a, b) => a.y - b.y);
  const ys = spreadLabels(
    anchored.map((c) => c.y - CARD_VIEW.y),
    CALLOUT_MIN_GAP,
    CALLOUT_EDGE,
    CARD_VIEW.height - CALLOUT_EDGE,
  );
  const target = markers.filter((m) => m.kind === "sugestao").sort((a, b) => a.cx - b.cx)[0];
  return {
    markers,
    callouts: anchored.map((c, i) => ({ ...c, labelY: ys[i]! })),
    suggestion: target
      ? {
          x: target.cx - target.rx,
          y: target.cy,
          labelY: Math.min(CARD_VIEW.height - SUGGESTION_EDGE, Math.max(SUGGESTION_EDGE, target.cy - CARD_VIEW.y)),
        }
      : null,
  };
}
/** Recorte do tronco das miniaturas emolduradas (ombros às coxas). */
export const MINI_VIEWBOX = "44 22 92 138";

/** Linhas de cintura e quadril sobre a silhueta de frente (EVOL-10). */
export const MEASURE_LINES = {
  waist: { y: 102, x1: 70, x2: 110 },
  hip: { y: 121, x1: 67, x2: 113 },
} as const;
