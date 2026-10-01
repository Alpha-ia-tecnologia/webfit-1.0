import { useRouter } from "expo-router";
import { Utensils } from "lucide-react-native";
import { isSensitive } from "@shared/lib/day";
import { isDietPlanStale } from "@shared/lib/diet";
import { SLOT_LABEL } from "@shared/lib/diet-plan";
import { fmtUntil } from "@shared/lib/format";
import { useNextPlannedMeal, usePlannedMealRegister, useTodayPlan } from "@/components/dieta/use-planned-meal";
import { ShortcutTile } from "@/components/ui";
import { useApp } from "@/state/app-context";

/** Texto da linha sem plano atual: preparando, anamnese mudou, plano salvo ou ainda sem plano (como o web). */
function entryText(isBusy: boolean, isStale: boolean, hasPlan: boolean): string {
  if (isBusy) return "O agente está preparando suas refeições.";
  if (isStale) return "Sua anamnese mudou. Atualize o plano com suas novas respostas.";
  return hasPlan
    ? "Seu plano de refeições está salvo para consultar quando quiser."
    : "Transforme sua anamnese em um plano de refeições para o dia.";
}

/**
 * Acesso permanente ao plano no Hoje (DietPlanCard do web), numa linha compacta de 72 px. Com dieta estruturada
 * atual e uma próxima refeição, vira "Do seu plano" com "Registrar" (conferir e registrar); nos demais casos,
 * "Sua dieta personalizada" leva à dieta. Nunca "atrasado" nem vermelho; sem contagem em perfil sensível.
 */
export function DietPlanRow() {
  const { state, dietBusy } = useApp();
  const router = useRouter();
  // Plano de hoje com a rotação das trocas revisadas (IA-X5); no dia de criação, o plano original.
  const view = useTodayPlan();
  const next = useNextPlannedMeal(view);
  const register = usePlannedMealRegister();
  const isStale = Boolean(state.dietPlan && state.profile && isDietPlanStale(state.dietPlan, state.profile));
  const openDiet = () => router.push("/dieta");
  if (!dietBusy && !isStale && next && state.profile) {
    const label = SLOT_LABEL[next.meal.slot];
    const when = [label, next.meal.horario, isSensitive(state.profile) ? null : fmtUntil(next.minutesUntil)]
      .filter(Boolean)
      .join(" · ");
    return (
      <ShortcutTile
        layout="row"
        icon={Utensils}
        tone="food"
        title="Do seu plano"
        text={`Próxima refeição · ${when}`}
        lines={2}
        onPress={openDiet}
        accessibilityLabel="Ver minha dieta"
        secondary={{
          label: "Registrar",
          accessibilityLabel: `Conferir e registrar: ${label}`,
          onPress: () => register(next.category, next.meal.itens),
        }}
        testID="plan-next-meal"
      />
    );
  }
  return (
    <ShortcutTile
      layout="row"
      icon={Utensils}
      tone="food"
      title="Sua dieta personalizada"
      text={entryText(dietBusy, isStale, Boolean(state.dietPlan))}
      lines={2}
      onPress={openDiet}
      accessibilityLabel={state.dietPlan ? "Ver minha dieta" : "Criar minha dieta"}
    />
  );
}
