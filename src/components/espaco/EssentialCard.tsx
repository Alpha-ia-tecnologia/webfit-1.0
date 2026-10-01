import { useId, useState } from "react";
import { FileText, PencilLine } from "lucide-react";
import type { Domain } from "../../design/tokens";
import { useApp } from "../../lib/context";
import { ESSENTIAL_COPY, essentialSummary, type EssentialKey } from "../../lib/essential";
import { sectionIndexOf } from "../../lib/profile-summary";
import { Modal } from "../UI";
import { LazyReportSheet } from "./LazyReportSheet";
import "./Essential.css";

/** Alergias em âmbar de atenção, medicamentos no tom da medicação; o resto neutro (nunca vermelho). */
const CHIP_TONE: Record<EssentialKey, Domain> = {
  alergias: "attention",
  condicoes: "neutral",
  medicamentos: "medication",
  cuidados: "neutral",
  profissionais: "neutral",
};

/**
 * "Essencial" (ESPACO-08) numa folha, aberta pelo mosaico do perfil de saúde: alergias, condições,
 * medicamentos (só o nome), cuidados e profissionais, para mostrar numa consulta ou emergência. A
 * face do Meu espaço nunca mostra condições nem os remédios da anamnese; aqui, só quando a pessoa
 * abre. Sem números do corpo e sem calorias.
 */
export function EssentialSheet({ onClose }: { onClose: () => void }) {
  const { state, openAnamneseSection } = useApp();
  const [isReportOpen, setReportOpen] = useState(false);
  const id = useId();
  const essential = essentialSummary(state);
  const editAnamnese = () => {
    const index = sectionIndexOf("conditions");
    onClose();
    openAnamneseSection(index >= 0 ? index : 0);
  };
  return (
    <Modal title={ESSENTIAL_COPY.title} onClose={onClose} className="essential-sheet">
      <p className="essential-sub">{ESSENTIAL_COPY.sub}</p>
      <p className="essential-summary" data-testid="essential-summary">
        {essential.summary}
      </p>
      {!essential.isEmpty && (
        <div className="essential-details">
          {essential.groups.map((group) => {
            const groupId = `${id}-${group.key}`;
            return (
              <div key={group.key} className="essential-group">
                <h3 id={groupId}>{group.title}</h3>
                <ul
                  className={`essential-chips tone-${CHIP_TONE[group.key]}`}
                  aria-labelledby={groupId}
                >
                  {group.chips.map((chip) => (
                    <li key={chip} className="essential-chip">
                      {chip}
                    </li>
                  ))}
                </ul>
                {group.note && <p className="essential-note">{group.note}</p>}
              </div>
            );
          })}
        </div>
      )}
      <div className="essential-actions">
        <button type="button" className="text-btn essential-edit" onClick={editAnamnese}>
          <PencilLine size={16} aria-hidden="true" />
          {ESSENTIAL_COPY.edit}
        </button>
        <button
          type="button"
          className="btn essential-report"
          aria-haspopup="dialog"
          onClick={() => setReportOpen(true)}
        >
          <FileText size={17} aria-hidden="true" />
          {ESSENTIAL_COPY.report}
        </button>
      </div>
      {isReportOpen && <LazyReportSheet onClose={() => setReportOpen(false)} />}
    </Modal>
  );
}
