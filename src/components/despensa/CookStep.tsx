import type { RefObject } from "react";
import { PackageMinus, Sun } from "lucide-react";
import { COOK_COPY, type TimerView } from "../../lib/cook-timer";
import { visiblePlainText } from "../../lib/text";
import type { RecipeCard } from "../../types";
import { StepExtras } from "./RecipeBits";
import { StepTimer } from "./StepTimer";
import type { WakeLockState } from "./useWakeLock";

type Props = {
  card: RecipeCard;
  /** Passo atual (0…n-1). */
  step: number;
  hide: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Timer do passo (quando a receita traz os minutos). */
  timer: TimerView | null;
  awake: WakeLockState;
  /** Último anúncio do timer ("Timer pausado.", "Tempo do passo 2 concluído."). */
  note: string;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** Só na Despensa (RecipeActionsContext); fecha a folha e abre "Descontar da despensa". */
  onDeduct?: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
};

/**
 * Um passo do modo preparo em tela cheia (AGENTE-11): texto grande, extras do passo, timer, tela
 * acesa e, no último passo, "Concluir preparo" e "Descontar da despensa".
 */
export function CookStep({
  card,
  step,
  hide,
  headingRef,
  timer,
  awake,
  note,
  onPrev,
  onNext,
  onFinish,
  onDeduct,
  onStart,
  onPause,
  onReset,
}: Props) {
  const current = card.passos[step]!;
  const isLast = step >= card.passos.length - 1;
  return (
    <div data-testid="recipe-step-mode" className="recipe-step-mode cook-step">
      <div className="cook-top">
        <h3 ref={headingRef} tabIndex={-1}>
          {`Passo ${step + 1} de ${card.passos.length}`}
        </h3>
        {awake === "on" && (
          <span className="cook-awake" role="status">
            <Sun size={14} aria-hidden="true" />
            {COOK_COPY.awake}
          </span>
        )}
      </div>
      <span className="cook-progress" aria-hidden="true">
        {card.passos.map((_, index) => (
          <span key={index} className={index <= step ? "is-done" : undefined} />
        ))}
      </span>
      <p className="recipe-step-text">{visiblePlainText(current.texto, hide)}</p>
      <StepExtras step={current} />
      {timer && current.timerMin !== null && (
        <StepTimer
          minutes={current.timerMin}
          view={timer}
          onStart={onStart}
          onPause={onPause}
          onReset={onReset}
        />
      )}
      <div className="recipe-step-actions">
        <button type="button" className="btn-secondary" disabled={step === 0} onClick={onPrev}>
          Passo anterior
        </button>
        {isLast ? (
          <button type="button" className="btn" onClick={onFinish}>
            Concluir preparo
          </button>
        ) : (
          <button type="button" className="btn" onClick={onNext}>
            Próximo passo
          </button>
        )}
      </div>
      {isLast && onDeduct && (
        <button type="button" className="btn-secondary cook-deduct" onClick={onDeduct}>
          <PackageMinus size={17} aria-hidden="true" />
          {COOK_COPY.deduct}
        </button>
      )}
      {awake === "unavailable" && <p className="cook-awake-hint">{COOK_COPY.awakeHint}</p>}
      <button type="button" className="text-btn" onClick={onFinish}>
        Ver receita completa
      </button>
      <p className="sr-only" role="status">
        {note}
      </p>
    </div>
  );
}
