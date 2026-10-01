import { CupSoda, Droplet, GlassWater, Plus } from "lucide-react-native";
import { useId } from "react";
import { Pressable, View } from "react-native";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { fmtLiters } from "@shared/lib/format";
import { percentOf, WATER_TAPS, type WeekDay } from "@shared/lib/today";
import { AppText, Button, Card, SectionHead } from "@/components/ui";
import { CountUp } from "@/components/ui/metric";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { CelebrationGlow, CelebrationLift, useCelebration } from "./celebration";
import { WaterWeek } from "./water-week";

type Props = {
  totalMl: number;
  goalMl: number | null;
  week: WeekDay[];
  onTap: (ml: number) => void;
  onCustom: () => void;
  /** Brilho ao bater a meta; desligado para perfis sensíveis. */
  canCelebrate?: boolean;
};

const TAP_ICONS = [Droplet, GlassWater, CupSoda] as const;
const GLASS = "M6 6h44l-5 60a4 4 0 0 1-4 3.6H15a4 4 0 0 1-4-3.6z";

/** Copo que enche até a porcentagem da meta; a onda é deslocada no próprio caminho (sem transform no SVG). */
function WaterGlass({ percent }: { percent: number }) {
  const colors = useThemeColors();
  const clipId = `water-glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const level = 64 - (Math.min(100, percent) / 100) * 56;
  return (
    <Svg width={56} height={72} viewBox="0 0 56 72">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={GLASS} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect x={0} y={0} width={56} height={72} fill={colors.sky50} />
        <Path d={`M0 ${4 + level}q7-4 14 0t14 0 14 0 14 0v80H0z`} fill={colors.blue} opacity={0.85} />
      </G>
      <Path d={GLASS} fill="none" stroke={colors.sky600} strokeWidth={2} />
    </Svg>
  );
}

/** Água do dia: copo, total em litros, registro em um toque e a semana com a linha da meta. */
export function WaterCard({ totalMl, goalMl, week, onTap, onCustom, canCelebrate = false }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const percent = percentOf(totalMl, goalMl) ?? 0;
  const isReached = goalMl !== null && totalMl >= goalMl;
  const isCelebrating = useCelebration(isReached, canCelebrate, totalMl);
  const progress =
    goalMl === null ? "registrados hoje" : isReached ? `de ${fmtLiters(goalMl)} · meta alcançada` : `de ${fmtLiters(goalMl)} · ${percent}%`;
  return (
    <Card testID="water-card">
      <SectionHead
        title="Água"
        subtitle={goalMl !== null ? `Meta de ${fmtLiters(goalMl)} por dia` : "Sem meta de água informada"}
        right={<Button label="Registrar água" variant="link" icon={Plus} onPress={onCustom} />}
      />
      <View style={styles.main}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <CelebrationLift isOn={isCelebrating}>
            <WaterGlass percent={percent} />
          </CelebrationLift>
        </View>
        <View style={styles.amount}>
          <AppText
            heading
            size={fontSize["3xl"]}
            weight={800}
            tracking={-0.02}
            lineHeight={30}
            color={domainTone.water.fg}
            style={styles.tabular}
            accessibilityLabel={fmtLiters(totalMl)}
            testID="water-total"
          >
            {/* O número conta até o novo total; o leitor de tela ouve direto o valor exato. */}
            <CountUp value={totalMl} format={fmtLiters} />
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted}>
            {progress}
          </AppText>
        </View>
      </View>
      <View style={styles.taps}>
        {WATER_TAPS.map((tap, i) => {
          const Icon = TAP_ICONS[i] ?? Droplet;
          return (
            <Pressable
              key={tap.ml}
              accessibilityRole="button"
              accessibilityLabel={`${tap.label} +${tap.ml} ml`}
              onPress={() => onTap(tap.ml)}
              style={({ pressed }) => [styles.tap, pressed && styles.tapPressed]}
            >
              <Icon size={18} color={domainTone.water.fg} />
              <AppText size={fontSize.sm} weight={700} lineHeight={18}>
                {tap.label}
              </AppText>
              <AppText size={fontSize["2xs"]} weight={600} color={colors.muted} lineHeight={14}>
                +{tap.ml} ml
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <WaterWeek days={week} goalMl={goalMl} />
      {isCelebrating && <CelebrationGlow color={colors.blue} borderRadius={radius.card} />}
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  main: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  amount: { flex: 1, minWidth: 0, gap: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
  taps: { flexDirection: "row", gap: 8, marginTop: 2 },
  tap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).water.border,
    backgroundColor: themeDomainTone(scheme).water.bg,
  },
  tapPressed: { backgroundColor: colors.sky100, transform: [{ scale: 0.96 }] },
}));
