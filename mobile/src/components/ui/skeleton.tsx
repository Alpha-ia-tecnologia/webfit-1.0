import { useEffect, type ReactNode } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { makeStyles } from "@/theme/theme";
import { radius, shadows } from "@/theme/tokens";

/** Meio ciclo do brilho: o web leva 1,4 s para atravessar o bloco (skeleton-shimmer). */
const SHIMMER_MS = 700;
/** Opacidade mínima do pulso; com movimento reduzido o esqueleto fica parado e opaco. */
const SHIMMER_MIN = 0.45;
/** Alturas das barras do gráfico, as mesmas do web (35 + (i × 37) mod 55 %). */
const barHeight = (index: number): DimensionValue => `${35 + ((index * 37) % 55)}%`;

/** Opacidade que pulsa enquanto `isActive`; parada (opaca) com movimento reduzido. */
export function usePulse(isActive: boolean, min = SHIMMER_MIN, duration = SHIMMER_MS) {
  const isReduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!isActive || isReduced) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(min, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [isActive, isReduced, min, duration, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Um bloco cinza arredondado; a animação fica no grupo que o contém. */
function Block({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.block, style]} />;
}

/** Grupo decorativo que pulsa: escondido do leitor de tela (quem usa anuncia o carregamento). */
function Shimmer({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse(true);
  return (
    <Animated.View
      style={[style, pulse]}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {children}
    </Animated.View>
  );
}

function Rows({ rows }: { rows: number }) {
  const styles = useStyles();
  return (
    <View style={styles.rows}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <Block style={styles.icon} />
          <View style={styles.lines}>
            <Block style={[styles.line, styles.short]} />
            <Block style={[styles.line, styles.long]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Chart({ bars }: { bars: number }) {
  const styles = useStyles();
  return (
    <View style={styles.chart}>
      {Array.from({ length: bars }, (_, index) => (
        <Block key={index} style={[styles.bar, { height: barHeight(index) }]} />
      ))}
    </View>
  );
}

/** Linhas de lista (ícone e duas linhas de texto), como o SkeletonRows do web. */
export function SkeletonRows({ rows = 3, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Shimmer style={style}>
      <Rows rows={rows} />
    </Shimmer>
  );
}

/** Barras de uma semana (SkeletonChart do web). */
export function SkeletonChart({ bars = 7 }: { bars?: number }) {
  return (
    <Shimmer>
      <Chart bars={bars} />
    </Shimmer>
  );
}

/** Cartão genérico: título, um número grande e linhas ou barras (SkeletonCard do web). */
export function SkeletonCard({ rows = 2, chart = false }: { rows?: number; chart?: boolean }) {
  const styles = useStyles();
  return (
    <Shimmer style={styles.card}>
      <Block style={styles.title} />
      <Block style={styles.hero} />
      {chart ? <Chart bars={7} /> : <Rows rows={rows} />}
    </Shimmer>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { borderRadius: radius.pill, backgroundColor: colors.surface2 },
  rows: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: radius.sm },
  lines: { flex: 1, gap: 8 },
  line: { height: 10 },
  short: { width: "55%" },
  long: { width: "80%" },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 72 },
  bar: { flex: 1, borderRadius: radius.xs },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  title: { width: "40%", height: 12 },
  hero: { width: "60%", height: 28, borderRadius: radius.xs },
}));
