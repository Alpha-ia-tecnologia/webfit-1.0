import { useId, useMemo } from "react";
import { Droplets, Scale, UtensilsCrossed } from "lucide-react";
import type { ChatMetric } from "../../lib/agent-blocks";
import { BAR_COPY, blockChart, formatBarAverage } from "../../lib/block-charts";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { DayBarsCard } from "../evolucao/DayBarsCard";
import { WeightTrendChart } from "../evolucao/WeightTrendChart";
import "../evolucao/Evolucao.css";

/**
 * Gráfico pedido pelo agente: o modelo só escolhe a métrica; as barras e a tendência saem dos
 * registros locais, com as regras da Evolução. Peso nunca aparece para perfil sensível.
 */
export function BlockChart({ metric }: { metric: ChatMetric }) {
  const { state } = useApp();
  const titleId = useId();
  const today = localDate();
  const chart = useMemo(() => blockChart(state, metric, today), [state, metric, today]);
  if (!chart) return null;
  if (chart.kind === "bars") {
    const copy = BAR_COPY[chart.metric];
    const bars = chart.metric;
    return (
      <div className="chat-chart" data-testid="block-chart">
        <DayBarsCard
          title={copy.title}
          icon={bars === "agua_7d" ? Droplets : UtensilsCrossed}
          tone={copy.tone}
          points={chart.points}
          today={today}
          unit={copy.unit}
          format={(value) => formatBarAverage(bars, value)}
          unitLabel={copy.unitLabel}
          goalText={chart.goalText}
          emptyText={copy.emptyText}
        />
      </div>
    );
  }
  return (
    <div className="chat-chart" data-testid="block-chart">
      <section className="card chat-weight" aria-labelledby={titleId}>
        <header className="evol-mini-head">
          <span className="evol-icon body" aria-hidden="true">
            <Scale size={18} />
          </span>
          <h4 id={titleId}>Peso nas últimas 8 semanas</h4>
        </header>
        {chart.hasData ? (
          <WeightTrendChart
            points={chart.points}
            start={chart.start}
            end={chart.end}
            target={null}
          />
        ) : (
          <p className="muted">Sem pesagens nas últimas 8 semanas.</p>
        )}
      </section>
    </div>
  );
}
