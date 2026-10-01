import { useId, useState } from "react";
import { ChevronDown, NotebookPen } from "lucide-react";
import { Field } from "../UI";

type Props = { notes: string; onChange: (notes: string) => void };

/** Observação opcional: recolhida, a não ser que já exista texto. */
export function NoteRow({ notes, onChange }: Props) {
  const [isOpen, setOpen] = useState(() => notes.trim().length > 0);
  const panelId = useId();
  return (
    <div className="inj-note-row">
      <div className="inj-row">
        <NotebookPen size={18} aria-hidden="true" />
        <button type="button" className="inj-toggle inj-row-text" aria-expanded={isOpen} aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}>
          Adicionar observação
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {isOpen && (
        <div id={panelId}>
          <Field label="Observação">
            <textarea maxLength={2000} placeholder="Ex.: lote do frasco ou como se sentiu depois" value={notes}
              onChange={(e) => onChange(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
