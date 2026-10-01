import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BMI_CAPTION,
  bmiGauge,
  LONG_PATH,
  monthRange,
  PROJECTION_CAPTION,
  UNDERWEIGHT_TEXT,
  weightProjection,
} from "../src/lib/body-metrics";

const TODAY = "2026-09-27";
const project = (goal: string, current: number, target: number, height = 165) =>
  weightProjection({ current, target, height, goal, today: TODAY });

test("IMC em faixas neutras, com marcador dentro da faixa e rótulo falado", () => {
  const gauge = bmiGauge(26.4)!;
  assert.equal(gauge.band, 2);
  assert.ok(Math.abs(gauge.markerPercent - 58.65) < 1e-9, String(gauge.markerPercent));
  assert.equal(gauge.value, "26,4");
  assert.equal(
    gauge.ariaLabel,
    "IMC estimado 26,4, na faixa de 25 a 29,9. Referência: 18,5 a 24,9.",
  );
  assert.equal(bmiGauge(18.5)!.band, 1);
  assert.equal(bmiGauge(25)!.band, 2);
  assert.equal(bmiGauge(30)!.band, 3);
  const low = bmiGauge(8)!;
  assert.equal(low.band, 0);
  assert.ok(Math.abs(low.markerPercent - 3.75) < 1e-9, String(low.markerPercent));
  assert.ok(Math.abs(bmiGauge(60)!.markerPercent - 96.25) < 1e-9);
  assert.equal(bmiGauge(null), null);
  assert.ok(!/obes|sobrepeso|magreza/i.test(BMI_CAPTION));
});

test("projeção em faixa de meses, sem data exata", () => {
  const loss = project("perder", 80, 75)!;
  assert.equal(loss.kind, "range");
  assert.equal(loss.title, "Entre dezembro de 2026 e fevereiro de 2027");
  assert.equal(loss.caption, PROJECTION_CAPTION);
  assert.equal(project("ganhar", 60, 62)!.title, "Entre outubro e novembro");
  assert.equal(project("perder", 72.4, 72), null);
  assert.equal(project("manter", 80, 75), null);
  assert.equal(project("organizar", 80, 75), null);
  // Meta na direção contrária ao objetivo não vira prazo.
  assert.equal(project("perder", 70, 75), null);
});

test("meta abaixo do IMC 18,5 pede conversa com profissional; caminho longo sem prazo", () => {
  assert.deepEqual(project("perder", 60, 49), {
    kind: "underweight",
    title: "",
    caption: UNDERWEIGHT_TEXT,
  });
  assert.deepEqual(project("perder", 150, 90), { kind: "long", ...LONG_PATH });
});

test("faixa de meses: mesmo mês, mesmo ano e anos diferentes", () => {
  assert.equal(monthRange("2026-10-05", "2026-10-20", TODAY), "Por volta de outubro");
  assert.equal(monthRange("2027-03-01", "2027-03-20", TODAY), "Por volta de março de 2027");
  assert.equal(monthRange("2027-01-10", "2027-03-01", TODAY), "Entre janeiro e março de 2027");
  const outputs = [
    monthRange("2026-10-05", "2026-10-20", TODAY),
    monthRange("2026-12-06", "2027-02-14", TODAY),
    ...[
      ["perder", 80, 75],
      ["ganhar", 60, 62],
      ["perder", 90, 88],
      ["ganhar", 55, 70],
      ["perder", 60, 49],
      ["perder", 150, 90],
    ].map(([goal, current, target]) => {
      const p = project(goal as string, current as number, target as number)!;
      return `${p.title} ${p.caption}`;
    }),
  ];
  for (const text of outputs) assert.ok(!/\b\d{1,2} de /.test(text), text);
});
