import { Syringe } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { circumference, donutArcs } from "@shared/lib/charts";
import { siteCounts } from "@shared/lib/rotation";
import { showsCycleGrid } from "@shared/lib/symptoms";
import { doseCards, type DoseTimeline } from "@shared/lib/treatment";
import type { InjectionEntry, InjectionSite } from "@shared/types";
import { circlePath } from "@/components/hoje/ring-path";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ThemeColors } from "@/theme/tokens";
import { CycleGridCard } from "./cycle-grid-card";

const CARD_WIDTH = 148;
const CARD_GAP = 10;
const DONUT = 72;
const DONUT_RADIUS = 28;
const DONUT_STROKE = 10;
const DONUT_GAP = 4;
/** Cor de cada local na rosca: a da medicação no abdômen, índigo na coxa e azul no braço. */
const siteColors = (colors: ThemeColors, medication: string): Record<InjectionSite, string> => ({
  abdomen: medication,
  coxa: colors.indigo500,
  braco: colors.sky500,
});
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Rosca "Locais nos últimos 90 dias": uma fatia por local, total no centro; o nome acessível traz as contagens. */
function SiteDonut({ injections, today }: { injections: readonly InjectionEntry[]; today: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const siteColor = siteColors(colors, themeDomainTone(scheme).medication.fg);
  const { counts, total, aria } = siteCounts(injections, today);
  if (!total)
    return (
      <AppText size={fontSize.sm} color={colors.muted}>
        Sem aplicações nos últimos 90 dias.
      </AppText>
    );
  const center = DONUT / 2;
  const d = circlePath(center, DONUT_RADIUS);
  const full = circumference(DONUT_RADIUS);
  const arcs = donutArcs(
    DONUT_RADIUS,
    counts.map((c) => c.count),
    DONUT_GAP,
  );
  return (
    <View style={styles.donutRow}>
      <View style={styles.donutBlock}>
        <View testID="site-donut" accessibilityRole="image" accessibilityLabel={aria} style={styles.donut}>
          <Svg width={DONUT} height={DONUT} viewBox={`0 0 ${DONUT} ${DONUT}`}>
            <Circle cx={center} cy={center} r={DONUT_RADIUS} fill="none" stroke={colors.surface3} strokeWidth={DONUT_STROKE} />
            {counts.map((c, i) => {
              const arc = arcs[i];
              if (!arc || arc.length <= 0) return null;
              return (
                <Path
                  key={c.site}
                  d={d}
                  fill="none"
                  stroke={siteColor[c.site]}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${arc.length} ${full}`}
                  strokeDashoffset={arc.offset}
                />
              );
            })}
          </Svg>
          <View style={styles.donutCenter} {...HIDDEN}>
            <AppText heading size={fontSize.xl} weight={800} lineHeight={24} style={styles.tabular}>
              {total}
            </AppText>
          </View>
        </View>
        {/* A unidade fica sob a rosca: dentro do furo de 46 px ela cobriria as fatias. */}
        <View {...HIDDEN}>
          <AppText size={fontSize.xs} color={colors.muted} align="center">
            {total === 1 ? "aplicação" : "aplicações"}
          </AppText>
        </View>
      </View>
      <View style={styles.legend} {...HIDDEN}>
        {counts.map((c) => (
          <View key={c.site} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: siteColor[c.site] }]} />
            <AppText size={fontSize.sm} color={colors.text2}>
              {c.label} {c.count}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

type Props = {
  timeline: DoseTimeline;
  injections: readonly InjectionEntry[];
  today: string;
};

/**
 * "Medicação injetável" na Evolução (EVOL-04): cartões "Por dose" (do mais recente ao mais antigo) e a
 * rosca dos locais nos últimos 90 dias. Informativo: nenhum peso, kcal ou variação aqui. Logo depois, como
 * irmão (a tela da Evolução não muda), o "Seu ciclo" (SERINGA-07) quando showsCycleGrid permite.
 */
export function TreatmentEvolCard({ timeline, injections, today }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const cards = doseCards(timeline, today);
  const { state } = useApp();
  const showsGrid = state.profile !== null && showsCycleGrid(state.profile, injections, today);
  return (
    <>
      <Card testID="evol-treatment-card" style={styles.card}>
        <View style={styles.head}>
          {/* Mesmo quadro do .evol-icon, no tom da medicação (o EvolIcon só conhece os tons do corpo e da rotina). */}
          <View style={styles.icon} {...HIDDEN}>
            <Syringe size={20} color={tone.fg} />
          </View>
          <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header" style={styles.grow}>
            Medicação injetável
          </AppText>
        </View>
        <AppText heading size={fontSize.base} weight={800} accessibilityRole="header">
          Por dose
        </AppText>
        <ScrollView
          testID="dose-carousel"
          horizontal
          role="list"
          accessibilityLabel="Por dose"
          {...webAttrs({ tabIndex: 0 })}
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
        >
          {cards.map((c) => (
            <View key={c.key} role="listitem" style={[styles.dose, c.isLatest && styles.doseLatest]}>
              <AppText heading size={fontSize["2xl"]} weight={800} color={tone.fg} style={styles.tabular}>
                {c.dose}
              </AppText>
              <AppText size={fontSize.sm} weight={700} numberOfLines={1}>
                {c.medication}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted}>
                {c.period}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted}>
                {c.count}
              </AppText>
              {c.isLatest && (
                <View style={styles.tag}>
                  <AppText size={fontSize.xs} weight={700} color={tone.fg}>
                    Mais recente
                  </AppText>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        <AppText heading size={fontSize.base} weight={800} accessibilityRole="header">
          Locais nos últimos 90 dias
        </AppText>
        <SiteDonut injections={injections} today={today} />
        <AppText size={fontSize.xs} color={colors.muted}>
          Informativo: siga a prescrição de quem acompanha seu tratamento.
        </AppText>
      </Card>
      {showsGrid && <CycleGridCard diary={state.diary} injections={injections} today={today} />}
    </>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: themeDomainTone(scheme).medication.bg },
  carousel: { gap: CARD_GAP, paddingBottom: 2 },
  dose: {
    width: CARD_WIDTH,
    gap: 2,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  doseLatest: { borderColor: themeDomainTone(scheme).medication.border, backgroundColor: themeDomainTone(scheme).medication.bg },
  tag: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 1,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).medication.border,
  },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  donutBlock: { alignItems: "center", gap: 2 },
  donut: { width: DONUT, height: DONUT },
  donutCenter: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  legend: { flex: 1, minWidth: 0, gap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
