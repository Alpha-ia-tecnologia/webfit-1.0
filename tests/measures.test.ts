import { test } from "node:test";
import assert from "node:assert/strict";
import type { Measurement } from "../src/types";
import { shiftDate } from "../src/lib/dates";
import {
  bodyMeasures,
  dateBlock,
  lastValueHint,
  MEASURE_METHODS,
  measureRuler,
  weighInRows,
  weightRuler,
} from "../src/lib/measures";

const T = "2026-09-24";
let seq = 0;
const measure = (date: string, weight: number, extra: Partial<Measurement> = {}): Measurement => {
  seq += 1;
  return {
    id: `m-${seq}`,
    date,
    weight,
    height: 165,
    waist: null,
    hip: null,
    bodyFat: null,
    method: "Balança em casa",
    ...extra,
  };
};
/** Oito pesagens semanais de 76,4 a 72,4 kg terminando hoje; cintura 88 − 0,7i e quadril 102 − 0,4i. */
const weekly = () =>
  Array.from({ length: 8 }, (_, i) =>
    measure(shiftDate(T, -7 * (7 - i)), Number((76.4 - (4 / 7) * i).toFixed(1)), {
      waist: 88 - i * 0.7,
      hip: 102 - i * 0.4,
    }),
  );
const pair = () => [
  measure("2026-09-17", 72.4, { waist: 85.5, hip: 101 }),
  measure("2026-09-10", 72.8, { waist: 86 }),
];

test("pesagens em linhas: mais nova primeiro, variação contra a pesagem anterior e medidas em chips", () => {
  const rows = weighInRows(pair(), "2026-09-15", T, false);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row!.weight, "72,4 kg");
  assert.equal(row!.delta, "−0,4 kg");
  assert.equal(row!.deltaLabel, "−0,4 kg desde a pesagem anterior");
  assert.deepEqual(row!.chips, ["Cintura 85,5 cm", "Quadril 101 cm"]);
  assert.deepEqual(row!.block, { day: "17", month: "set" });
  assert.equal(row!.method, "Balança em casa");
  const all = weighInRows(pair(), "2026-09-01", T, false);
  assert.deepEqual(all.map((r) => r.date), ["2026-09-17", "2026-09-10"]);
  assert.equal(all[1]!.delta, null);
  assert.equal(all[1]!.deltaLabel, null);
  assert.deepEqual(all[1]!.chips, ["Cintura 86 cm"]);
  // Perfil calmo (sensível ou menor de 18): só o peso, sem variação nem fichas de medidas.
  const calm = weighInRows(pair(), "2026-09-01", T, true);
  assert.equal(calm.length, 2);
  assert.ok(calm.every((r) => r.delta === null && r.deltaLabel === null));
  assert.deepEqual(calm.map((r) => r.chips), [[], []]);
  assert.deepEqual(calm.map((r) => r.weight), ["72,4 kg", "72,8 kg"]);
  assert.deepEqual(weighInRows([measure(T, 70, { bodyFat: 28.5 })], T, T, true)[0]!.chips, []);
  assert.deepEqual(
    weighInRows([measure(T, 70, { bodyFat: 28.5 })], T, T, false)[0]!.chips,
    ["Gordura 28,5%"],
  );
  assert.deepEqual(dateBlock("2026-08-06"), { day: "6", month: "ago" });
});

test("medidas: tendência de cintura e quadril, chips descritivos e silhueta acessível", () => {
  const body = bodyMeasures(weekly());
  assert.equal(body.waist.latest, "83,1 cm");
  assert.equal(body.waist.delta, "−4,9 cm");
  assert.equal(body.waist.since, "6 ago");
  assert.equal(body.waist.aria, "Cintura: de 88,0 a 83,1 cm desde 6 ago");
  assert.equal(body.waist.points.length, 8);
  assert.equal(body.hip.latest, "99,2 cm");
  assert.equal(body.bodyFat.latest, null);
  assert.equal(body.bodyFat.aria, null);
  assert.deepEqual(body.chips.map((c) => c.text), ["IMC 26,6", "Cintura/quadril 0,84"]);
  assert.deepEqual(body.chips.map((c) => c.aria), ["IMC 26,6 kg/m²", "Relação cintura/quadril 0,84"]);
  assert.equal(body.silhouetteAria, "Silhueta: cintura 83,1 cm, quadril 99,2 cm");
  assert.equal(body.isEmpty, false);
  const one = bodyMeasures([measure(T, 72, { waist: 83.1, bodyFat: 28.5 })]);
  assert.equal(one.waist.aria, "Cintura: 83,1 cm em 24 set");
  assert.equal(one.waist.delta, null);
  assert.equal(one.waist.since, null);
  assert.equal(one.bodyFat.latest, "28,5%");
  assert.deepEqual(one.chips.map((c) => c.text), ["IMC 26,4", "Gordura 28,5%"]);
  assert.equal(one.chips[1]!.aria, "Gordura corporal medida 28,5%");
  assert.equal(one.silhouetteAria, "Silhueta: cintura 83,1 cm, quadril não registrado");
  const fat = bodyMeasures([
    measure("2026-09-10", 72, { bodyFat: 30 }),
    measure(T, 72, { bodyFat: 28.5 }),
  ]);
  assert.equal(fat.bodyFat.delta, "−1,5%");
  assert.equal(fat.bodyFat.aria, "Gordura: de 30,0 a 28,5% desde 10 set");
  const empty = bodyMeasures([measure(T, 72)]);
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.silhouetteAria, "Silhueta: cintura não registrada, quadril não registrado");
  assert.deepEqual(bodyMeasures([]).chips, []);
  // Nada de classificação clínica automática nos textos.
  const texts = JSON.stringify(body);
  assert.doesNotMatch(texts, /obes|sobrepeso|normal|risco|ideal|saudável/i);
});

test("réguas da folha: peso ±40 kg dentro de 20–350 e medidas opcionais com valor típico", () => {
  const weight = weightRuler(72);
  assert.deepEqual(
    [weight.min, weight.max, weight.step, weight.tickStep, weight.fineStep, weight.unit, weight.initial],
    [32, 112, 0.1, 0.2, 0.1, "kg", 72],
  );
  assert.equal(weightRuler(25).min, 20);
  assert.equal(weightRuler(340).max, 350);
  assert.equal(weightRuler(72.4).initial, 72.4);
  const waist = measureRuler("waist", null);
  assert.equal(waist.initial, 80);
  assert.equal(waist.allowNone, true);
  assert.deepEqual([waist.min, waist.max, waist.step, waist.unit], [40, 200, 0.5, "cm"]);
  assert.equal(measureRuler("hip", null).initial, 95);
  assert.equal(measureRuler("hip", 101).initial, 101);
  const fat = measureRuler("bodyFat", null);
  assert.deepEqual([fat.min, fat.max, fat.initial, fat.unit, fat.majorEvery], [3, 60, 25, "%", 10]);
});

test("última medida registrada e métodos da folha", () => {
  const list = [...pair(), measure("2026-09-17", 72.4, { bodyFat: 28.5 })];
  assert.equal(lastValueHint(pair(), "waist"), "Última: 85,5 cm em 17 set");
  assert.equal(lastValueHint(pair(), "hip"), "Última: 101,0 cm em 17 set");
  assert.equal(lastValueHint(list, "bodyFat"), "Última: 28,5% em 17 set");
  assert.equal(lastValueHint(pair(), "bodyFat"), null);
  assert.equal(lastValueHint([], "waist"), null);
  assert.deepEqual(MEASURE_METHODS.options.map((o) => o.value), [
    "Balança em casa",
    "Balança e fita em casa",
    "Balança de academia ou farmácia",
    "Consultório ou clínica",
    "Bioimpedância",
  ]);
  assert.equal(MEASURE_METHODS.mode, "single");
  assert.equal(MEASURE_METHODS.otherLabel, "Outro");
});
