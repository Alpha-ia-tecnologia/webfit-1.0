import { Beef, FileText, Ruler, Smile, Syringe } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { shiftDate } from "@shared/lib/domain";
import { dailySeries, dayBars, type Journey } from "@shared/lib/evolution";
import { fmtNumber, plural } from "@shared/lib/format";
import { REPORT_COPY } from "@shared/lib/report-copy";
import type { DoseTimeline } from "@shared/lib/treatment";
import { wellbeingTrend } from "@shared/lib/wellbeing-trend";
import { ReportSheet } from "@/components/espaco/report-sheet";
import { EvolucaoWeekRecap } from "@/components/semana/evolucao-week-recap";
import { AppText, FlatCards, SegmentedControl, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { MeasuresCard } from "./measures-card";
import { MoreRow } from "./more-row";
import { SeriesSheet } from "./series-sheet";
import { TreatmentEvolCard } from "./treatment-evol-card";
import { WellbeingCard } from "./wellbeing-card";

type SheetKind = "protein" | "wellbeing" | "treatment" | "measures" | "report";
const WEEK_DAYS = 7;
const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "28", label: "28 dias" },
] as const;
/** "83,1": uma casa, como na jornada. */
const cm1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Bem-estar e sono na folha: o mesmo cartão, com o próprio período de 7 ou 28 dias. */
function WellbeingSheetBody({ today }: { today: string }) {
  const [period, setPeriod] = useState<"7" | "28">("7");
  const days = Number(period);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => shiftDate(today, i - (days - 1))), [days, today]);
  return (
    <>
      <SegmentedControl label="Período dos gráficos diários" segments={PERIODS} value={period} onChange={setPeriod} />
      <WellbeingCard dates={dates} today={today} />
    </>
  );
}

type Props = {
  today: string;
  journey: Journey | null;
  timeline: DoseTimeline | null;
  calm: boolean;
  showMeasures: boolean;
  proteinBand: { min: number; max: number } | null;
  onRegisterMeasures: () => void;
};

/**
 * "Mais da sua evolução" (fora do conceito 09, decisão 10): o que saiu do fluxo principal continua a um toque, em
 * linhas de 56 pt que abrem folhas. Só aparece o que se aplica ao perfil: proteína fora do perfil calmo, medicação com
 * aplicações registradas, medidas só com os números do corpo completos.
 */
export function EvolMoreList({ today, journey, timeline, calm, showMeasures, proteinBand, onRegisterMeasures }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  /** iOS: "Registrar medidas" só abre depois que a folha "Medidas" terminou de sair (onDismiss). */
  const afterMeasures = useRef<(() => void) | null>(null);
  const close = () => setSheet(null);
  const week = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => shiftDate(today, i - (WEEK_DAYS - 1))), [today]);
  const wellbeing = useMemo(() => wellbeingTrend(state.diary, week, today), [state.diary, week, today]);
  const proteinAverage = calm ? null : dayBars(dailySeries(state, today, WEEK_DAYS).protein, today).average;
  const lastSpan = timeline?.spans.at(-1);
  const measures = [journey?.waist ? `Cintura ${cm1(journey.waist.value)}` : null, journey?.hip ? `Quadril ${cm1(journey.hip.value)}` : null].filter(Boolean);
  const registerMeasures = () => {
    setSheet(null);
    if (Platform.OS === "ios") afterMeasures.current = onRegisterMeasures;
    else onRegisterMeasures();
  };
  return (
    <View style={styles.section}>
      <AppText size={fontSize.xs} weight={800} tracking={0.08} upper color={colors.muted} accessibilityRole="header">
        Mais da sua evolução
      </AppText>
      <View role="list" style={styles.list}>
        <EvolucaoWeekRecap today={today} variant="row" />
        {!calm ? (
          <MoreRow
            icon={Beef}
            tone="food"
            title="Proteína"
            value={proteinAverage === null ? "Sem registros na semana" : `${fmtNumber(proteinAverage)} g/dia`}
            onPress={() => setSheet("protein")}
          />
        ) : null}
        <MoreRow icon={Smile} tone="mind" title="Bem-estar e sono" value={wellbeing.stats[0]?.text ?? "Humor e sono do dia"} onPress={() => setSheet("wellbeing")} />
        {timeline && lastSpan ? (
          <MoreRow
            icon={Syringe}
            tone="medication"
            title="Medicação e locais"
            value={`${plural(timeline.applications.length, "aplicação", "aplicações")} · ${lastSpan.label}`}
            onPress={() => setSheet("treatment")}
          />
        ) : null}
        {showMeasures ? (
          <MoreRow
            icon={Ruler}
            tone="body"
            title="Medidas"
            value={measures.length ? `${measures.join(" · ")} cm` : "Cintura e quadril"}
            onPress={() => setSheet("measures")}
          />
        ) : null}
        <MoreRow icon={FileText} tone="neutral" title={REPORT_COPY.title} onPress={() => setSheet("report")} isLast />
      </View>
      {sheet === "protein" ? <SeriesSheet kind="protein" today={today} band={proteinBand} onClose={close} /> : null}
      <Sheet visible={sheet === "wellbeing"} title="Bem-estar e sono" onClose={close}>
        <FlatCards>
          <WellbeingSheetBody today={today} />
        </FlatCards>
      </Sheet>
      {timeline ? (
        <Sheet visible={sheet === "treatment"} title="Medicação e locais" onClose={close}>
          <FlatCards>
            <TreatmentEvolCard timeline={timeline} injections={state.injections} today={today} />
          </FlatCards>
        </Sheet>
      ) : null}
      <Sheet
        visible={sheet === "measures"}
        title="Medidas"
        onClose={close}
        onDismiss={() => {
          const open = afterMeasures.current;
          afterMeasures.current = null;
          open?.();
        }}
      >
        <FlatCards>
          <MeasuresCard onRegister={registerMeasures} />
        </FlatCards>
      </Sheet>
      {sheet === "report" ? <ReportSheet onClose={close} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 10 },
  list: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
}));
