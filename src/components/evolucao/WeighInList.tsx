import { Trash2 } from "lucide-react";
import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { formatDate } from "../../lib/domain";
import { fmtShortDate } from "../../lib/format";
import type { WeighInRow } from "../../lib/measures";

type Props = {
  rows: readonly WeighInRow[];
  /** Com uma única medição salva, excluir fica desabilitado (o perfil precisa de um peso). */
  canRemove: boolean;
  onRemove: (id: string) => void;
  /** "Ocultar números do corpo" (ESPACO-13): "Pesagem registrada" no lugar do peso, sem medidas. */
  hidden?: boolean;
};

/**
 * Pesagens do período em linhas (EVOL-08): data em bloco, peso, medidas do dia, origem e a variação
 * desde a pesagem anterior em navy (nunca vermelho nem verde). Excluir é um alvo de 44 px. Perfil
 * calmo recebe as linhas sem variação nem medidas (weighInRows); com os números do corpo ocultos
 * a linha fica só com a data, a origem e o excluir.
 */
export function WeighInList({ rows, canRemove, onRemove, hidden = false }: Props) {
  return (
    <ul className="weigh-list" aria-label="Pesagens no período">
      {rows.map((row) => (
        <li key={row.id} className="weigh-row">
          <span className="weigh-date" aria-hidden="true">
            <strong>{row.block.day}</strong>
            <small>{row.block.month}</small>
          </span>
          <span className="sr-only">{fmtShortDate(row.date)}</span>
          <span className="weigh-main">
            {hidden ? (
              <strong className="weigh-weight is-hidden">{BODY_PRIVACY_COPY.weighIn}</strong>
            ) : (
              <>
                <strong className="weigh-weight">{row.weight}</strong>
                {row.chips.map((chip) => (
                  <span key={chip} className="weigh-chip">
                    {chip}
                  </span>
                ))}
              </>
            )}
            <span className="weigh-method">{row.method}</span>
          </span>
          {row.delta && !hidden && (
            <span className="weigh-delta">
              <span aria-hidden="true">{row.delta}</span>
              <span className="sr-only">{row.deltaLabel}</span>
            </span>
          )}
          <button
            type="button"
            className="icon-btn weigh-remove"
            aria-label={`Excluir medição ${formatDate(row.date)}`}
            disabled={!canRemove}
            onClick={() => onRemove(row.id)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
