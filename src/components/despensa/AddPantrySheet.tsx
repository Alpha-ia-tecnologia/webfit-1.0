import { Modal } from "../UI";
import { PantryIntake } from "./PantryIntake";
import type { PantryIntakeState } from "./usePantryIntake";
import type { PantryRun } from "./usePantryRun";
import "../Despensa.css";

export const ADD_PANTRY_TITLE = "Adicionar alimentos";

/**
 * Folha "Adicionar alimentos" (conceito 06: o formulário de 800 px sai da primeira tela). Abre pelo
 * "+" do cabeçalho, por "Adicionar foto", pelo "Editar"/"Atualizar" de uma linha e por "Guardar
 * comprados"; continua aberta da foto à revisão e fecha quando os itens são salvos.
 */
export function AddPantrySheet({
  run,
  intake,
  onAttach,
  onScan,
  onSave,
  onDiscard,
  onOpenEspaco,
  onClose,
}: {
  run: PantryRun;
  intake: PantryIntakeState;
  onAttach: (file?: File) => void;
  onScan: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onOpenEspaco: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={intake.editing ? "Editar alimento" : ADD_PANTRY_TITLE}
      onClose={onClose}
      className="pantry-sheet"
    >
      <PantryIntake
        run={run}
        intake={intake}
        onAttach={onAttach}
        onScan={onScan}
        onSave={onSave}
        onDiscard={onDiscard}
        onOpenEspaco={onOpenEspaco}
      />
    </Modal>
  );
}
