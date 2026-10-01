import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_POINTS,
  dayOffset,
  dayPointAtPercent,
  dayTimelineModel,
  fmtHours,
  fromMinutes,
  moveDayPoint,
  sleepDurationHours,
  sleepMismatch,
  suggestActivity,
  toMinutes,
} from "../src/lib/day-timeline";
import type { Draft } from "../src/types";
import { profileFixture } from "./fixtures";

const fixture = () => profileFixture() as unknown as Draft;
const minutesOf = (hhmm: string) => toMinutes(hhmm)!;

test("horas de sono pelos horários de dormir e acordar, em meias horas", () => {
  assert.equal(sleepDurationHours("23:00", "07:00"), 8);
  assert.equal(sleepDurationHours("00:00", "07:00"), 7);
  assert.equal(sleepDurationHours("22:30", "06:00"), 7.5);
  assert.equal(sleepDurationHours("23:15", "07:00"), 8);
  assert.equal(sleepDurationHours("07:00", "07:00"), null);
  assert.equal(sleepDurationHours("", "07:00"), null);
  assert.equal(sleepDurationHours("25:00", "07:00"), null);
  assert.equal(fmtHours(7.5), "7,5 h");
  assert.equal(fmtHours(8), "8 h");
  assert.equal(toMinutes("07:30:00"), 450);
  assert.equal(fromMinutes(-30), "23:30");
  assert.equal(fromMinutes(1500), "01:00");
  assert.equal(dayOffset(minutesOf("05:00")), 0);
  assert.equal(dayOffset(minutesOf("01:00")), 1200);
});

test("modelo da linha do dia: pontos em ordem, faixas da noite, marcas a cada 2 h e resumo do sono", () => {
  const model = dayTimelineModel(fixture());
  assert.equal(model.isLinear, true);
  assert.deepEqual(
    model.points.map((p) => p.key),
    DAY_POINTS.map((p) => p.key),
  );
  assert.equal(model.points[0].percent, 10);
  assert.equal(model.points[0].time, "07:00");
  assert.deepEqual(
    model.ticks.map((t) => t.label),
    ["05", "07", "09", "11", "13", "15", "17", "19", "21", "23", "01"],
  );
  assert.equal(model.ticks.length, 11);
  assert.equal(model.ticks.at(-1)?.percent, 100);
  assert.equal(model.sleep?.text, "Sono: 8 h (23:00 às 07:00)");
  assert.equal(model.sleep?.hours, 8);
  assert.deepEqual(model.nightBands, [
    { from: 0, to: 10 },
    { from: 90, to: 100 },
  ]);
  const shifted = dayTimelineModel({ ...fixture(), wakeTime: "14:00", sleepTime: "06:00" });
  assert.equal(shifted.isLinear, false);
  assert.deepEqual(shifted.nightBands, []);
  const late = dayTimelineModel({ ...fixture(), sleepTime: "02:00" });
  assert.equal(late.isLinear, false);
  assert.equal(late.points.at(-1)?.percent, null);
  const blank = dayTimelineModel({ ...fixture(), lunchTime: "" });
  assert.equal(blank.isLinear, false);
  assert.equal(blank.points[2].time, "");
});

test("mover um ponto: passo de 15 min, janela 05:00–01:00 e 30 min dos vizinhos", () => {
  assert.equal(moveDayPoint(fixture(), "sleepTime", 60), "00:00");
  assert.equal(moveDayPoint({ ...fixture(), sleepTime: "00:30" }, "sleepTime", 60), "01:00");
  assert.equal(moveDayPoint(fixture(), "wakeTime", 120), "07:30");
  assert.equal(moveDayPoint(fixture(), "wakeTime", -600), "05:00");
  assert.equal(moveDayPoint(fixture(), "lunchTime", -15), "11:45");
  // Horário fora do passo vai à marca vizinha no sentido do movimento.
  assert.equal(moveDayPoint({ ...fixture(), lunchTime: "12:10" }, "lunchTime", 15), "12:15");
  assert.equal(moveDayPoint({ ...fixture(), lunchTime: "12:10" }, "lunchTime", -15), "12:00");
  for (const key of DAY_POINTS.map((p) => p.key))
    for (const delta of [-60, -15, 15, 45, 60]) {
      const moved = moveDayPoint({ ...fixture(), lunchTime: "12:10" }, key, delta);
      assert.equal(minutesOf(moved) % 15, 0, `${key} ${delta} → ${moved}`);
    }
  // Ponto vazio parte do horário padrão.
  assert.equal(moveDayPoint({ ...fixture(), lunchTime: "" }, "lunchTime", 15), "12:15");
});

test("arrastar um ponto: posição na trilha vira horário no passo de 15 min", () => {
  assert.equal(dayPointAtPercent(fixture(), "lunchTime", 36.7), "12:15");
  assert.equal(dayPointAtPercent(fixture(), "lunchTime", 0), "08:30");
  assert.equal(dayPointAtPercent(fixture(), "sleepTime", 100), "01:00");
  const moved = dayPointAtPercent(fixture(), "dinnerTime", 71.3);
  assert.equal(minutesOf(moved) % 15, 0);
});

test("sono informado diferente dos horários vira chip com o valor dos horários", () => {
  assert.deepEqual(sleepMismatch(fixture()), {
    derived: 8,
    text: "Você informou 7 h de sono; pelos horários são 8 h.",
    actionLabel: "Usar 8 h",
  });
  assert.equal(sleepMismatch({ ...fixture(), sleepHours: 8 }), null);
  assert.equal(sleepMismatch({ ...fixture(), sleepHours: 7.5 }), null);
  assert.equal(sleepMismatch({ ...fixture(), sleepHours: "" }), null);
});

test("sugestão de atividade pelos dias de treino é só uma etiqueta", () => {
  assert.equal(suggestActivity(0), "sedentario");
  assert.equal(suggestActivity(3), "leve");
  assert.equal(suggestActivity("4"), "moderado");
  assert.equal(suggestActivity(5), "moderado");
  assert.equal(suggestActivity(7), "intenso");
  assert.equal(suggestActivity(""), null);
  assert.equal(suggestActivity(null), null);
});
