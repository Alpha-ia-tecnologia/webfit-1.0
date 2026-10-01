import { useMemo } from "react";
import { Check } from "lucide-react";
import { allergenTokens } from "../../lib/allergens";
import { useApp } from "../../lib/context";
import type { DietMeal } from "../../lib/diet-plan";
import type { SwapMark } from "../../lib/diet-week";
import type { PlanMealHandlers } from "./MealActions";
import { PlanMealCard, type PlanCardState } from "./PlanMealCard";

/** Hoje: estado, registro, aviso do "Trocar" e ações de cada refeição (mesma ordem de `meals`). */
export interface TimelineToday {
  states: readonly PlanCardState[];
  registeredAt: readonly (string | null)[];
  statusText: readonly string[];
  handlers: (meal: DietMeal, index: number) => PlanMealHandlers;
  /** Minutos até a próxima (0 = agora). */
  minutesUntil: number | null;
}

/**
 * Linha do tempo do dia (fidelidade "Minha dieta"): trilho com o horário e o nó de cada refeição
 * (feita = check verde, próxima = ponto com halo, pendente = aro) e o cartão ao lado. Um <li> por
 * refeição, na ordem do plano. Sem `today` (prévia de outro dia ou plano antigo) tudo fica aberto,
 * sem ações.
 */
export function DietTimeline({
  meals,
  sensitive,
  calm,
  hideCalories,
  swaps,
  today,
}: {
  meals: readonly DietMeal[];
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  /** Trocas do dia mostrado, por refeição (mesma ordem de `meals`). */
  swaps?: readonly (readonly SwapMark[])[];
  today?: TimelineToday;
}) {
  const { state } = useApp();
  const allergyDetails = state.profile?.allergyDetails ?? "";
  const allergyTokens = useMemo(() => allergenTokens(allergyDetails), [allergyDetails]);
  const states: readonly PlanCardState[] = today?.states ?? meals.map(() => "preview");
  // O trilho fica verde até a última refeição feita (ou a próxima); depois, neutro.
  const lastActive = states.reduce(
    (last, current, index) => (current === "done" || current === "next" ? index : last),
    -1,
  );
  return (
    <ol className="diet-timeline" data-testid="diet-timeline">
      {meals.map((meal, index) => {
        const current = states[index] ?? "preview";
        return (
          <li
            key={`${meal.slot}-${index}`}
            className={`plan-step is-${current}${index < lastActive ? " has-active-line" : ""}`}
          >
            <div className="plan-rail">
              <span className="plan-rail-time">{meal.horario ?? "Livre"}</span>
              <span className="plan-rail-node" aria-hidden="true">
                {current === "done" && <Check size={13} strokeWidth={3.5} />}
              </span>
            </div>
            <PlanMealCard
              meal={meal}
              state={current}
              registeredAt={today?.registeredAt[index] ?? null}
              sensitive={sensitive}
              calm={calm}
              hideCalories={hideCalories}
              marks={swaps?.[index] ?? []}
              allergyTokens={allergyTokens}
              minutesUntil={current === "next" ? today?.minutesUntil : null}
              statusText={today?.statusText[index]}
              handlers={today ? today.handlers(meal, index) : undefined}
            />
          </li>
        );
      })}
    </ol>
  );
}
