import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { sparklinePath } from "@shared/lib/charts";
import {
  biomarkerScale,
  EXAM_COPY,
  historySpeech,
  type Biomarker,
  type HistoryPoint,
} from "@shared/lib/exam-result";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, TagPill } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const SPARK = { width: 80, height: 20, pad: 2 } as const;
const DOT = 12;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/**
 * Um resultado transcrito do laudo: nome, valor e unidade como impressos, a faixa impressa em cinza neutro
 * com o valor como ponto navy (só quando valor e referência são números simples), a referência do
 * laudo e a marca do próprio laboratório. O app nunca classifica: sem cor por valor nem palavras
 * como "normal" ou "alterado".
 */
export function BiomarkerRow({ row, history }: { row: Biomarker; history: readonly HistoryPoint[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const scale = biomarkerScale(row);
  const hasHistory = history.length >= 2;
  const spark = hasHistory ? sparklinePath(history.map((p) => p.value), SPARK.width, SPARK.height, SPARK.pad) : null;
  // O texto visível é lido em ordem, como no web; o histórico vai em texto só para leitores de tela.
  // Sem accessibilityLabel: o react-native-web ignora `accessible` e leria o rótulo e o texto (em dobro).
  return (
    <View role="listitem" style={styles.row} testID="biomarker" accessible>
      <View style={styles.head}>
        <AppText size={fontSize.sm} weight={600} color={colors.text} style={styles.grow}>
          {row.nome}
        </AppText>
        {spark ? (
          <View testID="biomarker-history" {...HIDDEN}>
            <Svg width={SPARK.width} height={SPARK.height} viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}>
              <Path d={spark.d} fill="none" stroke={colors.marker} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={spark.last.x} cy={spark.last.y} r={2} fill={colors.marker} />
            </Svg>
          </View>
        ) : null}
        <AppText style={styles.tabular}>
          <AppText size={fontSize.base} weight={800} color={colors.text}>
            {row.valor}
          </AppText>
          {row.unidade ? (
            <AppText size={fontSize.xs} color={colors.muted}>
              {` ${row.unidade}`}
            </AppText>
          ) : null}
        </AppText>
      </View>
      {scale ? (
        <View style={styles.bar} testID="biomarker-bar" {...HIDDEN}>
          <View style={styles.track} />
          <View
            testID="biomarker-zone"
            style={[styles.zone, { left: `${scale.zoneStart}%`, width: `${Math.max(0, scale.zoneEnd - scale.zoneStart)}%` }]}
          />
          <View testID="biomarker-dot" style={[styles.dot, { left: `${scale.dot}%` }]} />
          {scale.beyond === "below" ? (
            <View style={[styles.beyond, styles.beyondBelow]}>
              <ChevronLeft size={12} color={colors.marker} strokeWidth={3} />
            </View>
          ) : scale.beyond === "above" ? (
            <View style={[styles.beyond, styles.beyondAbove]}>
              <ChevronRight size={12} color={colors.marker} strokeWidth={3} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.refRow}>
        <AppText size={fontSize.xs} color={colors.text2} lineHeight={18} style={styles.shrink}>
          {`${EXAM_COPY.refLabel}: ${row.referencia ?? EXAM_COPY.noRef}`}
        </AppText>
        {row.marcacao ? <TagPill label={EXAM_COPY.labMark(row.marcacao)} tone="neutral" /> : null}
      </View>
      {hasHistory ? <AppText style={srOnly}>{historySpeech(history, row.unidade)}</AppText> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  // Faixa impressa em cinza neutro (sem sugerir "normal") e o valor em navy com anel; trilho mais claro.
  bar: { height: DOT, marginHorizontal: DOT / 2 },
  track: {
    position: "absolute",
    top: (DOT - 6) / 2,
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.slate100,
  },
  zone: {
    position: "absolute",
    top: (DOT - 6) / 2,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.slate300,
  },
  dot: {
    position: "absolute",
    top: 0,
    width: DOT,
    height: DOT,
    marginLeft: -DOT / 2,
    borderRadius: DOT / 2,
    borderWidth: 2,
    // Anel da cor do cartão (o box-shadow com --wf-surface do web; branco no claro).
    borderColor: colors.surface,
    backgroundColor: colors.marker,
  },
  beyond: { position: "absolute", top: 0 },
  beyondBelow: { left: -DOT - 2 },
  beyondAbove: { right: -DOT - 2 },
  refRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
}));
