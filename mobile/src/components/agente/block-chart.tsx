import { Droplets, UtensilsCrossed } from "lucide-react-native";
import { View } from "react-native";
import type { ChatMetric } from "@shared/lib/agent-blocks";
import { BAR_COPY, blockChart, formatBarAverage } from "@shared/lib/block-charts";
import { localDate } from "@shared/lib/domain";
import { DayBarsCard } from "@/components/evolucao/day-bars-card";
import { WeightTrendChart } from "@/components/evolucao/weight-trend-chart";
import { AppText, Card } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * Gráfico pedido pelo agente: o modelo só escolhe a métrica; os valores saem dos registros
 * locais, com as mesmas regras da Evolução. Peso nunca aparece em perfil sensível (null).
 */
export function BlockChart({ metric }: { metric: ChatMetric }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, clock } = useApp();
  const today = localDate(clock);
  const chart = blockChart(state, metric, today);
  if (!chart) return null;
  if (chart.kind === "bars") {
    const copy = BAR_COPY[chart.metric];
    return (
      <View testID="block-chart" style={styles.wrap}>
        <DayBarsCard
          title={copy.title}
          icon={chart.metric === "agua_7d" ? Droplets : UtensilsCrossed}
          tone={copy.tone}
          points={chart.points}
          today={today}
          unit={copy.unit}
          format={(value) => formatBarAverage(chart.metric, value)}
          unitLabel={copy.unitLabel}
          goalText={chart.goalText}
          emptyText={copy.emptyText}
        />
      </View>
    );
  }
  return (
    <View testID="block-chart" style={styles.wrap}>
      <Card>
        <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
          Peso nas últimas 8 semanas
        </AppText>
        {chart.hasData ? (
          <WeightTrendChart points={chart.points} start={chart.start} end={chart.end} target={null} />
        ) : (
          <AppText size={fontSize.sm} color={colors.muted}>
            Sem pesagens nas últimas 8 semanas.
          </AppText>
        )}
      </Card>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { alignSelf: "stretch" },
}));
