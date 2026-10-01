import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/dates";
import { notificationsFor } from "../src/lib/domain";
import { EXPIRY_SOON_DAYS, RECIPE_REQUEST, RECIPE_USE_FIRST_REQUEST } from "../src/lib/pantry";
import { reminderCenter, reminderPreview } from "../src/lib/reminder-center";
import { planReminders } from "../src/lib/reminder-plan";
import {
  dismissUseFirst,
  expiringSoon,
  firstUseModel,
  isUseFirstDismissed,
  restoreUseFirst,
  USE_FIRST_COPY,
  USE_FIRST_DAYS,
  USE_FIRST_REMINDER,
} from "../src/lib/use-first";
import type { AppState, PantryItem, Profile } from "../src/types";
import { stateFixture } from "./fixtures";

const T = "2026-09-28";
const at = (hour: number, minute: number, day = 28) => new Date(2026, 8, day, hour, minute);
const item = (name: string, expiresOn: string | null): PantryItem => ({
  id: `p-${name}`,
  name,
  quantity: 1,
  unit: "un",
  location: "geladeira",
  expiresOn,
  notes: "",
  source: "manual",
  updatedAt: "2026-09-20T10:00:00.000Z",
});
const ITEMS: PantryItem[] = [
  item("Espinafre", T),
  item("Iogurte", shiftDate(T, 2)),
  item("Tomate", shiftDate(T, 2)),
  item("Pão de forma", shiftDate(T, 3)),
  item("Ovos", shiftDate(T, 4)),
  item("Queijo", shiftDate(T, 10)),
  item("Leite", shiftDate(T, -1)),
  item("Arroz", null),
];
/** Lembretes ligados, sem silêncio, sem água nem combinados: só o que importa aqui. */
const reminderState = (over: Partial<Profile> = {}, pantry = ITEMS): AppState => {
  const base = stateFixture();
  return {
    ...base,
    profile: {
      ...base.profile!,
      remindersEnabled: true,
      quietStart: "00:00",
      quietEnd: "00:00",
      manualWater: null,
      ...over,
    },
    measurements: [],
    habits: [],
    pantry,
  };
};
const despensa = <T extends { type: string }>(list: readonly T[]) =>
  list.filter((i) => i.type === "despensa");

test("use primeiro: o que vence nos próximos 3 dias, do que vence antes, sem vencidos", () => {
  assert.deepEqual(
    expiringSoon(ITEMS, T).map((i) => i.name),
    ["Espinafre", "Iogurte", "Tomate", "Pão de forma"],
  );
  assert.equal(USE_FIRST_DAYS, EXPIRY_SOON_DAYS);
});

test("modelo do cartão: até 3 chips, '+N', validade curta e completa, nomes mascarados", () => {
  const model = firstUseModel(ITEMS, T, false);
  assert.ok(model);
  assert.equal(model.total, 4);
  assert.equal(model.more, 1);
  assert.equal(model.lead, "4 alimentos vencem nos próximos 3 dias. Confira antes de usar.");
  assert.deepEqual(model.chips, [
    { id: "p-Espinafre", name: "Espinafre", expiresOn: T, short: "vence hoje", aria: "Espinafre, vence hoje, 28/09" },
    { id: "p-Iogurte", name: "Iogurte", expiresOn: shiftDate(T, 2), short: "vence em 2 d", aria: "Iogurte, vence em 2 dias, 30/09" },
    { id: "p-Tomate", name: "Tomate", expiresOn: shiftDate(T, 2), short: "vence em 2 d", aria: "Tomate, vence em 2 dias, 30/09" },
  ]);
  // Cartão da Despensa (conceito 06): subtítulo com a janela de dias.
  assert.equal(USE_FIRST_COPY.window, "Vencem em até 3 dias");

  const single = firstUseModel([item("Iogurte", shiftDate(T, 2))], T, false);
  assert.equal(single?.lead, "1 alimento vence nos próximos 3 dias. Confira antes de usar.");
  assert.equal(single?.more, 0);
  assert.equal(firstUseModel([item("Pão", shiftDate(T, 1))], T, false)?.chips[0]!.short, "vence amanhã");
  assert.equal(firstUseModel([item("Leite", shiftDate(T, -1)), item("Arroz", null)], T, false), null);
  assert.equal(firstUseModel([], T, false), null);

  const hidden = firstUseModel([item("Iogurte 120 kcal", shiftDate(T, 2))], T, true);
  assert.equal(hidden?.chips[0]!.name, "Iogurte calorias ocultas");
  assert.equal(hidden?.chips[0]!.aria, "Iogurte calorias ocultas, vence em 2 dias, 30/09");
  const shown = hidden!.chips.flatMap((c) => [c.name, c.short, c.aria]);
  assert.doesNotMatch([...shown, hidden!.lead].join(" "), /kcal/i);
  assert.equal(firstUseModel(ITEMS, T, false, 2)?.more, 2);
  assert.equal(USE_FIRST_COPY.more(1), "+1");
  assert.equal(USE_FIRST_COPY.moreLabel(1), "e mais 1");
});

test("'Agora não' marca o aviso do dia uma vez e o Desfazer tira, sem mutar o estado", () => {
  const state = reminderState();
  const before = JSON.stringify(state);
  const once = dismissUseFirst(state, T);
  const twice = dismissUseFirst(once, T);
  assert.deepEqual(twice.readNotifications.filter((id) => id === "2026-09-28:despensa"), [
    "2026-09-28:despensa",
  ]);
  assert.equal(isUseFirstDismissed(twice, T), true);
  assert.equal(isUseFirstDismissed(twice, shiftDate(T, 1)), false);
  const restored = restoreUseFirst(twice, T);
  assert.equal(isUseFirstDismissed(restored, T), false);
  assert.equal(restoreUseFirst(restored, T), restored);
  assert.equal(JSON.stringify(state), before);
  assert.equal(once.pantry, state.pantry);
});

test("aviso devido às 10:00 sem nomes; antes disso, sem itens a vencer ou já dispensado", () => {
  const state = reminderState();
  const due = despensa(notificationsFor(state, at(10, 5)));
  assert.deepEqual(due, [
    {
      id: "2026-09-28:despensa",
      type: "despensa",
      title: "Use primeiro",
      description: USE_FIRST_REMINDER.body,
      time: "10:00",
      read: false,
    },
  ]);
  for (const name of ["Espinafre", "Iogurte", "Tomate"])
    assert.doesNotMatch(`${due[0]!.title} ${due[0]!.description}`, new RegExp(name));
  assert.deepEqual(despensa(notificationsFor(state, at(9, 59))), []);
  const stale = reminderState({}, [item("Leite", shiftDate(T, -1)), item("Arroz", null)]);
  assert.deepEqual(despensa(notificationsFor(stale, at(10, 5))), []);
  assert.equal(despensa(notificationsFor(dismissUseFirst(state, T), at(10, 5)))[0]!.read, true);
  assert.deepEqual(despensa(notificationsFor({ ...state, profile: { ...state.profile!, remindersEnabled: false } }, at(10, 5))), []);
});

test("agenda: 'Use primeiro' às 10:00 só hoje e amanhã, respeitando o silêncio e o dispensado", () => {
  const state = reminderState();
  const planned = despensa(planReminders(state, at(8, 0)));
  assert.deepEqual(planned.map((r) => r.id), ["2026-09-28:despensa", "2026-09-29:despensa"]);
  assert.deepEqual(planned.map((r) => r.time), ["10:00", "10:00"]);
  assert.ok(planned.every((r) => r.title === USE_FIRST_REMINDER.title && r.body === USE_FIRST_REMINDER.body));

  const dismissed = despensa(planReminders(dismissUseFirst(state, T), at(8, 0)));
  assert.deepEqual(dismissed.map((r) => r.id), ["2026-09-29:despensa"]);
  assert.deepEqual(despensa(planReminders(state, at(10, 30))).map((r) => r.id), ["2026-09-29:despensa"]);

  const quiet = despensa(planReminders(reminderState({ quietStart: "09:00", quietEnd: "11:00" }), at(8, 0)));
  assert.deepEqual(quiet.map((r) => r.time), ["11:00", "11:00"]);
  // Itens a vencer em todos os dias da semana: nunca um aviso depois de amanhã.
  const everyDay = reminderState({}, Array.from({ length: 9 }, (_, i) => item(`Item ${i}`, shiftDate(T, i))));
  const week = despensa(planReminders(everyDay, at(8, 0)));
  assert.deepEqual(week.map((r) => r.date), [T, shiftDate(T, 1)]);
});

test("central de lembretes: cartão devido em tom de comida sem ação rápida e prévia 'Use primeiro'", () => {
  const center = reminderCenter(reminderState(), at(10, 5));
  const card = center.sections[0].items.find((c) => c.type === "despensa");
  assert.ok(card);
  assert.equal(card.tone, "food");
  assert.equal(card.quick, null);
  assert.equal(card.title, "Use primeiro");

  const off = reminderState({ remindersEnabled: false });
  const chip = reminderPreview(off, at(10, 5)).chips.find((c) => c.type === "despensa");
  assert.deepEqual(chip, { time: "10:00", label: "Use primeiro", type: "despensa" });
});

test("pedido de receitas 'Use primeiro': o pedido padrão com a prioridade, sem nomes de alimentos", () => {
  assert.ok(RECIPE_USE_FIRST_REQUEST.startsWith(RECIPE_REQUEST));
  assert.match(RECIPE_USE_FIRST_REQUEST, /vencem nos próximos 3 dias/);
  assert.ok(RECIPE_USE_FIRST_REQUEST.length <= 6000);
  for (const name of ["Espinafre", "Iogurte", "Tomate"])
    assert.doesNotMatch(RECIPE_USE_FIRST_REQUEST, new RegExp(name));
});
