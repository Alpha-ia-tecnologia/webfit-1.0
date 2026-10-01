import { useState } from "react";
import { Syringe } from "lucide-react";
import { relativeHeights } from "../../lib/charts";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { fmtDayMonth } from "../../lib/format";
import { fmtMg } from "../../lib/injection";
import { treatmentModel } from "../../lib/treatment";
import { stockModel } from "../../lib/treatment-stock";
import { StockSummary } from "../injecao/Stock";
import { StockSheet, type StockSheetMode } from "../injecao/StockSheet";
import { Modal } from "../UI";

/**
 * Meu tratamento (ESPACO-X3): medicação, frequência, modo de aplicação, a próxima dose estimada
 * (quando acompanhada), os degraus de dose já registrados e o estoque informado (SERINGA-12).
 * Sem peso nem kcal.
 */
export function TreatmentCard({ variant = "card" }: { variant?: "card" | "sheet" }) {
  const { state, openInjection } = useApp();
  const [stockSheet, setStockSheet] = useState<StockSheetMode | null>(null);
  const p = state.profile!;
  const today = localDate();
  const model = treatmentModel(p, state.injections, today);
  const stock = state.treatmentStock ? stockModel(state.treatmentStock, state.injections, p, today) : null;
  const heights = relativeHeights(model.steps.map((s) => s.doseMg));
  const summary = [model.medication, model.interval, model.method].filter(Boolean).join(" · ");
  const isSheet = variant === "sheet";
  return (
    <section
      className={isSheet ? "treatment-card is-sheet" : "card treatment-card"}
      data-testid="treatment-card"
      aria-labelledby={isSheet ? undefined : "treatment-title"}
    >
      <div className="treatment-head">
        <span className="treatment-icon" aria-hidden="true">
          <Syringe size={20} />
        </span>
        <div>
          {!isSheet && <h2 id="treatment-title">Meu tratamento</h2>}
          <p className="treatment-summary">{summary}</p>
        </div>
      </div>
      {model.nextLine && <p className="treatment-next">{model.nextLine}</p>}
      <h3>Degraus de dose</h3>
      {model.steps.length ? (
        <div className="dose-steps" role="img" aria-label={model.stepsAria} data-testid="dose-steps">
          {model.steps.map((step, i) => (
            <div key={`${step.from}-${i}`} className="dose-step">
              <strong>{fmtMg(step.doseMg)}</strong>
              <span className="dose-step-track">
                <span className="dose-step-bar" style={{ height: `${heights[i]}%` }} />
              </span>
              <small>
                desde {fmtDayMonth(step.from)} · {step.count}×
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">Seus degraus aparecem depois do primeiro registro.</p>
      )}
      <h3>Estoque</h3>
      {stock ? (
        <StockSummary model={stock} onEdit={() => setStockSheet("edit")} onNew={() => setStockSheet("new")} />
      ) : (
        <button type="button" className="link-btn stock-open" onClick={() => setStockSheet("create")}>
          Informar estoque do frasco ou caneta
        </button>
      )}
      <button type="button" className="link-btn treatment-open" onClick={() => openInjection(null)}>
        Abrir Seringa e dose
      </button>
      {stockSheet && <StockSheet mode={stockSheet} onClose={() => setStockSheet(null)} />}
    </section>
  );
}

/** "Meu tratamento" numa folha, aberta pela linha Medicação do mosaico do perfil de saúde. */
export function TreatmentSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Meu tratamento" onClose={onClose} className="treatment-sheet">
      <TreatmentCard variant="sheet" />
    </Modal>
  );
}
