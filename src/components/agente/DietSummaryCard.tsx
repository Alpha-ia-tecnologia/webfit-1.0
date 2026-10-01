import { useState } from "react";
import { ArrowRight, ShieldCheck, Utensils } from "lucide-react";
import { dietHighlights } from "../../lib/diet";
import type { ChatMessage } from "../../types";
import { RichText } from "../RichText";
import { useBodyNumbersHidden } from "../useBodyNumbersHidden";

/**
 * A dieta gerada aparece no chat como resumo; o texto completo continua a um toque. Compacto
 * (conversa): título, "Você pediu uma nova dieta · 07:05" e as ações; "Ver resumo" abre os pontos.
 */
export function DietSummaryCard({
  message,
  isCurrent,
  hideCalories,
  onOpen,
  requestedAt = null,
  isCompact = false,
}: {
  message: ChatMessage;
  isCurrent: boolean;
  hideCalories: boolean;
  onOpen: () => void;
  /** Hora do pedido ("07:05"): vira a segunda linha do cartão compacto. */
  requestedAt?: string | null;
  isCompact?: boolean;
}) {
  const [isOpen, setOpen] = useState(false);
  const [isSummaryOpen, setSummaryOpen] = useState(!isCompact);
  // Plano salvo antes de ligar "Ocultar números do corpo" também passa pela máscara.
  const hideBody = useBodyNumbersHidden();
  const points = dietHighlights(message.text, hideCalories, undefined, hideBody);
  const toggleText = isOpen ? "Mostrar resumo" : "Ver texto completo";
  // Várias dietas podem estar na conversa: o nome acessível inclui a data de cada uma.
  const createdAt = new Date(message.timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const version = isCurrent ? "Plano atual" : "Versão anterior";
  const subtitle = isCompact
    ? [requestedAt ? `Você pediu uma nova dieta · ${requestedAt}` : "", isCurrent ? "" : version]
        .filter(Boolean)
        .join(" · ") || version
    : version;
  const fullText = (
    <button
      type="button"
      className="text-btn"
      aria-expanded={isOpen}
      aria-label={`${toggleText} da dieta de ${createdAt}`}
      onClick={() => setOpen(!isOpen)}
    >
      {toggleText}
    </button>
  );
  return (
    <div className={`diet-summary${isCompact ? " is-compact" : ""}`}>
      <div className="diet-summary-head">
        <span className="diet-summary-icon" aria-hidden="true">
          <Utensils size={18} />
        </span>
        <div>
          <strong>Dieta do dia criada</strong>
          <span>{subtitle}</span>
        </div>
        {message.meta?.reviewed && (
          <span className="diet-summary-badge">
            <ShieldCheck size={13} aria-hidden="true" />
            Revisada
          </span>
        )}
      </div>
      {isSummaryOpen && points.length > 0 && !isOpen && (
        <ul className="diet-summary-points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
      {isOpen && (
        <RichText
          text={message.text}
          hideCalories={hideCalories}
          className="diet-summary-text"
        />
      )}
      <div className="diet-summary-actions">
        {isCurrent && (
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            Abrir dieta
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
        {isCompact && (
          <button
            type="button"
            className="text-btn"
            aria-expanded={isSummaryOpen}
            onClick={() => {
              setSummaryOpen(!isSummaryOpen);
              if (isSummaryOpen) setOpen(false);
            }}
          >
            Ver resumo
          </button>
        )}
        {(!isCompact || isSummaryOpen) && fullText}
      </div>
    </div>
  );
}
