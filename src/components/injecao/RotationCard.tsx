import { useId, useState, type CSSProperties } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { FACE_LABEL, type BodyFace, type RotationCallouts } from "../../lib/rotation";
import { SegmentedControl } from "../SegmentedControl";
import type { Shape } from "./bodySilhouette";
import {
  BACK_DETAILS,
  FACE_SIDE_ORDER,
  CARD_VIEW,
  CARD_VIEWBOX,
  FRONT_DETAILS,
  OUTLINE,
  rotationFace,
  type CardMarker,
} from "./bodyViews";
import "./Rotation.css";

const FACES: readonly BodyFace[] = ["frente", "costas"];
const SIDE_LETTER = { esquerdo: "E", direito: "D" } as const;
/** Coluna vazia entre a figura e as legendas (px = unidades do desenho). */
const LEADER_GAP = 8;
const HALO = 6;
const SPARKLE = 11;

function Detail({ shape }: { shape: Shape }) {
  if (shape.type === "path") return <path className="rot-detail" d={shape.d} opacity={shape.opacity} />;
  if (shape.type === "circle") return <circle className="rot-detail-dot" cx={shape.cx} cy={shape.cy} r={shape.r} />;
  return <ellipse className="rot-detail" cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} opacity={shape.opacity} />;
}

/** Marcador de um ponto: livre (tracejado), recente, última (anel com halo) ou sugestão (verde com ✦). */
function Marker({ m }: { m: CardMarker }) {
  const shape = { cx: m.cx, cy: m.cy, rx: m.rx, ry: m.ry };
  if (m.kind === "sugestao")
    return (
      <g className="rot-mark is-sugestao">
        <ellipse className="rot-mark-halo" {...shape} rx={m.rx + HALO} ry={m.ry + HALO} />
        <ellipse className="rot-mark-shape" {...shape} />
        <Sparkles
          x={m.cx - SPARKLE / 2}
          y={m.cy - SPARKLE / 2}
          width={SPARKLE}
          height={SPARKLE}
          strokeWidth={2.4}
          className="rot-mark-icon"
          aria-hidden="true"
        />
      </g>
    );
  if (m.kind === "ultima")
    return (
      <g className="rot-mark is-ultima">
        <ellipse className="rot-mark-halo" {...shape} rx={m.rx + HALO} ry={m.ry + HALO} />
        <ellipse className="rot-mark-shape" {...shape} />
        <circle className="rot-mark-core" cx={m.cx} cy={m.cy} r={Math.min(m.rx, m.ry) * 0.36} />
      </g>
    );
  return (
    <g className={`rot-mark is-${m.kind}`}>
      <ellipse className="rot-mark-shape" {...shape} />
    </g>
  );
}

const LEGEND = [
  { kind: "ultima", label: "Última" },
  { kind: "recente", label: "Recente" },
  { kind: "livre", label: "Livre" },
  { kind: "sugestao", label: "Sugestão" },
] as const;

/**
 * "Rodízio de locais" (conceito 10): a figura com as últimas aplicações por cor (última, recente,
 * livre), a sugestão do próximo ponto e legendas ao lado. Só leitura: sugere, nunca bloqueia; a escolha
 * do local fica na folha de confirmação. O desenho é uma imagem com o texto alternativo completo.
 */
export function RotationCard({ view }: { view: RotationCallouts }) {
  const [face, setFace] = useState<BodyFace>("frente");
  const titleId = useId();
  const layout = rotationFace(face, view);
  const [leftSide, rightSide] = FACE_SIDE_ORDER[face];
  const right = CARD_VIEW.x + CARD_VIEW.width + LEADER_GAP - 1;
  const subtitle = view.count === 1 ? "Última aplicação" : `Últimas ${view.count} aplicações`;
  return (
    <section className="card inj-card rot-card" data-testid="rotation-card" aria-labelledby={titleId}>
      <div className="rot-card-head">
        <span className="rot-card-tile" aria-hidden="true">
          <MapPin size={22} />
        </span>
        <div className="rot-card-titles">
          <h2 id={titleId}>Rodízio de locais</h2>
          <p>{subtitle}</p>
        </div>
        <SegmentedControl
          label="Face do corpo no mapa"
          size="sm"
          value={face}
          onChange={setFace}
          segments={FACES.map((f) => ({ value: f, label: FACE_LABEL[f] }))}
        />
      </div>
      <div className="rot-stage" role="img" aria-label={view.aria} style={{ "--leader-gap": `${LEADER_GAP}px` } as CSSProperties}>
        <div className="rot-stage-left">
          {layout.suggestion && (
            <span className="rot-suggest-box" style={{ top: `${layout.suggestion.labelY}px` }}>
              <span className="rot-suggest-kicker">
                <Sparkles size={14} aria-hidden="true" />
                Sugestão
              </span>
              <strong>{view.suggestedLabel}</strong>
            </span>
          )}
        </div>
        <div className="rot-stage-figure">
          <svg viewBox={CARD_VIEWBOX} aria-hidden="true" focusable="false">
            {OUTLINE.map((shape, i) =>
              shape.type === "path" ? <path key={i} className="rot-outline" d={shape.d} /> : null,
            )}
            {(face === "frente" ? FRONT_DETAILS : BACK_DETAILS).map((shape, i) => (
              <Detail key={i} shape={shape} />
            ))}
            {layout.markers.map((m) => (
              <Marker key={m.key} m={m} />
            ))}
            {layout.callouts.map((c) => (
              <g key={`${c.callout.site}-${c.callout.side ?? "x"}`} className="rot-leader">
                <line x1={c.x + 1} y1={c.y} x2={right} y2={c.labelY + CARD_VIEW.y - 8} />
                <circle cx={c.x + 1} cy={c.y} r={1.6} />
              </g>
            ))}
            {layout.suggestion && (
              <line
                className="rot-leader is-suggest"
                x1={CARD_VIEW.x}
                y1={layout.suggestion.labelY + CARD_VIEW.y}
                x2={layout.suggestion.x - 2}
                y2={layout.suggestion.y}
              />
            )}
          </svg>
          <span className="rot-foot is-left" aria-hidden="true">
            {SIDE_LETTER[leftSide]}
          </span>
          <span className="rot-foot is-right" aria-hidden="true">
            {SIDE_LETTER[rightSide]}
          </span>
        </div>
        <div className="rot-stage-right">
          {layout.callouts.map((c) => (
            <span
              key={`${c.callout.site}-${c.callout.side ?? "x"}`}
              className={`rot-callout is-${c.callout.status}`}
              style={{ top: `${c.labelY}px` }}
            >
              <strong>{c.callout.label}</strong>
              <small>{c.callout.detail}</small>
            </span>
          ))}
        </div>
      </div>
      <ul className="rot-legend" aria-hidden="true">
        {LEGEND.map((item) => (
          <li key={item.kind}>
            <span className={`rot-legend-dot is-${item.kind}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
