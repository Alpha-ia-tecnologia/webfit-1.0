import { useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { useApp } from "../../lib/context";
import { SERVER_SYNC_COPY, syncStatusLabel } from "../../lib/server-sync";
import { IconTile } from "../IconTile";
import { Card, Field, Modal } from "../UI";
import { SwitchRow } from "./SettingRow";

/** "Cópia no servidor" em Preferências e dados: opcional, desligada por padrão (PostgreSQL do servidor). */
export function ServerSyncCard() {
  const { account } = useApp();
  return account ? <AccountSyncCard accountId={account.info.id} /> : <LocalSyncCard />;
}

/** Online: a cópia é da conta e fica sempre ligada; aqui só a situação e a escolha num conflito. */
function AccountSyncCard({ accountId }: { accountId: string }) {
  const { sync } = useApp();
  const badge = syncStatusLabel(sync.status);
  return (
    <Card className="settings-card sync-card">
      <h2>Cópia na sua conta</h2>
      <ul className="set-group">
        <li className="set-row is-status">
          <IconTile tone="neutral" size="md" icon={RefreshCw} className="set-icon" />
          <span className="set-label">Situação</span>
          <span className={`set-status ${badge.tone}`} role="status">
            {badge.label}
          </span>
        </li>
      </ul>
      <p className="hint">
        Cada mudança sobe para a sua conta alguns segundos depois. Sem internet, sobe quando a conexão voltar.
      </p>
      {sync.status.kind === "error" && <p className="hint">{sync.status.message}</p>}
      {sync.status.kind === "conflict" && (
        <div className="sync-conflict" role="alert">
          <p>A sua conta tem uma versão mais nova que a deste aparelho (de outro aparelho, por exemplo).</p>
          <div className="data-actions">
            <button type="button" className="btn-secondary" onClick={() => void sync.restoreFromServer(accountId)}>
              Usar a da conta
            </button>
            <button type="button" className="btn-secondary" onClick={() => void sync.sendMine()}>
              {SERVER_SYNC_COPY.sendMine}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Local (este computador ou a rede Wi-Fi): opcional, por código da instalação. */
function LocalSyncCard() {
  const { state, sync, confirm, notify } = useApp();
  // Otimista, como os outros interruptores: muda na hora e fica travado até a gravação terminar.
  const [pending, setPending] = useState<boolean | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const badge = syncStatusLabel(sync.status);
  const toggle = async (enabled: boolean) => {
    setPending(enabled);
    try {
      // Desligar pergunta se a cópia também sai do servidor; "Manter cópia" só para de atualizá-la.
      const wipe =
        !enabled &&
        sync.available &&
        (await confirm({
          title: SERVER_SYNC_COPY.turnOffTitle,
          message: SERVER_SYNC_COPY.turnOffMessage,
          confirmLabel: "Apagar cópia",
          cancelLabel: "Manter cópia",
          tone: "danger",
        }));
      await sync.setEnabled(enabled, wipe);
    } finally {
      setPending(null);
    }
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.userId);
      notify("Código copiado.");
    } catch {
      notify("Não foi possível copiar. Selecione o código e copie manualmente.", "warning");
    }
  };
  return (
    <Card className="settings-card sync-card">
      <h2>{SERVER_SYNC_COPY.title}</h2>
      <ul className="set-group">
        <SwitchRow
          id="setting-serverSync"
          icon={Database}
          label="Guardar uma cópia no servidor"
          checked={pending ?? state.serverSync}
          disabled={pending !== null || (!sync.available && !state.serverSync)}
          onChange={(enabled) => void toggle(enabled)}
        />
        <li className="set-row is-status">
          <IconTile tone="neutral" size="md" icon={RefreshCw} className="set-icon" />
          <span className="set-label">Situação</span>
          <span className={`set-status ${badge.tone}`} role="status">
            {badge.label}
          </span>
        </li>
      </ul>
      <p className="hint">{sync.available ? SERVER_SYNC_COPY.hint : SERVER_SYNC_COPY.unavailable}</p>
      {sync.status.kind === "error" && <p className="hint">{sync.status.message}</p>}
      {sync.status.kind === "conflict" && (
        <div className="sync-conflict" role="alert">
          <p>{SERVER_SYNC_COPY.conflict}</p>
          <div className="data-actions">
            <button type="button" className="btn-secondary" onClick={() => void sync.sendMine()}>
              {SERVER_SYNC_COPY.sendMine}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRestoreOpen(true)}>
              {SERVER_SYNC_COPY.restore}
            </button>
          </div>
        </div>
      )}
      {state.serverSync && (
        <div className="sync-code">
          <span className="sync-code-label">{SERVER_SYNC_COPY.codeLabel}</span>
          <code>{state.userId}</code>
          <button type="button" className="text-btn" onClick={() => void copyCode()}>
            Copiar código
          </button>
          <p className="hint">{SERVER_SYNC_COPY.codeHint}</p>
        </div>
      )}
      {sync.available && sync.status.kind !== "conflict" && (
        <div className="data-actions">
          <button type="button" className="btn-secondary" onClick={() => setRestoreOpen(true)}>
            {SERVER_SYNC_COPY.restore}
          </button>
        </div>
      )}
      {restoreOpen && <RestoreFromServer onClose={() => setRestoreOpen(false)} />}
    </Card>
  );
}

/** Pede o código, confere a cópia (as mesmas regras do backup em arquivo) e substitui os dados. */
function RestoreFromServer({ onClose }: { onClose: () => void }) {
  const { state, sync, confirm } = useApp();
  const [code, setCode] = useState(state.userId);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await work()) onClose();
    } finally {
      setBusy(false);
    }
  };
  const deleteCopy = async () => {
    const confirmed = await confirm({
      title: "Apagar a cópia deste código?",
      message: "A cópia sai do servidor e não pode ser recuperada. Os dados deste aparelho não mudam.",
      confirmLabel: "Apagar cópia",
      tone: "danger",
    });
    return confirmed && sync.deleteCopy(code);
  };
  return (
    <Modal title={SERVER_SYNC_COPY.restore} onClose={() => !busy && onClose()}>
      <Field label={SERVER_SYNC_COPY.codeLabel}>
        <input
          value={code}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <p className="hint">{SERVER_SYNC_COPY.codeHint}</p>
      <p>
        Restaurar substitui os dados deste navegador pela cópia do servidor. Exporte um backup antes se quiser
        mantê-los.
      </p>
      <p className="hint">
        A autorização de IA e os lembretes ficam desativados após a restauração. Você pode ativá-los novamente em
        Meu espaço.
      </p>
      <div className="stack">
        <button
          type="button"
          className="btn"
          disabled={busy || !code.trim()}
          onClick={() => void run(() => sync.restoreFromServer(code))}
        >
          {busy ? "Aguarde…" : "Substituir dados e restaurar"}
        </button>
        <button
          type="button"
          className="text-btn danger"
          disabled={busy || !code.trim()}
          onClick={() => void run(deleteCopy)}
        >
          {SERVER_SYNC_COPY.deleteCopy}
        </button>
        <button type="button" className="text-btn" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
