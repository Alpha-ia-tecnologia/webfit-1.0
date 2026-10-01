import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { EyeOff, Minus, Plus, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react-native";
import { useId } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { sparklinePath } from "@shared/lib/charts";
import { localDate } from "@shared/lib/domain";
import { BMI_REFERENCE_HINT, BMI_TICKS, bodySummary, type BodySummary } from "@shared/lib/space";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconTile } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, shadows, themeDomainTone } from "@/theme/tokens";

const SPARK_W = 150;
const SPARK_H = 46;
const SPARK_PAD = 4;
/** Faixas de largura igual da régua do IMC (as marcas 18,5 · 25 · 30 caem nas divisas). */
const BMI_SEGMENTS = BMI_TICKS.length + 1;
const BMI_DOT = 16;
const TREND_ICON = { down: TrendingDown, up: TrendingUp, flat: Minus } as const;
/** Decorativo: o texto ao lado (ou o resumo para leitor de tela) já diz o que o desenho mostra. */
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** "Corpo" e "+ Registrar" fora dos blocos (a seção do conceito 11). */
function BodyHead() {
  const styles = useStyles();
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={styles.head}>
      <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} accessibilityRole="header">
        Corpo
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar medidas na Evolução"
        onPress={() => router.push("/evolucao")}
        style={({ pressed }) => [styles.register, pressed && styles.pressed]}
      >
        <Plus size={18} color={colors.green700} />
        <AppText size={fontSize.sm} weight={800} color={colors.green700}>
          Registrar
        </AppText>
      </Pressable>
    </View>
  );
}

/** Mini gráfico das últimas pesagens: área azul-clara, linha e o último ponto vazado. */
function WeightSpark({ trend }: { trend: NonNullable<BodySummary["trend"]> }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const spark = sparklinePath(trend.values, SPARK_W, SPARK_H, SPARK_PAD);
  if (!spark) return null;
  const area = `${spark.d} L${spark.last.x},${SPARK_H} L${SPARK_PAD},${SPARK_H} Z`;
  return (
    <View testID="body-sparkline" style={styles.spark} {...HIDDEN}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
        <Defs>
          <SvgGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.sky400} stopOpacity={0.32} />
            <Stop offset="1" stopColor={colors.sky400} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={area} fill={`url(#${gradientId})`} />
        <Path d={spark.d} fill="none" stroke={colors.sky500} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={spark.last.x} cy={spark.last.y} r={SPARK_PAD - 0.5} fill={colors.surface} stroke={colors.sky500} strokeWidth={2.5} />
      </Svg>
    </View>
  );
}

/** Bloco do peso: "Peso · hoje", o número grande, a variação neutra, o mini gráfico e a trilha até a meta. */
function WeightTile({ s }: { s: BodySummary }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const water = themeDomainTone(scheme).water;
  const TrendIcon = s.trend ? TREND_ICON[s.trend.direction] : Minus;
  return (
    <View style={[styles.tile, styles.weightTile]}>
      <View style={styles.tileHead}>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          Peso
        </AppText>
        <AppText size={fontSize.sm} weight={500} color={colors.muted}>
          {s.when}
        </AppText>
      </View>
      <AppText testID="body-weight" style={styles.tabular}>
        <AppText heading size={fontSize["5xl"]} weight={800} tracking={-0.03} lineHeight={40}>
          {s.weight}
        </AppText>
        <AppText size={fontSize.sm} weight={600} color={colors.muted}>
          {" kg"}
        </AppText>
      </AppText>
      {s.trend ? (
        <>
          <View style={[styles.delta, { backgroundColor: water.bg, borderColor: water.border }]} testID="body-trend" {...HIDDEN}>
            <TrendIcon size={16} color={colors.sky700} />
            <AppText size={fontSize.xs} weight={800} color={colors.sky700} style={styles.tabular}>
              {s.trend.chip}
            </AppText>
          </View>
          <WeightSpark trend={s.trend} />
          <AppText style={srOnly}>{s.trend.speech}</AppText>
        </>
      ) : null}
      {s.progress ? (
        <View style={styles.progress}>
          <View style={styles.progressTrack} {...HIDDEN}>
            <LinearGradient
              colors={gradients.brand}
              start={horizontal.start}
              end={horizontal.end}
              style={[styles.progressFill, { width: `${Math.round(s.progress.ratio * 100)}%` }]}
            />
          </View>
          <View style={styles.progressLabels} {...HIDDEN}>
            <AppText size={fontSize.xs} color={colors.muted} style={styles.tabular}>
              {"Início "}
              <AppText size={fontSize.xs} weight={800} color={colors.text}>
                {s.progress.start}
              </AppText>
            </AppText>
            <AppText size={fontSize.xs} color={colors.muted} style={styles.tabular}>
              {"Meta "}
              <AppText size={fontSize.xs} weight={800} color={colors.text}>
                {s.progress.target}
              </AppText>
            </AppText>
          </View>
          <AppText style={srOnly}>{s.progress.speech}</AppText>
        </View>
      ) : null}
    </View>
  );
}

/** IMC numa régua neutra de faixas iguais (sem categoria nem cor por faixa) e o marcador navy. */
function BmiTile({ bmi }: { bmi: NonNullable<BodySummary["bmi"]> }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.tile, styles.bmiTile]} testID="body-bmi">
      <View>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          IMC
        </AppText>
        <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} lineHeight={27} style={styles.tabular}>
          {bmi.value}
        </AppText>
      </View>
      <View style={styles.ruler} {...HIDDEN}>
        {Array.from({ length: BMI_SEGMENTS }, (_, i) => (
          <View key={i} style={styles.bmiSeg} />
        ))}
        <View style={[styles.bmiDot, { left: `${bmi.position}%` }]} testID="body-bmi-dot" />
      </View>
      <AppText size={fontSize.xs} color={colors.muted} style={styles.tabular}>
        {BMI_REFERENCE_HINT}
      </AppText>
    </View>
  );
}

/** Altura | Cintura: duas colunas com divisória, número grande e a unidade menor. */
function ExtraTile({ tiles, isBeside = false }: { tiles: BodySummary["tiles"]; isBeside?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.tile, styles.extra, isBeside ? styles.beside : styles.below]}>
      {tiles.map((tile, i) => (
        <View key={tile.key} style={[styles.extraCol, i > 0 && styles.extraDivider]}>
          <AppText size={fontSize.sm} weight={600} color={colors.text2}>
            {tile.label}
          </AppText>
          <AppText testID={`body-${tile.key}`} style={styles.tabular} numberOfLines={1}>
            <AppText heading size={fontSize.xl} weight={800} tracking={-0.02}>
              {tile.number}
            </AppText>
            <AppText size={fontSize.xs} weight={500} color={colors.muted}>
              {` ${tile.unit}`}
            </AppText>
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * "Corpo" em blocos (conceito 11; BodyCard do web): peso com a variação neutra, mini gráfico e a trilha até a meta;
 * IMC numa régua neutra sem categoria nem cor por faixa; altura e cintura. Perfil calmo (sensível ou menor de
 * idade): só o peso e a altura. "Ocultar números do corpo" (ESPACO-13): nenhum número, só a data da medição, o
 * registro e o atalho para a preferência.
 */
export function BodyCard({ onOpenPreferences }: { onOpenPreferences?: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const s = bodySummary(state, localDate());
  if (!s) return null;
  if (s.hidden)
    return (
      <View style={styles.section} testID="body-card">
        <BodyHead />
        <View style={[styles.tile, styles.hiddenTile]}>
          <View style={styles.hidden} testID="body-hidden">
            <IconTile tone="body" size="md" icon={EyeOff} />
            <View style={styles.hiddenText}>
              <AppText size={fontSize.md} weight={700}>
                {BODY_PRIVACY_COPY.hiddenTitle}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted}>
                {s.measured}
              </AppText>
            </View>
          </View>
          {onOpenPreferences ? (
            <Button label={BODY_PRIVACY_COPY.adjust} variant="text" icon={SlidersHorizontal} onPress={onOpenPreferences} />
          ) : null}
        </View>
      </View>
    );
  return (
    <View style={styles.section} testID="body-card">
      <BodyHead />
      <View style={styles.grid}>
        <WeightTile s={s} />
        {s.bmi ? (
          <View style={styles.column}>
            <BmiTile bmi={s.bmi} />
            <ExtraTile tiles={s.tiles} />
          </View>
        ) : (
          <ExtraTile tiles={s.tiles} isBeside />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  register: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  pressed: { opacity: 0.7 },
  tabular: { fontVariant: ["tabular-nums"] },
  // Peso à esquerda nas duas linhas; IMC e altura/cintura empilhados à direita (o grid do web).
  grid: { flexDirection: "row", gap: 12 },
  column: { flex: 1, minWidth: 0, gap: 12 },
  tile: {
    minWidth: 0,
    paddingTop: 14,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  weightTile: { flex: 1, alignItems: "flex-start", gap: 6 },
  tileHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, alignSelf: "stretch" },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  spark: { alignSelf: "stretch", aspectRatio: SPARK_W / SPARK_H, marginTop: 4 },
  progress: { alignSelf: "stretch", gap: 6 },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.pill },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  bmiTile: { gap: 6 },
  ruler: { flexDirection: "row", alignItems: "center", gap: 4, height: BMI_DOT, marginHorizontal: BMI_DOT / 2 },
  bmiSeg: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.slate200 },
  bmiDot: {
    position: "absolute",
    top: 0,
    width: BMI_DOT,
    height: BMI_DOT,
    marginLeft: -BMI_DOT / 2,
    borderRadius: BMI_DOT / 2,
    borderWidth: 3,
    // Anel da cor do cartão (o box-shadow com --wf-surface do web).
    borderColor: colors.surface,
    backgroundColor: colors.marker,
  },
  extra: { flexDirection: "row" },
  // Ao lado do peso (perfil calmo, sem IMC): metade da linha. Embaixo do IMC: cresce até a altura do peso
  // (base automática: flex 1 no react-native-web vira base 0 e min-height 0, e o bloco sumiria).
  beside: { flex: 1 },
  below: { flexGrow: 1 },
  extraCol: { flex: 1, minWidth: 0, gap: 2 },
  // Divisória de 6 + 6: "83,1 cm" cabe na coluna a 390 pt sem cortar.
  extraDivider: { marginLeft: 6, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
  hiddenTile: { gap: 8 },
  hidden: { flexDirection: "row", alignItems: "center", gap: 12 },
  hiddenText: { flex: 1, minWidth: 0, gap: 2 },
}));
