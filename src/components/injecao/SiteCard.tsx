import { useId } from "react";
import {
  SIDES,
  SITES,
  daysAgoLabel,
  spotLabel,
  type InjectionSummary,
} from "../../lib/injection";
import type { RotationModel } from "../../lib/rotation";
import type { InjectionSide, InjectionSite } from "../../types";
import { useRadioKeys } from "../useRadioKeys";
import { RotationMap } from "./RotationMap";
import "./Rotation.css";

type PickerProps = {
  site: InjectionSite;
  suggested: InjectionSite;
  onPick: (site: InjectionSite) => void;
  className?: string;
};
const SITE_KEYS = SITES.map((s) => s.key);
const SIDE_KEYS = SIDES.map((s) => s.key);

/** Radiogroup "Local de aplicação", com a etiqueta "Sugerido" no próximo do rodízio. */
export function SitePicker({ site, suggested, onPick, className = "inj-sites" }: PickerProps) {
  const keys = useRadioKeys(SITE_KEYS, site, onPick);
  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas
    <div className={className} role="radiogroup" aria-label="Local de aplicação" onKeyDown={keys.onKeyDown}>
      {SITES.map((s) => {
        const isOn = s.key === site;
        return (
          <button key={s.key} type="button" role="radio" aria-checked={isOn} aria-label={s.label}
            tabIndex={keys.tabIndex(s.key)} className={isOn ? "on" : ""} onClick={() => onPick(s.key)}>
            <strong>{s.label}</strong>
            {s.key === suggested && <span className="inj-tag suggested">Sugerido</span>}
          </button>
        );
      })}
    </div>
  );
}

type SideProps = {
  side: InjectionSide | null;
  /** Lado sugerido no local escolhido; null sem lado conhecido nesse local. */
  suggested: InjectionSide | null;
  onPick: (side: InjectionSide) => void;
  className?: string;
};

/**
 * Radiogroup "Lado do corpo" (sempre o lado da pessoa). Sem lado escolhido (registros antigos),
 * o primeiro botão recebe a parada de Tab. Sugere, nunca bloqueia.
 */
export function SidePicker({ side, suggested, onPick, className = "" }: SideProps) {
  const labelId = useId();
  const keys = useRadioKeys(SIDE_KEYS, side, onPick);
  return (
    <div className={`inj-side-field ${className}`}>
      <span id={labelId} className="inj-side-label">
        Lado do corpo
      </span>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tabindex móvel (useRadioKeys): o foco fica nos rádios; o grupo só recebe as setas */}
      <div className="inj-sides" role="radiogroup" aria-labelledby={labelId} onKeyDown={keys.onKeyDown}>
        {SIDES.map((s) => {
          const isOn = s.key === side;
          return (
            <button key={s.key} type="button" role="radio" aria-checked={isOn} aria-label={s.label}
              tabIndex={keys.tabIndex(s.key)} className={isOn ? "on" : ""} onClick={() => onPick(s.key)}>
              <strong>{s.label}</strong>
              {s.key === suggested && <span className="inj-tag suggested">Sugerido</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  site: InjectionSite;
  side: InjectionSide | null;
  summary: InjectionSummary;
  rotation: RotationModel;
  /** Lado sugerido no local escolhido agora (muda quando a pessoa troca o local). */
  suggestedSide: InjectionSide | null;
  onSite: (site: InjectionSite) => void;
  onSide: (side: InjectionSide) => void;
};

/** Local (SERINGA-04): mapa de rodízio (resumo visual) ao lado dos botões de local e lado, nos dois métodos. */
export function SiteCard({ site, side, summary, rotation, suggestedSide, onSite, onSide }: Props) {
  const hint = summary.last
    ? `Última aplicação ${daysAgoLabel(summary.daysSinceLast)} · ${spotLabel(summary.last.site, summary.last.side ?? null)}.`
    : "Ainda não há aplicações registradas.";
  return (
    <section className="card inj-card inj-site-card" aria-labelledby="inj-site-title">
      <h2 id="inj-site-title">Local</h2>
      <div className="rot-layout">
        <RotationMap site={site} side={side} model={rotation} />
        <div className="rot-controls">
          <SitePicker site={site} suggested={summary.suggestedSite} onPick={onSite} />
          <SidePicker side={side} suggested={suggestedSide} onPick={onSide} />
        </div>
      </div>
      <p className="hint">{hint}</p>
    </section>
  );
}
