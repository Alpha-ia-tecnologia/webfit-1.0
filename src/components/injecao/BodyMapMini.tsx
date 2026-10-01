import { SIDES, spotLabel } from "../../lib/injection";
import { SITE_FACE } from "../../lib/rotation";
import { INJECTION_SITES, type InjectionSide, type InjectionSite } from "../../types";
import { ABDOMEN_CENTER, FIGURE_VIEWBOX, MINI_VIEWBOX, OUTLINE, SPOT_POINTS, cardSpotPoint } from "./bodyViews";
import "./Injecao.css";

const ON = "var(--wf-tone-medication-fg)";
const OFF = "var(--wf-slate-300)";
/** Raios no desenho: em 56 px os pontos precisam ser maiores que no mapa grande. */
const ON_R = 7.7;
const OFF_R = 5.6;
/** Miniatura emoldurada (faixa "Últimas aplicações"): um ponto só, maior, no tom do momento. */
const FRAMED_R = 9;

export type MiniTone = "past" | "last" | "next";

type Props = {
  site: InjectionSite;
  /** Lado sugerido ou escolhido; null (registros antigos) destaca os dois pontos do local. */
  side?: InjectionSide | null;
  /** "Local sugerido" (Hoje, receita) ou "Local" (formulário). */
  prefix?: string;
  /**
   * Moldura 52×58 com o tronco de frente (conceito 10): passado em cinza, a última em âmbar e a
   * próxima estimada em verde. Sem `framed`, o desenho de sempre do Hoje.
   */
  framed?: boolean;
  tone?: MiniTone;
};

/** Pontos acesos na miniatura emoldurada: abdômen sem lado = o centro da zona (nada inventado). */
function framedPoints(site: InjectionSite, side: InjectionSide | null) {
  if (site === "abdomen" && side === null) return [ABDOMEN_CENTER];
  return SIDES.filter(({ key }) => side === null || side === key).map(({ key }) => cardSpotPoint("frente", site, key));
}

/**
 * Mapa corporal de leitura, 56×72 px (Hoje): a face do local (frente para abdômen e coxa, costas
 * para o braço), o ponto escolhido em destaque e os outros em cinza claro. Não é clicável.
 * Só o contorno do corpo e a cabeça: em 56 px os traços finos da ilustração viram ruído.
 */
export function BodyMapMini({ site, side = null, prefix = "Local sugerido", framed = false, tone = "past" }: Props) {
  const face = SITE_FACE[site];
  const label = `${prefix}: ${spotLabel(site, side)}`;
  if (framed)
    return (
      <svg
        className={`inj-body-mini is-framed tone-${tone}`}
        viewBox={MINI_VIEWBOX}
        role="img"
        aria-label={label}
        data-testid="injection-site-mini"
        focusable="false"
      >
        {OUTLINE.map((shape, i) =>
          shape.type === "path" ? <path key={i} className="inj-mini-body" d={shape.d} strokeLinejoin="round" /> : null,
        )}
        {framedPoints(site, side).map((p) => (
          <circle key={`${p.cx}-${p.cy}`} className="inj-mini-dot" cx={p.cx} cy={p.cy} r={FRAMED_R} />
        ))}
      </svg>
    );
  return (
    <svg
      className="inj-body-mini"
      viewBox={FIGURE_VIEWBOX}
      role="img"
      aria-label={label}
      data-testid="injection-site-mini"
      focusable="false"
    >
      {OUTLINE.map((shape, i) =>
        shape.type === "path" ? (
          <path key={i} d={shape.d} fill="var(--wf-slate-100)" stroke="var(--wf-slate-300)" strokeWidth={2} strokeLinejoin="round" />
        ) : null,
      )}
      {INJECTION_SITES.filter((key) => SITE_FACE[key] === face).flatMap((key) =>
        SIDES.map(({ key: s }) => {
          const p = SPOT_POINTS[key][s];
          const isOn = key === site && (side === null || side === s);
          return (
            <circle
              key={`${key}-${s}`}
              cx={p.cx}
              cy={p.cy}
              r={isOn ? ON_R : OFF_R}
              fill={isOn ? ON : OFF}
              stroke="var(--wf-surface)"
              strokeWidth={1.5}
            />
          );
        }),
      )}
    </svg>
  );
}
