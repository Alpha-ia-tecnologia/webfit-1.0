import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { emptyPantryDraft } from "../../lib/pantry";
import { visiblePlainText } from "../../lib/text";
import type { PantryDraft, PantryItem } from "../../types";
import { DraftRow } from "./DraftRow";
import {
  AreaAlert,
  AreaStatus,
  type PantryBusy,
  type PantryError,
} from "./shared";

/** Limite de itens numa revisão (a foto raramente passa disso; o estoque aceita 500). */
const MAX_REVIEW_ITEMS = 60;
let lastKey = 0;
const nextKey = () => `draft-${++lastKey}`;

interface Props {
  drafts: PantryDraft[];
  onDrafts: (update: (drafts: PantryDraft[]) => PantryDraft[]) => void;
  isEditing: boolean;
  source: PantryItem["source"];
  newLocation: PantryDraft["location"];
  scanNotes: string;
  busy: PantryBusy;
  error: PantryError | null;
  hide: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** Revisão compacta (AGENTE-10): nada vai para o estoque antes de "Confirmar e salvar itens". */
export function PantryReview(props: Props) {
  const { drafts, onDrafts, isEditing, busy, hide } = props;
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [keys, setKeys] = useState(() => drafts.map(nextKey));
  const pendingFocus = useRef<number | "add" | null>(null);
  const focusName = (index: number, preventScroll = false) => {
    const names = root.current?.querySelectorAll<HTMLInputElement>("input[data-draft-name]");
    names?.[index]?.focus({ preventScroll });
  };

  // Ao abrir: na edição e digitando, foca o nome; da foto (ou das compras), o título. Um quadro
  // depois: a folha que acabou de abrir põe o foco no "Fechar" antes (efeito do pai roda depois).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (props.isEditing || props.source === "manual") focusName(0);
      else heading.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura: a revisão é montada de novo a cada cadastro, foto ou edição
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "add") addButton.current?.focus();
    else focusName(target);
  }, [drafts.length]);

  const add = () => {
    pendingFocus.current = drafts.length;
    setKeys((current) => [...current, nextKey()]);
    onDrafts((current) => [...current, emptyPantryDraft(props.newLocation)]);
  };
  const remove = (index: number) => {
    pendingFocus.current = index < drafts.length - 1 ? index : "add";
    setKeys((current) => current.filter((_, i) => i !== index));
    onDrafts((current) => current.filter((_, i) => i !== index));
  };
  const patch = (index: number, value: Partial<PantryDraft>) =>
    onDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...value } : d)));

  return (
    <div className="pantry-review">
      <div ref={root} className="pantry-review-body">
        {/* Na edição, o título da folha ("Editar alimento") já diz o que é. */}
        {!isEditing && (
          <h2 ref={heading} tabIndex={-1}>
            Revise os itens antes de salvar
          </h2>
        )}
        <p className="muted">Quantidade e validade são opcionais.</p>
        {props.scanNotes && <p className="notice">{visiblePlainText(props.scanNotes, hide)}</p>}
        <AreaAlert area="review" error={props.error} hide={hide} />
        <div className="pantry-drafts">
          {drafts.map((draft, index) => (
            <DraftRow
              key={keys[index] ?? index}
              index={index}
              draft={draft}
              isEditing={isEditing}
              isDisabled={!!busy}
              onPatch={(value) => patch(index, value)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
        <AreaStatus area="review" busy={busy} onCancel={props.onCancel} />
        <div className="form-actions pantry-review-actions">
          {!isEditing && (
            <button
              ref={addButton}
              type="button"
              className="btn-secondary"
              disabled={!!busy || drafts.length >= MAX_REVIEW_ITEMS}
              onClick={add}
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar outro item
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!!busy || !drafts.length}
            onClick={props.onSave}
          >
            Confirmar e salvar itens
          </button>
          <button type="button" className="text-btn" disabled={!!busy} onClick={props.onDiscard}>
            Descartar revisão
          </button>
        </div>
      </div>
    </div>
  );
}
