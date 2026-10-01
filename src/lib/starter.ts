import { z } from "zod";
import { HABIT_SUGGESTIONS } from "../data/habit-suggestions";
import { diarySchema, habitSchema, type AppState, type DiaryEntry } from "../types";
import { emptyDraft } from "./domain";

export const STARTER_GOALS = [
  ["perder", "Emagrecer e criar hábitos"],
  ["organizar", "Organizar minha alimentação e rotina"],
  ["manter", "Manter meu peso e meus hábitos"],
  ["ganhar", "Ganhar peso ou massa com acompanhamento"],
] as const;

export const starterInputSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(100),
  goal: z.enum(["perder", "organizar", "manter", "ganhar"], {
    error: "Escolha seu objetivo.",
  }),
  consentLocal: z.literal(true, {
    error: "Autorize o armazenamento para começar.",
  }),
  habitIndex: z
    .number()
    .int()
    .min(0)
    .max(HABIT_SUGGESTIONS.length - 1)
    .nullable(),
});
export type StarterInput = z.infer<typeof starterInputSchema>;

export function isStarterState(state: AppState): boolean {
  return (
    !state.profile &&
    state.draft?.starterMode === true &&
    state.draft.consentLocal === true
  );
}

/** Guarda só as respostas fornecidas; saúde e biometria continuam sem resposta. */
export function startWithHabits(
  state: AppState,
  input: StarterInput,
  date: string,
  habitId: string,
): AppState {
  if (state.profile) throw new Error("O cadastro já foi concluído.");
  const valid = starterInputSchema.parse(input);
  const next: AppState = {
    ...state,
    draft: {
      ...emptyDraft(),
      ...state.draft,
      name: valid.name,
      goal: valid.goal,
      consentLocal: true,
      consentAi: false,
      starterMode: true,
    },
  };
  return valid.habitIndex === null
    ? next
    : addStarterHabit(next, valid.habitIndex, date, habitId);
}

export function addStarterHabit(
  state: AppState,
  index: number,
  date: string,
  id: string,
): AppState {
  if (!isStarterState(state))
    throw new Error("Comece pelos combinados.");
  const suggestion = HABIT_SUGGESTIONS[index];
  if (!suggestion) throw new Error("Escolha um dos combinados sugeridos.");
  if (state.habits.some((habit) => habit.title === suggestion.title))
    return state;
  const habit = habitSchema.parse({
    id,
    ...suggestion,
    createdDate: date,
    completedDates: [],
  });
  return { ...state, habits: [...state.habits, habit] };
}

export function toggleStarterHabit(
  state: AppState,
  id: string,
  date: string,
): AppState {
  if (!isStarterState(state))
    throw new Error("Comece pelos combinados.");
  return {
    ...state,
    habits: state.habits.map((habit) =>
      habit.id !== id
        ? habit
        : {
            ...habit,
            completedDates: habit.completedDates.includes(date)
              ? habit.completedDates.filter((day) => day !== date)
              : [...habit.completedDates, date],
          },
    ),
  };
}

/** Registro do que a pessoa bebeu; não define nem sugere meta de líquidos. */
export function recordStarterWater(
  state: AppState,
  date: string,
  time: string,
  timestamp: string,
  id: string,
): AppState {
  if (!isStarterState(state))
    throw new Error("Comece pelos combinados.");
  const entry = diarySchema.parse({
    id,
    userId: state.userId,
    date,
    time,
    createdAt: timestamp,
    updatedAt: timestamp,
    type: "agua",
    title: "Água",
    description: "Registro rápido: 250 ml",
    amountMl: 250,
  });
  return { ...state, diary: [...state.diary, entry] };
}

export const STARTER_CUP_ML = 250;
export const STARTER_CUPS_SHOWN = 8;

/** Copos do que já foi bebido (nunca copos vazios: sem meta implícita); além de 8, "+n". */
export function starterCups(totalMl: number): { full: number; more: number } {
  const cups = Math.max(0, Math.floor(totalMl / STARTER_CUP_ML));
  return {
    full: Math.min(cups, STARTER_CUPS_SHOWN),
    more: Math.max(0, cups - STARTER_CUPS_SHOWN),
  };
}

/** O que a anamnese libera (chips neutros do "O próximo passo, no seu tempo"). */
export const STARTER_UNLOCKS = [
  "Plano alimentar com o agente",
  "Diário de refeições",
  "Lembretes no seu ritmo",
  "Acompanhamento da evolução",
] as const;

/** Remove um registro de água do primeiro acesso; outro tipo ou id desconhecido: nada muda. */
export function removeStarterWater(state: AppState, id: string): AppState {
  if (!isStarterState(state)) throw new Error("Comece pelos combinados.");
  if (!state.diary.some((entry) => entry.id === id && entry.type === "agua"))
    return state;
  return { ...state, diary: state.diary.filter((entry) => entry.id !== id) };
}

/** "Desfazer" da remoção: devolve o registro de água uma vez só (idempotente). */
export function restoreStarterWater(state: AppState, entry: DiaryEntry): AppState {
  if (!isStarterState(state)) throw new Error("Comece pelos combinados.");
  if (entry.type !== "agua" || state.diary.some((item) => item.id === entry.id))
    return state;
  return { ...state, diary: [...state.diary, diarySchema.parse(entry)] };
}
