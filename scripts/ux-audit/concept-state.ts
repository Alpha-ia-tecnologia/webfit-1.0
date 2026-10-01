// Estado sintético com os dados dos 11 conceitos da proposta visual (proposta/depois/*.webp), nos
// esquemas atuais: DietPlanV2, RecipeSet v2, despensa com validade, blocos do chat, exame
// estruturado, 8 pesagens semanais e 3 aplicações. Data fixa dos conceitos: quinta, 24 set 2026.
// Usado por scripts/ux-audit/capture-concepts.ts (capture.ts continua com o estado da Onda 1).
import foodsJson from "../../src/data/foods.json";
import { withFlowMarker } from "../../src/lib/anamnese-flow";
import { dietProfileSignature } from "../../src/lib/diet";
import { renderDietText } from "../../src/lib/diet-plan";
import { emptyDraft, initialState, mealTotals, shiftDate, uid } from "../../src/lib/domain";
import { renderExamText } from "../../src/lib/exam-result";
import { friendlyName } from "../../src/lib/food-search";
import { pantrySignature } from "../../src/lib/pantry";
import { renderRecipeSetText } from "../../src/lib/recipe-set";
import {
  profileSchema,
  stateSchema,
  type AppState,
  type DiaryEntry,
  type Draft,
  type FoodItem,
  type HabitItem,
  type InjectionEntry,
  type MealItem,
  type PantryItem,
  type Profile,
} from "../../src/types";
import { DIET, EXAM_PDF, EXAM_RESULT, META, messages, recipeSet } from "./concept-ai";
import { atConceptDay, CONCEPT_DAY, iso } from "./concept-clock";

export { CONCEPT_DAY } from "./concept-clock";

/** Início da jornada ("desde 6 ago"): primeira pesagem, metas e combinados. */
const JOURNEY_START = "2026-08-06";
/** Dia sem nenhum registro (domingo): o ponto vazio na faixa do Diário e o "6/7 dias" do agente. */
const BLANK_DAY = "2026-09-20";
/** Dias sem água registrada (além do dia em branco), para a consistência não ficar cheia. */
const NO_WATER_DAYS = new Set(["2026-09-05", "2026-09-13"]);

const FOODS = foodsJson as FoodItem[];

// ---------- Alimentos (TACO) ----------

const TACO = {
  paoIntegral: "taco-52",
  ovoCozido: "taco-488",
  cafe: "taco-471",
  mamao: "taco-225",
  iogurte: "taco-448",
  aveia: "taco-7",
  banana: "taco-182",
  arrozIntegral: "taco-1",
  arrozBranco: "taco-3",
  feijao: "taco-561",
  frangoGrelhado: "taco-410",
  frangoCozido: "taco-408",
  alface: "taco-78",
  tomate: "taco-157",
  batataDoce: "taco-88",
  omelete: "taco-484",
  saladaLegumes: "taco-546",
  brocolis: "taco-100",
  maca: "taco-222",
  queijoMinas: "taco-461",
} as const;

function food(id: string): FoodItem {
  const found = FOODS.find((f) => f.id === id);
  if (!found) throw new Error(`Alimento da TACO ausente: ${id}`);
  return { ...found };
}
const item = (id: string, grams: number): MealItem => ({ food: food(id), grams });

/** Refeições de sempre (≈ 1.600 kcal por dia). O arroz integral é sempre 4 colheres (100 g): é a
 *  porção que "Seus frequentes" sugere no Registro, como no conceito. */
const MEALS = {
  cafeA: () => [item(TACO.paoIntegral, 75), item(TACO.ovoCozido, 100), item(TACO.cafe, 50)],
  cafeB: () => [item(TACO.iogurte, 170), item(TACO.aveia, 30), item(TACO.banana, 70), item(TACO.cafe, 50)],
  lancheManha: () => [item(TACO.iogurte, 170), item(TACO.aveia, 15)],
  almoco: () => [
    item(TACO.arrozIntegral, 100),
    item(TACO.feijao, 100),
    item(TACO.frangoGrelhado, 150),
    item(TACO.batataDoce, 90),
    item(TACO.alface, 30),
    item(TACO.tomate, 45),
  ],
  lanche: () => [item(TACO.maca, 130), item(TACO.queijoMinas, 40)],
  jantarA: () => [item(TACO.omelete, 150), item(TACO.saladaLegumes, 150), item(TACO.arrozBranco, 90)],
  jantarB: () => [
    item(TACO.arrozIntegral, 100),
    item(TACO.frangoCozido, 150),
    item(TACO.brocolis, 100),
    item(TACO.feijao, 100),
  ],
};

// ---------- Perfil ----------

/** Respostas da anamnese com as escolhas do app (chips) e as metas manuais dos conceitos. */
function profileAnswers(): Record<string, unknown> {
  return {
    ...emptyDraft(),
    name: "Pessoa Teste",
    birthDate: "1992-06-15",
    sex: "feminino",
    goal: "perder",
    occupation: "Trabalho em escritório",
    routine: "Cozinho em casa, Passo muito tempo sentado(a)",
    weight: 72.4,
    height: 165,
    targetWeight: 66,
    waist: 83.1,
    hip: 99.2,
    bodyFat: null,
    measurementDate: CONCEPT_DAY,
    measurementMethod: "Balança em casa",
    pregnancy: "nao",
    eatingDisorder: "nao",
    fluidRestriction: "nao",
    conditions: "Nenhuma",
    medications: "Medicamento para emagrecer",
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro (tirzepatida)",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    penWeekday: 2,
    supplements: "Não uso suplementos",
    surgeries: "Nenhuma",
    familyHistory: "Prefiro não informar",
    allergies: "sim",
    allergyDetails: "Amendoim",
    diet: "Alimentação variada, sem restrições",
    avoidedFoods: "Camarão",
    favoriteFoods: "Arroz e feijão, Frango, Saladas e legumes",
    mealRoutine: "Café, almoço e jantar em horários fixos",
    mealsPerDay: 5,
    usualWater: 2000,
    digestiveSymptoms: "Nenhum",
    bowelHabit: "Regular, todos os dias",
    alcohol: "Raramente, em eventos",
    tobacco: "Não fumo",
    wakeTime: "06:45",
    breakfastTime: "07:30",
    lunchTime: "12:30",
    dinnerTime: "19:30",
    sleepTime: "23:00",
    sleepHours: 7,
    sleepQuality: "boa",
    stress: "moderado",
    activityLevel: "leve",
    exerciseType: "Caminhada",
    exerciseDays: 3,
    exerciseMinutes: 30,
    sedentaryHours: 8,
    motivation: "Ter mais saúde e disposição, Emagrecer",
    barriers: "Falta de tempo",
    foodBudget: "Moderado",
    cookingTime: "30 minutos por dia",
    professionalPlan: "Não tenho",
    manualCalories: 1645,
    manualWater: 2500,
    manualProtein: 115,
    manualCarbs: 175,
    manualFat: 45,
    consentLocal: true,
    consentAi: true,
    hideCalories: false,
    remindersEnabled: true,
  };
}
const conceptProfile = (): Profile => profileSchema.parse(profileAnswers());

// ---------- Diário ----------

type Base = Pick<DiaryEntry, "userId">;

function mealEntry(
  base: Base,
  date: string,
  time: string,
  category: string,
  items: MealItem[],
  exact?: Pick<DiaryEntry, "calories" | "macros">,
): DiaryEntry {
  return {
    ...base,
    id: uid(),
    date,
    time,
    createdAt: iso(date, time),
    updatedAt: iso(date, time),
    type: "refeicao",
    title: category,
    categoryTag: category,
    description: items.map((i) => `${friendlyName(i.food.name).label} (${i.grams} g)`).join(", "),
    items,
    ...mealTotals(items),
    ...exact,
  };
}

function waterEntry(base: Base, date: string, time: string, ml: number): DiaryEntry {
  return {
    ...base,
    id: uid(),
    date,
    time,
    createdAt: iso(date, time),
    updatedAt: iso(date, time),
    type: "agua",
    title: "Água",
    description: "",
    amountMl: ml,
  };
}

function moodEntry(base: Base, date: string, rating: number, sleepHours: number, note: string): DiaryEntry {
  return {
    ...base,
    id: uid(),
    date,
    time: "07:15",
    createdAt: iso(date, "07:15"),
    updatedAt: iso(date, "07:15"),
    type: "bem_estar",
    title: "Bem-estar",
    description: note,
    rating,
    sleepHours,
    ...(rating >= 4 ? { tags: ["Disposição"] } : {}),
  };
}

/** Sete semanas de rotina antes de hoje: café, almoço, lanche, jantar, água e bem-estar. */
function historyDay(base: Base, date: string, index: number): DiaryEntry[] {
  if (date === BLANK_DAY) return [];
  const entries = [
    mealEntry(base, date, index % 3 ? "08:05" : "08:15", "Café da manhã", index % 2 ? MEALS.cafeB() : MEALS.cafeA()),
    mealEntry(base, date, "12:30", "Almoço", MEALS.almoco()),
    mealEntry(base, date, "16:10", "Lanche", MEALS.lanche()),
    mealEntry(base, date, "19:40", "Jantar", index % 2 ? MEALS.jantarA() : MEALS.jantarB()),
  ];
  if (index % 2 === 0) entries.push(mealEntry(base, date, "10:15", "Lanche", MEALS.lancheManha()));
  if (!NO_WATER_DAYS.has(date))
    entries.push(waterEntry(base, date, "10:00", 1000), waterEntry(base, date, "15:00", 750 + (index % 4) * 250));
  if (index % 2 === 1)
    entries.push(moodEntry(base, date, 3 + (index % 3), 6.5 + (index % 3) * 0.5, "Dia produtivo."));
  return entries;
}

/** Hoje: café 08:10 e almoço 12:30 com os totais exatos dos conceitos (1.210 kcal · 82/95/28 g). */
function todayEntries(base: Base): DiaryEntry[] {
  return [
    moodEntry(base, CONCEPT_DAY, 4, 7.5, "Acordei disposta."),
    mealEntry(base, CONCEPT_DAY, "08:10", "Café da manhã", MEALS.cafeA(), {
      calories: 420,
      macros: { protein: 22, carbs: 48, fat: 14 },
    }),
    waterEntry(base, CONCEPT_DAY, "10:00", 750),
    mealEntry(base, CONCEPT_DAY, "12:30", "Almoço", MEALS.almoco(), {
      calories: 790,
      macros: { protein: 60, carbs: 47, fat: 14 },
    }),
    waterEntry(base, CONCEPT_DAY, "14:00", 1000),
  ];
}

function diary(base: Base): DiaryEntry[] {
  const days: DiaryEntry[] = [];
  for (let index = 0, date = JOURNEY_START; date < CONCEPT_DAY; index++, date = shiftDate(date, 1))
    days.push(...historyDay(base, date, index));
  return [...days, ...todayEntries(base)];
}

// ---------- Corpo, combinados e caneta ----------

/** 8 pesagens semanais (quintas): 76,4 → 72,4 kg; 10 set = 73,6; cintura −4,9 e quadril −2,8 cm. */
function measurements() {
  const weights = [76.4, 75.9, 75.1, 74.4, 74.1, 73.6, 73.1, 72.4];
  const waists = [88.0, 87.3, 86.6, 85.9, 85.1, 84.4, 83.8, 83.1];
  const hips = [102.0, 101.6, 101.2, 100.8, 100.4, 100.0, 99.6, 99.2];
  return weights.map((weight, i) => ({
    id: uid(),
    date: shiftDate(JOURNEY_START, i * 7),
    weight,
    height: 165,
    waist: waists[i]!,
    hip: hips[i]!,
    bodyFat: null,
    method: "Balança em casa",
  }));
}

/** Datas do período em que o combinado foi cumprido (índice do dia a partir do início da jornada). */
function completions(rule: (index: number) => boolean): string[] {
  const done: string[] = [];
  for (let index = 0, date = JOURNEY_START; date < CONCEPT_DAY; index++, date = shiftDate(date, 1))
    if (date !== BLANK_DAY && rule(index)) done.push(date);
  return done;
}

function habits(): HabitItem[] {
  return [
    {
      id: uid(),
      title: "Caminhada leve 20 min",
      timeOfDay: "07:30",
      createdDate: JOURNEY_START,
      completedDates: [...completions((i) => i % 4 !== 3), CONCEPT_DAY],
    },
    {
      id: uid(),
      title: "Almoço consciente sem telas",
      timeOfDay: "12:30",
      createdDate: JOURNEY_START,
      completedDates: completions((i) => i % 3 === 0),
    },
    {
      id: uid(),
      title: "Chá calmante e higiene do sono",
      timeOfDay: "21:30",
      createdDate: JOURNEY_START,
      completedDates: completions((i) => i % 2 === 0),
    },
  ];
}

/** Mounjaro 2,5 mg (frasco 5 mg/ml, 50 UI na seringa de 100): 8/09 braço esq., 15/09 coxa esq., 22/09 abdômen. */
function injections(base: Base): InjectionEntry[] {
  const doses: [string, InjectionEntry["site"], InjectionEntry["side"]][] = [
    ["2026-09-08", "braco", "esquerdo"],
    ["2026-09-15", "coxa", "esquerdo"],
    ["2026-09-22", "abdomen", null],
  ];
  return doses.map(([date, site, side]) => ({
    ...base,
    id: uid(),
    date,
    time: "08:30",
    createdAt: iso(date, "08:30"),
    updatedAt: iso(date, "08:30"),
    method: "frasco",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site,
    side,
    notes: "",
  }));
}

// ---------- Despensa, receitas e compras ----------

/** [nome, quantidade, unidade, local, dias até vencer] — a validade é relativa ao dia dos conceitos. */
const PANTRY: [string, number, PantryItem["unit"], PantryItem["location"], number][] = [
  ["Iogurte natural", 4, "un", "geladeira", -1],
  ["Espinafre", 1, "pacote", "geladeira", 2],
  ["Peito de frango", 400, "g", "geladeira", 3],
  ["Abobrinha", 1, "un", "geladeira", 5],
  ["Queijo branco", 250, "g", "geladeira", 6],
  ["Cenoura", 3, "un", "geladeira", 8],
  ["Ovos", 12, "un", "geladeira", 12],
  ["Aveia em flocos", 500, "g", "despensa", 92],
  ["Arroz integral", 1, "kg", "despensa", 122],
  ["Feijão carioca", 1, "kg", "despensa", 183],
];

function pantry(): PantryItem[] {
  return PANTRY.map(([name, quantity, unit, location, days]) => ({
    id: uid(),
    name,
    quantity,
    unit,
    location,
    expiresOn: shiftDate(CONCEPT_DAY, days),
    notes: "",
    source: "manual",
    updatedAt: iso(shiftDate(CONCEPT_DAY, -2), "19:00"),
  }));
}

const KITCHEN_BASICS = ["sal", "azeite", "alho", "limao", "pimenta"] as const;

function shoppingList() {
  const added = iso(CONCEPT_DAY, "09:40");
  return [
    { name: "Alecrim", quantity: "1 ramo", origin: "receita", note: "Receita: Frango ao forno com legumes" },
    { name: "Batata-doce", quantity: "500 g", origin: "dieta", note: "Jantar" },
    { name: "Tomate", quantity: "4 unidades", origin: "dieta", note: "Almoço" },
  ].map((entry) => ({
    id: uid(),
    ...entry,
    section: "hortifruti" as const,
    origin: entry.origin as "receita" | "dieta",
    checked: false,
    addedAt: added,
  }));
}

// ---------- Estados ----------

/** Estado principal (Hoje, Registro, Diário, Dieta, Agente, Despensa, Evolução, Seringa, Espaço). */
export function conceptState(): AppState {
  return atConceptDay(() => {
    const base = initialState();
    const userId = base.userId;
    const profile = conceptProfile();
    const signature = dietProfileSignature(profile);
    const dietAt = iso(CONCEPT_DAY, "07:05");
    const plan = {
      id: uid(),
      text: renderDietText(DIET),
      meta: META,
      createdAt: dietAt,
      profileSignature: signature,
      structured: DIET,
    };
    const items = pantry();
    const basics = [...KITCHEN_BASICS];
    const recipes = recipeSet(items);
    return stateSchema.parse({
      ...base,
      revision: 1,
      profile,
      diary: diary({ userId }),
      injections: injections({ userId }),
      measurements: measurements(),
      habits: habits(),
      messages: messages(plan.text, dietAt),
      dietPlan: plan,
      pantry: items,
      kitchenBasics: basics,
      recipes: [
        {
          id: uid(),
          text: renderRecipeSetText(recipes),
          meta: META,
          createdAt: iso(CONCEPT_DAY, "09:30"),
          dietPlanId: plan.id,
          profileSignature: signature,
          pantrySignature: pantrySignature(items, basics),
          recipeSet: recipes,
        },
      ],
      shoppingList: shoppingList(),
      exams: [
        {
          id: uid(),
          name: "Exames de rotina",
          date: "2026-09-10",
          fileName: "exames-setembro.pdf",
          mimeType: "application/pdf",
          data: EXAM_PDF,
          notes: "",
          analysis: renderExamText(EXAM_RESULT),
          analysisStructured: EXAM_RESULT,
        },
      ],
      appointments: [
        {
          id: uid(),
          professional: "Dra. Ana Souza (nutricionista)",
          registration: "CRN-3 12345",
          date: "2026-09-29",
          time: "15:00",
          url: "https://exemplo.com/consulta",
          notes: "Levar o diário da semana.",
        },
      ],
      // As metas valem desde o início da jornada (o Hoje e a Evolução leem o histórico).
      goalHistory: [{ date: JOURNEY_START, profile }],
      updatedAt: iso(CONCEPT_DAY, "14:00"),
    });
  });
}

/** Primeiro acesso com a anamnese em andamento, parada em `step` (0–7), sem perfil salvo. */
function draftState(answers: Draft, step: number): AppState {
  return stateSchema.parse({
    ...initialState(),
    revision: 1,
    draft: withFlowMarker(answers),
    draftStep: step,
  });
}

/** Respostas já dadas no meio da anamnese: etapas 1 a 3 e o começo do histórico de saúde. */
const ANSWERED_MID_FLOW = [
  "name", "birthDate", "sex", "goal", "occupation", "routine", "consentLocal",
  "pregnancy", "eatingDisorder", "fluidRestriction", "hideCalories",
  "weight", "height", "measurementDate", "measurementMethod", "waist", "hip",
  "medications", "weightLossPen", "weightLossPenName",
];

/** Anamnese no meio: ponto de partida respondido, dois diagnósticos marcados e "Sim" para a caneta. */
export function anamneseStepState(step: number): AppState {
  return atConceptDay(() => {
    const all = profileAnswers();
    const draft = Object.fromEntries(
      Object.entries(emptyDraft()).map(([key, value]) => [
        key,
        ANSWERED_MID_FLOW.includes(key) ? all[key] : value,
      ]),
    ) as Draft;
    return draftState({ ...draft, conditions: "Hipertensão, Gastrite ou refluxo" }, step);
  });
}

/** Anamnese completa na última etapa ("Seu plano inicial"), com as respostas do perfil dos conceitos. */
export function anamnesePlanState(): AppState {
  return atConceptDay(() => draftState(profileAnswers() as Draft, 7));
}
