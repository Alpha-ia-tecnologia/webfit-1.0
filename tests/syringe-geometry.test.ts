import { test } from "node:test";
import assert from "node:assert/strict";
import { syringeProfile } from "../src/lib/injection";
import {
  LENS_ASPECT,
  LENS_ZOOM,
  SLIM_VIEW,
  SYRINGE_VIEW,
  lensView,
  pillPercent,
  scaleLabels,
  slimPercent,
  syringePercent,
  syringeX,
} from "../src/lib/syringe-geometry";

const p30 = syringeProfile(30);
const p50 = syringeProfile(50);
const p100 = syringeProfile(100);
const close = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("escala: 0 UI no início do cilindro, capacidade no fim, grampeada fora disso", () => {
  close(syringePercent(0, p30), 18, 1e-9);
  close(syringePercent(30, p30), 81, 1e-9);
  assert.equal(syringeX(-5, p30), SYRINGE_VIEW.barrelX);
  assert.equal(syringeX(60, p30), SYRINGE_VIEW.barrelX + SYRINGE_VIEW.barrelW);
  assert.ok(SYRINGE_VIEW.flangeX > SYRINGE_VIEW.barrelX + SYRINGE_VIEW.barrelW);
});

test("seringa fina da receita (conceito 10): o cilindro ocupa 75% do recorte e os rótulos seguem o recorte", () => {
  close(slimPercent(0, p100), (100 * (SYRINGE_VIEW.barrelX - SLIM_VIEW.x)) / SLIM_VIEW.width, 1e-9);
  close(slimPercent(100, p100) - slimPercent(0, p100), 75, 1e-9);
  assert.ok(SLIM_VIEW.x + SLIM_VIEW.width > SLIM_VIEW.rodEnd, "o apoio do polegar cabe no recorte");
  assert.ok(SLIM_VIEW.x < SYRINGE_VIEW.barrelX - 12, "um pedaço da agulha aparece antes do canhão");
  const labels = scaleLabels(p100, 250, slimPercent);
  assert.equal(labels.at(-1)?.units, 100);
  close(labels.at(-1)!.percent, slimPercent(100, p100), 1e-9);
  // Sem o terceiro argumento, o desenho inteiro (como antes).
  close(scaleLabels(p100, 250).at(-1)!.percent, syringePercent(100, p100), 1e-9);
});

test("rótulos da escala ficam a pelo menos 20 px uns dos outros e nunca mostram o zero", () => {
  assert.deepEqual(
    scaleLabels(p100, 205).map((l) => l.units),
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  );
  assert.deepEqual(scaleLabels(p100, 160).map((l) => l.units), [20, 40, 60, 80, 100]);
  assert.deepEqual(scaleLabels(p30, 160).map((l) => l.units), [5, 10, 15, 20, 25, 30]);
  assert.deepEqual(scaleLabels(p50, 186).map((l) => l.units), [10, 20, 30, 40, 50]);
  const labels = scaleLabels(p50, 186);
  assert.equal(labels[4].percent, syringePercent(50, p50));
  // Cilindro minúsculo: sobra só o rótulo da capacidade.
  assert.deepEqual(scaleLabels(p100, 10).map((l) => l.units), [100]);
});

test("lupa da seringa de 100 UI: recorte 3×, centrado no valor e dentro do desenho", () => {
  const lens = lensView(50, p100);
  close(lens.x, 131.33);
  close(lens.width, 133.33);
  close(lens.height, 40, 1e-9);
  assert.equal(lens.y, 26);
  close(lens.width / lens.height, LENS_ASPECT, 1e-9);
  close(lens.width, SYRINGE_VIEW.width / LENS_ZOOM, 1e-9);
  assert.deepEqual(lens.labels.map((l) => l.units), [30, 40, 50, 60, 70]);
  close(lens.labels.find((l) => l.units === 50)!.percent, 50, 1e-9);
  close(lensView(100, p100).x, 257.33);
  close(lensView(0, p100).x, 5.33);
  assert.ok(lensView(0, p100).labels.every((l) => l.units > 0));
  const end = lensView(100, p100);
  assert.ok(end.x + end.width <= SYRINGE_VIEW.width);
});

test("pílula 'Aspire até aqui' fica dentro da figura", () => {
  assert.equal(pillPercent(5), 16);
  assert.equal(pillPercent(95), 84);
  assert.equal(pillPercent(50), 50);
});
