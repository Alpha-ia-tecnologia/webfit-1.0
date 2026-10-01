import { useCallback, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { slideTitles, type WeekRecap } from "../../lib/week-recap";
import { weekShare } from "../../lib/week-share";
import { Modal } from "../UI";
import { RecapSlide } from "./RecapSlides";
import { ShareImageSheet } from "./ShareImageSheet";
import { useDocumentHidden, useKeyboardFocusPause, useStoryArrowKeys, useStorySwipe } from "./story-hooks";
import { StoryControls, StoryProgress } from "./StoryControls";
import "./WeekRecap.css";

const PARTS = 5;
const LAST = PARTS - 1;

/**
 * Stories de "Sua semana" (EVOL-05): 5 partes com avanço automático de 6 s pela animação da barra
 * (sem temporizador em JS). Pausa com o botão, ao segurar, com a aba oculta, com a folha da imagem
 * aberta ou com foco de teclado na parte; com movimento reduzido, só avanço manual. Setas, deslizar
 * e tocar trocam de parte; Esc fecha (Modal).
 */
export function WeekStories({ recap, onClose }: { recap: WeekRecap; onClose: () => void }) {
  const titles = slideTitles(recap);
  const share = useMemo(() => weekShare(recap), [recap]);
  const isReduced = !!useReducedMotion();
  const [index, setIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);
  const [isShareOpen, setShareOpen] = useState(false);
  const isHidden = useDocumentHidden();
  const next = useCallback(() => setIndex((i) => Math.min(LAST, i + 1)), []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  // A folha da imagem, por cima, fica com as setas do teclado.
  useStoryArrowKeys(!isShareOpen, next, prev);
  const swipe = useStorySwipe(next, prev);
  const focus = useKeyboardFocusPause();
  const isPlaying =
    !isReduced &&
    !isPaused &&
    !swipe.isHeld &&
    !isHidden &&
    !isShareOpen &&
    !focus.hasKeyboardFocus &&
    index < LAST;

  return (
    <Modal title="Sua semana" onClose={onClose} className="stories-modal" overlayClassName="stories-overlay">
      <div className={isPlaying ? "stories" : "stories is-paused"} data-testid="week-stories">
        <StoryProgress titles={titles} index={index} last={LAST} onEnd={next} />
        <p className="sr-only" aria-live={isPlaying ? "off" : "polite"}>
          {`Parte ${index + 1} de ${PARTS}: ${titles[index]}`}
        </p>
        <div
          className="story-stage"
          role="region"
          aria-roledescription="carrossel"
          aria-label={`Sua semana em ${PARTS} partes`}
          onPointerDown={swipe.onPointerDown}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerCancel}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
        >
          <div
            key={index}
            className="story-slide"
            role="group"
            aria-roledescription="parte"
            aria-label={`${index + 1} de ${PARTS}: ${titles[index]}`}
          >
            <RecapSlide recap={recap} index={index} onShare={() => setShareOpen(true)} />
          </div>
        </div>
        <StoryControls
          index={index}
          last={LAST}
          isReduced={isReduced}
          isPaused={isPaused}
          onTogglePause={() => setPaused((value) => !value)}
          onPrevious={prev}
          onNext={next}
          onDone={onClose}
        />
      </div>
      {isShareOpen && <ShareImageSheet share={share} onClose={() => setShareOpen(false)} />}
    </Modal>
  );
}
