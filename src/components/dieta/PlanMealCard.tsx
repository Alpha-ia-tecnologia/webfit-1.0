import { useState } from "react";
import {
  Apple,
  Check,
  Coffee,
  Cookie,
  Moon,
  MoonStar,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { SLOT_LABEL, type DietMeal, type DietSlot } from "../../lib/diet-plan";
import {
  macroGramsLabel,
  macroGramsText,
  mealEstimateText,
  PLAN_DAY_COPY,
  type PlanMealState,
  type SwapMark,
} from "../../lib/diet-week";
import { glyphForFood, glyphForName } from "../../lib/food-glyph";
import { fmtUntil } from "../../lib/format";
import { macroEstimate } from "../../lib/taco-match";
import { MacroBar } from "../meal/MacroBar";
import { MealCard, type MealCardTone } from "../meal/MealCard";
import { PlannedEstimate } from "../PlannedItems";
import { useResolvedPlanned } from "../usePlannedMeal";
import { MealActions, MealRegisterButton, type PlanMealHandlers } from "./MealActions";
import { PlanItemRow } from "./PlanItemRow";

export const SLOT_ICON: Record<DietSlot, LucideIcon> = {
  cafe_da_manha: Coffee,
  lanche_da_manha: Apple,
  almoco: UtensilsCrossed,
  lanche_da_tarde: Cookie,
  jantar: Moon,
  ceia: MoonStar,
};
/** Tom do bloco da refeição (lanche azul: rosa é só para erro). A próxima fica sempre menta. */
const SLOT_TONE: Record<DietSlot, MealCardTone> = {
  cafe_da_manha: "amber",
  lanche_da_manha: "sky",
  almoco: "mint",
  lanche_da_tarde: "sky",
  jantar: "indigo",
  ceia: "indigo",
};

/** "preview" = outro dia da semana ou plano desatualizado: aberta, sem ações. */
export type PlanCardState = PlanMealState | "preview";

type Props = {
  meal: DietMeal;
  state: PlanCardState;
  /** Horário do registro que marca a refeição hoje. */
  registeredAt: string | null;
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  /** Itens trocados no dia mostrado (IA-X5). */
  marks: readonly SwapMark[];
  allergyTokens: readonly string[];
  /** Próxima: minutos até o horário (0 = agora; sem contagem no perfil sensível). */
  minutesUntil?: number | null;
  /** Aviso do "Trocar refeição" (role=status); vazio até a pessoa trocar. */
  statusText?: string;
  /** Ações de hoje; ausentes na prévia e no plano desatualizado. */
  handlers?: PlanMealHandlers;
};

/**
 * Refeição do plano na linha do tempo (fidelidade "Minha dieta"): feita e passada recolhidas (pilha
 * de emojis, toque abre), próxima e futuras abertas com os itens, a barra P/C/G e as ações. Números só
 * da TACO (macroEstimate), nunca do texto do modelo; sem kcal com calorias ocultas e nenhum número no
 * perfil sensível (prato no lugar da barra).
 */
export function PlanMealCard({
  meal,
  state,
  registeredAt,
  sensitive,
  calm,
  hideCalories,
  marks,
  allergyTokens,
  minutesUntil,
  statusText = "",
  handlers,
}: Props) {
  const resolved = useResolvedPlanned(meal.itens);
  const isCollapsible = state === "done" || state === "past";
  const [isExpanded, setExpanded] = useState(false);
  const label = SLOT_LABEL[meal.slot];
  const estimate = macroEstimate(resolved);
  const numbers = mealEstimateText(estimate, { hideCalories, sensitive, compact: isCollapsible });
  const glyphs = resolved.flatMap((entry) => {
    const glyph = (entry.food ? glyphForFood(entry.food) : null) ?? glyphForName(entry.item.alimento);
    return glyph ? [glyph] : [];
  });
  const tone: MealCardTone = state === "next" ? "mint" : SLOT_TONE[meal.slot];

  const doneAt = state === "done" && registeredAt ? registeredAt : null;
  const subtitle = isCollapsible ? (
    <>
      {[numbers.kcal, doneAt ? null : numbers.protein].filter(Boolean).join(" · ")}
      {doneAt && (
        <span aria-hidden="true">
          {numbers.kcal ? " · " : ""}
          às {doneAt}
        </span>
      )}
    </>
  ) : null;
  const until =
    state === "next" && !sensitive && minutesUntil ? fmtUntil(minutesUntil) : null;
  const metaParts = [
    numbers.kcal && <span key="kcal">{numbers.kcal}</span>,
    numbers.protein && (
      <span key="protein" className="plan-meal-protein">
        {numbers.protein}
      </span>
    ),
    until && (
      <span key="until" className="next-meal-until">
        {until}
      </span>
    ),
  ].filter(Boolean);
  const meta =
    !isCollapsible && metaParts.length ? (
      <>
        {metaParts.flatMap((part, i) => (i ? [<span key={`sep-${i}`}> · </span>, part] : [part]))}
      </>
    ) : null;

  const badge =
    state === "done" ? (
      <span className="plan-done-pill">
        <Check size={14} strokeWidth={3} aria-hidden="true" />
        {PLAN_DAY_COPY.done}
        {doneAt && <span className="sr-only"> às {doneAt}</span>}
      </span>
    ) : state === "next" ? (
      <span className="plan-next-pill">
        <i aria-hidden="true" />
        {PLAN_DAY_COPY.next}
      </span>
    ) : null;
  // Conceito 04: no cabeçalho só a pílula (ou "Registrar" na passada); "Ajustar e registrar" fica sob as ações.
  const trailing =
    handlers && state === "past" ? (
      <MealRegisterButton slot={meal.slot} handlers={handlers} tone="outline" compact />
    ) : null;

  const bar = sensitive ? (
    <PlannedEstimate resolved={resolved} sensitive />
  ) : estimate.share && estimate.grams ? (
    <div className="plan-meal-bar">
      <MacroBar
        share={estimate.share}
        size="lg"
        label={macroGramsLabel(estimate.grams)}
        testId="macro-estimate"
      />
      <span className="plan-meal-grams" aria-hidden="true">
        {macroGramsText(estimate.grams)}
      </span>
    </div>
  ) : null;
  const footer =
    handlers && state !== "done" ? (
      <MealActions
        slot={meal.slot}
        handlers={handlers}
        register={state === "next" ? "primary" : state === "future" ? "outline" : null}
      />
    ) : null;

  return (
    <MealCard
      variant={isCollapsible ? "collapsed" : "open"}
      title={label}
      icon={SLOT_ICON[meal.slot]}
      glyphs={glyphs}
      tone={tone}
      subtitle={subtitle}
      meta={meta}
      badge={badge}
      trailing={trailing}
      emphasis={state === "next" ? "next" : state === "done" ? "done" : null}
      isExpanded={isCollapsible ? isExpanded : undefined}
      onToggle={isCollapsible ? () => setExpanded(!isExpanded) : undefined}
      footer={footer}
      testId={state === "next" ? "next-meal" : undefined}
      className={`plan-meal is-${state}`}
    >
      <ul className="plan-items">
        {resolved.map((entry, index) => (
          <PlanItemRow
            key={`${entry.item.alimento}-${index}`}
            entry={entry}
            swaps={meal.itens[index]?.trocas ?? []}
            replaces={marks.find((mark) => mark.item === index)?.replaces}
            allergyTokens={allergyTokens}
            showGrams={!calm && !sensitive}
          />
        ))}
      </ul>
      {bar}
      {handlers && (
        <p className="diet-meal-status" role="status">
          {statusText}
        </p>
      )}
    </MealCard>
  );
}
