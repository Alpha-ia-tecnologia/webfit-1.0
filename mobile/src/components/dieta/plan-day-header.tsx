import { LinearGradient } from "expo-linear-gradient";
import { Ban, ChefHat, Info, Leaf, Sparkles, Stethoscope, Target, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { donutArcs } from "@shared/lib/charts";
import { macroShare } from "@shared/lib/diary-day";
import type { DietChip } from "@shared/lib/diet";
import { fmtNumber } from "@shared/lib/format";
import { circlePath } from "@/components/hoje/ring-path";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, IconButton } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { diagonal, fontSize, radius, shadows, themeDomainTone, themeMacroColor } from "@/theme/tokens";

const CHIP_ICON: Record<DietChip["kind"], LucideIcon> = {
  goal: Target,
  allergy: Ban,
  pattern: Leaf,
  time: ChefHat,
  professional: Stethoscope,
};
/** "30 min para cozinhar" → "30 min" visível; o resto só para leitores de tela. */
const TIME_TAIL = " para cozinhar";

/** Metas do dia (dailyTargets): kcal e macros em gramas. */
export interface DayGoal {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

const DONUT = 66;
const DONUT_RADIUS = 28;
const DONUT_WIDTH = 10;
const DONUT_GAP = 3;
/** Folga do traço depois de cada fatia: maior que o círculo, para o padrão não se repetir. */
const DASH_REST = 1000;
/** Traços da linha tracejada antes de "2 de 5 refeições hoje" (4 px de traço, 3 de folga; a sobra fica oculta). */
const DASHES = 60;
const MACROS = [
  { key: "protein", letter: "P", name: "Proteínas" },
  { key: "carbs", letter: "C", name: "Carboidratos" },
  { key: "fat", letter: "G", name: "Gorduras" },
] as const;

/** Rosca das metas: fatias P/C/G nas cores fixas e a parte da proteína no centro (sem kcal). */
function ProteinDonut({ share }: { share: { protein: number; carbs: number; fat: number } }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColors = themeMacroColor(scheme);
  const arcs = donutArcs(DONUT_RADIUS, MACROS.map((m) => share[m.key]), DONUT_GAP);
  const d = circlePath(DONUT / 2, DONUT_RADIUS);
  return (
    <View style={styles.donut} accessible accessibilityRole="image" accessibilityLabel={`Proteínas: ${share.protein}% da meta do dia`}>
      <Svg width={DONUT} height={DONUT} viewBox={`0 0 ${DONUT} ${DONUT}`}>
        {MACROS.map((m, i) =>
          arcs[i]!.length > 0 ? (
            <Path
              key={m.key}
              d={d}
              fill="none"
              stroke={macroColors[m.key]}
              strokeWidth={DONUT_WIDTH}
              strokeLinecap="butt"
              strokeDasharray={`${arcs[i]!.length} ${DASH_REST}`}
              strokeDashoffset={arcs[i]!.offset}
            />
          ) : null,
        )}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <AppText heading size={fontSize.lg} weight={800} lineHeight={20} color={colors.green700} style={styles.tabular}>
          {`${share.protein}%`}
        </AppText>
        <AppText size={fontSize["2xs"]} weight={700} upper tracking={0.04} lineHeight={13} color={colors.muted}>
          Prot.
        </AppText>
      </View>
    </View>
  );
}

/** Linha tracejada de 1 px (no Android a borda de um lado só não fica tracejada). */
function DashedRule() {
  const styles = useStyles();
  return (
    <View style={styles.rule} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: DASHES }, (_, i) => (
        <View key={i} style={styles.dash} />
      ))}
    </View>
  );
}

type Props = {
  hasPlan: boolean;
  /** "hoje", "ontem", "há 3 dias" (data do plano). */
  updatedAt: string | null;
  /** Metas do dia; null no perfil sensível (sem números nem rosca). */
  goal: DayGoal | null;
  hideCalories: boolean;
  chips: readonly DietChip[];
  /** Linha "2 de 5 refeições hoje" com os horários (só com plano estruturado de hoje). */
  progress: ReactNode;
  /** Conteúdo do (i) "Sobre esta dieta": resumo, nota dos horários e o aviso educativo. */
  about: ReactNode;
  /** Avisos (consentimento, agente) e, sem plano, os botões de gerar. */
  children?: ReactNode;
};

/**
 * Cabeçalho do dia da dieta (PlanDayHeader do web, conceito 04): selo do agente com a data, a meta do dia em
 * destaque com os macros e a rosca, os chips de personalização e a linha "2 de 5 refeições hoje". Números só das
 * metas (dailyTargets) e do diário; nada com calorias ocultas nem no perfil sensível.
 */
export function PlanDayHeader({ hasPlan, updatedAt, goal, hideCalories, chips, progress, about, children }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tones = themeDomainTone(scheme);
  const macroColors = themeMacroColor(scheme);
  const [isInfoOpen, setInfoOpen] = useState(false);
  const grams =
    goal && goal.protein !== null && goal.carbs !== null && goal.fat !== null
      ? { protein: goal.protein, carbs: goal.carbs, fat: goal.fat }
      : null;
  const share = grams ? macroShare(grams) : null;
  const kcal = goal && !hideCalories ? goal.calories : null;
  const hasGoal = kcal !== null || grams !== null;
  return (
    <View style={styles.card}>
      <LinearGradient colors={[colors.mint50, colors.surface]} start={diagonal.end} end={diagonal.start} style={[StyleSheet.absoluteFill, styles.glow]} />
      <View style={styles.top}>
        {hasPlan ? (
          <>
            <View style={styles.badge}>
              <Sparkles size={14} color={colors.green700} />
              <AppText size={fontSize.xs} weight={700} color={colors.green700} numberOfLines={1}>
                Feita pelo seu agente
              </AppText>
            </View>
            {updatedAt ? (
              <AppText size={fontSize.sm} color={colors.muted} numberOfLines={1} style={styles.updated}>
                {`· atualizada ${updatedAt}`}
              </AppText>
            ) : null}
          </>
        ) : null}
        <View style={styles.info}>
          <IconButton icon={Info} variant="soft" accessibilityLabel="Sobre esta dieta" expanded={isInfoOpen} onPress={() => setInfoOpen(!isInfoOpen)} />
        </View>
      </View>
      <AppText heading size={fontSize["2xl"]} weight={800} lineHeight={30} accessibilityRole="header" style={hasPlan ? srOnly : undefined}>
        {hasPlan ? "Seu plano de refeições" : "Um plano que considera você"}
      </AppText>
      {hasPlan ? null : (
        <AppText size={fontSize.sm} color={colors.text2} style={styles.lede}>
          Refeições, porções e trocas a partir da sua anamnese.
        </AppText>
      )}
      {isInfoOpen ? <View style={styles.about}>{about}</View> : null}
      {hasPlan && hasGoal ? (
        <View style={styles.goal}>
          <View style={styles.goalText}>
            {kcal !== null ? (
              <View style={styles.kcal}>
                <AppText heading size={fontSize["5xl"]} weight={800} tracking={-0.03} lineHeight={40} style={styles.tabular}>
                  {fmtNumber(kcal)}
                </AppText>
                <AppText size={fontSize.md} weight={700} color={colors.muted}>
                  kcal/dia
                </AppText>
              </View>
            ) : (
              <AppText heading size={fontSize.xl} weight={800}>
                Sua meta do dia
              </AppText>
            )}
            {grams ? (
              <View role="list" aria-label="Macronutrientes do dia" style={styles.macros}>
                {MACROS.map((m) => (
                  <View key={m.key} role="listitem" accessible accessibilityLabel={`${m.name}: ${fmtNumber(grams[m.key])} g`} style={styles.macro}>
                    <View style={[styles.dot, { backgroundColor: macroColors[m.key] }]} />
                    <AppText size={fontSize.sm} weight={700} color={colors.text2} style={styles.tabular}>
                      {`${m.letter} ${fmtNumber(grams[m.key])} g`}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          {share ? <ProteinDonut share={share} /> : null}
        </View>
      ) : null}
      <View role="list" aria-label="Personalização da dieta" style={styles.chips}>
        {chips.map(({ kind, label }) => {
          const Icon = CHIP_ICON[kind];
          const isTime = kind === "time" && label.endsWith(TIME_TAIL);
          return (
            <View key={kind} role="listitem" style={styles.chip}>
              <Icon size={14} color={kind === "allergy" ? tones.attention.fg : tones.food.fg} />
              <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                {isTime ? label.slice(0, -TIME_TAIL.length) : label}
                {isTime ? <AppText style={srOnly}>{TIME_TAIL}</AppText> : null}
              </AppText>
            </View>
          );
        })}
      </View>
      {progress ? (
        <View style={styles.progress}>
          <DashedRule />
          {progress}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
    overflow: "hidden",
  },
  glow: { borderRadius: radius.lg },
  top: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
  },
  updated: { flexShrink: 1, minWidth: 0 },
  info: { marginLeft: "auto" },
  lede: { marginTop: -8 },
  about: { gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  goal: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  goalText: { flex: 1, minWidth: 0, gap: 8 },
  kcal: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
  macros: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  macro: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  donut: { width: DONUT, height: DONUT, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  donutCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  progress: { gap: 14 },
  rule: { flexDirection: "row", flexWrap: "wrap", height: 1, columnGap: 3, overflow: "hidden" },
  dash: { width: 4, height: 1, backgroundColor: colors.border },
}));
