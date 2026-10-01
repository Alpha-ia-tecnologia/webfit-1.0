import type { InsightChip } from "../../lib/progress-insights";
import "./Insights.css";

/**
 * Destaques calculados em chips neutros (EVOL-06): o texto curto fica visível e a leitura completa
 * vai para o leitor de tela. Acima da meta não muda de cor. Sem chips, nada é desenhado.
 */
export function InsightChips({ chips, label }: { chips: readonly InsightChip[]; label: string }) {
  if (!chips.length) return null;
  return (
    <ul className="insight-chips" aria-label={label}>
      {chips.map((chip) => (
        <li key={chip.key} className={`insight-chip tone-${chip.tone}`}>
          <span aria-hidden="true">{chip.text}</span>
          <span className="sr-only">{chip.aria}</span>
        </li>
      ))}
    </ul>
  );
}
