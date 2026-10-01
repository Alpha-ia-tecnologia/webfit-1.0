import { test } from "node:test";
import assert from "node:assert/strict";
import {
  injectionSchema,
  stateSchema,
  type InjectionEntry,
} from "../src/types";
import * as domain from "../src/lib/domain";
import {
  agentContext,
  initialState,
  localDate,
  shiftDate,
} from "../src/lib/domain";
import * as dates from "../src/lib/dates";
import { parseBackup } from "../src/lib/backup";
import {
  applyDoseMg,
  clampConcentration,
  clampUnits,
  customMedicationLabel,
  daysAgoLabel,
  doseBand,
  doseMg,
  doseOverflowText,
  doseRuler,
  draftInjection,
  fmtConcentration,
  fmtMg,
  fmtMl,
  fmtNumber2,
  injectionDetail,
  injectionSummary,
  injectionTitle,
  intervalLabel,
  intervalPlural,
  isPenMethod,
  isRecipeFresh,
  lastRecipe,
  medicationFor,
  methodInfo,
  nearestMarkText,
  nextSite,
  parseDoseMg,
  penIntervalDays,
  presetMatches,
  recentInjectionText,
  recentInjectionWarning,
  recentSummary,
  recipeBadge,
  recipeCta,
  recipeFreshDays,
  recipeHeading,
  rulerDoseMg,
  safetyItems,
  shortSpotLabel,
  stepVialDose,
  syringeFor,
  syringeProfile,
  syringeTicks,
  unitsForDose,
  volumeMl,
  type InjectionInput,
} from "../src/lib/injection";
import {
  compactContext,
  deriveFacts,
  extractFlags,
} from "../server/graph/prepare";
import { stateFixture } from "./fixtures";

const today = localDate();
function entry(over: Partial<InjectionEntry> = {}): InjectionEntry {
  return injectionSchema.parse({
    id: "inj-1",
    userId: "user",
    date: today,
    time: "08:00",
    createdAt: "2026-09-12T08:00:00.000Z",
    updatedAt: "2026-09-12T08:00:00.000Z",
    medication: "Semaglutida",
    concentrationMgPerMl: 1.34,
    syringeUnits: 50,
    units: 37,
    volumeMl: 0.37,
    doseMg: 0.496,
    site: "coxa",
    notes: "",
    ...over,
  });
}

test("conversões da seringa: 100 UI = 1 ml e a dose segue a concentração do frasco", () => {
  assert.equal(volumeMl(10), 0.1);
  assert.equal(doseMg(10, 1.34), 0.134);
  assert.equal(doseMg(100, 5), 5);
  assert.equal(unitsForDose(0.5, 1.34), 37);
  assert.equal(unitsForDose(5, 5), 100);
  assert.equal(unitsForDose(0.001, 5), 1);
  assert.equal(syringeFor(10), 30);
  assert.equal(syringeFor(37), 50);
  assert.equal(syringeFor(51), 100);
  assert.equal(syringeFor(140), 100);
  assert.equal(clampUnits(0, 30), 1);
  assert.equal(clampUnits(45, 30), 30);
  assert.equal(clampUnits(12.6, 50), 13);
  assert.equal(clampConcentration(0), 0.1);
  assert.equal(clampConcentration(1.336), 1.34);
  assert.equal(clampConcentration(99), 50);
});

test("escala desenhada segue o modelo da seringa", () => {
  const micro = syringeTicks(syringeProfile(30));
  assert.equal(micro.length, 31);
  assert.deepEqual(
    micro.filter((t) => t.label).map((t) => t.label),
    ["5", "10", "15", "20", "25", "30"],
  );
  const standard = syringeTicks(syringeProfile(100));
  assert.equal(standard.length, 51);
  assert.equal(standard.filter((t) => t.kind === "major").length, 11);
  assert.equal(standard[0].label, null);
});

test("faixas informativas por medicamento e concentração personalizada", () => {
  assert.equal(doseBand("semaglutida", 0.134).title, "Faixa inicial");
  assert.equal(doseBand("semaglutida", 0.5).title, "Faixa de titulação");
  assert.equal(doseBand("semaglutida", 2.4).title, "Faixa de manutenção");
  assert.equal(doseBand("semaglutida", 2.5).tone, "rose");
  assert.match(doseBand("semaglutida", 2.5).text, /2,40 mg/);
  assert.equal(doseBand("tirzepatida", 5).title, "Faixa de titulação");
  assert.equal(doseBand("tirzepatida", 16).tone, "rose");
  assert.equal(doseBand("personalizado", 3).tone, "neutral");
});

test("medicação padrão vem da anamnese e os locais alternam", () => {
  assert.equal(medicationFor("Mounjaro (tirzepatida)"), "tirzepatida");
  assert.equal(medicationFor("Ozempic (semaglutida)"), "semaglutida");
  assert.equal(medicationFor(""), "semaglutida");
  assert.equal(medicationFor("Não sei o nome"), "semaglutida");
  assert.equal(medicationFor("Saxenda (liraglutida)"), "personalizado");
  assert.equal(
    customMedicationLabel("Saxenda (liraglutida)"),
    "Saxenda (liraglutida)",
  );
  assert.equal(customMedicationLabel("Ozempic (semaglutida)"), "Personalizado");
  assert.equal(customMedicationLabel(""), "Personalizado");
  assert.equal(nextSite(null), "abdomen");
  assert.equal(nextSite("abdomen"), "coxa");
  assert.equal(nextSite("coxa"), "braco");
  assert.equal(nextSite("braco"), "abdomen");
});

test("resumo das aplicações: contagem em 30 dias, dias desde a última, semana e local sugerido", () => {
  const list = [
    entry({ id: "a", date: shiftDate(today, -35), site: "braco" }),
    entry({ id: "b", date: shiftDate(today, -6), site: "abdomen" }),
    entry({ id: "c", date: shiftDate(today, 1), site: "coxa" }),
  ];
  const summary = injectionSummary(list, today);
  assert.equal(summary.recentCount, 1);
  assert.equal(summary.last?.id, "b");
  assert.equal(summary.daysSinceLast, 6);
  assert.equal(summary.weekNumber, 6);
  assert.equal(summary.suggestedSite, "coxa");
  const empty = injectionSummary([], today);
  assert.equal(empty.last, null);
  assert.equal(empty.weekNumber, null);
  assert.equal(empty.suggestedSite, "abdomen");
  assert.equal(daysAgoLabel(0), "hoje");
  assert.equal(daysAgoLabel(1), "ontem");
  assert.equal(daysAgoLabel(6), "há 6 dias");
  assert.equal(daysAgoLabel(null), "sem registro");
});

test("formatação em pt-BR e textos exibidos no diário", () => {
  assert.equal(fmtMg(0.134), "0,13 mg");
  assert.equal(fmtMl(0.1), "0,10 ml");
  assert.equal(fmtConcentration(1.34), "1,34 mg/ml");
  assert.equal(fmtConcentration(5), "5 mg/ml");
  const e = entry();
  assert.equal(injectionTitle(e), "Semaglutida 0,50 mg");
  assert.equal(injectionDetail(e), "37 UI · 0,37 ml · Coxa");
});

test("atalhos da semaglutida a 1,34 mg/ml: sem arredondamento duplo na tela e na régua", () => {
  const concentration = 1.34;
  // 0,25 mg → 19 UI → 0,2546 mg: salvo com 4 casas, aparece "0,25" (antes 0,255 → "0,26").
  assert.equal(unitsForDose(0.25, concentration), 19);
  assert.equal(doseMg(19, concentration), 0.2546);
  assert.equal(fmtMg(doseMg(19, concentration)), "0,25 mg");
  assert.equal(fmtNumber2(doseMg(19, concentration)), "0,25");
  assert.equal(presetMatches(0.25, 19, concentration), true);
  assert.equal(presetMatches(0.5, 19, concentration), false);
  assert.equal(presetMatches(0.25, null, concentration), false);
  assert.equal(rulerDoseMg(0.25, 19, concentration), 0.25);
  assert.equal(doseRuler("semaglutida", rulerDoseMg(0.25, 19, concentration)!)!.active, "inicial");
  assert.equal(nearestMarkText(0.25, 19, concentration), null);
  // 1 mg → 75 UI → 1,005 mg: aparece "1,00", nunca "1,01".
  assert.equal(unitsForDose(1, concentration), 75);
  assert.equal(doseMg(75, concentration), 1.005);
  assert.equal(fmtMg(doseMg(75, concentration)), "1,00 mg");
  assert.equal(fmtNumber2(doseMg(75, concentration)), "1,00");
  assert.equal(presetMatches(1, 75, concentration), true);
  assert.equal(rulerDoseMg(1, 75, concentration), 1);
  assert.equal(doseRuler("semaglutida", 1)!.active, "titulacao");
  assert.equal(nearestMarkText(1, 75, concentration), null);
  const draft = draftInjection({
    id: "d2",
    userId: "user",
    now: "2026-09-24T11:30:00.000Z",
    today,
    date: today,
    time: "08:30",
    method: "frasco",
    medication: "Semaglutida",
    units: 19,
    concentration,
    syringe: 30,
    doseMg: null,
    site: "abdomen",
    notes: "",
  });
  assert.ok(draft.ok);
  assert.equal(draft.entry.doseMg, 0.2546);
  assert.equal(injectionTitle(draft.entry), "Semaglutida 0,25 mg");
});

test("régua e aviso da marca mais próxima: prescrita só quando a UI é a marca dela", () => {
  // Fora da meia UI da marca, a régua usa a dose real.
  assert.equal(rulerDoseMg(0.25, 25, 1.34), doseMg(25, 1.34));
  assert.equal(rulerDoseMg(null, 25, 1.34), 0.335);
  // Sem UI: a dose prescrita (não cabe na seringa) ou nada.
  assert.equal(rulerDoseMg(3, null, 1.34), 3);
  assert.equal(rulerDoseMg(null, null, 1.34), null);
  assert.equal(
    nearestMarkText(2.52, 50, 5),
    "50 UI é a marca mais próxima de 2,52 mg na seringa (2,50 mg).",
  );
  assert.equal(rulerDoseMg(2.52, 50, 5), 2.52);
  assert.equal(nearestMarkText(2.5, 50, 5), null);
  assert.equal(nearestMarkText(2.52, 49, 5), null);
  assert.equal(nearestMarkText(null, 50, 5), null);
  assert.equal(nearestMarkText(2.52, null, 5), null);
});

test("esquema da aplicação exige coerência entre unidades, seringa, volume e dose", () => {
  assert.ok(injectionSchema.safeParse(entry()).success);
  const bad = (over: Record<string, unknown>) =>
    injectionSchema.safeParse({ ...entry(), ...over }).success;
  assert.equal(bad({ units: 60 }), false);
  assert.equal(bad({ volumeMl: 0.5 }), false);
  assert.equal(bad({ doseMg: 1 }), false);
  assert.equal(bad({ site: "gluteo" }), false);
  assert.equal(bad({ syringeUnits: 40 }), false);
  assert.equal(bad({ medication: "" }), false);
});

test("estados antigos carregam sem aplicações e o contexto do agente inclui as recentes", () => {
  const legacy = { ...stateFixture(), injections: undefined };
  assert.deepEqual(stateSchema.parse(legacy).injections, []);
  assert.equal(initialState().injections.length, 0);
  const state = {
    ...stateFixture(),
    injections: [
      entry({ id: "old", date: shiftDate(today, -40) }),
      entry({ id: "new", date: shiftDate(today, -2) }),
    ],
  };
  const context = agentContext(state);
  assert.equal(context.injections.length, 1);
  assert.equal("userId" in context.injections[0], false);
  assert.equal(context.injections[0].doseMg, 0.496);
  const compact = compactContext(context);
  const row = (compact.injections as Record<string, unknown>[])[0];
  assert.equal("id" in row, false);
  assert.equal(row.medication, "Semaglutida");
  const facts = deriveFacts(context, extractFlags(context));
  assert.ok(
    facts.some(
      (f) =>
        f.includes("Aplicações de medicamento injetável") &&
        f.includes("Semaglutida") &&
        f.includes("coxa"),
    ),
  );
});

test("aviso de aplicação recente: semanal avisa até 2 dias depois, sem bloquear", () => {
  const list = [
    entry({ id: "antiga", date: shiftDate(today, -9) }),
    entry({ id: "recente", date: shiftDate(today, -2), time: "08:30" }),
  ];
  const warning = recentInjectionWarning(list, today, 4);
  assert.equal(warning?.entry.id, "recente");
  assert.equal(warning?.days, 2);
  assert.equal(warning?.sameDay, false);
  assert.equal(recentInjectionWarning(list, shiftDate(today, 1), 4), null);
  assert.equal(recentInjectionWarning([], today, 4), null);
});

test("aviso de aplicação recente: diária só avisa registro no mesmo dia", () => {
  const list = [entry({ id: "ontem", date: shiftDate(today, -1) })];
  assert.equal(recentInjectionWarning(list, today, 30), null);
  const same = recentInjectionWarning(
    [...list, entry({ id: "hoje", date: today, time: "07:10" })],
    today,
    30,
  );
  assert.equal(same?.entry.id, "hoje");
  assert.equal(same?.sameDay, true);
});

test("aviso de aplicação recente: sem frequência informada usa a semanal e ignora a data futura", () => {
  const list = [
    entry({ id: "futura", date: shiftDate(today, 3) }),
    entry({ id: "ontem", date: shiftDate(today, -1) }),
  ];
  assert.equal(recentInjectionWarning(list, today, null)?.entry.id, "ontem");
  assert.equal(recentInjectionWarning(list, today, undefined)?.days, 1);
});

test("texto do aviso de aplicação recente é factual e sem orientação clínica", () => {
  const e = entry({
    date: today,
    time: "07:10",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
  });
  assert.equal(
    recentInjectionText({ entry: e, days: 0, sameDay: true }),
    "Você já registrou Tirzepatida 2,50 mg hoje às 07:10.",
  );
  assert.equal(
    recentInjectionText({ entry: { ...e, date: shiftDate(today, -2) }, days: 2, sameDay: false }),
    "Você registrou Tirzepatida 2,50 mg há 2 dias.",
  );
});

/* Lote 5 (seringa e GLP-1): datas fixas para textos e contagens determinísticos. */
const T = "2026-09-24";
const PEN_NULLS = {
  concentrationMgPerMl: null,
  syringeUnits: null,
  units: null,
  volumeMl: null,
} as const;
const tirze = (id: string, days: number, over: Partial<InjectionEntry> = {}) =>
  entry({
    id,
    date: shiftDate(T, days),
    time: "08:30",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    ...over,
  });
const pen = (id: string, days: number, over: Partial<InjectionEntry> = {}) =>
  entry({
    id,
    date: shiftDate(T, days),
    method: "caneta",
    medication: "Mounjaro",
    ...PEN_NULLS,
    doseMg: 2.5,
    site: "abdomen",
    ...over,
  });
/** Objeto cru, como os registros salvos antes do modo caneta. */
function withoutMethod(e: InjectionEntry): Record<string, unknown> {
  const { method: _method, ...raw } = e;
  return raw;
}

test("esquema da caneta: só a dose em mg; frasco exige os 4 valores; sem método é frasco", () => {
  const penEntry = pen("p", 0);
  assert.equal(penEntry.method, "caneta");
  assert.ok(injectionSchema.safeParse(penEntry).success);
  assert.equal(injectionSchema.safeParse({ ...penEntry, units: 10 }).success, false);
  assert.equal(injectionSchema.safeParse({ ...entry(), units: null }).success, false);
  const legacy = injectionSchema.parse(withoutMethod(entry()));
  assert.equal(legacy.method, "frasco");
  assert.equal(legacy.units, 37);
});

test("estado e backup antigos sem método carregam como frasco", () => {
  const base = stateFixture();
  const legacy = {
    ...base,
    injections: [withoutMethod(entry({ userId: base.userId }))],
  };
  assert.equal(stateSchema.parse(legacy).injections[0].method, "frasco");
  assert.equal(parseBackup(JSON.stringify(legacy)).injections[0].method, "frasco");
});

test("linha do diário: frasco igual a antes, caneta mostra o método, objeto cru conta como frasco", () => {
  assert.equal(injectionDetail(entry()), "37 UI · 0,37 ml · Coxa");
  assert.equal(injectionDetail(pen("p", 0, { site: "coxa" })), "Caneta · Coxa");
  assert.equal(
    injectionDetail(pen("u", 0, { method: "dose_unica", site: "braco" })),
    "Dose única · Braço",
  );
  assert.equal(
    injectionDetail(withoutMethod(entry()) as unknown as InjectionEntry),
    "37 UI · 0,37 ml · Coxa",
  );
  assert.equal(isPenMethod(undefined), false);
  assert.equal(methodInfo("dose_unica").label, "Caneta de dose única");
});

test("intervalo estimado pela frequência e validade da receita; aviso recente segue 30/perMonth", () => {
  for (const [perMonth, days] of [
    [4, 7], [2, 14], [1, 30], [30, 1], [31, 1], [3, 9], [8, 4], [null, 7], [undefined, 7], [0, 7],
  ] as const)
    assert.equal(penIntervalDays(perMonth), days, String(perMonth));
  assert.equal(intervalLabel(7), "semanal");
  assert.equal(intervalLabel(14), "quinzenal");
  assert.equal(intervalLabel(30), "mensal");
  assert.equal(intervalLabel(1), "diária");
  assert.equal(intervalLabel(9), "a cada 9 dias");
  assert.equal(recipeFreshDays(4), 21);
  assert.equal(recipeFreshDays(1), 60);
  assert.equal(recipeFreshDays(30), 21);
  // Limiar atual do aviso: 3/mês avisa até 4 dias; 8/mês só no mesmo dia.
  const list = [tirze("a", 0)];
  assert.ok(recentInjectionWarning(list, shiftDate(T, 4), 3));
  assert.equal(recentInjectionWarning(list, shiftDate(T, 5), 3), null);
  assert.ok(recentInjectionWarning(list, T, 8));
  assert.equal(recentInjectionWarning(list, shiftDate(T, 1), 8), null);
});

test("dose digitada em mg aceita vírgula ou ponto e recusa valores inválidos", () => {
  assert.equal(parseDoseMg("2,5"), 2.5);
  assert.equal(parseDoseMg("2.50 mg"), 2.5);
  assert.equal(parseDoseMg(" 0,125 "), 0.125);
  assert.equal(parseDoseMg("1,2346"), 1.235);
  for (const text of ["0", "abc", "", "101", "1,2,3"])
    assert.equal(parseDoseMg(text), null, text);
});

test("dose em mg vira UI sem grampear: troca a seringa ou avisa que não cabe", () => {
  assert.deepEqual(applyDoseMg(0.5, 1.34, 30), { units: 37, syringe: 50, neededUnits: 37, fits: true });
  assert.deepEqual(applyDoseMg(5, 5, 30), { units: 100, syringe: 100, neededUnits: 100, fits: true });
  assert.deepEqual(applyDoseMg(6, 5, 30), { units: null, syringe: 100, neededUnits: 120, fits: false });
  assert.deepEqual(applyDoseMg(3, 1.34, 30), { units: null, syringe: 100, neededUnits: 224, fits: false });
  // Já cabe na seringa escolhida: ela é mantida.
  assert.equal(applyDoseMg(0.25, 5, 100).syringe, 100);
  assert.equal(
    doseOverflowText(3, 1.34, 224),
    "3,00 mg a 1,34 mg/ml precisaria de 224 UI, mais que a seringa de 100 UI. Confira a concentração do frasco.",
  );
});

test("±0,05 mg parte da dose real, nunca empaca e troca a seringa quando não cabe", () => {
  assert.equal(stepVialDose(37, 1.34, 50, 1).units, 41);
  assert.deepEqual(stepVialDose(25, 10, 30, 1), { units: 26, syringe: 30 });
  assert.equal(stepVialDose(2, 50, 30, 1).units, 3);
  assert.equal(stepVialDose(1, 1.34, 30, -1).units, 1);
  assert.deepEqual(stepVialDose(30, 1.34, 30, 1), { units: 34, syringe: 50 });
  assert.equal(stepVialDose(100, 5, 100, 1).units, 100);
});

test("dose de sempre: última aplicação, sequência igual, caneta sem seringa e validade", () => {
  assert.equal(lastRecipe([], T), null);
  assert.equal(lastRecipe([tirze("f", 2)], T), null);
  const three = [
    tirze("a", -16, { site: "braco" }),
    tirze("b", -9, { site: "coxa" }),
    tirze("c", -2, { site: "abdomen" }),
    tirze("futura", 3),
  ];
  const recipe = lastRecipe(three, T)!;
  assert.equal(recipe.repeats, 3);
  assert.equal(recipe.lastDate, shiftDate(T, -2));
  assert.equal(recipe.method, "frasco");
  assert.equal(recipe.medicationKey, "tirzepatida");
  assert.equal(recipe.doseMg, 2.5);
  assert.equal(recipe.units, 50);
  assert.equal(recipe.site, "coxa");
  assert.equal(recipeHeading(recipe), "Minha dose de sempre");
  assert.equal(recipeBadge(recipe, T), "igual a 22/09");
  const changed = lastRecipe(
    [tirze("a", -16), tirze("b", -9), tirze("c", -2, { units: 60, volumeMl: 0.6, doseMg: 3 })],
    T,
  )!;
  assert.equal(changed.repeats, 1);
  assert.equal(recipeHeading(changed), "Minha última dose");
  const penRecipe = lastRecipe([pen("a", -9, { doseMg: 5 }), pen("b", -2, { doseMg: 5.004 })], T)!;
  assert.equal(penRecipe.repeats, 2);
  assert.equal(penRecipe.medicationKey, "tirzepatida");
  assert.deepEqual(
    [penRecipe.concentrationMgPerMl, penRecipe.syringeUnits, penRecipe.units, penRecipe.volumeMl],
    [null, null, null, null],
  );
  assert.equal(recipeBadge(lastRecipe([tirze("x", -6)], T)!, T), "Aplicada há 6 dias");
  assert.equal(recipeBadge(lastRecipe([tirze("x", -1)], T)!, T), "Aplicada ontem");
  assert.equal(isRecipeFresh(lastRecipe([tirze("x", -21)], T)!, T, 4), true);
  assert.equal(isRecipeFresh(lastRecipe([tirze("x", -22)], T)!, T, 4), false);
});

test("receita do conceito 10: botão do dia, conferências e faixa das últimas aplicações", () => {
  assert.equal(recipeCta(true), "Registrar aplicação de hoje");
  assert.equal(recipeCta(false), "Registrar aplicação");
  assert.deepEqual(
    safetyItems({ method: "frasco", concentration: 5 }).map((i) => [i.key, i.title, i.sub]),
    [
      ["conc", "5 mg/ml", "confira o rótulo"],
      ["syringe", "100 UI = 1 ml", "seringa U-100"],
      ["needle", "Agulha nova", "e local novo"],
    ],
  );
  assert.deepEqual(
    safetyItems({ method: "caneta", concentration: null }).map((i) => i.key),
    ["pen", "needle"],
  );
  assert.equal(intervalPlural(7), "semanais");
  assert.equal(intervalPlural(10), "a cada 10 dias");
  assert.equal(shortSpotLabel("braco", "esquerdo"), "Braço esq.");
  assert.equal(shortSpotLabel("coxa", "direito"), "Coxa dir.");
  assert.equal(shortSpotLabel("abdomen", null), "Abdômen");

  const history = [
    tirze("a", -23, { site: "coxa", side: "direito" }),
    tirze("b", -16, { site: "braco", side: "esquerdo" }),
    tirze("c", -9, { site: "coxa", side: "esquerdo" }),
    tirze("d", -2, { site: "abdomen" }),
    tirze("futura", 3),
  ];
  const strip = recentSummary(history, T, 4);
  assert.deepEqual(
    strip.items.map((i) => [i.dateLabel, i.agoLabel, i.shortLabel]),
    [
      ["8 set", "há 16 dias", "Braço esq."],
      ["15 set", "há 9 dias", "Coxa esq."],
      ["22 set", "há 2 dias", "Abdômen"],
    ],
  );
  assert.equal(strip.subtitle, "Todas com 2,50 mg · semanais");
  assert.equal(recentSummary(history, T, null).subtitle, "Todas com 2,50 mg");
  const mixed = [tirze("a", -9), tirze("b", -2, { units: 60, volumeMl: 0.6, doseMg: 3 })];
  assert.equal(recentSummary(mixed, T, 4).subtitle, "2 aplicações");
  assert.equal(recentSummary([tirze("a", -2)], T, 4).subtitle, "1 aplicação");
  assert.deepEqual(recentSummary([], T, 4).items, []);
});

test("régua da bula: faixa ativa, marcador e nome acessível", () => {
  const start = doseRuler("semaglutida", 0.134)!;
  assert.equal(start.active, "inicial");
  assert.ok(Math.abs(start.markerPercent - 13.13) < 0.01, String(start.markerPercent));
  assert.deepEqual(
    start.bands.map((b) => [b.label, b.isHatched]),
    [["Inicial", false], ["Titulação", false], ["Manutenção", false], ["Acima", true]],
  );
  assert.equal(doseRuler("semaglutida", 0.5)!.active, "titulacao");
  assert.equal(doseRuler("semaglutida", 0.5)!.ariaLabel, "Faixa da bula: Titulação (0,50 mg)");
  assert.equal(doseRuler("semaglutida", 2.4)!.active, "manutencao");
  assert.equal(doseRuler("semaglutida", 3)!.active, "acima");
  assert.equal(doseRuler("tirzepatida", 16)!.active, "acima");
  assert.ok(Math.abs(doseRuler("tirzepatida", 30)!.markerPercent - 96.25) < 1e-9);
  assert.equal(doseRuler("personalizado", 3), null);
});

test("faixa acima da bula: texto curto com a maior dose e sem mudar o título", () => {
  const band = doseBand("semaglutida", 2.5);
  assert.equal(band.title, "Acima das doses habituais");
  assert.match(band.text, /2,40 mg/);
  assert.ok(band.text.split(/\s+/).length <= 16, band.text);
  assert.equal(
    doseBand("tirzepatida", 16).text,
    "Supera 15,00 mg, a maior dose de tirzepatida na bula. Confira o frasco e a prescrição.",
  );
});

test("rascunho do registro: frasco calcula dose e volume, caneta guarda só mg, erros com motivo", () => {
  const input: InjectionInput = {
    id: "d1",
    userId: "user",
    now: "2026-09-24T11:30:00.000Z",
    today: T,
    date: T,
    time: "08:30",
    method: "frasco",
    medication: "Semaglutida",
    units: 37,
    concentration: 1.34,
    syringe: 50,
    doseMg: null,
    site: "coxa",
    notes: "",
  };
  const vial = draftInjection(input);
  assert.ok(vial.ok);
  // 4 casas: a dose real de 37 UI a 1,34 mg/ml (0,4958 mg) aparece "0,50 mg".
  assert.equal(vial.entry.doseMg, 0.4958);
  assert.equal(fmtMg(vial.entry.doseMg), "0,50 mg");
  assert.equal(vial.entry.volumeMl, 0.37);
  assert.equal(vial.entry.method, "frasco");
  assert.equal(vial.entry.createdAt, input.now);
  const penDraft = draftInjection({ ...input, method: "caneta", medication: "Mounjaro", doseMg: 2.5 });
  assert.ok(penDraft.ok);
  assert.deepEqual(
    [penDraft.entry.concentrationMgPerMl, penDraft.entry.syringeUnits, penDraft.entry.units, penDraft.entry.volumeMl],
    [null, null, null, null],
  );
  assert.equal(penDraft.entry.doseMg, 2.5);
  const edited = draftInjection({ ...input, createdAt: "2026-09-20T08:00:00.000Z" });
  assert.ok(edited.ok);
  assert.equal(edited.entry.createdAt, "2026-09-20T08:00:00.000Z");
  assert.deepEqual(draftInjection({ ...input, units: null }), { ok: false, reason: "dose" });
  assert.deepEqual(
    draftInjection({ ...input, method: "caneta", doseMg: null }),
    { ok: false, reason: "dose" },
  );
  assert.deepEqual(draftInjection({ ...input, date: shiftDate(T, 1) }), { ok: false, reason: "future" });
  assert.deepEqual(draftInjection({ ...input, syringe: 30 }), { ok: false, reason: "invalid" });
});

test("aviso na folha: registro no mesmo dia escolhido que não é hoje vira 'nesse dia'", () => {
  const yesterday = tirze("ontem", -1);
  const recent = { entry: yesterday, days: 0, sameDay: true };
  assert.equal(
    recentInjectionText(recent, T),
    "Você já registrou Tirzepatida 2,50 mg nesse dia às 08:30.",
  );
  assert.equal(
    recentInjectionText(recent),
    "Você já registrou Tirzepatida 2,50 mg hoje às 08:30.",
  );
  assert.equal(
    recentInjectionText(recent, yesterday.date),
    "Você já registrou Tirzepatida 2,50 mg hoje às 08:30.",
  );
});

test("servidor: fato da última aplicação de caneta sem nulos e contexto compacto com o método", () => {
  const state = {
    ...stateFixture(),
    injections: [
      entry({ id: "frasco", date: shiftDate(today, -9) }),
      entry({
        id: "caneta",
        date: shiftDate(today, -2),
        method: "caneta",
        medication: "Mounjaro",
        ...PEN_NULLS,
        doseMg: 2.5,
        site: "abdomen",
      }),
    ],
  };
  const context = agentContext(state);
  const fact = deriveFacts(context, extractFlags(context)).find((f) =>
    f.includes("Aplicações de medicamento injetável"),
  );
  assert.ok(fact);
  assert.ok(fact.includes("Mounjaro"));
  assert.ok(fact.includes("2.5 mg"));
  assert.ok(fact.includes("abdomen"));
  assert.doesNotMatch(fact, /null|undefined/);
  const rows = compactContext(context).injections as Record<string, unknown>[];
  assert.equal(rows.at(-1)?.method, "caneta");
});

test("domain reexporta as datas do módulo folha", () => {
  assert.equal(domain.shiftDate, dates.shiftDate);
  assert.equal(domain.localDate, dates.localDate);
  assert.equal(domain.localTime, dates.localTime);
});
