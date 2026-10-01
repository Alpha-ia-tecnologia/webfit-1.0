import { useCallback, useState } from "react";
import { ADMIN_COPY, type AdminAccess } from "../../lib/admin";
import { useApp } from "../../lib/context";
import { Modal } from "../UI";
import { AdminAccounts } from "./AdminAccounts";
import { AdminInvites } from "./AdminInvites";
import "./AdminPanel.css";

type Section = "invites" | "accounts";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "invites", label: ADMIN_COPY.invites },
  { id: "accounts", label: ADMIN_COPY.accounts },
];

/** Painel do administrador (servidor online, só o dono): convites e contas, sem dados de saúde. */
export function AdminPanel({ admin, selfId, onClose }: { admin: AdminAccess; selfId: string; onClose: () => void }) {
  const { confirm } = useApp();
  const [section, setSection] = useState<Section>("invites");
  // Código à mostra (convite ou senha): ele não aparece de novo, então fechar pede confirmação.
  const [codes, setCodes] = useState<Record<Section, boolean>>({ invites: false, accounts: false });
  const onInviteCode = useCallback((shown: boolean) => setCodes((c) => ({ ...c, invites: shown })), []);
  const onResetCode = useCallback((shown: boolean) => setCodes((c) => ({ ...c, accounts: shown })), []);
  const close = async () => {
    if (codes.invites || codes.accounts) {
      const leave = await confirm({
        title: "Fechar o painel?",
        message: "O código gerado não aparece de novo. Copie-o antes de fechar.",
        confirmLabel: "Fechar mesmo assim",
        cancelLabel: "Voltar",
      });
      if (!leave) return;
    }
    onClose();
  };
  return (
    <Modal title={ADMIN_COPY.title} onClose={() => void close()} className="admin-modal">
      <div className="admin-sections" role="group" aria-label={ADMIN_COPY.sections}>
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="admin-section-btn"
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* As duas seções ficam montadas: trocar de seção não apaga um código à mostra. */}
      <div hidden={section !== "invites"}>
        <AdminInvites admin={admin} onCodeShown={onInviteCode} />
      </div>
      <div hidden={section !== "accounts"}>
        <AdminAccounts admin={admin} selfId={selfId} onCodeShown={onResetCode} />
      </div>
    </Modal>
  );
}
