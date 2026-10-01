import { test } from "node:test";
import assert from "node:assert/strict";
import { injectionSchema, type InjectionEntry, type Profile } from "../src/types";
import { shiftDate } from "../src/lib/dates";
import {
  cycleStrip,
  DOSE_OVERLAY_NOTE,
  doseCards,
  doseStepKey,
  doseSteps,
  doseTimeline,
  doseTimelineAria,
  injectionCardModel,
  isMinorOn,
  LAST_APPLICATION_KICKER,
  NEXT_APPLICATION_KICKER,
  nextApplicationModel,
  nextDoseEstimate,
  nextDoseText,
  savedSheetModel,
  shouldShowTreatment,
  tracksDoseSchedule,
  treatmentModel,
  type NextDose,
} from "../src/lib/treatment";
import { isCalmProfile } from "../src/lib/space";
import { profileFixture } from "./fixtures";

const T = "2026-09-24";
const WEEKLY = 4;
const penProfile = (over: Partial<Profile> = {}): Profile => ({
  ...profileFixture(),
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro",
  weightLossPenDose: "2,5 mg",
  weightLossPenPerMonth: WEEKLY,
  ...over,
});
let seq = 0;
/** Tirzepatida 2,5 mg (5 mg/ml, 50 UI na seringa de 100) `days` dias a partir de T. */
function dose(days: number, over: Record<string, unknown> = {}): InjectionEntry {
  seq += 1;
  return injectionSchema.parse({
    id: `inj-${seq}`,
    userId: "user",
    date: shiftDate(T, days),
    time: "08:30",
    createdAt: `2026-09-01T08:00:00.${String(seq).padStart(3, "0")}Z`,
    updatedAt: "2026-09-01T08:00:00.000Z",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
    ...over,
  });
}
const penDose = (days: number, mg: number, medication = "Mounjaro") =>
  dose(days, {
    method: "caneta",
    medication,
    concentrationMgPerMl: null,
    syringeUnits: null,
    units: null,
    volumeMl: null,
    doseMg: mg,
  });
const estimate = (lastDays: number, perMonth: number | null = WEEKLY): NextDose =>
  nextDoseEstimate([dose(lastDays)], T, perMonth)!;

test("semanal, última há 2 dias: faltam 5, dia 3 de 7 e texto da estimativa", () => {
  const next = estimate(-2);
  assert.equal(next.date, "2026-09-29");
  assert.equal(next.daysUntil, 5);
  assert.equal(next.elapsedDays, 2);
  assert.equal(next.intervalDays, 7);
  assert.ok(Math.abs(next.progress - 28.57) < 0.01);
  assert.equal(next.isDue, false);
  assert.equal(next.cycleDay, 3);
  assert.deepEqual(nextDoseText(next, T), {
    ring: "5",
    unit: "dias",
    line: "Próxima estimada: Ter, 29 set",
    short: "Próxima: terça, 29",
    aria: "Próxima dose estimada em 5 dias, Ter, 29 set, dia 3 de 7 do ciclo",
    hint: null,
  });
});

test("janela do dia estimado: no dia e até um intervalo depois; receita velha não estima", () => {
  assert.equal(estimate(-7).isDue, true);
  const late = estimate(-10);
  assert.equal(late.daysUntil, -3);
  assert.equal(late.isDue, true);
  assert.equal(nextDoseText(late, T).hint, "Se já aplicou, registre para atualizar a estimativa.");
  const older = estimate(-15);
  assert.equal(older.daysUntil, -8);
  assert.equal(older.isDue, false);
  assert.equal(nextDoseEstimate([dose(-22)], T, WEEKLY), null);
  assert.equal(estimate(-15).progress, 100);
});

test("sem histórico ou só com datas futuras não há estimativa", () => {
  assert.equal(nextDoseEstimate([], T, WEEKLY), null);
  assert.equal(nextDoseEstimate([dose(3)], T, WEEKLY), null);
});

test("diária e quinzenal não mostram o ciclo em dias", () => {
  assert.equal(estimate(0, 30).cycleDay, null);
  assert.equal(estimate(-2, 2).cycleDay, null);
  assert.equal(estimate(-2, 2).intervalDays, 14);
  assert.equal(cycleStrip(estimate(-2, 2), shiftDate(T, -2)), null);
});

test("textos da próxima dose: sempre 'estimada', nunca 'atrasada'", () => {
  const texts = [-2, -6, -7, -9].map((days) => nextDoseText(estimate(days), T));
  assert.deepEqual(texts[1], {
    ring: "1",
    unit: "dia",
    line: "Próxima estimada: amanhã",
    short: "Próxima: amanhã",
    aria: "Próxima dose estimada para amanhã, Sex, 25 set, dia 7 de 7 do ciclo",
    hint: null,
  });
  assert.deepEqual(texts[2], {
    ring: "Hoje",
    unit: "",
    line: "Aplicação estimada para hoje",
    short: "Aplicação estimada para hoje",
    aria: "Próxima dose estimada para hoje",
    hint: null,
  });
  assert.deepEqual(texts[3], {
    ring: "",
    unit: "",
    line: "Aplicação estimada para Ter, 22 set",
    short: "Aplicação estimada para terça, 22",
    aria: "Dose estimada para Ter, 22 set, há 2 dias",
    hint: "Se já aplicou, registre para atualizar a estimativa.",
  });
  for (const text of texts) {
    assert.doesNotMatch(JSON.stringify(text), /atrasad/i);
    assert.match(text.aria, /estimada/);
  }
});

test("contagem só para caneta declarada e gestação/amamentação respondida com 'não'", () => {
  assert.equal(tracksDoseSchedule(penProfile({ pregnancy: "gestacao" })), false);
  assert.equal(tracksDoseSchedule(penProfile({ pregnancy: "amamentacao" })), false);
  assert.equal(tracksDoseSchedule(penProfile({ pregnancy: "nao_informado" })), false);
  assert.equal(tracksDoseSchedule(penProfile({ weightLossPen: "nao" })), false);
  assert.equal(tracksDoseSchedule(penProfile({ weightLossPen: "nao_informado" })), false);
  assert.equal(tracksDoseSchedule(penProfile()), true);
});

test("card do Hoje: sem estimativa para perfis sensíveis, promovido no dia com receita fresca", () => {
  for (const pregnancy of ["gestacao", "amamentacao"] as const) {
    const p = penProfile({ pregnancy });
    const model = injectionCardModel(p, [dose(-7)], T);
    assert.equal(model.tracks, false);
    assert.equal(model.next, null);
    assert.equal(model.text, null);
    assert.equal(model.strip, null);
    assert.equal(model.isPromoted, false);
    assert.equal(model.variant, "history");
    assert.equal(injectionCardModel(p, [], T).variant, "first");
  }
  const due = injectionCardModel(penProfile(), [dose(-14), dose(-7)], T);
  assert.equal(due.variant, "estimate");
  assert.equal(due.isPromoted, true);
  assert.equal(due.recipe?.repeats, 2);
  assert.equal(due.text?.ring, "Hoje");
  const midCycle = injectionCardModel(penProfile(), [dose(-2)], T);
  assert.equal(midCycle.variant, "estimate");
  assert.equal(midCycle.isPromoted, false);
  assert.equal(midCycle.strip?.length, 7);
  const stale = injectionCardModel(penProfile(), [dose(-30)], T);
  assert.equal(stale.variant, "history");
  assert.equal(stale.recipe, null);
  assert.equal(stale.next, null);
  assert.equal(injectionCardModel(penProfile(), [], T).variant, "first");
  assert.equal(injectionCardModel(penProfile({ weightLossPen: "nao" }), [dose(-7)], T).variant, "history");
});

test("faixa do ciclo: aplicação, dias passados, hoje e dias futuros", () => {
  const strip = cycleStrip(estimate(-2), shiftDate(T, -2))!;
  assert.deepEqual(
    strip.map((c) => c.state),
    ["aplicacao", "passado", "hoje", "futuro", "futuro", "futuro", "futuro"],
  );
  assert.deepEqual(strip.map((c) => c.isToday), [false, false, true, false, false, false, false]);
  assert.equal(strip[0].date, "2026-09-22");
  assert.equal(strip[0].weekday, "ter");
  assert.equal(strip[2].weekday, "qui");
  const sameDay = cycleStrip(estimate(0), T)!;
  assert.deepEqual(
    sameDay.map((c) => c.state),
    ["aplicacao", "futuro", "futuro", "futuro", "futuro", "futuro", "futuro"],
  );
  assert.equal(sameDay[0].isToday, true);
  assert.ok(!sameDay.some((c) => c.state === "hoje"));
});

test("degraus de dose: mesma faixa de 0,05 mg junta, troca de medicação separa, cronológico e limitado", () => {
  const steps = doseSteps(
    [penDose(-20, 0.4958), penDose(-13, 0.5092), penDose(-6, 1), penDose(-1, 1, "Semaglutida"), penDose(2, 5)],
    T,
  );
  assert.deepEqual(
    steps.map((s) => [s.doseMg, s.medication, s.from, s.to, s.count]),
    [
      [0.5092, "Mounjaro", "2026-09-04", "2026-09-11", 2],
      [1, "Mounjaro", "2026-09-18", "2026-09-18", 1],
      [1, "Semaglutida", "2026-09-23", "2026-09-23", 1],
    ],
  );
  const many = Array.from({ length: 8 }, (_, i) => penDose(-8 + i, i % 2 ? 2.5 : 5));
  const limited = doseSteps(many, T);
  assert.equal(limited.length, 6);
  assert.equal(limited[5].from, "2026-09-23");
  assert.deepEqual(doseSteps(many, T, 2).map((s) => s.from), ["2026-09-22", "2026-09-23"]);
  assert.deepEqual(doseSteps([], T), []);
});

test("Meu tratamento: medicação, frequência, método, próxima estimada e degraus acessíveis", () => {
  const list = [
    dose(-16),
    dose(-9),
    dose(-2, { units: 100, volumeMl: 1, doseMg: 5 }),
  ];
  const model = treatmentModel(penProfile(), list, T);
  assert.equal(model.medication, "Tirzepatida");
  assert.equal(model.interval, "semanal");
  assert.equal(model.method, "Frasco e seringa");
  assert.equal(model.nextLine, "Próxima dose estimada: Ter, 29 set");
  assert.equal(
    model.stepsAria,
    "Degraus de dose: 2,50 mg desde 8 set (2 aplicações); 5,00 mg desde 22 set (1 aplicação)",
  );
  const first = treatmentModel(penProfile(), [], T);
  assert.equal(first.medication, "Mounjaro");
  assert.equal(first.method, null);
  assert.equal(first.nextLine, "Registre a primeira aplicação para estimar a próxima dose.");
  assert.deepEqual(first.steps, []);
  const other = treatmentModel(
    penProfile({ weightLossPen: "nao", weightLossPenName: "", weightLossPenPerMonth: null }),
    [],
    T,
  );
  assert.equal(other.medication, "Medicação injetável");
  assert.equal(other.nextLine, null);
  assert.equal(treatmentModel(penProfile({ pregnancy: "gestacao" }), list, T).nextLine, null);
  assert.equal(treatmentModel(penProfile(), [penDose(-2, 2.5)], T).method, "Caneta com seletor");
  assert.equal(shouldShowTreatment(penProfile(), []), true);
  assert.equal(shouldShowTreatment(penProfile({ weightLossPen: "nao" }), []), false);
  assert.equal(shouldShowTreatment(penProfile({ weightLossPen: "nao" }), list), true);
});

/* Onda 3 · Lote 3: degraus de dose na Evolução (EVOL-04) e folha pós-registro (SERINGA-10). */
const five = (days: number, over: Record<string, unknown> = {}) =>
  dose(days, { units: 100, volumeMl: 1, doseMg: 5, ...over });
/** 2,5 mg em −49/−42/−35/−28 e 5 mg em −21/−14/−7/0 (semanal), sites alternando e lados em parte. */
const titration = () => [
  dose(-49, { site: "abdomen", side: "esquerdo" }),
  dose(-42, { site: "coxa" }),
  dose(-35, { site: "braco" }),
  dose(-28, { site: "abdomen" }),
  five(-21, { site: "coxa", side: "direito" }),
  five(-14, { site: "braco" }),
  five(-7, { site: "abdomen" }),
  five(0, { site: "coxa" }),
];
const NO_DOSE_ADVICE = /aument|reduz|ajust|mantenha|dobr|atrasad/i;

test("degraus de dose: contínuos, fim exclusivo, pausa longa abre outro degrau e sem nível estimado", () => {
  const timeline = doseTimeline([...titration(), five(3)], T, WEEKLY)!;
  assert.deepEqual(
    timeline.spans.map((s) => [s.from, s.lastDate, s.end, s.count, s.label, s.medication]),
    [
      ["2026-08-06", "2026-08-27", "2026-09-03", 4, "2,50 mg", "Tirzepatida"],
      ["2026-09-03", "2026-09-24", "2026-10-01", 4, "5,00 mg", "Tirzepatida"],
    ],
  );
  assert.equal(new Set(timeline.spans.map((s) => s.key)).size, 2);
  assert.equal(timeline.applications.length, 8);
  assert.deepEqual(timeline.applications[0], { date: "2026-08-06", site: "abdomen", side: "esquerdo" });
  assert.deepEqual(timeline.applications[1], { date: "2026-08-13", site: "coxa", side: null });
  const paused = doseTimeline([dose(-70), dose(-35)], T, WEEKLY)!;
  assert.deepEqual(
    paused.spans.map((s) => [s.from, s.lastDate, s.end, s.count, s.doseMg]),
    [
      ["2026-07-16", "2026-07-16", "2026-07-23", 1, 2.5],
      ["2026-08-20", "2026-08-20", "2026-08-27", 1, 2.5],
    ],
  );
  assert.notEqual(paused.spans[0]!.key, paused.spans[1]!.key);
  assert.equal(doseTimeline([], T, WEEKLY), null);
  assert.equal(doseTimeline([dose(2)], T, WEEKLY), null);
});

test("nome acessível dos degraus: período registrado e contagem de aplicações", () => {
  const spans = doseTimeline(titration(), T, WEEKLY)!.spans;
  assert.equal(
    doseTimelineAria(spans, T),
    "Doses registradas no período: Tirzepatida 2,50 mg de 6 ago a 27 ago (4 aplicações); Tirzepatida 5,00 mg desde 3 set (4 aplicações)",
  );
  const single = doseTimeline([dose(-40)], T, WEEKLY)!.spans;
  assert.equal(doseTimelineAria(single, T), "Doses registradas no período: Tirzepatida 2,50 mg em 15 ago (1 aplicação)");
  assert.equal(doseTimelineAria([], T), "Doses registradas no período: nenhuma aplicação");
  assert.doesNotMatch(DOSE_OVERLAY_NOTE + doseTimelineAria(spans, T), /nível|concentração no sangue|eficaz|funcionou/i);
});

test("cartões por dose: do mais recente para o mais antigo, sem peso", () => {
  const cards = doseCards(doseTimeline(titration(), T, WEEKLY)!, T);
  assert.deepEqual(
    cards.map((c) => [c.dose, c.medication, c.period, c.count, c.isLatest]),
    [
      ["5,00 mg", "Tirzepatida", "desde 3 set", "4 aplicações", true],
      ["2,50 mg", "Tirzepatida", "6 ago – 27 ago", "4 aplicações", false],
    ],
  );
  assert.doesNotMatch(JSON.stringify(cards), /kg/);
  const many = Array.from({ length: 8 }, (_, i) => penDose(-8 + i, i % 2 ? 2.5 : 5));
  assert.equal(doseCards(doseTimeline(many, T, WEEKLY)!, T).length, 6);
});

test("folha pós-registro: o que foi gravado, próxima estimada e próximo local, sem conselho de dose", () => {
  const entry = dose(0, { site: "coxa", side: "esquerdo" });
  const model = savedSheetModel(penProfile(), [entry], entry, T);
  assert.deepEqual(model, {
    lead: "Aplicação registrada no diário: Tirzepatida 2,50 mg.",
    when: "Hoje, 08:30 · Coxa esquerda",
    nextDose: "Próxima dose estimada: Qui, 1 out",
    nextDoseHint: "Pela frequência informada no seu perfil.",
    nextSite: "Próximo local sugerido: Braço",
    showMeasures: true,
  });
  for (const pregnancy of ["gestacao", "amamentacao"] as const) {
    const sensitive = savedSheetModel(penProfile({ pregnancy }), [entry], entry, T);
    assert.equal(sensitive.nextDose, null);
    assert.equal(sensitive.nextDoseHint, null);
    assert.equal(sensitive.showMeasures, false);
  }
  const eating = savedSheetModel(penProfile({ eatingDisorder: "sim" }), [entry], entry, T);
  assert.equal(eating.showMeasures, false);
  // Menor de 18 é perfil calmo: sem "Registrar medidas", com a mesma regra de isCalmProfile.
  const year = Number(T.slice(0, 4));
  for (const birthDate of [
    `${year - 16}-01-01`,
    `${year - 18}${shiftDate(T, 1).slice(4)}`,
    `${year - 18}${T.slice(4)}`,
    `${year - 30}-06-15`,
    "",
  ]) {
    const p = penProfile({ birthDate });
    assert.equal(
      savedSheetModel(p, [entry], entry, T).showMeasures,
      !isCalmProfile(p, T),
      birthDate,
    );
  }
  assert.equal(savedSheetModel(penProfile({ birthDate: `${year - 16}-01-01` }), [entry], entry, T).showMeasures, false);
  assert.equal(savedSheetModel(penProfile({ birthDate: `${year - 18}${T.slice(4)}` }), [entry], entry, T).showMeasures, true);
  const noPen = savedSheetModel(penProfile({ weightLossPen: "nao" }), [entry], entry, T);
  assert.equal(noPen.nextDose, null);
  assert.equal(noPen.showMeasures, true);
  const yesterday = dose(-1, { site: "braco" });
  assert.equal(savedSheetModel(penProfile(), [yesterday], yesterday, T).when, "Ontem, 08:30 · Braço");
  const older = dose(-7, { site: "abdomen", side: "direito" });
  const late = savedSheetModel(penProfile(), [older], older, T);
  assert.equal(late.when, "Qui, 17 set, 08:30 · Abdômen à direita");
  assert.equal(late.nextDose, "Aplicação estimada para hoje");
  for (const m of [model, eating, noPen, late])
    for (const text of Object.values(m))
      if (typeof text === "string") assert.doesNotMatch(text, NO_DOSE_ADVICE, text);
});

test("Meu tratamento: dia da aplicação semanal informado na anamnese vira 'semanal, às quintas'", () => {
  const list = [dose(-2)];
  assert.equal(treatmentModel(penProfile({ penWeekday: 4 }), list, T).interval, "semanal, às quintas");
  assert.equal(treatmentModel(penProfile({ penWeekday: null }), list, T).interval, "semanal");
  assert.equal(
    treatmentModel(penProfile({ penWeekday: 4, weightLossPenPerMonth: 30 }), list, T).interval,
    "diária",
  );
});

test("degrau de dose e menor de idade exportados para a grade do ciclo e as dicas (SERINGA-07/11)", () => {
  const day = "2026-09-28";
  assert.equal(doseStepKey({ medication: "Tirzepatida", doseMg: 5 }), "tirzepatida:100");
  assert.equal(doseStepKey({ medication: "Ozempic", doseMg: 0.25 }), "semaglutida:5");
  assert.equal(isMinorOn("2010-05-01", day), true);
  assert.equal(isMinorOn("2008-09-28", day), false, "18 anos no próprio dia");
  assert.equal(isMinorOn("2008-09-29", day), true);
  assert.equal(isMinorOn("", day), true, "data inválida conta como menor");
});

test("cartão Próxima aplicação: data estimada, lembrete ativo e local sugerido, sem dose", () => {
  const list = [dose(-9), dose(-2)];
  const model = nextApplicationModel(penProfile(), list, T, [
    { type: "agua", date: "2026-09-29", time: "10:00" },
    { type: "injecao", date: "2026-09-29", time: "08:30" },
  ]);
  assert.ok(model);
  assert.equal(model.variant, "estimate");
  assert.equal(model.kicker, NEXT_APPLICATION_KICKER);
  assert.equal(model.dateTitle, "Terça, 29 set");
  assert.equal(model.timeLine, "08:30 · lembrete ativo");
  assert.equal(model.hint, null);
  assert.ok(model.suggestedLabel.length > 0);
  assert.doesNotMatch(JSON.stringify(model), /\bmg\b|atrasad/i);
  // Sem lembrete planejado: o horário da última aplicação, sem "lembrete ativo".
  const quiet = nextApplicationModel(penProfile(), list, T);
  assert.equal(quiet?.timeLine, list[1]!.time);
});

test("cartão Próxima aplicação: no dia é 'Hoje', depois fica neutro com a dica; gestação só mostra a última", () => {
  assert.equal(nextApplicationModel(penProfile(), [dose(-7)], T)?.dateTitle, "Hoje, 24 set");
  const late = nextApplicationModel(penProfile(), [dose(-9)], T);
  assert.equal(late?.dateTitle, "Estimada para terça, 22 set");
  assert.equal(late?.hint, "Se já aplicou, registre para atualizar a estimativa.");
  const pregnant = nextApplicationModel(penProfile({ pregnancy: "gestacao" }), [dose(-2)], T);
  assert.equal(pregnant?.variant, "history");
  assert.equal(pregnant?.kicker, LAST_APPLICATION_KICKER);
  assert.equal(pregnant?.next, null);
  assert.equal(pregnant?.dateTitle, "Terça, 22 set");
  assert.match(pregnant?.timeLine ?? "", /^há 2 dias · /);
  assert.equal(nextApplicationModel(penProfile(), [], T), null);
});

test("degrau semanal ganha o rótulo por semana para o gráfico da Evolução", () => {
  const timeline = doseTimeline([dose(-9), dose(-2)], T, WEEKLY);
  assert.ok(timeline);
  const span = timeline.spans.at(-1)!;
  assert.equal(span.rate, `${span.label}/sem`);
  const monthly = doseTimeline([dose(-2)], T, 1);
  assert.equal(monthly?.spans[0]!.rate, monthly?.spans[0]!.label);
});
