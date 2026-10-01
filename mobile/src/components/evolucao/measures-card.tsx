import { Plus, Ruler as RulerIcon } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { FIGURE_VIEWBOX, MEASURE_LINES, OUTLINE, figurePercent } from "@shared/components/injecao/bodyViews";
import { sparklinePath } from "@shared/lib/charts";
import { COPY } from "@shared/lib/copy";
import { bodyMeasures, type BodyMeasures, type MeasureSeries } from "@shared/lib/measures";
import { ShapeElement } from "@/components/injecao/body-map";
import { AppText, Button, Card } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";

const FIGURE_WIDTH = 80;
const FIGURE_HEIGHT = (FIGURE_WIDTH * 224) / 100;
const LABEL_HEIGHT = 18;
const SPARK = { width: 64, height: 24 } as const;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Silhueta de frente com as linhas da cintura e do quadril (tracejadas quando não registradas) e os valores ao lado. */
function Silhouette({ measures }: { measures: BodyMeasures }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).body;
  const lines = [
    { key: "waist", line: MEASURE_LINES.waist, text: `Cintura ${measures.waist.latest ?? "—"}`, has: measures.waist.latest !== null, above: true },
    { key: "hip", line: MEASURE_LINES.hip, text: `Quadril ${measures.hip.latest ?? "—"}`, has: measures.hip.latest !== null, above: false },
  ];
  return (
    <View style={styles.silhouette} accessibilityRole="image" accessibilityLabel={measures.silhouetteAria} testID="measure-silhouette">
      <Svg viewBox={FIGURE_VIEWBOX} width={FIGURE_WIDTH} height={FIGURE_HEIGHT}>
        {/* Mesmo desenho do mapa, com as cores do tema (no claro, idênticas às de bodySilhouette). */}
        {OUTLINE.map((shape, index) => (
          <ShapeElement
            key={index}
            shape={{ ...shape, fill: index === 0 ? colors.figureFill : colors.figureHead, stroke: colors.figureLine }}
          />
        ))}
        {lines.map((l) => (
          <Line
            key={l.key}
            x1={l.line.x1}
            x2={l.line.x2}
            y1={l.line.y}
            y2={l.line.y}
            stroke={tone.fg}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={l.has ? undefined : "3 3"}
          />
        ))}
      </Svg>
      {/* A cintura fica logo acima da linha dela e o quadril logo abaixo: os rótulos nunca se sobrepõem. */}
      <View style={styles.labels} {...HIDDEN}>
        {lines.map((l) => {
          const y = (figurePercent({ cx: l.line.x2, cy: l.line.y }).top / 100) * FIGURE_HEIGHT;
          return (
            <View key={l.key} style={[styles.label, { top: l.above ? y - LABEL_HEIGHT : y }]}>
              <AppText size={fontSize.xs} weight={700} color={l.has ? colors.text : colors.muted} lineHeight={LABEL_HEIGHT} style={styles.tabular}>
                {l.text}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Uma medida: rótulo, mini tendência (com 2 ou mais pontos), último valor e a variação em navy. */
function TrendRow({ series }: { series: MeasureSeries }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).body;
  const spark = sparklinePath(
    series.points.map((p) => p.value),
    SPARK.width,
    SPARK.height,
  );
  return (
    <View style={styles.trend}>
      <AppText size={fontSize.sm} weight={700} style={styles.trendLabel}>
        {series.label}
      </AppText>
      {spark ? (
        <View accessibilityRole="image" accessibilityLabel={series.aria ?? undefined} testID="measure-sparkline">
          <Svg width={SPARK.width} height={SPARK.height}>
            <Path d={spark.d} fill="none" stroke={tone.fg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={spark.last.x} cy={spark.last.y} r={2.5} fill={tone.fg} />
          </Svg>
        </View>
      ) : (
        <View style={styles.sparkSpace} />
      )}
      <AppText size={fontSize.sm} weight={800} style={[styles.tabular, styles.grow]}>
        {series.latest}
      </AppText>
      {series.delta && series.since && (
        <View style={styles.delta}>
          <AppText size={fontSize.xs} weight={800} color={colors.white} style={styles.tabular} accessibilityLabel={`${series.delta} desde ${series.since}`}>
            {series.delta}
          </AppText>
        </View>
      )}
    </View>
  );
}

/**
 * Medidas (EVOL-10): silhueta com cintura e quadril, mini tendências e IMC, relação cintura/quadril e
 * gordura medida em pílulas neutras. Descritivo: sem faixas, classificação ou cor por valor. Não aparece
 * em perfil sensível (quem desenha a tela decide).
 */
export function MeasuresCard({ onRegister }: { onRegister: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const measures = bodyMeasures(state.measurements);
  const series = [measures.waist, measures.hip, measures.bodyFat].filter((s) => s.points.length > 0);
  return (
    <Card testID="measures-card" style={styles.card}>
      <View style={styles.head}>
        <EvolIcon icon={RulerIcon} tone="body" />
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header" style={styles.grow}>
          {COPY.measurements}
        </AppText>
        <Button label="Registrar" icon={Plus} variant="text" accessibilityLabel="Registrar medidas de cintura e quadril" onPress={onRegister} />
      </View>
      <Silhouette measures={measures} />
      {measures.isEmpty && (
        <AppText size={fontSize.sm} color={colors.muted}>
          Registre cintura e quadril para acompanhar as medidas aqui.
        </AppText>
      )}
      {series.length > 0 && (
        <View style={styles.trends}>
          {series.map((s) => (
            <TrendRow key={s.key} series={s} />
          ))}
        </View>
      )}
      {measures.chips.length > 0 && (
        <View role="list" style={styles.chips}>
          {measures.chips.map((chip) => (
            <View key={chip.text} role="listitem" aria-label={chip.aria} style={styles.chip}>
              <AppText size={fontSize.xs} weight={700} color={colors.text2} style={styles.tabular}>
                {chip.text}
              </AppText>
            </View>
          ))}
        </View>
      )}
      <AppText size={fontSize.xs} color={colors.muted}>
        Valores descritivos, sem classificação clínica automática.
      </AppText>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  silhouette: { flexDirection: "row", alignSelf: "center", gap: 10 },
  labels: { width: 112, height: FIGURE_HEIGHT },
  label: { position: "absolute", left: 0, right: 0, height: LABEL_HEIGHT, justifyContent: "center" },
  trends: { gap: 4 },
  trend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  trendLabel: { width: 64 },
  sparkSpace: { width: SPARK.width },
  // Variação neutra (navy), como o --wf-inverse do web: no escuro, o azul-ardósia do aviso.
  delta: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.inverse },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.slate100, borderWidth: 1, borderColor: colors.slate200 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
