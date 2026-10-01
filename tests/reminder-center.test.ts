import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuiet, shiftDate } from "../src/lib/domain";
import { planReminders } from "../src/lib/reminder-plan";
import {
  completeHabitOn,
  markRemindersRead,
  REMINDER_COPY,
  REMINDER_TONE,
  REMINDER_TYPE_ORDER,
  REMINDER_UPCOMING_MAX,
  REMINDER_WATER_ML,
  reminderCenter,
  reminderNotice,
  reminderPreview,
  reminderSubject,
  reopenHabitOn,
  type ReminderCard,
  type ReminderCenter,
  type ReminderType,
} from "../src/lib/reminder-center";
import {
  injectionSchema,
  type AppState,
  type DiaryEntry,
  type InjectionEntry,
  type Profile,
} from "../src/types";
import { stateFixture } from "./fixtures";

const TODAY = "2026-09-23";
const TOMORROW = "2026-09-24";
const now = (time = "13:00", date = TODAY) => new Date(`${date}T${time}:00`);
const entry = (overrides: Partial<DiaryEntry>): DiaryEntry => ({
  id: "registro",
  userId: "u1",
  type: "agua",
  date: TODAY,
  time: "07:00",
  createdAt: `${TODAY}T10:00:00.000Z`,
  updatedAt: `${TODAY}T10:00:00.000Z`,
  title: "Registro",
  description: "",
  amountMl: 250,
  ...overrides,
});
/** Café registrado às 08:10, 500 ml de água às 10:00 e dois combinados (12:00 e 21:30). */
const centerState = (over: Partial<Profile> = {}): AppState => {
  const base = stateFixture();
  return {
    ...base,
    profile: { ...base.profile!, remindersEnabled: true, ...over },
    measurements: [],
    diary: [
      entry({
        id: "cafe1",
        type: "refeicao",
        time: "08:10",
        title: "Café da manhã",
        categoryTag: "Café da manhã",
        amountMl: undefined,
        calories: 350,
      }),
      entry({ id: "agua1", time: "10:00", title: "Água", amountMl: 500 }),
    ],
    habits: [
      {
        id: "h1",
        title: "Caminhar 20 minutos",
        timeOfDay: "12:00",
        createdDate: "2026-09-20",
        completedDates: [],
      },
      {
        id: "h2",
        title: "Chá calmante",
        timeOfDay: "21:30",
        createdDate: "2026-09-20",
        completedDates: [],
      },
    ],
  };
};
const injectionOn = (date: string, time = "08:30"): InjectionEntry =>
  injectionSchema.parse({
    id: `inj-${date}`,
    userId: "u1",
    date,
    time,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
  });
const stateWithPen = (
  injections: InjectionEntry[],
  over: Partial<Profile> = {},
): AppState => ({
  ...centerState({
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    pregnancy: "nao",
    ...over,
  }),
  injections,
});
const items = (center: ReminderCenter, key: "agora" | "hoje" | "proximos") =>
  center.sections.find((s) => s.key === key)!.items;
const allCards = (center: ReminderCenter): ReminderCard[] =>
  center.sections.flatMap((s) => s.items);
const brief = (cards: ReminderCard[]) =>
  cards.map((c) => [c.when, c.title, c.status]);

test("Agora: devidos não lidos por horário e tipo, com o 'quando' sem cobrança", () => {
  // Arrange
  const state = centerState();
  // Act
  const center = reminderCenter(state, now());
  // Assert
  assert.equal(center.enabled, true);
  assert.equal(center.quietUntil, null);
  assert.deepEqual(
    center.sections.map((s) => [s.key, s.title]),
    [
      ["agora", "Agora"],
      ["hoje", "Hoje"],
      ["proximos", "Próximos"],
    ],
  );
  const agora = items(center, "agora");
  assert.deepEqual(
    agora.map((c) => [c.id, c.type, c.title, c.when, c.status]),
    [
      ["2026-09-23:Almoço", "refeicao", "Registrar almoço", "Desde 12:00", "due"],
      ["2026-09-23:h1", "habito", "Caminhar 20 minutos", "Desde 12:00", "due"],
      ["2026-09-23:agua:agua1:1", "agua", "Pausa para hidratação", "Agora", "due"],
      ["2026-09-23:medicao", "medicao", "Atualizar medidas", "Agora", "due"],
    ],
  );
  assert.equal(center.unread, 4);
  const water = agora[2];
  assert.equal(water.tone, "water");
  assert.equal(water.meta, "500 de 2.000 ml hoje");
  assert.equal(water.progress, 25);
  assert.ok(
    agora.filter((c) => c.type !== "agua").every((c) => c.meta === null && c.progress === null),
  );
});

test("atalhos: +250 ml, Concluir e Registrar; medidas sem atalho", () => {
  // Arrange
  const state = centerState();
  // Act
  const quick = Object.fromEntries(
    items(reminderCenter(state, now()), "agora").map((c) => [c.type, c.quick]),
  );
  // Assert
  assert.deepEqual(quick.refeicao, {
    kind: "meal",
    category: "Almoço",
    label: "Registrar",
    aria: "Registrar almoço agora",
  });
  assert.deepEqual(quick.habito, {
    kind: "habit",
    habitId: "h1",
    label: "Concluir",
    aria: "Concluir combinado: Caminhar 20 minutos",
  });
  assert.deepEqual(quick.agua, {
    kind: "water",
    ml: REMINDER_WATER_ML,
    label: "+250 ml",
    aria: "Somar 250 ml de água",
  });
  assert.equal(quick.medicao, null);
  assert.notEqual(quick.agua?.aria, "Registrar água");
});

test("Hoje: planejados do resto do dia sem repetir os devidos; um lido vai para Hoje", () => {
  // Arrange
  const state = centerState();
  // Act
  const before = reminderCenter(state, now());
  const after = reminderCenter(
    markRemindersRead(state, ["2026-09-23:medicao"]),
    now(),
  );
  // Assert
  assert.deepEqual(brief(items(before, "hoje")), [
    ["Às 15:00", "Pausa para hidratação", "planned"],
    ["Às 19:30", "Registrar jantar", "planned"],
    ["Às 21:00", "Pausa para hidratação", "planned"],
    ["Às 21:30", "Chá calmante", "planned"],
  ]);
  assert.ok(items(before, "hoje").every((c) => c.quick === null && c.meta === null));
  const [first] = items(after, "hoje");
  assert.equal(first.title, "Atualizar medidas");
  assert.equal(first.status, "read");
  assert.equal(first.when, "Agora · Lido");
  assert.equal(first.quick, null);
  assert.equal(after.unread, 3);
  assert.ok(!items(after, "agora").some((c) => c.type === "medicao"));
});

test("Próximos: seis a partir de amanhã, sem medidas enquanto estão devidas hoje", () => {
  // Arrange
  const state = centerState();
  const measuredWeekAgo: AppState = {
    ...state,
    measurements: [{ ...stateFixture().measurements[0], date: shiftDate(TODAY, -7) }],
  };
  // Act
  const proximos = items(reminderCenter(state, now()), "proximos");
  const withMeasurement = reminderCenter(measuredWeekAgo, now());
  // Assert
  assert.equal(proximos.length, REMINDER_UPCOMING_MAX);
  assert.deepEqual(brief(proximos), [
    ["Amanhã · 08:30", "Registrar café da manhã", "planned"],
    ["Amanhã · 09:00", "Pausa para hidratação", "planned"],
    ["Amanhã · 12:00", "Caminhar 20 minutos", "planned"],
    ["Amanhã · 12:30", "Registrar almoço", "planned"],
    ["Amanhã · 15:00", "Pausa para hidratação", "planned"],
    ["Amanhã · 19:30", "Registrar jantar", "planned"],
  ]);
  assert.ok(proximos.every((c) => c.date === TOMORROW && c.quick === null));
  // Medição há 7 dias: não está devida hoje e o aviso de amanhã às 09:00 aparece.
  assert.ok(!items(withMeasurement, "agora").some((c) => c.type === "medicao"));
  assert.ok(
    items(withMeasurement, "proximos").some(
      (c) => c.when === "Amanhã · 09:00" && c.title === "Atualizar medidas",
    ),
  );
});

test("tudo em dia: Agora vazio e o próximo planejado vem de Hoje", () => {
  // Arrange
  const state = centerState();
  const dueIds = items(reminderCenter(state, now()), "agora").map((c) => c.id);
  // Act
  const center = reminderCenter(markRemindersRead(state, dueIds), now());
  // Assert
  assert.equal(items(center, "agora").length, 0);
  assert.equal(center.unread, 0);
  assert.ok(center.next);
  assert.equal(center.next.when, "Às 15:00");
  assert.equal(center.next.title, "Pausa para hidratação");
  assert.equal(
    REMINDER_COPY.allClearNext(center.next),
    "Próximo: 15:00 · Pausa para hidratação",
  );
  // Amanhã ou depois, o dia vem junto (às 23:30 não parece que o próximo é daqui a pouco).
  const card = { ...center.next, time: "08:30", title: "Registrar café da manhã" };
  assert.equal(
    REMINDER_COPY.allClearNext({ ...card, when: "Amanhã · 08:30" }),
    "Próximo: Amanhã · 08:30 · Registrar café da manhã",
  );
  assert.equal(
    REMINDER_COPY.allClearNext({ ...card, when: "Qui, 1 out · 08:30" }),
    "Próximo: Qui, 1 out · 08:30 · Registrar café da manhã",
  );
  assert.deepEqual(
    items(center, "hoje").slice(0, 4).map((c) => c.status),
    ["read", "read", "read", "read"],
  );
});

test("sem nada programado: seções vazias e próximo nulo", () => {
  // Arrange: silêncio o dia todo, sem meta de água, sem combinados e perfil sensível.
  const state: AppState = {
    ...centerState({
      quietStart: "00:00",
      quietEnd: "23:59",
      manualWater: null,
      eatingDisorder: "sim",
    }),
    habits: [],
  };
  // Act
  const center = reminderCenter(state, now());
  // Assert
  assert.equal(center.enabled, true);
  assert.equal(center.quietUntil, "23:59");
  assert.deepEqual(allCards(center), []);
  assert.equal(center.next, null);
  assert.equal(REMINDER_COPY.allClearNone, "Nenhum lembrete programado para os próximos dias.");
});

test("desligado ou sem perfil: nenhuma seção com itens", () => {
  // Arrange
  const off = centerState({ remindersEnabled: false });
  const noProfile: AppState = { ...centerState(), profile: null };
  // Act
  const centers = [reminderCenter(off, now()), reminderCenter(noProfile, now())];
  // Assert
  for (const center of centers) {
    assert.equal(center.enabled, false);
    assert.equal(center.quietUntil, null);
    assert.equal(center.unread, 0);
    assert.equal(center.next, null);
    assert.deepEqual(
      center.sections.map((s) => [s.key, s.items.length]),
      [
        ["agora", 0],
        ["hoje", 0],
        ["proximos", 0],
      ],
    );
  }
});

test("silêncio: noturno e diurno escondem Agora; sem silêncio quando início = fim", () => {
  // Arrange
  const night = centerState();
  const day = centerState({ quietStart: "12:30", quietEnd: "14:00" });
  const none = centerState({ quietStart: "00:00", quietEnd: "00:00" });
  // Act
  const atNight = reminderCenter(night, now("23:30"));
  const atDay = reminderCenter(day, now("13:00"));
  const noQuiet = reminderCenter(none, now("23:30"));
  // Assert
  assert.equal(atNight.quietUntil, "07:00");
  assert.equal(items(atNight, "agora").length, 0);
  assert.equal(items(atNight, "hoje").length, 0);
  assert.equal(items(atNight, "proximos")[0].when, "Amanhã · 08:30");
  assert.equal(atNight.next?.when, "Amanhã · 08:30");
  assert.equal(
    REMINDER_COPY.quietNow("07:00"),
    "Horário de silêncio até 07:00. Os lembretes voltam depois.",
  );
  assert.equal(atDay.quietUntil, "14:00");
  assert.equal(items(atDay, "agora").length, 0);
  assert.ok(items(atDay, "hoje").length > 0);
  assert.ok(items(atDay, "hoje").every((c) => !isQuiet(c.time, "12:30", "14:00")));
  assert.equal(noQuiet.quietUntil, null);
  assert.ok(items(noQuiet, "agora").length > 0);
});

test("restrição de líquidos: sem +250 ml e sem barra de meta", () => {
  // Arrange
  const state = centerState({ fluidRestriction: "sim" });
  // Act
  const water = items(reminderCenter(state, now()), "agora").find((c) => c.type === "agua");
  // Assert
  assert.ok(water);
  assert.equal(water.quick, null);
  assert.equal(water.meta, "500 ml registrados hoje");
  assert.equal(water.progress, null);
});

test("perfil sensível: nenhum convite a medidas em seções nem na prévia", () => {
  for (const over of [{ eatingDisorder: "sim" }, { pregnancy: "gestacao" }] as const) {
    // Arrange
    const state = centerState(over);
    const off = centerState({ ...over, remindersEnabled: false });
    // Act
    const center = reminderCenter(state, now());
    const preview = reminderPreview(off, now());
    // Assert
    assert.ok(items(center, "agora").length > 0, JSON.stringify(over));
    assert.ok(!allCards(center).some((c) => c.type === "medicao"), JSON.stringify(over));
    assert.ok(!preview.chips.some((c) => c.type === "medicao"), JSON.stringify(over));
    assert.doesNotMatch(
      JSON.stringify([center, preview]),
      /medidas|peso|kcal|caloria|prote[íi]na/i,
      JSON.stringify(over),
    );
  }
});

test("caneta: aviso do dia estimado só informativo, sem atalho nem dose", () => {
  // Arrange
  const state = stateWithPen([injectionOn(shiftDate(TODAY, -7))]);
  const injectionsBefore = JSON.stringify(state.injections);
  // Act
  const center = reminderCenter(state, now());
  // Assert
  const [card] = items(center, "agora");
  assert.equal(card.type, "injecao");
  assert.equal(card.tone, "medication");
  assert.equal(card.title, "Dia da aplicação (estimado)");
  assert.equal(card.when, "Desde 08:30");
  assert.equal(card.quick, null);
  assert.doesNotMatch(JSON.stringify(center), /\bmg\b|Mounjaro|Tirzepatida/i);
  assert.equal(JSON.stringify(state.injections), injectionsBefore);
});

test("caneta na gestação: nenhuma aplicação em seções nem na prévia", () => {
  // Arrange
  const state = stateWithPen([injectionOn(shiftDate(TODAY, -7))], { pregnancy: "gestacao" });
  // Act
  const center = reminderCenter(state, now());
  const preview = reminderPreview(state, now());
  // Assert
  assert.ok(!allCards(center).some((c) => c.type === "injecao"));
  assert.ok(!preview.chips.some((c) => c.type === "injecao"));
  assert.doesNotMatch(JSON.stringify([center, preview]), /aplica/i);
});

test("próxima aplicação em Próximos: com data, nunca contagem regressiva", () => {
  // Arrange: última há 3 dias → estimada para domingo, 27 set, além das seis vagas de amanhã.
  const state = stateWithPen([injectionOn(shiftDate(TODAY, -3))]);
  // Act
  const proximos = items(reminderCenter(state, now()), "proximos");
  // Assert
  assert.equal(proximos.length, REMINDER_UPCOMING_MAX);
  const last = proximos[proximos.length - 1];
  assert.equal(last.type, "injecao");
  assert.equal(last.when, "Dom, 27 set · 08:30");
  assert.equal(last.quick, null);
  assert.match(last.when, /^(Amanhã|[A-Z][a-z]{2}, \d{1,2} [a-z]{3}) · \d{2}:\d{2}$/);
  assert.doesNotMatch(JSON.stringify(proximos), /em \d+ dias/);
});

test("virada de mês: data curta com dia da semana e mês", () => {
  // Arrange: última em 24 set → estimada para quinta, 1 out.
  const state = stateWithPen([injectionOn("2026-09-24")]);
  // Act
  const proximos = items(reminderCenter(state, now("13:00", "2026-09-29")), "proximos");
  // Assert
  assert.equal(proximos.at(-1)?.when, "Qui, 1 out · 08:30");
});

test("meia-noite: o jantar de hoje que dispara às 00:20 não se repete em Próximos", () => {
  // Arrange
  const state = centerState({ quietStart: "00:00", quietEnd: "00:00", dinnerTime: "23:50" });
  const late = now("23:55");
  assert.ok(
    planReminders(state, late).some(
      (r) => r.id === "2026-09-23:refeicao:Jantar" && r.date === TOMORROW,
    ),
  );
  // Act
  const center = reminderCenter(state, late);
  // Assert
  const dinner = items(center, "agora").find((c) => c.title === "Registrar jantar");
  assert.equal(dinner?.id, "2026-09-23:Jantar");
  assert.equal(dinner?.when, "Desde 23:50");
  assert.ok(!allCards(center).some((c) => c.id === "2026-09-23:refeicao:Jantar"));
});

test("depois da meia-noite: Hoje passa a ser o novo dia", () => {
  // Arrange
  const state = centerState({ quietStart: "00:00", quietEnd: "00:00", dinnerTime: "23:50" });
  // Act
  const center = reminderCenter(state, now("00:10", TOMORROW));
  // Assert
  assert.ok(items(center, "agora").every((c) => c.date === TOMORROW));
  assert.ok(items(center, "hoje").length > 0);
  assert.ok(items(center, "hoje").every((c) => c.date === TOMORROW && c.when.startsWith("Às ")));
  assert.equal(items(center, "hoje")[0].when, "Às 08:30");
  assert.deepEqual(
    [items(center, "proximos")[0].when, items(center, "proximos")[0].title],
    ["Amanhã · 00:20", "Registrar jantar"],
  );
});

test("atalhos não precisam marcar lido: concluir ou registrar tira o item de Agora", () => {
  // Arrange
  const state = centerState();
  const withLunch: AppState = {
    ...state,
    diary: [
      ...state.diary,
      entry({ id: "almoco1", type: "refeicao", time: "12:40", categoryTag: "Almoço", amountMl: undefined }),
    ],
  };
  // Act
  const afterHabit = items(reminderCenter(completeHabitOn(state, "h1", TODAY), now()), "agora");
  const afterLunch = items(reminderCenter(withLunch, now()), "agora");
  // Assert
  assert.ok(!afterHabit.some((c) => c.id === "2026-09-23:h1"));
  assert.ok(!afterLunch.some((c) => c.id === "2026-09-23:Almoço"));
});

test("Como ficaria hoje: agenda do dia inteiro mesmo com lembretes desligados", () => {
  // Arrange
  const state = centerState({ remindersEnabled: false });
  // Act
  const preview = reminderPreview(state, now());
  // Assert
  assert.deepEqual(
    preview.chips.map((c) => `${c.time} ${c.label}`),
    [
      "09:00 Água",
      "09:00 Medidas",
      "12:00 Caminhar 20 minutos",
      "12:30 Almoço",
      "15:00 Água",
      "19:30 Jantar",
      "21:00 Água",
      "21:30 Chá calmante",
    ],
  );
  assert.equal(preview.quiet, "Silêncio 22:00–07:00");
  assert.equal(reminderCenter(state, now()).enabled, false);
});

test("prévia: sem perfil, sem silêncio, título longo cortado e dia sem lembretes", () => {
  // Arrange
  const base = centerState({ remindersEnabled: false, quietStart: "00:00", quietEnd: "00:00" });
  const longTitle: AppState = {
    ...base,
    habits: [
      { ...base.habits[0], title: "Preparar a marmita do almoço de amanhã" },
    ],
  };
  const empty: AppState = {
    ...centerState({ remindersEnabled: false, manualWater: null, eatingDisorder: "sim" }),
    habits: [],
    diary: ["Café da manhã", "Almoço", "Jantar"].map((categoryTag) =>
      entry({ id: categoryTag, type: "refeicao", categoryTag, amountMl: undefined }),
    ),
  };
  // Act
  const noProfile = reminderPreview({ ...base, profile: null }, now());
  const clipped = reminderPreview(longTitle, now()).chips.find((c) => c.type === "habito");
  const none = reminderPreview(empty, now());
  // Assert
  assert.deepEqual(noProfile, { chips: [], quiet: null });
  assert.equal(reminderPreview(base, now()).quiet, null);
  assert.equal(clipped?.label, "Preparar a marmita do al…");
  assert.deepEqual(none.chips, []);
  assert.equal(REMINDER_COPY.previewEmpty, "Com a sua rotina de hoje, não haveria lembretes.");
});

test("reminderSubject iguala o aviso devido e o planejado", () => {
  const table: [string, ReminderType, string][] = [
    ["2026-09-23:agua:agua1:1", "agua", "agua"],
    ["2026-09-23:agua:540", "agua", "agua"],
    ["2026-09-23:Almoço", "refeicao", "refeicao:Almoço"],
    ["2026-09-23:refeicao:Almoço", "refeicao", "refeicao:Almoço"],
    ["2026-09-23:h1", "habito", "habito:h1"],
    ["2026-09-23:habito:h1", "habito", "habito:h1"],
    ["2026-09-23:medicao", "medicao", "medicao"],
    ["2026-09-23:injecao", "injecao", "injecao"],
  ];
  for (const [id, type, subject] of table)
    assert.equal(reminderSubject({ id, type }), subject, id);
});

test("markRemindersRead soma sem repetir e não altera o original", () => {
  // Arrange
  const state = { ...centerState(), readNotifications: ["a"] };
  const before = JSON.stringify(state);
  // Act
  const next = markRemindersRead(state, ["a", "b", "b"]);
  // Assert
  assert.deepEqual(next.readNotifications, ["a", "b"]);
  assert.equal(JSON.stringify(state), before);
});

test("completeHabitOn e reopenHabitOn são idempotentes e ignoram combinado inexistente", () => {
  // Arrange
  const state = centerState();
  const before = JSON.stringify(state);
  // Act
  const done = completeHabitOn(state, "h1", TODAY);
  const doneTwice = completeHabitOn(done, "h1", TODAY);
  const reopened = reopenHabitOn(done, "h1", TODAY);
  const reopenedTwice = reopenHabitOn(reopened, "h1", TODAY);
  // Assert
  assert.deepEqual(done.habits[0].completedDates, [TODAY]);
  assert.deepEqual(doneTwice.habits[0].completedDates, [TODAY]);
  assert.deepEqual(done.habits[1], state.habits[1]);
  assert.deepEqual(reopened.habits[0].completedDates, []);
  assert.deepEqual(reopenedTwice, reopened);
  assert.equal(completeHabitOn(state, "nao-existe", TODAY), state);
  assert.equal(reopenHabitOn(state, "h1", TODAY), state);
  assert.equal(JSON.stringify(state), before);
});

test("puro: reminderCenter e reminderPreview não alteram o estado", () => {
  // Arrange
  const state = stateWithPen([injectionOn(shiftDate(TODAY, -3))]);
  const before = JSON.stringify(state);
  // Act
  reminderCenter(state, now());
  reminderPreview(state, now());
  // Assert
  assert.equal(JSON.stringify(state), before);
});

test("ocultar calorias ou não: nenhum número de calorias e nenhum texto de cobrança", () => {
  for (const hideCalories of [true, false]) {
    // Arrange
    const state = stateWithPen([injectionOn(shiftDate(TODAY, -7))], { hideCalories });
    // Act
    const text = JSON.stringify([
      reminderCenter(state, now()),
      reminderPreview({ ...state, profile: { ...state.profile!, remindersEnabled: false } }, now()),
    ]);
    // Assert
    assert.doesNotMatch(text, /kcal|caloria/i, `hideCalories=${hideCalories}`);
    assert.doesNotMatch(text, /atrasad|perdid|esquec|falt(ou|a )/i, `hideCalories=${hideCalories}`);
  }
});

test("constantes: tom por tipo, ordem de desempate e aviso por plataforma", () => {
  assert.deepEqual(REMINDER_TONE, {
    agua: "water",
    refeicao: "food",
    habito: "habit",
    medicao: "body",
    injecao: "medication",
    despensa: "food",
  });
  assert.deepEqual([...REMINDER_TYPE_ORDER], ["injecao", "refeicao", "habito", "agua", "medicao", "despensa"]);
  assert.match(reminderNotice("native"), /mesmo com o app fechado/);
  assert.match(reminderNotice("web"), /aberto no navegador/);
  assert.doesNotMatch(reminderNotice("native"), /com o aplicativo aberto/);
  assert.equal(REMINDER_COPY.markRead("Atualizar medidas"), "Marcar como lido: Atualizar medidas");
});
