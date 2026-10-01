import { test } from "node:test";
import assert from "node:assert/strict";
import foods from "../src/data/foods.json";
import {
  addToLabel,
  balanceEquation,
  dayPeriod,
  groupDiaryDay,
  latestWeight,
  macroShare,
  mealCategoryOf,
  MOOD_EMOJI,
  moodEmoji,
  mealSummary,
  pendingMealSlot,
  presenceFraction,
  presenceLabel,
  quickWeight,
  searchDiary,
  STANDARD_MEALS,
  stepWeight,
  waterGlasses,
  waterLiters,
  waterSpoken,
  waterTimes,
  weekPresence,
  wellbeingTitle,
} from "../src/lib/diary-day";
import { localDate, mealTotals, shiftDate } from "../src/lib/domain";
import type { DiaryEntry, FoodItem, HabitItem, InjectionEntry, MealItem } from "../src/types";
import { stateFixture } from "./fixtures";

const taco = foods as FoodItem[];
const food = (name: string) => {
  const found = taco.find((f) => f.name === name);
  assert.ok(found, name);
  return found;
};
const DAY = "2026-09-20";
const item = (name: string, grams: number): MealItem => ({ food: food(name), grams });

let seq = 0;
function meal(time: string, tag: string | undefined, items: MealItem[], date = DAY, title = tag ?? "Refeição"): DiaryEntry {
  seq++;
  return {
    id: `m${seq}`,
    userId: "u",
    date,
    time,
    createdAt: `${date}T${time}:0${seq % 10}Z`,
    updatedAt: "x",
    type: "refeicao",
    title,
    categoryTag: tag,
    description: items.map((i) => i.food.name).join(", "),
    items,
    ...mealTotals(items),
  };
}
const water = (time: string, amountMl: number, date = DAY): DiaryEntry => ({
  id: `w-${date}-${time}`,
  userId: "u",
  date,
  time,
  createdAt: "x",
  updatedAt: "x",
  type: "agua",
  title: "Água",
  description: "",
  amountMl,
});
const mood = (time: string, rating: number, date = DAY): DiaryEntry => ({
  id: `b-${date}-${time}`,
  userId: "u",
  date,
  time,
  createdAt: "x",
  updatedAt: "x",
  type: "bem_estar",
  title: "Bem-estar",
  description: "",
  rating,
  sleepHours: 7.5,
});
const injection = (date: string): InjectionEntry => ({
  id: `i-${date}`,
  userId: "u",
  method: "frasco",
  date,
  time: "09:00",
  createdAt: "x",
  updatedAt: "x",
  medication: "Semaglutida",
  concentrationMgPerMl: 1.34,
  syringeUnits: 50,
  units: 38,
  volumeMl: 0.38,
  doseMg: 0.5092,
  site: "coxa",
  side: null,
  notes: "",
});

const rice = item("Arroz, integral, cozido", 150);
const beans = item("Feijão, carioca, cozido", 100);
const chicken = item("Frango, peito, sem pele, grelhado", 120);
const lettuce = item("Alface, crespa, crua", 30);

test("mealCategoryOf usa a categoria informada, sem acento, e o horário na falta dela", () => {
  const at = (time: string, tag?: string, title = "Pão com ovo") => mealCategoryOf({ time, categoryTag: tag, title });
  assert.equal(at("12:00", "Almoço"), "Almoço");
  assert.equal(at("12:00", "almoco"), "Almoço");
  assert.equal(at("08:00", "Cafe"), "Café da manhã");
  assert.equal(at("23:00", "Ceia"), "Ceia");
  assert.equal(at("17:00", "Pré-treino"), "Pré-treino");
  assert.equal(at("08:10"), "Café da manhã");
  assert.equal(at("13:00"), "Almoço");
  assert.equal(at("16:00"), "Lanche");
  assert.equal(at("20:00"), "Jantar");
  // Registros antigos sem categoria, mas com o título da refeição.
  assert.equal(at("20:00", undefined, "Jantar"), "Jantar");
});

test("groupDiaryDay agrupa as refeições em ordem: subtotal em todo grupo, kcal na linha só com 2 registros", () => {
  const lunchLate = meal("12:30", "Almoço", [beans]);
  const lunch = meal("12:00", "Almoço", [rice]);
  const breakfast = meal("08:10", "Café da manhã", [item("Pão, trigo, francês", 50)]);
  const snack = meal("10:00", "Lanche", [item("Banana, prata, crua", 80)]);
  const preWorkout = meal("17:00", "Pré-treino", [item("Banana, prata, crua", 40)]);
  const otherDay = meal("20:00", "Jantar", [rice], shiftDate(DAY, -1));
  const day = groupDiaryDay({
    diary: [lunchLate, water("10:00", 250), lunch, preWorkout, breakfast, mood("09:00", 4), otherDay, snack, water("08:00", 100)],
    injections: [injection(DAY), injection(shiftDate(DAY, -1))],
    date: DAY,
  });
  assert.deepEqual(
    day.meals.map((g) => g.category),
    ["Café da manhã", "Lanche", "Almoço", "Pré-treino"],
  );
  const almoco = day.meals.find((g) => g.category === "Almoço")!;
  assert.deepEqual(almoco.entries.map((e) => e.id), [lunch.id, lunchLate.id]);
  assert.equal(almoco.showSubtotal, true);
  assert.equal(almoco.showRowKcal, true);
  assert.equal(almoco.calories, (lunch.calories ?? 0) + (lunchLate.calories ?? 0));
  assert.equal(almoco.tone, "emerald");
  // Um registro só: o subtotal do grupo já é o número dele, a linha fica sem kcal.
  assert.equal(day.meals[0].showSubtotal, true);
  assert.equal(day.meals[0].showRowKcal, false);
  assert.deepEqual(day.pending, ["Jantar"]);
  assert.equal(day.water.totalMl, 350);
  assert.deepEqual(day.water.entries.map((e) => e.time), ["08:00", "10:00"]);
  assert.equal(day.wellbeing.length, 1);
  assert.equal(day.injections.length, 1);
  assert.equal(day.count, 9);
  assert.equal(day.isEmpty, false);
});

test("dia vazio: nenhum grupo, as quatro refeições pendentes e água zerada", () => {
  const day = groupDiaryDay({ diary: [water("10:00", 250, shiftDate(DAY, 1))], injections: [], date: DAY });
  assert.deepEqual(day.meals, []);
  assert.deepEqual(day.pending, [...STANDARD_MEALS]);
  assert.deepEqual(day.water, { totalMl: 0, entries: [] });
  assert.equal(day.isEmpty, true);
  assert.equal(day.count, 0);
});

test("mealSummary mostra dois alimentos pelo nome amigável e quantos faltam", () => {
  const entry = meal("12:00", "Almoço", [rice, beans, chicken, lettuce]);
  assert.deepEqual(mealSummary(entry), {
    chips: ["Arroz integral", "Feijão carioca"],
    more: 2,
    text: "Arroz integral · Feijão carioca +2",
    sentence: "Arroz integral, feijão carioca, peito de frango sem pele…",
  });
  // O mesmo alimento em dois preparos aparece uma vez.
  const twice = meal("12:00", "Almoço", [rice, item("Arroz, integral, cru", 20)]);
  assert.deepEqual(mealSummary(twice).chips, ["Arroz integral"]);
  assert.equal(mealSummary(twice).text, "Arroz integral");
  // Registros sem itens (antigos ou do agente) usam a descrição.
  const legacy = { ...entry, items: undefined, description: "Pão com manteiga e café com leite" };
  assert.deepEqual(mealSummary(legacy), {
    chips: [],
    more: 0,
    text: "Pão com manteiga e café com leite",
    sentence: "Pão com manteiga e café com leite",
  });
});

test("mealSummary.sentence: até 3 alimentos em frase, o 1º com maiúscula e \"e\" antes do último", () => {
  assert.equal(mealSummary(meal("12:00", "Almoço", [rice])).sentence, "Arroz integral");
  assert.equal(mealSummary(meal("12:00", "Almoço", [rice, beans])).sentence, "Arroz integral e feijão carioca");
  assert.equal(
    mealSummary(meal("12:00", "Almoço", [rice, beans, lettuce])).sentence,
    "Arroz integral, feijão carioca e alface crespa",
  );
});

test("presenceFraction: arco do anel da semana = presenças / 3", () => {
  assert.equal(presenceFraction({ water: false, meal: false, habit: false }), 0);
  assert.equal(presenceFraction({ water: true, meal: false, habit: false }), 1 / 3);
  assert.equal(presenceFraction({ water: true, meal: true, habit: true }), 1);
});

test("macroShare divide a energia entre proteína, carboidratos e gorduras somando 100", () => {
  assert.deepEqual(macroShare({ protein: 30, carbs: 50, fat: 20 }), { protein: 24, carbs: 40, fat: 36 });
  const even = macroShare({ protein: 1, carbs: 1, fat: 1 })!;
  assert.equal(even.protein + even.carbs + even.fat, 100);
  assert.equal(macroShare({ protein: 0, carbs: 0, fat: 0 }), null);
  assert.equal(macroShare(undefined), null);
});

test("pendingMealSlot sugere uma só refeição principal ainda não registrada", () => {
  const times = { breakfastTime: "08:00", lunchTime: "12:00", dinnerTime: "19:30" };
  const logged = (...tags: string[]) => tags.map((tag) => meal("08:00", tag, [rice]));
  assert.deepEqual(pendingMealSlot([], times, "07:00"), { category: "Café da manhã", time: "08:00" });
  assert.deepEqual(pendingMealSlot([], times, "09:00"), { category: "Café da manhã", time: "08:00" });
  assert.deepEqual(pendingMealSlot(logged("Café da manhã"), times, "09:00"), { category: "Almoço", time: "12:00" });
  // Café já passou da janela: a sugestão pula para o almoço.
  assert.deepEqual(pendingMealSlot([], times, "10:00"), { category: "Almoço", time: "12:00" });
  // O jantar fica disponível até o fim do dia.
  assert.deepEqual(pendingMealSlot(logged("Almoço"), times, "22:30"), { category: "Jantar", time: "19:30" });
  assert.equal(pendingMealSlot(logged("Jantar"), times, "21:30"), null);
});

test("searchDiary procura em todo o histórico, sem acento, e agrupa por data", () => {
  const older = shiftDate(DAY, -3);
  const diary = [
    meal("20:00", "Jantar", [chicken, rice], older),
    meal("12:00", "Almoço", [rice, beans]),
    water("10:00", 350, older),
    mood("09:00", 4),
  ];
  const beansHit = searchDiary(diary, [], "feijao");
  assert.equal(beansHit.length, 1);
  assert.equal(beansHit[0].date, DAY);
  assert.deepEqual(
    beansHit[0].hits.map((h) => [h.kind, h.title, h.detail]),
    [["diary", "Almoço", "Arroz integral · Feijão carioca"]],
  );
  // Mais recente primeiro.
  assert.deepEqual(searchDiary(diary, [], "arroz").map((g) => g.date), [DAY, older]);
  // Todas as palavras precisam aparecer no mesmo registro.
  assert.deepEqual(searchDiary(diary, [], "frango arroz").map((g) => g.date), [older]);
  const waterHit = searchDiary(diary, [], "Água");
  assert.deepEqual(waterHit.map((g) => g.date), [older]);
  assert.equal(waterHit[0].hits[0].detail, "350 ml");
  assert.deepEqual(searchDiary(diary, [injection(older)], "a"), [], "uma letra só não busca");
  const injectionHit = searchDiary(diary, [injection(older)], "sema coxa");
  assert.deepEqual(injectionHit[0].hits.map((h) => [h.kind, h.title]), [["injecao", "Semaglutida 0,51 mg"]]);
});

test("weekPresence marca água, refeição e combinado por dia, sem sequência", () => {
  const habit: HabitItem = {
    id: "h",
    title: "Caminhar",
    timeOfDay: "07:00",
    createdDate: shiftDate(DAY, -10),
    completedDates: [DAY],
  };
  const presence = weekPresence(
    [meal("12:00", "Almoço", [rice]), water("10:00", 200, shiftDate(DAY, -1))],
    [habit],
    [shiftDate(DAY, -1), DAY, shiftDate(DAY, 1)],
  );
  assert.deepEqual(presence, [
    { date: shiftDate(DAY, -1), water: true, meal: false, habit: false },
    { date: DAY, water: false, meal: true, habit: true },
    { date: shiftDate(DAY, 1), water: false, meal: false, habit: false },
  ]);
  assert.equal(presenceLabel(presence[1]), "refeição e combinado");
  assert.equal(presenceLabel({ water: true, meal: true, habit: true }), "água, refeição e combinado");
  assert.equal(presenceLabel({ water: false, meal: false, habit: false }), "");
});

test("balanceEquation: meta menos consumido; acima da meta sem número negativo", () => {
  assert.deepEqual(balanceEquation(1210, 1645), { goal: 1645, consumed: 1210, result: 435, over: false });
  assert.deepEqual(balanceEquation(1800, 1645), { goal: 1645, consumed: 1800, result: 155, over: true });
  assert.deepEqual(balanceEquation(1645, 1645), { goal: 1645, consumed: 1645, result: 0, over: false });
  assert.equal(balanceEquation(500, null), null);
});

test("peso rápido: passo de 0,1 kg sem erro de ponto flutuante e dentro dos limites", () => {
  assert.equal(stepWeight(72, 0.1), 72.1);
  assert.equal(stepWeight(72.1, 0.1), 72.2);
  assert.equal(stepWeight(72.3, -0.1), 72.2);
  assert.equal(stepWeight(20, -0.1), 20);
  assert.equal(stepWeight(350, 0.1), 350);
});

test("quickWeight troca só o peso da medição do dia ou cria uma com a altura mais recente", () => {
  const state = stateFixture();
  const today = localDate();
  assert.equal(latestWeight(state), 72);
  const same = quickWeight(state, { id: "novo", date: today, weight: 71.8, today });
  assert.ok(same.success);
  assert.equal(same.state.measurements.length, 1);
  assert.equal(same.state.measurements[0].weight, 71.8);
  assert.equal(same.state.measurements[0].method, state.measurements[0].method);
  assert.equal(same.state.profile?.weight, 71.8);
  assert.equal(latestWeight(same.state), 71.8);
  const yesterday = shiftDate(today, -1);
  const past = quickWeight(state, { id: "ontem", date: yesterday, weight: 72.4, today });
  assert.ok(past.success);
  const created = past.state.measurements.find((m) => m.date === yesterday)!;
  assert.deepEqual(
    { id: created.id, height: created.height, method: created.method },
    { id: "ontem", height: 165, method: "Registro rápido" },
  );
  // A medição de hoje continua sendo a mais recente para o perfil.
  assert.equal(past.state.profile?.weight, 72);
  assert.deepEqual(quickWeight(state, { id: "x", date: today, weight: 10, today }), { success: false, reason: "weight" });
  assert.deepEqual(quickWeight(state, { id: "x", date: shiftDate(today, 1), weight: 70, today }), {
    success: false,
    reason: "future",
  });
});

test("rótulos: adicionar à refeição, período do dia", () => {
  assert.equal(addToLabel("Almoço"), "Adicionar ao almoço");
  assert.equal(addToLabel("Café da manhã"), "Adicionar ao café da manhã");
  assert.equal(addToLabel("Ceia"), "Adicionar à ceia");
  assert.equal(addToLabel("Pré-treino"), "Adicionar em Pré-treino");
  assert.deepEqual(dayPeriod("06:30"), { key: "manha", greeting: "Bom dia" });
  assert.deepEqual(dayPeriod("12:00"), { key: "tarde", greeting: "Boa tarde" });
  assert.deepEqual(dayPeriod("18:00"), { key: "noite", greeting: "Boa noite" });
  assert.deepEqual(dayPeriod("03:00"), { key: "noite", greeting: "Boa noite" });
});

test("busca do diário: efeitos percebidos antes dos marcadores; sem efeitos, o detalhe não muda (SERINGA-07)", () => {
  const withSymptoms: DiaryEntry = { ...mood("09:00", 4), symptoms: [{ key: "nausea", intensity: 3 }], tags: ["Calma"] };
  const found = searchDiary([withSymptoms], [], "nausea");
  assert.equal(found.length, 1);
  assert.equal(found[0].hits[0].detail, "Como me sinto: 4/5 · Náusea, intensidade forte · Calma");
  const onlySymptom: DiaryEntry = { ...mood("10:00", 3), symptoms: [{ key: "cansaco", intensity: 1 }] };
  assert.equal(searchDiary([onlySymptom], [], "cansaco")[0].hits[0].detail, "Como me sinto: 3/5 · Cansaço, intensidade leve");
  const plain: DiaryEntry = { ...mood("11:00", 4), tags: ["Calma", "Disposição"] };
  assert.equal(searchDiary([plain], [], "calma")[0].hits[0].detail, "Como me sinto: 4/5 · Calma, Disposição");
  assert.equal(searchDiary([mood("12:00", 5)], [], "bem-estar")[0].hits[0].detail, "Como me sinto: 5/5");
});

test("waterGlasses: 10 copos da meta (7 de 10 em 1,75 de 2,5 L); sem meta, copos de 250 ml; acima, 10 cheios", () => {
  assert.deepEqual(waterGlasses(1750, 2500), { filled: 7, total: 10 });
  assert.deepEqual(waterGlasses(0, 2500), { filled: 0, total: 10 });
  assert.deepEqual(waterGlasses(249, 2500), { filled: 0, total: 10 });
  assert.deepEqual(waterGlasses(4000, 2500), { filled: 10, total: 10 });
  assert.deepEqual(waterGlasses(600, null), { filled: 2, total: 8 });
  assert.deepEqual(waterGlasses(5000, null), { filled: 8, total: 8 });
  assert.deepEqual(waterGlasses(500, 0), { filled: 2, total: 8 });
});

test("água em litros e horários da linha: '1,75', '1,75 de 2,5 L', até 3 horários", () => {
  assert.equal(waterLiters(1750), "1,75");
  assert.equal(waterLiters(350), "0,35");
  assert.equal(waterLiters(2500), "2,5");
  assert.equal(waterSpoken(1750, 2500), "1,75 de 2,5 L");
  assert.equal(waterSpoken(1750, null), "1,75 L");
  const at = (...times: string[]) => times.map((time) => water(time, 250));
  assert.equal(waterTimes(at("10:00", "14:00")), "10:00 · 14:00");
  assert.equal(waterTimes(at("08:00", "10:00", "14:00", "16:00")), "08:00 · 10:00 · 14:00…");
  assert.equal(waterTimes([]), "");
});

test("bem-estar em linha: emoji por nota, título é a anotação ou a palavra da nota", () => {
  assert.deepEqual(MOOD_EMOJI, ["😣", "🙁", "😐", "🙂", "😄"]);
  assert.equal(moodEmoji(4), "🙂");
  assert.equal(moodEmoji(9), "😄");
  assert.equal(moodEmoji(undefined), "😐");
  // Título como no conceito ("Acordei disposta"): cai só um ponto final; reticências, "?" e "!" ficam.
  assert.equal(wellbeingTitle({ ...mood("07:15", 4), description: "  Acordei disposta.  " }), "Acordei disposta");
  assert.equal(wellbeingTitle({ ...mood("07:15", 4), description: "Cansada..." }), "Cansada...");
  assert.equal(wellbeingTitle({ ...mood("07:15", 4), description: "Dormi bem!" }), "Dormi bem!");
  assert.equal(wellbeingTitle({ ...mood("07:15", 4), description: " . " }), "Bem");
  assert.equal(wellbeingTitle(mood("07:15", 4)), "Bem");
  assert.equal(wellbeingTitle({ ...mood("07:15", 4), rating: undefined }), "Bem-estar");
});
