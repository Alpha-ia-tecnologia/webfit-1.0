import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { BMI_BANDS, BMI_CAPTION, bmiGauge } from "@shared/lib/body-metrics";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

const REFERENCE_BAND = 1;
const BAND_HEIGHT = 12;
const MARKER = { width: 12, height: 8 } as const;

/**
 * IMC estimado numa régua neutra de quatro faixas iguais (.bmi-gauge), só para adultos sem perfil
 * sensível (a tela decide). O leitor de tela ouve uma frase; o desenho fica só visual.
 */
export function BmiGauge({ bmi }: { bmi: number | null }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const gauge = bmiGauge(bmi);
  if (!gauge) return null;
  // Faixas em cinza e índigo claro: nenhuma cor de alerta (rosa ou âmbar), nem na faixa de 30 ou mais.
  const bandColors = [colors.slate200, domainTone.body.bg, colors.slate200, colors.slate300];
  return (
    <View testID="anamnese-bmi" accessible accessibilityRole="image" accessibilityLabel={gauge.ariaLabel} style={styles.card}>
      <View style={styles.head} aria-hidden>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          IMC estimado
        </AppText>
        <AppText heading size={fontSize["2xl"]} weight={800} color={colors.text}>
          {gauge.value}
        </AppText>
      </View>
      <View aria-hidden>
        <View style={styles.track}>
          {bandColors.map((color, i) => (
            <View key={i} style={[styles.band, { backgroundColor: color }, i === REFERENCE_BAND && styles.reference]} />
          ))}
        </View>
        <View style={styles.markerRow}>
          <View testID="bmi-marker" style={[styles.marker, { left: `${gauge.markerPercent}%` as const }]}>
            <Svg width={MARKER.width} height={MARKER.height} viewBox={`0 0 ${MARKER.width} ${MARKER.height}`}>
              <Path d={`M${MARKER.width / 2} 0 L${MARKER.width} ${MARKER.height} L0 ${MARKER.height} Z`} fill={domainTone.body.fg} />
            </Svg>
          </View>
        </View>
        <View style={styles.labels}>
          {BMI_BANDS.map((band) => (
            <AppText key={band} size={fontSize.xs} lineHeight={15} color={colors.muted} align="center" style={styles.label}>
              {band}
            </AppText>
          ))}
        </View>
      </View>
      <AppText size={fontSize.xs} lineHeight={17} color={colors.muted} aria-hidden>
        {BMI_CAPTION}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  card: { gap: 8, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  track: { flexDirection: "row", gap: 2, height: BAND_HEIGHT },
  band: { flex: 1, borderRadius: 4 },
  reference: { borderWidth: 1, borderColor: themeDomainTone(scheme).body.border },
  markerRow: { height: MARKER.height + 2, marginTop: 2 },
  marker: { position: "absolute", top: 0, marginLeft: -MARKER.width / 2, width: MARKER.width, height: MARKER.height },
  labels: { flexDirection: "row", gap: 2 },
  label: { flex: 1, minWidth: 0 },
}));
