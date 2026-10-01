import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { AUTH_COPY, quotaLabel, type AccountControls } from "../../lib/account";
import { ADMIN_COPY } from "../../lib/admin";
import { IconTile } from "../IconTile";
import { Card, Field, Modal } from "../UI";
import { AdminPanel } from "./AdminPanel";

/** "Sua conta" em Ajustes (só no servidor online): quem entrou, IA de hoje, senha, sair e excluir. */
export function AccountCard({ account }: { account: AccountControls }) {
  const { info, quota, refreshQuota } = account;
  const [sheet, setSheet] = useState<"password" | "delete" | "admin" | null>(null);
  // Só o dono recebe o acesso do painel (App.tsx); a conta comum nem vê o botão.
  const admin = info.role === "owner" ? account.admin : undefined;
  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);
  return (
    <Card className="settings-card account-card">
      <h2>Sua conta</h2>
      <ul className="set-group">
        <li className="set-row is-status">
          <IconTile tone="neutral" size="md" icon={UserRound} className="set-icon" />
          <span className="set-label">
            {info.name || "Conta"}
            <small className="account-email">{info.email}</small>
          </span>
          {info.role === "owner" && <span className="set-status ok">Dono do servidor</span>}
        </li>
        <li className="set-row is-status">
          <IconTile tone="mind" size="md" icon={Sparkles} className="set-icon" />
          <span className="set-label">Pedidos ao agente</span>
          <span className="set-status" role="status">
            {quota ? quotaLabel(quota) : "…"}
          </span>
        </li>
      </ul>
      <div className="data-actions">
        {admin && (
          <button type="button" className="btn-secondary" onClick={() => setSheet("admin")}>
            <ShieldCheck size={16} aria-hidden="true" />
            {ADMIN_COPY.open}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setSheet("password")}>
          Trocar senha
        </button>
        <button type="button" className="btn-secondary" onClick={() => void account.logOut()}>
          Sair da conta
        </button>
      </div>
      <button type="button" className="text-btn danger account-delete" onClick={() => setSheet("delete")}>
        Excluir minha conta
      </button>
      {sheet === "password" && <PasswordSheet account={account} onClose={() => setSheet(null)} />}
      {sheet === "delete" && <DeleteSheet account={account} onClose={() => setSheet(null)} />}
      {sheet === "admin" && admin && <AdminPanel admin={admin} selfId={info.id} onClose={() => setSheet(null)} />}
    </Card>
  );
}

function PasswordSheet({ account, onClose }: { account: AccountControls; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Trocar senha" onClose={() => !busy && onClose()}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void account
            .changePassword(current, next)
            .then((ok) => ok && onClose())
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Senha atual">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label={AUTH_COPY.newPassword} hint={AUTH_COPY.passwordHint}>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <button type="submit" className="btn" disabled={busy || !current || next.length < 8}>
          {busy ? "Aguarde…" : "Trocar senha"}
        </button>
      </form>
    </Modal>
  );
}

function DeleteSheet({ account, onClose }: { account: AccountControls; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={AUTH_COPY.deleteTitle} onClose={() => !busy && onClose()}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void account.deleteAccount(password).finally(() => setBusy(false));
        }}
      >
        <p>{AUTH_COPY.deleteMessage}</p>
        <p className="hint">Exporte um backup antes se quiser guardar uma cópia sua.</p>
        <Field label="Confirme com sua senha">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <button type="submit" className="btn btn-danger" disabled={busy || !password}>
          {busy ? "Aguarde…" : "Excluir conta e dados"}
        </button>
      </form>
    </Modal>
  );
}
