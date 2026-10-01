import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isQuiet,
  localDate,
  notificationsFor,
  shiftDate,
} from "../src/lib/domain";
import {
  planReminders,
  reminderSignature,
  REMINDER_LIMITS,
} from "../src/lib/reminder-plan";
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
const now = (time = "06:00", date = TODAY) => new Date(`${date}T${time}:00`);
const stateForReminders = (): AppState => {
  const state = stateFixture();
  state.profile = { ...state.profile!, remindersEnabled: true };
  state.measurements = [];
  return state;
};
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

test("sem perfil ou com lembretes desativados a agenda fica vazia", () => {
  const state = stateForReminders();
  assert.deepEqual(planReminders({ ...state, profile: null }, now()), []);
  state.profile!.remindersEnabled = false;
  assert.deepEqual(planReminders(state, now()), []);
});

test("agenda só contém horários futuros dos próximos sete dias, sem alterar o estado", () => {
  const state = stateForReminders();
  const before = JSON.stringify(state);
  const clock = now("12:30");
  const reminders = planReminders(state, clock);
  assert.ok(reminders.length > 0);
  assert.ok(reminders.every((item) => item.fireAt > clock.getTime()));
  assert.ok(
    reminders.every(
      (item) => item.date >= TODAY && item.date <= shiftDate(TODAY, 6),
    ),
  );
  assert.ok(
    !reminders.some(
      (item) => item.date === TODAY && item.title === "Registrar almoço",
    ),
  );
  assert.ok(
    reminders.some(
      (item) => item.date === TOMORROW && item.title === "Registrar almoço",
    ),
  );
  assert.equal(JSON.stringify(state), before);
  assert.equal(
    new Set(reminders.map((item) => item.id)).size,
    reminders.length,
  );
});

test("silêncio noturno e diurno são respeitados em todos os tipos", () => {
  for (const [quietStart, quietEnd] of [
    ["22:00", "07:00"],
    ["08:00", "20:00"],
  ]) {
    const state = stateForReminders();
    state.profile = {
      ...state.profile!,
      quietStart,
      quietEnd,
      breakfastTime: "05:00",
      dinnerTime: "22:30",
    };
    state.habits = [
      {
        id: "h",
        title: "Organizar o dia",
        timeOfDay: "06:00",
        createdDate: TODAY,
        completedDates: [],
      },
    ];
    const reminders = planReminders(state, now("00:00"));
    assert.ok(reminders.length > 0);
    assert.ok(
      reminders.every((item) => !isQuiet(item.time, quietStart, quietEnd)),
    );
  }
});

test("uma refeição registrada cancela só a respectiva categoria e data", () => {
  const state = stateForReminders();
  state.diary = [
    entry({ type: "refeicao", categoryTag: "Almoço", amountMl: undefined }),
  ];
  const reminders = planReminders(state, now());
  const mealsToday = reminders.filter(
    (item) => item.type === "refeicao" && item.date === TODAY,
  );
  assert.deepEqual(
    mealsToday.map((item) => item.title),
    ["Registrar café da manhã", "Registrar jantar"],
  );
  assert.ok(
    reminders.some(
      (item) => item.date === TOMORROW && item.title === "Registrar almoço",
    ),
  );
  // Um registro de água com a mesma categoria ou uma refeição sem categoria não comprovam o almoço.
  state.diary = [
    entry({ categoryTag: "Almoço" }),
    entry({ type: "refeicao", categoryTag: undefined, amountMl: undefined }),
  ];
  assert.ok(
    planReminders(state, now()).some(
      (item) => item.date === TODAY && item.title === "Registrar almoço",
    ),
  );
});

test("completar hábito hoje mantém amanhã, e hábitos futuros só começam na data de criação", () => {
  const state = stateForReminders();
  state.habits = [
    {
      id: "h",
      title: "Caminhar",
      timeOfDay: "17:00",
      createdDate: TODAY,
      completedDates: [TODAY],
    },
    {
      id: "f",
      title: "Planejar refeições",
      timeOfDay: "18:00",
      createdDate: TOMORROW,
      completedDates: [],
    },
  ];
  const reminders = planReminders(state, now());
  assert.ok(
    !reminders.some((item) => item.type === "habito" && item.date === TODAY),
  );
  assert.equal(
    reminders.filter((item) => item.type === "habito" && item.date === TOMORROW)
      .length,
    2,
  );
});

test("meta de água atingida cancela hidratação do dia e não afeta amanhã", () => {
  const state = stateForReminders();
  state.diary = [
    entry({ amountMl: 1000 }),
    entry({ id: "segunda", amountMl: 1000 }),
  ];
  let reminders = planReminders(state, now());
  assert.ok(
    !reminders.some((item) => item.type === "agua" && item.date === TODAY),
  );
  assert.ok(
    reminders.some((item) => item.type === "agua" && item.date === TOMORROW),
  );
  state.diary = [
    entry({ date: shiftDate(TODAY, -1), amountMl: 2000 }),
    entry({ amountMl: 500 }),
  ];
  reminders = planReminders(state, now());
  assert.ok(
    reminders.some((item) => item.type === "agua" && item.date === TODAY),
  );
  state.profile!.manualWater = null;
  assert.ok(!planReminders(state, now()).some((item) => item.type === "agua"));
});

test("há até três pausas de água por dia, em horários estáveis ao reabrir", () => {
  const state = stateForReminders();
  state.profile!.hydrationInterval = 30;
  const early = planReminders(state, now());
  const later = planReminders(state, now("14:00"));
  for (let day = 0; day < REMINDER_LIMITS.horizonDays; day += 1) {
    const date = shiftDate(TODAY, day);
    assert.ok(
      early.filter((item) => item.type === "agua" && item.date === date)
        .length <= 3,
    );
  }
  const earlyWater = new Set(
    early.filter((item) => item.type === "agua").map((item) => item.id),
  );
  assert.ok(
    later
      .filter((item) => item.type === "agua")
      .every((item) => earlyWater.has(item.id)),
  );
});

test("agenda respeita o limite global mesmo com muitos hábitos", () => {
  const state = stateForReminders();
  state.habits = Array.from({ length: 100 }, (_, index) => ({
    id: `h-${index}`,
    title: `Hábito ${index}`,
    timeOfDay: "10:00",
    createdDate: TODAY,
    completedDates: [],
  }));
  const reminders = planReminders(state, now());
  assert.equal(reminders.length, REMINDER_LIMITS.total);
  assert.ok(
    reminders.every(
      (item, index) =>
        index === 0 || item.fireAt >= reminders[index - 1].fireAt,
    ),
  );
});

test("refeição próxima da meia-noite agenda o dia seguinte sem antecipar o aviso", () => {
  const state = stateForReminders();
  state.profile = {
    ...state.profile!,
    quietStart: "00:00",
    quietEnd: "00:00",
    dinnerTime: "23:50",
  };
  const reminder = planReminders(state, now("23:55")).find(
    (item) => item.title === "Registrar jantar",
  );
  assert.equal(reminder?.date, TOMORROW);
  assert.equal(reminder?.time, "00:20");
  assert.equal(localDate(new Date(reminder!.fireAt)), TOMORROW);
});

test("medição recente adia o único aviso até completar sete dias", () => {
  const state = stateForReminders();
  state.measurements = [
    { ...stateFixture().measurements[0], date: shiftDate(TODAY, -4) },
  ];
  const measurements = planReminders(state, now()).filter(
    (item) => item.type === "medicao",
  );
  assert.equal(measurements.length, 1);
  assert.equal(measurements[0].date, shiftDate(TODAY, 3));
});

test("perfil sensível não recebe lembrete nem aviso para registrar medidas", () => {
  for (const change of [
    { eatingDisorder: "sim" },
    { eatingDisorder: "nao_informado" },
    { pregnancy: "gestacao" },
  ] as const) {
    const state = stateForReminders();
    Object.assign(state.profile!, change);
    assert.equal(
      planReminders(state, now()).filter((item) => item.type === "medicao")
        .length,
      0,
      JSON.stringify(change),
    );
    assert.equal(
      notificationsFor(state, now()).filter((item) => item.type === "medicao")
        .length,
      0,
      JSON.stringify(change),
    );
  }
  const reminder = planReminders(stateForReminders(), now()).find(
    (item) => item.type === "medicao",
  );
  assert.ok(reminder);
  assert.doesNotMatch(reminder.body, /peso/i);
});

test("assinatura acompanha conclusão, água, preferências e virada de dia sem mudar por detalhes irrelevantes", () => {
  const state = stateForReminders();
  const initial = reminderSignature(state, now());
  state.profile!.name = "Outro nome";
  assert.equal(reminderSignature(state, now()), initial);
  assert.equal(reminderSignature(state, now("06:01")), initial);
  state.diary = [entry({ amountMl: 2000 })];
  assert.notEqual(reminderSignature(state, now()), initial);
  state.diary = [];
  state.profile!.dinnerTime = "20:00";
  assert.notEqual(reminderSignature(state, now()), initial);
  state.profile!.dinnerTime = "19:00";
  assert.notEqual(reminderSignature(state, now("06:00", TOMORROW)), initial);
  const newDay = planReminders(state, now("06:00", TOMORROW));
  assert.ok(newDay.some((item) => item.date === shiftDate(TOMORROW, 6)));
});

/* NOTIF-02: lembrete do dia estimado da aplicação (caneta semanal, gestação respondida com "não"). */
const INJECTION_TITLE = "Dia da aplicação (estimado)";
const injection = (daysAgo: number, time = "08:30"): InjectionEntry =>
  injectionSchema.parse({
    id: `inj-${daysAgo}`,
    userId: "u1",
    date: shiftDate(TODAY, -daysAgo),
    time,
    createdAt: `${TODAY}T10:00:00.000Z`,
    updatedAt: `${TODAY}T10:00:00.000Z`,
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
): AppState => {
  const state = stateForReminders();
  state.profile = {
    ...state.profile!,
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    pregnancy: "nao",
    ...over,
  };
  state.injections = injections;
  return state;
};
const injectionReminders = (state: AppState, clock = now()) =>
  planReminders(state, clock).filter((item) => item.type === "injecao");

test("lembrete da aplicação: um só, no dia estimado e no horário da última aplicação", () => {
  const last = injection(3);
  const reminders = injectionReminders(stateWithPen([injection(10), last]));
  const date = shiftDate(last.date, 7);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].date, date);
  assert.equal(reminders[0].time, "08:30");
  assert.equal(reminders[0].id, `${date}:injecao`);
  assert.equal(reminders[0].title, INJECTION_TITLE);
  assert.equal(
    reminders[0].body,
    "Pela frequência informada, a próxima aplicação é estimada para hoje. Se já aplicou, registre no app.",
  );
});

test("lembrete da aplicação: silêncio adia para o fim dele, data passada não agenda e o limite o preserva", () => {
  const quiet = injectionReminders(
    stateWithPen([injection(3)], { quietStart: "22:00", quietEnd: "09:00" }),
  );
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].time, "09:00");
  assert.equal(injectionReminders(stateWithPen([injection(10)])).length, 0);
  const busy = stateWithPen([injection(3)]);
  busy.habits = Array.from({ length: 10 }, (_, index) => ({
    id: `h-${index}`,
    title: `Combinado ${index}`,
    timeOfDay: "10:00",
    createdDate: TODAY,
    completedDates: [],
  }));
  const all = planReminders(busy, now());
  assert.equal(all.length, REMINDER_LIMITS.total);
  assert.equal(all.filter((item) => item.type === "injecao").length, 1);
  assert.ok(all.every((item, i) => i === 0 || item.fireAt >= all[i - 1].fireAt));
});

test("sem lembrete da aplicação na gestação, amamentação, sem caneta declarada ou sem histórico", () => {
  for (const over of [
    { pregnancy: "gestacao" },
    { pregnancy: "amamentacao" },
    { pregnancy: "nao_informado" },
    { weightLossPen: "nao" },
  ] as const)
    assert.equal(
      injectionReminders(stateWithPen([injection(3)], over)).length,
      0,
      JSON.stringify(over),
    );
  assert.equal(injectionReminders(stateWithPen([])).length, 0);
});

test("texto do lembrete não revela medicamento nem dose na tela bloqueada", () => {
  const [reminder] = injectionReminders(stateWithPen([injection(3)]));
  assert.ok(reminder);
  assert.doesNotMatch(
    `${reminder.title} ${reminder.body}`,
    /mg|Semaglutida|Tirzepatida|Mounjaro/i,
  );
});

test("aviso no app: só no dia estimado, depois do horário da última aplicação", () => {
  const state = stateWithPen([injection(7)]);
  const at = (time: string, date = TODAY) =>
    notificationsFor(state, now(time, date)).filter((n) => n.type === "injecao");
  assert.equal(at("08:00").length, 0);
  const [item] = at("09:00");
  assert.equal(item.id, `${TODAY}:injecao`);
  assert.equal(item.title, INJECTION_TITLE);
  assert.equal(item.time, "08:30");
  assert.equal(item.read, false);
  assert.equal(at("09:00", TOMORROW).length, 0);
  state.readNotifications = [`${TODAY}:injecao`];
  assert.equal(at("09:00")[0].read, true);
  assert.equal(
    notificationsFor(stateWithPen([injection(7)], { pregnancy: "gestacao" }), now("09:00"))
      .filter((n) => n.type === "injecao").length,
    0,
  );
});

test("menor de idade (perfil calmo) não recebe lembrete nem aviso para registrar medidas", () => {
  const state = stateForReminders();
  state.profile!.birthDate = "2010-05-01";
  assert.equal(planReminders(state, now()).filter((item) => item.type === "medicao").length, 0);
  assert.equal(notificationsFor(state, now()).filter((item) => item.type === "medicao").length, 0);
});
