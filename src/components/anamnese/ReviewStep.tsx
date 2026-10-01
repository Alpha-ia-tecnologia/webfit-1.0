import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { AI_CONSENT_VERSION } from "../../lib/consent";
import { goalsFor, localDate } from "../../lib/domain";
import { localTime } from "../../lib/dates";
import { PEN_KEYS, penLastPreview } from "../../lib/pen-setup";
import { planIntro, planVariant } from "../../lib/plan-reveal";
import { profileSchema, type Draft } from "../../types";
import { REVIEW_DISCLAIMER } from "./AdjustSheet";
import { ExamAttachments } from "./ExamAttachments";
import { PlanReveal } from "./PlanReveal";

/**
 * Última etapa: o plano inicial revelado ("Seu plano inicial, Nome"), o anexo opcional de exames e
 * as legendas finais. As respostas por etapa ficam na folha "Ajustar" (AdjustSheet).
 */
export function ReviewStep({
  answers,
  selectedExams,
  onSelectExams,
  busy,
  onExamBusy,
  hasErrors,
  overallPercent,
  aiReady,
  reducedMotion,
  animateReveal,
  onRevealed,
  injectionsCount,
  onChange,
  bodyHidden = false,
}: {
  answers: Draft;
  selectedExams: string[];
  onSelectExams: (ids: string[]) => void;
  busy: boolean;
  onExamBusy: (busy: boolean) => void;
  hasErrors: boolean;
  overallPercent: number;
  aiReady: boolean;
  reducedMotion: boolean;
  /** Carregamento do plano: só ao chegar aqui pela etapa anterior. */
  animateReveal: boolean;
  onRevealed: () => void;
  injectionsCount: number;
  onChange: (key: string, value: string | boolean) => void;
  /** "Ocultar números do corpo" (ESPACO-13): aviso no topo e sem projeção de peso. */
  bodyHidden?: boolean;
}) {
  const today = localDate();
  const result = profileSchema.safeParse({
    ...answers,
    aiConsentVersion: AI_CONSENT_VERSION,
  });
  const preview = penLastPreview(answers, today, localTime());
  // Só quando a conclusão vai mesmo registrar: confirmada, sem aplicação anterior e válida.
  const pending =
    answers[PEN_KEYS.confirmed] === true &&
    answers.weightLossPen === "sim" &&
    injectionsCount === 0 &&
    preview.block === null
      ? preview
      : null;
  const plan = result.success
    ? (() => {
        const goals = goalsFor(result.data, today);
        return {
          profile: result.data,
          goals,
          variant: planVariant(result.data, goals, today),
        };
      })()
    : null;
  return (
    <>
      {bodyHidden && <p className="notice">{BODY_PRIVACY_COPY.anamneseNotice}</p>}
      {plan ? (
        <PlanReveal
          profile={plan.profile}
          goals={plan.goals}
          variant={plan.variant}
          today={today}
          animate={animateReveal}
          // Confete só no plano completo (nunca no de hábitos).
          celebrate={overallPercent === 100 && plan.variant === "completo"}
          pending={pending}
          reducedMotion={reducedMotion}
          bodyHidden={bodyHidden}
          onAnimated={onRevealed}
          onCancelPen={() => onChange(PEN_KEYS.confirmed, false)}
          onToggleHideCalories={() =>
            onChange("hideCalories", answers.hideCalories !== true)
          }
        />
      ) : (
        <div role="alert" className="notice error">
          Há respostas pendentes. Volte às etapas indicadas para completar a
          anamnese.
        </div>
      )}
      <ExamAttachments
        selected={selectedExams}
        onSelect={onSelectExams}
        disabled={busy}
        consentAi={!!answers.consentAi}
        onBusy={onExamBusy}
      />
      <p className="plan-footnote">
        {planIntro(answers.consentAi === true && aiReady)} {REVIEW_DISCLAIMER}
      </p>
      {hasErrors && (
        <p className="field-error" role="alert">
          Revise as respostas pendentes antes de concluir.
        </p>
      )}
    </>
  );
}
