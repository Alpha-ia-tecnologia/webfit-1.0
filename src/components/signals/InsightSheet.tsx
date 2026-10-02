import { Flame, Info, Lightbulb, MessageCircle, Sparkles, ThumbsUp, type LucideIcon } from "lucide-react";
import { AGENT_REVIEW_NOTE } from "../../lib/agent-presentation";
import type { InsightSheetAction, InsightSheetModel, InsightTone } from "../../lib/day";
import { AdjustmentRows } from "../hoje/AdjustmentRows";
import { Modal } from "../UI";
import "./Insights.css";

/** Ícone por tom: cuidado, reforço, agente, ajuste da meta, contexto. */
export const INSIGHT_ICONS: Record<InsightTone, LucideIcon> = {
  info: Lightbulb,
  positive: ThumbsUp,
  agent: Sparkles,
  adjust: Flame,
  neutral: Info,
};
const ACTION_ICONS: Record<InsightSheetAction["kind"], LucideIcon> = {
  agent: MessageCircle,
  chat: MessageCircle,
  explain: Info,
};

type Props = {
  sheet: InsightSheetModel;
  /** Pergunta pronta, abrir a conversa ou "Como calculamos" (quem abre a folha decide o destino). */
  onAction: (action: InsightSheetAction) => void;
  /** Dispensar por 3 dias (sinais) ou o recado de hoje; sem ele, a folha não oferece dispensar. */
  onDismiss?: (key: string) => void;
  onClose: () => void;
};

/**
 * Folha de um insight (chip ou título do Resumo): ícone no tom, uma ou duas frases, um botão de ação
 * e "Dispensar". Reaproveita o Modal do app (foco preso, Esc, fechar), como folha inferior no celular.
 */
export function InsightSheet({ sheet, onAction, onDismiss, onClose }: Props) {
  const Icon = INSIGHT_ICONS[sheet.tone];
  const action = sheet.action;
  const ActionIcon = action ? ACTION_ICONS[action.kind] : null;
  const dismiss = onDismiss ? sheet.dismiss : undefined;
  return (
    <Modal title={sheet.title} className={`insight-sheet is-${sheet.tone}`} overlayClassName="insight-overlay" onClose={onClose}>
      {sheet.rows ? (
        // Ajuste da meta: as mesmas linhas de "Como calculamos", sem parágrafo; a frase fica para o leitor de tela.
        <div className="insight-sheet-rows" data-testid="insight-sheet" data-insight={sheet.id}>
          <p className="sr-only">{sheet.body}</p>
          <AdjustmentRows view={sheet.rows} />
        </div>
      ) : (
        <div className="insight-sheet-body" data-testid="insight-sheet" data-insight={sheet.id}>
          <span className="insight-sheet-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
          <p className="insight-sheet-text">{sheet.body}</p>
        </div>
      )}
      {(action || dismiss) && (
        <div className="insight-sheet-actions">
          {action && ActionIcon && (
            <button type="button" className="btn" onClick={() => onAction(action)}>
              <ActionIcon size={18} aria-hidden="true" />
              {action.label}
            </button>
          )}
          {dismiss && (
            <button type="button" className="text-btn" onClick={() => onDismiss?.(dismiss.key)}>
              {dismiss.label}
            </button>
          )}
        </div>
      )}
      {sheet.tone === "agent" && <p className="insight-sheet-note">Resposta de IA · {AGENT_REVIEW_NOTE}</p>}
    </Modal>
  );
}
