// Converte um design.json da silhueta no módulo TypeScript usado pelo BodyMap.
// Uso: node scripts/body-map/to-ts.mjs scripts/body-map/design.json src/components/injecao/bodySilhouette.ts
import { readFileSync, writeFileSync } from "node:fs";

const [designPath, outPath] = process.argv.slice(2);
if (!designPath || !outPath) {
  console.error("uso: node to-ts.mjs <design.json> <saida.ts>");
  process.exit(1);
}
const design = JSON.parse(readFileSync(designPath, "utf8"));
const ORDER = ["abdomen", "coxa", "braco"];
const zones = Object.fromEntries(
  ORDER.map((key) => {
    const zone = design.zones[key] ?? { halos: [], points: [] };
    return [
      key,
      {
        ...(zone.ring ? { ring: zone.ring } : {}),
        halos: zone.halos ?? [],
        points: (zone.points ?? []).map((p) => ({ ...p, r: p.r ?? 3.5 })),
      },
    ];
  }),
);
const source = `import type { InjectionSite } from "../../types";

/**
 * Silhueta humana do mapa de aplicação subcutânea (viewBox 0 0 180 230), front-facing,
 * em estilo de ilustração médica clara. Gerada a partir de um desenho em JSON
 * (scripts/body-map: gen.mjs desenha, render.mjs pré-visualiza, to-ts.mjs gera este arquivo); as formas são desenhadas na ordem da lista.
 */
export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: "round" | "miter" | "bevel";
  strokeLinecap?: "round" | "butt" | "square";
  opacity?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeDasharray?: string;
}
export type Shape = ShapeStyle &
  (
    | { type: "path"; d: string }
    | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
    | { type: "circle"; cx: number; cy: number; r: number }
  );
export interface Marker {
  cx: number;
  cy: number;
  r: number;
}
/** Marcadores de uma zona: halos difusos, anel tracejado opcional e pontos de aplicação. */
export interface ZoneSpec {
  ring?: Marker;
  halos: Marker[];
  points: Marker[];
}

export const SILHOUETTE: Shape[] = ${JSON.stringify(design.shapes, null, 2)};

export const ZONES: Record<InjectionSite, ZoneSpec> = ${JSON.stringify(zones, null, 2)};
`;
writeFileSync(outPath, source);
console.log(`escrito ${outPath}: ${design.shapes.length} formas`);
