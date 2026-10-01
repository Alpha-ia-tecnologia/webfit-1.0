import { Pause, Play, RotateCcw } from "lucide-react";
import { arcDash } from "../../lib/charts";
import { COOK_COPY, type TimerView } from "../../lib/cook-timer";

const CENTER = 60;
const RADIUS = 52;
const STROKE = 8;

type Props = {
  /** Minutos do passo (recipe timerMin, 1–240). */
  minutes: number;
  view: TimerView;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
};

/**
 * Timer de um passo (AGENTE-11): anel que enche conforme o tempo passa e o relógio no centro. A
 * conta vem do relógio (cook-timer.ts); o anúncio "iniciado/pausado/concluído" fica na folha.
 */
export function StepTimer({ minutes, view, onStart, onPause, onReset }: Props) {
  const percent = view.fraction * 100;
  return (
    <div className="cook-timer" data-testid="cook-timer">
      <span className={`cook-ring is-${view.state}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle
            className="cook-ring-track"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          {percent > 0 && (
            <circle
              className="cook-ring-fill"
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={arcDash(RADIUS, percent)}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          )}
        </svg>
        <span className="cook-clock" role="timer">
          {view.clock}
        </span>
      </span>
      <div className="cook-timer-actions">
        {view.state === "idle" && (
          <button
            type="button"
            className="btn"
            aria-label={COOK_COPY.startLabel(minutes)}
            onClick={onStart}
          >
            <Play size={16} aria-hidden="true" />
            {COOK_COPY.start}
          </button>
        )}
        {view.state === "running" && (
          <button
            type="button"
            className="btn-secondary"
            aria-label={COOK_COPY.pauseLabel}
            onClick={onPause}
          >
            <Pause size={16} aria-hidden="true" />
            {COOK_COPY.pause}
          </button>
        )}
        {view.state === "paused" && (
          <button
            type="button"
            className="btn"
            aria-label={COOK_COPY.resumeLabel}
            onClick={onStart}
          >
            <Play size={16} aria-hidden="true" />
            {COOK_COPY.resume}
          </button>
        )}
        {view.state !== "idle" && (
          <button
            type="button"
            className="btn-secondary"
            aria-label={COOK_COPY.resetLabel}
            onClick={onReset}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {COOK_COPY.reset}
          </button>
        )}
      </div>
    </div>
  );
}
