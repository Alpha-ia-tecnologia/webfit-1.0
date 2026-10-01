import { test } from "node:test";
import assert from "node:assert/strict";
import { lazyScreen, whenIdle } from "../src/lib/lazy-screen";

const Screen = () => null;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("preload baixa a tela uma vez só, por mais que seja chamado", async () => {
  let calls = 0;
  const screen = lazyScreen(
    async () => {
      calls++;
      return { Screen };
    },
    (module) => module.Screen,
  );
  screen.preload();
  screen.preload();
  await flush();
  screen.preload();
  assert.equal(calls, 1);
});

test("preload que falha não fica guardado: a próxima tentativa baixa de novo, sem erro solto", async () => {
  let calls = 0;
  const screen = lazyScreen(
    async () => {
      calls++;
      if (calls === 1) throw new Error("chunk ausente");
      return { Screen };
    },
    (module) => module.Screen,
  );
  screen.preload();
  await flush();
  screen.preload();
  await flush();
  assert.equal(calls, 2);
});

test("whenIdle usa requestIdleCallback quando existe e o cancelamento o desfaz", () => {
  const ran: string[] = [];
  const host = {
    requestIdleCallback: (task: () => void, options?: { timeout: number }) => {
      ran.push(`idle:${options?.timeout}`);
      task();
      return 7;
    },
    cancelIdleCallback: (handle: number) => ran.push(`cancel:${handle}`),
    setTimeout: () => {
      throw new Error("não deveria usar setTimeout");
    },
    clearTimeout: () => undefined,
  };
  const cancel = whenIdle(() => ran.push("task"), host);
  cancel();
  assert.deepEqual(ran, ["idle:4000", "task", "cancel:7"]);
});

test("whenIdle sem requestIdleCallback (Safari) espera com setTimeout", () => {
  const ran: string[] = [];
  const host = {
    setTimeout: (task: () => void, ms: number) => {
      ran.push(`timeout:${ms}`);
      task();
      return 3;
    },
    clearTimeout: (handle: number) => ran.push(`clear:${handle}`),
  };
  whenIdle(() => ran.push("task"), host)();
  assert.deepEqual(ran, ["timeout:1500", "task", "clear:3"]);
});
