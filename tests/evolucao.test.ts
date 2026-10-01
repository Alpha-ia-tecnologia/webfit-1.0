import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyChartDescription,
  dayLabels,
} from "../src/components/evolucao/chart-geometry";
import { shiftDate } from "../src/lib/domain";

const points = [
  { date: "2026-09-08", label: "Ter", value: 1650, goal: 1953 },
  { date: "2026-09-09", label: "Qua", value: 0, goal: 1953 },
  { date: "2026-09-10", label: "Qui", value: 1200, goal: null },
  { date: "2026-09-11", label: "Sex", value: 1800, goal: 1753 },
];

test("dayLabels: dias da semana em até sete dias e dd/mm a cada sete nos maiores", () => {
  assert.deepEqual(dayLabels(["2026-09-08", "2026-09-09", "2026-09-13"]), ["Ter", "Qua", "Dom"]);
  const dates = Array.from({ length: 28 }, (_, i) => shiftDate("2026-08-18", i));
  const labels = dayLabels(dates);
  assert.equal(labels[27], "14/09");
  assert.equal(labels[20], "07/09");
  assert.equal(labels[26], "");
});

test("dailyChartDescription: lista os dias com registro, resume períodos longos e cita a meta", () => {
  assert.equal(
    dailyChartDescription("Calorias", points, "kcal", 1753),
    "Calorias por dia nos últimos 4 dias: Ter 1.650 kcal, Qui 1.200 kcal, Sex 1.800 kcal; meta 1.753 kcal",
  );
  assert.equal(
    dailyChartDescription("Água", points.map((p) => ({ ...p, value: 0 })), "ml", null),
    "Água por dia nos últimos 4 dias: sem registros",
  );
  const long = Array.from({ length: 28 }, (_, i) => ({
    date: shiftDate("2026-08-18", i),
    label: "",
    value: i % 2 ? 100 : 0,
    goal: null,
  }));
  assert.match(dailyChartDescription("Água", long, "ml", null), /14 dias com registro/);
});
