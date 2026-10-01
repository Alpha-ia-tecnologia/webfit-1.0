import { test } from "node:test";
import assert from "node:assert/strict";
import { habitWeek, habitWeekLabel, habitWeekSummary } from "../src/lib/habit-week";

// Quinta-feira, 24 de setembro de 2026: a semana vai de 21 (seg) a 27 (dom).
const TODAY = "2026-09-24";

test("semana de segunda a domingo: feito, perdido (cinza), hoje e os dias que ainda não chegaram", () => {
  const states = habitWeek(
    { createdDate: "2026-09-01", completedDates: ["2026-09-21", "2026-09-23", "2026-09-24", "2026-09-18"] },
    TODAY,
  );
  assert.deepEqual(states, ["done", "missed", "done", "done", "future", "future", "future"]);
  assert.deepEqual(habitWeekSummary(states), { done: 3, days: 4 });
  assert.equal(habitWeekLabel(states), "3 de 4 dias nesta semana");
});

test("hoje ainda pendente fica como aro; antes de criado não conta", () => {
  const states = habitWeek({ createdDate: "2026-09-23", completedDates: ["2026-09-23"] }, TODAY);
  assert.deepEqual(states, ["before", "before", "done", "today", "future", "future", "future"]);
  assert.equal(habitWeekLabel(states), "1 de 2 dias nesta semana");
});

test("criado hoje: um dia só, no singular; registros no futuro não viram 'feito'", () => {
  const states = habitWeek({ createdDate: TODAY, completedDates: ["2026-09-26"] }, TODAY);
  assert.deepEqual(states, ["before", "before", "before", "today", "future", "future", "future"]);
  assert.equal(habitWeekLabel(states), "0 de 1 dia nesta semana");
});

test("no domingo a semana inteira já valeu", () => {
  const states = habitWeek({ createdDate: "2026-01-01", completedDates: [] }, "2026-09-27");
  assert.deepEqual(states, ["missed", "missed", "missed", "missed", "missed", "missed", "today"]);
  assert.deepEqual(habitWeekSummary(states), { done: 0, days: 7 });
});
