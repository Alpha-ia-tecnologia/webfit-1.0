import { useMemo, useState, type ReactNode } from "react";
import { Beef, ChevronRight, FileText, Ruler, Smile, Syringe, type LucideIcon } from "lucide-react";
import type { Domain } from "../../design/tokens";
import { useApp } from "../../lib/context";
import { shiftDate } from "../../lib/domain";
import { dailySeries, dayBars, type Journey } from "../../lib/evolution";
import { fmtNumber, plural } from "../../lib/format";
import { REPORT_COPY } from "../../lib/report-copy";
import type { DoseTimeline } from "../../lib/treatment";
import { wellbeingTrend } from "../../lib/wellbeing-trend";
import { IconTile } from "../IconTile";
import { SegmentedControl } from "../SegmentedControl";
import { LazyReportSheet } from "../espaco/LazyReportSheet";
import { EvolucaoWeekRecap } from "../semana/EvolucaoWeekRecap";
import { EvolSheet } from "./EvolSheet";
import { MeasuresCard } from "./MeasuresCard";
import { SeriesSheet } from "./SeriesSheet";
import { TreatmentEvolCard } from "./TreatmentEvolCard";
import { WellbeingCard } from "./WellbeingCard";

type Sheet = "protein" | "wellbeing" | "treatment" | "measures" | "report";
const WEEK_DAYS = 7;
/** "83,1": uma casa, como na jornada. */
const cm1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Linha de 56 px: ícone no tom do domínio, título, valor curto e a seta. */
function MoreRow({
  icon,
  tone,
  title,
  value,
  onOpen,
  isDialog = true,
}: {
  icon: LucideIcon;
  tone: Domain;
  title: string;
  value?: string | null;
  onOpen: () => void;
  isDialog?: boolean;
}) {
  return (
    <li className="evol-more-item">
      <button
        type="button"
        className="evol-more-row"
        aria-haspopup={isDialog ? "dialog" : undefined}
        onClick={onOpen}
      >
        <IconTile tone={tone} icon={icon} />
        <span className="evol-more-text">
          <strong>{title}</strong>
          {value && <small>{value}</small>}
        </span>
        <ChevronRight className="evol-more-chevron" size={20} aria-hidden="true" />
      </button>
    </li>
  );
}

/** Bem-estar e sono na folha: o mesmo cartão, com o próprio período de 7 ou 28 dias. */
function WellbeingSheetBody({ today }: { today: string }) {
  const [period, setPeriod] = useState<"7" | "28">("7");
  const days = Number(period);
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => shiftDate(today, i - (days - 1))),
    [days, today],
  );
  return (
    <>
      <SegmentedControl
        label="Período dos gráficos diários"
        segments={[
          { value: "7", label: "7 dias" },
          { value: "28", label: "28 dias" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <WellbeingCard dates={dates} today={today} />
    </>
  );
}

/**
 * "Mais da sua evolução" (fora do conceito 09, decisão 10): o que saiu do fluxo principal continua a
 * um toque, em linhas de 56 px que abrem folhas. Só aparece o que se aplica ao perfil: proteína fora
 * do perfil calmo, medicação com aplicações registradas, medidas só com os números do corpo completos.
 */
export function EvolMoreList({
  today,
  journey,
  timeline,
  calm,
  showMeasures,
  proteinBand,
  onRegisterMeasures,
}: {
  today: string;
  journey: Journey | null;
  timeline: DoseTimeline | null;
  calm: boolean;
  showMeasures: boolean;
  proteinBand: { min: number; max: number } | null;
  onRegisterMeasures: () => void;
}) {
  const { state } = useApp();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = () => setSheet(null);
  const week = useMemo(
    () => Array.from({ length: WEEK_DAYS }, (_, i) => shiftDate(today, i - (WEEK_DAYS - 1))),
    [today],
  );
  const wellbeing = useMemo(() => wellbeingTrend(state.diary, week, today), [state.diary, week, today]);
  const proteinAverage = calm
    ? null
    : dayBars(dailySeries(state, today, WEEK_DAYS).protein, today).average;
  const lastSpan = timeline?.spans.at(-1);
  const measures = [
    journey?.waist ? `Cintura ${cm1(journey.waist.value)}` : null,
    journey?.hip ? `Quadril ${cm1(journey.hip.value)}` : null,
  ].filter(Boolean);
  const sheets: Record<Sheet, () => ReactNode> = {
    protein: () => <SeriesSheet kind="protein" today={today} band={proteinBand} onClose={close} />,
    wellbeing: () => (
      <EvolSheet title="Bem-estar e sono" onClose={close}>
        <WellbeingSheetBody today={today} />
      </EvolSheet>
    ),
    treatment: () =>
      timeline && (
        <EvolSheet title="Medicação e locais" onClose={close}>
          <TreatmentEvolCard timeline={timeline} injections={state.injections} today={today} />
        </EvolSheet>
      ),
    measures: () => (
      <EvolSheet title="Medidas" onClose={close}>
        <MeasuresCard onRegister={onRegisterMeasures} />
      </EvolSheet>
    ),
    report: () => <LazyReportSheet onClose={close} />,
  };
  return (
    <section className="evol-more" aria-labelledby="evol-more-title">
      <h2 id="evol-more-title" className="evol-eyebrow">
        Mais da sua evolução
      </h2>
      <ul className="card evol-more-list">
        <EvolucaoWeekRecap today={today} variant="row" />
        {!calm && (
          <MoreRow
            icon={Beef}
            tone="food"
            title="Proteína"
            value={proteinAverage === null ? "Sem registros na semana" : `${fmtNumber(proteinAverage)} g/dia`}
            onOpen={() => setSheet("protein")}
          />
        )}
        <MoreRow
          icon={Smile}
          tone="mind"
          title="Bem-estar e sono"
          value={wellbeing.stats[0]?.text ?? "Humor e sono do dia"}
          onOpen={() => setSheet("wellbeing")}
        />
        {timeline && lastSpan && (
          <MoreRow
            icon={Syringe}
            tone="medication"
            title="Medicação e locais"
            value={`${plural(timeline.applications.length, "aplicação", "aplicações")} · ${lastSpan.label}`}
            onOpen={() => setSheet("treatment")}
          />
        )}
        {showMeasures && (
          <MoreRow
            icon={Ruler}
            tone="body"
            title="Medidas"
            value={measures.length ? `${measures.join(" · ")} cm` : "Cintura e quadril"}
            onOpen={() => setSheet("measures")}
          />
        )}
        <MoreRow
          icon={FileText}
          tone="neutral"
          title={REPORT_COPY.title}
          onOpen={() => setSheet("report")}
        />
      </ul>
      {sheet && sheets[sheet]()}
    </section>
  );
}
