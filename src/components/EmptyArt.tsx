import type { ReactNode } from "react";

/**
 * Ilustrações dos estados vazios (SIS-06): dez desenhos duotone em SVG, na cor do domínio.
 * As cores vêm de --art-bg, --art-fill e --art-ink (classe .empty-art.tone-*), sem imagens externas.
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

const TONE: Record<EmptyArtKind, string> = {
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

const INK = { stroke: "var(--art-ink)", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
const FILL = { fill: "var(--art-fill)" } as const;

const DRAWINGS: Record<EmptyArtKind, ReactNode> = {
  meals: (
    <>
      <circle cx="48" cy="50" r="24" {...FILL} />
      <circle cx="48" cy="50" r="15" {...INK} />
      <path d="M18 30v14m-4-14v9a4 4 0 0 0 8 0v-9M18 48v18" {...INK} />
      <path d="M78 30c-4 3-5 9-5 15h5v21" {...INK} />
    </>
  ),
  diary: (
    <>
      <rect x="28" y="22" width="40" height="52" rx="6" {...FILL} />
      <rect x="28" y="22" width="40" height="52" rx="6" {...INK} />
      <path d="M38 22v52M45 36h14M45 45h14M45 54h9" {...INK} />
      <path d="M58 22v14l4-3 4 3V22" {...INK} />
    </>
  ),
  habits: (
    <>
      <path d="M32 58h32l-4 18H36z" {...FILL} />
      <path d="M32 58h32l-4 18H36z" {...INK} />
      <path d="M48 58V38" {...INK} />
      <path d="M48 44c-10 0-15-6-15-14 9 0 15 5 15 14zM48 40c0-9 6-15 15-15 0 9-6 15-15 15z" {...FILL} />
      <path d="M48 44c-10 0-15-6-15-14 9 0 15 5 15 14zM48 40c0-9 6-15 15-15 0 9-6 15-15 15z" {...INK} />
    </>
  ),
  exams: (
    <>
      <rect x="28" y="24" width="40" height="52" rx="6" {...FILL} />
      <rect x="28" y="24" width="40" height="52" rx="6" {...INK} />
      <rect x="38" y="18" width="20" height="10" rx="4" {...INK} />
      <path d="M37 42h22M37 51h22M37 60h12" {...INK} />
      <path d="M53 62l4 4 8-9" {...INK} />
    </>
  ),
  calendar: (
    <>
      <rect x="24" y="28" width="48" height="44" rx="7" {...FILL} />
      <rect x="24" y="28" width="48" height="44" rx="7" {...INK} />
      <path d="M24 40h48M36 22v10M60 22v10" {...INK} />
      <circle cx="37" cy="52" r="2.5" fill="var(--art-ink)" />
      <circle cx="48" cy="52" r="2.5" fill="var(--art-ink)" />
      <circle cx="59" cy="61" r="5" {...INK} />
      <circle cx="37" cy="62" r="2.5" fill="var(--art-ink)" />
    </>
  ),
  pantry: (
    <>
      <path d="M32 34h32v36a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6z" {...FILL} />
      <path d="M32 34h32v36a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6z" {...INK} />
      <rect x="30" y="22" width="36" height="12" rx="4" {...INK} />
      <path d="M32 48h32M32 62h32" {...INK} />
      <circle cx="42" cy="55" r="2.5" fill="var(--art-ink)" />
      <circle cx="52" cy="55" r="2.5" fill="var(--art-ink)" />
    </>
  ),
  search: (
    <>
      <circle cx="44" cy="44" r="18" {...FILL} />
      <circle cx="44" cy="44" r="18" {...INK} />
      <path d="M57 57l14 14" {...INK} strokeWidth={5} />
      <path d="M37 40a8 8 0 0 1 7-6" {...INK} />
      <path d="M72 24v8m-4-4h8" {...INK} />
    </>
  ),
  notifications: (
    <>
      <path d="M30 62h36l-4-6V44a14 14 0 0 0-28 0v12z" {...FILL} />
      <path d="M30 62h36l-4-6V44a14 14 0 0 0-28 0v12z" {...INK} />
      <path d="M42 68a6 6 0 0 0 12 0M48 24v6" {...INK} />
      <path d="M70 26l6-3M72 36h6" {...INK} />
    </>
  ),
  water: (
    <>
      <path d="M30 26h36l-5 46a4 4 0 0 1-4 4H39a4 4 0 0 1-4-4z" {...FILL} />
      <path d="M33 48c5-3 10 3 15 0s10-3 15 0" {...INK} />
      <path d="M30 26h36l-5 46a4 4 0 0 1-4 4H39a4 4 0 0 1-4-4z" {...INK} />
    </>
  ),
  weight: (
    <>
      <rect x="24" y="26" width="48" height="48" rx="12" {...FILL} />
      <rect x="24" y="26" width="48" height="48" rx="12" {...INK} />
      <path d="M36 44a12 12 0 0 1 24 0" {...INK} />
      <path d="M48 44l5-6" {...INK} />
    </>
  ),
};

export function EmptyArt({ kind }: { kind: EmptyArtKind }) {
  return (
    <svg className={`empty-art tone-${TONE[kind]}`} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="44" fill="var(--art-bg)" />
      {DRAWINGS[kind]}
    </svg>
  );
}
