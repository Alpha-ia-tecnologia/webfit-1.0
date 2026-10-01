import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react-native";
import { useId, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { monthShort, monthWindow, PACE_LABEL, type WeightProjection } from "@shared/lib/body-metrics";
import { fmtNumber } from "@shared/lib/format";
import { PROJECTION_COPY } from "@shared/lib/plan-reveal";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, IconTile } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows } from "@/theme/tokens";

/** Geometria do gráfico do web (px; a largura é a medida do cartão, a altura é fixa). */
const H = 150;
const LEFT = 14;
const RIGHT = 12;
const HIGH = 30;
const LOW = 104;
const AXIS_Y = H - 6;
const MIN_LABEL_GAP = 30;
const DAY_MS = 86_400_000;
const VALUE_TEXT = { fontSize: fontSize.base, fontFamily: fontFamily(800, true) } as const;
const AXIS_TEXT = { fontSize: fontSize.sm, fontFamily: fontFamily(600) } as const;
const AXIS_STRONG = { fontSize: fontSize.sm, fontFamily: fontFamily(700) } as const;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
const monthStart = (month: string) => `${month}-01`;
function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}
/** Curva suave de (x0, y0) até (x1, y1), plana nas duas pontas. */
const ease = (x0: number, y0: number, x1: number, y1: number) =>
  `C ${x0 + (x1 - x0) * 0.45} ${y0} ${x0 + (x1 - x0) * 0.55} ${y1} ${x1} ${y1}`;

type ChartProps = {
  width: number;
  current: number;
  target: number;
  goal: string;
  today: string;
  fromMonth: string;
  toMonth: string;
};

/**
 * Faixa de chegada ao peso desejado (ANAM-13), como no web: de hoje até o fim da janela de meses, a linha
 * sai do peso atual e se desfaz numa faixa menta sobre os meses possíveis; a meta é uma linha pontilhada.
 * Nunca um ponto final nem um dia: só a janela de meses (0,25 a 0,5 kg por semana).
 */
function ProjectionChart({ width: W, current, target, goal, today, fromMonth, toMonth }: ChartProps) {
  const colors = useThemeColors();
  const id = `plan-proj-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const start = dayNumber(today);
  const span = Math.max(1, dayNumber(monthEnd(toMonth)) - start);
  const x = (date: string) => LEFT + ((dayNumber(date) - start) / span) * (W - LEFT - RIGHT);
  const isGain = goal === "ganhar";
  const yStart = isGain ? LOW : HIGH;
  const yGoal = isGain ? HIGH : LOW;
  const xFast = Math.max(LEFT + 24, x(monthStart(fromMonth)));
  const xEnd = W - RIGHT;
  const fast = `M ${LEFT} ${yStart} ${ease(LEFT, yStart, xFast, yGoal)}`;
  const wedge = `${fast} L ${xEnd} ${yGoal} C ${LEFT + (xEnd - LEFT) * 0.55} ${yGoal} ${LEFT + (xEnd - LEFT) * 0.45} ${yStart} ${LEFT} ${yStart} Z`;
  const line = `M ${LEFT} ${yStart} C ${LEFT + (xEnd - LEFT) * 0.35} ${yStart} ${xFast + (xEnd - xFast) * 0.15} ${yGoal} ${xEnd} ${yGoal}`;
  const fadeAt = Math.min(1, Math.max(0, (xFast - LEFT) / (xEnd - LEFT)));
  const labels: { key: string; x: number; text: string; isWindow: boolean }[] = [];
  let lastX = LEFT;
  for (let month = nextMonth(today.slice(0, 7)); month <= toMonth; month = nextMonth(month)) {
    const at = x(monthStart(month));
    if (at - lastX < MIN_LABEL_GAP || at > xEnd - 8) continue;
    labels.push({ key: month, x: at, text: monthShort(month), isWindow: month >= fromMonth });
    lastX = at;
  }
  const bandTop = Math.min(yStart, yGoal) - 16;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.mint50} stopOpacity={0.2} />
          <Stop offset="1" stopColor={colors.mint100} stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id={`${id}-line`} gradientUnits="userSpaceOnUse" x1={LEFT} y1="0" x2={xEnd} y2="0">
          <Stop offset="0" stopColor={colors.sky500} />
          <Stop offset={fadeAt} stopColor={colors.green500} />
          <Stop offset="1" stopColor={colors.green500} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={xFast} y={bandTop} width={xEnd - xFast} height={Math.abs(yGoal - bandTop)} fill={`url(#${id}-band)`} />
      <Line x1={xFast} y1={bandTop} x2={xFast} y2={AXIS_Y - 14} stroke={colors.mint300} strokeWidth={1.5} strokeDasharray="2 4" />
      <Path d={wedge} fill={colors.mint100} fillOpacity={0.55} />
      <Line x1={LEFT} y1={yGoal} x2={xEnd} y2={yGoal} stroke={colors.green500} strokeWidth={2} strokeDasharray="4 5" />
      <Path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={LEFT} cy={yStart} r={6} fill={colors.surface} stroke={colors.sky500} strokeWidth={3} />
      <SvgText x={LEFT + 12} y={yStart - 10} fill={colors.text} {...VALUE_TEXT}>
        {`${fmtNumber(current, 1)} kg`}
      </SvgText>
      <SvgText x={xEnd} y={yGoal - 8} textAnchor="end" fill={colors.green700} {...VALUE_TEXT}>
        {`${fmtNumber(target, 1)} kg`}
      </SvgText>
      <SvgText x={LEFT - 4} y={AXIS_Y} fill={colors.text} {...AXIS_STRONG}>
        hoje
      </SvgText>
      {labels.map((label) => (
        <SvgText
          key={label.key}
          x={label.x}
          y={AXIS_Y}
          textAnchor="middle"
          fill={label.isWindow ? colors.green700 : colors.muted}
          {...(label.isWindow ? AXIS_STRONG : AXIS_TEXT)}
        >
          {label.text}
        </SvgText>
      ))}
    </Svg>
  );
}

type Props = {
  projection: WeightProjection;
  current: number;
  target: number;
  goal: string;
  today: string;
  usesPen: boolean;
};

/**
 * "Projeção segura" no plano (ProjectionCard do web): meta, ritmo e a janela de meses, com o gráfico em
 * faixa. Só aparece para perfis elegíveis (o plano decide com canShowProjection e "Ocultar números do
 * corpo"). "Caminho longo" e "abaixo da referência" mostram só o texto, sem gráfico.
 */
export function ProjectionCard({ projection, current, target, goal, today, usesPen }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const { fromMonth, toMonth } = projection;
  const range = projection.kind === "range" && fromMonth && toMonth ? { fromMonth, toMonth } : null;
  const Trend = goal === "ganhar" ? TrendingUp : TrendingDown;
  return (
    <View testID="plan-projection" style={styles.card}>
      <View style={styles.head}>
        <IconTile tone="food" size="md" icon={Trend} />
        <View style={styles.headText}>
          <AppText heading size={fontSize.md} weight={800} lineHeight={24} accessibilityRole="header">
            {PROJECTION_COPY.title}
          </AppText>
          <View style={styles.why}>
            <View style={styles.icon}>
              <ShieldCheck size={14} color={colors.green700} />
            </View>
            <AppText size={fontSize.xs} lineHeight={19} color={colors.muted} style={styles.shrink}>
              {PROJECTION_COPY.why}
            </AppText>
          </View>
        </View>
      </View>
      {range ? (
        <>
          <View style={styles.strip}>
            <StripCell label="Meta" value={`${fmtNumber(target, 1)} kg`} />
            <StripCell label="Ritmo sugerido" value={projection.paceLabel ?? PACE_LABEL} isWide />
            <StripCell label="Estimativa" value={monthWindow(range.fromMonth, range.toMonth)} />
          </View>
          <View {...HIDDEN} style={styles.chart} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {width > 0 ? (
              <ProjectionChart
                width={width}
                current={current}
                target={target}
                goal={goal}
                today={today}
                fromMonth={range.fromMonth}
                toMonth={range.toMonth}
              />
            ) : null}
          </View>
          <AppText style={srOnly}>{`${projection.title}.`}</AppText>
          <AppText size={fontSize.xs} lineHeight={17} color={colors.muted}>
            {PROJECTION_COPY.estimate}
            {usesPen ? PROJECTION_COPY.pen : ""}
          </AppText>
        </>
      ) : (
        <>
          {projection.title ? (
            <AppText weight={700} lineHeight={20}>
              {projection.title}
            </AppText>
          ) : null}
          <AppText size={fontSize.xs} lineHeight={17} color={colors.muted}>
            {projection.caption}
          </AppText>
        </>
      )}
    </View>
  );
}

/**
 * Uma célula da faixa "Meta · Ritmo sugerido · Estimativa". A 390 px tudo cabe numa linha; em telas de
 * 320 px o ritmo quebra em duas linhas em vez de ser cortado.
 */
function StripCell({ label, value, isWide = false }: { label: string; value: string; isWide?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.cell, isWide ? styles.cellWide : styles.cellFit]}>
      <AppText size={fontSize.xs} lineHeight={19} color={colors.muted}>
        {label}
      </AppText>
      <AppText heading size={fontSize.md} weight={800} lineHeight={24}>
        {value}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // .plan-projection: superfície, raio 24, sombra de flutuação
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.float,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  why: { flexDirection: "row", alignItems: "center", gap: 5 },
  // Um <svg> solto encolhe ao lado de texto longo no export web; a View o mantém no tamanho.
  icon: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  strip: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  // 7 + 1 de borda: a mesma altura do web (lá a borda é uma sombra interna, fora do fluxo).
  cell: { minWidth: 0, paddingVertical: 7, paddingHorizontal: 12 },
  cellFit: { flexShrink: 0 },
  cellWide: { flex: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  chart: { height: H },
}));
