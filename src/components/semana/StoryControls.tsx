import { useRef } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { STORY_SLIDE_MS } from "../../lib/week-recap";

/**
 * Barra de partes dos stories: a parte ativa enche pela animação CSS (sem temporizador em JS) e, ao
 * terminar, avança (`onEnd`), nunca depois da última.
 */
export function StoryProgress({
  titles,
  index,
  last,
  onEnd,
}: {
  titles: readonly string[];
  index: number;
  last: number;
  onEnd: () => void;
}) {
  return (
    <div className="story-progress" aria-hidden="true">
      {titles.map((title, i) => {
        const isActive = i === index;
        const isDone = i < index || (isActive && index === last);
        return (
          <span
            key={`${i}-${title}`}
            className={`story-seg${isDone ? " is-done" : ""}${isActive ? " is-active" : ""}`}
          >
            <i
              style={isActive ? { animationDuration: `${STORY_SLIDE_MS}ms` } : undefined}
              onAnimationEnd={isActive && index < last ? onEnd : undefined}
            />
          </span>
        );
      })}
    </div>
  );
}

/** "Anterior", pausa (sem ela com movimento reduzido) e "Próximo", que vira "Concluir" na última parte. */
export function StoryControls({
  index,
  last,
  isReduced,
  isPaused,
  onTogglePause,
  onPrevious,
  onNext,
  onDone,
}: {
  index: number;
  last: number;
  isReduced: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const nextButton = useRef<HTMLButtonElement>(null);
  const handlePrevious = () => {
    // "Anterior" fica desabilitado na parte 1: o foco passa para "Próximo" antes.
    if (index === 1) nextButton.current?.focus();
    onPrevious();
  };
  return (
    <div className="story-controls">
      <button type="button" className="btn-secondary" onClick={handlePrevious} disabled={index === 0}>
        <ChevronLeft size={18} aria-hidden="true" />
        Anterior
      </button>
      {isReduced ? (
        <span aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="icon-btn story-pause"
          aria-label={isPaused ? "Retomar avanço automático" : "Pausar avanço automático"}
          onClick={onTogglePause}
        >
          {isPaused ? <Play size={20} /> : <Pause size={20} />}
        </button>
      )}
      {/* O mesmo botão vira "Concluir" na última parte: o foco não se perde na troca. */}
      <button ref={nextButton} type="button" className="btn" data-autofocus onClick={index < last ? onNext : onDone}>
        {index < last ? (
          <>
            Próximo
            <ChevronRight size={18} aria-hidden="true" />
          </>
        ) : (
          "Concluir"
        )}
      </button>
    </div>
  );
}
