import "./States.css";

/**
 * Kit de esqueletos (SIS-06): cartão, linhas e gráfico com o mesmo brilho. São decorativos; quem os usa
 * anuncia o carregamento num role="status" próprio.
 */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton-block skeleton-icon" />
          <span className="skeleton-lines">
            <i className="skeleton-block" />
            <i className="skeleton-block" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ bars = 7 }: { bars?: number }) {
  return (
    <div className="skeleton-chart" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <span key={index} className="skeleton-block" style={{ height: `${35 + ((index * 37) % 55)}%` }} />
      ))}
    </div>
  );
}

/** Cartão genérico: título, um número grande e linhas. */
export function SkeletonCard({ rows = 2, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <span className="skeleton-block skeleton-title" />
      <span className="skeleton-block skeleton-hero" />
      {chart ? <SkeletonChart /> : <SkeletonRows rows={rows} />}
    </div>
  );
}
