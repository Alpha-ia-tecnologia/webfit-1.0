import { PencilLine } from "lucide-react";
import { questionnaire } from "../../data/questionnaire";
import { useApp } from "../../lib/context";
import { PROFILE_HUB_COPY, sectionAnswers } from "../../lib/profile-summary";
import { Modal } from "../UI";

/** Respostas de uma etapa (datas "15/06/1992", opções pelo rótulo) e o atalho para editá-la. */
export function ProfileSectionSheet({
  index,
  onClose,
}: {
  index: number;
  onClose: () => void;
}) {
  const { state, openAnamneseSection } = useApp();
  const section = questionnaire[index];
  if (!section || !state.profile) return null;
  const rows = sectionAnswers(state.profile, index);
  return (
    <Modal
      title={section.title}
      onClose={onClose}
      className="profile-section-sheet"
    >
      <dl className="profile-answers">
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="btn"
        onClick={() => {
          onClose();
          openAnamneseSection(index);
        }}
      >
        <PencilLine size={17} aria-hidden="true" />
        {PROFILE_HUB_COPY.editSection}
      </button>
    </Modal>
  );
}
