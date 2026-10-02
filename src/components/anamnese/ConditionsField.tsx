import { useState } from "react";
import type { Question } from "../../data/questionnaire";
import type { Draft } from "../../types";
import { Field } from "../UI";
import { ChoiceChips } from "./ChoiceChips";
import {
  choicesToTags,
  CONDITION_CHOICES,
  CONDITION_DETAILS_KEY,
  CONDITION_TAGS_KEY,
  conditionDetailsCopy,
  isOtherConditionOn,
  showsConditionDetails,
  tagsToChoices,
} from "./condition-choice";
import type { AboutSlot } from "./StageAbout";

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  /** Perguntas da etapa (rótulos e dicas das duas chaves). */
  fields: Question[];
  about?: AboutSlot;
  onChange: (key: string, value: string) => void;
};

/**
 * "Tem algum diagnóstico de saúde?": as condições da lista fechada em pílulas ("Nenhuma" exclusiva)
 * e os detalhes: abrem com qualquer condição marcada (opcionais; obrigatórios com "Outra"); um
 * texto antigo continua à vista.
 */
export function ConditionsField({
  answers,
  errors,
  fields,
  about,
  onChange,
}: Props) {
  const tags = fields.find((f) => f.key === CONDITION_TAGS_KEY);
  const details = fields.find((f) => f.key === CONDITION_DETAILS_KEY);
  const detailsText = String(answers[CONDITION_DETAILS_KEY] ?? "");
  // Texto já salvo (perfis antigos) fica à vista mesmo sem "Outra", e não some ao apagar.
  const [hasSavedText] = useState(() => detailsText.trim() !== "");
  const isOther = isOtherConditionOn(answers);
  const detailsError = errors[CONDITION_DETAILS_KEY];
  const showDetails = showsConditionDetails(answers, hasSavedText, !!detailsError);
  const copy = conditionDetailsCopy(isOther);
  return (
    <div className="conditions-field">
      <ChoiceChips
        id={`anamnese-${CONDITION_TAGS_KEY}`}
        name={CONDITION_TAGS_KEY}
        label={tags?.label ?? ""}
        prompt={tags?.prompt}
        hint={tags?.hint}
        error={errors[CONDITION_TAGS_KEY]}
        value={tagsToChoices(answers[CONDITION_TAGS_KEY])}
        config={CONDITION_CHOICES}
        about={about}
        onChange={(text) => onChange(CONDITION_TAGS_KEY, choicesToTags(text))}
      />
      {showDetails && details && (
        <div className="conditions-details" data-field={CONDITION_DETAILS_KEY}>
          <Field
            label={details.label}
            hint={copy.hint}
            error={detailsError}
          >
            <input
              name={CONDITION_DETAILS_KEY}
              type="text"
              value={detailsText}
              maxLength={2000}
              required={isOther}
              placeholder={copy.placeholder}
              onChange={(e) => onChange(CONDITION_DETAILS_KEY, e.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
