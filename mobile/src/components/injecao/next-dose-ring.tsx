import { Syringe } from "lucide-react-native";
import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { arcDash, circumference, ringSegments } from "@shared/lib/charts";
import type { NextDose, NextDoseText } from "@shared/lib/treatment";
import { circlePath } from "@/components/hoje/ring-path";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

/** O desenho é feito em 88 × 88 e escala para `size` (como o viewBox do web). */
const VIEW = 88;
const RING_RADIUS = 38;
const RING_CENTER = 44;
const RING_GAP = 4;
const STROKE = 8;
/** Intervalos de 2 a 14 dias viram segmentos (um por dia); os outros, um arco contínuo. */
const SEGMENT_MIN = 2;
const SEGMENT_MAX = 14;

type Props = {
  next: NextDose;
  text: NextDoseText;
  /**
   * medication: segmentos no tom da medicação sobre fundo claro (Hoje) ·
   * inverse: arco contínuo em gradiente com a ponta branca, para o cartão azul-marinho (Seringa).
   */
  tone?: "medication" | "inverse";
  /** Lado em px (o desenho escala). Hoje 78–88; Seringa 90–96. */
  size?: number;
  /** "next-dose-ring" (Hoje) ou "next-application-ring" (Seringa). */
  testID?: string;
  /** Cartão da caneta no Hoje: número de 32 px e a unidade de 13 px (como o .injection-card do web). */
  isLarge?: boolean;
};

/** Ponto na circunferência a `percent` do topo, no sentido horário. */
function pointAt(percent: number) {
  const angle = (percent / 100) * 2 * Math.PI - Math.PI / 2;
  return { x: RING_CENTER + RING_RADIUS * Math.cos(angle), y: RING_CENTER + RING_RADIUS * Math.sin(angle) };
}

/**
 * Anel da próxima dose estimada (NextDoseRing do web, o "CountdownRing" do INTEGRATION-FID): nunca vermelho
 * nem âmbar, mesmo depois da data. O nome acessível (`text.aria`) diz "estimada" e o dia do ciclo. Sem dose.
 */
export function NextDoseRing({ next, text, tone = "medication", size = VIEW, testID = "next-dose-ring", isLarge = false }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const gradientId = `dose-arc-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const medication = themeDomainTone(scheme).medication;
  const isInverse = tone === "inverse";
  const isSegmented = !isInverse && next.intervalDays >= SEGMENT_MIN && next.intervalDays <= SEGMENT_MAX;
  const filled = Math.min(next.elapsedDays, next.intervalDays);
  const c = circumference(RING_RADIUS);
  const d = circlePath(RING_CENTER, RING_RADIUS);
  const end = pointAt(Math.min(100, next.progress));
  const isWord = !text.unit;
  const numberSize = isInverse
    ? isWord
      ? fontSize.xl
      : fontSize["5xl"]
    : isWord
      ? fontSize.lg
      : isLarge
        ? fontSize["4xl"]
        : fontSize["2xl"];
  const unitSize = isInverse || isLarge ? fontSize.sm : fontSize.xs;
  return (
    <View style={[styles.ring, { width: size, height: size }]} accessibilityRole="image" accessibilityLabel={text.aria} testID={testID}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {isInverse ? (
          <Defs>
            <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.green500} />
              <Stop offset="1" stopColor={colors.sky500} />
            </SvgGradient>
          </Defs>
        ) : null}
        {isSegmented ? (
          ringSegments(RING_RADIUS, next.intervalDays, RING_GAP).map((segment, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="butt"
              stroke={i < filled ? medication.fg : medication.bg}
              strokeDasharray={`${Math.max(0.5, segment.length)} ${c}`}
              strokeDashoffset={segment.offset}
            />
          ))
        ) : (
          <>
            <Circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" strokeWidth={STROKE} stroke={isInverse ? colors.onFillOverlay : medication.bg} />
            {next.progress > 0 ? (
              <Path
                d={d}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="round"
                stroke={isInverse ? `url(#${gradientId})` : medication.fg}
                strokeDasharray={arcDash(RING_RADIUS, next.progress)}
              />
            ) : null}
            {isInverse && next.progress > 0 && next.progress < 100 ? <Circle cx={end.x} cy={end.y} r={STROKE / 2 - 1} fill={colors.white} /> : null}
          </>
        )}
      </Svg>
      <View style={styles.center}>
        {text.ring ? (
          <>
            <AppText heading size={numberSize} weight={800} color={isInverse ? colors.white : colors.text} lineHeight={numberSize} style={styles.tabular}>
              {text.ring}
            </AppText>
            {text.unit ? (
              <AppText size={unitSize} weight={600} color={isInverse ? colors.onFillMint : colors.muted} lineHeight={isInverse ? 18 : unitSize + 3}>
                {text.unit}
              </AppText>
            ) : null}
          </>
        ) : (
          <Syringe size={24} color={isInverse ? colors.mint300 : medication.fg} />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  ring: { flexShrink: 0 },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
}));
