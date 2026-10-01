import { Syringe } from "lucide-react-native";
import { useId, useState } from "react";
import {
  Platform,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { weightChartModel, type DoseOverlay, type TrendPoint } from "@shared/lib/evolution";
import { fmtNumber, fmtShortDate } from "@shared/lib/format";
import type { DoseTimeline } from "@shared/lib/treatment";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { fmtOneDecimal as kg } from "@/lib/format";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";

const HEIGHT = 220;
/** Com a faixa "Aplicações", o gráfico ganha altura para o chip da dose e os discos. */
const LANE_CHART_HEIGHT = 244;
const LANE_HEIGHT = 24;
const MIN_WIDTH = 240;
const BALLOON_WIDTH = 140;
/** O balão fica a pelo menos esta distância (centro) das bordas do gráfico. */
const BALLOON_HALF = 78;
const BALLOON_LIFT = 64;
/** Pílula do último valor ("72,4"): largura aproximada para ficar dentro do gráfico. */
const LAST_PILL_WIDTH = 46;
const LAST_PILL_HEIGHT = 20;
const LAST_PILL_GAP = 12;
const LAST_HALO_R = 12;
/** Distância vertical em que um rótulo do eixo do peso colidiria com a pílula do último valor. */
const Y_LABEL_CLEARANCE = 14;
/** Chip "2,50 mg/sem" acima da área do peso, dentro da faixa violeta. */
const DOSE_CHIP_TOP = 4;
const DOSE_CHIP_HEIGHT = 20;
/** Espaço do rótulo "Aplicações" antes da linha pontilhada da faixa. */
const LANE_LABEL_WIDTH = 78;
const MARK_SIZE = 20;
/** Faixa à parte (gráfico do chat, sem a pista): marcas pequenas sob o gráfico. */
const STRIP_HEIGHT = 24;
const STRIP_MARK = 6;
const IS_WEB = Platform.OS === "web";
const AXIS = { fontSize: fontSize.xs, fontFamily: fontFamily(600), fontWeight: "600" } as const;
const AXIS_Y = { fontSize: fontSize.xs, fontFamily: fontFamily(700), fontWeight: "700" } as const;
const AXIS_TODAY = { fontSize: fontSize.xs, fontFamily: fontFamily(800), fontWeight: "800" } as const;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Props = {
  points: TrendPoint[];
  start: string;
  /** Fim do eixo (hoje ou logo depois da próxima aplicação estimada). */
  end: string;
  /** Hoje, quando `end` vai além (padrão: `end`). */
  today?: string;
  /** Peso desejado; null sem meta ou em perfil sensível. */
  target: number | null;
  /** Degraus de dose registrados; null (ou ausente) em perfil sensível e sem aplicações. */
  dose?: DoseTimeline | null;
  /** Evolução (conceito 09): faixa "Aplicações" dentro do gráfico, meta só perto dos dados, 5 datas. */
  withLane?: boolean;
  /** Próxima aplicação estimada (só quem acompanha a frequência; nunca perfil calmo ou gestação). */
  nextDose?: string | null;
  /** Nome da medicação na legenda ("Tirzepatida"), com a faixa de doses. */
  medication?: string | null;
};

/** Tecla das setas → nova posição do cursor (null quando a tecla não move). */
function keyStep(key: string, current: number, lastIndex: number): number | null {
  if (key === "ArrowLeft") return Math.max(0, current - 1);
  if (key === "ArrowRight") return Math.min(lastIndex, current + 1);
  if (key === "Home") return 0;
  if (key === "End") return lastIndex;
  return null;
}

/**
 * Peso com pesagens (pontos vazados), tendência (linha em degradê) e o último valor numa pílula, desenhado na largura
 * medida do cartão para os rótulos não encolherem. Tocar ou arrastar (no web também o mouse e as setas) mostra o balão
 * com a data, o peso e a tendência. Com doses registradas, uma faixa violeta neutra cobre o período da dose (chip
 * "2,50 mg/sem" no topo) e a pista "Aplicações" mostra cada aplicação (a próxima, estimada, tracejada). Nome
 * acessível próprio e nenhum peso por dose.
 */
export function WeightTrendChart({ points, start, end, today = end, target, dose = null, withLane = false, nextDose = null, medication = null }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const gradientId = `wchart-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [width, setWidth] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  // Período trocado: zera a seleção no mesmo render (o índice antigo pode apontar outra pesagem).
  const [range, setRange] = useState(`${start}|${end}`);
  if (range !== `${start}|${end}`) {
    setRange(`${start}|${end}`);
    setActive(null);
  }
  const chartWidth = width ?? MIN_WIDTH;
  const height = withLane && dose ? LANE_CHART_HEIGHT : HEIGHT;
  const model = weightChartModel({
    points,
    start,
    end,
    today,
    target,
    width: chartWidth,
    height,
    dose,
    targetFit: withLane ? "near" : "fit",
    xTickCount: withLane ? 5 : undefined,
    laneHeight: withLane ? LANE_HEIGHT : 0,
    nextDose: withLane ? nextDose : null,
  });
  const { dots, plot, lane } = model;
  const overlay = model.dose;
  const last = dots[dots.length - 1];
  const selected = active !== null ? dots[active] : undefined;
  const shadeTop = overlay && lane ? DOSE_CHIP_TOP : plot.top;
  const shadeBottom = lane ? lane.bottom : plot.bottom;
  const describe = (d: TrendPoint) => `${fmtShortDate(d.date)}: ${kg(d.weight)} kg, tendência ${kg(d.trend)} kg`;
  const summary =
    dots.length && last
      ? `Peso: ${dots.length} ${dots.length === 1 ? "pesagem" : "pesagens"} no período, de ${kg(dots[0]!.weight)} a ${kg(last.weight)} kg; tendência atual ${kg(last.trend)} kg${target === null ? "" : `; meta ${kg(target)} kg`}. ${IS_WEB ? "Use as setas" : "Toque ou arraste"} para ver cada pesagem.`
      : "Sem pesagens neste período.";
  // A pílula do último valor fica à direita do ponto; sem espaço, passa para a esquerda.
  const pillLeft = last
    ? last.x + LAST_PILL_GAP + LAST_PILL_WIDTH > chartWidth
      ? last.x - LAST_PILL_GAP - LAST_PILL_WIDTH
      : last.x + LAST_PILL_GAP
    : 0;
  const pillCoversAxis = pillLeft + LAST_PILL_WIDTH > plot.right;
  const doseAria = overlay && overlay.next ? `${overlay.aria}; próxima aplicação estimada: ${fmtShortDate(overlay.next.date)}` : overlay?.aria;

  const nearest = (x: number) => {
    let best = 0;
    dots.forEach((d, i) => {
      if (Math.abs(d.x - x) < Math.abs(dots[best]!.x - x)) best = i;
    });
    return best;
  };
  const onTouch = (e: GestureResponderEvent) => {
    if (dots.length) setActive(nearest(e.nativeEvent.locationX));
  };
  const step = (key: string) => {
    if (!dots.length) return false;
    const next = keyStep(key, active ?? dots.length - 1, dots.length - 1);
    if (next === null) return false;
    setActive(next);
    return true;
  };
  const onAccessibilityAction = (e: AccessibilityActionEvent) => step(e.nativeEvent.actionName === "increment" ? "ArrowRight" : "ArrowLeft");
  // Só no web: setas do teclado, mouse sobre o gráfico e perda de foco (react-native-web repassa ao DOM).
  const webProps: object = IS_WEB
    ? {
        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
          if (step(e.key)) e.preventDefault();
        },
        onMouseMove: (e: { clientX: number; currentTarget: { getBoundingClientRect: () => { left: number } } }) => {
          if (dots.length) setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
        },
        onMouseLeave: () => setActive(null),
        onBlur: () => setActive(null),
      }
    : {};
  const balloonLeft = selected ? Math.min(Math.max(selected.x, BALLOON_HALF), chartWidth - BALLOON_HALF) - BALLOON_WIDTH / 2 : 0;
  return (
    <View style={styles.stack}>
      <View
        testID="weight-chart"
        style={[styles.chart, { height }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(MIN_WIDTH, Math.round(e.nativeEvent.layout.width)))}
        role={IS_WEB ? "group" : undefined}
        accessible
        accessibilityRole={IS_WEB ? undefined : "adjustable"}
        accessibilityLabel={summary}
        accessibilityValue={selected ? { text: describe(selected) } : undefined}
        accessibilityActions={dots.length ? [{ name: "increment" }, { name: "decrement" }] : undefined}
        onAccessibilityAction={onAccessibilityAction}
        tabIndex={dots.length ? 0 : -1}
        onStartShouldSetResponder={() => dots.length > 0}
        onMoveShouldSetResponder={() => dots.length > 0}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderTerminationRequest={() => true}
        {...webProps}
      >
        {width !== null && (
          <View pointerEvents="none">
            <Svg width={chartWidth} height={height}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.emerald} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={colors.emerald} stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id={`${gradientId}-trend`} gradientUnits="userSpaceOnUse" x1={plot.left} y1="0" x2={plot.right} y2="0">
                  <Stop offset="0" stopColor={colors.green500} />
                  <Stop offset="1" stopColor={colors.sky500} />
                </LinearGradient>
              </Defs>
              {/* Degraus de dose: fundo violeta neutro (o chip da dose vai por cima, fora do SVG). */}
              {overlay?.segments.map((segment) => (
                <Rect
                  key={segment.key}
                  x={segment.x}
                  y={shadeTop}
                  width={segment.width}
                  height={shadeBottom - shadeTop}
                  rx={lane ? 10 : 0}
                  fill={segment.isAlt ? tone.border : tone.bg}
                  opacity={segment.isAlt ? 0.6 : 0.85}
                />
              ))}
              {model.yTicks.map((tick) => (
                <Line key={`grid-${tick.label}`} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={colors.borderSoft} strokeWidth={1.5} />
              ))}
              {model.yTicks.map((tick) =>
                // O rótulo que ficaria sob a pílula do último valor sai (a pílula já diz o número).
                pillCoversAxis && last && Math.abs(tick.y - last.y) < Y_LABEL_CLEARANCE ? null : (
                  <SvgText key={`y-${tick.label}`} x={chartWidth - 4} y={tick.y + 4} textAnchor="end" fill={colors.muted} {...AXIS_Y}>
                    {tick.label}
                  </SvgText>
                ),
              )}
              {model.targetY !== null && (
                <Line
                  x1={plot.left}
                  x2={plot.right}
                  y1={model.targetY}
                  y2={model.targetY}
                  stroke={colors.green700}
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                />
              )}
              {dots.length > 1 && last && (
                <Path d={`${model.trendPath} L${last.x},${plot.bottom} L${dots[0]!.x},${plot.bottom} Z`} fill={`url(#${gradientId})`} />
              )}
              {dots.length > 1 && (
                <Path d={model.trendPath} fill="none" stroke={`url(#${gradientId}-trend)`} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {selected && <Line x1={selected.x} x2={selected.x} y1={plot.top} y2={shadeBottom} stroke={colors.muted} strokeDasharray="2 3" />}
              {lane && (
                <Line x1={plot.left + LANE_LABEL_WIDTH} x2={plot.right} y1={lane.y} y2={lane.y} stroke={colors.border} strokeWidth={1.5} strokeDasharray="2 4" />
              )}
              {last && <Circle cx={last.x} cy={last.y} r={LAST_HALO_R} fill={colors.mint100} opacity={0.9} />}
              {dots.map((d, i) => {
                const isLast = i === dots.length - 1;
                const isActive = i === active;
                return (
                  <Circle
                    key={d.id}
                    cx={d.x}
                    cy={d.y}
                    r={isLast ? 6 : isActive ? 5.5 : 4.5}
                    fill={isLast ? colors.green500 : colors.surface}
                    stroke={isActive ? colors.inverse : isLast ? colors.surface : colors.slate400}
                    strokeWidth={isActive ? 3 : isLast ? 2.5 : 2}
                  />
                );
              })}
              {model.xTicks.map((tick, i) => {
                const anchor = i === 0 ? "start" : i === model.xTicks.length - 1 && !lane ? "end" : "middle";
                const isToday = tick.label === "hoje";
                return (
                  <SvgText
                    key={`x-${tick.label}-${i}`}
                    x={tick.x}
                    y={height - 6}
                    textAnchor={anchor}
                    fill={isToday ? colors.text : colors.muted}
                    {...(isToday ? AXIS_TODAY : AXIS)}
                  >
                    {tick.label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>
        )}
        {width !== null && last ? (
          <View pointerEvents="none" style={[styles.lastPill, { left: Math.max(0, pillLeft), top: last.y - LAST_PILL_HEIGHT / 2 }]} {...HIDDEN}>
            <AppText heading size={fontSize.xs} weight={800} color={colors.white} lineHeight={16} style={styles.tabular}>
              {kg(last.weight)}
            </AppText>
          </View>
        ) : null}
        {width !== null && overlay && lane ? <DoseLaneOverlay overlay={overlay} lane={lane} width={chartWidth} aria={doseAria ?? overlay.aria} /> : null}
        {selected && (
          <View
            testID="weight-balloon"
            pointerEvents="none"
            {...HIDDEN}
            style={[styles.balloon, { left: balloonLeft, top: Math.max(0, Math.min(selected.y, selected.trendY) - BALLOON_LIFT) }]}
          >
            <AppText size={fontSize.xs} color={colors.muted}>
              {fmtShortDate(selected.date)}
            </AppText>
            <View style={styles.balloonRow}>
              <AppText heading size={fontSize.xl} weight={800} style={styles.tabular}>
                {kg(selected.weight)}{" "}
                <AppText size={fontSize.xs} color={colors.muted}>
                  kg
                </AppText>
              </AppText>
              <AppText size={fontSize.xs} weight={700} color={colors.green700} style={styles.tabular}>
                tend. {kg(selected.trend)}
              </AppText>
            </View>
          </View>
        )}
      </View>
      {width !== null && overlay && !lane ? <DoseStrip overlay={overlay} width={chartWidth} /> : null}
      <AppText aria-live="polite" accessibilityLiveRegion="polite" style={srOnly} testID="weight-live">
        {selected ? describe(selected) : ""}
      </AppText>
      <Legend target={target} medication={overlay ? (medication ?? "Dose registrada") : null} />
    </View>
  );
}

/**
 * Doses dentro do gráfico (conceito 09): o chip "2,50 mg/sem" no topo de cada degrau e a pista "Aplicações" com um
 * disco por aplicação (a próxima, estimada, tracejada). Informativa: sem peso por dose, sem curva de nível.
 */
function DoseLaneOverlay({ overlay, lane, width, aria }: { overlay: DoseOverlay; lane: { y: number }; width: number; aria: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  return (
    <View testID="dose-band" pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={aria} style={styles.laneBox}>
      {overlay.segments.map((segment) =>
        segment.showLabel ? (
          <View
            key={segment.key}
            style={[styles.doseChip, { left: segment.x + 6, top: DOSE_CHIP_TOP + 4, maxWidth: Math.max(0, width - segment.x - 10), backgroundColor: tone.border }]}
          >
            <Syringe size={12} color={tone.fg} />
            <AppText size={fontSize.xs} weight={700} color={tone.fg} lineHeight={16} numberOfLines={1} style={styles.tabular}>
              {segment.rate}
            </AppText>
          </View>
        ) : null,
      )}
      <View style={[styles.laneLabel, { top: lane.y - 8 }]}>
        <AppText size={fontSize.xs} weight={600} color={colors.muted} lineHeight={16}>
          Aplicações
        </AppText>
      </View>
      {overlay.marks.map((mark, i) => (
        <View key={`${mark.date}-${i}`} style={[styles.mark, { left: mark.x - MARK_SIZE / 2, top: lane.y - MARK_SIZE / 2 }]}>
          <Syringe size={11} color={colors.white} />
        </View>
      ))}
      {overlay.next ? (
        <View style={[styles.mark, styles.markNext, { left: overlay.next.x - MARK_SIZE / 2, top: lane.y - MARK_SIZE / 2 }]}>
          <Syringe size={11} color={tone.fg} />
        </View>
      ) : null}
    </View>
  );
}

/** Faixa das doses sob o gráfico (fora da Evolução, sem a pista): degraus e um ponto por aplicação. */
function DoseStrip({ overlay, width }: { overlay: DoseOverlay; width: number }) {
  const styles = useStyles();
  const tone = themeDomainTone(useTheme().scheme).medication;
  return (
    <View testID="dose-band" accessibilityRole="image" accessibilityLabel={overlay.aria} style={[styles.strip, { width }]}>
      {overlay.segments.map((segment) => (
        <View
          key={segment.key}
          style={[styles.stripSegment, { left: segment.x, width: segment.width, backgroundColor: segment.isAlt ? tone.border : tone.bg, borderColor: tone.border }]}
        >
          {segment.showLabel && (
            <AppText size={fontSize.xs} weight={700} color={tone.fg} numberOfLines={1}>
              {segment.label}
            </AppText>
          )}
        </View>
      ))}
      {overlay.marks.map((mark, i) => (
        <View key={`${mark.date}-${i}`} style={[styles.stripMark, { left: mark.x - STRIP_MARK / 2 }]} />
      ))}
    </View>
  );
}

/** Legenda numa linha (o leitor de tela já ouve o resumo do gráfico e o das doses); a meta vai para a direita. */
function Legend({ target, medication }: { target: number | null; medication: string | null }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.legend} {...HIDDEN}>
      <View style={styles.legendItem}>
        <View style={styles.dotHollow} />
        <AppText size={fontSize.sm} color={colors.text2}>
          Pesagem
        </AppText>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.lineTrend} />
        <AppText size={fontSize.sm} color={colors.text2}>
          Tendência
        </AppText>
      </View>
      {medication ? (
        <View style={styles.legendItem}>
          <View style={styles.dotDose} />
          <AppText size={fontSize.sm} color={colors.text2}>
            {medication}
          </AppText>
        </View>
      ) : null}
      {target !== null ? (
        <AppText size={fontSize.sm} weight={800} style={styles.legendTarget}>
          {`Meta ${fmtNumber(target, 1)} kg`}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  stack: { gap: 10, minWidth: 0 },
  chart: { width: "100%", borderRadius: radius.sm },
  tabular: { fontVariant: ["tabular-nums"] },
  lastPill: {
    position: "absolute",
    zIndex: 1,
    height: LAST_PILL_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inverse,
  },
  laneBox: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  doseChip: {
    position: "absolute",
    height: DOSE_CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  laneLabel: { position: "absolute", left: 0 },
  mark: {
    position: "absolute",
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.violet600,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  markNext: { backgroundColor: colors.surface, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.violet600 },
  balloon: {
    position: "absolute",
    zIndex: 2,
    width: BALLOON_WIDTH,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.float,
  },
  balloonRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  strip: { height: STRIP_HEIGHT, marginTop: 4, marginBottom: STRIP_MARK / 2 },
  stripSegment: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 6, overflow: "hidden", borderRadius: 6, borderWidth: 1 },
  stripMark: { position: "absolute", bottom: -STRIP_MARK / 2, width: STRIP_MARK, height: STRIP_MARK, borderRadius: STRIP_MARK / 2, backgroundColor: colors.violet600 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendTarget: { marginLeft: "auto" },
  dotHollow: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.slate400 },
  lineTrend: { width: 18, height: 4, borderRadius: radius.pill, backgroundColor: colors.emerald },
  dotDose: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.violet600 },
}));
