import { Droplet, Info, Leaf, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { arcDash, circumference, ringSegments } from "@shared/lib/charts";
import { fmtLiters, fmtNumber } from "@shared/lib/format";
import { percentOf } from "@shared/lib/today";
import { AppText, Card } from "@/components/ui";
import { CountUp } from "@/components/ui/metric";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";
import { DayRing, hasEnergyRing } from "./day-ring";
import { MacroSummary, type MacroValue as Macro } from "./macro-summary";
import { circlePath } from "./ring-path";

type Props = {
  consumed: number;
  goal: number | null;
  hideCalories: boolean;
  macros: Macro[];
  water: { ml: number; goal: number | null };
  habits: { done: number; total: number };
  meals: number;
  /** Toque no tile de água: abre a folha "Registrar água". */
  onWater: () => void;
  /** "+" do tile de água (um copo em um toque); ausente com restrição hídrica. */
  onWaterAdd?: (ml: number) => void;
  onHabits: () => void;
  onExplain: () => void;
};

/** Abaixo desta largura o anel sobe e os tiles descem, um embaixo do outro (o @media 379px do web). */
const STACK_BELOW_WIDTH = 380;
/** Um copo no "+" do tile de água. */
const WATER_ADD_ML = 250;
/** Mini-anel de 28 px do tile (DayHero do web): raio 11,5, traço 3. */
const TILE = 28;
const TILE_C = TILE / 2;
const TILE_R = 11.5;
const TILE_STROKE = 3;
/** Folga entre os segmentos dos combinados no mini-anel (px de traço). */
const TILE_GAP = 3;
/** "+" de um copo: círculo de 32 px desenhado dentro de um alvo de 44 px no canto do tile. */
const ADD_TARGET = 44;
const ADD_CIRCLE = 32;
/** Litros sem a unidade: "1,75". */
const literNumber = (ml: number) => fmtNumber(ml / 1000, 2);

/** Mini-anel do tile: água em arco contínuo; combinados em um segmento por combinado. */
function TileRing({ kind, percent = 0, done = 0, total = 0 }: { kind: "water" | "habits"; percent?: number; done?: number; total?: number }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme);
  const d = circlePath(TILE_C, TILE_R);
  const Icon = kind === "water" ? Droplet : Leaf;
  return (
    <View style={styles.tileRing}>
      <Svg width={TILE} height={TILE} viewBox={`0 0 ${TILE} ${TILE}`} style={styles.tileRingSvg}>
        {kind === "water" ? (
          <>
            <Circle cx={TILE_C} cy={TILE_C} r={TILE_R} fill="none" stroke={colors.sky100} strokeWidth={TILE_STROKE} />
            {percent > 0 && (
              <Path d={d} fill="none" stroke={colors.blue} strokeWidth={TILE_STROKE} strokeLinecap="round" strokeDasharray={arcDash(TILE_R, percent)} />
            )}
          </>
        ) : (
          ringSegments(TILE_R, Math.max(total, 1), TILE_GAP).map((segment, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              stroke={i < done ? tone.habit.fg : colors.surface2}
              strokeWidth={TILE_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.5, segment.length)} ${circumference(TILE_R)}`}
              strokeDashoffset={segment.offset}
            />
          ))
        )}
      </Svg>
      <Icon size={14} color={kind === "water" ? tone.water.fg : tone.habit.fg} />
    </View>
  );
}

/** Número grande do tile ("1,75" / "1") com o complemento pequeno ("/ 2,5 L" / "de 3"). */
function TileValue({ value, rest }: { value: ReactNode; rest: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} lineHeight={27} numberOfLines={1} style={styles.tabular}>
      {value}
      <AppText size={fontSize.sm} weight={600} color={colors.muted}>
        {rest}
      </AppText>
    </AppText>
  );
}

/**
 * Topo do Hoje (DayHero do web): anel de energia com os três macros por dentro e os tiles de água (com "+"
 * de um toque) e combinados, cada um com seu mini-anel. Tocar no anel alterna restantes e consumidas; o (i)
 * no canto abre "Como calculamos". Com calorias ocultas ou sem meta, o anel vira "Seu dia" em três segmentos.
 */
export function DayHero({ consumed, goal, hideCalories, macros, water, habits, meals, onWater, onWaterAdd, onHabits, onExplain }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isStacked = width < STACK_BELOW_WIDTH;
  const waterPercent = percentOf(water.ml, water.goal) ?? 0;
  const habitsPercent = percentOf(habits.done, habits.total) ?? 0;
  const waterLabel = `Água: ${fmtLiters(water.ml)}${water.goal !== null ? ` de ${fmtLiters(water.goal)}` : ""}. Registrar água`;
  const hasExplain = hasEnergyRing(consumed, goal, hideCalories);

  return (
    <Card style={styles.hero}>
      <View style={[styles.grid, isStacked && styles.gridStacked]}>
        <DayRing
          consumed={consumed}
          goal={goal}
          hideCalories={hideCalories}
          macros={macros}
          waterPercent={waterPercent}
          habitsPercent={habitsPercent}
          meals={meals}
        />
        <View style={[styles.tiles, !isStacked && styles.tilesColumn]}>
          <View style={styles.tile}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={waterLabel}
              onPress={onWater}
              style={({ pressed }) => [styles.tileMain, pressed && styles.tilePressed]}
            >
              <View style={styles.tileHead}>
                <TileRing kind="water" percent={waterPercent} />
                <AppText size={fontSize.md} weight={600} color={colors.text2}>
                  Água
                </AppText>
              </View>
              <TileValue value={<CountUp value={water.ml} format={literNumber} />} rest={water.goal !== null ? ` / ${literNumber(water.goal)} L` : " L"} />
            </Pressable>
            {onWaterAdd && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${WATER_ADD_ML} ml de água`}
                onPress={() => onWaterAdd(WATER_ADD_ML)}
                style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
              >
                <View style={styles.addCircle}>
                  <Plus size={18} color={colors.sky700} />
                </View>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Combinados: ${habits.done} de ${habits.total}`}
            onPress={onHabits}
            style={({ pressed }) => [styles.tile, styles.tileMain, pressed && styles.tilePressed]}
          >
            <View style={styles.tileHead}>
              <TileRing kind="habits" done={habits.done} total={habits.total} />
              <AppText size={fontSize.md} weight={600} color={colors.text2} numberOfLines={1} style={styles.shrink}>
                Combinados
              </AppText>
            </View>
            <TileValue value={habits.done} rest={` de ${habits.total}`} />
          </Pressable>
        </View>
      </View>
      <MacroSummary macros={macros} />
      {hasExplain && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Como calculamos"
          onPress={onExplain}
          style={({ pressed }) => [styles.explain, pressed && styles.explainPressed]}
        >
          <Info size={18} color={colors.muted} />
        </Pressable>
      )}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  /** 16 px nas laterais e 12 entre o anel e os tiles (18 e 14 no web): a fonte do app é um pouco mais larga e "Combinados" cabe inteiro. */
  hero: { gap: 14, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 28 },
  grid: { flexDirection: "row", alignItems: "center", gap: 12 },
  gridStacked: { flexDirection: "column" },
  tabular: { fontVariant: ["tabular-nums"] },
  shrink: { flexShrink: 1 },
  tiles: { gap: 10, alignSelf: "stretch" },
  /** Ao lado do anel: ocupa o resto da linha. */
  tilesColumn: { flex: 1, justifyContent: "center" },
  /** Tile cinza-claro (surface-3) com borda suave, 82 px de altura. */
  tile: {
    minHeight: 82,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  tileMain: { flexGrow: 1, justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 20 },
  tilePressed: { transform: [{ scale: 0.98 }] },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  tileRing: { width: TILE, height: TILE, alignItems: "center", justifyContent: "center" },
  tileRingSvg: { position: "absolute", top: 0, left: 0 },
  add: {
    position: "absolute",
    top: 4,
    right: 4,
    width: ADD_TARGET,
    height: ADD_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  addCircle: {
    width: ADD_CIRCLE,
    height: ADD_CIRCLE,
    borderRadius: ADD_CIRCLE / 2,
    backgroundColor: colors.sky100,
    alignItems: "center",
    justifyContent: "center",
  },
  addPressed: { transform: [{ scale: 0.9 }] },
  /** "Como calculamos": só o (i) no canto do cartão, alvo de 44 px fora do desenho do anel. */
  explain: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  explainPressed: { backgroundColor: colors.surface3 },
}));
