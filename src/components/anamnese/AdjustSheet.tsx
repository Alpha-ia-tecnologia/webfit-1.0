import { localDate } from "../../lib/domain";
import { ADJUST_TITLE, REVIEW_DISCLAIMER } from "../../lib/plan-reveal";
import type { Draft } from "../../types";
import { questionnaire, type Question } from "../../data/questionnaire";
import { Modal } from "../UI";
import { answerText, isShown } from "./progress";

// Os textos moram em lib/plan-reveal (o app nativo usa os mesmos); daqui seguem reexportados.
export { ADJUST_TITLE, REVIEW_DISCLAIMER };

/**
 * "Ajustar" no fim da anamnese: as respostas por etapa (a revisão em texto que antes ocupava a
 * página) numa folha, com "Editar esta etapa" e o aviso de que estimativas não substituem um
 * profissional.
 */
export function AdjustSheet({
  answers,
  isAnswered,
  onEditStep,
  onClose,
}: {
  answers: Draft;
  isAnswered: (field: Question) => boolean;
  onEditStep: (step: number) => void;
  onClose: () => void;
}) {
  const lastStep = questionnaire.length - 1;
  const today = localDate();
  return (
    <Modal title={ADJUST_TITLE} onClose={onClose} className="adjust-sheet">
      <p className="hint">{REVIEW_DISCLAIMER}</p>
      {questionnaire.slice(0, lastStep).map((group, i) => {
        const shownFields = group.fields.filter((field) =>
          isShown(answers, field, today),
        );
        const filled = shownFields.filter(isAnswered).length;
        return (
          <details key={group.title} className="review-group" open={i === 0}>
            <summary>
              {group.title}
              <span className="anamnese-review-badge">
                {filled} de {shownFields.length}
              </span>
            </summary>
            <dl>
              {shownFields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{answerText(field, answers[field.key])}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="text-btn"
              onClick={() => onEditStep(i)}
            >
              Editar esta etapa
            </button>
          </details>
        );
      })}
    </Modal>
  );
}
