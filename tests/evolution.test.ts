import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayBars,
  defaultRange,
  fmtDayMonth,
  journeyFor,
  nextWeighIn,
  pacePerWeek,
  proteinBand,
  rangeStart,
  startChecklist,
  weightChartEnd,
  weightChartModel,
  weightTrend,
  evolutionSubtitle,
  MIN_TICK_SPACING_PX,
  NEXT_DOSE_TAIL_DAYS,
  TODAY_TICK_GAP_PX,
  WEIGHT_RANGES,
} from "../src/lib/evolution";
import { shiftDate, uid } from "../src/lib/domain";
import { planReminders } from "../src/lib/reminder-plan";
import { doseTimeline, doseTimelineAria } from "../src/lib/treatment";
import { injectionSchema, type AppState, type Measurement } from "../src/types";
import { stateFixture } from "./fixtures";

const TODAY = "2026-09-24";
const measure = (date: string, weight: number, extra: Partial<Measurement> = {}): Measurement => ({
  id: uid(),
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança em casa",
  ...extra,
});
/** Oito pesagens semanais de 76,4 a 72,4 kg, terminando hoje. */
const weekly = () =>
  Array.from({ length: 8 }, (_, i) =>
    measure(shiftDate(TODAY, -7 * (7 - i)), Number((76.4 - (4 / 7) * i).toFixed(1)), {
      waist: 88 - i * 0.7,
      hip: 102 - i * 0.4,
    }),
  );
const withMeasurements = (measurements: Measurement[], change: Partial<NonNullable<AppState["profile"]>> = {}) => {
  const state = stateFixture();
  state.measurements = measurements;
  state.profile = { ...state.profile!, targetWeight: 66, ...change };
  return state;
};

test("tendência suaviza as pesagens, segue a direção e começa na primeira pesagem", () => {
  const points = weightTrend(weekly());
  assert.equal(points.length, 8);
  assert.equal(points[0]!.trend, 76.4);
  // A tendência acompanha a queda, mas fica acima da última pesagem (suavizada).
  assert.ok(points.at(-1)!.trend < 74 && points.at(-1)!.trend > 72.4);
  for (let i = 1; i < points.length; i++) assert.ok(points[i]!.trend <= points[i - 1]!.trend);
  // Ordem por data mesmo com entrada fora de ordem.
  const shuffled = weightTrend([...weekly()].reverse());
  assert.deepEqual(shuffled.map((p) => p.date), points.map((p) => p.date));
  assert.deepEqual(weightTrend([]), []);
});

test("ritmo semanal: regressão das últimas 4 semanas, nulo com pouco histórico", () => {
  const pace = pacePerWeek(weightTrend(weekly()), TODAY);
  assert.ok(pace !== null && pace < 0 && pace > -1, String(pace));
  assert.equal(pacePerWeek(weightTrend([measure(TODAY, 70)]), TODAY), null);
  // Duas pesagens com menos de 7 dias entre elas não dão ritmo.
  assert.equal(
    pacePerWeek(weightTrend([measure(shiftDate(TODAY, -3), 71), measure(TODAY, 70)]), TODAY),
    null,
  );
});

test("jornada: peso atual, variação desde o início, caminho até a meta, ritmo e medidas", () => {
  const journey = journeyFor(withMeasurements(weekly()), TODAY)!;
  assert.equal(journey.current.weight, 72.4);
  assert.equal(journey.current.date, TODAY);
  assert.equal(journey.start.weight, 76.4);
  assert.equal(journey.delta, -4);
  assert.equal(journey.target, 66);
  // (76,4 − 72,4) / (76,4 − 66) = 38%
  assert.equal(Math.round(journey.progress! * 100), 38);
  assert.ok(journey.pace !== null);
  assert.equal(journey.waist?.value, 88 - 7 * 0.7);
  assert.ok(journey.waist!.delta < 0);
  assert.equal(journey.count, 8);
  assert.equal(journeyFor(withMeasurements([]), TODAY), null);
});

test("jornada em perfil calmo mostra só o valor: sem variação, meta, caminho, ritmo nem medidas", () => {
  // Sensível ou menor de 18 (com meta antiga salva): mesma regra de isCalmProfile.
  const minor = { birthDate: shiftDate(TODAY, -16 * 365) };
  for (const change of [{ eatingDisorder: "sim" }, { pregnancy: "gestacao" }, minor] as const) {
    const journey = journeyFor(withMeasurements(weekly(), change), TODAY)!;
    assert.equal(journey.current.weight, 72.4);
    assert.equal(journey.isSensitive, true);
    assert.equal(journey.delta, null);
    assert.equal(journey.target, null);
    assert.equal(journey.progress, null);
    assert.equal(journey.pace, null);
    assert.equal(journey.waist, null);
    assert.equal(journey.hip, null);
  }
  // Quem faz 18 hoje já vê a jornada completa.
  const adult = journeyFor(withMeasurements(weekly(), { birthDate: `${Number(TODAY.slice(0, 4)) - 18}${TODAY.slice(4)}` }), TODAY)!;
  assert.equal(adult.isSensitive, false);
  assert.equal(adult.target, 66);
  assert.ok(adult.waist);
});

test("caminho até a meta fica entre 0 e 100% e some sem meta ou com meta igual ao início", () => {
  const up = journeyFor(withMeasurements([measure(shiftDate(TODAY, -20), 70), measure(TODAY, 71)]), TODAY)!;
  assert.equal(up.progress, 0);
  const past = journeyFor(withMeasurements([measure(shiftDate(TODAY, -20), 70), measure(TODAY, 65)]), TODAY)!;
  assert.equal(past.progress, 1);
  assert.equal(journeyFor(withMeasurements(weekly(), { targetWeight: null }), TODAY)!.progress, null);
  assert.equal(journeyFor(withMeasurements([measure(TODAY, 66)]), TODAY)!.progress, null);
});

test("períodos do gráfico de peso: 1M a 6M a partir de hoje e Tudo desde a primeira pesagem", () => {
  // Conceito 09: 1M, 3M, 6M e Tudo (sem 1A), pequenos ao lado do título.
  assert.deepEqual(WEIGHT_RANGES.map((r) => r.label), ["1M", "3M", "6M", "Tudo"]);
  assert.equal(rangeStart("1m", TODAY, "2026-01-01"), shiftDate(TODAY, -29));
  assert.equal(rangeStart("6m", TODAY, "2026-01-01"), shiftDate(TODAY, -179));
  assert.equal(rangeStart("tudo", TODAY, "2026-08-06"), "2026-08-06");
  // Tudo com uma pesagem só (ou de hoje) ainda mostra uma semana.
  assert.equal(rangeStart("tudo", TODAY, TODAY), shiftDate(TODAY, -6));
  assert.equal(fmtDayMonth("2026-08-06"), "6 ago");
  // O gráfico abre colado aos dados: "Tudo" com até 6 meses de histórico.
  assert.equal(defaultRange(shiftDate(TODAY, -49), TODAY), "tudo");
  assert.equal(defaultRange(shiftDate(TODAY, -400), TODAY), "6m");
});

test("gráfico de peso em pixels reais: pontos na área, meta opcional, 3 valores no eixo e datas", () => {
  const points = weightTrend(weekly());
  const model = weightChartModel({
    points,
    start: points[0]!.date,
    end: TODAY,
    target: 66,
    width: 340,
    height: 200,
  });
  assert.equal(model.dots.length, 8);
  for (const dot of model.dots) {
    assert.ok(dot.x >= model.plot.left && dot.x <= model.plot.right, `x ${dot.x}`);
    assert.ok(dot.y >= model.plot.top && dot.y <= model.plot.bottom, `y ${dot.y}`);
  }
  assert.ok(model.trendPath.startsWith("M"));
  assert.ok(model.targetY !== null && model.targetY > model.dots.at(-1)!.y);
  // Três marcas em passo redondo (70, 75, 80), todas dentro da área.
  assert.deepEqual(model.yTicks.map((t) => t.label), ["70", "75", "80"]);
  for (const tick of model.yTicks) assert.ok(tick.y >= model.plot.top && tick.y <= model.plot.bottom);
  assert.equal(model.xTicks.at(-1)!.label, "hoje");
  // Sem meta (ou perfil sensível), a escala não se estica até ela.
  const noTarget = weightChartModel({ points, start: points[0]!.date, end: TODAY, target: null, width: 340, height: 200 });
  assert.equal(noTarget.targetY, null);
  // Pesagens fora do período não viram pontos.
  const month = weightChartModel({ points, start: shiftDate(TODAY, -29), end: TODAY, target: null, width: 340, height: 200 });
  assert.ok(month.dots.length < 8);
  assert.equal(model.dose, null);
});

/** Tirzepatida semanal: 2,5 mg em −49…−28 e 5 mg em −21…0 (EVOL-04). */
const titration = () =>
  [-49, -42, -35, -28, -21, -14, -7, 0].map((days, i) => {
    const mg = days < -21 ? 2.5 : 5;
    return injectionSchema.parse({
      id: `inj-${i}`,
      userId: "user",
      date: shiftDate(TODAY, days),
      time: "08:30",
      createdAt: `2026-09-01T08:00:00.00${i}Z`,
      updatedAt: "2026-09-01T08:00:00.000Z",
      method: "caneta",
      medication: "Tirzepatida",
      doseMg: mg,
      site: (["abdomen", "coxa", "braco"] as const)[i % 3],
    });
  });

test("degraus de dose sobre o gráfico: faixas com o mesmo x do peso, marcas das aplicações e nome acessível", () => {
  const points = weightTrend(weekly());
  const timeline = doseTimeline(titration(), TODAY, 4)!;
  const base = { points, start: "2026-08-06", end: TODAY, target: null, width: 340, height: 220 };
  const overlay = weightChartModel({ ...base, dose: timeline }).dose!;
  assert.deepEqual(
    overlay.segments.map((s) => [s.x, s.width, s.isAlt, s.showLabel, s.label]),
    [
      [10, 166.9, false, true, "2,50 mg"],
      [176.9, 125.1, true, true, "5,00 mg"],
    ],
  );
  assert.deepEqual(overlay.segments.map((s) => s.key), timeline.spans.map((s) => s.key));
  assert.equal(overlay.marks.length, 8);
  assert.deepEqual(overlay.marks[0], { x: 10, date: "2026-08-06" });
  assert.deepEqual(overlay.marks.at(-1), { x: 302, date: TODAY });
  assert.equal(
    overlay.aria,
    "Doses registradas no período: Tirzepatida 2,50 mg de 6 ago a 27 ago (4 aplicações); Tirzepatida 5,00 mg desde 3 set (4 aplicações)",
  );
  // O resto do gráfico não muda com a faixa de dose.
  const plain = weightChartModel(base);
  assert.equal(plain.dose, null);
  assert.deepEqual(weightChartModel({ ...base, dose: null }).dots, plain.dots);
  assert.deepEqual(weightChartModel({ ...base, dose: timeline }).yTicks, plain.yTicks);
  // Degrau inteiro antes do início do período some; o visível começa na borda do gráfico.
  const recent = weightChartModel({ ...base, start: "2026-09-10", dose: timeline }).dose!;
  assert.equal(recent.segments.length, 1);
  assert.equal(recent.segments[0]!.x, 10);
  assert.equal(recent.segments[0]!.label, "5,00 mg");
  assert.equal(recent.segments[0]!.isAlt, false);
  assert.equal(recent.marks.length, 3);
  assert.equal(recent.aria, doseTimelineAria([timeline.spans[1]!], TODAY));
  // Sem degrau no período, sem faixa.
  const before = doseTimeline(titration().slice(0, 1), "2026-08-06", 4)!;
  assert.equal(weightChartModel({ ...base, start: "2026-09-01", dose: before }).dose, null);
  assert.equal(overlay.next, null);
  assert.equal(overlay.segments[0]!.rate, "2,50 mg/sem");
});

test("gráfico da Evolução: meta só perto dos dados, 5 datas com \"hoje\", faixa de aplicações e a próxima estimada", () => {
  const points = weightTrend(weekly());
  const timeline = doseTimeline(titration(), TODAY, 4)!;
  const next = shiftDate(TODAY, 7);
  const end = weightChartEnd(TODAY, next);
  assert.equal(end, shiftDate(next, NEXT_DOSE_TAIL_DAYS));
  // Próxima no passado (ou nenhuma): o gráfico termina hoje.
  assert.equal(weightChartEnd(TODAY, shiftDate(TODAY, -1)), TODAY);
  assert.equal(weightChartEnd(TODAY, null), TODAY);
  const evol = {
    points,
    start: points[0]!.date,
    end,
    today: TODAY,
    target: 66,
    width: 350,
    height: 230,
    dose: timeline,
    targetFit: "near" as const,
    xTickCount: 5,
    laneHeight: 24,
    nextDose: next,
  };
  const model = weightChartModel(evol);
  // Meta de 66 kg longe dos dados (72–76,4): fora da escala, a curva não achata.
  assert.equal(model.targetY, null);
  assert.deepEqual(model.yTicks.map((t) => t.label), ["72", "74", "76"]);
  // Com a meta perto dos dados, ela entra na escala como no relatório.
  assert.notEqual(weightChartModel({ ...evol, target: 71.5 }).targetY, null);
  assert.notEqual(weightChartModel({ ...evol, targetFit: "fit" }).targetY, null);
  // "hoje" forçado no x de hoje; datas depois dele (ou coladas nele) saem.
  const labels = model.xTicks.map((t) => t.label);
  assert.equal(labels.at(-1), "hoje");
  assert.equal(labels[0], "6 ago");
  assert.ok(labels.length >= 4 && labels.length <= 5, labels.join());
  const todayTick = model.xTicks.at(-1)!;
  assert.equal(todayTick.x, model.dots.at(-1)!.x);
  for (const tick of model.xTicks.slice(0, -1)) assert.ok(todayTick.x - tick.x >= TODAY_TICK_GAP_PX);
  // Faixa "Aplicações" dentro do gráfico, abaixo da área do peso.
  assert.ok(model.lane);
  assert.ok(model.lane!.top > model.plot.bottom);
  assert.equal(model.lane!.bottom - model.lane!.top, 24);
  for (const dot of model.dots) assert.ok(dot.y <= model.plot.bottom);
  // A próxima aplicação estimada fica no gráfico, à direita de hoje, e o degrau vai até a borda.
  const overlay = model.dose!;
  assert.equal(overlay.next!.date, next);
  assert.ok(overlay.next!.x > todayTick.x && overlay.next!.x <= model.plot.right);
  const lastSeg = overlay.segments.at(-1)!;
  assert.equal(Math.round(lastSeg.x + lastSeg.width), model.plot.right);
  assert.equal(overlay.marks.length, 8);
  // O gráfico vai além de hoje (próxima estimada), mas o degrau em curso continua "desde…" no nome acessível.
  assert.match(overlay.aria, /5,00 mg desde [0-9]+ [a-z]+ [(][0-9]+ aplicaç/);
  // Sem `laneHeight` (relatório), sem faixa; sem `nextDose`, sem a próxima.
  assert.equal(weightChartModel({ ...evol, laneHeight: 0 }).lane, null);
  assert.equal(weightChartModel({ ...evol, nextDose: null }).dose!.next, null);
});

test("barras dos dias: altura relativa, média só dos dias com registro, hoje e meta", () => {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDate(TODAY, i - 6));
  const bars = dayBars(
    days.map((date, i) => ({ date, label: String(i), value: i === 2 ? 0 : 1500 + i * 50, goal: 1645 })),
    TODAY,
  );
  assert.equal(bars.bars.length, 7);
  assert.equal(bars.bars[2]!.hasRecord, false);
  assert.equal(bars.bars[6]!.isToday, true);
  assert.equal(bars.goal, 1645);
  assert.ok(bars.goalPct! > 0 && bars.goalPct! < 100);
  for (const bar of bars.bars) assert.ok(bar.heightPct >= 0 && bar.heightPct <= 100);
  assert.equal(bars.average, Math.round((1500 + 1550 + 1650 + 1700 + 1750 + 1800) / 6));
  const empty = dayBars(days.map((date) => ({ date, label: "", value: 0, goal: null })), TODAY);
  assert.equal(empty.average, null);
  assert.equal(empty.goalPct, null);
});

test("proteína de referência: 1,2 a 1,6 g por kg, com a faixa dentro da escala das barras", () => {
  const band = proteinBand(72.4);
  assert.deepEqual(band, { min: 87, max: 116 });
  const days = [0, 1, 2].map((i) => shiftDate(TODAY, i - 2));
  const bars = dayBars(days.map((date) => ({ date, label: "", value: 60, goal: null })), TODAY, band);
  assert.ok(bars.bandPct!.min < bars.bandPct!.max && bars.bandPct!.max < 100);
  assert.equal(dayBars([], TODAY).bandPct, null);
});

test("linha de partida: checklist de primeiros registros, sem pesagem para perfil sensível", () => {
  const state = withMeasurements([measure(TODAY, 72)]);
  state.diary = [];
  const items = startChecklist(state, TODAY);
  assert.deepEqual(
    items.map((i) => i.key),
    ["pesagem", "refeicoes", "agua"],
  );
  assert.equal(items[0]!.done, 1);
  assert.equal(items[0]!.total, 2);
  const sensitive = withMeasurements([measure(TODAY, 72)], { eatingDisorder: "sim" });
  assert.ok(!startChecklist(sensitive, TODAY).some((i) => i.key === "pesagem"));
});

/** Meio da manhã de hoje, antes do horário do lembrete de medidas (09:00). */
const MORNING = new Date(`${TODAY}T08:00:00`);

test("próxima pesagem: 7 dias depois da última, hoje quando vence e sugerida hoje quando passou", () => {
  const next = nextWeighIn(withMeasurements([measure(shiftDate(TODAY, -10), 73), measure(TODAY, 72)]), TODAY, MORNING)!;
  assert.deepEqual(next, {
    date: shiftDate(TODAY, 7),
    status: "future",
    label: "Próxima pesagem: qui, 1 out",
  });
  const due = nextWeighIn(withMeasurements([measure(shiftDate(TODAY, -7), 72)]), TODAY, MORNING)!;
  assert.deepEqual([due.date, due.status, due.label], [TODAY, "today", "Próxima pesagem hoje"]);
  const late = nextWeighIn(withMeasurements([measure(shiftDate(TODAY, -12), 72)]), TODAY, MORNING)!;
  assert.deepEqual([late.date, late.status, late.label], [TODAY, "overdue", "Pesagem sugerida hoje"]);
});

test("próxima pesagem segue o lembrete de medidas quando ele está ativo", () => {
  const state = withMeasurements([measure(shiftDate(TODAY, -3), 72)], { remindersEnabled: true });
  const planned = planReminders(state, MORNING).find((r) => r.type === "medicao");
  assert.ok(planned);
  const next = nextWeighIn(state, TODAY, MORNING)!;
  assert.equal(next.date, planned.date);
  assert.equal(next.date, shiftDate(TODAY, 4));
  assert.equal(next.label, "Próxima pesagem: seg, 28 set");
});

test("próxima pesagem não aparece para perfil sensível nem sem pesagens", () => {
  for (const change of [{ eatingDisorder: "sim" }, { pregnancy: "amamentacao" }] as const)
    assert.equal(nextWeighIn(withMeasurements([measure(TODAY, 72)], change), TODAY, MORNING), null);
  assert.equal(nextWeighIn(withMeasurements([]), TODAY, MORNING), null);
});

test("menor de idade é perfil calmo: sem próxima pesagem nem 'segunda pesagem' na linha de partida", () => {
  const minor = { birthDate: "2010-05-01" } as const;
  const late = withMeasurements([measure(shiftDate(TODAY, -12), 73), measure(shiftDate(TODAY, -10), 72)], minor);
  assert.equal(nextWeighIn(late, TODAY, MORNING), null);
  const ahead = withMeasurements([measure(shiftDate(TODAY, -3), 72)], { ...minor, remindersEnabled: true });
  assert.equal(nextWeighIn(ahead, TODAY, MORNING), null);
  assert.ok(!startChecklist(withMeasurements([measure(TODAY, 72)], minor), TODAY).some((i) => i.key === "pesagem"));
  // 18 anos no próprio dia: volta a ser adulto.
  const adult = withMeasurements([measure(shiftDate(TODAY, -12), 72)], { birthDate: "2008-09-24" });
  assert.equal(nextWeighIn(adult, TODAY, MORNING)?.status, "overdue");
});

test("evolutionSubtitle: data curta e semanas desde o primeiro registro, sem sequência", () => {
  const today = "2026-09-24";
  const base = stateFixture();
  const withSince = (date: string): AppState => ({
    ...base,
    goalHistory: [],
    diary: [],
    measurements: [{ ...(base.measurements[0] ?? {}), id: uid(), date } as Measurement],
  });
  assert.equal(evolutionSubtitle(withSince("2026-08-06"), today), "Qui, 24 set · 7 semanas de registros");
  assert.equal(evolutionSubtitle(withSince("2026-09-15"), today), "Qui, 24 set · 1 semana de registros");
  assert.equal(evolutionSubtitle(withSince("2026-09-20"), today), "Qui, 24 set · primeira semana de registros");
  assert.equal(
    evolutionSubtitle({ ...base, goalHistory: [], diary: [], measurements: [] }, today),
    "Qui, 24 set",
  );
});

test("eixo x estreito (320 px): as datas ficam a pelo menos MIN_TICK_SPACING_PX umas das outras", () => {
  const points = weightTrend(weekly());
  const narrow = weightChartModel({ points, start: "2026-08-06", end: TODAY, today: TODAY, target: null, width: 254, height: 244, xTickCount: 5 });
  const regular = narrow.xTicks.filter((t) => t.label !== "hoje");
  const where = narrow.xTicks.map((t) => `${t.label}@${t.x}`).join(" ");
  for (let i = 1; i < regular.length; i++) assert.ok(regular[i]!.x - regular[i - 1]!.x >= MIN_TICK_SPACING_PX, where);
  assert.equal(narrow.xTicks.at(-1)!.label, "hoje");
  // Na largura do conceito (350 px) continuam 4 a 5 datas.
  const wide = weightChartModel({ points, start: "2026-08-06", end: TODAY, today: TODAY, target: null, width: 350, height: 244, xTickCount: 5 });
  assert.ok(wide.xTicks.length >= 4 && wide.xTicks.length <= 5, wide.xTicks.map((t) => t.label).join());
});
