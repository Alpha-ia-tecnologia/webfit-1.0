import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiaryEntry, HabitItem } from "../src/types";
import { shiftDate } from "../src/lib/dates";
import {
  CALENDAR_WEEKS,
  consistencyCalendar,
  consistencyModel,
  type ConsistencyModel,
} from "../src/lib/consistency";

/** Quinta-feira. */
const T = "2026-09-24";
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => shiftDate(T, i - (n - 1)));
const WEEK = lastDays(7);
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr/i;

let seq = 0;
function entry(date: string, type: DiaryEntry["type"]): DiaryEntry {
  seq += 1;
  return {
    id: `d-${seq}`,
    userId: "user",
    date,
    time: "12:00",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    type,
    title: type,
    description: "",
    ...(type === "agua" ? { amountMl: 250 } : {}),
    ...(type === "bem_estar" ? { rating: 4 } : {}),
  };
}
const habit = (id: string, createdDate: string, completedDates: string[]): HabitItem => ({
  id,
  title: `Combinado ${id}`,
  timeOfDay: "08:00",
  createdDate,
  completedDates,
});
/** Refeição e água em todos os dias menos 22 set; 3 combinados desde 25 ago, 5 conclusões. */
function week() {
  const diary = WEEK.filter((d) => d !== "2026-09-22").flatMap((d) => [
    entry(d, "refeicao"),
    entry(d, "agua"),
  ]);
  const habits = [
    habit("h1", "2026-08-25", ["2026-09-24", "2026-09-23"]),
    habit("h2", "2026-08-25", ["2026-09-21", "2026-09-20"]),
    habit("h3", "2026-08-25", ["2026-09-19"]),
  ];
  return { diary, habits };
}
const cell = (model: ConsistencyModel, date: string) =>
  model.rows.flat().find((d) => d.date === date)!;

test("semana: dias com registro, combinados cumpridos e colunas a partir do primeiro dia", () => {
  const model = consistencyModel(week(), WEEK, T);
  assert.equal(model.recordDays, 6);
  assert.equal(model.totalDays, 7);
  assert.equal(model.habitsPossible, 21);
  assert.equal(model.habitsDone, 5);
  assert.equal(model.recordText, "6 de 7 dias com registro");
  assert.equal(model.habitsText, "5 de 21 combinados");
  assert.equal(model.aria, "Consistência dos últimos 7 dias");
  assert.deepEqual(model.weekdays, ["Sex", "Sáb", "Dom", "Seg", "Ter", "Qua", "Qui"]);
  assert.equal(model.rows.length, 1);
  const today = cell(model, T);
  assert.deepEqual(
    [today.day, today.isToday, today.water, today.meal, today.habit, today.hasRecord],
    ["24", true, true, true, true, true],
  );
  assert.equal(today.aria, "Qui, 24 set: água, refeição e combinado");
  const empty = cell(model, "2026-09-22");
  assert.deepEqual([empty.water, empty.meal, empty.habit, empty.hasRecord], [false, false, false, false]);
  assert.equal(empty.aria, "Ter, 22 set: sem registro");
  assert.equal(cell(model, "2026-09-18").aria, "Sex, 18 set: água e refeição");
});

test("combinado novo conta só a partir da criação; conclusão antes dela não vale", () => {
  const model = consistencyModel(
    { diary: [], habits: [habit("novo", "2026-09-22", ["2026-09-20", "2026-09-23"])] },
    WEEK,
    T,
  );
  assert.equal(model.habitsPossible, 3);
  assert.equal(model.habitsDone, 1);
  assert.equal(model.habitsText, "1 de 3 combinados");
  assert.equal(cell(model, "2026-09-20").habit, false);
  assert.equal(cell(model, "2026-09-20").hasRecord, false);
  assert.equal(cell(model, "2026-09-23").habit, true);
});

test("sem combinados ativos e dia só com bem-estar conta como registro", () => {
  const model = consistencyModel({ diary: [entry("2026-09-21", "bem_estar")], habits: [] }, WEEK, T);
  assert.equal(model.habitsText, "Nenhum combinado ativo no período");
  assert.equal(model.habitsPossible, 0);
  const day = cell(model, "2026-09-21");
  assert.equal(day.hasRecord, true);
  assert.deepEqual([day.water, day.meal, day.habit], [false, false, false]);
  assert.equal(day.aria, "Seg, 21 set: outros registros");
  assert.equal(model.recordText, "1 de 7 dias com registro");
});

test("28 dias viram 4 linhas de 7", () => {
  const model = consistencyModel(week(), lastDays(28), T);
  assert.equal(model.rows.length, 4);
  assert.ok(model.rows.every((row) => row.length === 7));
  assert.equal(model.aria, "Consistência dos últimos 28 dias");
  assert.equal(model.habitsPossible, 84);
  assert.equal(model.habitsText, "5 de 84 combinados");
  assert.equal(model.rows[3]!.at(-1)!.date, T);
  assert.equal(model.weekdays[0], "Sex");
});

test("nada conta dias seguidos: nenhum texto fala em sequência ou falha", () => {
  for (const dates of [WEEK, lastDays(28)]) {
    const model = consistencyModel(week(), dates, T);
    const texts = [
      model.recordText,
      model.habitsText,
      model.aria,
      ...model.weekdays,
      ...model.rows.flat().map((d) => d.aria),
    ];
    for (const text of texts) assert.doesNotMatch(text, NO_STREAK, text);
  }
});

test("calendário \"Seus registros\": 4 semanas de segunda a domingo, dias futuros sem anel", () => {
  const cal = consistencyCalendar(week(), T);
  assert.equal(cal.rows.length, CALENDAR_WEEKS);
  assert.ok(cal.rows.every((row) => row.length === 7));
  assert.deepEqual(cal.weekdays, ["S", "T", "Q", "Q", "S", "S", "D"]);
  // Quinta, 24 set: a grade vai de segunda, 31 ago, a domingo, 27 set.
  assert.equal(cal.rows[0]![0]!.date, "2026-08-31");
  assert.equal(cal.rows[3]![6]!.date, "2026-09-27");
  const days = cal.rows.flat();
  const today = days.find((d) => d.isToday)!;
  assert.equal(today.date, T);
  assert.deepEqual([today.water, today.meal, today.habit, today.isFuture], [true, true, true, false]);
  const future = days.filter((d) => d.isFuture);
  assert.deepEqual(future.map((d) => d.date), ["2026-09-25", "2026-09-26", "2026-09-27"]);
  for (const d of future) assert.deepEqual([d.water, d.meal, d.habit, d.hasRecord], [false, false, false, false]);
  assert.equal(future[0]!.aria, "Sex, 25 set: ainda não chegou");
  // 21 dias das semanas completas + seg a qui.
  assert.equal(cal.counts.elapsed, 25);
  assert.equal(cal.counts.meal, 6);
  assert.equal(cal.counts.water, 6);
  assert.equal(cal.counts.habit, 5);
  assert.equal(cal.aria, "Registros das últimas 4 semanas");
  for (const text of [cal.aria, ...days.map((d) => d.aria)]) assert.doesNotMatch(text, NO_STREAK, text);
  // Domingo: a semana termina hoje, sem dias futuros; uma semana só tem o próprio nome.
  const sunday = consistencyCalendar(week(), "2026-09-27", 1);
  assert.equal(sunday.rows.length, 1);
  assert.equal(sunday.counts.elapsed, 7);
  assert.equal(sunday.rows.flat().filter((d) => d.isFuture).length, 0);
  assert.equal(sunday.aria, "Registros da última semana");
});
