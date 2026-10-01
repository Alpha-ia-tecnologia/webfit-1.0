import { waterGlasses, waterSpoken } from "../../lib/diary-day";

/**
 * A água do dia em copos (conceito 03): a meta dividida em 10 copos; sem meta, copos de 250 ml.
 * Só exibição (o "+ 250 ml" ao lado registra). Acima da meta todos ficam cheios, sem alerta.
 */
export function WaterGlasses({ totalMl, goalMl }: { totalMl: number; goalMl: number | null }) {
  const { filled, total } = waterGlasses(totalMl, goalMl);
  return (
    <span
      className="diary-water-glasses"
      role="img"
      aria-label={`${filled} de ${total} copos, ${waterSpoken(totalMl, goalMl)}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < filled ? "is-full" : undefined} />
      ))}
    </span>
  );
}
