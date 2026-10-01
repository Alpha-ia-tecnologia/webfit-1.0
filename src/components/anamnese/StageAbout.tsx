import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { ANAMNESE_ABOUT_TIPS } from "../../lib/copy";

/** "Por quê?" da etapa: o botão entra na linha de ajuda da 1ª pergunta; o painel logo abaixo dela. */
export type AboutSlot = { button: ReactNode; panel: ReactNode };

/** As mesmas dicas no web e no app. */
export const ABOUT_TIPS = ANAMNESE_ABOUT_TIPS;

/**
 * Monta o "ⓘ Por quê?" (nome acessível "Por quê? Mais sobre esta etapa") e o painel com o resumo,
 * a descrição completa da etapa, as dicas e "Continuar depois". Sem estado: a tela guarda o aberto.
 */
export function stageAbout({
  id,
  isOpen,
  onToggle,
  summary,
  description,
  onLeave,
  isLeaveDisabled,
}: {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  summary: string;
  description: string;
  /** "Continuar depois": sai salvando (primeiro acesso) ou volta ao Meu espaço. */
  onLeave?: () => void;
  isLeaveDisabled?: boolean;
}): AboutSlot {
  return {
    button: (
      <button
        type="button"
        className="q-about"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={onToggle}
      >
        <Info size={16} aria-hidden="true" />
        Por quê?
        <span className="sr-only"> Mais sobre esta etapa</span>
      </button>
    ),
    panel: isOpen ? (
      <div id={id} className="anamnese-about">
        <p>{summary}</p>
        {description !== summary && <p>{description}</p>}
        <p className="anamnese-about-tips">{ABOUT_TIPS}</p>
        {onLeave && (
          <button
            type="button"
            className="text-btn"
            disabled={isLeaveDisabled}
            onClick={onLeave}
          >
            Continuar depois
          </button>
        )}
      </div>
    ) : (
      <div id={id} hidden />
    ),
  };
}
