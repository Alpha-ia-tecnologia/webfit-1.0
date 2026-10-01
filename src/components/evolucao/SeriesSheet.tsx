import { useState } from "react";
import { Beef, Droplets, Flame, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useApp } from "../../lib/context";
import { dailySeries, type DailyKind } from "../../lib/evolution";
import { fmtNumber } from "../../lib/format";
import { insightPrivacy, seriesInsight } from "../../lib/progress-insights";
import { SegmentedControl } from "../SegmentedControl";
import { Modal } from "../UI";
import { DayBarsCard } from "./DayBarsCard";

type Period = "7" | "28";

interface SeriesSpec {
  title: string;
  icon: LucideIcon;
  tone: "food" | "water" | "protein" | "meals";
  unit: string;
  unitLabel: string;
  format: (value: number) => string;
  emptyText: string;
}

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

/**
 * Detalhes de um mini gráfico da Evolução: 7 ou 28 dias, a média, os destaques calculados (com as
 * regras de privacidade de seriesInsight) e a faixa de referência da proteína quando houver.
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
    <Modal title={spec.title} onClose={onClose} className="evol-sheet series-sheet">
      <SegmentedControl
        label="Período do gráfico"
        segments={[
          { value: "7", label: "7 dias" },
          { value: "28", label: "28 dias" },
        ]}
        value={period}
        onChange={setPeriod}
      />
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
      />
    </Modal>
  );
}
