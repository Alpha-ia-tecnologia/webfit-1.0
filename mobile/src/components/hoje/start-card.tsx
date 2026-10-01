import { Droplets, Heart, Utensils, type LucideIcon } from "lucide-react-native";
import { useId } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect } from "react-native-svg";
import { dayPeriod, mealWord, type DayPeriodKey } from "@shared/lib/diary-day";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, themeDomainTone, type Domain } from "@/theme/tokens";

/** Até esta largura de tela os três atalhos ficam um embaixo do outro (como o web a 380 px). */
const STACK_MAX_WIDTH = 380;
const ART_SIZE = 72;

/** Ilustração do período do dia: nascer do sol, sol a pino ou lua (SVG local, sem imagem externa). */
function PeriodArt({ period }: { period: DayPeriodKey }) {
  const colors = useThemeColors();
  const clipId = `start-art-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (period === "noite")
    return (
      <Svg width={ART_SIZE} height={ART_SIZE} viewBox="0 0 72 72">
        <Circle cx={36} cy={36} r={30} fill={colors.indigo50} />
        <Path d="M44 20a17 17 0 1 0 8 26A14 14 0 0 1 44 20Z" fill={colors.indigo500} />
        <Circle cx={22} cy={22} r={1.8} fill={colors.indigo500} />
        <Circle cx={54} cy={16} r={1.4} fill={colors.indigo500} />
        <Circle cx={18} cy={44} r={1.2} fill={colors.indigo500} />
      </Svg>
    );
  const isMorning = period === "manha";
  const cy = isMorning ? 44 : 36;
  const rays = isMorning ? 5 : 8;
  return (
    <Svg width={ART_SIZE} height={ART_SIZE} viewBox="0 0 72 72">
      <Circle cx={36} cy={36} r={30} fill={colors.amber50} />
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={72} height={isMorning ? 46 : 72} />
        </ClipPath>
      </Defs>
      {Array.from({ length: rays }, (_, i) => {
        const angle = isMorning ? Math.PI + (i + 1) * (Math.PI / (rays + 1)) : (i * 2 * Math.PI) / rays;
        return (
          <Line
            key={i}
            x1={36 + Math.cos(angle) * 18}
            y1={cy + Math.sin(angle) * 18}
            x2={36 + Math.cos(angle) * 24}
            y2={cy + Math.sin(angle) * 24}
            stroke={colors.amber500}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      <Circle cx={36} cy={cy} r={13} fill={colors.amber500} clipPath={`url(#${clipId})`} />
      {isMorning && <Path d="M12 47h48" stroke={colors.amber200} strokeWidth={3} strokeLinecap="round" />}
    </Svg>
  );
}

function Tile({
  icon: Icon,
  domain,
  title,
  hint,
  accessibilityLabel,
  isStacked,
  onPress,
}: {
  icon: LucideIcon;
  domain: Domain;
  title: string;
  hint: string;
  accessibilityLabel: string;
  isStacked: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme)[domain];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        isStacked ? styles.tileRow : styles.tileColumn,
        { backgroundColor: tone.bg, borderColor: tone.border },
        pressed && styles.pressed,
      ]}
    >
      <Icon size={18} color={tone.fg} />
      <View style={isStacked ? styles.tileCopyRow : styles.tileCopy}>
        <AppText size={fontSize.sm} weight={700} numberOfLines={1}>
          {title}
        </AppText>
        <AppText size={fontSize["2xs"]} color={colors.muted} numberOfLines={isStacked ? 1 : 2}>
          {hint}
        </AppText>
      </View>
    </Pressable>
  );
}

type Props = {
  time: string;
  mealCategory: string;
  /** Volume do toque único; null com restrição hídrica (abre o formulário de volume). */
  quickWaterMl: number | null;
  onMeal: () => void;
  onWater: () => void;
  onMood: () => void;
};

/**
 * "Comece seu dia" (HOJE-X3), no lugar do próximo passo enquanto o dia está em branco: um convite
 * neutro, sem cobrança, com três registros de um toque (StartCard do web).
 */
export function StartCard({ time, mealCategory, quickWaterMl, onMeal, onWater, onMood }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { key, greeting } = dayPeriod(time);
  const isStacked = useWindowDimensions().width <= STACK_MAX_WIDTH;
  return (
    <Card style={styles.card} testID="start-card">
      <View style={styles.head}>
        <PeriodArt period={key} />
        <View style={styles.headCopy}>
          <AppText
            size={fontSize.xs}
            weight={800}
            upper
            tracking={0.06}
            color={key === "noite" ? colors.indigo700 : colors.green700}
          >
            {greeting}
          </AppText>
          <AppText heading size={fontSize.xl} weight={800} accessibilityRole="header">
            Comece seu dia
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted}>
            Um toque registra; dá para ajustar depois.
          </AppText>
        </View>
      </View>
      <View style={[styles.tiles, isStacked && styles.tilesStacked]}>
        <Tile
          icon={Utensils}
          domain="food"
          title={mealCategory}
          hint="registrar"
          accessibilityLabel={`Registrar ${mealWord(mealCategory)}`}
          isStacked={isStacked}
          onPress={onMeal}
        />
        <Tile
          icon={Droplets}
          domain="water"
          title={quickWaterMl ? `+${quickWaterMl} ml` : "Água"}
          hint={quickWaterMl ? "copo de água" : "informar volume"}
          accessibilityLabel={quickWaterMl ? `Registrar ${quickWaterMl} ml de água` : "Água: informar volume"}
          isStacked={isStacked}
          onPress={onWater}
        />
        <Tile
          icon={Heart}
          domain="mind"
          title="Bem-estar"
          hint="como você está"
          accessibilityLabel="Registrar bem-estar"
          isStacked={isStacked}
          onPress={onMood}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  card: { gap: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 16 },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  tiles: { flexDirection: "row", gap: 10 },
  tilesStacked: { flexDirection: "column" },
  tile: { borderRadius: 18, borderWidth: 1, padding: 12, gap: 4 },
  tileColumn: { flex: 1, minWidth: 0, minHeight: 88 },
  tileRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  tileCopy: { gap: 2 },
  tileCopyRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  pressed: { transform: [{ scale: 0.96 }] },
}));
