import { test } from "node:test";
import assert from "node:assert/strict";
import { slidingWindow } from "../server/rate-limit";

test("slidingWindow: recusa acima do limite dentro da janela e libera quando ela passa", () => {
  // Arrange
  const window = slidingWindow(3, 60_000);
  const t0 = 1_000_000;
  // Act
  const first = [0, 1, 2].map((i) => window.hit("192.168.0.20", t0 + i));
  const fourth = window.hit("192.168.0.20", t0 + 10);
  const afterWindow = window.hit("192.168.0.20", t0 + 60_000);
  // Assert
  assert.deepEqual(first, [false, false, false]);
  assert.equal(fourth, true);
  assert.equal(afterWindow, false);
});

test("slidingWindow: cada aparelho tem a sua janela e consultas recusadas não contam", () => {
  const window = slidingWindow(2, 60_000);
  const t0 = 5_000;
  window.hit("a", t0);
  window.hit("a", t0 + 1);
  // Recusadas várias vezes: ao abrir a janela, volta a aceitar sem esperar as recusas vencerem.
  for (let i = 0; i < 5; i++) assert.equal(window.hit("a", t0 + 2 + i), true);
  assert.equal(window.hit("b", t0 + 3), false);
  assert.equal(window.hit("a", t0 + 60_001), false);
});
