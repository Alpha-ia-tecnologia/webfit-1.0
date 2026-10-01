import type { ReactNode } from "react";
import { measureIconKey, type MeasureIconKey, type PortionUnit } from "../../lib/household-measures";

/** Traços de cada medida caseira, num quadro de 24 × 24 (mesmo estilo dos ícones do lucide). */
const SHAPES: Record<MeasureIconKey, ReactNode> = {
  spoon: (
    <>
      <ellipse cx="7.5" cy="16.5" rx="3.6" ry="4.6" transform="rotate(45 7.5 16.5)" />
      <path d="M10.4 13.6 20 4" />
    </>
  ),
  teaspoon: (
    <>
      <ellipse cx="8" cy="16" rx="2.6" ry="3.4" transform="rotate(45 8 16)" />
      <path d="M10.2 13.8 19 5" />
    </>
  ),
  skimmer: (
    <>
      <circle cx="8" cy="16" r="5" />
      <path d="M11.6 12.4 20 4" />
      <path d="M6.5 14.5h.01M9.5 14.5h.01M6.5 17.5h.01M9.5 17.5h.01" strokeWidth="2.4" />
    </>
  ),
  ladle: (
    <>
      <path d="M3 12h11a5.5 5.5 0 0 1-11 0Z" />
      <path d="M14 12V6a2.5 2.5 0 0 1 5 0v1" />
    </>
  ),
  cup: (
    <>
      <path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M3 21h15" />
    </>
  ),
  glass: (
    <>
      <path d="M6 3h12l-1.6 17.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8Z" />
      <path d="M6.7 10h10.6" />
    </>
  ),
  unit: <path d="M12 3c3.9 0 7 5.2 7 10a7 7 0 0 1-14 0c0-4.8 3.1-10 7-10Z" />,
  slice: <path d="M5 21V10.5A4.5 4.5 0 0 1 7.5 3h9A4.5 4.5 0 0 1 19 10.5V21Z" />,
  pot: (
    <>
      <path d="M5 9h14v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M3 9h18M9 5h6" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10.7 10.7 5 19 5c0 8.3-5.7 14-14 14Z" />
      <path d="m5 19 8-8" />
    </>
  ),
  piece: <path d="M4 12.5C4 8 7.8 5 12.8 5 17.6 5 20 7.6 20 11c0 4.6-3.6 8-8.6 8C7 19 4 16.3 4 12.5Z" />,
  scale: (
    <>
      <path d="m16 16 3-8 3 8c-.9.6-1.9 1-3 1s-2.1-.4-3-1Z" />
      <path d="m2 16 3-8 3 8c-.9.6-1.9 1-3 1s-2.1-.4-3-1Z" />
      <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </>
  ),
};

/**
 * Desenho da medida caseira (colher de sopa, escumadeira, concha…) ao lado da porção. Decorativo:
 * o texto ao lado já diz a medida ("4 colheres de sopa").
 */
export function MeasureIcon({
  unit,
  size = 16,
  className,
}: {
  unit: PortionUnit;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={["measure-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[measureIconKey(unit)]}
    </svg>
  );
}
