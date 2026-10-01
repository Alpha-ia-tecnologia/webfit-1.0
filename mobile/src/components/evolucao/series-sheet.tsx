import { Beef, Droplets, Flame, UtensilsCrossed, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { dailySeries, type DailyKind } from "@shared/lib/evolution";
import { fmtNumber } from "@shared/lib/format";
import { insightPrivacy, seriesInsight } from "@shared/lib/progress-insights";
import { FlatCards, SegmentedControl, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { DayBarsCard, type BarTone } from "./day-bars-card";

type Period = "7" | "28";

interface SeriesSpec {
  title: string;
  icon: LucideIcon;
  tone: BarTone;
  unit: string;
  unitLabel: string;
  format: (value: number) => string;
  emptyText: string;
}

/** Nome, ícone, cor e unidade de cada mini gráfico (o SERIES do web). */
export const SERIES: Record<DailyKind, SeriesSpec> = {
  calories: {
    title: "Calorias",
    icon: Flame,
    tone: "food",
    unit: "kcal",
    unitLabel: "kcal",
    format: (v) => fmtNumber(v),
    emptyText: "Sem refeições registradas.",
  },
  meals: {
    title: "Refeições",
    icon: UtensilsCrossed,
    tone: "meals",
    unit: "refeições",
    unitLabel: "refeições",
    format: (v) => fmtNumber(v),
    emptyText: "Sem refeições registradas.",
  },
  water: {
    title: "Água",
    icon: Droplets,
    tone: "water",
    unit: "ml",
    unitLabel: "L",
    format: (v) => fmtNumber(v / 1000, 1),
    emptyText: "Sem água registrada.",
  },
  protein: {
    title: "Proteína",
    icon: Beef,
    tone: "protein",
    unit: "g",
    unitLabel: "g",
    format: (v) => fmtNumber(v),
    emptyText: "Sem refeições registradas.",
  },
};

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "28", label: "28 dias" },
] as const;

/**
 * Detalhes de um mini gráfico da Evolução (conceito 09): 7 ou 28 dias, a média, os destaques calculados (com as regras
 * de privacidade de seriesInsight) e a faixa de referência da proteína quando houver.
 */
export function SeriesSheet({
  kind,
  today,
  band = null,
  onClose,
}: {
  kind: DailyKind;
  today: string;
  /** Faixa de proteína (1,2 a 1,6 g/kg); só com os números do corpo completos. */
  band?: { min: number; max: number } | null;
  onClose: () => void;
}) {
  const { state } = useApp();
  const [period, setPeriod] = useState<Period>("7");
  const spec = SERIES[kind];
  const points = dailySeries(state, today, Number(period))[kind];
  const privacy = insightPrivacy(state.profile!, today);
  const insight = seriesInsight(kind, points, privacy, kind === "protein" ? band : null);
  return (
    <Sheet visible title={spec.title} onClose={onClose}>
      <SegmentedControl label="Período do gráfico" segments={PERIODS} value={period} onChange={setPeriod} />
      <FlatCards>
        <DayBarsCard
          title={spec.title}
          icon={spec.icon}
          tone={spec.tone}
          points={points}
          today={today}
          unit={spec.unit}
          format={spec.format}
          unitLabel={spec.unitLabel}
          insight={insight}
          band={kind === "protein" ? band : null}
          emptyText={spec.emptyText}
          testID={`series-${spec.tone}`}
        />
      </FlatCards>
    </Sheet>
  );
}
