import { Info } from "lucide-react";

/**
 * Aviso neutro de coerência entre respostas (ex.: caneta com "Não uso medicamentos"), com uma
 * ação opcional que corrige. Nunca bloqueia o avanço.
 */
export function CoherenceChip({
  text,
  actionLabel,
  onAction,
  testId,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
}) {
  return (
    <div className="coherence-chip" role="status" data-testid={testId}>
      <Info size={16} aria-hidden="true" />
      <p>{text}</p>
      {actionLabel && onAction && (
        <button type="button" className="text-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
