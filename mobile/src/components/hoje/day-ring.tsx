import { Fragment, useId, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { arcDash, ringSegments, segmentFill } from "@shared/lib/charts";
import { energyRing } from "@shared/lib/day";
import { fmtNumber } from "@shared/lib/format";
import { AppText } from "@/components/ui";
import { CountUp } from "@/components/ui/metric";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, mixColors, motion, themeDomainTone, themeMacroColor } from "@/theme/tokens";
import type { MacroValue } from "./macro-summary";
import { circlePath } from "./ring-path";

type Props = {
  consumed: number;
  goal: number | null;
  hideCalories: boolean;
  macros: MacroValue[];
  waterPercent: number;
  habitsPercent: number;
  meals: number;
};

export const RING_SIZE = 164;
const CENTER = RING_SIZE / 2;
const ENERGY_RADIUS = 74;
const ENERGY_STROKE = 12;
/** Mesmos raios do DayHero do web: o anel de gordura (42) deixa ~76 px para o rótulo do centro. */
const MACRO_RADII = [60, 51, 42] as const;
const MACRO_STROKE = 7;
/** Trilho de cada macro: a cor do macro bem clara sobre o cartão (color-mix 16 % do web). */
const MACRO_TRACK_WEIGHT = 0.16;
/** Largura do rótulo do centro: "kcal restantes" quebra em duas linhas inteiras a 13 px. */
const CAPTION_WIDTH = 80;
const MAIN_MEALS = 3;
/** Folga entre os três segmentos de presença (px de traço). */
const PRESENCE_GAP = 10;
/** Folga do traço depois de cada segmento: maior que o anel, para o padrão não se repetir. */
const DASH_REST = 1000;
/** "1.645" não cabe em 28 px dentro do anel de gordura: números de 4 dígitos descem um degrau. */
const isLong = (value: number) => fmtNumber(value).length >= 5;

/** Há anel de energia (e o "Como calculamos") só com calorias à vista e uma meta. */
export function hasEnergyRing(consumed: number, goal: number | null, hideCalories: boolean): boolean {
  return !hideCalories && energyRing(consumed, goal) !== null;
}

function Arc({ r, percent, stroke, width, track }: { r: number; percent: number; stroke: string; width: number; track?: string }) {
  const colors = useThemeColors();
  return (
    <>
      <Circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={track ?? colors.surface2} strokeWidth={width} />
      {percent > 0 && (
        <Path
          d={circlePath(CENTER, r)}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={arcDash(r, percent)}
        />
      )}
    </>
  );
}

/** "Seu dia" sem números de energia: refeições, água e combinados, um terço do anel cada. */
function PresenceArcs({ parts }: { parts: { key: string; percent: number; stroke: string }[] }) {
  const colors = useThemeColors();
  const segments = ringSegments(ENERGY_RADIUS, parts.length, PRESENCE_GAP);
  const d = circlePath(CENTER, ENERGY_RADIUS);
  return (
    <>
      {parts.map((part, i) => {
        const segment = segments[i]!;
        const filled = segmentFill(segment, part.percent);
        return (
          <Fragment key={part.key}>
            <Path
              d={d}
              fill="none"
              stroke={colors.surface2}
              strokeWidth={ENERGY_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${segment.length} ${DASH_REST}`}
              strokeDashoffset={segment.offset}
            />
            {filled > 0 && (
              <Path
                d={d}
                fill="none"
                stroke={part.stroke}
                strokeWidth={ENERGY_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${DASH_REST}`}
                strokeDashoffset={segment.offset}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Rótulo do centro: número (ou palavra) grande e a legenda em duas linhas, dentro do anel de gordura. */
function RingCenter({ value, caption, isWord = false, isLongValue = false }: { value: ReactNode; caption: string; isWord?: boolean; isLongValue?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const size = isWord ? fontSize.md : isLongValue ? fontSize["3xl"] : fontSize["5xl"];
  return (
    <View style={styles.center} pointerEvents="none">
      <AppText
        heading
        size={size}
        weight={800}
        tracking={isWord ? -0.01 : -0.03}
        lineHeight={isWord ? 18 : size}
        align="center"
        style={styles.tabular}
      >
        {value}
      </AppText>
      <AppText size={fontSize.sm} weight={600} color={colors.muted} lineHeight={16} align="center" style={styles.caption}>
        {caption}
      </AppText>
    </View>
  );
}

/**
 * Anel do topo do Hoje: energia com os três macros por dentro; tocar alterna restantes e consumidas.
 * Com calorias ocultas ou sem meta vira "Seu dia" em três segmentos de presença, sem número de energia.
 */
export function DayRing({ consumed, goal, hideCalories, macros, waterPercent, habitsPercent, meals }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const macroColor = themeMacroColor(scheme);
  const gradientId = `day-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [isShowingConsumed, setShowingConsumed] = useState(false);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const ring = hideCalories ? null : energyRing(consumed, goal);
  const mealsDone = Math.min(meals, MAIN_MEALS);
  const presence = [
    { key: "meals", percent: (mealsDone / MAIN_MEALS) * 100, stroke: domainTone.food.fg },
    { key: "water", percent: waterPercent, stroke: colors.blue },
    { key: "habits", percent: habitsPercent, stroke: domainTone.habit.fg },
  ];
  // As chaves evitam que o CountUp anime de "consumidas" para "restantes".
  const center = !ring ? (
    <RingCenter
      key="day"
      value="Seu dia"
      caption={hideCalories ? `${mealsDone} de ${MAIN_MEALS} refeições` : `${fmtNumber(consumed)} kcal hoje`}
      isWord
    />
  ) : isShowingConsumed ? (
    <RingCenter key="consumed" value={<CountUp value={consumed} />} caption="kcal consumidas" isLongValue={isLong(consumed)} />
  ) : ring.reached ? (
    <RingCenter key="reached" value="Meta do dia" caption="alcançada" isWord />
  ) : (
    <RingCenter key="remaining" value={<CountUp value={ring.remaining} />} caption="kcal restantes" isLongValue={isLong(ring.remaining)} />
  );
  const presenceLabel = `Seu dia: ${mealsDone} de ${MAIN_MEALS} refeições, água em ${waterPercent}% e combinados em ${habitsPercent}%`;
  const ringLabel = ring
    ? `${fmtNumber(consumed)} de ${fmtNumber(goal ?? 0)} kcal, ${ring.percent}% da meta`
    : hideCalories
      ? presenceLabel
      : `${presenceLabel}. ${fmtNumber(consumed)} kcal consumidas, sem meta definida`;
  const art = (
    <>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Defs>
          {/* Mesmo sentido do web (lá o gradiente gira junto com o arco): esmeralda embaixo à esquerda, azul em cima à direita. */}
          <LinearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.emerald} />
            <Stop offset="1" stopColor={colors.blue} />
          </LinearGradient>
        </Defs>
        {ring ? (
          <Arc r={ENERGY_RADIUS} percent={ring.percent} stroke={`url(#${gradientId})`} width={ENERGY_STROKE} />
        ) : (
          <PresenceArcs parts={presence} />
        )}
        {macros.map((m, i) => (
          <Arc
            key={m.key}
            r={MACRO_RADII[i] ?? MACRO_RADII[2]}
            percent={m.percent ?? 0}
            stroke={macroColor[m.key]}
            track={mixColors(macroColor[m.key], colors.surface, MACRO_TRACK_WEIGHT)}
            width={MACRO_STROKE}
          />
        ))}
      </Svg>
      {center}
    </>
  );
  if (!ring)
    return (
      <View style={styles.ring} accessible accessibilityRole="image" accessibilityLabel={ringLabel} testID="calories-total">
        {art}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ringLabel}. Mostrar kcal ${isShowingConsumed ? "restantes" : "consumidas"}`}
      onPress={() => setShowingConsumed(!isShowingConsumed)}
      onPressIn={() => {
        press.value = withSpring(0.96, motion.spring.snappy);
      }}
      onPressOut={() => {
        press.value = withSpring(1, motion.spring.snappy);
      }}
      testID="calories-total"
      style={styles.ring}
    >
      <Animated.View style={[styles.ring, pressStyle]}>{art}</Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  ring: { width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2 },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  /**
   * Cabe dentro do anel de gordura em duas linhas (max-width do web). O react-native-web quebra palavras
   * longas: 74 px deixa "consumidas" (cerca de 70 px a 12 px) inteira.
   */
  caption: { maxWidth: CAPTION_WIDTH },
  tabular: { fontVariant: ["tabular-nums"] },
}));
