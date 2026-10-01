import { useEffect, useMemo, useState } from "react";
import type { PlannedItem } from "../lib/agent-blocks";
import { useApp } from "../lib/context";
import { localDate, localTime } from "../lib/dates";
import { isSensitive } from "../lib/day";
import { mealCategoryOf } from "../lib/diary-day";
import {
  nextPlannedMeal,
  sanitizeDietPlan,
  type DietMeal,
  type DietPlanV2,
  type NextPlannedMeal,
} from "../lib/diet-plan";
import {
  planAnchor,
  planForDay,
  planMealAction,
  planWeek,
  PLAN_DAY_COPY,
  type DayPlan,
  type WeekDay,
} from "../lib/diet-week";
import { uid } from "../lib/domain";
import { mealEntry } from "../lib/meals";
import { maskStructured } from "../lib/structured";
import { plannedPreset, resolvePlanned, type ResolvedItem } from "../lib/taco-match";
import { useBodyNumbersHidden } from "./useBodyNumbersHidden";

const MINUTE_MS = 60_000;

/**
 * "Conferir e registrar" (chat, dieta e Hoje): abre Registrar refeição de hoje com os itens
 * encontrados na TACO já no prato. Nunca registra sozinho: a pessoa confere e toca em Salvar.
 */
export function usePlannedMealRegister(): (category: string, itens: readonly PlannedItem[]) => void {
  const { state, setDate, editMeal } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return (category, itens) => {
    setDate(localDate());
    editMeal(null, plannedPreset(category, resolvePlanned(itens, { allergyDetails })));
  };
}

/** Itens sugeridos ligados à TACO (ok, sem correspondência ou alérgeno declarado). */
export function useResolvedPlanned(itens: readonly PlannedItem[]): ResolvedItem[] {
  const { state } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return useMemo(() => resolvePlanned(itens, { allergyDetails }), [itens, allergyDetails]);
}

/** Hora local (HH:MM), atualizada a cada minuto. */
export function useMinuteClock(): string {
  const [time, setTime] = useState(() => localTime());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(localTime()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

/**
 * Plano estruturado pronto para a tela (dieta e Hoje): sem gramas em perfil sensível e com as
 * calorias (e, com "Ocultar números do corpo", peso e medidas) mascaradas uma vez, em texto puro,
 * para rótulos, nomes acessíveis e avisos.
 */
export function useStructuredPlan(): DietPlanV2 | null {
  const { state } = useApp();
  const plan = state.dietPlan?.structured;
  const profile = state.profile;
  const sensitive = profile ? isSensitive(profile) : false;
  const hide = profile?.hideCalories ?? true;
  const hideBody = useBodyNumbersHidden();
  return useMemo(
    () =>
      plan
        ? maskStructured(sanitizeDietPlan(plan, { sensitive }), hide, {
            plain: true,
            hideBodyNumbers: hideBody,
          })
        : null,
    [plan, sensitive, hide, hideBody],
  );
}

/** Próxima refeição do plano agora, descontando as categorias já registradas hoje. */
export function useNextPlannedMeal(plan: DietPlanV2 | null | undefined): NextPlannedMeal | null {
  const { state } = useApp();
  const now = useMinuteClock();
  const today = localDate();
  if (!plan) return null;
  const logged = state.diary
    .filter((entry) => entry.date === today && entry.type === "refeicao")
    .map(mealCategoryOf);
  return nextPlannedMeal(plan, now, logged);
}

/** Sem trocas extras ("Trocar"): referência estável para a memória do dia. */
const NO_EXTRA: Readonly<Record<number, number>> = {};

/**
 * Um dia do plano (IA-X5): a visão pronta para a tela (sem gramas no perfil sensível, calorias
 * mascaradas) com a rotação das trocas revisadas a partir do dia de criação do plano. `extra`
 * avança refeições pelo "Trocar" (só em memória). Sem plano estruturado → null.
 */
export function usePlanDay(
  date: string,
  extra: Readonly<Record<number, number>> = NO_EXTRA,
): DayPlan | null {
  const { state } = useApp();
  const view = useStructuredPlan();
  const createdAt = state.dietPlan?.createdAt;
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return useMemo(
    () =>
      view && createdAt
        ? planForDay(view, { anchor: planAnchor(createdAt), date, allergyDetails, extra })
        : null,
    [view, createdAt, date, allergyDetails, extra],
  );
}

/** Plano de hoje com a rotação da semana: "Do seu plano" no Hoje e a próxima refeição da dieta. */
export function useTodayPlan(): DietPlanV2 | null {
  return usePlanDay(localDate())?.plan ?? null;
}

/** Os 7 dias (seg a dom) da semana de `today`, com o ponto dos dias que usam trocas. */
export function usePlanWeek(today: string): WeekDay[] {
  const { state } = useApp();
  const view = useStructuredPlan();
  const createdAt = state.dietPlan?.createdAt;
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return useMemo(
    () =>
      view && createdAt
        ? planWeek(view, { anchor: planAnchor(createdAt), today, allergyDetails })
        : [],
    [view, createdAt, today, allergyDetails],
  );
}

/**
 * "Comi esta" (AGENTE-09): com todo item na TACO e nenhum alérgeno declarado, registra hoje e
 * agora com "Desfazer"; senão abre Registrar refeição com o prato e o aviso (nada é salvo).
 */
export function usePlanMealEat(): (meal: DietMeal) => Promise<boolean> {
  const { state, commit, notify, setDate, editMeal } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return async (meal) => {
    const action = planMealAction(meal, { allergyDetails });
    const today = localDate();
    if (action.kind === "review") {
      setDate(today);
      editMeal(null, action.preset);
      return false;
    }
    const time = localTime();
    const id = uid();
    const result = mealEntry({
      id,
      userId: state.userId,
      date: today,
      time,
      category: action.category,
      items: action.items,
      now: new Date().toISOString(),
      today,
    });
    if (!result.success) {
      notify("Não foi possível registrar esta refeição.", "warning");
      return false;
    }
    return commit(
      (s) => ({ ...s, diary: [...s.diary, result.entry] }),
      PLAN_DAY_COPY.logged(meal.slot, time),
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) => ({ ...s, diary: s.diary.filter((entry) => entry.id !== id) }),
            "Registro desfeito.",
          ),
      },
    );
  };
}
