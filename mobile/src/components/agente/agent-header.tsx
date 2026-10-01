import { LinearGradient } from "expo-linear-gradient";
import { Brain, ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { arcDash } from "@shared/lib/charts";
import { fmtLiters, fmtNumber, plural } from "@shared/lib/format";
import { circlePath } from "@/components/hoje/ring-path";
import { AppText, IconButton } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import {
  diagonalDown,
  fontSize,
  gradients,
  radius,
  shadows,
  themeDomainTone,
  themeMacroColor,
  type ColorScheme,
} from "@/theme/tokens";

/** Avatar do agente no cabeçalho do app, antes do título (AgentAvatar do web): gradiente, brilho e o ponto de status. */
export function AgentAvatar({ isLive }: { isLive: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.avatar} aria-hidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={gradients.fab} start={diagonalDown.start} end={diagonalDown.end} style={[StyleSheet.absoluteFill, styles.avatarFill]} />
      <View>
        <Sparkles size={20} color={colors.white} />
      </View>
      <View style={[styles.dot, !isLive && styles.dotOff]} />
    </View>
  );
}

/** Botão do cabeçalho que abre "O que o agente considera" (no lugar do sino). */
export function ContextButton({ isOpen, onOpen }: { isOpen: boolean; onOpen: () => void }) {
  return <IconButton icon={Brain} variant="header" accessibilityLabel="O que o agente considera" expanded={isOpen} onPress={onOpen} />;
}

const RING = 22;
const RING_RADIUS = 8;
/** Mesmo corte do web (Agente.css): até 420 px as metas ficam em uma coluna. */
const STACK_MAX_WIDTH = 420;
/** Até 380 px a unidade desce para 12 px (o @media 380px do web). */
const NARROW_MAX_WIDTH = 380;
const TINY_BELOW_WIDTH = 360;

/** Mini anel de 22 px; o preenchimento para na meta e nunca muda de cor. */
function MiniRing({
  value,
  max,
  color,
}: {
  value: number;
  max: number | null;
  color: string;
}) {
  const colors = useThemeColors();
  const ratio = max ? Math.min(1, Math.max(0, value / max)) : 0;
  const d = circlePath(RING / 2, RING_RADIUS);
  return (
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
      <Path d={d} fill="none" strokeWidth={3} stroke={colors.surface2} />
      {ratio > 0 ? (
        <Path
          d={d}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={arcDash(RING_RADIUS, ratio * 100)}
        />
      ) : null}
    </Svg>
  );
}

type DayTotals = {
  calories: number;
  water: number;
  protein: number;
  meals: number;
};
type DayGoals = {
  calories: number | null;
  water: number | null;
  protein: number | null;
};
type ContextItem = {
  key: string;
  color: string;
  label: string;
  value: number;
  max: number | null;
  text: string;
  /** Número em destaque ("1.210", "1,75", "82 g") e a unidade menor ("kcal", "L", "prot."). */
  amount: string;
  unit: string;
  detail: string;
};

function contextItems(
  totals: DayTotals,
  goals: DayGoals,
  hideCalories: boolean,
  mealsPerDay: number,
  scheme: ColorScheme,
  textColor: string,
): ContextItem[] {
  const domainTone = themeDomainTone(scheme);
  const macroColor = themeMacroColor(scheme);
  const energy = hideCalories
    ? {
        label: "Refeições",
        value: totals.meals,
        max: mealsPerDay,
        text: plural(totals.meals, "refeição", "refeições"),
        amount: fmtNumber(totals.meals),
        unit: plural(totals.meals, "refeição", "refeições").replace(/^\S+\s/, ""),
        detail: `de ${fmtNumber(mealsPerDay)} no dia`,
      }
    : {
        label: "Energia",
        value: totals.calories,
        max: goals.calories,
        text: `${fmtNumber(totals.calories)} kcal`,
        amount: fmtNumber(totals.calories),
        unit: "kcal",
        detail: goals.calories
          ? `de ${fmtNumber(goals.calories)} kcal`
          : "sem meta",
      };
  return [
    // O anel da energia fica na cor do texto (conceito 05); água e proteína nas cores delas.
    { key: "energia", color: textColor, ...energy },
    {
      key: "agua",
      color: domainTone.water.fg,
      label: "Água",
      value: totals.water,
      max: goals.water,
      text: fmtLiters(totals.water),
      amount: fmtNumber(totals.water / 1000, 2),
      unit: "L",
      detail: goals.water ? `de ${fmtLiters(goals.water)}` : "sem meta",
    },
    {
      key: "proteina",
      color: macroColor.protein,
      label: "Proteína",
      value: totals.protein,
      max: goals.protein,
      text: `${fmtNumber(totals.protein)} g prot.`,
      amount: `${fmtNumber(totals.protein)} g`,
      unit: "prot.",
      detail: goals.protein ? `de ${fmtNumber(goals.protein)} g` : "sem meta",
    },
  ];
}

/** Pílula do contexto de hoje com 3 mini anéis; abre o detalhe com as metas. Nunca fica vermelha. */
export function ContextPill({
  totals,
  goals,
  hideCalories,
  mealsPerDay,
}: {
  totals: DayTotals;
  goals: DayGoals;
  hideCalories: boolean;
  mealsPerDay: number;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const [isOpen, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  // Em telas estreitas cada meta vira uma linha (rótulo, valor, detalhe) e o valor não é cortado.
  const isStacked = width <= STACK_MAX_WIDTH;
  const items = contextItems(totals, goals, hideCalories, mealsPerDay, scheme, colors.text);
  const isNarrow = width <= NARROW_MAX_WIDTH;
  // Abaixo de 360 px os três valores só cabem com 14 px, menos respiro e sem a seta (a pílula inteira continua tocável).
  const isTiny = width < TINY_BELOW_WIDTH;
  const Chevron = isOpen ? ChevronUp : ChevronDown;
  return (
    <View style={styles.pill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Contexto de hoje: ${items.map((i) => i.text).join(", ")}`}
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setOpen(!isOpen)}
        style={({ pressed }) => [styles.summary, isTiny && styles.summaryTiny, pressed && styles.pressed]}
      >
        {items.map((item) => (
          <View key={item.key} style={[styles.ringItem, isTiny && styles.ringItemTiny]}>
            <MiniRing value={item.value} max={item.max} color={item.color} />
            <AppText heading size={isTiny ? fontSize.base : fontSize.md} weight={800} tracking={-0.01} numberOfLines={1} style={[styles.shrink, styles.tabular]}>
              {item.amount}
              <AppText size={isNarrow ? fontSize.xs : fontSize.sm} weight={600} color={colors.muted}>
                {` ${item.unit}`}
              </AppText>
            </AppText>
          </View>
        ))}
        <View style={[styles.chevron, isTiny && styles.hidden]}>
          <Chevron size={18} color={colors.muted} />
        </View>
      </Pressable>
      {isOpen ? (
        <View style={[styles.grid, isStacked && styles.gridStacked]}>
          {items.map((item) => (
            <View
              key={item.key}
              style={[styles.cell, isStacked ? styles.cellRow : styles.cellColumn]}
              accessible
            >
              <AppText
                size={fontSize["2xs"]}
                weight={700}
                upper
                tracking={0.06}
                color={colors.muted}
                align={isStacked ? "left" : "center"}
                style={isStacked && styles.rowLabel}
              >
                {item.label}
              </AppText>
              <AppText
                heading
                size={fontSize.base}
                weight={700}
                align="center"
                numberOfLines={1}
              >
                {item.text}
              </AppText>
              <AppText
                size={fontSize["2xs"]}
                color={colors.muted}
                align="center"
                numberOfLines={1}
                style={isStacked && styles.shrink}
              >
                {item.detail}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  /** Avatar de 44 px, redondo, com o brilho azul da barra e o ponto verde de 10 px (anel da superfície). */
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.fab,
  },
  avatarFill: { borderRadius: 22 },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.green500,
  },
  dotOff: { backgroundColor: colors.faint },
  tabular: { fontVariant: ["tabular-nums"] },
  pill: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    boxShadow: shadows.card,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 44,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 12,
  },
  pressed: { opacity: 0.8 },
  summaryTiny: { gap: 8, paddingLeft: 10, paddingRight: 10 },
  ringItemTiny: { gap: 4 },
  hidden: { display: "none" },
  ringItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  shrink: { flexShrink: 1 },
  chevron: { marginLeft: "auto" },
  grid: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  gridStacked: { flexDirection: "column" },
  cell: {
    minWidth: 0,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.surface3,
  },
  cellColumn: { flex: 1, gap: 2 },
  cellRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  rowLabel: { flex: 1 },
}));
