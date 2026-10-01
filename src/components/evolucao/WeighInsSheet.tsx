import { CalendarClock } from "lucide-react";
import type { NextWeighIn } from "../../lib/evolution";
import type { WeighInRow } from "../../lib/measures";
import { Modal } from "../UI";
import { WeighInList } from "./WeighInList";

type Props = {
  rows: readonly WeighInRow[];
  /** Próxima pesagem sugerida; null em perfil calmo. */
  next: NextWeighIn | null;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onClose: () => void;
};

/**
 * Folha "Pesagens" (conceito 09): a próxima pesagem (sem cobrança) e as pesagens do período em
 * linhas, com excluir e desfazer. Abre pelo "8 pesagens" do cartão de peso.
 */
export function WeighInsSheet({ rows, next, canRemove, onRemove, onClose }: Props) {
  return (
    <Modal title="Pesagens" onClose={onClose} className="evol-sheet weighins-sheet">
      {next && (
        <p className={`journey-next ${next.status}`} data-testid="journey-next">
          <CalendarClock size={16} aria-hidden="true" />
          {next.label}
        </p>
      )}
      {rows.length > 0 ? (
        <WeighInList rows={rows} canRemove={canRemove} onRemove={onRemove} />
      ) : (
        <p className="muted">Sem pesagens neste período.</p>
      )}
    </Modal>
  );
}
