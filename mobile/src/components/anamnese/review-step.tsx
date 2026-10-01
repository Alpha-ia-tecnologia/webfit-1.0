import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { AI_CONSENT_VERSION } from "@shared/lib/consent";
import { localTime } from "@shared/lib/dates";
import { goalsFor, localDate } from "@shared/lib/domain";
import { PEN_KEYS, penLastPreview } from "@shared/lib/pen-setup";
import { planIntro, planVariant, REVIEW_DISCLAIMER } from "@shared/lib/plan-reveal";
import { profileSchema, type Draft } from "@shared/types";
import { AppText, Notice } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { ExamAttachments } from "./exam-attachments";
import { PlanReveal } from "./plan-reveal";

type Props = {
  answers: Draft;
  selectedExams: string[];
  onSelectExams: (ids: string[]) => void;
  busy: boolean;
  onExamBusy: (busy: boolean) => void;
  hasErrors: boolean;
  aiReady: boolean;
  /** Logo depois de "Salvar e continuar" na etapa anterior: a montagem do plano aparece uma vez. */
  animateReveal: boolean;
  injectionsCount: number;
  onChange: (key: string, value: string | boolean) => void;
};

/**
 * Última etapa: o plano inicial revelado ("Seu plano inicial, Nome"), o anexo opcional de exames e a
 * legenda final. As respostas por etapa ficam na folha "Ajustar" (adjust-sheet.tsx).
 */
export function ReviewStep({
  answers,
  selectedExams,
  onSelectExams,
  busy,
  onExamBusy,
  hasErrors,
  aiReady,
  animateReveal,
  injectionsCount,
  onChange,
}: Props) {
  const colors = useThemeColors();
  // "Ocultar números do corpo" (ESPACO-13): aviso no topo e sem projeção de peso.
  const bodyHidden = useApp().state.profile?.hideBodyNumbers === true;
  const today = localDate();
  const result = profileSchema.safeParse({
    ...answers,
    aiConsentVersion: AI_CONSENT_VERSION,
  });
  const preview = penLastPreview(answers, today, localTime());
  // Só quando concluir vai mesmo registrar: confirmado, com caneta, primeira aplicação e pré-visualização válida.
  const pending =
    answers[PEN_KEYS.confirmed] === true &&
    answers.weightLossPen === "sim" &&
    injectionsCount === 0 &&
    preview.block === null
      ? preview
      : null;
  const goals = result.success ? goalsFor(result.data, today) : null;
  return (
    <>
      {bodyHidden ? <Notice>{BODY_PRIVACY_COPY.anamneseNotice}</Notice> : null}
      {result.success && goals ? (
        <PlanReveal
          profile={result.data}
          goals={goals}
          variant={planVariant(result.data, goals, today)}
          today={today}
          animate={animateReveal}
          pending={pending}
          bodyHidden={bodyHidden}
          onCancelPen={() => onChange(PEN_KEYS.confirmed, false)}
          onToggleHideCalories={() => onChange("hideCalories", answers.hideCalories !== true)}
        />
      ) : (
        <Notice tone="error">
          Há respostas pendentes. Volte às etapas indicadas para completar a
          anamnese.
        </Notice>
      )}
      <ExamAttachments
        selected={selectedExams}
        onSelect={onSelectExams}
        disabled={busy}
        consentAi={!!answers.consentAi}
        onBusy={onExamBusy}
      />
      <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
        {`${planIntro(answers.consentAi === true && aiReady)} ${REVIEW_DISCLAIMER}`}
      </AppText>
      {hasErrors && (
        <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
          Revise as respostas pendentes antes de concluir.
        </AppText>
      )}
    </>
  );
}
