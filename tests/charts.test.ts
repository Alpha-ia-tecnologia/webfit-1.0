import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arcDash,
  arcLength,
  arcPath,
  bandPosition,
  circumference,
  donutArcs,
  relativeHeights,
  ringSegments,
  segmentFill,
  sparklinePath,
  thirdArcs,
} from "../src/lib/charts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("arco do anel respeita 0–100% e começa sem ponto quando vazio", () => {
  close(arcLength(10, 50), Math.PI * 10);
  close(arcLength(10, 150), circumference(10));
  assert.equal(arcLength(10, -5), 0);
  assert.equal(arcDash(10, 0), `0 ${circumference(10)}`);
});

test("segmentos iguais com folga cobrem o anel inteiro", () => {
  const segments = ringSegments(70, 3, 10);
  assert.equal(segments.length, 3);
  close(segments.reduce((sum, s) => sum + s.length, 0) + 3 * 10, circumference(70));
  close(segments[1]!.offset, -(segments[0]!.length + 10));
  close(segmentFill(segments[0]!, 50), segments[0]!.length / 2);
  // Um único segmento não tem folga.
  close(ringSegments(11, 1, 3)[0]!.length, circumference(11));
});

test("rosca proporcional: fatias somam o anel e fatias vazias somem", () => {
  const arcs = donutArcs(34, [25, 50, 25], 4);
  close(arcs.reduce((sum, a) => sum + a.length, 0) + 3 * 4, circumference(34));
  close(arcs[1]!.offset, -circumference(34) * 0.25);
  const partial = donutArcs(34, [0, 100, 0], 4);
  assert.equal(partial[0]!.length, 0);
  close(partial[1]!.length, circumference(34));
  assert.ok(donutArcs(34, [0, 0, 0], 4).every((a) => a.length === 0));
});

test("régua de faixas iguais: o limite superior fica na faixa de baixo e fora dos limites grampeia", () => {
  const limits = [0, 1, 2, 3, 4];
  close(bandPosition(limits, 1), 21.25);
  close(bandPosition(limits, -2), 3.75);
  close(bandPosition(limits, 0), 3.75);
  close(bandPosition(limits, 9), 96.25);
  close(bandPosition(limits, 2.5), 62.5);
  close(bandPosition(limits, Number.NaN), 3.75);
  assert.equal(bandPosition([5], 5), 0);
});

test("alturas relativas ao maior valor, com piso para valores pequenos e zero para vazios", () => {
  assert.deepEqual(relativeHeights([2.5, 5]), [50, 100]);
  assert.deepEqual(relativeHeights([0, 5]), [0, 100]);
  assert.deepEqual(relativeHeights([0.1, 10]), [16, 100]);
  assert.deepEqual(relativeHeights([0, 0]), [0, 0]);
  assert.deepEqual(relativeHeights([]), []);
});

test("anel em três terços com folga, começando no topo como o anel da semana", () => {
  assert.deepEqual(thirdArcs(14), [
    { start: -83, sweep: 106 },
    { start: 37, sweep: 106 },
    { start: 157, sweep: 106 },
  ]);
  assert.deepEqual(thirdArcs(0).map((a) => a.sweep), [120, 120, 120]);
  assert.deepEqual(thirdArcs(), thirdArcs(14));
});

test("arco SVG com 2 casas e bandeira de arco grande acima de 180°", () => {
  assert.equal(arcPath(18, 18, 15.5, -90, 90), "M18,2.5 A15.5,15.5 0 0 1 33.5,18");
  assert.match(arcPath(18, 18, 15.5, -90, 270), / 0 1 1 /);
  for (const arc of thirdArcs(14)) assert.doesNotMatch(arcPath(18, 18, 15.5, arc.start, arc.sweep), /-0[,\s]|NaN/);
});

test("minigráfico de tendência: x uniforme, maior valor em cima, série plana no meio", () => {
  assert.deepEqual(sparklinePath([1, 2, 3], 60, 20, 2), { d: "M2,18 L30,10 L58,2", last: { x: 58, y: 2 } });
  assert.equal(sparklinePath([5, 5], 60, 20, 2)!.d, "M2,10 L58,10");
  assert.equal(sparklinePath([], 60, 20), null);
  assert.equal(sparklinePath([1], 60, 20), null);
  assert.equal(sparklinePath([3, 1], 64, 24)!.d, "M2,2 L62,22");
});
