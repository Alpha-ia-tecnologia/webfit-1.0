import type { ReactNode } from "react";
import { Modal } from "../UI";

/**
 * Folha de um item de "Mais da sua evolução": o cartão de sempre (bem-estar, medicação, medidas)
 * dentro de um Modal, sem a sombra nem o recuo de cartão (`.evol-sheet .card`).
 */
export function EvolSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose} className="evol-sheet">
      {children}
    </Modal>
  );
}
