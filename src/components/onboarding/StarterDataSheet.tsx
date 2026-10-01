import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { backupStatus } from "../../lib/space";
import { exportBackup, readLastBackup } from "../../lib/storage";
import { RestoreBackup } from "../RestoreBackup";
import { Modal } from "../UI";

/**
 * "Backup e dados" do primeiro acesso: situação do último backup, exportar, restaurar e excluir
 * tudo (a mesma confirmação de antes; não dá para desfazer).
 */
export function StarterDataSheet({
  onClose,
  onReset,
}: {
  onClose: () => void;
  /** Depois de apagar: a entrada volta ao começo (nome, objetivo e escolhas em branco). */
  onReset: () => void;
}) {
  const { state, reset, confirm, notify } = useApp();
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const status = backupStatus(lastBackup);
  const exportData = () => {
    exportBackup(state, `webfit-${localDate()}.json`);
    setLastBackup(readLastBackup());
  };
  const eraseAll = async () => {
    if (
      !(await confirm({
        title: "Excluir seus dados deste navegador?",
        message:
          "Exporte um backup antes se quiser mantê-los. Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir dados",
        tone: "danger",
      }))
    )
      return;
    try {
      await reset();
      onReset();
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível excluir os dados.",
        "warning",
      );
    }
  };
  return (
    <Modal title="Backup e dados" onClose={onClose} className="starter-data-sheet">
      <p className={`starter-backup-status ${status.tone}`}>
        <ShieldCheck size={16} aria-hidden="true" />
        {status.label}
      </p>
      <div className="starter-data-actions">
        <button type="button" className="btn-secondary" onClick={exportData}>
          <Download size={17} aria-hidden="true" />
          Exportar backup
        </button>
        <RestoreBackup />
      </div>
      <button
        type="button"
        className="text-btn danger starter-erase"
        onClick={() => void eraseAll()}
      >
        Excluir dados e recomeçar
      </button>
    </Modal>
  );
}
