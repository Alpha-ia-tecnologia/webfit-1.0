import { useEffect, useRef, useState } from "react";
import { Easing, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { fmtDelta, fmtNumber } from "@shared/lib/format";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { AppText } from "./text";

/** Mesma duração e curva do web (src/components/Metric.tsx). */
const COUNT_MS = 450;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** hero = número-herói de 60 px dos conceitos (Evolução 72,4 · Seringa 2,5), com a unidade em 24 px. */
const SIZES = { sm: fontSize.xl, md: fontSize["2xl"], lg: fontSize["4xl"], xl: fontSize["6xl"], hero: fontSize.hero } as const;
/** Altura de linha: 1,18 do tamanho; no "xl" (peso da jornada) fica justa como no web, sem cortar a vírgula. */
/** hero: 1,05 (o web usa 1); no aparelho, a linha igual à fonte corta a vírgula de "72,4". */
const LINE = { sm: 1.18, md: 1.18, lg: 1.18, xl: 1.1, hero: 1.05 } as const;

type Format = (value: number) => string;

/**
 * Valor exibido que "conta" até o novo número quando ele muda (ex.: +250 ml de água).
 * Na primeira renderização e com movimento reduzido, mostra o valor final direto.
 */
export function useCountUp(value: number | null): number | null {
  const isReduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (value === null || from === null || from === value || isReduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / COUNT_MS);
      setShown(t < 1 ? from + (value - from) * EASE_OUT(t) : value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, isReduced]);
  return shown;
}

/** Número animado dentro de um texto: `<AppText><CountUp value={1210} /></AppText>`. */
export function CountUp({ value, format = fmtNumber }: { value: number; format?: Format }) {
  return <>{format(useCountUp(value) ?? value)}</>;
}

/** Variação ao lado do número: sinal e unidade ("−0,4 kg"), sempre em tom neutro (sem julgamento). */
export interface MetricDelta {
  value: number;
  unit: string;
  digits?: number;
  /** Contexto curto depois da variação: "em 7 dias". */
  caption?: string;
}

/** Pílula neutra da variação (.metric-delta do web). */
function DeltaPill({ delta }: { delta: MetricDelta }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const text = fmtDelta(delta.value, delta.unit, delta.digits);
  return (
    <View style={styles.delta} accessible accessibilityLabel={delta.caption ? `${text} ${delta.caption}` : text} testID="metric-delta">
      <AppText size={fontSize.xs} weight={700} color={colors.text2} style={styles.tabular}>
        {text}
        {delta.caption ? (
          <AppText size={fontSize.xs} weight={500} color={colors.muted}>
            {` ${delta.caption}`}
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}

/**
 * Métrica de destaque: rótulo opcional, número com algarismos tabulares, unidade menor, variação e
 * legenda. `null` vira "—"; `format` recebe o número já animado. O leitor de tela ouve só o valor final.
 */
export function Metric({
  value,
  format = fmtNumber,
  unit,
  label,
  caption,
  delta,
  size = "md",
  testID,
}: {
  value: number | null;
  format?: Format;
  unit?: string;
  /** Rótulo curto em caixa alta acima do número. */
  label?: string;
  caption?: string;
  delta?: MetricDelta | null;
  size?: keyof typeof SIZES;
  testID?: string;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const shown = useCountUp(value);
  const textSize = SIZES[size];
  const exact = value === null ? "—" : `${format(value)}${unit ? ` ${unit}` : ""}`;
  const number = (
    <AppText
      heading
      size={textSize}
      weight={800}
      tracking={-0.03}
      lineHeight={Math.round(textSize * LINE[size])}
      style={styles.tabular}
      accessibilityLabel={exact}
      testID={testID}
    >
      {shown === null ? "—" : format(shown)}
      {unit && shown !== null ? (
        <AppText size={size === "hero" ? fontSize["2xl"] : fontSize.base} weight={size === "hero" ? 600 : 500} tracking={0} color={colors.muted}>
          {` ${unit}`}
        </AppText>
      ) : null}
    </AppText>
  );
  return (
    <View style={styles.block}>
      {label ? (
        <AppText size={fontSize.xs} weight={700} tracking={0.04} upper color={colors.muted}>
          {label}
        </AppText>
      ) : null}
      {delta ? (
        <View style={styles.row}>
          {number}
          <DeltaPill delta={delta} />
        </View>
      ) : (
        number
      )}
      {caption ? (
        <AppText size={fontSize.xs} color={colors.muted}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((_colors, scheme) => ({
  block: { gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  delta: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: themeDomainTone(scheme).neutral.bg,
  },
}));
