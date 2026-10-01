import { withMeasurements } from "../src/lib/domain";
import { mealEntry } from "../src/lib/meals";
import { TACO_FOODS } from "../src/lib/taco-match";
import type {
  AppState,
  Appointment,
  DiaryEntry,
  Exam,
  InjectionEntry,
  Measurement,
} from "../src/types";
import { stateFixture } from "./fixtures";
import { EXAM_RESULT } from "./structured-fixtures";

/**
 * Estado de exemplo do "Relatório para consulta" e da "Qualidade do dia" (O4-L4), com T =
 * 2026-09-28: pesagens dentro e fora dos 30 dias, almoço com 4 grupos, água, uma aplicação de
 * caneta, um laudo com perguntas, bem-estar e uma consulta marcada.
 */
export const T = "2026-09-28";

export function tacoFood(id: string) {
  const food = TACO_FOODS.find((f) => f.id === id);
  if (!food) throw new Error(`Alimento ${id} não está na TACO`);
  return food;
}

/** Refeição válida (mealEntry calcula totais e macros), 100 g de cada alimento. */
export function meal(
  date: string,
  ids: readonly string[],
  category = "Almoço",
  time = "12:00",
): DiaryEntry {
  const result = mealEntry({
    id: `${date}-${category}-${ids.join("-")}`,
    userId: "u",
    date,
    time,
    category,
    items: ids.map((id) => ({ food: tacoFood(id), grams: 100 })),
    now: `${date}T${time}:00.000Z`,
    today: date,
  });
  if (!result.success) throw new Error(result.reason);
  return result.entry;
}

const entry = (date: string, over: Partial<DiaryEntry>): DiaryEntry => ({
  id: `${date}-${over.type}-${over.amountMl ?? over.rating ?? ""}`,
  userId: "u",
  date,
  time: "10:00",
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  type: "agua",
  title: "Água",
  description: "",
  ...over,
});
export const water = (date: string, amountMl: number) =>
  entry(date, { type: "agua", amountMl });
export const wellbeing = (
  date: string,
  rating: number,
  sleepHours: number,
  tags: string[],
) =>
  entry(date, {
    type: "bem_estar",
    title: "Bem-estar",
    rating,
    sleepHours,
    tags,
  });

export const weighIn = (date: string, weight: number): Measurement => ({
  id: `m-${date}`,
  date,
  weight,
  height: 165,
  waist: null,
  hip: null,
  bodyFat: null,
  method: "Balança em casa",
});

export const PEN_INJECTION: InjectionEntry = {
  id: "inj-1",
  userId: "u",
  date: "2026-09-20",
  time: "08:00",
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
  method: "caneta",
  medication: "Tirzepatida",
  concentrationMgPerMl: null,
  syringeUnits: null,
  units: null,
  volumeMl: null,
  doseMg: 5,
  site: "abdomen",
  side: "esquerdo",
  notes: "",
};

export const LAB_EXAM: Exam = {
  id: "exam-1",
  name: "Exames de sangue",
  date: "2026-09-10",
  fileName: "laudo.pdf",
  mimeType: "application/pdf",
  data: "data:application/pdf;base64,AAAA",
  notes: "Coleta em jejum.",
  analysisStructured: EXAM_RESULT,
  questionsDone: [0],
};

export const appointment = (
  date: string,
  professional: string,
  registration: string,
): Appointment => ({
  id: `a-${date}`,
  professional,
  registration,
  date,
  time: "10:00",
  url: "https://example.com/consulta",
  notes: "",
});

export function reportState(): AppState {
  const base = withMeasurements(
    stateFixture(),
    [
      weighIn("2026-08-03", 76.4),
      weighIn("2026-08-24", 75.1),
      weighIn("2026-09-07", 74.0),
      weighIn("2026-09-21", 73.0),
      weighIn("2026-09-28", 72.4),
    ],
    T,
  );
  return {
    ...base,
    profile: base.profile ? { ...base.profile, targetWeight: 66 } : null,
    diary: [
      meal("2026-09-27", ["taco-3", "taco-561", "taco-78", "taco-410"]),
      water("2026-09-27", 1500),
      wellbeing("2026-09-26", 4, 7, ["Disposição"]),
    ],
    injections: [PEN_INJECTION],
    exams: [LAB_EXAM],
    appointments: [appointment("2026-10-02", "Dra. Ana Lima", "CRN 1234")],
  };
}

/** Troca campos do perfil do estado (o perfil existe em todo fixture daqui). */
export function withProfile(
  state: AppState,
  patch: Partial<NonNullable<AppState["profile"]>>,
): AppState {
  if (!state.profile) throw new Error("Estado sem perfil");
  return { ...state, profile: { ...state.profile, ...patch } };
}
