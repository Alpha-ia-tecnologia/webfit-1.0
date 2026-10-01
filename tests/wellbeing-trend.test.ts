import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/dates";
import {
  CROSS_MIN_DAYS,
  crossReading,
  dayWellbeing,
  wellbeingTrend,
  type WellbeingTrend,
} from "../src/lib/wellbeing-trend";
import type { DiaryEntry } from "../src/types";

/** Segunda-feira. */
const T = "2026-09-28";
const WEEK = Array.from({ length: 7 }, (_, i) => shiftDate(T, i - 6));
const NOTE = "Leitura dos seus registros, sem relação de causa: humor e sono mudam por muitos motivos.";
const NO_STREAK = /sequ[eê]ncia|seguid|streak|recorde|perdeu|falhou|quebr|melhor semana/i;
const CAUSAL =
  /porque|por causa|causou|faz bem|faz mal|melhora|piora|deveria|você deve|precisa|recomend|diagn|depress|insôni|distúrbio|transtorno|tratamento/i;

let seq = 0;
function mood(date: string, rating: number | null, sleepHours: number | null, time = "08:00"): DiaryEntry {
  seq += 1;
  return {
    id: `b-${seq}`,
    userId: "user",
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
    updatedAt: `${date}T${time}:00.000Z`,
    type: "bem_estar",
    title: "Bem-estar",
    description: "",
    ...(rating === null ? {} : { rating }),
    ...(sleepHours === null ? {} : { sleepHours }),
  } as DiaryEntry;
}
const meal = (date: string): DiaryEntry => ({ ...mood(date, null, null), type: "refeicao", title: "Almoço" });

/** Semana 22–28 set do spec; 26 só com refeição; 21 fora do período. */
function seed(): DiaryEntry[] {
  return [
    mood("2026-09-22", 4, 8),
    mood("2026-09-23", 2, 5.5),
    mood("2026-09-24", 5, 7.5),
    mood("2026-09-25", 3, 6),
    meal("2026-09-26"),
    mood("2026-09-27", 4, null, "20:00"),
    mood("2026-09-28", 2, null, "21:00"),
    mood("2026-09-28", 4, 7, "09:00"),
    mood("2026-09-21", 1, 3),
  ];
}
/** Dias pareados (humor e sono) de 22 a 25 set e mais um em 28, com humores e sonos dados. */
function paired(moods: readonly number[], sleeps: readonly number[]): DiaryEntry[] {
  const dates = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"];
  return moods.map((m, i) => mood(dates[i]!, m, sleeps[i]!));
}
const day = (trend: WellbeingTrend, date: string) => trend.days.find((d) => d.date === date)!;
const trendOf = (diary: DiaryEntry[], dates: readonly string[] = WEEK) =>
  wellbeingTrend(diary, dates, T);

test("dias: último humor e último sono de cada dia, com descrição acessível", () => {
  const trend = trendOf(seed());
  assert.deepEqual(trend.weekdays, ["Ter", "Qua", "Qui", "Sex", "Sáb", "Dom", "Seg"]);
  const d22 = day(trend, "2026-09-22");
  assert.equal(d22.aria, "Ter, 22 set: humor Bem, sono 8 h");
  assert.equal(d22.sleepText, "8 h");
  assert.equal(d22.sleepPct, 66.7);
  assert.equal(d22.day, "22");
  assert.equal(d22.moodLabel, "Bem");
  assert.equal(day(trend, "2026-09-23").aria, "Qua, 23 set: humor Mal, sono 5,5 h");
  const d26 = day(trend, "2026-09-26");
  assert.equal(d26.aria, "Sáb, 26 set: sem registro de bem-estar");
  assert.equal(d26.sleepText, "—");
  assert.equal(d26.sleepPct, 0);
  assert.equal(day(trend, "2026-09-27").aria, "Dom, 27 set: humor Bem, sono não informado");
  const d28 = day(trend, T);
  assert.equal(d28.mood, 2);
  assert.equal(d28.sleep, 7);
  assert.equal(d28.isToday, true);
  assert.equal(d28.aria, "Seg, 28 set: humor Mal, sono 7 h");
  const raw = { ...mood("2026-09-26", null, 7) } as DiaryEntry;
  assert.equal(day(trendOf([...seed(), raw]), "2026-09-26").aria, "Sáb, 26 set: sono 7 h, humor não registrado");
  assert.deepEqual(dayWellbeing([raw], "2026-09-26"), { mood: null, sleep: 7 });
});

test("totais: dias com humor e sono, sono médio e destaques", () => {
  const trend = trendOf(seed());
  assert.equal(trend.moodDays, 6);
  assert.equal(trend.sleepDays, 5);
  assert.equal(trend.sleepAverage, 6.8);
  assert.deepEqual(trend.stats.map((c) => c.text), ["Humor em 6 de 7 dias", "Sono médio 6,8 h"]);
  assert.deepEqual(trend.stats.map((c) => [c.key, c.tone]), [["mood", "mind"], ["sleep", "body"]]);
  assert.equal(trend.aria, "Bem-estar e sono dos últimos 7 dias");
  assert.equal(trend.isEmpty, false);
});

test("leitura cruzada: mais sono com humor melhor em média, com detalhe e aviso", () => {
  const cross = trendOf(seed()).cross;
  assert.equal(cross.kind, "more");
  assert.equal(cross.paired, 5);
  assert.equal(cross.text, "Nos dias com mais sono, seu humor foi melhor em média.");
  assert.equal(
    cross.detail,
    "Com 7 h ou mais de sono: humor 3,7 de 5 (3 dias) · com menos: 2,5 de 5 (2 dias)",
  );
  assert.equal(cross.note, NOTE);
  assert.equal(cross.progress, null);
});

test("leitura cruzada: menos sono com humor melhor em média", () => {
  const cross = trendOf(paired([2, 4, 1, 5, 3], [8, 5.5, 7.5, 6, 7])).cross;
  assert.equal(cross.kind, "less");
  assert.equal(cross.text, "Nos dias com menos sono, seu humor foi melhor em média.");
  assert.equal(cross.note, NOTE);
});

test("leitura cruzada: humor parecido com limite na meia hora mais próxima da mediana", () => {
  const cross = trendOf(paired([4, 4, 4, 4], [8, 5.5, 7.5, 6])).cross;
  assert.equal(cross.kind, "similar");
  assert.equal(cross.text, "Seu humor foi parecido nos dias com mais e com menos sono.");
  assert.match(cross.detail!, /^Com 7 h ou mais de sono: humor 4 de 5 \(2 dias\) · com menos: 4 de 5 \(2 dias\)$/);
});

test("leitura cruzada: sono igual não compara; menos de 4 dias mostra o progresso", () => {
  const flat = trendOf(paired([4, 2, 5, 3], [7, 7, 7, 7])).cross;
  assert.equal(flat.kind, "flat");
  assert.equal(flat.text, "O sono ficou parecido nos dias registrados, então ainda não dá para comparar.");
  assert.equal(flat.detail, null);
  assert.equal(flat.note, NOTE);
  const few = trendOf(paired([4, 2, 5], [8, 5.5, 7.5])).cross;
  assert.equal(few.kind, "insufficient");
  assert.equal(few.text, "A leitura cruzada de humor e sono aparece com 4 dias com os dois registrados.");
  assert.equal(few.progress, `3 de ${CROSS_MIN_DAYS} dias`);
  assert.equal(few.note, null);
  assert.equal(few.detail, null);
  assert.equal(crossReading([{ mood: 4, sleep: null }, { mood: null, sleep: 7 }]).paired, 0);
});

test("vazio: nenhum destaque e leitura cruzada em 0 de 4", () => {
  const trend = trendOf([]);
  assert.equal(trend.isEmpty, true);
  assert.deepEqual(trend.stats, []);
  assert.equal(trend.cross.kind, "insufficient");
  assert.equal(trend.cross.progress, "0 de 4 dias");
  assert.equal(trend.moodAverage, null);
  assert.equal(trend.sleepAverage, null);
});

test("28 dias: 4 linhas de 7 a partir da primeira data", () => {
  const month = Array.from({ length: 28 }, (_, i) => shiftDate(T, i - 27));
  const trend = trendOf(seed(), month);
  assert.equal(trend.rows.length, 4);
  assert.ok(trend.rows.every((row) => row.length === 7));
  assert.equal(month[0], "2026-09-01");
  assert.equal(trend.weekdays[0], "Ter");
  assert.equal(trend.aria, "Bem-estar e sono dos últimos 28 dias");
});

test("nenhum texto afirma causa, diagnóstico ou dias seguidos", () => {
  const month = Array.from({ length: 28 }, (_, i) => shiftDate(T, i - 27));
  const models = [
    trendOf(seed()),
    trendOf(seed(), month),
    trendOf(paired([2, 4, 1, 5, 3], [8, 5.5, 7.5, 6, 7])),
    trendOf(paired([4, 4, 4, 4], [8, 5.5, 7.5, 6])),
    trendOf(paired([4, 2, 5, 3], [7, 7, 7, 7])),
    trendOf(paired([4, 2, 5], [8, 5.5, 7.5])),
    trendOf([mood("2026-09-26", null, 7)]),
    trendOf([]),
  ];
  assert.deepEqual(
    models.map((m) => m.cross.kind),
    ["more", "more", "less", "similar", "flat", "insufficient", "insufficient", "insufficient"],
  );
  for (const model of models) {
    const text = JSON.stringify(model);
    assert.doesNotMatch(text, CAUSAL);
    assert.doesNotMatch(text, NO_STREAK);
  }
});
