import { Coffee, GlassWater, Soup, Utensils, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Line } from "react-native-svg";
import { DAY_POINTS, type DayPointKey } from "@shared/lib/day-timeline";
import { fmtWater } from "@shared/lib/format";
import { dayLine, planWater } from "@shared/lib/plan-reveal";
import type { Goals, Profile } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, mixColors, shadows } from "@/theme/tokens";
import { PLAN_NARROW_WIDTH } from "./plan-energy";

const MAX_GLASSES_SHOWN = 12;
/**
 * Copos em linhas de 5 (2 × 5 para 2,5 L), de 18 px com 4 px de folga como no web. No cartão estreito a
 * folga some (o desenho do copo já tem margem dos lados) e eles encolhem para caber (no web, passam da borda).
 */
const GLASSES_PER_ROW = 5;
const GLASS_SIZE = 18;
const MIN_GLASS_SIZE = 12;
const GLASS_GAP = 4;
/** Enchimento dos copos: o sky-300 do web (entre o sky-400 e a superfície). */
const GLASS_FILL_WEIGHT = 0.62;
const NODE_SIZE = 36;
const CONNECTOR_WIDTH = 2;
/** Refeições da linha "Seu dia" (horários reais da anamnese; nunca um lanche inventado). */
const MEAL_POINTS: readonly { key: DayPointKey; icon: LucideIcon }[] = [
  { key: "breakfastTime", icon: Coffee },
  { key: "lunchTime", icon: Utensils },
  { key: "dinnerTime", icon: Soup },
];

/** Água e "Seu dia" lado a lado (1 : 2); até 360 px, um embaixo do outro (.plan-duo do web). */
export function PlanDuo({ profile, goals }: { profile: Profile; goals: Goals }) {
  const styles = useStyles();
  const isNarrow = useWindowDimensions().width <= PLAN_NARROW_WIDTH;
  return (
    <View style={[styles.duo, isNarrow && styles.duoNarrow]}>
      <View style={isNarrow ? null : styles.waterCol}>
        <WaterCard goals={goals} />
      </View>
      <View style={isNarrow ? null : styles.dayCol}>
        <DayLine profile={profile} />
      </View>
    </View>
  );
}

/** Água do dia: litros em destaque e copos de 250 ml (sem meta, o aviso no lugar). */
function WaterCard({ goals }: { goals: Goals }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const water = planWater(goals);
  if (!water || goals.water === null)
    return (
      <View style={[styles.water, styles.waterEmpty]}>
        <AppText size={fontSize.sm} lineHeight={20} color={colors.muted}>
          Meta de água ainda não informada.
        </AppText>
      </View>
    );
  // Um décimo abaixo da divisão exata, para o arredondamento nunca empurrar o 5º copo para a linha seguinte.
  const fit = Math.floor((width / GLASSES_PER_ROW) * 10) / 10;
  const glass = width > 0 ? Math.max(MIN_GLASS_SIZE, Math.min(GLASS_SIZE, fit)) : GLASS_SIZE;
  const gap = Math.max(0, Math.min(GLASS_GAP, Math.floor((width - GLASSES_PER_ROW * glass) / (GLASSES_PER_ROW - 1))));
  // A grade tem sempre 5 colunas (com o cartão largo, até 360 px, os 10 copos não viram uma fila só).
  const grid = { columnGap: gap, maxWidth: GLASSES_PER_ROW * glass + (GLASSES_PER_ROW - 1) * gap + 0.5 };
  const fill = mixColors(colors.sky400, colors.surface, GLASS_FILL_WEIGHT);
  return (
    <View testID="plan-water" accessible accessibilityRole="image" accessibilityLabel={water.aria} style={styles.water}>
      <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} lineHeight={25} color={colors.sky700}>
        {fmtWater(goals.water)}
      </AppText>
      <AppText size={fontSize.xs} weight={600} lineHeight={19} color={colors.sky800}>
        água por dia
      </AppText>
      <View style={[styles.glasses, width > 0 && grid]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {Array.from({ length: Math.min(water.glasses, MAX_GLASSES_SHOWN) }, (_, i) => (
          <GlassWater key={i} size={glass} color={colors.sky500} fill={fill} />
        ))}
        {water.glasses > MAX_GLASSES_SHOWN ? (
          <AppText size={fontSize.xs} weight={700} color={colors.sky800} style={styles.more}>
            {`+${water.glasses - MAX_GLASSES_SHOWN}`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** "Seu dia": café, almoço e jantar nos horários da anamnese, com o acordar e o dormir embaixo. */
function DayLine({ profile }: { profile: Profile }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const line = dayLine(profile);
  const timeOf = (key: DayPointKey) => line.items.find((item) => item.key === key)?.time ?? "";
  const shortOf = (key: DayPointKey) => DAY_POINTS.find((point) => point.key === key)?.short ?? "";
  return (
    <View testID="plan-day" accessible accessibilityRole="image" accessibilityLabel={line.aria} style={styles.day}>
      <AppText size={fontSize.xs} weight={700} lineHeight={19} tracking={0.08} upper color={colors.muted}>
        Seu dia
      </AppText>
      <View style={styles.dayList}>
        {/* Linha tracejada que liga os horários das refeições (por baixo dos círculos). */}
        <View pointerEvents="none" style={styles.connector}>
          <Svg width="100%" height={CONNECTOR_WIDTH}>
            <Line
              x1="0"
              y1={CONNECTOR_WIDTH / 2}
              x2="100%"
              y2={CONNECTOR_WIDTH / 2}
              stroke={colors.mint200}
              strokeWidth={CONNECTOR_WIDTH}
              strokeDasharray="6 4"
            />
          </Svg>
        </View>
        {MEAL_POINTS.map(({ key, icon: Icon }) => (
          <View key={key} style={styles.dayItem}>
            <View style={styles.node}>
              <Icon size={18} color={colors.green700} />
            </View>
            <AppText heading size={fontSize.sm} weight={800} lineHeight={21} style={styles.tabular}>
              {timeOf(key)}
            </AppText>
            <AppText size={fontSize.xs} lineHeight={19} color={colors.muted} numberOfLines={1}>
              {shortOf(key)}
            </AppText>
          </View>
        ))}
      </View>
      <AppText size={fontSize.xs} lineHeight={19} color={colors.muted} align="center">
        {`Acorda ${timeOf("wakeTime")} · dorme ${timeOf("sleepTime")}`}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  duo: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  duoNarrow: { flexDirection: "column" },
  waterCol: { flex: 1, minWidth: 0 },
  dayCol: { flex: 2, minWidth: 0 },
  // .plan-water: céu claro com borda sky-100
  water: {
    flexGrow: 1,
    gap: 2,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.sky100,
    backgroundColor: colors.sky50,
  },
  waterEmpty: { justifyContent: "center" },
  glasses: { flexDirection: "row", flexWrap: "wrap", rowGap: GLASS_GAP, marginTop: 10 },
  more: { width: "100%" },
  // .plan-day: superfície com sombra de flutuação
  day: {
    flexGrow: 1,
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    boxShadow: shadows.float,
  },
  dayList: { flexDirection: "row", gap: 4 },
  connector: { position: "absolute", top: NODE_SIZE / 2 - CONNECTOR_WIDTH / 2, left: "16%", right: "16%", height: CONNECTOR_WIDTH },
  dayItem: { flex: 1, minWidth: 0, alignItems: "center", gap: 2 },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: NODE_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  tabular: { fontVariant: ["tabular-nums"] },
}));
