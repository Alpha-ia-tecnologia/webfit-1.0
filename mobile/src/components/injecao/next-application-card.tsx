import { BellRing, Clock, History, MapPin } from "lucide-react-native";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import type { NextApplicationModel } from "@shared/lib/treatment";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { NextDoseRing } from "./next-dose-ring";

/** Anel de 90 pt, como no web (size={90}). */
const RING = 90;
const HISTORY_ICON = 76;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Fundo navy com o brilho verde embaixo à esquerda e o azul em cima à direita (os radial-gradient do .inj-next). */
function Glow() {
  const colors = useThemeColors();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" {...HIDDEN}>
      <Defs>
        <RadialGradient id={`${id}-green`} cx="0" cy="100" rx="70" ry="95" fx="0" fy="100" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.green500} stopOpacity={0.32} />
          <Stop offset="0.72" stopColor={colors.green500} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-sky`} cx="100" cy="0" rx="65" ry="90" fx="100" fy="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.sky500} stopOpacity={0.22} />
          <Stop offset="0.7" stopColor={colors.sky500} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100" height="100" fill={colors.navy} />
      <Rect width="100" height="100" fill={`url(#${id}-green)`} />
      <Rect width="100" height="100" fill={`url(#${id}-sky)`} />
    </Svg>
  );
}

/**
 * "Próxima aplicação" (conceito 10; NextApplicationCard do web): cartão navy com o anel da contagem, a data
 * estimada, o lembrete e o local sugerido. Informativo: nunca mostra dose nem "atrasada". Na gestação ou sem
 * acompanhar a frequência ("history"), só a última aplicação, sem anel e sem data estimada.
 */
export function NextApplicationCard({ model }: { model: NextApplicationModel }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isEstimate = model.variant === "estimate" && model.next !== null && model.text !== null;
  const LineIcon = isEstimate && model.timeLine.includes("lembrete") ? BellRing : Clock;
  return (
    <View testID="next-application" style={styles.card}>
      <Glow />
      {isEstimate && model.next && model.text ? (
        <NextDoseRing next={model.next} text={model.text} tone="inverse" size={RING} testID="next-application-ring" />
      ) : (
        <View style={styles.icon} {...HIDDEN}>
          <History size={30} color={colors.onFillMint} />
        </View>
      )}
      <View style={styles.body}>
        <AppText size={fontSize.xs} weight={800} tracking={0.03} upper color={colors.green500} lineHeight={16} accessibilityRole="header">
          {model.kicker}
        </AppText>
        <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} color={colors.white} lineHeight={28}>
          {model.dateTitle}
        </AppText>
        <View style={styles.line}>
          <LineIcon size={14} color={colors.green500} />
          <AppText size={fontSize.sm} color={colors.onFillSlate} style={styles.grow}>
            {model.timeLine}
          </AppText>
        </View>
        {model.hint ? (
          <AppText size={fontSize.xs} color={colors.onFillSlate}>
            {model.hint}
          </AppText>
        ) : null}
        <View style={styles.chip} testID="next-application-site">
          <MapPin size={14} color={colors.green500} />
          <AppText style={srOnly}>Local sugerido: </AppText>
          <AppText size={fontSize.sm} weight={700} color={colors.white}>
            {model.suggestedLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.navySoft,
    overflow: "hidden",
    boxShadow: shadows.float,
  },
  icon: {
    width: HISTORY_ICON,
    height: HISTORY_ICON,
    borderRadius: HISTORY_ICON / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.onFillOverlay,
    backgroundColor: colors.onFillChip,
  },
  body: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 3 },
  line: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "stretch" },
  grow: { flexShrink: 1, minWidth: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    marginTop: 6,
    paddingVertical: 3,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.onFillOverlayStrong,
    backgroundColor: colors.onFillChip,
  },
}));
