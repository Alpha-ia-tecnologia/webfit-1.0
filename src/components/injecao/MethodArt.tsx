import type { JSX } from "react";
import type { InjectionMethod } from "../../types";

const FG = "var(--wf-tone-medication-fg)";
const BG = "var(--wf-tone-medication-bg)";
const LINE = "var(--wf-art-muted)";
const SOFT = "var(--wf-art-line)";

/** Frasco com tampa e uma seringa de insulina ao lado. */
function VialArt() {
  return (
    <>
      <rect x="6" y="14" width="16" height="26" rx="4" fill={BG} stroke={FG} strokeWidth="2" />
      <rect x="8" y="8" width="12" height="7" rx="2" fill={FG} />
      <rect x="9" y="26" width="10" height="11" rx="2" fill={FG} opacity="0.35" />
      <g transform="rotate(-35 34 26)">
        <rect x="30" y="8" width="8" height="28" rx="2" fill="var(--wf-art-paper)" stroke={LINE} strokeWidth="1.8" />
        <rect x="31.5" y="22" width="5" height="12.5" fill={FG} opacity="0.55" />
        <line x1="34" x2="34" y1="2" y2="8" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
        <rect x="31" y="36" width="6" height="6" rx="1" fill={SOFT} />
        <rect x="28" y="42" width="12" height="3" rx="1.5" fill={LINE} />
      </g>
    </>
  );
}

/** Caneta com seletor: corpo longo, janela da dose e o botão giratório. */
function PenArt() {
  return (
    <g transform="rotate(-35 24 24)">
      <rect x="4" y="19" width="34" height="10" rx="5" fill={BG} stroke={FG} strokeWidth="2" />
      <rect x="20" y="21.5" width="9" height="5" rx="1.5" fill="var(--wf-art-paper)" stroke={FG} strokeWidth="1.4" />
      <rect x="38" y="20" width="6" height="8" rx="2" fill={FG} />
      <rect x="1" y="21" width="4" height="6" rx="1" fill={SOFT} stroke={LINE} strokeWidth="1" />
      <line x1="10" x2="10" y1="21" y2="27" stroke={LINE} strokeWidth="1.2" />
      <line x1="13" x2="13" y1="21" y2="27" stroke={LINE} strokeWidth="1.2" />
    </g>
  );
}

/** Caneta de dose única (autoinjetor): corpo largo, visor e a base de acionamento. */
function SingleDoseArt() {
  return (
    <g transform="rotate(-35 24 24)">
      <rect x="6" y="16" width="30" height="16" rx="8" fill={BG} stroke={FG} strokeWidth="2" />
      <rect x="15" y="20.5" width="10" height="7" rx="3.5" fill="var(--wf-art-paper)" stroke={FG} strokeWidth="1.4" />
      <rect x="36" y="18" width="7" height="12" rx="3" fill={FG} />
      <rect x="2" y="19" width="5" height="10" rx="2" fill={SOFT} stroke={LINE} strokeWidth="1" />
    </g>
  );
}

const ARTS: Record<InjectionMethod, () => JSX.Element> = {
  frasco: VialArt,
  caneta: PenArt,
  dose_unica: SingleDoseArt,
};

/** Ilustração 48×48 de cada modo de aplicação (SERINGA-08), no tom da medicação. */
export function MethodArt({ method, className = "inj-method-art" }: { method: InjectionMethod; className?: string }) {
  const Art = ARTS[method];
  return (
    <svg className={className} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
