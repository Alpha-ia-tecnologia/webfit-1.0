import { Fragment } from "react";
import { View } from "react-native";
import { bmiOf } from "@shared/components/anamnese/inputs";
import { ECHO_KEYS, echoFor } from "@shared/components/anamnese/echoes";
import { PEN_DETAIL_KEYS, penDetailsComplete, penDetailsSummary } from "@shared/components/anamnese/pen-details";
import { widgetKeys } from "@shared/components/anamnese/progress";
import type { Question } from "@shared/data/questionnaire";
import { canShowBodyNumbers } from "@shared/lib/anamnese-flow";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { penMedicationConflict } from "@shared/lib/pen-setup";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Notice } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AnamneseField, type FieldProps } from "./anamnese-field";
import { BmiGauge } from "./bmi-gauge";
import { CoherenceChip } from "./coherence-chip";
import { Echo } from "./echo";
import { MeasureFigure } from "./measure-figure";
import { PenDetails } from "./pen-details";
import { QuestionScaleProvider } from "./q-block";
import { WeightProjection } from "./weight-projection";

type Props = Omit<FieldProps, "field" | "about"> & {
  title: string;
  groupFields: Question[];
  /** Registra a caixa da pergunta para todas as chaves que ela cobre (rolagem até a pendente). */
  registerField: (keys: string[], node: View | null) => void;
  /** Grupos depois do primeiro: um fio em cima e 28 px de ritmo. */
  isFollowing: boolean;
  /** 1ª pergunta da etapa: título de 28 px e, quando cabe, o "Por quê?" na linha de ajuda. */
  leadKey?: string;
  about?: FieldProps["about"];
  /** Editor de seção: "Caneta e dose" abre mesmo completo (a pessoa veio para mudar a resposta). */
  isPenOpen?: boolean;
};

/**
 * Grupo de perguntas da etapa (conceito 07): sem cartão, separado do anterior por um fio e 28 px de
 * ritmo. Com 2 ou mais perguntas o nome do grupo vira um sobretítulo discreto; com uma só, a própria
 * pergunta é o título (o nome do grupo segue para leitores de tela). IMC, silhueta, projeção e o aviso
 * da caneta são vizinhos das perguntas; qual caneta, a dose e a frequência moram em "Caneta e dose".
 */
export function QuestionGroup({ title, groupFields, registerField, isFollowing, leadKey, about, isPenOpen = false, ...props }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { answers, errors, fields, today, set } = props;
  const bmi = bmiOf(answers.weight, answers.height);
  const conflict = penMedicationConflict(answers);
  // Silhueta de cintura e quadril, IMC e peso desejado: só adulto com perfil não sensível (como no web).
  const showBody = canShowBodyNumbers(answers, today);
  // "Ocultar números do corpo" (ESPACO-13): as réguas continuam (é a tela de correção), com aviso;
  // IMC, figura e projeção somem. canShowBodyNumbers não muda: apagaria o peso desejado.
  const bodyHidden = useApp().state.profile?.hideBodyNumbers === true;
  const [only] = groupFields;
  const isSolo = groupFields.length === 1 && (!only?.widget || only.widget === "numbersChoice");
  const penFields = groupFields.filter((field) => PEN_DETAIL_KEYS.includes(field.key));
  const hasPenError = PEN_DETAIL_KEYS.some((key) => !!errors[key]) || !!errors.penWeekday;
  const renderField = (field: Question) => {
    const isPen = PEN_DETAIL_KEYS.includes(field.key);
    return (
      <Fragment key={field.key}>
        {field.key === "weight" && bodyHidden ? <Notice>{BODY_PRIVACY_COPY.anamneseNotice}</Notice> : null}
        {field.key === "waist" && showBody && !bodyHidden ? <MeasureFigure answers={answers} /> : null}
        <QuestionScaleProvider value={isPen ? "compact" : field.key === leadKey ? "lead" : "page"}>
          <View collapsable={false} testID={`anamnese-field-${field.key}`} ref={(node) => registerField(widgetKeys(field, fields, answers), node)}>
            <AnamneseField field={field} {...props} about={field.key === leadKey ? about : undefined} />
            {ECHO_KEYS.has(field.key) && <Echo text={echoFor(field.key, answers)} isCompact={field.key === "weightLossPen"} />}
          </View>
        </QuestionScaleProvider>
        {field.key === "height" && bmi !== null && showBody && !bodyHidden ? <BmiGauge bmi={bmi} /> : null}
        {field.key === "targetWeight" && !bodyHidden ? <WeightProjection answers={answers} today={today} /> : null}
        {field.key === "weightLossPen" && conflict ? (
          <CoherenceChip text={conflict.text} actionLabel={conflict.actionLabel} onAction={() => set("medications", conflict.fix)} />
        ) : null}
      </Fragment>
    );
  };
  return (
    <View style={[styles.group, isFollowing && styles.following]}>
      <AppText
        size={fontSize.sm}
        weight={700}
        lineHeight={18}
        color={colors.muted}
        accessibilityRole="header"
        style={isSolo ? srOnly : styles.eyebrow}
      >
        {title}
      </AppText>
      <View style={styles.fields}>
        {groupFields.map((field) => {
          if (!PEN_DETAIL_KEYS.includes(field.key)) return renderField(field);
          if (field !== penFields[0]) return null;
          return (
            <PenDetails
              key="pen-details"
              summary={penDetailsSummary(answers)}
              isComplete={penDetailsComplete(answers)}
              hasError={hasPenError}
              isInitiallyOpen={isPenOpen}
            >
              {penFields.map(renderField)}
            </PenDetails>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { position: "relative" },
  // .anamnese-question-card + .anamnese-question-card: fio em cima e 28 px de ritmo.
  following: { paddingTop: 28, borderTopWidth: 1, borderTopColor: colors.border },
  // .anamnese-card-heading h3 na página: sobretítulo de 13 px, sem ícone nem selo.
  eyebrow: { marginBottom: 12 },
  fields: { gap: 28 },
}));
