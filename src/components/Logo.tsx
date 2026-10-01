/**
 * Marca WebFit recriada em SVG a partir do logotipo oficial:
 * três barras esmeralda inclinadas, duas barras azuis e o selo circular.
 * As cores vêm dos tokens da marca (--wf-emerald / --wf-blue) com fallback.
 */
export function LogoMark({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 118 100"
      width={size}
      height={Math.round(size * (100 / 118))}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <g fill="var(--wf-emerald, #00d084)">
        <rect
          x="9"
          y="22"
          width="14"
          height="60"
          rx="7"
          transform="rotate(22 16 52)"
        />
        <rect
          x="29"
          y="22"
          width="14"
          height="60"
          rx="7"
          transform="rotate(22 36 52)"
        />
        <rect
          x="49"
          y="22"
          width="14"
          height="60"
          rx="7"
          transform="rotate(22 56 52)"
        />
      </g>
      <g fill="var(--wf-blue, #00a3ff)" transform="skewX(-22)">
        <rect x="88" y="14" width="32" height="12" rx="6" />
        <rect x="88" y="33" width="32" height="12" rx="6" />
      </g>
      <g
        fill="none"
        stroke="var(--wf-emerald, #00d084)"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <circle cx="86" cy="76" r="6.5" />
        <path d="M88.6 73.9a3.1 3.1 0 1 0 0 4.2" strokeWidth="1.7" />
      </g>
    </svg>
  );
}

/** Marca completa: símbolo + wordmark "Web" (esmeralda) e "Fit" (azul). */
export function Logo({
  size = 36,
  wordmark = true,
}: {
  size?: number;
  wordmark?: boolean;
}) {
  return (
    <span className="brand" role="img" aria-label="WebFit">
      <LogoMark size={size} />
      {wordmark && (
        <span className="brand-word" aria-hidden="true">
          Web<span>Fit</span>
        </span>
      )}
    </span>
  );
}
