import { AI_CONSENT_VERSION } from "./consent";
import { isCalmOn } from "./day";
import {
  profileSchema,
  type AppState,
  type Profile,
  type Goals,
  type GoalStrategy,
  type MealItem,
  type DiaryEntry,
  type NotificationItem,
} from "../types";
import { localDate, localTime, shiftDate } from "./dates";
import { fmtNumber } from "./format";
import {
  INJECTION_REMINDER_BODY,
  INJECTION_REMINDER_TITLE,
  lastInjection,
  nextDoseEstimate,
  tracksDoseSchedule,
} from "./treatment";
import { expiringSoon, USE_FIRST_KEY, USE_FIRST_REMINDER, USE_FIRST_TIME } from "./use-first";

export { localDate, localTime, shiftDate };
export function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
export function ageAt(birthDate: string, date = localDate()) {
  let age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (date.slice(5) < birthDate.slice(5)) age--;
  return age;
}
export const uid = () => crypto.randomUUID();
export const round = (n: number) => Math.round(n * 10) / 10;
export const activityFactors = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};
/** Regras das metas automáticas; valores informados pela pessoa sempre prevalecem. */
export const GOAL_RULES = {
  /** Déficit diário padrão para perda de peso. */
  standardDeficit: 500,
  /** Superávit moderado para ganho de peso. */
  surplus: 300,
  /** Piso calórico sem acompanhamento individual. */
  calorieFloor: { feminino: 1200, masculino: 1500 },
  /** Proteína por kg: base para manutenção; alta para perda ou ganho. */
  proteinPerKg: { base: 1.2, high: 1.6 },
  /** Teto da proteína como fração das calorias. */
  proteinMaxShare: 0.35,
  /** Fração das calorias vinda de gorduras. */
  fatShare: 0.3,
} as const;
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
/** Tolerância entre a soma dos macros e a meta calórica (exportada para o editor de metas da anamnese). */
export const MACRO_TOLERANCE = 1.05;
const fmtKcal = (n: number) => n.toLocaleString("pt-BR");

/** Campos que as metas automáticas leem; o rascunho da anamnese também os fornece. */
export type GoalProfile = Pick<
  Profile,
  | "birthDate"
  | "sex"
  | "pregnancy"
  | "eatingDisorder"
  | "conditions"
  | "weight"
  | "height"
  | "activityLevel"
  | "goal"
  | "manualCalories"
  | "manualWater"
  | "manualProtein"
  | "manualCarbs"
  | "manualFat"
>;
/** Entrada do filtro de cuidado: strings, para servir ao perfil e ao rascunho. */
export interface CareInput {
  birthDate: string;
  sex: string;
  pregnancy: string;
  eatingDisorder: string;
  conditions: string;
}
const NO_CONDITIONS =
  /^(nenhum[ao]?s?|n[aã]o|sem doen[çc]as|sem condi[çc][oõ]es)[.!]?$/i;
/** Respostas que pedem avaliação individual antes de estimar metas; data de nascimento ausente conta como menor de idade. */
export function needsIndividualCare(
  p: CareInput,
  date = localDate(),
): boolean {
  const age = /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)
    ? ageAt(p.birthDate, date)
    : Number.NaN;
  return (
    !(age >= 18) ||
    p.pregnancy !== "nao" ||
    p.eatingDisorder !== "nao" ||
    p.sex === "nao_informado" ||
    !NO_CONDITIONS.test(p.conditions.trim())
  );
}

interface CaloriePlan {
  calories: number | null;
  strategy: GoalStrategy;
  source: string;
  note: string | null;
}
/** Meta calórica automática a partir do gasto estimado e do objetivo. Medicamentos não alteram metas. */
function caloriePlan(
  profile: GoalProfile,
  expenditure: number | null,
): CaloriePlan {
  if (expenditure === null)
    return {
      calories: null,
      strategy: null,
      source: "Meta calórica não definida",
      note: null,
    };
  const floor =
    profile.sex === "masculino"
      ? GOAL_RULES.calorieFloor.masculino
      : GOAL_RULES.calorieFloor.feminino;
  const floorText = `${fmtKcal(floor)} kcal`;
  const maintenance = (note: string | null): CaloriePlan => ({
    calories: expenditure,
    strategy: "manutencao",
    source: "Estimativa de manutenção",
    note,
  });
  if (profile.goal === "manter" || profile.goal === "organizar")
    return maintenance(null);
  if (profile.goal === "ganhar")
    return {
      calories: expenditure + GOAL_RULES.surplus,
      strategy: "superavit",
      source: "Estimativa com superávit moderado para ganho de peso",
      note: `Superávit de ${GOAL_RULES.surplus} kcal/dia sobre o gasto estimado.`,
    };
  if (expenditure <= floor)
    return maintenance(
      `Seu gasto estimado já está no piso de ${floorText}; sem acompanhamento individual não aplicamos déficit.`,
    );
  const deficit = GOAL_RULES.standardDeficit;
  const calories = Math.max(floor, expenditure - deficit);
  const applied = expenditure - calories;
  const floorNote =
    applied < deficit ? `, limitado pelo piso de ${floorText}` : "";
  return {
    calories,
    strategy: "deficit",
    source: "Estimativa com déficit moderado para perda de peso",
    note: `Déficit de ${fmtKcal(applied)} kcal/dia sobre o gasto estimado${floorNote}.`,
  };
}

interface MacroPlan {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}
/** Macros a partir das calorias: proteína por kg (com teto), gorduras por fração, carboidratos pelo restante. */
function macroPlan(profile: GoalProfile, calories: number | null): MacroPlan {
  if (calories === null)
    return {
      protein: profile.manualProtein,
      carbs: profile.manualCarbs,
      fat: profile.manualFat,
    };
  const perKg =
    profile.goal === "perder" || profile.goal === "ganhar"
      ? GOAL_RULES.proteinPerKg.high
      : GOAL_RULES.proteinPerKg.base;
  const proteinCap = Math.floor(
    (calories * GOAL_RULES.proteinMaxShare) / KCAL_PER_G.protein,
  );
  // Macros automáticos nunca ultrapassam o que sobra das calorias depois dos valores manuais.
  const proteinBudget =
    profile.manualFat === null
      ? Infinity
      : Math.max(
          0,
          Math.floor(
            (calories - profile.manualFat * KCAL_PER_G.fat) /
              KCAL_PER_G.protein,
          ),
        );
  const protein =
    profile.manualProtein ??
    Math.min(Math.round(perKg * profile.weight), proteinCap, proteinBudget);
  const fatShare = GOAL_RULES.fatShare;
  const fatBudget = Math.max(
    0,
    Math.floor((calories - protein * KCAL_PER_G.protein) / KCAL_PER_G.fat),
  );
  const fat =
    profile.manualFat ??
    Math.min(Math.round((calories * fatShare) / KCAL_PER_G.fat), fatBudget);
  const carbs =
    profile.manualCarbs ??
    Math.max(
      0,
      Math.round(
        (calories - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) /
          KCAL_PER_G.carbs,
      ),
    );
  return { protein, carbs, fat };
}

export function goalsFor(profile: GoalProfile, date = localDate()): Goals {
  const age = ageAt(profile.birthDate, date);
  const restricted = needsIndividualCare(profile, date);
  const basal = restricted
    ? null
    : Math.round(
        10 * profile.weight +
          6.25 * profile.height -
          5 * age +
          (profile.sex === "masculino" ? 5 : -161),
      );
  const expenditure =
    basal === null
      ? null
      : Math.round(basal * activityFactors[profile.activityLevel]);
  const plan = caloriePlan(profile, expenditure);
  const isManual = profile.manualCalories !== null;
  const calories = profile.manualCalories ?? plan.calories;
  const macros = macroPlan(profile, calories);
  const macroKcal =
    (macros.protein ?? 0) * KCAL_PER_G.protein +
    (macros.carbs ?? 0) * KCAL_PER_G.carbs +
    (macros.fat ?? 0) * KCAL_PER_G.fat;
  const mismatch =
    calories !== null && macroKcal > calories * MACRO_TOLERANCE
      ? `As metas manuais de macronutrientes somam cerca de ${fmtKcal(macroKcal)} kcal, acima da meta calórica de ${fmtKcal(calories)} kcal; ajuste uma delas.`
      : null;
  const note = [isManual ? null : plan.note, mismatch]
    .filter(Boolean)
    .join(" ");
  return {
    basal,
    expenditure,
    calories,
    water: profile.manualWater,
    ...macros,
    source: isManual ? "Meta informada por você" : plan.source,
    strategy: isManual ? "manual" : plan.strategy,
    note: note || null,
    reason: restricted
      ? "As respostas pedem avaliação individual antes de estimar metas. Você pode acompanhar seus registros e informar metas orientadas por um profissional."
      : null,
  };
}
export function profileForDate(state: AppState, date: string) {
  return (
    [...state.goalHistory]
      .sort((a, b) => b.date.localeCompare(a.date))
      .find((h) => h.date <= date)?.profile ?? state.profile
  );
}
export function goalsForDate(state: AppState, date: string): Goals {
  const snapshot = [...state.goalHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((h) => h.date <= date);
  return snapshot
    ? goalsFor(snapshot.profile, date)
    : {
        basal: null,
        expenditure: null,
        calories: null,
        water: null,
        protein: null,
        carbs: null,
        fat: null,
        source: "Sem metas registradas nesta data",
        reason: null,
        strategy: null,
        note: null,
      };
}
export interface DailyTarget extends Goals {
  /** Meta calórica registrada para o dia (automática ou manual). */
  baseCalories: number | null;
  /** Mantido por compatibilidade; o consumo registrado não altera a meta. */
  adjustment: number;
  /** Mantido por compatibilidade; não há compensação entre dias. */
  adjustmentNote: string | null;
}
/**
 * Usa a meta vigente na data, preservando calorias e macros informados.
 * O diário pode estar incompleto e não serve de base para compensar calorias em outro dia.
 */
export function dailyTargets(state: AppState, date: string): DailyTarget {
  const goals = goalsForDate(state, date);
  return {
    ...goals,
    baseCalories: goals.calories,
    adjustment: 0,
    adjustmentNote: null,
  };
}
export function totalsFor(entries: DiaryEntry[], date: string) {
  return entries
    .filter((e) => e.date === date)
    .reduce(
      (a, e) => ({
        calories: a.calories + (e.calories ?? 0),
        water: a.water + (e.amountMl ?? 0),
        protein: round(a.protein + (e.macros?.protein ?? 0)),
        carbs: round(a.carbs + (e.macros?.carbs ?? 0)),
        fat: round(a.fat + (e.macros?.fat ?? 0)),
        meals: a.meals + Number(e.type === "refeicao"),
      }),
      { calories: 0, water: 0, protein: 0, carbs: 0, fat: 0, meals: 0 },
    );
}
export function mealTotals(items: MealItem[]) {
  return {
    calories: Math.round(
      items.reduce((a, i) => a + (i.food.caloriesPer100g * i.grams) / 100, 0),
    ),
    macros: {
      protein: round(
        items.reduce((a, i) => a + (i.food.proteinPer100g * i.grams) / 100, 0),
      ),
      carbs: round(
        items.reduce((a, i) => a + (i.food.carbsPer100g * i.grams) / 100, 0),
      ),
      fat: round(
        items.reduce((a, i) => a + (i.food.fatPer100g * i.grams) / 100, 0),
      ),
    },
  };
}
export function initialState(): AppState {
  return {
    version: 1,
    revision: 0,
    userId: uid(),
    profile: null,
    draft: null,
    draftStep: 0,
    diary: [],
    savedMeals: [],
    injections: [],
    measurements: [],
    habits: [],
    messages: [],
    dietPlan: null,
    pantry: [],
    recipes: [],
    kitchenBasics: [],
    shoppingList: [],
    treatmentStock: null,
    foods: [],
    exams: [],
    appointments: [],
    readNotifications: [],
    goalHistory: [],
    serverSync: false,
    accountBound: false,
    updatedAt: new Date().toISOString(),
  };
}
export function emptyDraft() {
  return {
    name: "",
    birthDate: "",
    sex: "",
    occupation: "",
    routine: "",
    weight: "",
    height: "",
    targetWeight: "",
    waist: "",
    hip: "",
    bodyFat: "",
    measurementDate: localDate(),
    measurementMethod: "",
    conditions: "",
    medications: "",
    weightLossPen: "",
    weightLossPenName: "",
    weightLossPenDose: "",
    weightLossPenPerMonth: "",
    penWeekday: "",
    supplements: "",
    surgeries: "",
    familyHistory: "",
    pregnancy: "",
    fluidRestriction: "",
    eatingDisorder: "",
    allergies: "",
    allergyDetails: "",
    diet: "",
    avoidedFoods: "",
    favoriteFoods: "",
    mealRoutine: "",
    mealsPerDay: "",
    usualWater: "",
    digestiveSymptoms: "",
    bowelHabit: "",
    alcohol: "",
    tobacco: "",
    sleepHours: "",
    sleepQuality: "",
    stress: "",
    activityLevel: "",
    exerciseType: "",
    exerciseDays: "",
    exerciseMinutes: "",
    sedentaryHours: "",
    wakeTime: "",
    sleepTime: "",
    goal: "",
    motivation: "",
    barriers: "",
    foodBudget: "",
    cookingTime: "",
    professionalPlan: "",
    manualCalories: "",
    manualWater: "",
    manualProtein: "",
    manualCarbs: "",
    manualFat: "",
    consentLocal: false,
    consentAi: false,
    aiConsentVersion: AI_CONSENT_VERSION,
    hideCalories: false,
    remindersEnabled: false,
    quietStart: "22:00",
    quietEnd: "07:00",
    hydrationInterval: 120,
    breakfastTime: "08:00",
    lunchTime: "12:00",
    dinnerTime: "19:00",
  };
}
export function updateProfile(state: AppState, input: Profile): AppState {
  // A ordem do Hoje não é resposta da anamnese: um rascunho antigo não desfaz o "Editar Hoje".
  const profile = profileSchema.parse({
    ...input,
    homeLayout: state.profile?.homeLayout ?? input.homeLayout,
    // Preferência do Meu espaço, não resposta da anamnese: um rascunho antigo não a desfaz.
    hideBodyNumbers: state.profile?.hideBodyNumbers ?? input.hideBodyNumbers,
  });
  const date = localDate();
  const measurement = {
    id: uid(),
    date: profile.measurementDate,
    weight: profile.weight,
    height: profile.height,
    waist: profile.waist,
    hip: profile.hip,
    bodyFat: profile.bodyFat,
    method: profile.measurementMethod,
  };
  const measurements = [
    ...state.measurements.filter((m) => m.date !== measurement.date),
    measurement,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const latest = measurements.at(-1)!;
  const current = {
    ...profile,
    weight: latest.weight,
    height: latest.height,
    waist: latest.waist,
    hip: latest.hip,
    bodyFat: latest.bodyFat,
    measurementDate: latest.date,
    measurementMethod: latest.method,
  };
  return {
    ...state,
    profile: current,
    draft: null,
    draftStep: 0,
    measurements,
    goalHistory: [
      ...state.goalHistory.filter((h) => h.date !== date),
      { date, profile: current },
    ],
  };
}
export function isQuiet(time: string, start: string, end: string) {
  return start === end
    ? false
    : start < end
      ? time >= start && time < end
      : time >= start || time < end;
}
export function notificationsFor(
  state: AppState,
  now = new Date(),
): NotificationItem[] {
  const p = state.profile;
  if (!p?.remindersEnabled) return [];
  const date = localDate(now),
    clock = localTime(now);
  if (isQuiet(clock, p.quietStart, p.quietEnd)) return [];
  const totals = totalsFor(state.diary, date);
  const list: NotificationItem[] = [];
  const add = (
    key: string,
    title: string,
    description: string,
    type: NotificationItem["type"],
    time: string,
  ) => {
    const id = `${date}:${key}`;
    list.push({
      id,
      title,
      description,
      type,
      time,
      read: state.readNotifications.includes(id),
    });
  };
  const last = state.diary
    .filter((e) => e.type === "agua" && e.date === date)
    .sort((a, b) => b.time.localeCompare(a.time))[0];
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const elapsed = minutes(clock) - minutes(last?.time ?? p.wakeTime);
  if (
    p.manualWater &&
    totals.water < p.manualWater &&
    elapsed >= p.hydrationInterval
  )
    add(
      `agua:${last?.id ?? "inicio"}:${Math.floor(elapsed / p.hydrationInterval)}`,
      "Pausa para hidratação",
      `${fmtNumber(totals.water)} ml registrados. Sua meta informada é ${fmtNumber(p.manualWater)} ml.`,
      "agua",
      clock,
    );
  for (const [category, time] of [
    ["Café da manhã", p.breakfastTime],
    ["Almoço", p.lunchTime],
    ["Jantar", p.dinnerTime],
  ])
    if (
      clock >= time &&
      !state.diary.some((e) => e.date === date && e.categoryTag === category)
    )
      add(
        category,
        `Registrar ${category.toLowerCase()}`,
        "Se já fez essa refeição, registre os alimentos no diário.",
        "refeicao",
        time,
      );
  for (const h of state.habits)
    if (
      h.createdDate <= date &&
      clock >= h.timeOfDay &&
      !h.completedDates.includes(date)
    )
      add(
        h.id,
        h.title,
        "Seu combinado está disponível para marcar como concluído.",
        "habito",
        h.timeOfDay,
      );
  // Sem convite a registrar peso em perfil calmo (transtorno alimentar, gestação ou menor de idade).
  if (
    !isCalmOn(p, date) &&
    !state.measurements.some((m) => m.date >= shiftDate(date, -7))
  )
    add(
      "medicao",
      "Atualizar medidas",
      "Seu histórico não tem uma medição nos últimos sete dias.",
      "medicao",
      clock,
    );
  // AGENTE-13: a partir das 10:00, se algo da despensa vence nos próximos dias ("confira antes de usar").
  if (clock >= USE_FIRST_TIME && expiringSoon(state.pantry, date).length)
    add(USE_FIRST_KEY, USE_FIRST_REMINDER.title, USE_FIRST_REMINDER.body, "despensa", USE_FIRST_TIME);
  // NOTIF-02: só no dia estimado da próxima aplicação, depois do horário da última; sem cobrança diária depois.
  if (tracksDoseSchedule(p)) {
    const next = nextDoseEstimate(state.injections, date, p.weightLossPenPerMonth);
    const lastDose = lastInjection(state.injections, date);
    if (next?.daysUntil === 0 && lastDose && clock >= lastDose.time)
      add(
        "injecao",
        INJECTION_REMINDER_TITLE,
        INJECTION_REMINDER_BODY,
        "injecao",
        lastDose.time,
      );
  }
  return list;
}
/** Pedido de resumo mantido para compatibilidade; o fluxo após a anamnese usa DIET_PLAN_REQUEST. */
export const ANAMNESIS_SUMMARY_REQUEST =
  "Acabei de concluir minha anamnese. Faça um resumo da minha condição atual com base nas respostas: o que está bem, pontos de atenção e três prioridades práticas para os próximos dias. Sem diagnóstico e sem prescrição.";
export function agentContext(state: AppState, date = localDate()) {
  if (!state.profile) throw new Error("Conclua a anamnese primeiro.");
  /* eslint-disable @typescript-eslint/no-unused-vars -- nome e consentimentos ficam fora do contexto enviado à IA */
  const {
    name,
    birthDate,
    consentAi,
    aiConsentVersion,
    consentLocal,
    ...answers
  } = state.profile;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return {
    date,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    age: ageAt(birthDate, date),
    anamnese: answers,
    goals: dailyTargets(state, date),
    totals: totalsFor(state.diary, date),
    diary: state.diary
      .filter((e) => e.date >= shiftDate(date, -6) && e.date <= date)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- foto e usuário ficam fora do contexto da IA
      .map(({ imageUrl, userId, ...entry }) => entry),
    injections: state.injections
      .filter((e) => e.date >= shiftDate(date, -29) && e.date <= date)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- usuário fica fora do contexto da IA
      .map(({ userId, ...entry }) => entry),
    measurements: state.measurements
      .filter((m) => m.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
    habits: state.habits
      .filter((h) => h.createdDate <= date)
      .map((h) => ({
        ...h,
        completedDates: h.completedDates.filter((d) => d <= date),
      })),
    exams: state.exams
      .filter((exam) => exam.date <= date)
      .map(({ name, date, notes }) => ({ name, date, notes })),
    // O dia da aplicação é opcional ("Varia"): nulo não é informação faltando.
    missingInformation: Object.entries(answers)
      .filter(
        ([k, v]) =>
          k !== "penWeekday" &&
          (v === null ||
            (typeof v === "string" &&
              /n[aã]o sei|prefiro|nao_informado|nao_sei/i.test(v))),
      )
      .map(([k]) => k),
  };
}

/** Troca as medições, atualiza o perfil pela mais recente e registra as metas do dia (excluir, substituir ou desfazer). */
export function withMeasurements(
  state: AppState,
  measurements: AppState["measurements"],
  date = localDate(),
): AppState {
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last || !state.profile) return { ...state, measurements: sorted };
  const profile = {
    ...state.profile,
    weight: last.weight,
    height: last.height,
    waist: last.waist,
    hip: last.hip,
    bodyFat: last.bodyFat,
    measurementDate: last.date,
    measurementMethod: last.method,
  };
  return {
    ...state,
    measurements: sorted,
    profile,
    goalHistory: [
      ...state.goalHistory.filter((h) => h.date !== date),
      { date, profile },
    ],
  };
}

/** Metas que a pessoa informa fora da anamnese (folha "Ajustar metas" do Meu espaço). */
export type ManualGoals = Pick<
  Profile,
  "manualCalories" | "manualWater" | "manualProtein" | "manualCarbs" | "manualFat"
>;

/**
 * Troca metas manuais do perfil (null volta ao automático) e registra as metas do dia, como a
 * anamnese e as medições fazem. Medições, rascunho e demais respostas ficam como estão.
 */
export function withManualGoals(
  state: AppState,
  goals: Partial<ManualGoals>,
  date = localDate(),
): AppState {
  if (!state.profile) return state;
  const parsed = profileSchema.safeParse({ ...state.profile, ...goals });
  if (!parsed.success)
    throw new Error("Confira os valores das metas e tente de novo.");
  const profile = parsed.data;
  return {
    ...state,
    profile,
    goalHistory: [
      ...state.goalHistory.filter((h) => h.date !== date),
      { date, profile },
    ],
  };
}
