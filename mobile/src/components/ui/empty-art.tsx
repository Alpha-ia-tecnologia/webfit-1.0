import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { themeDomainTone, type Domain } from "@/theme/tokens";

/**
 * Ilustrações dos estados vazios (SIS-06): os dez desenhos duotone do web (src/components/EmptyArt.tsx),
 * com os mesmos caminhos, na cor do domínio (fundo, preenchimento claro e traço).
 */
export type EmptyArtKind =
  | "meals"
  | "diary"
  | "habits"
  | "exams"
  | "calendar"
  | "pantry"
  | "search"
  | "notifications"
  | "water"
  | "weight";

const TONE: Record<EmptyArtKind, Domain> = {
  meals: "food",
  diary: "food",
  habits: "habit",
  exams: "body",
  calendar: "medication",
  pantry: "attention",
  search: "water",
  notifications: "mind",
  water: "water",
  weight: "body",
};

const SIZE = 88;

type Ink = { stroke: string; strokeWidth: number; strokeLinecap: "round"; strokeLinejoin: "round"; fill: "none" };
type Paint = { ink: Ink; fill: { fill: string }; dot: string };

const DRAWINGS: Record<EmptyArtKind, (p: Paint) => ReactNode> = {
  meals: ({ ink, fill }) => (
    <>
      <Circle cx={48} cy={50} r={24} {...fill} />
      <Circle cx={48} cy={50} r={15} {...ink} />
      <Path d="M18 30v14m-4-14v9a4 4 0 0 0 8 0v-9M18 48v18" {...ink} />
      <Path d="M78 30c-4 3-5 9-5 15h5v21" {...ink} />
    </>
  ),
  diary: ({ ink, fill }) => (
    <>
      <Rect x={28} y={22} width={40} height={52} rx={6} {...fill} />
      <Rect x={28} y={22} width={40} height={52} rx={6} {...ink} />
      <Path d="M38 22v52M45 36h14M45 45h14M45 54h9" {...ink} />
      <Path d="M58 22v14l4-3 4 3V22" {...ink} />
    </>
  ),
  habits: ({ ink, fill }) => (
    <>
      <Path d="M32 58h32l-4 18H36z" {...fill} />
      <Path d="M32 58h32l-4 18H36z" {...ink} />
      <Path d="M48 58V38" {...ink} />
      <Path d="M48 44c-10 0-15-6-15-14 9 0 15 5 15 14zM48 40c0-9 6-15 15-15 0 9-6 15-15 15z" {...fill} />
      <Path d="M48 44c-10 0-15-6-15-14 9 0 15 5 15 14zM48 40c0-9 6-15 15-15 0 9-6 15-15 15z" {...ink} />
    </>
  ),
  exams: ({ ink, fill }) => (
    <>
      <Rect x={28} y={24} width={40} height={52} rx={6} {...fill} />
      <Rect x={28} y={24} width={40} height={52} rx={6} {...ink} />
      <Rect x={38} y={18} width={20} height={10} rx={4} {...ink} />
      <Path d="M37 42h22M37 51h22M37 60h12" {...ink} />
      <Path d="M53 62l4 4 8-9" {...ink} />
    </>
  ),
  calendar: ({ ink, fill, dot }) => (
    <>
      <Rect x={24} y={28} width={48} height={44} rx={7} {...fill} />
      <Rect x={24} y={28} width={48} height={44} rx={7} {...ink} />
      <Path d="M24 40h48M36 22v10M60 22v10" {...ink} />
      <Circle cx={37} cy={52} r={2.5} fill={dot} />
      <Circle cx={48} cy={52} r={2.5} fill={dot} />
      <Circle cx={59} cy={61} r={5} {...ink} />
      <Circle cx={37} cy={62} r={2.5} fill={dot} />
    </>
  ),
  pantry: ({ ink, fill, dot }) => (
    <>
      <Path d="M32 34h32v36a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6z" {...fill} />
      <Path d="M32 34h32v36a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6z" {...ink} />
      <Rect x={30} y={22} width={36} height={12} rx={4} {...ink} />
      <Path d="M32 48h32M32 62h32" {...ink} />
      <Circle cx={42} cy={55} r={2.5} fill={dot} />
      <Circle cx={52} cy={55} r={2.5} fill={dot} />
    </>
  ),
  search: ({ ink, fill }) => (
    <>
      <Circle cx={44} cy={44} r={18} {...fill} />
      <Circle cx={44} cy={44} r={18} {...ink} />
      <Path d="M57 57l14 14" {...ink} strokeWidth={5} />
      <Path d="M37 40a8 8 0 0 1 7-6" {...ink} />
      <Path d="M72 24v8m-4-4h8" {...ink} />
    </>
  ),
  notifications: ({ ink, fill }) => (
    <>
      <Path d="M30 62h36l-4-6V44a14 14 0 0 0-28 0v12z" {...fill} />
      <Path d="M30 62h36l-4-6V44a14 14 0 0 0-28 0v12z" {...ink} />
      <Path d="M42 68a6 6 0 0 0 12 0M48 24v6" {...ink} />
      <Path d="M70 26l6-3M72 36h6" {...ink} />
    </>
  ),
  water: ({ ink, fill }) => (
    <>
      <Path d="M30 26h36l-5 46a4 4 0 0 1-4 4H39a4 4 0 0 1-4-4z" {...fill} />
      <Path d="M33 48c5-3 10 3 15 0s10-3 15 0" {...ink} />
      <Path d="M30 26h36l-5 46a4 4 0 0 1-4 4H39a4 4 0 0 1-4-4z" {...ink} />
    </>
  ),
  weight: ({ ink, fill }) => (
    <>
      <Rect x={24} y={26} width={48} height={48} rx={12} {...fill} />
      <Rect x={24} y={26} width={48} height={48} rx={12} {...ink} />
      <Path d="M36 44a12 12 0 0 1 24 0" {...ink} />
      <Path d="M48 44l5-6" {...ink} />
    </>
  ),
};

/** Desenho de 88 px do estado vazio; decorativo (o texto ao lado já diz o que falta). */
export function EmptyArt({ kind }: { kind: EmptyArtKind }) {
  const tone = themeDomainTone(useTheme().scheme)[TONE[kind]];
  const paint: Paint = {
    ink: { stroke: tone.fg, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" },
    fill: { fill: tone.border },
    dot: tone.fg,
  };
  return (
    <View
      testID={`empty-art-${kind}`}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 96 96">
        <Circle cx={48} cy={48} r={44} fill={tone.bg} />
        {DRAWINGS[kind](paint)}
      </Svg>
    </View>
  );
}
