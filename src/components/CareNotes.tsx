import { CARE_NOTES_CLOSING } from "../lib/conditions";
import "./CareNotes.css";

export const CARE_NOTES_TITLE = "Cuidados do seu perfil";

/**
 * Cuidados que acompanham as metas (condições declaradas, caneta, IMC baixo para perder peso):
 * só texto, sem números, dados do corpo ou dose; aparece também com "Ocultar calorias".
 */
export function CareNotes({ notes }: { notes: readonly string[] }) {
  if (!notes.length) return null;
  const items = notes.filter((note) => note !== CARE_NOTES_CLOSING);
  return (
    <div className="care-notes" data-testid="care-notes">
      <p className="care-notes-title">{CARE_NOTES_TITLE}</p>
      <ul>
        {items.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {notes.includes(CARE_NOTES_CLOSING) && (
        <p className="care-notes-closing">{CARE_NOTES_CLOSING}</p>
      )}
    </div>
  );
}
