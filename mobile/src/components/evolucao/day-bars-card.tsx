import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line } from "react-native-svg";
import { dailyChartDescription } from "@shared/components/evolucao/chart-geometry";
import { dayBars, type DayPoint } from "@shared/lib/evolution";
import type { SeriesInsight } from "@shared/lib/progress-insights";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, vertical, type ThemeColors } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";
import { InsightChips } from "./insight-chips";

export type BarTone = "food" | "water" | "protein" | "meals";

/** Cor das barras por domínio: da base clara ao topo forte (hoje fica na cor forte). */
function barTones(colors: ThemeColors): Record<BarTone, { from: string; to: string }> {
  return {
    food: { from: colors.amber200, to: colors.green600 },
    water: { from: colors.sky100, to: colors.blue },
    protein: { from: colors.mint200, to: colors.green700 },
    meals: { from: colors.surface3, to: colors.marker },
  };
}

const BARS_HEIGHT = 88;
/** Mini gráfico compacto da Evolução (conceito 09): barras mais baixas. */
const COMPACT_BARS_HEIGHT = 56;
/** Barra mínima de um dia com registro (em % da altura), para não sumir. */
const MIN_FILL_PCT = 4;
const pct = (value: number): DimensionValue => `${value}%`;

type Props = {
  /** Nome da série, ex.: "Calorias". */
  title: string;
  icon: LucideIcon;
  tone: BarTone;
  points: DayPoint[];
  today: string;
  /** Unidade da descrição acessível e da média. */
  unit: string;
  /** Formata a média (ex.: 2.200 ml → "2,2"). */
  format: (value: number) => string;
  /** Unidade exibida ao lado da média (ex.: "L"). */
  unitLabel: string;
  /** Texto depois de "média/dia", ex.: "meta 1.645" (só sem `insight`: o gráfico do chat). */
  goalText?: string | null;
  /** Destaques calculados da Evolução (EVOL-06): trocam a legenda "média/dia" por pílulas. */
  insight?: SeriesInsight;
  /** Faixa de referência (proteína). */
  band?: { min: number; max: number } | null;
  emptyText: string;
  style?: StyleProp<ViewStyle>;
  /**
   * compact (Evolução, conceito 09): média grande, "média/dia · meta 1.645" e as barras; o cartão inteiro abre os
   * detalhes (período e destaques) com `onOpen`.
   */
  variant?: "full" | "compact";
  onOpen?: () => void;
  /** Padrão `mini-<tom>`; a folha de detalhes usa `series-<tom>` (o mini gráfico continua na tela por trás). */
  testID?: string;
};

/** Barras de 7 ou 28 dias: média no topo, hoje destacado, dia sem registro tracejado. */
export function DayBarsCard({
  title,
  icon,
  tone,
  points,
  today,
  unit,
  format,
  unitLabel,
  goalText,
  insight,
  band = null,
  emptyText,
  style,
  variant = "full",
  onOpen,
  testID,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { bars, goal, goalPct, average, bandPct } = dayBars(points, today, band);
  const isLong = points.length > 7;
  const isCompact = variant === "compact";
  const colorsOf = barTones(colors)[tone];
  // Compacto: a meta vigente depois de "média/dia" vem do insight (regras de privacidade); sem pílulas.
  const caption = isCompact ? (insight?.goalText ?? goalText ?? null) : goalText;
  const showsChips = !!insight && !isCompact;
  return (
    <Card style={[styles.card, isCompact && styles.compact, style]} testID={testID ?? `mini-${tone}`}>
      <View style={styles.head}>
        <EvolIcon icon={icon} tone={tone} size={isCompact ? "xs" : "sm"} />
        <AppText heading size={isCompact ? fontSize.base : fontSize.md} weight={700} accessibilityRole="header" style={styles.grow}>
          {title}
        </AppText>
      </View>
      {average === null ? (
        <AppText size={fontSize.sm} color={colors.muted} style={styles.spaced}>
          {emptyText}
        </AppText>
      ) : (
        <>
          <View style={[styles.valueRow, styles.spaced]}>
            <AppText
              heading
              size={isCompact ? fontSize["2xl"] : fontSize["3xl"]}
              weight={800}
              tracking={-0.03}
              lineHeight={isCompact ? 28 : 34}
              style={styles.tabular}
            >
              {format(average)}
            </AppText>
            <AppText size={fontSize.sm} weight={600} color={colors.muted}>
              {showsChips ? `${unitLabel}/dia` : unitLabel}
            </AppText>
          </View>
          {showsChips && insight ? (
            <InsightChips chips={insight.chips} label={`Destaques de ${title}`} />
          ) : (
            <AppText size={fontSize.xs} color={colors.muted}>
              média/dia
              {caption ? (
                <>
                  {" · "}
                  <AppText size={fontSize.xs} weight={700} color={isCompact ? colors.text : colors.text2}>
                    {caption}
                  </AppText>
                </>
              ) : null}
            </AppText>
          )}
        </>
      )}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={dailyChartDescription(title, points, unit, goal)}
        style={[styles.bars, isCompact && styles.compactBars, isLong && styles.long]}
      >
        {bandPct && <View style={[styles.band, { bottom: pct(bandPct.min), height: pct(bandPct.max - bandPct.min) }]} />}
        {goalPct !== null && (
          <View style={[styles.goal, { bottom: pct(goalPct) }]} pointerEvents="none">
            <Svg width="100%" height={2}>
              <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.muted} strokeWidth={1.5} strokeDasharray="4 3" />
            </Svg>
          </View>
        )}
        {bars.map((bar) => (
          <View key={bar.date} style={styles.bar}>
            {bar.hasRecord ? (
              <View style={[styles.fill, { height: pct(Math.max(MIN_FILL_PCT, bar.heightPct)) }]}>
                {bar.isToday ? (
                  <View style={[StyleSheet.absoluteFill, styles.round, { backgroundColor: colorsOf.to }]} />
                ) : (
                  <LinearGradient
                    colors={[colorsOf.to, colorsOf.from]}
                    start={vertical.start}
                    end={vertical.end}
                    style={[StyleSheet.absoluteFill, styles.round]}
                  />
                )}
              </View>
            ) : (
              <View style={styles.empty} />
            )}
          </View>
        ))}
      </View>
      <View style={[styles.labels, isCompact && styles.compactLabels, isLong && styles.long]} aria-hidden importantForAccessibility="no-hide-descendants">
        {bars.map((bar) => (
          <View key={bar.date} style={styles.labelSlot}>
            <View style={styles.labelBox}>
              <AppText size={fontSize["2xs"]} weight={bar.isToday ? 800 : 600} color={bar.isToday ? colors.text : colors.muted} lineHeight={14}>
                {isLong ? bar.label : bar.label.charAt(0)}
              </AppText>
            </View>
          </View>
        ))}
      </View>
      {isCompact && onOpen ? (
        // O cartão inteiro abre os detalhes (o título continua um cabeçalho e o gráfico, uma imagem com nome).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}: ver detalhes`}
          {...webAttrs({ "aria-haspopup": "dialog" })}
          onPress={onOpen}
          style={({ pressed }) => [StyleSheet.absoluteFill, styles.hit, pressed && styles.hitPressed]}
        />
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 4, padding: 16 },
  compact: { gap: 2, padding: 12 },
  hit: { borderRadius: radius.card },
  hitPressed: { backgroundColor: colors.pressedInk },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flexShrink: 1 },
  spaced: { marginTop: 8 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: BARS_HEIGHT, marginTop: 10 },
  long: { gap: 2 },
  compactBars: { height: COMPACT_BARS_HEIGHT, marginTop: 12 },
  compactLabels: { marginTop: 6 },
  band: { position: "absolute", left: 0, right: 0, borderRadius: 6, backgroundColor: colors.mint100 },
  goal: { position: "absolute", left: 0, right: 0, height: 2, marginBottom: -1, zIndex: 2 },
  bar: { flex: 1, height: "100%", justifyContent: "flex-end", zIndex: 1 },
  fill: { width: "100%" },
  round: { borderRadius: radius.pill },
  // Dia sem registro: contorno tracejado baixo, não uma barra zerada.
  empty: { width: "100%", height: "14%", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.pill },
  labels: { flexDirection: "row", gap: 6, marginTop: 6 },
  labelSlot: { flex: 1, minWidth: 0, alignItems: "center" },
  labelBox: { width: 40, alignItems: "center" },
}));
