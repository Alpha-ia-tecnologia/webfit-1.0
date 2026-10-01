import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_COPY,
  createResetCode,
  fetchAccounts,
  fmtAdminDate,
  setAccountDisabled,
  setAccountRole,
  type AdminAccess,
  type AdminAccount,
} from "../../lib/admin";
import { useApp } from "../../lib/context";
import type { ConfirmOptions } from "../../types";
import { CodeBox, messageOf, useAdminList } from "./AdminCodeBox";

type Change = { disabled: boolean } | { role: AdminAccount["role"] };

/** Pergunta antes de bloquear, liberar ou mudar o papel de uma conta. */
function confirmFor(account: AdminAccount, change: Change): ConfirmOptions {
  const who = account.email;
  if ("disabled" in change)
    return change.disabled
      ? {
          title: "Bloquear esta conta?",
          message: `${who} não consegue mais entrar e as sessões abertas são encerradas. Os dados continuam guardados.`,
          confirmLabel: ADMIN_COPY.block,
          tone: "danger",
        }
      : { title: "Liberar esta conta?", message: `${who} volta a conseguir entrar.`, confirmLabel: ADMIN_COPY.unblock };
  return change.role === "owner"
    ? {
        title: "Tornar esta conta dona do WebFit?",
        message: `${who} passa a administrar o WebFit: gera convites e cuida das contas.`,
        confirmLabel: ADMIN_COPY.makeOwner,
      }
    : {
        title: "Tirar a administração desta conta?",
        message: `${who} deixa de administrar o WebFit e passa a ser uma conta comum.`,
        confirmLabel: ADMIN_COPY.makeMember,
        tone: "danger",
      };
}

/** Contas: código de senha, bloquear ou liberar e papel (nunca bloquear ou rebaixar a própria conta). */
export function AdminAccounts({
  admin,
  selfId,
  onCodeShown,
}: {
  admin: AdminAccess;
  selfId: string;
  /** Avisa o painel quando há um código à mostra (fechar pede confirmação). */
  onCodeShown?: (shown: boolean) => void;
}) {
  const { request } = admin;
  const { confirm, notify } = useApp();
  const load = useCallback(() => fetchAccounts(request), [request]);
  const { items, setItems, error } = useAdminList(load);
  const [reset, setReset] = useState<{ accountId: string; code: string; expiresAt: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => onCodeShown?.(reset !== null), [reset, onCodeShown]);

  const makeReset = async (account: AdminAccount) => {
    // O código troca a senha de quem o tiver: só depois de confirmar; o anterior deixa de valer.
    const confirmed = await confirm({
      title: `Gerar código de senha para ${account.name || account.email}?`,
      message:
        "Quem tiver este código consegue trocar a senha da conta nas próximas 24 horas. Mande só para a própria pessoa. Um código gerado antes para esta conta deixa de valer.",
      confirmLabel: "Gerar código",
      tone: "danger",
    });
    if (!confirmed) return;
    setPending(account.id);
    try {
      const result = await createResetCode(request, account.id);
      setReset({ accountId: account.id, ...result });
    } catch (failure) {
      notify(messageOf(failure), "error");
    } finally {
      setPending(null);
    }
  };

  const apply = async (account: AdminAccount, change: Change) => {
    if (!(await confirm(confirmFor(account, change)))) return;
    setPending(account.id);
    try {
      if ("disabled" in change) await setAccountDisabled(request, account.id, change.disabled);
      else await setAccountRole(request, account.id, change.role);
      setItems((list) => (list ?? []).map((item) => (item.id === account.id ? { ...item, ...change } : item)));
      notify("Conta atualizada.");
    } catch (failure) {
      notify(messageOf(failure), "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="admin-section" aria-label={ADMIN_COPY.accounts}>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!items && !error && <p className="hint">{ADMIN_COPY.loading}</p>}
      {items && (
        <ul className="admin-list">
          {items.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isSelf={account.id === selfId}
              busy={pending === account.id}
              reset={reset?.accountId === account.id ? reset : null}
              onReset={() => void makeReset(account)}
              onChange={(change) => void apply(account, change)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountRow({
  account,
  isSelf,
  busy,
  reset,
  onReset,
  onChange,
}: {
  account: AdminAccount;
  isSelf: boolean;
  busy: boolean;
  reset: { code: string; expiresAt: string } | null;
  onReset: () => void;
  onChange: (change: Change) => void;
}) {
  const who = account.name || account.email;
  return (
    <li className="admin-item">
      <div className="admin-item-head">
        <span className="admin-item-title">
          <strong>{account.name || ADMIN_COPY.noName}</strong>
          <small className="admin-item-email">{account.email}</small>
        </span>
        <span className="admin-pills">
          {isSelf && <span className="admin-pill">{ADMIN_COPY.you}</span>}
          {account.role === "owner" && <span className="admin-pill ok">{ADMIN_COPY.owner}</span>}
          {account.disabled && <span className="admin-pill danger">{ADMIN_COPY.disabled}</span>}
        </span>
      </div>
      <p className="admin-item-meta">
        IA hoje: {account.aiToday} · conta criada em {fmtAdminDate(account.createdAt)}
      </p>
      <div className="admin-item-actions" role="group" aria-label={`Ações da conta ${who}`}>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={onReset}>
          {ADMIN_COPY.resetCode}
        </button>
        {!isSelf && (
          <button
            type="button"
            className={account.disabled ? "btn-secondary btn-sm" : "btn-secondary btn-sm admin-danger"}
            disabled={busy}
            onClick={() => onChange({ disabled: !account.disabled })}
          >
            {account.disabled ? ADMIN_COPY.unblock : ADMIN_COPY.block}
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => onChange({ role: account.role === "owner" ? "member" : "owner" })}
          >
            {account.role === "owner" ? ADMIN_COPY.makeMember : ADMIN_COPY.makeOwner}
          </button>
        )}
      </div>
      {reset && (
        <CodeBox
          label={`Código de senha para ${account.email}`}
          code={reset.code}
          hint={ADMIN_COPY.resetHint}
        />
      )}
    </li>
  );
}
