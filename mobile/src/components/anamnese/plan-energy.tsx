import { LinearGradient as FillGradient } from "expo-linear-gradient";
import { useId, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { ringSegments } from "@shared/lib/charts";
import { fmtNumber } from "@shared/lib/format";
import { HABITS_TEXT, planCascade, planRingAria, PLATE_ARIA, PLATE_TEXT, strategyLabel, type CascadeRow, type PlanVariant } from "@shared/lib/plan-reveal";
import { macroShares, type MacroShare } from "@shared/lib/space";
import type { Goals, Profile } from "@shared/types";
import { circlePath } from "@/components/hoje/ring-path";
import { AppText, Disclosure, Notice, Pill } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, shadows, themeMacroColor } from "@/theme/tokens";

/** Até esta largura o anel fica sobre a coluna de gasto × meta, e água e dia ficam um embaixo do outro. */
export const PLAN_NARROW_WIDTH = 360;
const RING_SIZE = 112;
const RING_RADIUS = 50;
const RING_STROKE = 12;
/** Prato de referência (.plan-plate do web: o MiniPlate de 48 desenhado em 72 px, sem legenda). */
const PLATE_VIEW = 48;
const PLATE_SIZE = 72;
const PLATE_RIM = 22;
const PLATE_RADIUS = 15;
const PLATE_STROKE = 7;
const PLATE_GAP = 4;
/** Folga do traço depois de cada arco: maior que o círculo, para o padrão não se repetir. */
const DASH_REST = 1000;
const COLUMN_GAP = 8;
/** Largura mínima de uma coluna para "175 g · 45%" (20 + 12 px) caber numa linha. */
const MIN_INLINE_COLUMN = 86;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** "1.958 kcal" → 1958 (a cascata guarda o texto formatado). */
const kcalOf = (value: string) => Number(value.replace(/\D/g, "")) || 0;

/**
 * Corpo do plano (PlanBody do web): completo (anel da meta, gasto × meta, macros e "Como calculamos"),
 * prato (sem calorias: prato de referência e macros em gramas) ou de hábitos (sem números).
 */
export function PlanBody({ profile, goals, variant }: { profile: Profile; goals: Goals; variant: PlanVariant }) {
  const styles = useStyles();
  const colors = useThemeColors();
  if (variant === "habitos")
    return (
      <Notice>
        <View style={styles.habits}>
          <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
            {HABITS_TEXT}
          </AppText>
          {goals.reason ? (
            <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
              {goals.reason}
            </AppText>
          ) : null}
        </View>
      </Notice>
    );
  if (variant === "prato") return <PlateCard goals={goals} />;
  return <EnergyCard profile={profile} goals={goals} />;
}

function EnergyCard({ profile, goals }: { profile: Profile; goals: Goals }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isNarrow = useWindowDimensions().width <= PLAN_NARROW_WIDTH;
  const cascade = planCascade(profile, goals);
  const visible = cascade?.filter((row) => row.key !== "basal") ?? [];
  const basal = cascade?.find((row) => row.key === "basal");
  const scale = Math.max(1, ...visible.map((row) => kcalOf(row.value)));
  const strategy = strategyLabel(goals);
  const shares = macroShares(goals);
  return (
    <View style={styles.card}>
      <View style={[styles.top, isNarrow && styles.topNarrow]}>
        <EnergyRing calories={goals.calories ?? 0} />
        <View style={[styles.side, isNarrow && styles.sideNarrow]}>
          {strategy ? (
            <Pill tone="food" size="sm">
              {strategy}
            </Pill>
          ) : null}
          {visible.length > 0 ? (
            <View testID="plan-cascade" role="list" aria-label="Como chegamos à meta" style={styles.cascade}>
              {visible.map((row) => (
                <EnergyRow key={row.key} row={row} scale={scale} />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {shares ? (
        <View style={styles.macroBlock}>
          <MacroBar shares={shares} />
          <View testID="plan-macros" role="group" aria-label="Macronutrientes por dia">
            <PlanMacroColumns shares={shares} showPercent />
          </View>
        </View>
      ) : null}
      {basal || goals.note ? (
        <Disclosure title="Como calculamos">
          {cascade?.map((row) => (
            <AppText key={row.key} size={fontSize.sm} lineHeight={21} color={colors.text2}>
              <AppText size={fontSize.sm} weight={700} lineHeight={21} color={colors.text2}>
                {row.label}
              </AppText>
              {`: ${row.value}, ${row.detail}.`}
            </AppText>
          ))}
          <AppText size={fontSize.sm} lineHeight={21} color={colors.text2}>
            {goals.source}
          </AppText>
          {goals.note ? (
            <AppText size={fontSize.sm} lineHeight={21} color={colors.text2}>
              {goals.note}
            </AppText>
          ) : null}
        </Disclosure>
      ) : null}
    </View>
  );
}

/** Anel de 112 px sempre cheio (é a meta), em degradê verde → azul, com a meta no centro. */
function EnergyRing({ calories }: { calories: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const gradientId = `plan-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const center = RING_SIZE / 2;
  return (
    <View testID="plan-ring" accessible accessibilityRole="image" accessibilityLabel={planRingAria(calories)} style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Defs>
          {/* O web gira o círculo (e o degradê) em −90°: verde embaixo à direita, azul em cima à esquerda. */}
          <LinearGradient id={gradientId} x1="1" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={colors.green500} />
            <Stop offset="1" stopColor={colors.sky500} />
          </LinearGradient>
        </Defs>
        <Circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={`url(#${gradientId})`} strokeWidth={RING_STROKE} />
      </Svg>
      <View {...HIDDEN} style={styles.ringCenter}>
        <AppText heading size={fontSize["3xl"]} weight={800} tracking={-0.03} lineHeight={fontSize["3xl"]} style={styles.tabular}>
          {fmtNumber(calories)}
        </AppText>
        <AppText size={fontSize.xs} weight={600} lineHeight={19} color={colors.muted} style={styles.ringCaption}>
          kcal por dia
        </AppText>
      </View>
    </View>
  );
}

/** "Gasto estimado" (barra cinza) e "Sua meta" (barra em degradê), na escala do maior dos dois. */
function EnergyRow({ row, scale }: { row: CascadeRow; scale: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const kcal = kcalOf(row.value);
  const width = `${Math.min(100, Math.max(0, (kcal / scale) * 100))}%` as const;
  return (
    <View role="listitem" accessible accessibilityLabel={`${row.label}: ${fmtNumber(kcal)} kcal`} style={styles.row}>
      <View style={styles.rowHead}>
        <AppText size={fontSize.xs} lineHeight={19} color={colors.text2} numberOfLines={1} style={styles.shrink}>
          {row.label}
        </AppText>
        <AppText size={fontSize.sm} weight={800} lineHeight={21} style={styles.tabular}>
          {fmtNumber(kcal)}
        </AppText>
      </View>
      <View style={styles.track}>
        {row.key === "meta" ? (
          <FillGradient colors={gradients.brand} start={horizontal.start} end={horizontal.end} style={[styles.fill, { width }]} />
        ) : (
          <View style={[styles.fill, styles.fillGasto, { width }]} />
        )}
      </View>
    </View>
  );
}

/** Barra dos três macros com folgas de 4 px (decorativa: as colunas dizem os valores). */
function MacroBar({ shares }: { shares: MacroShare[] }) {
  const styles = useStyles();
  const macroColor = themeMacroColor(useTheme().scheme);
  return (
    <View {...HIDDEN} style={styles.macroBar}>
      {shares.map((share) => (
        <View key={share.key} style={[styles.macroSegment, { flexGrow: share.percent, backgroundColor: macroColor[share.key] }]} />
      ))}
    </View>
  );
}

/** "● Proteína / 115 g · 29%" em três colunas (MacroColumns do web nos tamanhos do plano). */
function PlanMacroColumns({ shares, showPercent }: { shares: MacroShare[]; showPercent: boolean }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const [width, setWidth] = useState(0);
  // Em telas de 320 px a coluna não comporta "175 g · 45%": a porcentagem desce para a linha de baixo.
  const column = (width - (shares.length - 1) * COLUMN_GAP) / shares.length;
  const isStacked = showPercent && width > 0 && column < MIN_INLINE_COLUMN;
  return (
    <View role="list" style={styles.columns} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {shares.map((share) => {
        const value = fmtNumber(share.grams);
        const percent = showPercent ? ` · ${share.percent}%` : "";
        return (
          <View key={share.key} role="listitem" accessible accessibilityLabel={`${share.label}: ${value} g${percent}`} style={styles.column}>
            <View style={styles.columnLabel}>
              <View style={[styles.dot, { backgroundColor: macroColor[share.key] }]} />
              <AppText size={fontSize.xs} weight={600} lineHeight={19} color={colors.text2} numberOfLines={1} style={styles.shrink}>
                {share.label}
              </AppText>
            </View>
            <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} lineHeight={32} numberOfLines={1} style={styles.tabular}>
              {value}
              <AppText size={fontSize.xs} weight={500} tracking={0} color={colors.muted}>
                {isStacked ? " g" : ` g${percent}`}
              </AppText>
            </AppText>
            {isStacked ? (
              <AppText size={fontSize.xs} weight={500} lineHeight={16} color={colors.muted} style={styles.stackedPercent}>
                {`${share.percent}%`}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "Ocultar números de calorias": prato de referência e macros só em gramas, sem kcal nem %. */
function PlateCard({ goals }: { goals: Goals }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const shares = macroShares(goals);
  return (
    <View style={[styles.card, styles.plateCard]}>
      <View testID="plan-plate" accessible accessibilityRole="image" accessibilityLabel={PLATE_ARIA} style={styles.plate}>
        {/* A View segura os 72 px: um <svg> solto encolhe ao lado do texto no export web. */}
        <View style={styles.plateArt}>
          <PlatePie />
        </View>
        <AppText size={fontSize.sm} lineHeight={20} color={colors.text2} style={styles.shrink}>
          {PLATE_TEXT}
        </AppText>
      </View>
      {shares ? (
        <View testID="plan-macros" role="group" aria-label="Macronutrientes por dia">
          <PlanMacroColumns shares={shares} showPercent={false} />
        </View>
      ) : null}
    </View>
  );
}

/** Metade vegetais, um quarto proteínas, um quarto cereais: um arco por grupo, sem números. */
function PlatePie() {
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const arcs = ringSegments(PLATE_RADIUS, 3, PLATE_GAP);
  const d = circlePath(PLATE_VIEW / 2, PLATE_RADIUS);
  // Vegetais em verde-escuro: o verde 500 é a cor da proteína.
  const strokes = [colors.plateVeg, macroColor.protein, macroColor.carbs];
  return (
    <Svg width={PLATE_SIZE} height={PLATE_SIZE} viewBox={`0 0 ${PLATE_VIEW} ${PLATE_VIEW}`}>
      <Circle cx={PLATE_VIEW / 2} cy={PLATE_VIEW / 2} r={PLATE_RIM} fill={colors.surface2} stroke={colors.border} strokeWidth={1.5} />
      {strokes.map((stroke, i) => (
        <Path
          key={stroke + i}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={PLATE_STROKE}
          strokeDasharray={`${arcs[i]!.length} ${DASH_REST}`}
          strokeDashoffset={arcs[i]!.offset}
        />
      ))}
    </Svg>
  );
}

const useStyles = makeStyles((colors) => ({
  habits: { gap: 8 },
  // .plan-energy: superfície, raio 24, sombra de flutuação
  card: {
    gap: 16,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.float,
  },
  plateCard: { gap: 14 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: colors.border,
  },
  topNarrow: { flexDirection: "column" },
  side: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 12 },
  sideNarrow: { flex: 0, alignSelf: "stretch" },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringCaption: { marginTop: 4 },
  cascade: { alignSelf: "stretch", gap: 10 },
  row: { gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surface2 },
  fill: { height: "100%", borderRadius: radius.pill },
  fillGasto: { backgroundColor: colors.slate300 },
  macroBlock: { gap: 12 },
  macroBar: { flexDirection: "row", gap: 4, height: 10 },
  macroSegment: { flexBasis: 0, borderRadius: radius.pill },
  columns: { flexDirection: "row", gap: COLUMN_GAP },
  column: { flex: 1, minWidth: 0, gap: 4 },
  stackedPercent: { marginTop: -6 },
  columnLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  plate: { flexDirection: "row", alignItems: "center", gap: 14 },
  plateArt: { width: PLATE_SIZE, height: PLATE_SIZE, flexShrink: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
