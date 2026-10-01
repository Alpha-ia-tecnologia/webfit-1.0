import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Syringe } from "lucide-react";
import { PEN_DETAILS_EMPTY, PEN_DETAILS_TITLE } from "./pen-details";

/**
 * "Caneta e dose": qual caneta, a quantidade por aplicação e a frequência num bloco que abre e
 * fecha. Abre sozinho enquanto falta resposta (ao montar) ou quando há erro; completo, recolhe e
 * mostra o resumo do que a pessoa informou. Nunca sugere dose.
 */
export function PenDetails({
  summary,
  isComplete,
  hasError,
  isInitiallyOpen = false,
  children,
}: {
  summary: string | null;
  isComplete: boolean;
  hasError: boolean;
  /** Abre mesmo completo (editor de seção: a pessoa veio para mudar a resposta). */
  isInitiallyOpen?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  const [isOpen, setOpen] = useState(!isComplete || isInitiallyOpen);
  const open = isOpen || hasError;
  return (
    <section
      className={`pen-details ${open ? "is-open" : ""}`}
      data-testid="pen-details"
      aria-label={PEN_DETAILS_TITLE}
    >
      <button
        type="button"
        className="pen-details-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="pen-details-icon" aria-hidden="true">
          <Syringe size={20} />
        </span>
        <span className="pen-details-text">
          <strong>{PEN_DETAILS_TITLE}</strong>
          <small>{summary ?? PEN_DETAILS_EMPTY}</small>
        </span>
        <ChevronDown className="pen-details-chevron" size={20} aria-hidden="true" />
      </button>
      <div id={panelId} className="pen-details-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
