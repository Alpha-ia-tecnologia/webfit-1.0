import { useCallback, useMemo, useRef } from "react";
import type { PlannedItem } from "@shared/lib/agent-blocks";
import { isSensitive } from "@shared/lib/day";
import { mealCategoryOf } from "@shared/lib/diary-day";
import {
  nextPlannedMeal,
  sanitizeDietPlan,
  type DietMeal,
  type DietPlanV2,
  type NextPlannedMeal,
} from "@shared/lib/diet-plan";
import { planAnchor, planForDay, planMealAction, PLAN_DAY_COPY, type DayPlan } from "@shared/lib/diet-week";
import { localDate, localTime, uid } from "@shared/lib/domain";
import { mealEntry } from "@shared/lib/meals";
import { bodyNumbers } from "@shared/lib/space";
import { maskStructured } from "@shared/lib/structured";
import { plannedPreset, resolvePlanned } from "@shared/lib/taco-match";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";

/**
 * "Conferir e registrar": abre Registrar refeição de hoje com os itens encontrados na TACO já no
 * prato e o aviso do que ficou de fora. Nunca registra sozinho: a pessoa confere e salva.
 */
export function usePlannedMealRegister(): (category: string, itens: readonly PlannedItem[]) => void {
  const { state, setDate, editMeal } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  return useCallback(
    (category: string, itens: readonly PlannedItem[]) => {
      setDate(localDate());
      editMeal(null, plannedPreset(category, resolvePlanned(itens, { allergyDetails })));
    },
    [allergyDetails, setDate, editMeal],
  );
}

/** Hora atual (HH:MM) pelo relógio do app, que se atualiza a cada 30 s. */
export function useMinuteClock(): string {
  const { clock } = useApp();
  return localTime(clock);
}

/** Próxima refeição do plano ainda sem registro hoje (nunca "atrasada"); null sem horários. */
export function useNextPlannedMeal(plan: DietPlanV2 | null | undefined): NextPlannedMeal | null {
  const { state, clock } = useApp();
  if (!plan) return null;
  const today = localDate(clock);
  const logged = state.diary
    .filter((e) => e.date === today && e.type === "refeicao")
    .map(mealCategoryOf);
  return nextPlannedMeal(plan, localTime(clock), logged);
}

/**
 * Plano estruturado pronto para a tela (dieta e Hoje), como o useStructuredPlan do web: sem gramas em
 * perfil sensível e com as calorias (e, com "Ocultar números do corpo", peso e medidas citados pelo
 * agente) mascaradas uma vez, em texto puro.
 */
export function useStructuredPlan(): DietPlanV2 | null {
  const { state } = useApp();
  const plan = state.dietPlan?.structured;
  const profile = state.profile;
  const sensitive = profile ? isSensitive(profile) : false;
  const hide = profile?.hideCalories ?? true;
  const hideBody = profile ? bodyNumbers(profile, localDate()) === "hidden" : false;
  return useMemo(
    () =>
      plan
        ? maskStructured(sanitizeDietPlan(plan, { sensitive }), hide, { plain: true, hideBodyNumbers: hideBody })
        : null,
    [plan, sensitive, hide, hideBody],
  );
}

/**
 * O plano de um dia da semana do plano (IA-X5): as trocas revisadas giram a partir do dia em que o
 * plano foi criado (dia 0 = o plano como foi revisado). `extra` avança refeições tocadas em "Trocar".
 */
export function usePlanDay(date: string, extra?: Readonly<Record<number, number>>): DayPlan | null {
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

/** O plano de hoje (com a variação do dia), para a próxima refeição na Dieta e no Hoje. */
export function useTodayPlan(): DietPlanV2 | null {
  const { clock } = useApp();
  return usePlanDay(localDate(clock))?.plan ?? null;
}

/**
 * "Comi esta" (AGENTE-09): com todo item na TACO e nenhum alérgeno declarado, registra hoje e agora
 * com "Desfazer"; senão abre Registrar refeição com o prato e o aviso (a pessoa confere e salva).
 * Trava contra toque duplo por refeição: o botão só some depois da gravação, e o segundo toque no
 * mesmo instante não registra a refeição de novo.
 */
export function usePlanMealEat(): (meal: DietMeal) => Promise<void> {
  const { state, commit, notify, setDate, editMeal } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  const userId = state.userId;
  const pending = useRef(new Set<string>());
  return useCallback(
    async (meal: DietMeal) => {
      if (pending.current.has(meal.slot)) return;
      pending.current.add(meal.slot);
      try {
        const action = planMealAction(meal, { allergyDetails });
        const today = localDate();
        if (action.kind === "review") {
          setDate(today);
          editMeal(null, action.preset);
          return;
        }
        const time = localTime();
        const id = uid();
        const result = mealEntry({
          id,
          userId,
          date: today,
          time,
          category: action.category,
          items: action.items,
          now: new Date().toISOString(),
          today,
        });
        if (!result.success) {
          notify("Não foi possível salvar o registro.", "warning");
          return;
        }
        const saved = await commit(
          (s) => ({ ...s, diary: [...s.diary, result.entry] }),
          PLAN_DAY_COPY.logged(meal.slot, time),
          {
            label: "Desfazer",
            onAction: () =>
              void commit((s) => ({ ...s, diary: s.diary.filter((d) => d.id !== id) }), "Registro desfeito."),
          },
        );
        if (saved) successHaptic();
      } finally {
        pending.current.delete(meal.slot);
      }
    },
    [allergyDetails, userId, commit, notify, setDate, editMeal],
  );
}
