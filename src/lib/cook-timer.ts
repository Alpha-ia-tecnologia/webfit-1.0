import { fmtMinutes } from "./recipe-set";

/**
 * Timers do modo preparo (AGENTE-11): um por passo, calculados a partir do relógio (Date.now()),
 * então continuam certos entre passos, com a aba em segundo plano ou após um travamento da tela.
 * Funções puras; a tela só guarda o estado e redesenha a cada segundo enquanto roda.
 */

export interface StepTimer {
  totalSec: number;
  /** Instante (ms) em que a contagem atual começou; null = parado. */
  startedAt: number | null;
  /** Segundos já contados antes de `startedAt` (pausas). */
  elapsedSec: number;
}
export type TimerState = "idle" | "running" | "paused" | "done";
export interface TimerView {
  remainingSec: number;
  /** 0 → 1 (anel do timer). */
  fraction: number;
  clock: string;
  state: TimerState;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Segundos contados até `now` (sem passar do total). */
function elapsedAt(t: StepTimer, now: number): number {
  const running = t.startedAt === null ? 0 : Math.max(0, now - t.startedAt) / 1000;
  return Math.min(t.totalSec, t.elapsedSec + running);
}

export function newTimer(minutes: number): StepTimer {
  return { totalSec: Math.max(0, Math.round(minutes * SECONDS_PER_MINUTE)), startedAt: null, elapsedSec: 0 };
}

/** Inicia ou continua; sem efeito se já está rodando ou terminou. */
export function startTimer(t: StepTimer, now: number): StepTimer {
  if (t.startedAt !== null || t.elapsedSec >= t.totalSec) return t;
  return { ...t, startedAt: now };
}

/** Pausa guardando o que já contou; sem efeito se está parado. */
export function pauseTimer(t: StepTimer, now: number): StepTimer {
  if (t.startedAt === null) return t;
  return { ...t, startedAt: null, elapsedSec: elapsedAt(t, now) };
}

export function resetTimer(t: StepTimer): StepTimer {
  return { totalSec: t.totalSec, startedAt: null, elapsedSec: 0 };
}

/** remaining = ceil(total − elapsed − (now − startedAt)/1000), ≥ 0; fraction = 1 − remaining/total. */
export function timerView(t: StepTimer, now: number): TimerView {
  const remainingSec = Math.max(0, Math.ceil(t.totalSec - elapsedAt(t, now)));
  const fraction = t.totalSec ? round4(1 - remainingSec / t.totalSec) : 1;
  const state: TimerState =
    remainingSec === 0
      ? "done"
      : t.startedAt !== null
        ? "running"
        : t.elapsedSec > 0
          ? "paused"
          : "idle";
  return { remainingSec, fraction, clock: fmtClock(remainingSec), state };
}

/** "25:00", "1:05", "0:09", "1:05:00". */
export function fmtClock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export const COOK_COPY = {
  awake: "Tela acesa",
  awakeHint: "Se a tela apagar, toque nela para continuar.",
  start: "Iniciar",
  startLabel: (min: number) => `Iniciar timer de ${fmtMinutes(min)}`,
  pause: "Pausar",
  pauseLabel: "Pausar timer",
  resume: "Continuar",
  resumeLabel: "Continuar timer",
  reset: "Zerar",
  resetLabel: "Zerar timer",
  started: (step: number, min: number) => `Timer do passo ${step} iniciado: ${fmtMinutes(min)}.`,
  paused: "Timer pausado.",
  done: (step: number) => `Tempo do passo ${step} concluído.`,
  deduct: "Descontar da despensa",
  deductConfirm: "Atualizar despensa",
  deducted: "Despensa atualizada.",
  deductUndone: "Despensa como antes.",
  deductChoices: { keep: "Não mexer", left: "Sobrou", gone: "Acabou" },
} as const;
