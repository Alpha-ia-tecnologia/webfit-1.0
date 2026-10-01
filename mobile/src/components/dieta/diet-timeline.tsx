import { Check } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { allergenTokens } from "@shared/lib/allergens";
import type { DietMeal } from "@shared/lib/diet-plan";
import type { SwapMark } from "@shared/lib/diet-week";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import type { PlanMealHandlers } from "./meal-actions";
import { PlanMealCard, type PlanCardState } from "./plan-meal-card";

/** Hoje: estado, registro, aviso do "Trocar" e ações de cada refeição (mesma ordem de `meals`). */
export interface TimelineToday {
  states: readonly PlanCardState[];
  registeredAt: readonly (string | null)[];
  statusText: readonly string[];
  handlers: (meal: DietMeal, index: number) => PlanMealHandlers;
  /** Minutos até a próxima (0 = agora). */
  minutesUntil: number | null;
}

/** Coluna do trilho (44 px + 4 de respiro, como o web) e o centro dela, onde passa a linha. */
const RAIL = 44;
const RAIL_GAP = 4;
const STEP_GAP = 12;

/**
 * Linha do tempo do dia (DietTimeline do web, conceito 04): trilho com o horário e o nó de cada refeição (feita =
 * check verde, próxima = ponto com halo, pendente = aro) e o cartão ao lado. Um item por refeição, na ordem do plano.
 * Sem `today` (prévia de outro dia ou plano antigo) tudo fica aberto, sem ações.
 */
export function DietTimeline({
  meals,
  sensitive,
  calm,
  hideCalories,
  allergyDetails,
  swaps,
  today,
}: {
  meals: readonly DietMeal[];
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  allergyDetails: string;
  /** Trocas do dia mostrado, por refeição (mesma ordem de `meals`). */
  swaps?: readonly (readonly SwapMark[])[];
  today?: TimelineToday;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const tokens = useMemo(() => allergenTokens(allergyDetails), [allergyDetails]);
  const states: readonly PlanCardState[] = today?.states ?? meals.map(() => "preview");
  // O trilho fica verde até a última refeição feita (ou a próxima); depois, neutro.
  const lastActive = states.reduce((last, current, index) => (current === "done" || current === "next" ? index : last), -1);
  return (
    <View role="list" aria-label="Refeições do plano" testID="diet-timeline" style={styles.timeline}>
      {meals.map((meal, index) => {
        const current = states[index] ?? "preview";
        const isLast = index === meals.length - 1;
        return (
          <View key={`${meal.slot}-${index}`} role="listitem" style={styles.step}>
            <View
              style={[styles.line, index < lastActive && styles.lineActive, isLast && styles.lineLast]}
              aria-hidden
              importantForAccessibility="no-hide-descendants"
            />
            <View style={styles.rail} aria-hidden importantForAccessibility="no-hide-descendants">
              <AppText size={fontSize.sm} weight={800} color={current === "next" ? colors.green700 : colors.muted} style={styles.tabular}>
                {meal.horario ?? "Livre"}
              </AppText>
              <View style={[styles.node, current === "done" && styles.nodeDone, current === "next" && styles.nodeNext]}>
                {current === "done" ? <Check size={13} strokeWidth={3.5} color={colors.white} /> : null}
              </View>
            </View>
            <View style={styles.card}>
              <PlanMealCard
                meal={meal}
                state={current}
                registeredAt={today?.registeredAt[index] ?? null}
                sensitive={sensitive}
                calm={calm}
                hideCalories={hideCalories}
                marks={swaps?.[index] ?? []}
                allergyDetails={allergyDetails}
                allergyTokens={tokens}
                minutesUntil={current === "next" ? today?.minutesUntil : null}
                statusText={today?.statusText[index]}
                handlers={today ? today.handlers(meal, index) : undefined}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  timeline: { gap: STEP_GAP },
  step: { flexDirection: "row", alignItems: "flex-start", gap: RAIL_GAP },
  /** Linha do trilho: desce do nó até o próximo item (passa pelo respiro entre eles); na última, para antes do fim. */
  line: {
    position: "absolute",
    top: 44,
    bottom: -STEP_GAP,
    left: RAIL / 2 - 1,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  lineActive: { backgroundColor: colors.mint200 },
  lineLast: { bottom: 16 },
  rail: { width: RAIL, alignItems: "center", gap: 8, paddingTop: 14 },
  tabular: { fontVariant: ["tabular-nums"] },
  node: {
    zIndex: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.slate300,
  },
  nodeDone: { width: 22, height: 22, borderRadius: 11, borderWidth: 0, backgroundColor: colors.green500 },
  nodeNext: { width: 20, height: 20, borderRadius: 10, borderWidth: 0, backgroundColor: colors.emerald, boxShadow: `0px 0px 0px 6px ${colors.mint100}` },
  card: { flex: 1, minWidth: 0 },
}));
