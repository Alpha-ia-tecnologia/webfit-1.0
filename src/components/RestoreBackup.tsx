import { useRef, useState } from "react";
import type { AppState } from "../types";
import { MAX_BACKUP_BYTES, parseBackup } from "../lib/backup";
import { useApp } from "../lib/context";
import { exportBackup } from "../lib/storage";
import { localDate } from "../lib/domain";
import { fmtNumber } from "../lib/format";
import { inventory } from "../lib/space";
import { Modal } from "./UI";

export function RestoreBackup() {
  const { state, restore, notify } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Lendo backup…" : "Restaurar backup"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".json,application/json"
        aria-label="Arquivo de backup WebFit"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            if (file.size > MAX_BACKUP_BYTES)
              throw new Error("Escolha um backup de até 256 MB.");
            setBackup(parseBackup(await file.text()));
          } catch (error) {
            notify(
              error instanceof Error
                ? error.message
                : "Não foi possível ler o backup.",
              "warning",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {backup && (
        <Modal
          title="Conferir backup"
          onClose={() => {
            if (!busy) setBackup(null);
          }}
        >
          <p>
            <strong>{backup.profile?.name ?? "Cadastro em andamento"}</strong>
          </p>
          <div className="restore-compare-wrap">
          <table className="restore-compare">
            <thead>
              <tr>
                <th scope="col">Dados</th>
                <th scope="col">Neste aparelho</th>
                <th scope="col">No backup</th>
              </tr>
            </thead>
            <tbody>
              {inventory(backup).map((item, index) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}</th>
                  <td>{fmtNumber(inventory(state)[index].count)}</td>
                  <td>{fmtNumber(item.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p>
            Restaurar substitui os dados deste navegador pelos dados do arquivo.
            Exporte uma cópia dos dados atuais antes de continuar se quiser
            mantê-los.
          </p>
          <p className="hint">
            A autorização de IA e os lembretes ficam desativados após a
            restauração. Você pode ativá-los novamente em Meu espaço.
          </p>
          <div className="stack">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                exportBackup(
                  state,
                  `webfit-antes-restauracao-${localDate()}.json`,
                )
              }
            >
              Exportar dados atuais
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (await restore(backup, state.revision)) setBackup(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Restaurando…" : "Substituir dados e restaurar"}
            </button>
            <button
              type="button"
              className="text-btn"
              disabled={busy}
              onClick={() => setBackup(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
