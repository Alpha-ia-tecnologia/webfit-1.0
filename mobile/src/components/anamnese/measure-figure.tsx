import { View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { toNumber } from "@shared/components/anamnese/inputs";
import { SILHOUETTE } from "@shared/components/injecao/bodySilhouette";
import { MEASURE_LINES, MEASURE_VIEWBOX } from "@shared/lib/body-metrics";
import { fmtNumber } from "@shared/lib/format";
import type { Draft } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

/** Só o contorno do corpo e a cabeça, como no mapa corporal em miniatura. */
const OUTLINE = SILHOUETTE.slice(0, 2);
const WIDTH = 72;
const HEIGHT = 160;
/** Unidades do viewBox (100 de largura em 72 px): ponto de ~4 px e traço de ~1,5 px. */
const DOT_RADIUS = 2.8;
const LINE_WIDTH = 2;
const EMPTY_OPACITY = 0.4;
const MEASURES = [
  { key: "waist", label: "Cintura" },
  { key: "hip", label: "Quadril" },
] as const;

/**
 * Silhueta com as linhas de cintura e quadril (.measure-figure), acima das medidas opcionais.
 * Decorativa: as medidas continuam nas réguas logo abaixo, então o leitor de tela a ignora.
 */
export function MeasureFigure({ answers }: { answers: Draft }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  return (
    <View testID="measure-figure" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.figure}>
      <Svg viewBox={MEASURE_VIEWBOX} width={WIDTH} height={HEIGHT}>
        {OUTLINE.map((shape, i) =>
          shape.type === "path" ? <Path key={i} d={shape.d} fill={colors.slate100} stroke={colors.slate300} strokeWidth={2} strokeLinejoin="round" /> : null,
        )}
        {MEASURES.map(({ key }) => {
          const line = MEASURE_LINES[key];
          const opacity = toNumber(answers[key]) === null ? EMPTY_OPACITY : 1;
          return (
            <G key={key} opacity={opacity}>
              <Line x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} stroke={domainTone.body.fg} strokeWidth={LINE_WIDTH} strokeDasharray="4 3" />
              <Circle cx={line.x1} cy={line.y} r={DOT_RADIUS} fill={domainTone.body.fg} />
              <Circle cx={line.x2} cy={line.y} r={DOT_RADIUS} fill={domainTone.body.fg} />
            </G>
          );
        })}
      </Svg>
      <View style={styles.labels}>
        {MEASURES.map(({ key, label }) => {
          const value = toNumber(answers[key]);
          return (
            <AppText key={key} size={fontSize.xs} weight={600} lineHeight={16} color={value === null ? colors.muted : colors.text2}>
              {`${label} · ${value === null ? "—" : `${fmtNumber(value, 1)} cm`}`}
            </AppText>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  figure: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  labels: { gap: 10 },
}));
