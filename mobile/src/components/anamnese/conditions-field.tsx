import { useState } from "react";
import { View } from "react-native";
import {
  choicesToTags,
  CONDITION_CHOICES,
  CONDITION_DETAILS_KEY,
  CONDITION_TAGS_KEY,
  conditionDetailsCopy,
  isOtherConditionOn,
  showsConditionDetails,
  tagsToChoices,
} from "@shared/components/anamnese/condition-choice";
import type { Question } from "@shared/data/questionnaire";
import type { Draft } from "@shared/types";
import { Field, TextField } from "@/components/ui";
import { ChoiceChips } from "./choice-chips";
import type { AboutSlot } from "./stage-about";

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  /** Perguntas da etapa (rótulos e dicas das duas chaves). */
  fields: Question[];
  about?: AboutSlot;
  set: (key: string, value: string) => void;
};

/**
 * "Tem algum diagnóstico de saúde?" (como o ConditionsField do web): as condições da lista fechada
 * em pílulas ("Nenhuma" exclusiva) e os detalhes: abrem com qualquer condição marcada (opcionais;
 * obrigatórios com "Outra"); um texto antigo continua à vista.
 */
export function ConditionsField({ answers, errors, fields, about, set }: Props) {
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
    <View style={{ gap: 16 }}>
      <ChoiceChips
        label={tags?.label ?? ""}
        prompt={tags?.prompt}
        hint={tags?.hint}
        error={errors[CONDITION_TAGS_KEY]}
        value={tagsToChoices(answers[CONDITION_TAGS_KEY])}
        config={CONDITION_CHOICES}
        about={about}
        onChange={(text) => set(CONDITION_TAGS_KEY, choicesToTags(text))}
      />
      {showDetails && details ? (
        <View testID={`anamnese-field-${CONDITION_DETAILS_KEY}`}>
          <Field
            label={details.label}
            hint={copy.hint}
            error={detailsError}
          >
            <TextField
              value={detailsText}
              maxLength={2000}
              invalid={!!detailsError}
              placeholder={copy.placeholder}
              onChangeText={(next) => set(CONDITION_DETAILS_KEY, next)}
              accessibilityLabel={details.label}
            />
          </Field>
        </View>
      ) : null}
    </View>
  );
}
