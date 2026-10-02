import { useRouter } from "expo-router";
import { Info } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { localDate } from "@shared/lib/domain";
import {
  dailySeries,
  evolutionSubtitle,
  journeyFor,
  nextWeighIn,
  proteinBand,
  startChecklist,
  type DailyKind,
} from "@shared/lib/evolution";
import { EVOLUCAO_TITLE } from "@shared/lib/copy";
import { insightPrivacy, seriesInsight } from "@shared/lib/progress-insights";
import { bodyNumbers, isCalmProfile } from "@shared/lib/space";
import { doseTimeline } from "@shared/lib/treatment";
import { ConsistencyCard } from "@/components/evolucao/consistency-card";
import { DayBarsCard } from "@/components/evolucao/day-bars-card";
import { EvolMoreList } from "@/components/evolucao/evol-more-list";
import { HowWeCalculate } from "@/components/evolucao/how-we-calculate";
import { JourneyCard, StartLine } from "@/components/evolucao/journey-card";
import { MeasurementSheet } from "@/components/evolucao/measurement-sheet";
import { SERIES, SeriesSheet } from "@/components/evolucao/series-sheet";
import { WeightCard } from "@/components/evolucao/weight-card";
import { Screen } from "@/components/layout/screen";
import { AppText, Button, IconButton } from "@/components/ui";
import { ScreenInsightChips } from "@/components/signals/insight-chips";
import { espacoHref } from "@/lib/espaco-link";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/** Pesagens a partir das quais a jornada substitui a linha de partida. */
const JOURNEY_MIN_MEASUREMENTS = 2;
/** Os mini gráficos da tela mostram a última semana; 28 dias ficam na folha de detalhes. */
const MINI_DAYS = 7;

/**
 * Evolução (conceito 09): "Sua jornada" (ou "Sua linha de partida" na primeira visita), peso com tendência e as
 * aplicações no mesmo gráfico (fora de perfil calmo), calorias (ou refeições, com calorias ocultas) e água lado a lado,
 * o calendário "Seus registros" das últimas 4 semanas e "Mais da sua evolução" com o resto a um toque. Perfil calmo
 * (sensível ou menor de 18, isCalmProfile) não vê meta, ritmo, variação, proteína, doses sobre o peso nem medidas.
 */
export function EvolucaoScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const router = useRouter();
  const p = state.profile!;
  const [isOpen, setOpen] = useState(false);
  const [isHowOpen, setHowOpen] = useState(false);
  const [series, setSeries] = useState<DailyKind | null>(null);
  const today = localDate();
  const journey = journeyFor(state, today);
  const calm = isCalmProfile(p, today);
  // Números do corpo (ESPACO-13): "hidden" tira pesos, medidas e a faixa de proteína (vem do peso).
  const level = bodyNumbers(p, today);
  const hidden = level === "hidden";
  const hasJourney = journey !== null && journey.count >= JOURNEY_MIN_MEASUREMENTS;
  const timeline = doseTimeline(state.injections, today, p.weightLossPenPerMonth);
  const band = level === "full" ? proteinBand(journey?.current.weight ?? p.weight) : null;
  // Mini gráficos (EVOL-06): a meta depois de "média/dia" sai de seriesInsight (regras de privacidade).
  const privacy = insightPrivacy(p, today);
  const week = dailySeries(state, today, MINI_DAYS);
  const minis: DailyKind[] = [p.hideCalories ? "meals" : "calories", "water"];
  return (
    <Screen header={{ variant: "large", title: EVOLUCAO_TITLE, subtitle: evolutionSubtitle(state, today) }} withTabBar>
      {/* Sinais do app (descanso, tendência do peso em palavras) como chips, logo abaixo do cabeçalho. */}
      <ScreenInsightChips screen="evolucao" />
      {hasJourney ? (
        <JourneyCard
          journey={journey}
          today={today}
          next={nextWeighIn(state, today)}
          onRegister={() => setOpen(true)}
          hidden={hidden}
          onAdjust={() => router.push(espacoHref("preferencias"))}
        />
      ) : (
        <StartLine journey={journey} items={startChecklist(state, today)} onRegister={() => setOpen(true)} hidden={hidden} />
      )}
      {hasJourney && <WeightCard target={journey.target} dose={calm || hidden ? null : timeline} isSensitive={calm} hidden={hidden} />}
      <View style={styles.days}>
        <View style={styles.daysHead}>
          <View style={styles.daysTitle}>
            <AppText size={fontSize.xs} weight={800} tracking={0.08} upper color={colors.muted} accessibilityRole="header">
              Últimos {MINI_DAYS} dias
            </AppText>
            <IconButton icon={Info} variant="ghost" accessibilityLabel="Como calculamos" onPress={() => setHowOpen(true)} />
          </View>
          <Button label="Ver diário" variant="link" onPress={() => router.push("/diario")} style={styles.centered} />
        </View>
        <View style={styles.grid} testID="mini-grid">
          {minis.map((kind) => {
            const spec = SERIES[kind];
            return (
              <DayBarsCard
                key={kind}
                variant="compact"
                title={spec.title}
                icon={spec.icon}
                tone={spec.tone}
                points={week[kind]}
                today={today}
                unit={spec.unit}
                format={spec.format}
                unitLabel={spec.unitLabel}
                insight={seriesInsight(kind, week[kind], privacy)}
                emptyText={spec.emptyText}
                onOpen={() => setSeries(kind)}
                style={styles.mini}
              />
            );
          })}
        </View>
      </View>
      <ConsistencyCard today={today} />
      <EvolMoreList
        today={today}
        journey={journey}
        timeline={timeline}
        calm={calm}
        showMeasures={level === "full"}
        proteinBand={band}
        onRegisterMeasures={() => setOpen(true)}
      />
      <MeasurementSheet visible={isOpen} onClose={() => setOpen(false)} />
      <HowWeCalculate visible={isHowOpen} privacy={privacy} hasDoses={!calm && timeline !== null} onClose={() => setHowOpen(false)} />
      {series ? <SeriesSheet kind={series} today={today} band={band} onClose={() => setSeries(null)} /> : null}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  days: { gap: 10 },
  daysHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  daysTitle: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
  centered: { alignSelf: "center" },
  // Dois mini gráficos lado a lado até 320 pt (o repeat(2, 1fr) do web).
  grid: { flexDirection: "row", gap: 12 },
  mini: { flex: 1, minWidth: 0 },
}));
