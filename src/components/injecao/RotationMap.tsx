import { useId } from "react";
import { SIDES, spotLabel } from "../../lib/injection";
import { FACE_LABEL, SITE_FACE, type BodyFace, type RotationModel, type Spot } from "../../lib/rotation";
import { INJECTION_SITES, type InjectionSide, type InjectionSite } from "../../types";
import type { Shape } from "./bodySilhouette";
import {
  BACK_DETAILS,
  FACE_SIDE_ORDER,
  FIGURE_VIEWBOX,
  FRONT_DETAILS,
  OUTLINE,
  SPOT_POINTS,
  badgeGroups,
} from "./bodyViews";
import "./Rotation.css";

const FACES: readonly BodyFace[] = ["frente", "costas"];
const SIDE_LETTER: Record<InjectionSide, string> = { esquerdo: "E", direito: "D" };
/** Raios no desenho (sistema 0 0 180 230): halo, anel da sugestão e ponto. */
const HALO_R = 11;
const SUGGEST_R = 7;
const POINT_R = 3.5;
const POINT_ON_R = 4.5;

/** Lado nulo cobre a zona inteira (registros antigos e locais sem lado sugerido). */
const covers = (spot: Spot, site: InjectionSite, side: InjectionSide) =>
  spot.site === site && (spot.side === null || spot.side === side);

function Detail({ shape }: { shape: Shape }) {
  if (shape.type === "path") return <path className="rot-detail" d={shape.d} opacity={shape.opacity} />;
  if (shape.type === "circle") return <circle className="rot-detail-dot" cx={shape.cx} cy={shape.cy} r={shape.r} />;
  return <ellipse className="rot-detail" cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} opacity={shape.opacity} />;
}

type Props = {
  site: InjectionSite;
  side: InjectionSide | null;
  model: RotationModel;
};

/**
 * Mapa de rodízio (SERINGA-04): frente (abdômen e coxa) e costas (braço), com o lado da pessoa em
 * letras E/D, o ponto escolhido em verde, a sugestão tracejada e as três últimas aplicações em selos.
 * É um resumo visual, sem alvos de toque (na largura do desenho, local e lado não caberiam em 44 px
 * sem se sobrepor): a escolha fica nos botões "Local de aplicação" e "Lado do corpo", para dedo,
 * teclado e leitor de tela. O desenho é uma imagem com o texto alternativo completo. Nada bloqueia.
 */
export function RotationMap({ site, side, model }: Props) {
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  const badges = badgeGroups(model.marks);
  const chosen: Spot = { site, side };
  return (
    <div className="rot-map" data-testid="injection-body-map">
      {/* "Local: Coxa esquerda" evita erro de concordância (coxa selecionada, braço selecionado). */}
      <span className="inj-site-indicator" data-testid="injection-site-indicator" aria-live="polite">
        Local: {spotLabel(site, side)}
      </span>
      <div className="rot-figures" role="img" aria-label={model.aria}>
        {FACES.map((face) => {
          const halo = `${base}-${face}-halo`;
          const [leftSide, rightSide] = FACE_SIDE_ORDER[face];
          return (
            <figure className="rot-figure" key={face}>
              <div className="rot-canvas">
                <svg viewBox={FIGURE_VIEWBOX} aria-hidden="true" focusable="false">
                  <defs>
                    <radialGradient id={halo} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="var(--wf-green-500)" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="var(--wf-green-500)" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {OUTLINE.map((shape, i) =>
                    shape.type === "path" ? <path key={i} className="rot-outline" d={shape.d} /> : null,
                  )}
                  {(face === "frente" ? FRONT_DETAILS : BACK_DETAILS).map((shape, i) => (
                    <Detail key={i} shape={shape} />
                  ))}
                  {INJECTION_SITES.filter((s) => SITE_FACE[s] === face).flatMap((s) =>
                    SIDES.map(({ key: sd }) => {
                      const p = SPOT_POINTS[s][sd];
                      const isOn = covers(chosen, s, sd);
                      return (
                        <g key={`${s}-${sd}`} className={`rot-spot ${isOn ? "on" : ""}`}>
                          <circle className="rot-halo" cx={p.cx} cy={p.cy} r={HALO_R} fill={`url(#${halo})`} opacity={isOn ? 1 : 0} />
                          {covers(model.suggested, s, sd) && (
                            <circle className="rot-suggest" cx={p.cx} cy={p.cy} r={SUGGEST_R} fill="none" />
                          )}
                          <circle className="rot-point" cx={p.cx} cy={p.cy} r={isOn ? POINT_ON_R : POINT_R} />
                        </g>
                      );
                    }),
                  )}
                </svg>
                {badges
                  .filter((g) => g.face === face)
                  .map((g) => (
                    <span
                      key={`${g.site}-${g.side}`}
                      className="rot-badge"
                      data-testid="rotation-badge"
                      style={{ left: `${g.left}%`, top: `${g.top}%` }}
                      aria-hidden="true"
                    >
                      {g.text}
                    </span>
                  ))}
                <span className="rot-side is-left" aria-hidden="true">
                  {SIDE_LETTER[leftSide]}
                </span>
                <span className="rot-side is-right" aria-hidden="true">
                  {SIDE_LETTER[rightSide]}
                </span>
              </div>
              <figcaption aria-hidden="true">{FACE_LABEL[face]}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
