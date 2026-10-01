import { Check } from "lucide-react";
import { useApp } from "../../lib/context";
import { goalChangePreview, SECTION_EDIT_COPY } from "../../lib/profile-summary";
import type { Draft } from "../../types";
import "./SectionEdit.css";

type Props = {
  answers: Draft;
  busy: boolean;
  onCancel: () => void;
};

/**
 * Rodapé do editor de uma seção: prévia da meta (proteína com calorias ocultas; nada em perfil
 * calmo ou com meta manual), "Cancelar" e "Salvar alterações". O botão de salvar envia o form.
 */
export function SectionEditFooter({ answers, busy, onCancel }: Props) {
  const { state } = useApp();
  const preview = state.profile ? goalChangePreview(state.profile, answers) : null;
  return (
    <div className="anamnese-form-footer is-section-edit">
      {/* Região viva sempre presente: a prévia é anunciada quando aparece. */}
      <p className="anamnese-goal-preview" role="status" aria-live="polite">
        {preview}
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {SECTION_EDIT_COPY.cancel}
        </button>
        <button className="btn" disabled={busy}>
          {busy ? SECTION_EDIT_COPY.saving : SECTION_EDIT_COPY.save}
          {!busy && <Check size={17} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
