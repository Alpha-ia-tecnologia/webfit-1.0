import { LinearGradient } from "expo-linear-gradient";
import { Info } from "lucide-react-native";
import { useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { Pressable } from "react-native";
import { adjustmentChipText, proteinChipText } from "@shared/lib/day";
import { balanceEquation, type BalanceEquation } from "@shared/lib/diary-day";
import type { DailyTarget } from "@shared/lib/domain";
import { fmtNumber } from "@shared/lib/format";
import { macroBars, percentOf, type Totals } from "@shared/lib/today";
import { MacroSummary } from "@/components/hoje/macro-summary";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, IconButton } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, shadows, themeDomainTone, themeMacroColor } from "@/theme/tokens";
import { MacroDonut } from "./macro-donut";

const BAND_MACROS: Record<string, string> = { protein: "Prot", carbs: "Carb", fat: "Gord" };
/** Altura da faixa que acompanha a rolagem. */
export const BAND_HEIGHT = 56;

type Props = {
  totals: Totals;
  goals: DailyTarget;
  hideCalories: boolean;
  /** "Balanço de hoje" no dia de hoje; "Balanço do dia" nos outros. */
  isToday?: boolean;
  onExplain: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** Até esta largura a conta desce um degrau (o @media 360px do web). */
const NARROW_MAX_WIDTH = 360;

/** Um termo da conta, centralizado; o resultado numa caixa menta (neutra acima do planejado, nunca vermelha). */
function Term({ value, label, isResult = false, isOver = false }: { value: number; label: string; isResult?: boolean; isOver?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isNarrow = useWindowDimensions().width <= NARROW_MAX_WIDTH;
  const size = isResult ? (isNarrow ? fontSize["2xl"] : fontSize["3xl"]) : isNarrow ? fontSize.xl : fontSize["2xl"];
  const accent = isResult ? (isOver ? colors.text2 : colors.green700) : colors.muted;
  return (
    <View style={[styles.term, isResult && [styles.termResult, isOver && styles.termOver, isNarrow && styles.termResultNarrow]]}>
      <AppText
        heading
        size={size}
        weight={800}
        tracking={-0.02}
        lineHeight={size + 4}
        align="center"
        // Acima do planejado é informação, não erro: cor neutra, nunca vermelho.
        color={isResult ? (isOver ? colors.text2 : colors.green700) : colors.text2}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={styles.tabular}
      >
        {fmtNumber(value)}
      </AppText>
      <AppText size={fontSize.sm} weight={isResult ? 800 : 500} color={accent} align="center" lineHeight={17}>
        {label}
      </AppText>
    </View>
  );
}

function Operator({ sign }: { sign: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <AppText heading size={fontSize.xl} weight={600} color={colors.muted} style={styles.operator}>
      {sign}
    </AppText>
  );
}

/** Frase do balanço para o leitor de tela (a equação à vista fica escondida dele). */
function spoken(equation: BalanceEquation): string {
  return `Meta de ${fmtNumber(equation.goal)} kcal menos ${fmtNumber(equation.consumed)} kcal consumidas: ${
    equation.over ? `${fmtNumber(equation.result)} kcal acima do planejado.` : `restam ${fmtNumber(equation.result)} kcal.`
  }`;
}

/**
 * Balanço do dia no Diário (DIARIO-09): [Meta] − [Consumido] = [Restam], o (i) com o gasto estimado,
 * os macros do mesmo bloco do Hoje e uma barra fina. O ajuste dinâmico do dia é um chip de delta no
 * cabeçalho ("↑ +147 kcal · ontem você comeu menos"; "Neste dia +147 kcal" em outra data; "Meta um
 * pouco maior" com calorias ocultas), que abre "Como calculamos". Com as calorias ocultas não há
 * equação, número de kcal nem explicação: a rosca P/C/G mostra só a proporção entre os macros.
 */
export function BalanceCard({ totals, goals, hideCalories, isToday = false, onExplain, onLayout }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macros = macroBars(totals, goals);
  const equation = hideCalories ? null : balanceEquation(totals.calories, goals.calories);
  const percent = percentOf(totals.calories, goals.calories) ?? 0;
  const title = isToday ? "Balanço de hoje" : "Balanço do dia";
  const canExplain = !hideCalories && goals.calories !== null;
  // Delta do ajuste (kcal ou, sem ajuste de kcal, a proteína somada), no tom da comida (informação, nunca alerta).
  const delta = adjustmentChipText(goals, { hideCalories, isToday }) ?? proteinChipText(goals.proteinBoost);
  const deltaTone = themeDomainTone(scheme).food;
  const deltaText = (
    <AppText size={fontSize.xs} weight={700} color={colors.green700} numberOfLines={1} style={[styles.tabular, styles.deltaText]}>
      {delta}
    </AppText>
  );
  return (
    <View style={styles.card} onLayout={onLayout} testID="diary-balance">
      <View style={styles.head}>
        <View style={styles.lead}>
          <AppText size={fontSize.xs} weight={800} upper tracking={0.08} color={colors.muted} accessibilityRole="header">
            {hideCalories ? title : `${title} · kcal`}
          </AppText>
          {delta ? (
            canExplain ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={goals.adjustmentNote ?? delta}
                {...webAttrs({ "aria-haspopup": "dialog" })}
                onPress={onExplain}
                testID="balance-delta"
                style={({ pressed }) => [styles.delta, { backgroundColor: deltaTone.bg, borderColor: deltaTone.border }, pressed && styles.pressed]}
              >
                {deltaText}
              </Pressable>
            ) : (
              <View
                accessible
                accessibilityLabel={goals.adjustmentNote ?? delta}
                testID="balance-delta"
                style={[styles.delta, { backgroundColor: deltaTone.bg, borderColor: deltaTone.border }]}
              >
                {deltaText}
              </View>
            )
          ) : null}
        </View>
        {/* (i) sem fundo, só o traço cinza; o alvo continua com 44 px. */}
        {canExplain && (
          <IconButton icon={Info} iconSize={20} variant="ghost" accessibilityLabel="Como calculamos" onPress={onExplain} style={styles.info} />
        )}
      </View>
      {!hideCalories &&
        (equation ? (
          <>
            <View style={styles.equation} accessible accessibilityRole="text" accessibilityLabel={spoken(equation)}>
              <Term value={equation.goal} label="Meta" />
              <Operator sign="−" />
              <Term value={equation.consumed} label="Consumido" />
              <Operator sign="=" />
              <Term
                value={equation.result}
                label={equation.over ? "Acima do planejado" : "Restam"}
                isResult
                isOver={equation.over}
              />
            </View>
            <View style={styles.bar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {percent > 0 && (
                <LinearGradient
                  colors={gradients.brand}
                  start={horizontal.start}
                  end={horizontal.end}
                  style={[styles.barFill, { width: `${percent}%` }]}
                />
              )}
            </View>
          </>
        ) : (
          <AppText size={fontSize.sm} color={colors.text2}>
            <AppText heading size={fontSize["2xl"]} weight={800}>
              {fmtNumber(totals.calories)}
            </AppText>{" "}
            kcal consumidas · sem meta definida
          </AppText>
        ))}
      {hideCalories && <MacroDonut macros={totals} />}
      <MacroSummary macros={macros} showBars isCompact />
    </View>
  );
}

/**
 * Faixa compacta de 56 px que aparece quando o cartão do balanço sai da tela: o que resta (sem kcal
 * com as calorias ocultas) e os gramas de P/C/G. Repete o cartão, então fica fora do leitor de tela.
 */
export function BalanceBand({ totals, goals, hideCalories }: Omit<Props, "onExplain" | "onLayout">) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const macros = macroBars(totals, goals);
  const equation = hideCalories ? null : balanceEquation(totals.calories, goals.calories);
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.band}
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="diary-band"
    >
      {!hideCalories && (
        <View style={styles.bandKcal}>
          <AppText heading size={fontSize.lg} weight={800} lineHeight={20} style={styles.tabular}>
            {fmtNumber(equation ? equation.result : totals.calories)}
          </AppText>
          <AppText size={fontSize["2xs"]} weight={600} color={colors.muted} lineHeight={13}>
            {!equation ? "kcal consumidas" : equation.over ? "kcal acima" : "kcal restantes"}
          </AppText>
        </View>
      )}
      <View style={[styles.bandMacros, hideCalories && styles.bandMacrosAlone]}>
        {macros.map((m) => (
          <View key={m.key} style={styles.bandMacro}>
            <View style={[styles.dot, { backgroundColor: macroColor[m.key] }]} />
            <AppText size={fontSize["2xs"]} weight={600} color={colors.text2}>
              {BAND_MACROS[m.key]} {fmtNumber(m.value)} g
            </AppText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: 14,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40 },
  /** Título e o chip do ajuste lado a lado; a 320 px o chip desce para a linha de baixo. */
  lead: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  /** Nunca passa da coluna do título (a 320 px encostava no (i)): o texto encolhe com reticências; a frase inteira fica no nome acessível e em "Como calculamos". */
  delta: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    flexShrink: 1,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  deltaText: { flexShrink: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },
  /** A conta centralizada (conceito 03): 1.645 − 1.210 = [435 Restam]. */
  equation: { flexDirection: "row", alignItems: "center", gap: 6 },
  term: { flex: 1, minWidth: 0, gap: 2, alignItems: "center" },
  termResult: {
    flex: 1.15,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  termOver: { borderColor: colors.border, backgroundColor: colors.surface2 },
  termResultNarrow: { paddingVertical: 6, paddingHorizontal: 8 },
  operator: { marginBottom: 18 },
  info: { backgroundColor: "transparent" },
  tabular: { fontVariant: ["tabular-nums"] },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
  band: {
    position: "absolute",
    top: 6,
    left: 16,
    right: 16,
    zIndex: 30,
    height: BAND_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.glassBar,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    boxShadow: shadows.float,
  },
  bandKcal: { flexShrink: 0 },
  bandMacros: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", columnGap: 12, rowGap: 2 },
  bandMacrosAlone: { justifyContent: "space-between" },
  bandMacro: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));
