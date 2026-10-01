import { motion } from "motion/react";
import { ChevronLeft, CloudAlert, CloudCheck } from "lucide-react";

export type SaveStatus = "" | "saved" | "failed";

type Props = {
  step: number;
  total: number;
  /** Nome da etapa: aparece depois de "Etapa N de 8" (desenhado por CSS, sem repetir o texto do título). */
  title: string;
  /** Nome curto na barra ("Seu plano"); o anúncio do progresso continua com o título. */
  short?: string;
  /** Respostas essenciais da etapa atual: preenchem o segmento dela. */
  answered: number;
  required: number;
  saveStatus: SaveStatus;
  backLabel: string;
  isBackDisabled: boolean;
  onBack: () => void;
  reducedMotion: boolean;
  /** Texto no lugar de "Etapa X de Y" (editor de uma seção só: "Editar seção"). */
  label?: string;
  /** Sem a barra de etapas (editor de uma seção só). */
  hideProgress?: boolean;
};

/**
 * Barra única da anamnese: voltar, "Etapa 3 de 8 · Histórico de saúde" e o selo "Salvo", com um
 * segmento por etapa. O segmento atual enche (em degradê) conforme as respostas essenciais.
 */
export function StepBar({
  step,
  total,
  title,
  short,
  answered,
  required,
  saveStatus,
  backLabel,
  isBackDisabled,
  onBack,
  reducedMotion,
  label,
  hideProgress = false,
}: Props) {
  const current = required ? answered / required : 1;
  const fillOf = (index: number) =>
    index < step ? 1 : index === step ? current : 0;
  const essentials = required
    ? `, ${answered} de ${required} respostas essenciais`
    : "";
  return (
    <div className="anamnese-bar-sticky">
      <div className="anamnese-bar">
        <button
          type="button"
          className="icon-btn anamnese-bar-back"
          aria-label={backLabel}
          disabled={isBackDisabled}
          onClick={onBack}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <p className="anamnese-bar-center">
          <strong data-testid="anamnese-bar-text">
            {label ?? `Etapa ${step + 1} de ${total}`}
          </strong>
          {/* O nome da etapa já é o título (h2) da página: aqui só se desenha, sem repetir no texto. */}
          <span className="anamnese-bar-title" data-title={short ?? title} aria-hidden="true" />
        </p>
        <span className="anamnese-saved-slot" aria-live="polite">
          {saveStatus === "saved" && (
            <span className="anamnese-saved">
              <CloudCheck size={16} aria-hidden="true" />
              <span className="anamnese-saved-text">Salvo</span>
              <span className="sr-only"> neste navegador</span>
            </span>
          )}
          {saveStatus === "failed" && (
            <span className="anamnese-saved is-failed">
              <CloudAlert size={16} aria-hidden="true" />
              <span className="anamnese-saved-text">Não salvo</span>
            </span>
          )}
        </span>
      </div>
      {!hideProgress && (
        <div
          className="anamnese-step-progress"
          role="progressbar"
          aria-label="Etapas da anamnese"
          aria-valuenow={step + 1}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuetext={`Etapa ${step + 1} de ${total}: ${title}${essentials}`}
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={[
                fillOf(index) >= 1 ? "is-filled" : "",
                index === step ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <motion.span
                initial={false}
                animate={{ scaleX: fillOf(index) }}
                transition={{ duration: reducedMotion ? 0 : 0.3 }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
