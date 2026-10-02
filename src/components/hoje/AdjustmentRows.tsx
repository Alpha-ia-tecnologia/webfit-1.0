import { ArrowRight } from "lucide-react";
import type { AdjustmentView } from "../../lib/balance-explain";

/**
 * Ajuste dinâmico do dia em linhas estruturadas: `Meta-base 1.806 → hoje 1.953`, o delta em pílula com o
 * motivo numa linha e, se houver, `Proteína +9 g`. Usado em "Como calculamos" e na folha do chip de ajuste
 * do Hoje; lido em sequência, continua uma frase.
 */
export function AdjustmentRows({ view }: { view: AdjustmentView }) {
  return (
    <div className="balance-adjust" data-testid="balance-adjust">
      {view.calories && (
        <>
          <div className="balance-adjust-row">
            <span className="balance-adjust-label">Meta-base</span>
            <strong>
              {view.calories.base}
              <span className="sr-only"> kcal</span>
            </strong>
            <ArrowRight size={14} aria-hidden="true" />
            <span className="balance-adjust-label">{view.dayLabel}</span>
            <strong>
              {view.calories.target}
              <span className="sr-only"> kcal</span>
            </strong>
          </div>
          <div className="balance-adjust-row">
            <span className="balance-adjust-delta">
              <span aria-hidden="true">{view.calories.direction === "up" ? "↑" : "↓"}</span>
              {view.calories.delta}
            </span>
            <span className="balance-adjust-why">{view.calories.why}</span>
          </div>
        </>
      )}
      {view.protein && (
        <div className="balance-adjust-row">
          <span className="balance-adjust-label">Proteína</span>
          <strong>{view.protein.delta}</strong>
          <span className="balance-adjust-why">{view.protein.why}</span>
        </div>
      )}
    </div>
  );
}
