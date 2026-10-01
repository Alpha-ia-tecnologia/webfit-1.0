import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtBmi,
  fmtDelta,
  fmtExpiry,
  fmtKcal,
  fmtKg,
  fmtLiters,
  fmtMl,
  fmtNumber,
  fmtPct,
  fmtRange,
  fmtRelDate,
  fmtShortDate,
  fmtWater,
  plural,
} from "../src/lib/format";

test("números usam separador de milhar e vírgula decimal do pt-BR", () => {
  assert.equal(fmtNumber(1645), "1.645");
  assert.equal(fmtNumber(72.44, 1), "72,4");
  assert.equal(fmtNumber(72, 1), "72");
  assert.equal(fmtNumber(-0.04, 1), "0");
});

test("unidades de peso, energia e água", () => {
  assert.equal(fmtKg(72.4), "72,4 kg");
  assert.equal(fmtKg(73.25), "73,3 kg");
  assert.equal(fmtKg(80), "80 kg");
  assert.equal(fmtKcal(1644.6), "1.645 kcal");
  assert.equal(fmtKcal(790), "790 kcal");
  assert.equal(fmtMl(1750), "1.750 ml");
  assert.equal(fmtMl(350), "350 ml");
  assert.equal(fmtLiters(1750), "1,75 L");
  assert.equal(fmtLiters(2500), "2,5 L");
  assert.equal(fmtLiters(2000), "2 L");
});

test("porcentagem e IMC", () => {
  assert.equal(fmtPct(37.6), "38%");
  assert.equal(fmtPct(0), "0%");
  assert.equal(fmtBmi(72.4, 165), "26,6");
  assert.equal(fmtBmi(72.4, 0), "—");
});

test("variação usa o sinal de menos tipográfico e mostra o sinal de mais", () => {
  assert.equal(fmtDelta(-4, "kg"), "−4 kg");
  assert.equal(fmtDelta(-4.04, "kg"), "−4 kg");
  assert.equal(fmtDelta(0.5, "kg"), "+0,5 kg");
  assert.equal(fmtDelta(0, "kg"), "0 kg");
  assert.equal(fmtDelta(-0.04, "kg"), "0 kg");
});

test("plural concorda com a quantidade", () => {
  assert.equal(plural(1, "medição", "medições"), "1 medição");
  assert.equal(plural(0, "medição", "medições"), "0 medições");
  assert.equal(plural(8, "pesagem", "pesagens"), "8 pesagens");
});

test("datas relativas para hoje, ontem, amanhã e distâncias em dias", () => {
  const today = "2026-09-24";
  assert.equal(fmtRelDate("2026-09-24", today), "hoje");
  assert.equal(fmtRelDate("2026-09-23", today), "ontem");
  assert.equal(fmtRelDate("2026-09-25", today), "amanhã");
  assert.equal(fmtRelDate("2026-09-22", today), "há 2 dias");
  assert.equal(fmtRelDate("2026-09-29", today), "em 5 dias");
  assert.equal(fmtRelDate("2026-10-01", "2026-09-30"), "amanhã");
});

test("data curta do cabeçalho não passa de 11 caracteres", () => {
  assert.equal(fmtShortDate("2026-09-24"), "Qui, 24 set");
  assert.equal(fmtShortDate("2026-03-01"), "Dom, 1 mar");
});

test("água, faixas e validade em linguagem de app", () => {
  assert.equal(fmtWater(750), "750 ml");
  assert.equal(fmtWater(1750), "1,75 L");
  assert.equal(fmtWater(2000), "2 L");
  assert.equal(fmtRange(1.6, 2.2, "g/kg"), "1,6–2,2 g/kg");
  assert.equal(fmtRange(2.2, 1.6, "g/kg"), "1,6–2,2 g/kg");
  assert.equal(fmtRange(90, 90, "g", 0), "90 g");
  const today = "2026-09-26";
  assert.equal(fmtExpiry("2026-09-26", today), "vence hoje");
  assert.equal(fmtExpiry("2026-09-27", today), "vence amanhã");
  assert.equal(fmtExpiry("2026-09-29", today), "vence em 3 dias");
  assert.equal(fmtExpiry("2026-09-25", today), "venceu ontem");
  assert.equal(fmtExpiry("2026-09-22", today), "venceu há 4 dias");
});

test("fmtDateBr: dd/mm/aaaa sem Intl; outro formato volta como veio", async () => {
  const { fmtDateBr } = await import("../src/lib/format");
  assert.equal(fmtDateBr("1992-06-15"), "15/06/1992");
  assert.equal(fmtDateBr("2026-01-05"), "05/01/2026");
  assert.equal(fmtDateBr("15/06/1992"), "15/06/1992");
  assert.equal(fmtDateBr(""), "");
});

test("fmtDayMonth e fmtUntil: data curta sem dia da semana e tempo até a próxima refeição", async () => {
  const { fmtDayMonth, fmtUntil } = await import("../src/lib/format");
  assert.equal(fmtDayMonth("2026-09-08"), "8 set");
  assert.equal(fmtDayMonth("2026-10-22"), "22 out");
  assert.equal(fmtUntil(0), "agora");
  assert.equal(fmtUntil(-5), "agora");
  assert.equal(fmtUntil(25), "em 25 min");
  assert.equal(fmtUntil(120), "em 2 h");
  assert.equal(fmtUntil(80), "em 1 h 20 min");
});
