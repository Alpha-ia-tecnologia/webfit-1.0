import Svg, { Line, Rect } from "react-native-svg";
import type { InjectionMethod } from "@shared/types";
import { ART_TONE, useArtColors } from "./art-colors";

const TONE = ART_TONE.medication;
const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

/** Frasco com a seringa de insulina ao lado. */
function VialArt() {
  const art = useArtColors();
  return (
    <>
      <Rect x={10} y={7} width={12} height={7} rx={2} fill={art.artLine} />
      <Rect x={8} y={14} width={16} height={27} rx={3} fill={TONE.bg} stroke={TONE.fg} strokeWidth={1.5} />
      <Rect x={10} y={27} width={12} height={12} rx={2} fill={TONE.border} />
      <Rect x={29} y={3} width={10} height={2.5} rx={1} fill={art.artMuted} />
      <Rect x={33} y={5} width={2} height={8} fill={art.artLine} />
      <Rect x={30} y={13} width={8} height={24} rx={2} fill={art.artPaper} stroke={art.artMuted} strokeWidth={1.2} />
      <Rect x={31} y={26} width={6} height={10} rx={1} fill={TONE.fg} opacity={0.55} />
      <Line x1={34} x2={34} y1={37} y2={45} stroke={art.artMuted} strokeWidth={1.2} strokeLinecap="round" />
    </>
  );
}

/** Caneta com seletor: corpo, janela da dose e o botão de girar. */
function PenArt() {
  const art = useArtColors();
  return (
    <>
      <Rect x={3} y={21} width={6} height={6} rx={1.5} fill={art.artMuted} />
      <Rect x={7} y={18} width={32} height={12} rx={6} fill={TONE.bg} stroke={TONE.fg} strokeWidth={1.5} />
      <Rect x={21} y={20.5} width={10} height={7} rx={1.5} fill={art.artPaper} stroke={TONE.fg} strokeWidth={1.2} />
      <Line x1={24} x2={28} y1={24} y2={24} stroke={TONE.fg} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={38} y={19} width={7} height={10} rx={2.5} fill={art.artLine} />
      <Line x1={40.5} x2={40.5} y1={21} y2={27} stroke={art.artMuted} strokeWidth={1} />
      <Line x1={42.5} x2={42.5} y1={21} y2={27} stroke={art.artMuted} strokeWidth={1} />
    </>
  );
}

/** Caneta de dose única (autoinjetor): botão no topo, janela e tampa. */
function AutoInjectorArt() {
  const art = useArtColors();
  return (
    <>
      <Rect x={20} y={2} width={8} height={5} rx={2} fill={TONE.fg} />
      <Rect x={16} y={6} width={16} height={33} rx={7} fill={TONE.bg} stroke={TONE.fg} strokeWidth={1.5} />
      <Rect x={20} y={16} width={8} height={11} rx={2} fill={art.artPaper} stroke={TONE.border} strokeWidth={1.2} />
      <Rect x={21.5} y={22} width={5} height={4} rx={1} fill={TONE.fg} opacity={0.55} />
      <Rect x={18} y={38} width={12} height={7} rx={2} fill={art.artLine} />
    </>
  );
}

/** Desenho de 48 × 48 de cada modo de aplicação (tons da medicação e cinzas claros; nunca círculos cinza-escuros). */
export function MethodArt({ method, size = 48 }: { method: InjectionMethod; size?: number }) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size} {...HIDDEN}>
      {method === "frasco" ? <VialArt /> : method === "caneta" ? <PenArt /> : <AutoInjectorArt />}
    </Svg>
  );
}
