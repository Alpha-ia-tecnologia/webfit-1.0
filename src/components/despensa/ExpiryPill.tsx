import { Clock } from "lucide-react";
import type { ExpiryPill as ExpiryPillData } from "../../lib/pantry-view";

/**
 * Pílula de validade da linha (conceito 06): "2 dias" âmbar perto do fim (com relógio), "5 dias" /
 * "3 meses" menta em dia. Nunca vermelho; o leitor de tela ouve a frase completa com a data.
 */
export function ExpiryPill({ pill }: { pill: ExpiryPillData }) {
  return (
    <span className={`pantry-pill ${pill.tone}`} data-testid={`pantry-expiry-${pill.tone}`}>
      {pill.tone === "soon" && <Clock size={14} aria-hidden="true" />}
      <span aria-hidden="true">{pill.compact}</span>
      <span className="sr-only">{pill.full}</span>
    </span>
  );
}
