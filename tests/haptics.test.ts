import test from "node:test";
import assert from "node:assert/strict";
import { tapFeedback } from "../src/lib/haptics";
import { withGlobals } from "./fixtures";

/** Confirma se `navigator.vibrate` foi chamado, e com qual duração (ms). */
function withVibrate(matches: boolean | undefined, run: () => void): number[] {
  const calls: number[] = [];
  const overrides: Record<string, unknown> = {
    navigator: { vibrate: (ms: number) => void calls.push(ms) },
  };
  if (matches !== undefined) {
    overrides.matchMedia = (query: string) => ({ media: query, matches });
  } else {
    overrides.matchMedia = undefined;
  }
  withGlobals(overrides, run);
  return calls;
}

test("tapFeedback: sem navigator ou sem vibrate, não faz nada e não lança", () => {
  withGlobals({ navigator: undefined }, () => tapFeedback());
  withGlobals({ navigator: {} }, () => tapFeedback());
  withGlobals({ navigator: { vibrate: "não é função" } }, () => tapFeedback());
});

test("tapFeedback: vibra 8ms quando a Vibration API existe e não há movimento reduzido", () => {
  const calls = withVibrate(false, () => tapFeedback());
  assert.deepEqual(calls, [8]);
});

test("tapFeedback: sem matchMedia disponível, vibra do mesmo jeito", () => {
  const calls = withVibrate(undefined, () => tapFeedback());
  assert.deepEqual(calls, [8]);
});

test("tapFeedback: com prefers-reduced-motion, não vibra", () => {
  const calls = withVibrate(true, () => tapFeedback());
  assert.deepEqual(calls, []);
});
