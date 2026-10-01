import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { fmtLiters } from "@shared/lib/format";
import { liters, type WeekDay } from "@shared/lib/today";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, vertical } from "@/theme/tokens";

/** Barra mínima para dias com algum registro, em % da altura do gráfico. */
const MIN_BAR_PERCENT = 8;
const MIN_REFERENCE_ML = 500;
/** Altura da área das barras (HOJE-03). */
const PLOT_HEIGHT = 72;
const BAR_MAX_WIDTH = 22;
const EMPTY_BAR_HEIGHT = 4;
const COLUMN_GAP = 8;
/** Traço da linha da meta (px de traço e de folga). */
const DASH = "4 3";

/** Linha tracejada horizontal (a meta e a amostra da legenda). */
function DashedLine({ width }: { width: number | `${number}%` }) {
  const colors = useThemeColors();
  return (
    <Svg width={width} height={2}>
      <Line x1={0} y1={1} x2="100%" y2={1} stroke={colors.sky600} strokeWidth={2} strokeDasharray={DASH} />
    </Svg>
  );
}

function DayBar({ day, goalMl, reference }: { day: WeekDay; goalMl: number | null; reference: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isMet = goalMl !== null && day.ml >= goalMl;
  // Barra comum: azul embaixo clareando para cima; a do dia que bateu a meta fica mais funda.
  const fill = isMet ? ([colors.blue, colors.sky600] as const) : ([colors.sky100, colors.blue] as const);
  const percent = day.ml > 0 ? Math.max(MIN_BAR_PERCENT, (day.ml / reference) * 100) : 0;
  return (
    <View style={[styles.col, day.isFuture && styles.future]}>
      {percent > 0 ? (
        <View style={[styles.bar, { height: `${percent}%` }, day.isToday && styles.barToday]}>
          <View style={styles.barClip}>
            <LinearGradient
              colors={fill}
              start={vertical.start}
              end={vertical.end}
              style={StyleSheet.absoluteFill}
            />
            {isMet && (
              <View testID="water-met-check">
                <Check size={10} strokeWidth={3.5} color={colors.surface} />
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.empty} />
      )}
    </View>
  );
}

/**
 * Semana da água em 72 px (HOJE-03): uma coluna por dia (segunda a domingo), a meta como linha
 * tracejada e um check nos dias em que ela foi atingida. O resumo acessível lista os litros.
 */
export function WaterWeek({ days, goalMl }: { days: WeekDay[]; goalMl: number | null }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const reference = Math.max(goalMl ?? 0, MIN_REFERENCE_ML, ...days.map((d) => d.ml));
  const metCount = goalMl === null ? 0 : days.filter((d) => d.ml >= goalMl).length;
  const description = [
    `Água registrada nesta semana: ${days.map((d) => `${d.label} ${liters(d.ml)} L`).join(", ")}`,
    goalMl !== null ? `meta de ${fmtLiters(goalMl)} por dia, atingida em ${metCount} ${metCount === 1 ? "dia" : "dias"}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <View style={styles.chart} accessible accessibilityRole="image" accessibilityLabel={description} testID="water-chart">
      <LinearGradient
        colors={[colors.sky50, colors.surface3]}
        start={vertical.start}
        end={vertical.end}
        style={[StyleSheet.absoluteFill, styles.backdrop]}
      />
      {goalMl !== null && (
        <View style={styles.legend}>
          <DashedLine width={14} />
          <AppText size={fontSize.xs} weight={600} color={colors.muted} lineHeight={16}>
            Meta {fmtLiters(goalMl)}
          </AppText>
        </View>
      )}
      <View style={styles.plot}>
        {goalMl !== null && (
          <View testID="water-goal-line" pointerEvents="none" style={[styles.goal, { bottom: `${(goalMl / reference) * 100}%` }]}>
            <DashedLine width="100%" />
          </View>
        )}
        {days.map((d) => (
          <DayBar key={d.date} day={d} goalMl={goalMl} reference={reference} />
        ))}
      </View>
      <View style={styles.days}>
        {days.map((d) => (
          <AppText
            key={d.date}
            size={fontSize.xs}
            weight={d.isToday ? 800 : 600}
            color={d.isToday ? colors.text : colors.muted}
            align="center"
            lineHeight={16}
            style={styles.dayLabel}
          >
            {d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  chart: {
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backdrop: { borderRadius: radius.md },
  legend: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", gap: 6 },
  plot: { flexDirection: "row", alignItems: "flex-end", gap: COLUMN_GAP, height: PLOT_HEIGHT },
  goal: { position: "absolute", left: -4, right: -4, height: 2, marginBottom: -1, zIndex: 1, opacity: 0.55 },
  col: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  future: { opacity: 0.5 },
  bar: { width: "100%", maxWidth: BAR_MAX_WIDTH, borderRadius: radius.pill },
  /** Anel do dia de hoje, por fora da barra (a barra recorta só o gradiente). */
  barToday: { boxShadow: `0px 0px 0px 2px ${colors.surface}, 0px 0px 0px 4px ${colors.mint200}` },
  barClip: { flex: 1, alignItems: "center", paddingTop: 3, borderRadius: radius.pill, overflow: "hidden" },
  empty: { width: "100%", maxWidth: BAR_MAX_WIDTH, height: EMPTY_BAR_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  days: { flexDirection: "row", gap: COLUMN_GAP },
  dayLabel: { flex: 1 },
}));
