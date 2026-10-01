import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diarySchema,
  injectionSchema,
  SATIETY_KEYS,
  SYMPTOM_KEYS,
  type AppState,
  type DiaryEntry,
  type InjectionEntry,
  type Profile,
  type Symptom,
} from "../src/types";
import {
  asksSatiety,
  CYCLE_GRID_WINDOW,
  cycleDayOf,
  cycleDayPhrase,
  cycleGrid,
  hasStrong,
  INTENSITY_LABELS,
  SATIETY_COPY,
  SATIETY_LABELS,
  satietyOptions,
  setIntensity,
  setMealSatiety,
  showsCycleGrid,
  STRONG_NOTICE,
  SYMPTOM_LABELS,
  symptomText,
  toggleSymptom,
  visibleTags,
} from "../src/lib/symptoms";
import { shiftDate } from "../src/lib/dates";
import { WELLBEING_TAGS } from "../src/lib/wellbeing";
import { profileFixture, stateFixture } from "./fixtures";

const T = "2026-09-28";
const food = {
  id: "rice",
  name: "Arroz cozido",
  category: "Cereais",
  caloriesPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  source: "Tabela de teste",
};
const wellbeingBase = {
  id: "b1",
  userId: "u",
  date: T,
  time: "09:00",
  createdAt: "x",
  updatedAt: "x",
  type: "bem_estar" as const,
  title: "Bem-estar",
  description: "",
  rating: 4,
};
const mealBase = {
  id: "m1",
  userId: "u",
  date: T,
  time: "12:00",
  createdAt: "x",
  updatedAt: "x",
  type: "refeicao" as const,
  title: "Almoço",
  description: "Arroz cozido (100 g)",
  items: [{ food, grams: 100 }],
};
const wellbeing = (date: string, symptoms: Symptom[], time = "09:00"): DiaryEntry => ({
  ...wellbeingBase,
  id: `b-${date}-${time}`,
  date,
  time,
  symptoms,
});
const meal = (id: string, date: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  ...mealBase,
  id,
  date,
  ...over,
});
let seq = 0;
/** Tirzepatida na caneta com seletor: o degrau de dose depende só do medicamento e da dose em mg. */
function app(date: string, doseMg: number): InjectionEntry {
  seq += 1;
  return injectionSchema.parse({
    id: `inj-${seq}`,
    userId: "u",
    date,
    time: "08:00",
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    method: "caneta",
    medication: "Tirzepatida",
    doseMg,
    site: "abdomen",
  });
}
const penProfile = (over: Partial<Profile> = {}): Profile => ({
  ...profileFixture(),
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
  ...over,
});
const s = (key: Symptom["key"], intensity: number): Symptom => ({ key, intensity });

/** Cenário da grade: aplicações semanais 2,5 mg → 5 mg e efeitos registrados em várias fases. */
const APPS = [app("2026-09-07", 2.5), app("2026-09-14", 2.5), app("2026-09-21", 5), app("2026-09-28", 5)];
const DIARY: DiaryEntry[] = [
  wellbeing("2026-09-05", [s("nausea", 1)]),
  wellbeing("2026-09-08", [s("nausea", 2)]),
  wellbeing("2026-09-15", [s("nausea", 1)]),
  wellbeing("2026-09-16", [s("nausea", 3)]),
  wellbeing("2026-09-22", [s("nausea", 2), s("cansaco", 1)]),
  wellbeing("2026-09-25", [s("intestino_preso", 1)]),
  wellbeing("2026-08-02", [s("nausea", 1)]),
  // Sem efeitos: não conta como registro da grade.
  { ...wellbeingBase, id: "b-sem-efeito", date: "2026-09-23" },
];

test("esquema: efeitos só no bem-estar e 'Como ficou?' só na refeição; listas inválidas viram undefined", () => {
  const kept = diarySchema.parse({ ...wellbeingBase, symptoms: [s("nausea", 3), s("cansaco", 1)] });
  assert.deepEqual(kept.symptoms, [s("nausea", 3), s("cansaco", 1)]);
  const seven = SYMPTOM_KEYS.slice(0, 7).map((key) => s(key, 1));
  for (const invalid of [[], seven, [s("nausea", 1), s("nausea", 2)], [s("nausea", 4)]]) {
    const parsed = diarySchema.safeParse({ ...wellbeingBase, symptoms: invalid });
    assert.ok(parsed.success, JSON.stringify(invalid));
    assert.equal(parsed.data.symptoms, undefined);
  }
  assert.equal(diarySchema.safeParse({ ...mealBase, symptoms: [s("nausea", 1)] }).success, false);
  assert.equal(diarySchema.parse({ ...mealBase, satiety: "na_medida" }).satiety, "na_medida");
  assert.equal(diarySchema.safeParse({ ...wellbeingBase, satiety: "na_medida" }).success, false);
  const unknown = diarySchema.safeParse({ ...mealBase, satiety: "x" });
  assert.ok(unknown.success);
  assert.equal(unknown.data.satiety, undefined);
});

test("toggleSymptom liga com intensidade 1, desliga e não passa de 6; sempre um array novo", () => {
  assert.deepEqual(toggleSymptom([], "nausea"), [s("nausea", 1)]);
  assert.deepEqual(toggleSymptom([s("nausea", 1)], "nausea"), []);
  const six = SYMPTOM_KEYS.slice(0, 6).map((key) => s(key, 2));
  const full = toggleSymptom(six, "reacao_local");
  assert.deepEqual(full, six);
  assert.notEqual(full, six);
});

test("setIntensity troca só a do efeito pedido, sem alterar a lista recebida; hasStrong vê a forte", () => {
  const list = [s("nausea", 1)];
  const next = setIntensity(list, "nausea", 3);
  assert.deepEqual(next, [s("nausea", 3)]);
  assert.deepEqual(list, [s("nausea", 1)]);
  assert.equal(hasStrong(next), true);
  assert.equal(hasStrong(list), false);
  assert.deepEqual(setIntensity(list, "azia", 2), list, "efeito desligado fica como está");
});

test("symptomText: rótulo e intensidade em palavras", () => {
  assert.equal(symptomText(s("cansaco", 2)), "Cansaço, intensidade moderada");
  assert.equal(symptomText(s("azia", 3)), "Azia ou refluxo, intensidade forte");
  assert.equal(symptomText(s("tontura", 1)), "Tontura, intensidade leve");
});

test("visibleTags: sem os marcadores repetidos quando os efeitos aparecem, exceto os já marcados", () => {
  assert.deepEqual(visibleTags(false, []), [...WELLBEING_TAGS]);
  assert.deepEqual(visibleTags(true, []), ["Disposição", "Calma", "Estresse", "Ansiedade", "Fome", "Saciedade"]);
  assert.deepEqual(visibleTags(true, ["Náusea"]), [
    "Disposição",
    "Calma",
    "Estresse",
    "Ansiedade",
    "Fome",
    "Saciedade",
    "Náusea",
  ]);
});

test("satietyOptions: conjunto reduzido para transtorno alimentar (inclui sem resposta) e menores", () => {
  const adult = { eatingDisorder: "nao" as const, birthDate: "1992-06-15" };
  assert.deepEqual(satietyOptions(adult, T), [...SATIETY_KEYS]);
  const reduced = ["ainda_fome", "na_medida", "desconforto"];
  assert.deepEqual(satietyOptions({ ...adult, eatingDisorder: "sim" }, T), reduced);
  assert.deepEqual(satietyOptions({ ...adult, eatingDisorder: "nao_informado" }, T), reduced);
  assert.deepEqual(satietyOptions({ ...adult, birthDate: "2010-05-01" }, T), reduced);
  assert.deepEqual(satietyOptions({ ...adult, birthDate: "" }, T), reduced, "data inválida conta como menor");
  // Gestação sozinha mantém o conjunto completo.
  const pregnant: Pick<Profile, "eatingDisorder" | "birthDate" | "pregnancy"> = { ...adult, pregnancy: "gestacao" };
  assert.deepEqual(satietyOptions(pregnant, T), [...SATIETY_KEYS]);
  assert.equal(SATIETY_LABELS.pouca_fome, "Pouca fome");
  assert.equal(SATIETY_LABELS.rapida, "Saciou rápido");
});

test("asksSatiety: só refeição de hoje ou ontem ainda sem resposta", () => {
  assert.equal(asksSatiety(meal("a", T), T), true);
  assert.equal(asksSatiety(meal("b", shiftDate(T, -1)), T), true);
  assert.equal(asksSatiety(meal("c", shiftDate(T, -2)), T), false);
  assert.equal(asksSatiety(meal("d", shiftDate(T, 1)), T), false);
  assert.equal(asksSatiety(meal("e", T, { satiety: "na_medida" }), T), false);
  assert.equal(asksSatiety(wellbeing(T, []), T), false);
});

test("setMealSatiety grava a resposta na refeição, remove com null e ignora o que não é refeição", () => {
  const now = "2026-09-28T13:00:00.000Z";
  const other = wellbeing(T, [s("nausea", 1)]);
  const state: AppState = { ...stateFixture(), diary: [meal("m1", T), other] };
  const answered = setMealSatiety(state, "m1", "na_medida", now);
  assert.notEqual(answered, state);
  assert.equal(answered.diary[0].satiety, "na_medida");
  assert.equal(answered.diary[0].updatedAt, now);
  assert.equal(answered.diary[1], other, "os outros registros ficam com a mesma referência");
  assert.equal(state.diary[0].satiety, undefined, "o estado recebido não muda");
  const cleared = setMealSatiety(answered, "m1", null, now);
  assert.equal("satiety" in cleared.diary[0], false);
  assert.equal(setMealSatiety(state, other.id, "na_medida", now), state);
  assert.equal(setMealSatiety(state, "nao-existe", "na_medida", now), state);
});

test("cycleDayOf: a última aplicação até a data do registro, entre as de data até hoje", () => {
  const day = cycleDayOf(APPS, "2026-09-16", T);
  assert.equal(day?.day, 2);
  assert.equal(day?.app.date, "2026-09-14");
  assert.equal(cycleDayOf(APPS, "2026-09-05", T), null);
  assert.equal(cycleDayOf([app("2026-09-29", 5)], "2026-09-29", T), null, "aplicação futura não governa");
  assert.equal(cycleDayPhrase(0), "no dia da aplicação");
  assert.equal(cycleDayPhrase(1), "1 dia depois");
  assert.equal(cycleDayPhrase(4), "4 dias depois");
});

test("cycleGrid: efeitos por dia desde a aplicação, fora dos dias 0 a 6 e degraus de dose", () => {
  const grid = cycleGrid(DIARY, APPS, T);
  assert.deepEqual(grid.rows.map((r) => r.key), ["nausea", "intestino_preso", "cansaco"]);
  const nausea = grid.rows[0];
  assert.equal(nausea.label, "Náusea");
  assert.equal(nausea.cells.length, 7);
  assert.deepEqual(nausea.cells[1], {
    day: 1,
    count: 3,
    level: 3,
    maxIntensity: 2,
    aria: "Náusea, 1 dia depois: 3 dias",
  });
  assert.deepEqual(nausea.cells[2], {
    day: 2,
    count: 1,
    level: 1,
    maxIntensity: 3,
    aria: "Náusea, 2 dias depois: 1 dia, com registro forte",
  });
  assert.equal(nausea.cells[0].aria, "Náusea, no dia da aplicação: nenhum registro");
  assert.equal(nausea.cells[0].level, 0);
  assert.equal(nausea.total, 4);
  assert.equal(grid.rows[1].cells[4].count, 1);
  assert.equal(grid.records, 6);
  assert.equal(grid.outside, 1);
  assert.equal(grid.caption, "Últimas 8 semanas: 6 registros com efeitos, 1 fora dos dias 0 a 6.");
  assert.deepEqual(grid.steps, [
    { key: "tirzepatida:100", label: "5,00 mg" },
    { key: "tirzepatida:50", label: "2,50 mg" },
  ]);
  assert.equal(grid.isEmpty, false);
});

test("cycleGrid: filtro por degrau, borda da janela de 8 semanas, datas futuras e grade vazia", () => {
  const step = cycleGrid(DIARY, APPS, T, "tirzepatida:100");
  assert.deepEqual(
    step.rows.map((r) => [r.key, r.cells.filter((c) => c.count).map((c) => `D${c.day}:${c.count}`)]),
    [
      ["nausea", ["D1:1"]],
      ["intestino_preso", ["D4:1"]],
      ["cansaco", ["D1:1"]],
    ],
  );
  assert.equal(step.records, 2);
  assert.equal(step.outside, 0);
  assert.equal(step.caption, "Últimas 8 semanas, dose 5,00 mg: 2 registros com efeitos.");
  assert.deepEqual(step.steps, cycleGrid(DIARY, APPS, T).steps, "os degraus não dependem do filtro");
  assert.equal(cycleGrid(DIARY, APPS, T, "semaglutida:5").records, 6, "degrau desconhecido vale como todas as doses");

  assert.equal(shiftDate(T, -(CYCLE_GRID_WINDOW - 1)), "2026-08-04");
  const edge = cycleGrid([...DIARY, wellbeing("2026-08-04", [s("tontura", 1)])], APPS, T);
  assert.equal(edge.records, 7);
  assert.equal(edge.outside, 2);
  const before = cycleGrid([...DIARY, wellbeing("2026-08-03", [s("tontura", 1)])], APPS, T);
  assert.deepEqual(before, cycleGrid(DIARY, APPS, T));
  const future = cycleGrid(
    [...DIARY, wellbeing("2026-09-29", [s("vomito", 3)])],
    [...APPS, app("2026-09-29", 7.5)],
    T,
  );
  assert.deepEqual(future, cycleGrid(DIARY, APPS, T));
  // Dois registros no mesmo dia contam um dia só.
  const sameDay = cycleGrid(
    [wellbeing("2026-09-22", [s("nausea", 1)], "08:00"), wellbeing("2026-09-22", [s("nausea", 3)], "20:00")],
    APPS,
    T,
  );
  const d1 = sameDay.rows[0].cells[1];
  assert.deepEqual([d1.count, d1.maxIntensity, sameDay.records], [1, 3, 2]);
  const empty = cycleGrid([], APPS, T);
  assert.equal(empty.isEmpty, true);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.caption, "Últimas 8 semanas: 0 registros com efeitos.");
  // Só registros fora dos dias 0 a 6: nenhuma linha para desenhar.
  assert.equal(cycleGrid([wellbeing("2026-09-05", [s("nausea", 1)])], APPS, T).isEmpty, true);
});

test("showsCycleGrid: caneta semanal com aplicação nas 8 semanas; nunca em gestação ou sem resposta", () => {
  assert.equal(showsCycleGrid(penProfile(), APPS, T), true);
  for (const pregnancy of ["gestacao", "amamentacao", "nao_informado"] as const)
    assert.equal(showsCycleGrid(penProfile({ pregnancy }), APPS, T), false, pregnancy);
  assert.equal(showsCycleGrid(penProfile({ weightLossPen: "nao" }), APPS, T), false);
  assert.equal(showsCycleGrid(penProfile({ weightLossPenPerMonth: 30 }), APPS, T), false);
  assert.equal(showsCycleGrid(penProfile({ weightLossPenPerMonth: null }), APPS, T), false);
  assert.equal(showsCycleGrid(penProfile(), [app(shiftDate(T, -56), 5)], T), false);
  assert.equal(showsCycleGrid(penProfile(), [app(shiftDate(T, -55), 5)], T), true);
  assert.equal(showsCycleGrid(penProfile(), [app(shiftDate(T, 1), 5)], T), false, "só aplicação futura");
});

test("textos de efeitos, respostas e grade: sem dose, mg, conselho ou diagnóstico", () => {
  const FORBIDDEN = /dose|\bmg\b|aument|reduz|suspend|pare de|troque|diagn/i;
  const grid = cycleGrid(DIARY, APPS, T);
  const texts = [
    STRONG_NOTICE.title,
    STRONG_NOTICE.text,
    ...Object.values(SYMPTOM_LABELS),
    ...INTENSITY_LABELS,
    ...Object.values(SATIETY_LABELS),
    ...SYMPTOM_KEYS.flatMap((key) => [1, 2, 3].map((n) => symptomText(s(key, n)))),
    grid.caption,
    cycleGrid([], APPS, T).caption,
    ...grid.rows.flatMap((r) => [r.label, ...r.cells.map((c) => c.aria)]),
  ];
  for (const text of texts) assert.doesNotMatch(text, FORBIDDEN, text);
  // A legenda filtrada nomeia o degrau que a pessoa escolheu ("dose 5,00 mg"): é o filtro, sem comparação.
  assert.doesNotMatch(cycleGrid(DIARY, APPS, T, "tirzepatida:100").caption, /aument|reduz|piora|melhora/i);
});

test("SATIETY_COPY: mesmos textos no web e no app (chip, nomes acessíveis e avisos)", () => {
  const meal = "Almoço das 12:00";
  assert.equal(SATIETY_COPY.title, "Como ficou?");
  assert.equal(SATIETY_COPY.chip("na_medida"), "Como ficou: Na medida");
  assert.equal(SATIETY_COPY.askLabel(meal), "Como ficou? Almoço das 12:00");
  assert.equal(SATIETY_COPY.chipLabel("na_medida", meal), "Como ficou: Na medida. Alterar, Almoço das 12:00");
  assert.ok(SATIETY_COPY.chipLabel("desconforto", meal).startsWith(SATIETY_COPY.chip("desconforto")));
  assert.equal(SATIETY_COPY.saved("ainda_fome"), "Anotado: Ainda com fome.");
  assert.equal(SATIETY_COPY.removed, "Resposta removida.");
  assert.equal(SATIETY_COPY.undone, "Resposta desfeita.");
});
