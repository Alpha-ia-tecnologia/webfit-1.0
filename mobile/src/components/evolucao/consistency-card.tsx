import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { arcPath, thirdArcs } from "@shared/lib/charts";
import { consistencyCalendar, type ConsistencyDay } from "@shared/lib/consistency";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";

/** Anel do dia: 32 pt, raio 13,5 e traço 3,2 (o 15,5/36 e 3,6 do web). */
const RING = 32;
const RING_RADIUS = 13.5;
const RING_STROKE = 3.2;
/** Hoje: anel escuro de 2 pt a 2 pt do dia (o box-shadow do web). */
const TODAY_BOX = RING + 8;
/** Um sétimo da largura: 7 colunas, uma por dia, sem rolagem lateral mesmo a 320 px. */
const COLUMN = `${100 / 7}%` as const;
/** Água, refeição e combinado, na mesma ordem da faixa da semana do Hoje. */
const ARCS = thirdArcs(14).map((arc, i) => ({ ...arc, key: (["water", "meal", "habit"] as const)[i]! }));
/** Contagens do conceito: refeições, água e combinados (dias até hoje). */
const TILES = [
  { key: "meal", label: "Refeições" },
  { key: "water", label: "Água" },
  { key: "habit", label: "Combinados" },
] as const;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/**
 * Anel do dia: um terço por presença; ausência é só o trilho neutro (nunca rosa ou âmbar). Também na capa de "Sua
 * semana" (as cores do Hoje). `calendar`: as cores de "Seus registros" (água céu, refeição verde, combinado índigo).
 */
export function DayRing({ day, calendar = false }: { day: ConsistencyDay; calendar?: boolean }) {
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme);
  const on = calendar
    ? { water: colors.sky500, meal: colors.green500, habit: colors.indigo500 }
    : { water: tone.water.fg, meal: tone.food.fg, habit: tone.habit.fg };
  const center = RING / 2;
  return (
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
      {ARCS.map((arc) => (
        <Path
          key={arc.key}
          d={arcPath(center, center, RING_RADIUS, arc.start, arc.sweep)}
          fill="none"
          stroke={day[arc.key] ? on[arc.key] : colors.border}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

/**
 * "Seus registros" (EVOL-09, conceito 09): calendário das últimas 4 semanas, de segunda a domingo, com o anel do que
 * foi registrado em cada dia (água, refeição, combinado). Dia sem registro é um círculo tracejado; os dias que ainda
 * não chegaram ficam apagados. As contagens descrevem os dias até hoje: nada conta dias seguidos nem cobra o que faltou.
 */
export function ConsistencyCard({ today }: { today: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const cal = consistencyCalendar(state, today);
  const { elapsed } = cal.counts;
  const dot = { meal: colors.green500, water: colors.sky500, habit: colors.indigo500 } as const;
  return (
    <Card testID="consistency-card" style={styles.card}>
      <View style={styles.head}>
        <EvolIcon icon={CalendarDays} tone="calendar" size="md" />
        <View style={styles.grow}>
          <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
            Seus registros
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted}>
            Últimas 4 semanas
          </AppText>
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.row} {...HIDDEN}>
          {cal.weekdays.map((weekday, i) => (
            <View key={`${weekday}-${i}`} style={styles.cell}>
              <AppText size={fontSize.xs} weight={700} color={colors.muted}>
                {weekday}
              </AppText>
            </View>
          ))}
        </View>
        <View role="list" aria-label={cal.aria} style={[styles.row, styles.days]}>
          {cal.rows.flat().map((day) =>
            day.isFuture ? (
              <View key={day.date} style={styles.cell} {...HIDDEN}>
                <View style={styles.todayBox}>
                  <View style={[styles.circle, styles.future]}>
                    <AppText size={fontSize.xs} weight={700} color={colors.muted} style={[styles.tabular, styles.faded]}>
                      {day.day}
                    </AppText>
                  </View>
                </View>
              </View>
            ) : (
              <View
                key={day.date}
                accessible
                role="listitem"
                aria-label={day.aria}
                {...webAttrs({ "aria-current": day.isToday ? "date" : undefined })}
                testID="consistency-day"
                style={styles.cell}
              >
                <View style={[styles.todayBox, day.isToday && styles.today]}>
                  <View style={[styles.circle, !day.hasRecord && styles.empty]}>
                    {day.hasRecord ? (
                      <View style={styles.ring} {...HIDDEN}>
                        <DayRing day={day} calendar />
                      </View>
                    ) : null}
                    <AppText size={fontSize.xs} weight={day.isToday ? 800 : 700} color={colors.text} style={styles.tabular} {...HIDDEN}>
                      {day.day}
                    </AppText>
                  </View>
                </View>
              </View>
            ),
          )}
        </View>
      </View>
      <View role="list" aria-label="Dias com registro nas 4 semanas" style={styles.tiles}>
        {TILES.map((tile) => (
          <View key={tile.key} role="listitem" style={styles.tile}>
            <View style={styles.tileLabel} {...HIDDEN}>
              <View style={[styles.dot, { backgroundColor: dot[tile.key] }]} />
              <AppText size={fontSize.xs} color={colors.muted} numberOfLines={1}>
                {tile.label}
              </AppText>
            </View>
            <AppText {...HIDDEN} style={styles.tabular}>
              <AppText heading size={fontSize.lg} weight={800}>
                {String(cal.counts[tile.key])}
              </AppText>
              <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                {`/${elapsed} dias`}
              </AppText>
            </AppText>
            <AppText style={srOnly}>{`${tile.label}: ${cal.counts[tile.key]} de ${elapsed} dias`}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  grid: { gap: 6 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  days: { rowGap: 4 },
  cell: { width: COLUMN, alignItems: "center" },
  todayBox: {
    width: TODAY_BOX,
    height: TODAY_BOX,
    borderRadius: TODAY_BOX / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  today: { borderColor: colors.text },
  circle: { width: RING, height: RING, borderRadius: RING / 2, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", top: 0, left: 0 },
  // Dia sem registro: só o círculo tracejado; dia que ainda não chegou: número apagado num disco claro.
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.slate300 },
  future: { borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: colors.surface2 },
  faded: { opacity: 0.55 },
  // Três blocos lado a lado; sem espaço (320 pt), quebram como o auto-fit de 88 px do web.
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  // "Combinados" cabe inteiro a 390 pt: respiro lateral de 8 e ponto de 8 com 4 de folga.
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 88, minWidth: 0, gap: 6, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.surface2 },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
