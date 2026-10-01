import type { CSSProperties } from "react";

const PIECES = 14;

/** Explosão discreta de confetes em CSS quando o perfil chega a 100%. */
export function Celebration({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  if (!active || reducedMotion) return null;
  return (
    <div className="anamnese-confetti" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => (
        <span key={i} style={{ "--i": i } as CSSProperties} />
      ))}
    </div>
  );
}
