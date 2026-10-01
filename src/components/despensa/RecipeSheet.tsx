import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChefHat } from "lucide-react";
import {
  COOK_COPY,
  newTimer,
  pauseTimer,
  resetTimer,
  startTimer,
  timerView,
  type StepTimer,
} from "../../lib/cook-timer";
import { tapFeedback } from "../../lib/haptics";
import { kitchenBasic } from "../../lib/kitchen-basics";
import { pantryEmoji } from "../../lib/pantry-view";
import {
  RECIPE_EXPIRED_ITEM,
  RECIPE_REMOVED_ITEM,
  type RecipeCoverage,
} from "../../lib/recipe-set";
import { visiblePlainText } from "../../lib/text";
import type { RecipeCard } from "../../types";
import { IconTile } from "../IconTile";
import { Modal } from "../UI";
import { CookStep } from "./CookStep";
import { RecipeChips, StepExtras } from "./RecipeBits";
import { useRecipeActions } from "./recipe-actions";
import { useWakeLock } from "./useWakeLock";
import "./Recipes.css";
import "./Cook.css";

interface Props {
  card: RecipeCard;
  /** Nome já mascarado (calorias ocultas): título do diálogo e dos rótulos. */
  name: string;
  coverage: RecipeCoverage;
  hide: boolean;
  onClose: () => void;
}

/** O relógio dos timers redesenha a cada segundo, só enquanto algum roda. */
const TICK_MS = 1000;

/**
 * Receita completa e o modo preparo em tela cheia (AGENTE-11): um passo por tela, timer por passo
 * (segue contando entre passos; zera ao sair do modo), tela acesa e, no fim, descontar da despensa.
 */
export function RecipeSheet({ card, name, coverage, hide, onClose }: Props) {
  const actions = useRecipeActions();
  const [step, setStep] = useState<number | null>(null);
  const [timers, setTimers] = useState<Record<number, StepTimer>>({});
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const announced = useRef(new Set<number>());
  const startButton = useRef<HTMLButtonElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const isReturning = useRef(false);
  const awake = useWakeLock(step !== null);
  useEffect(() => {
    if (step !== null) stepHeading.current?.focus();
    else if (isReturning.current) {
      isReturning.current = false;
      startButton.current?.focus();
    }
  }, [step]);

  const isRunning = Object.values(timers).some(
    (timer) => timerView(timer, now).state === "running",
  );
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [isRunning]);
  // Chegou a zero: anuncia uma vez por contagem e dá um toque curto (sem som).
  useEffect(() => {
    for (const [key, timer] of Object.entries(timers)) {
      const index = Number(key);
      if (timer.startedAt === null || announced.current.has(index)) continue;
      if (timerView(timer, now).state !== "done") continue;
      announced.current.add(index);
      setNote(COOK_COPY.done(index + 1));
      tapFeedback();
      return;
    }
  }, [timers, now]);

  const timerOf = (index: number) => {
    const minutes = card.passos[index]?.timerMin;
    if (minutes === null || minutes === undefined) return null;
    return timers[index] ?? newTimer(minutes);
  };
  const updateTimer = (index: number, change: (timer: StepTimer, at: number) => StepTimer) => {
    const timer = timerOf(index);
    if (!timer) return;
    const at = Date.now();
    setNow(at);
    setTimers((current) => ({ ...current, [index]: change(current[index] ?? timer, at) }));
  };
  const backToRecipe = () => {
    isReturning.current = true;
    setStep(null);
    setTimers({});
    setNote("");
    announced.current.clear();
  };
  const deduct = actions
    ? () => {
        onClose();
        actions.deduct(card, name);
      }
    : undefined;
  const current = step === null ? null : timerOf(step);
  return (
    <Modal
      title={name}
      onClose={onClose}
      className={step === null ? "recipe-sheet" : "recipe-sheet is-cooking"}
      overlayClassName={step === null ? undefined : "cook-overlay"}
    >
      <div data-testid="recipe-sheet" className="recipe-sheet-body">
        {step === null ? (
          <FullRecipe
            card={card}
            coverage={coverage}
            hide={hide}
            startRef={startButton}
            onStart={() => setStep(0)}
          />
        ) : (
          <CookStep
            card={card}
            step={step}
            hide={hide}
            headingRef={stepHeading}
            timer={current ? timerView(current, now) : null}
            awake={awake}
            note={note}
            onPrev={() => setStep(Math.max(0, step - 1))}
            onNext={() => setStep(Math.min(card.passos.length - 1, step + 1))}
            onFinish={backToRecipe}
            onDeduct={deduct}
            onStart={() => {
              const minutes = card.passos[step]?.timerMin ?? 0;
              const isResuming = (timers[step]?.elapsedSec ?? 0) > 0;
              updateTimer(step, startTimer);
              // "Continuar" não repete o "iniciado": o botão já diz o que aconteceu.
              setNote(isResuming ? "" : COOK_COPY.started(step + 1, minutes));
            }}
            onPause={() => {
              updateTimer(step, pauseTimer);
              setNote(COOK_COPY.paused);
            }}
            onReset={() => {
              updateTimer(step, (timer) => resetTimer(timer));
              announced.current.delete(step);
              setNote("");
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function FullRecipe({
  card,
  coverage,
  hide,
  startRef,
  onStart,
}: Omit<Props, "name" | "onClose"> & {
  startRef: RefObject<HTMLButtonElement | null>;
  onStart: () => void;
}) {
  const ids = { home: useId(), basics: useId(), buy: useId(), start: useId(), steps: useId() };
  const text = (value: string) => visiblePlainText(value, hide);
  const missing = new Set(coverage.unavailableIds);
  const expired = new Set(coverage.expiredIds);
  const hasExpired = expired.size > 0;
  /** Vencido na despensa: "venceu — não use"; removido dela: "não está mais na despensa". */
  const availability = (id: string) =>
    expired.has(id) ? RECIPE_EXPIRED_ITEM : missing.has(id) ? RECIPE_REMOVED_ITEM : null;
  return (
    <>
      <RecipeChips card={card} />
      <p className="recipe-compat">{text(card.compatibilidade)}</p>
      <h3 id={ids.home}>Na sua cozinha</h3>
      <ul className="recipe-ingredients" aria-labelledby={ids.home}>
        {card.ingredientesCasa.map((item) => (
          <li key={item.pantryItemId}>
            <IconTile size="sm" glyph={pantryEmoji(item.nome)} />
            <span className="recipe-ing-name">
              {text(item.nome)}
              {availability(item.pantryItemId) && ` · ${availability(item.pantryItemId)}`}
            </span>
            {item.quantidade && <span className="recipe-ing-qty">{text(item.quantidade)}</span>}
          </li>
        ))}
      </ul>
      {card.basicos.length > 0 && (
        <>
          <h3 id={ids.basics}>Básicos da cozinha</h3>
          <ul className="recipe-ingredients" aria-labelledby={ids.basics}>
            {card.basicos.map(({ basico, quantidade }) => (
              <li key={basico}>
                <span className="recipe-basic-emoji" aria-hidden="true">
                  {kitchenBasic(basico).emoji}
                </span>
                <span className="recipe-ing-name">{kitchenBasic(basico).label}</span>
                {quantidade && <span className="recipe-ing-qty">{text(quantidade)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {card.faltaComprar.length > 0 && (
        <>
          <h3 id={ids.buy}>Falta comprar</h3>
          <ul className="recipe-ingredients recipe-buy" aria-labelledby={ids.buy}>
            {card.faltaComprar.map((item, i) => (
              <li key={i}>
                <span className="recipe-buy-dot" aria-hidden="true" />
                <span className="recipe-ing-name">{text(item.nome)}</span>
                {item.quantidade && <span className="recipe-ing-qty">{text(item.quantidade)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 id={ids.steps}>Modo de preparo</h3>
      <ol className="recipe-steps" aria-labelledby={ids.steps}>
        {card.passos.map((step, i) => (
          <li key={i}>
            <span>{text(step.texto)}</span>
            <StepExtras step={step} />
          </li>
        ))}
      </ol>
      {card.porcao && (
        <>
          <h3>Porção</h3>
          <p className="recipe-portion">{text(card.porcao)}</p>
        </>
      )}
      <button
        ref={startRef}
        type="button"
        className="btn recipe-start"
        disabled={hasExpired}
        aria-describedby={hasExpired ? ids.start : undefined}
        onClick={onStart}
      >
        <ChefHat size={17} aria-hidden="true" />
        Começar modo preparo
      </button>
      {hasExpired && (
        <p id={ids.start} className="hint">
          Um ingrediente venceu: gere novas receitas.
        </p>
      )}
    </>
  );
}
