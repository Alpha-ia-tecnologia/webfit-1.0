import { Clock, Thermometer, Timer, Users, Utensils, type LucideIcon } from "lucide-react";
import { recipeChips, stepExtras } from "../../lib/recipe-set";
import type { RecipeCard } from "../../types";

/** Refeição, tempo e rendimento, na ordem de recipeChips. */
const CHIP_ICONS: LucideIcon[] = [Utensils, Clock, Users];

export function RecipeChips({ card }: { card: RecipeCard }) {
  return (
    <div className="recipe-chips">
      {recipeChips(card).map((chip, i) => {
        const Icon = CHIP_ICONS[i];
        return (
          <span key={chip} className="recipe-chip">
            {Icon && <Icon size={13} aria-hidden="true" />}
            {chip}
          </span>
        );
      })}
    </div>
  );
}

/** "25 min" (cronômetro) e "200 °C" (forno) de um passo; nada roda sozinho. */
export function StepExtras({ step }: { step: RecipeCard["passos"][number] }) {
  const texts = stepExtras(step);
  if (!texts.length) return null;
  const icons: LucideIcon[] = [
    ...(step.timerMin !== null ? [Timer] : []),
    ...(step.temperaturaC !== null ? [Thermometer] : []),
  ];
  return (
    <span className="recipe-step-extras">
      {texts.map((text, i) => {
        const Icon = icons[i];
        return (
          <span key={text} className="recipe-chip">
            {Icon && <Icon size={13} aria-hidden="true" />}
            {text}
          </span>
        );
      })}
    </span>
  );
}
