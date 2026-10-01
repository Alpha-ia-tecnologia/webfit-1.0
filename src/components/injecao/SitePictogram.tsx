import { SIDES } from "../../lib/injection";
import type { Spot } from "../../lib/rotation";
import { FIGURE_VIEWBOX, OUTLINE, SPOT_POINTS } from "./bodyViews";
import "./Rotation.css";

/** Raio do ponto no desenho: em 28×40 px o corpo tem ~0,18 px por unidade, então o ponto fica com ~4 px. */
const DOT_R = 11;

/**
 * Pictograma de 28×40 px do ponto de aplicação (histórico e folha "Aplicação registrada"): contorno do
 * corpo e o ponto em violeta. Sem lado (registros antigos), os dois pontos do local ficam vazados.
 * Decorativo: o texto ao lado sempre diz o local e o lado.
 */
export function SitePictogram({ site, side }: Spot) {
  const sides = side ? [side] : SIDES.map((s) => s.key);
  return (
    <svg className="site-picto" viewBox={FIGURE_VIEWBOX} width={28} height={40} aria-hidden="true" focusable="false">
      {OUTLINE.map((shape, i) =>
        shape.type === "path" ? <path key={i} className="site-picto-outline" d={shape.d} /> : null,
      )}
      {sides.map((s) => {
        const p = SPOT_POINTS[site][s];
        return (
          <circle
            key={s}
            className={side ? "site-picto-dot" : "site-picto-dot is-open"}
            cx={p.cx}
            cy={p.cy}
            r={DOT_R}
          />
        );
      })}
    </svg>
  );
}
