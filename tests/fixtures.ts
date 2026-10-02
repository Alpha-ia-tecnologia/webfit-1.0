import {
  emptyDraft,
  initialState,
  localDate,
  updateProfile,
} from "../src/lib/domain";
import { profileToDraft } from "../src/components/anamnese/condition-choice";
import { profileSchema, type Draft, type Profile } from "../src/types";
export function profileFixture() {
  return profileSchema.parse({
    ...emptyDraft(),
    name: "Pessoa Teste",
    birthDate: "1992-06-15",
    sex: "feminino",
    occupation: "Trabalho em escritório",
    routine: "Trabalho durante o dia e cozinho em casa.",
    weight: 72,
    height: 165,
    measurementDate: localDate(),
    measurementMethod: "Balança em casa",
    // Perfil atual: "Nenhuma" marcada na lista fechada. Perfis antigos (só texto livre) são
    // montados nos testes com `conditionTags: []`.
    conditionTags: ["nenhuma"],
    conditions: "Nenhuma",
    medications: "Não",
    weightLossPen: "nao",
    supplements: "Não",
    surgeries: "Não",
    familyHistory: "Prefiro não informar",
    pregnancy: "nao",
    fluidRestriction: "nao",
    eatingDisorder: "nao",
    allergies: "sim",
    allergyDetails: "Amendoim",
    diet: "Alimentação variada",
    avoidedFoods: "Camarão",
    favoriteFoods: "Arroz e feijão",
    mealRoutine: "Café às 8h, almoço às 12h e jantar às 19h.",
    mealsPerDay: 3,
    digestiveSymptoms: "Não",
    bowelHabit: "Regular",
    alcohol: "Não",
    tobacco: "Não",
    sleepHours: 7,
    sleepQuality: "boa",
    stress: "moderado",
    activityLevel: "leve",
    exerciseType: "Caminhada",
    exerciseDays: 3,
    exerciseMinutes: 30,
    sedentaryHours: 8,
    wakeTime: "07:00",
    sleepTime: "23:00",
    goal: "manter",
    motivation: "Organizar minha rotina",
    barriers: "Tempo para cozinhar",
    foodBudget: "Orçamento semanal planejado",
    cookingTime: "30 minutos por dia",
    professionalPlan: "Não tenho",
    manualWater: 2000,
    manualCalories: 1800,
    consentLocal: true,
    consentAi: false,
  });
}
/** Perfil como rascunho da anamnese (condições em texto "a,b", como o rascunho guarda). */
export function draftFixture(changes: Partial<Profile> = {}): Draft {
  return profileToDraft({ ...profileFixture(), ...changes });
}
/**
 * Estado de teste com a anamnese pronta. O comentário automático do dia fica desligado para que
 * os cenários com IA simulada não mandem um pedido extra ao abrir o Hoje (ia-proativa.spec.ts o liga).
 */
export function stateFixture() {
  return { ...updateProfile(initialState(), profileFixture()), aiDailyComment: false };
}

/**
 * Troca globais do ambiente (navigator, localStorage, indexedDB, document, ...) durante `run` e
 * devolve o valor anterior depois, mesmo se `run` for assíncrono ou lançar. Usado para testar
 * módulos de src/lib que dependem de APIs de navegador sem precisar de um DOM real.
 */
export function withGlobals<T>(
  overrides: Record<string, unknown>,
  run: () => T,
): T {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: overrides[key],
      configurable: true,
      writable: true,
    });
  }
  const restore = () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
  let result: T;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) {
    return result.then(
      (value) => {
        restore();
        return value;
      },
      (error) => {
        restore();
        throw error;
      },
    ) as T;
  }
  restore();
  return result;
}
