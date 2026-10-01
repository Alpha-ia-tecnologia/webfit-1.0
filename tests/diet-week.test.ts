import { test } from "node:test";
import assert from "node:assert/strict";
import { allergenTokens } from "../src/lib/allergens";
import { localDate, shiftDate } from "../src/lib/dates";
import type { DietMeal, DietPlanV2 } from "../src/lib/diet-plan";
import {
  dayOffset,
  itemOptions,
  macroGramsLabel,
  macroGramsText,
  mealEstimateText,
  pantryTileText,
  PLAN_DAY_COPY,
  planAnchor,
  planDayStatus,
  planForDay,
  planMealAction,
  planMealStates,
  planWeek,
  shoppingTileText,
  swapStatus,
  tipKind,
  variantMeal,
  weekOf,
  type PlanMealAction,
} from "../src/lib/diet-week";
import type { DiaryEntry, MealItem, PantryItem } from "../src/types";
import { DIET_PLAN_V2 } from "./structured-fixtures";

const T = "2026-09-28";
const plan = DIET_PLAN_V2;
const [cafe, almoco, lanche, jantar] = plan.refeicoes as [DietMeal, DietMeal, DietMeal, DietMeal];
const ids = (items: readonly MealItem[]) => items.map((i) => `${i.food.id}:${i.grams}`);
const logged = (action: PlanMealAction) => {
  assert.equal(action.kind, "log");
  return action.kind === "log" ? ids(action.items) : [];
};
const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  id: over.id ?? `e-${over.time}`,
  userId: "u1",
  date: T,
  time: "12:00",
  createdAt: `${T}T12:00:00.000Z`,
  updatedAt: `${T}T12:00:00.000Z`,
  type: "refeicao",
  title: "Refeição",
  description: "",
  ...over,
});
const withoutTrocas = (p: DietPlanV2): DietPlanV2 => ({
  ...p,
  refeicoes: p.refeicoes.map((m) => ({ ...m, itens: m.itens.map((i) => ({ ...i, trocas: [] })) })),
});

test("semana do plano: deslocamento por dia do plano, âncora local e semana de segunda a domingo", () => {
  assert.equal(dayOffset(T, T), 0);
  assert.equal(dayOffset("2026-09-25", T), 3);
  assert.equal(dayOffset(T, "2026-09-25"), 4);
  assert.equal(dayOffset(T, "2026-10-05"), 0);
  assert.equal(dayOffset("", T), 0);
  const iso = "2026-09-28T02:30:00.000Z";
  assert.equal(planAnchor(iso), localDate(new Date(iso)));

  const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  assert.deepEqual(weekOf(T), week);
  assert.deepEqual(weekOf("2026-10-04"), week);
  assert.equal(weekOf("2026-10-05")[0], "2026-10-05");
});

test("opções do item: original sempre primeiro, trocas sem alergênico declarado e sem repetir", () => {
  const [arroz, feijao] = almoco.itens;
  assert.deepEqual(itemOptions(arroz!, []), [
    "arroz branco cozido",
    "arroz integral cozido",
    "batata cozida",
  ]);
  assert.deepEqual(itemOptions(feijao!, allergenTokens("Tenho alergia a lentilha")), [
    "feijão carioca cozido",
  ]);
  const repeated = { ...arroz!, trocas: ["Arroz Branco Cozido", "arroz integral cozido", "ARROZ INTEGRAL COZIDO"] };
  assert.deepEqual(itemOptions(repeated, []), ["arroz branco cozido", "arroz integral cozido"]);
  // Alergênico pelo alimento da TACO ligado à troca ("pão francês" → "Pão, trigo, francês").
  const bread = { ...arroz!, trocas: ["pão francês"] };
  assert.deepEqual(itemOptions(bread, allergenTokens("Alergia a trigo")), ["arroz branco cozido"]);
});

test("variação da refeição: troca sem medida nem gramas, lista as outras opções e mantém o resto", () => {
  const { meal, swaps } = variantMeal(almoco, 1, []);
  assert.deepEqual(meal.itens[0], {
    alimento: "arroz integral cozido",
    medidaCaseira: "",
    gramas: null,
    trocas: ["arroz branco cozido", "batata cozida"],
  });
  assert.equal(meal.itens[1]!.alimento, "lentilha cozida");
  assert.deepEqual(meal.itens[1]!.trocas, ["feijão carioca cozido"]);
  assert.equal(meal.itens[2], almoco.itens[2]);
  assert.deepEqual(swaps, [
    { item: 0, replaces: "arroz branco cozido" },
    { item: 1, replaces: "feijão carioca cozido" },
  ]);
  const cycle = variantMeal(almoco, 6, []);
  assert.equal(cycle.meal, almoco);
  assert.deepEqual(cycle.swaps, []);
});

test("plano do dia: dia 0 é o plano original, trocas giram por dia, extra e alergia", () => {
  const day0 = planForDay(plan, { anchor: T, date: T, allergyDetails: "" });
  assert.equal(day0.offset, 0);
  assert.equal(day0.hasVariation, false);
  assert.equal(day0.plan, plan);
  assert.equal(day0.meals[1]!.canSwap, true);
  assert.equal(day0.meals[0]!.canSwap, false);

  const day2 = planForDay(plan, { anchor: T, date: shiftDate(T, 2), allergyDetails: "" });
  assert.equal(day2.hasVariation, true);
  assert.deepEqual(
    day2.plan.refeicoes[1]!.itens.map((i) => i.alimento),
    ["batata cozida", "feijão carioca cozido", "frango grelhado", "alface"],
  );
  assert.deepEqual(day2.meals[1]!.swaps, [{ item: 0, replaces: "arroz branco cozido" }]);
  assert.equal(day2.plan.resumo, plan.resumo);
  assert.equal(day2.plan.dicas, plan.dicas);
  assert.equal(day2.plan.refeicoes[0], cafe);

  const extra = planForDay(plan, { anchor: T, date: T, allergyDetails: "", extra: { 1: 1 } });
  assert.deepEqual(extra.plan.refeicoes[1], variantMeal(almoco, 1, []).meal);

  const allergy = planForDay(plan, {
    anchor: T,
    date: shiftDate(T, 1),
    allergyDetails: "Tenho alergia a lentilha",
  });
  assert.deepEqual(
    allergy.plan.refeicoes[1]!.itens.slice(0, 2).map((i) => i.alimento),
    ["arroz integral cozido", "feijão carioca cozido"],
  );
  assert.deepEqual(allergy.meals[1]!.swaps, [{ item: 0, replaces: "arroz branco cozido" }]);
});

test("faixa da semana: letras, números, ponto de variação e nomes acessíveis", () => {
  const week = planWeek(plan, { anchor: T, today: T, allergyDetails: "" });
  assert.deepEqual(week.map((d) => d.letter), ["S", "T", "Q", "Q", "S", "S", "D"]);
  assert.deepEqual(week.map((d) => d.day), ["28", "29", "30", "1", "2", "3", "4"]);
  assert.deepEqual(week.map((d) => d.hasVariation), [false, true, true, true, true, true, false]);
  assert.deepEqual(week.map((d) => d.isToday), [true, false, false, false, false, false, false]);
  assert.equal(week[0]!.aria, "Seg, 28 set, hoje, plano original");
  assert.equal(week[1]!.aria, "Ter, 29 set, com variação");

  const anchored = planWeek(plan, { anchor: "2026-09-25", today: T, allergyDetails: "" });
  assert.deepEqual(anchored.map((d) => d.hasVariation), [true, true, true, false, false, true, true]);
  const plain = planWeek(withoutTrocas(plan), { anchor: T, today: T, allergyDetails: "" });
  assert.ok(plain.every((d) => !d.hasVariation));
});

test("refeições do plano registradas hoje: regra de contagem por categoria e horário", () => {
  const diary = [
    entry({ id: "a", time: "12:41", title: "Almoço", categoryTag: "Almoço" }),
    entry({ id: "l", time: "10:05", title: "Lanche", categoryTag: "Lanche" }),
    entry({ id: "w", time: "09:00", type: "agua", title: "Água", amountMl: 250 }),
    entry({ id: "y", date: shiftDate(T, -1), time: "12:10", title: "Almoço", categoryTag: "Almoço" }),
  ];
  const status = planDayStatus(plan, diary, T);
  assert.deepEqual(status.registeredAt, [null, "12:41", "10:05", null]);
  assert.equal(status.done, 2);
  assert.equal(status.total, 4);
  assert.equal(status.text, "2 de 4 refeições hoje");

  const byTitle = planDayStatus(plan, [entry({ id: "t", time: "13:00", title: "Almoço" })], T);
  assert.deepEqual(byTitle.registeredAt, [null, "13:00", null, null]);

  const snacks: DietPlanV2 = {
    ...plan,
    refeicoes: [
      { slot: "lanche_da_tarde", horario: "16:00", itens: lanche.itens },
      { slot: "lanche_da_manha", horario: "10:00", itens: lanche.itens },
    ],
  };
  const snack = planDayStatus(snacks, [entry({ id: "s", time: "16:10", title: "Lanche", categoryTag: "Lanche" })], T);
  assert.deepEqual(snack.registeredAt, [null, "16:10"]);

  const single: DietPlanV2 = { ...plan, refeicoes: [almoco] };
  const one = planDayStatus(single, [entry({ id: "o", time: "12:05", categoryTag: "Almoço" })], T);
  assert.equal(one.text, "1 de 1 refeição hoje");
});

test("'Comi esta': registra direto só com todos os itens na TACO e sem alergênico", () => {
  const lunch = planMealAction(almoco, { allergyDetails: "" });
  assert.equal(lunch.category, "Almoço");
  assert.deepEqual(logged(lunch), ["taco-3:100", "taco-561:100", "taco-410:100", "taco-78:30"]);

  const breakfast = planMealAction(cafe, { allergyDetails: "" });
  assert.equal(breakfast.kind, "review");
  assert.match(breakfast.kind === "review" ? breakfast.preset.note : "", /Não encontrados na TACO: café com leite/);
  assert.equal(breakfast.kind === "review" ? breakfast.preset.category : "", "Café da manhã");

  const allergic = planMealAction(almoco, { allergyDetails: "Tenho alergia a frango" });
  assert.equal(allergic.kind, "review");
  assert.match(
    allergic.kind === "review" ? allergic.preset.note : "",
    /Fora do prato por coincidir com alergia declarada: frango grelhado/,
  );
  assert.ok(allergic.kind === "review" && allergic.preset.items.every((i) => i.food.id !== "taco-410"));

  const swapped = planMealAction(variantMeal(almoco, 2, []).meal, { allergyDetails: "" });
  assert.deepEqual(logged(swapped), ["taco-91:90", "taco-561:100", "taco-410:100", "taco-78:30"]);
  assert.equal(planMealAction(jantar, { allergyDetails: "" }).kind, "review");
});

test("textos: estado das trocas, registro e prévia de outro dia", () => {
  const { meal, swaps } = variantMeal(almoco, 1, []);
  assert.equal(swapStatus(meal, swaps), "Almoço com trocas: arroz integral cozido e lentilha cozida.");
  assert.equal(swapStatus(almoco, []), "Almoço como no plano original.");
  const one = variantMeal(almoco, 2, []);
  assert.equal(swapStatus(one.meal, one.swaps), "Almoço com trocas: batata cozida.");
  assert.equal(PLAN_DAY_COPY.logged("almoco", "12:41"), "Refeição registrada: Almoço, hoje às 12:41.");
  assert.equal(PLAN_DAY_COPY.preview("2026-09-30"), "Prévia de qua, 30 set: registre no próprio dia.");
  assert.equal(PLAN_DAY_COPY.eatLabel("almoco"), "Registrar Almoço");
  assert.equal(PLAN_DAY_COPY.adjustLabel("almoco"), "Ajustar e registrar: Almoço");
  assert.equal(PLAN_DAY_COPY.swapLabel("almoco"), "Trocar refeição: almoço");
  assert.equal(PLAN_DAY_COPY.moreLabel("almoco"), "Mais opções: Almoço");
  assert.equal(PLAN_DAY_COPY.itemSwapLabel("arroz branco cozido", 2), "Trocar arroz branco cozido: 2 opções");
  assert.equal(PLAN_DAY_COPY.itemSwapLabel("feijão carioca cozido", 1), "Trocar feijão carioca cozido: 1 opção");
  assert.equal(PLAN_DAY_COPY.askLabel("cafe_da_manha"), "Pedir outra opção: Café da manhã");
  assert.equal(
    PLAN_DAY_COPY.askPrompt("cafe_da_manha"),
    "Sugira outra opção de café da manhã para o meu plano, respeitando minhas alergias e o que eu evito.",
  );
  assert.equal(PLAN_DAY_COPY.swapTag("arroz branco cozido"), "no lugar de arroz branco cozido");
  assert.equal(PLAN_DAY_COPY.registered("12:41"), "Feita às 12:41");
});

test("sem mutação e sem números ou incentivos de peso, calorias ou metas nos textos", () => {
  const before = JSON.stringify(plan);
  const diary = [entry({ id: "a", time: "12:41", categoryTag: "Almoço" })];
  const diaryBefore = JSON.stringify(diary);
  const week = planWeek(plan, { anchor: T, today: T, allergyDetails: "Tenho alergia a lentilha" });
  const days = weekOf(T).map((date) =>
    planForDay(plan, { anchor: T, date, allergyDetails: "", extra: { 1: 2 } }),
  );
  const status = planDayStatus(plan, diary, T);
  plan.refeicoes.forEach((meal) => planMealAction(meal, { allergyDetails: "Tenho alergia a frango" }));
  assert.equal(JSON.stringify(plan), before);
  assert.equal(JSON.stringify(diary), diaryBefore);

  const slots = plan.refeicoes.map((m) => m.slot);
  const texts = [
    ...week.map((d) => d.aria),
    status.text,
    ...days.flatMap((d) => d.plan.refeicoes.map((m, i) => swapStatus(m, d.meals[i]!.swaps))),
    PLAN_DAY_COPY.week,
    PLAN_DAY_COPY.otherDays,
    PLAN_DAY_COPY.legend,
    PLAN_DAY_COPY.preview(T),
    PLAN_DAY_COPY.eat,
    PLAN_DAY_COPY.adjust,
    PLAN_DAY_COPY.swap,
    PLAN_DAY_COPY.ask,
    ...slots.flatMap((s) => [
      PLAN_DAY_COPY.eatLabel(s),
      PLAN_DAY_COPY.adjustLabel(s),
      PLAN_DAY_COPY.swapLabel(s),
      PLAN_DAY_COPY.askLabel(s),
      PLAN_DAY_COPY.moreLabel(s),
      PLAN_DAY_COPY.askPrompt(s),
      PLAN_DAY_COPY.logged(s, "12:41"),
    ]),
  ];
  for (const text of texts) assert.doesNotMatch(text, /kcal|calori|peso|meta/i, text);
});

test("estado das refeições de hoje: feita, passada sem cobrança, próxima e futura", () => {
  // café 07:30 · almoço 12:00 · lanche 16:00 · jantar 19:30
  assert.deepEqual(planMealStates(plan, [null, null, null, null], 2, "16:10"), [
    "past",
    "past",
    "next",
    "future",
  ]);
  assert.deepEqual(planMealStates(plan, ["08:10", "12:41", null, null], 2, "16:10"), [
    "done",
    "done",
    "next",
    "future",
  ]);
  // Sem próxima (dia encerrado): o que passou fica "past", nunca "atrasada".
  assert.deepEqual(planMealStates(plan, [null, "12:41", null, "19:40"], null, "22:00"), [
    "past",
    "done",
    "past",
    "done",
  ]);
  const flexible: DietPlanV2 = { ...plan, refeicoes: [{ ...cafe, horario: null }, almoco] };
  assert.deepEqual(planMealStates(flexible, [null, null], 1, "11:00"), ["future", "next"]);
});

test("números da refeição: só TACO, ≈ quando parcial, sem kcal com calorias ocultas e nada no perfil sensível", () => {
  const full = { kcal: 180, protein: 9, grams: { protein: 9, carbs: 21, fat: 7 }, isPartial: false };
  assert.deepEqual(mealEstimateText(full, { hideCalories: false, sensitive: false }), {
    kcal: "180 kcal",
    protein: "9 g proteína",
  });
  assert.deepEqual(mealEstimateText({ ...full, kcal: 1520, isPartial: true }, { hideCalories: false, sensitive: false, compact: true }), {
    kcal: "≈ 1.520 kcal",
    protein: "≈ 9 g prot.",
  });
  assert.deepEqual(mealEstimateText(full, { hideCalories: true, sensitive: false }), {
    kcal: null,
    protein: "9 g proteína",
  });
  assert.deepEqual(mealEstimateText(full, { hideCalories: false, sensitive: true }), {
    kcal: null,
    protein: null,
  });
  const none = { kcal: null, protein: null, grams: null, isPartial: true };
  assert.deepEqual(mealEstimateText(none, { hideCalories: false, sensitive: false }), {
    kcal: null,
    protein: null,
  });
  assert.equal(macroGramsText(full.grams), "P 9 · C 21 · G 7 g");
  assert.equal(
    macroGramsLabel(full.grams),
    "Estimativa TACO: proteínas 9 g, carboidratos 21 g, gorduras 7 g",
  );
});

test("atalhos 'Para facilitar': ícone pela dica, despensa e compras", () => {
  assert.equal(tipKind("Beba 2,5 L de água ao longo do dia; deixe uma garrafa na mesa."), "water");
  assert.equal(tipKind("Use primeiro o espinafre e o frango da despensa."), "pantry");
  assert.equal(tipKind("Leia os rótulos: evite produtos com amendoim ou traços."), "label");
  assert.equal(tipKind("Faça a lista de compras no domingo."), "shopping");
  assert.equal(tipKind("Cozinhe proteína para 2 dias no domingo e na quarta."), "cooking");
  assert.equal(tipKind("Deixe frutas lavadas à vista para os lanches."), "other");

  const item = (name: string, expiresOn: string | null): PantryItem => ({
    id: name,
    name,
    quantity: 1,
    unit: "un",
    location: "geladeira",
    expiresOn,
    notes: "",
    source: "manual",
    updatedAt: `${T}T09:00:00.000Z`,
  });
  assert.deepEqual(
    pantryTileText([item("Espinafre", shiftDate(T, 2)), item("Frango", shiftDate(T, 3)), item("Arroz", null)], T),
    { text: "2 vencem logo", isSoon: true },
  );
  assert.deepEqual(pantryTileText([item("Espinafre", shiftDate(T, 1))], T), {
    text: "1 vence logo",
    isSoon: true,
  });
  assert.deepEqual(pantryTileText([item("Arroz", null), item("Feijão", shiftDate(T, 30))], T), {
    text: "2 alimentos",
    isSoon: false,
  });
  assert.deepEqual(pantryTileText([], T), { text: "Cadastre seus alimentos", isSoon: false });
  assert.equal(shoppingTileText(3), "3 itens na lista");
  assert.equal(shoppingTileText(1), "1 item na lista");
  assert.equal(shoppingTileText(0), "Monte pelo plano");
});
