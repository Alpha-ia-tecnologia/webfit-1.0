import { Modal } from "../UI";

/** Texto integral de um consentimento, aberto por "Ler termos completos". */
export function TermsModal({
  label,
  text,
  onClose,
}: {
  label: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Termos completos" onClose={onClose}>
      <p className="terms-label">{label}</p>
      <p>{text}</p>
      <button type="button" className="btn" onClick={onClose}>
        Entendi
      </button>
    </Modal>
  );
}
