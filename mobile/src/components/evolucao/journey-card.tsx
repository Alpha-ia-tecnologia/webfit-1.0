import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarClock,
  EyeOff,
  Flag,
  Minus,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { BODY_PRIVACY_COPY, hiddenJourneyText } from "@shared/lib/body-privacy";
import { arcDash } from "@shared/lib/charts";
import { COPY } from "@shared/lib/copy";
import { fmtDayMonth, type Journey, type NextWeighIn, type StartItem } from "@shared/lib/evolution";
import { fmtNumber, fmtRelDate } from "@shared/lib/format";
import { circlePath } from "@/components/hoje/ring-path";
import { AppText, Button, Card } from "@/components/ui";
import { Metric } from "@/components/ui/metric";
import { fmtOneDecimal as kg1 } from "@/lib/format";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { diagonalDown, fontSize, gradients, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";

const TRACK_SEGMENTS = 10;
/** Marcador na ponta do progresso: anel de 22 pt com borda verde e ponto no centro. */
const KNOB = 22;
const TRACK_HEIGHT = 8;
/** "76,4", "66": a meta redonda não ganha ",0" (como o web). */
const kgShort = (n: number) => fmtNumber(n, 1);
/** Variação com sinal e uma casa, sem a unidade: "−0,5", "+1,2". */
const signedNumber = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${kg1(Math.abs(n))}`;

/** Mistura duas cores hex (a trilha vai do verde ao teal, o color-mix do web). */
function mixHex(from: string, to: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  if (from.length !== 7 || to.length !== 7 || a.some(Number.isNaN) || b.some(Number.isNaN)) return from;
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
const RING = { size: 36, radius: 15, stroke: 4 } as const;

/** Botão "+" do cartão (o único "Registrar medidas" da tela): 40 pt em degradê, como no conceito; toque de 44. */
function AddButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={COPY.measure} onPress={onPress} style={styles.addTarget}>
      {({ pressed }) => (
        <View style={[styles.add, pressed && styles.addPressed]}>
          <LinearGradient colors={gradients.button} start={diagonalDown.start} end={diagonalDown.end} style={[StyleSheet.absoluteFill, styles.addFill]} />
          <View>
            <Plus size={20} color={colors.white} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

function Head({ title }: { title: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <AppText size={fontSize.xs} weight={800} tracking={0.08} upper color={colors.green700} accessibilityRole="header" style={styles.kicker}>
      {title}
    </AppText>
  );
}

/** Fundo com o brilho verde-menta no canto (radial-gradient do web). */
function Glow() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <LinearGradient
      colors={[colors.mint100, colors.surface]}
      locations={[0, 0.62]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.glow]}
      pointerEvents="none"
    />
  );
}

function Strong({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <AppText size={fontSize.xs} weight={800} style={styles.tabular}>
      {children}
    </AppText>
  );
}

type Stat = { label: string; value: string; unit: string; detail: string | null };

/** Sinal da variação com o menos tipográfico: o selo fala "−4,0 kg" com a casa decimal. */
const signOf = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
/** Variação de uma medida com a unidade: "−4,9 cm". */
const signedWithUnit = (n: number, unit: string) => `${signedNumber(n)} ${unit}`;

/** "Próxima pesagem": tom de água, sem cobrança (nunca vermelho, nem quando passou do dia). */
function NextPill({ next }: { next: NextWeighIn }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  return (
    <View style={styles.next} testID="journey-next">
      <CalendarClock size={16} color={themeDomainTone(scheme).water.fg} />
      <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.tabular}>
        {next.label}
      </AppText>
    </View>
  );
}

/**
 * "Números do corpo ocultos" (ESPACO-13): quantas pesagens, a próxima (sem número), registrar e o
 * atalho para a preferência. Nenhum peso, variação, meta, ritmo ou medida. Perfil calmo (sensível ou
 * menor de 18, `journey.isSensitive`) não recebe a próxima pesagem, como no cartão completo.
 */
function HiddenJourney({
  journey,
  next,
  onRegister,
  onAdjust,
}: {
  journey: Journey;
  next: NextWeighIn | null;
  onRegister: () => void;
  onAdjust: () => void;
}) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID="journey-card">
      <Glow />
      <View style={styles.head}>
        <Head title={`Sua jornada · desde ${fmtDayMonth(journey.start.date)}`} />
        <AddButton onPress={onRegister} />
      </View>
      <View style={styles.flag} testID="journey-hidden">
        <EvolIcon icon={EyeOff} tone="body" />
        <AppText size={fontSize.md} style={styles.grow}>
          {hiddenJourneyText(journey.count)}
        </AppText>
      </View>
      {next && !journey.isSensitive ? <NextPill next={next} /> : null}
      <Button label={BODY_PRIVACY_COPY.adjust} variant="text" icon={SlidersHorizontal} onPress={onAdjust} />
    </Card>
  );
}

/**
 * "Sua jornada" (conceito 09): a última pesagem em destaque (a tendência fica no gráfico), variação desde o início,
 * trilha até a meta com o marcador, ritmo e medidas. A próxima pesagem vai para a folha "Pesagens". Perfil sensível
 * vê só o valor pesado (sem variação, meta, trilha nem ritmo). Com os números do corpo ocultos, nenhum número:
 * HiddenJourney.
 */
export function JourneyCard({
  journey,
  today,
  next,
  onRegister,
  hidden = false,
  onAdjust = () => {},
}: {
  journey: Journey;
  today: string;
  /** Próxima pesagem sugerida (só no modo oculto; a jornada completa a mostra na folha "Pesagens"). */
  next: NextWeighIn | null;
  onRegister: () => void;
  /** "Ocultar números do corpo" (bodyNumbers = "hidden"). */
  hidden?: boolean;
  /** Abre a preferência "Ocultar números do corpo" (só no modo oculto). */
  onAdjust?: () => void;
}) {
  if (hidden) return <HiddenJourney journey={journey} next={next} onRegister={onRegister} onAdjust={onAdjust} />;
  return <FullJourney journey={journey} today={today} onRegister={onRegister} />;
}

function FullJourney({ journey, today, onRegister }: { journey: Journey; today: string; onRegister: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { current, start, delta, target, progress, pace, waist, hip } = journey;
  const isSensitive = journey.isSensitive;
  const when = fmtRelDate(current.date, today);
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta < 0 ? TrendingDown : TrendingUp;
  const percent = progress === null ? null : Math.round(progress * 100);
  const filled = progress === null ? 0 : Math.round(progress * TRACK_SEGMENTS);
  const showDeltas = !isSensitive;
  const stats: Stat[] = [
    ...(pace !== null ? [{ label: "Ritmo", value: signedNumber(pace), unit: "kg/sem", detail: "média 4 sem" }] : []),
    ...(waist ? [{ label: "Cintura", value: kg1(waist.value), unit: "cm", detail: showDeltas && waist.delta !== 0 ? signedWithUnit(waist.delta, "cm") : null }] : []),
    ...(hip ? [{ label: "Quadril", value: kg1(hip.value), unit: "cm", detail: showDeltas && hip.delta !== 0 ? signedWithUnit(hip.delta, "cm") : null }] : []),
  ];
  return (
    <Card style={styles.card} testID="journey-card">
      <Glow />
      <View style={styles.head}>
        <Head title={`Sua jornada · desde ${fmtDayMonth(start.date)}`} />
        <AddButton onPress={onRegister} />
      </View>
      <View style={styles.main}>
        <Metric value={current.weight} format={kg1} unit="kg" size="hero" testID="journey-weight" />
        {delta !== null && journey.count > 1 && (
          <View style={styles.delta} testID="journey-delta">
            <DeltaIcon size={16} color={colors.white} />
            <AppText
              size={fontSize.base}
              weight={800}
              color={colors.white}
              style={styles.tabular}
              accessibilityLabel={`${signOf(delta)}${kg1(Math.abs(delta))} kg desde ${fmtDayMonth(start.date)}`}
            >
              {kg1(Math.abs(delta))} kg
            </AppText>
          </View>
        )}
      </View>
      <AppText size={fontSize.sm} color={colors.text2} testID="journey-caption" style={styles.caption}>
        {`Peso atual · pesado ${when}`}
      </AppText>
      {percent !== null && target !== null && (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${percent}% do caminho: de ${kg1(start.weight)} kg até a meta de ${kg1(target)} kg`}
          style={styles.track}
          testID="journey-track"
        >
          <View style={styles.segments}>
            {Array.from({ length: TRACK_SEGMENTS }, (_, i) => (
              <View
                key={i}
                style={[styles.segment, i < filled && { backgroundColor: mixHex(colors.green500, colors.teal500, i / (TRACK_SEGMENTS - 1)) }]}
              />
            ))}
            <View style={[styles.knob, { left: `${percent}%` }]}>
              <View style={styles.knobDot} />
            </View>
          </View>
          <View style={styles.trackLabels} aria-hidden>
            <AppText size={fontSize.xs} color={colors.text2}>
              Início <Strong>{kgShort(start.weight)}</Strong>
            </AppText>
            <AppText size={fontSize.xs} weight={700} color={colors.green700}>
              {percent}% do caminho
            </AppText>
            <AppText size={fontSize.xs} color={colors.text2}>
              Meta <Strong>{kgShort(target)}</Strong>
            </AppText>
          </View>
        </View>
      )}
      {stats.length > 0 && (
        <View style={styles.stats}>
          {stats.map((stat, i) => (
            <View key={stat.label} style={[styles.stat, i === 0 ? styles.statFirst : styles.statDivided]}>
              <AppText size={fontSize.xs} color={colors.muted}>
                {stat.label}
              </AppText>
              <AppText heading size={fontSize.lg} weight={800} numberOfLines={1} style={styles.tabular}>
                {stat.value}
                <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                  {` ${stat.unit}`}
                </AppText>
              </AppText>
              {stat.detail ? (
                <AppText size={fontSize.xs} weight={700} color={colors.text2} style={styles.tabular}>
                  {stat.detail}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** Mini anel de progresso de um item da linha de partida (começa às 12 h). */
function Ring({ done, total }: { done: number; total: number }) {
  const colors = useThemeColors();
  const center = RING.size / 2;
  return (
    <Svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden>
      <Circle cx={center} cy={center} r={RING.radius} fill="none" stroke={colors.surface3} strokeWidth={RING.stroke} />
      {/* Sem progresso, nada de arco: a ponta arredondada desenharia um ponto. */}
      {done > 0 && (
        <Path
          d={circlePath(center, RING.radius)}
          fill="none"
          stroke={colors.green600}
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          strokeDasharray={arcDash(RING.radius, (done / total) * 100)}
        />
      )}
    </Svg>
  );
}

/**
 * Primeira visita (menos de duas pesagens): "Sua linha de partida", com o ponto inicial e os
 * primeiros registros que dão vida aos gráficos. Perfil sensível não vê o item de pesagem. Com os
 * números do corpo ocultos, o início fica só com a data ("Início · 6 ago").
 */
export function StartLine({
  journey,
  items,
  onRegister,
  hidden = false,
}: {
  journey: Journey | null;
  items: StartItem[];
  onRegister: () => void;
  hidden?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Card style={styles.card} testID="start-line">
      <Glow />
      <View style={styles.head}>
        <Head title="Sua linha de partida" />
        <AddButton onPress={onRegister} />
      </View>
      <View style={styles.flag}>
        <EvolIcon icon={Flag} tone="body" />
        <AppText size={fontSize.md} style={styles.grow}>
          {journey && hidden ? (
            `Início · ${fmtDayMonth(journey.current.date)}`
          ) : journey ? (
            <>
              Início{" "}
              <AppText size={fontSize.md} weight={700} style={styles.tabular}>
                {kg1(journey.current.weight)} kg
              </AppText>{" "}
              · {fmtDayMonth(journey.current.date)}
            </>
          ) : (
            "Registre sua primeira pesagem para começar."
          )}
        </AppText>
      </View>
      <AppText size={fontSize.sm} color={colors.muted}>
        Com alguns registros, os gráficos ganham vida aqui.
      </AppText>
      <View accessibilityRole="list" style={styles.list}>
        {items.map((item) => {
          const isDone = item.done >= item.total;
          return (
            <View key={item.key} role="listitem" style={styles.item}>
              <Ring done={item.done} total={item.total} />
              <AppText size={fontSize.sm} weight={isDone ? 600 : 400} color={isDone ? colors.green800 : colors.text} style={styles.grow}>
                {item.label}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted} style={styles.tabular}>
                {item.done} de {item.total}
              </AppText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { gap: 12 },
  glow: { borderRadius: radius.card },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kicker: { flexShrink: 1 },
  addTarget: { width: 44, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  add: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: shadows.button,
  },
  addFill: { borderRadius: 14 },
  addPressed: { transform: [{ scale: 0.95 }] },
  caption: { marginTop: -8 },
  main: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    // Variação neutra (navy), como o --wf-inverse do web: no escuro, o azul-ardósia do aviso.
    backgroundColor: colors.inverse,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  next: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).water.border,
    backgroundColor: themeDomainTone(scheme).water.bg,
  },
  track: { gap: 8 },
  segments: { flexDirection: "row", alignItems: "center", gap: 4, height: KNOB },
  segment: { flex: 1, height: TRACK_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  knob: {
    position: "absolute",
    top: 0,
    width: KNOB,
    height: KNOB,
    marginLeft: -KNOB / 2,
    borderRadius: KNOB / 2,
    borderWidth: 3,
    borderColor: colors.green600,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.card,
  },
  knobDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green600 },
  trackLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  stats: { flexDirection: "row", paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  // Base no conteúdo: "−0,6 kg/sem" não quebra (flex: 1 descontaria o recuo da primeira coluna).
  stat: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0, paddingHorizontal: 10, gap: 2 },
  statFirst: { paddingLeft: 0 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
  flag: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 10 },
}));
