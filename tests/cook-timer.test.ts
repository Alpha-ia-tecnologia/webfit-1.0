import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COOK_COPY,
  fmtClock,
  newTimer,
  pauseTimer,
  resetTimer,
  startTimer,
  timerView,
} from "../src/lib/cook-timer";

test("timer do passo: parado, rodando pelo relógio, pausado, continuado até zero e zerado", () => {
  const t = newTimer(25);
  assert.deepEqual(t, { totalSec: 1500, startedAt: null, elapsedSec: 0 });
  assert.deepEqual(timerView(t, 0), { remainingSec: 1500, fraction: 0, clock: "25:00", state: "idle" });

  const running = startTimer(t, 1000);
  assert.deepEqual(timerView(running, 61_000), { remainingSec: 1440, fraction: 0.04, clock: "24:00", state: "running" });
  assert.equal(timerView(running, 61_500).remainingSec, 1440);
  assert.equal(startTimer(running, 5000), running);

  const paused = pauseTimer(running, 61_000);
  assert.deepEqual(paused, { totalSec: 1500, startedAt: null, elapsedSec: 60 });
  for (const now of [61_000, 500_000, 9_999_999])
    assert.deepEqual(timerView(paused, now), { remainingSec: 1440, fraction: 0.04, clock: "24:00", state: "paused" });
  assert.equal(pauseTimer(paused, 70_000), paused);

  const resumed = startTimer(paused, 100_000);
  assert.deepEqual(timerView(resumed, 1_540_000), { remainingSec: 0, fraction: 1, clock: "0:00", state: "done" });
  assert.deepEqual(timerView(resumed, 9_000_000), { remainingSec: 0, fraction: 1, clock: "0:00", state: "done" });
  const finished = pauseTimer(resumed, 2_000_000);
  assert.equal(finished.elapsedSec, 1500);
  assert.equal(startTimer(finished, 2_100_000), finished);

  const reset = resetTimer(resumed);
  assert.deepEqual(reset, { totalSec: 1500, startedAt: null, elapsedSec: 0 });
  assert.equal(timerView(reset, 3_000_000).state, "idle");
  assert.equal(t.startedAt, null);
});

test("relógio e textos do modo preparo", () => {
  assert.equal(fmtClock(1500), "25:00");
  assert.equal(fmtClock(65), "1:05");
  assert.equal(fmtClock(9), "0:09");
  assert.equal(fmtClock(0), "0:00");
  assert.equal(fmtClock(3900), "1:05:00");
  assert.equal(COOK_COPY.startLabel(25), "Iniciar timer de 25 min");
  assert.equal(COOK_COPY.startLabel(90), "Iniciar timer de 1 h 30 min");
  assert.equal(COOK_COPY.started(2, 25), "Timer do passo 2 iniciado: 25 min.");
  assert.equal(COOK_COPY.done(2), "Tempo do passo 2 concluído.");
  assert.deepEqual(COOK_COPY.deductChoices, { keep: "Não mexer", left: "Sobrou", gone: "Acabou" });
});
