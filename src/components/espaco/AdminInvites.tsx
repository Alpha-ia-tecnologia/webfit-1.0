import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ADMIN_COPY,
  createInviteCode,
  fetchInvites,
  fmtAdminDate,
  inviteMessage,
  inviteStatusLabel,
  INVITE_DAYS_DEFAULT,
  INVITE_DAYS_MAX,
  INVITE_NOTE_MAX,
  revokeInvite,
  type AdminAccess,
  type AdminInvite,
} from "../../lib/admin";
import { useApp } from "../../lib/context";
import { Field } from "../UI";
import { CodeBox, messageOf, useAdminList } from "./AdminCodeBox";

const STATUS_TONE: Record<AdminInvite["status"], string> = { pending: "ok", used: "", expired: "attention" };

/** Convites: gerar (o código aparece uma vez) e revogar os que ninguém usou. */
export function AdminInvites({
  admin,
  onCodeShown,
}: {
  admin: AdminAccess;
  /** Avisa o painel quando há um código à mostra (fechar pede confirmação). */
  onCodeShown?: (shown: boolean) => void;
}) {
  const { request, publicUrl } = admin;
  const { confirm, notify } = useApp();
  const load = useCallback(() => fetchInvites(request), [request]);
  const { items, setItems, error } = useAdminList(load);
  const [created, setCreated] = useState<{ code: string; invite: AdminInvite } | null>(null);
  useEffect(() => onCodeShown?.(created !== null), [created, onCodeShown]);
  const [busy, setBusy] = useState(false);

  const generate = async (input: { note: string; days: number }) => {
    setBusy(true);
    try {
      const result = await createInviteCode(request, input);
      setCreated(result);
      setItems((list) => [result.invite, ...(list ?? [])]);
      return true;
    } catch (failure) {
      notify(messageOf(failure), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invite: AdminInvite) => {
    const confirmed = await confirm({
      title: ADMIN_COPY.revokeTitle,
      message: ADMIN_COPY.revokeMessage,
      confirmLabel: ADMIN_COPY.revoke,
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await revokeInvite(request, invite.id);
      setItems((list) => (list ?? []).filter((item) => item.id !== invite.id));
      setCreated((current) => (current?.invite.id === invite.id ? null : current));
      notify(ADMIN_COPY.revoked);
    } catch (failure) {
      notify(messageOf(failure), "error");
    }
  };

  return (
    <section className="admin-section" aria-label={ADMIN_COPY.invites}>
      <InviteForm busy={busy} onSubmit={generate} />
      {created && (
        <CodeBox
          label={ADMIN_COPY.generated}
          code={created.code}
          message={inviteMessage(created.code, publicUrl, created.invite.expiresAt)}
        />
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!items && !error && <p className="hint">{ADMIN_COPY.loading}</p>}
      {items && items.length === 0 && <p className="hint">{ADMIN_COPY.noInvites}</p>}
      {items && items.length > 0 && (
        <ul className="admin-list">
          {items.map((invite) => (
            <InviteRow key={invite.id} invite={invite} onRevoke={() => void revoke(invite)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: { note: string; days: number }) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [days, setDays] = useState(String(INVITE_DAYS_DEFAULT));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onSubmit({ note, days: Number(days) })) setNote("");
  };
  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <Field label={ADMIN_COPY.note} hint={ADMIN_COPY.noteHint}>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={INVITE_NOTE_MAX} autoComplete="off" />
      </Field>
      <Field label={ADMIN_COPY.days} hint={ADMIN_COPY.daysHint}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={INVITE_DAYS_MAX}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          required
        />
      </Field>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Aguarde…" : ADMIN_COPY.generate}
      </button>
    </form>
  );
}

function InviteRow({ invite, onRevoke }: { invite: AdminInvite; onRevoke: () => void }) {
  return (
    <li className="admin-item">
      <div className="admin-item-head">
        <strong className="admin-item-title">{invite.note || ADMIN_COPY.noNote}</strong>
        <span className={`admin-pill ${STATUS_TONE[invite.status]}`}>{inviteStatusLabel(invite)}</span>
      </div>
      <p className="admin-item-meta">
        Criado em {fmtAdminDate(invite.createdAt)} · vale até {fmtAdminDate(invite.expiresAt)}
      </p>
      {invite.status !== "used" && (
        <div className="admin-item-actions">
          <button
            type="button"
            className="btn-secondary btn-sm admin-danger"
            onClick={onRevoke}
            aria-label={`${ADMIN_COPY.revoke} convite ${invite.note || ADMIN_COPY.noNote}`}
          >
            {ADMIN_COPY.revoke}
          </button>
        </div>
      )}
    </li>
  );
}
