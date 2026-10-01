import { CalendarClock, CalendarHeart, Ruler, Smile } from "lucide-react";
import { COPY } from "../../lib/copy";
import type { CycleCardModel } from "../../lib/cycle-tips";
import type { SavedSheetModel } from "../../lib/treatment";
import type { StockModel } from "../../lib/treatment-stock";
import type { Spot } from "../../lib/rotation";
import { Modal } from "../UI";
import { CycleTipBlock } from "./CycleTips";
import { SitePictogram } from "./SitePictogram";
import { StockArt, StockNotices } from "./Stock";
import "./Rotation.css";

type Props = {
  model: SavedSheetModel;
  /** Próximo ponto sugerido, desenhado no pictograma ao lado do texto. */
  nextSpot: Spot;
  /** "Para os próximos dias" (SERINGA-11); null fora do acompanhamento semanal. */
  cycle: CycleCardModel | null;
  /** Estoque informado (SERINGA-12), já com esta aplicação; null sem estoque. */
  stock: StockModel | null;
  onDiary: () => void;
  onMood: () => void;
  onMeasures: () => void;
  onUndo: () => void;
  onClose: () => void;
};

/**
 * "Aplicação registrada" (SERINGA-10): confirma o que foi gravado (não é comemoração), a próxima
 * dose estimada só para quem acompanha a frequência e o próximo local sugerido. Nenhuma palavra
 * sobre aumentar, reduzir ou ajustar a dose. "Desfazer" fica aqui, no lugar do aviso.
 */
export function SavedSheet({ model, nextSpot, cycle, stock, onDiary, onMood, onMeasures, onUndo, onClose }: Props) {
  const stockChip = stock ? (stock.dosesChip ?? stock.useByChip) : null;
  return (
    <Modal title="Aplicação registrada" onClose={onClose} className="inj-sheet saved-sheet" overlayClassName="inj-sheet-overlay">
      <div className="saved-head">
        <svg className="saved-check" data-testid="saved-check" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
          <circle cx="28" cy="28" r="28" />
          <path d="M17 29 L25 37 L40 21" />
        </svg>
        <div>
          <p className="saved-lead">{model.lead}</p>
          <p className="muted">{model.when}</p>
        </div>
      </div>
      <ul className="saved-rows">
        {model.nextDose && (
          <li>
            <span className="saved-icon" aria-hidden="true">
              <CalendarClock size={20} />
            </span>
            <span>
              {model.nextDose}
              {model.nextDoseHint && <small>{model.nextDoseHint}</small>}
            </span>
          </li>
        )}
        <li>
          <SitePictogram site={nextSpot.site} side={nextSpot.side} />
          <span>{model.nextSite}</span>
        </li>
        {stock && (
          <li className="saved-stock-row">
            <span className="saved-icon" aria-hidden="true">
              <StockArt method={stock.method} level={stock.level} size={stock.method === "frasco" ? 28 : 6} />
            </span>
            <span className="saved-stock">
              <span className="saved-stock-line">
                Estoque: {stock.amount}
                {stockChip && (
                  <span className={`stock-chip ${!stock.dosesChip && stock.isUseByPast ? "is-past" : ""}`}>{stockChip}</span>
                )}
              </span>
              <StockNotices model={stock} />
            </span>
          </li>
        )}
        {cycle?.top && (
          <li className="saved-cycle-row">
            <span className="saved-icon" aria-hidden="true">
              <CalendarHeart size={20} />
            </span>
            <CycleTipBlock model={cycle} isCompact />
          </li>
        )}
      </ul>
      <div className="saved-actions">
        <button type="button" className="btn" data-autofocus onClick={onDiary}>
          Ver no diário
        </button>
        <button type="button" className="btn-secondary" aria-label="Como você está? Registrar bem-estar" onClick={onMood}>
          <Smile size={18} aria-hidden="true" />
          Como você está?
        </button>
        {model.showMeasures && (
          <button type="button" className="btn-secondary" onClick={onMeasures}>
            <Ruler size={18} aria-hidden="true" />
            {COPY.measure}
          </button>
        )}
        <button type="button" className="text-btn saved-undo" onClick={onUndo}>
          Desfazer
        </button>
      </div>
    </Modal>
  );
}
