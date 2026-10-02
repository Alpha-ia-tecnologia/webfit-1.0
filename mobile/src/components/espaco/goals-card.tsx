import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Check, Clock, Info, Pencil, Sparkles, Zap, type LucideIcon } from "lucide-react-native";
import { useId, useState } from "react";
import { Linking, Pressable, View, type ColorValue } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { activityFactors, ageAt, goalsFor } from "@shared/lib/domain";
import { fmtKg, fmtLiters, fmtNumber } from "@shared/lib/format";
import { canAdjustGoals, goalOrigin, goalRuler, macroShares, type GoalOrigin } from "@shared/lib/space";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Notice } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, horizontal, radius, themeDomainTone, themeMacroColor, type MacroColors } from "@/theme/tokens";
import { CareChips } from "./care-chips";
import { GoalsSheet } from "./goals-sheet";

const EQUATION_URL = "https://pubmed.ncbi.nlm.nih.gov/2305711/";
/** Aparelho sem navegador (ou link recusado): aviso, nunca uma rejeição sem tratamento. */
const LINK_FAILED = "Não foi possível abrir o link neste aparelho.";
/** Largura mínima de cada meta: abaixo disso as duas empilham em vez de cortar o número (o 140 px do web). */
const TILE_MIN = 140;
/** "Editar": 36 pt à vista como no conceito, toque de 44. */
const EDIT_TOUCH = 4;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;
const ORIGIN_ICON: Record<GoalOrigin["key"], LucideIcon> = { manual: Check, auto: Sparkles, pending: Clock };

type MacroKey = keyof MacroColors;
type MacroRow = { key: MacroKey; label: string; grams: number | null; percent: number | null };

/** Anel de energia (conceito 11): círculo em degradê da marca com o raio no meio. */
function EnergyRing() {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const id = `energy-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={styles.energy} {...HIDDEN}>
      <Svg width={50} height={50} viewBox="0 0 50 50" style={styles.fill}>
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.green500} />
            <Stop offset="1" stopColor={colors.sky500} />
          </SvgGradient>
        </Defs>
        <Circle cx={25} cy={25} r={21.5} fill="none" stroke={`url(#${id})`} strokeWidth={5} />
      </Svg>
      <Zap size={20} color={themeDomainTone(scheme).food.fg} />
    </View>
  );
}

/** Gota d'água (conceito 11): degradê azul com um brilho. */
function WaterDrop() {
  const styles = useStyles();
  const colors = useThemeColors();
  const id = `drop-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={styles.drop} {...HIDDEN}>
      <Svg width={40} height={48} viewBox="0 0 40 48">
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {/* O tema do app não tem o sky-300 do web: o topo da gota usa o 400. */}
            <Stop offset="0" stopColor={colors.sky400} />
            <Stop offset="1" stopColor={colors.sky500} />
          </SvgGradient>
        </Defs>
        <Path d="M20 3C20 3 5 20.5 5 31a15 15 0 0 0 30 0C35 20.5 20 3 20 3Z" fill={`url(#${id})`} />
        <Path d="M12.5 33.5a8 8 0 0 0 5.5 6.5" fill="none" stroke={colors.white} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
      </Svg>
    </View>
  );
}

/** Uma meta: a arte, o número grande e a unidade. */
function GoalTile({ art, value, unit }: { art: React.ReactNode; value: string; unit: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${value} ${unit}`}>
      {art}
      <View style={styles.grow}>
        <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} lineHeight={22} style={styles.tabular} numberOfLines={1}>
          {value}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted}>
          {unit}
        </AppText>
      </View>
    </View>
  );
}

/**
 * "Minhas metas diárias" (conceito 11; GoalsCard do web): anel de energia, gota d'água, barra P/C/G e as gramas.
 * Com calorias ocultas mostra só água e gramas; perfis que pedem avaliação veem um aviso calmo. "Editar" abre os
 * passos das metas manuais; perfil sensível só revisa pela anamnese. "Como calculamos?" é um (i) que abre a régua
 * basal → meta → gasto.
 */
export function GoalsCard() {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domain = themeDomainTone(scheme);
  const macroColor = themeMacroColor(scheme);
  const { state, notify } = useApp();
  const router = useRouter();
  const [isAdjusting, setAdjusting] = useState(false);
  const [isHowOpen, setHowOpen] = useState(false);
  const p = state.profile!;
  const goals = goalsFor(p);
  const origin = goalOrigin(p, goals);
  const OriginIcon = ORIGIN_ICON[origin.key];
  const hide = p.hideCalories;
  const shares = macroShares(goals);
  const ruler = hide || goals.reason ? null : goalRuler(goals);
  const canAdjust = canAdjustGoals(p);
  const macros: MacroRow[] = shares ?? [
    { key: "protein", label: "Proteína", grams: goals.protein, percent: null },
    { key: "carbs", label: "Carbos", grams: goals.carbs, percent: null },
    { key: "fat", label: "Gorduras", grams: goals.fat, percent: null },
  ];
  return (
    <Card style={styles.card} testID="goals-card">
      <View style={styles.head}>
        <View style={styles.title}>
          <AppText heading size={fontSize.lg} weight={800} tracking={-0.02} accessibilityRole="header">
            Minhas metas diárias
          </AppText>
          <View style={styles.originRow}>
            <View style={styles.origin}>
              <OriginIcon size={16} color={origin.key === "manual" ? domain.food.fg : domain.neutral.fg} />
              <AppText size={fontSize.sm} weight={500} color={colors.muted} testID="goal-origin">
                {origin.label}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Como calculamos?"
              accessibilityState={{ expanded: isHowOpen }}
              {...webAttrs({ "aria-expanded": isHowOpen })}
              onPress={() => setHowOpen((open) => !open)}
              style={({ pressed }) => [styles.howButton, pressed && styles.pressed]}
            >
              <Info size={18} color={isHowOpen ? colors.sky700 : colors.muted} />
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar metas"
          {...(canAdjust ? webAttrs({ "aria-haspopup": "dialog" }) : {})}
          onPress={() => (canAdjust ? setAdjusting(true) : router.push("/anamnese"))}
          style={({ pressed }) => [styles.editTouch, pressed && styles.pressed]}
        >
          <View style={styles.edit}>
            <Pencil size={16} color={colors.text} />
            <AppText size={fontSize.sm} weight={800}>
              Editar
            </AppText>
          </View>
        </Pressable>
      </View>
      {goals.reason ? <Notice>{goals.reason}</Notice> : null}
      <View style={styles.tiles}>
        {!hide && <GoalTile art={<EnergyRing />} value={goals.calories === null ? "—" : fmtNumber(goals.calories)} unit="kcal por dia" />}
        <GoalTile art={<WaterDrop />} value={goals.water === null ? "—" : fmtLiters(goals.water)} unit="água por dia" />
      </View>
      {shares && !hide ? (
        <View style={styles.macroBar} {...HIDDEN}>
          {shares.map((share) => (
            <View key={share.key} style={[styles.macroSegment, { flexGrow: share.percent, backgroundColor: macroColor[share.key] }]} />
          ))}
        </View>
      ) : null}
      <View style={styles.macroList}>
        {macros.map((macro) => (
          <View
            key={macro.key}
            style={styles.macro}
            accessible
            accessibilityLabel={`${macro.label}: ${macro.grams === null ? "não definida" : `${macro.grams} gramas`}${!hide && macro.percent !== null ? `, ${macro.percent}% da energia` : ""}`}
          >
            <View style={styles.macroLabel}>
              <View style={[styles.dot, { backgroundColor: macroColor[macro.key] }]} />
              <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                {macro.label}
              </AppText>
            </View>
            <AppText style={styles.tabular} numberOfLines={1}>
              <AppText heading size={fontSize.lg} weight={800} tracking={-0.02}>
                {macro.grams === null ? "—" : String(macro.grams)}
              </AppText>
              <AppText size={fontSize.sm} weight={500} color={colors.muted}>
                {macro.grams === null ? "" : " g"}
                {!hide && macro.percent !== null ? ` · ${macro.percent}%` : ""}
              </AppText>
            </AppText>
          </View>
        ))}
      </View>
      <CareChips notes={goals.careNotes} />
      {isHowOpen ? (
        <View style={styles.how} testID="goals-how">
          {ruler && <GoalRuler basal={ruler.basal} target={ruler.target} expenditure={ruler.expenditure} />}
          <AppText size={fontSize.sm} color={colors.text2}>
            {goals.source}.
          </AppText>
          {ruler && (
            <>
              <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
                {/* Números do corpo ocultos (ESPACO-13): a equação sem peso nem altura. */}
                {p.hideBodyNumbers ? (
                  <>Mifflin–St Jeor com seu peso, altura, idade e sexo = {fmtNumber(ruler.basal)} kcal/dia.</>
                ) : (
                  <>
                    Mifflin–St Jeor: 10 × {fmtKg(p.weight)} + 6,25 × {p.height} cm − 5 × {ageAt(p.birthDate)} anos{" "}
                    {p.sex === "masculino" ? "+ 5" : "− 161"} = {fmtNumber(ruler.basal)} kcal/dia.
                  </>
                )}{" "}
                Gasto estimado: {fmtNumber(ruler.basal)} × {fmtNumber(activityFactors[p.activityLevel], 3)} ={" "}
                {fmtNumber(ruler.expenditure)} kcal/dia (o fator de atividade é uma aproximação).
              </AppText>
              {goals.note ? (
                <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
                  {goals.note}
                </AppText>
              ) : null}
            </>
          )}
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
            A meta de água é informada por você; {hide ? "" : "calorias e "}macronutrientes em branco seguem a estimativa da
            anamnese, e valores informados prevalecem.
          </AppText>
          <Button
            label="Referência da equação"
            variant="link"
            onPress={() => void Linking.openURL(EQUATION_URL).catch(() => notify(LINK_FAILED, "warning"))}
          />
        </View>
      ) : null}
      {isAdjusting && <GoalsSheet onClose={() => setAdjusting(false)} />}
    </Card>
  );
}

/** Largura reservada a cada marcador da régua (número e rótulo centralizados). */
const STOP_WIDTH = 64;

/** Régua basal → meta → gasto; o leitor de tela recebe a frase completa. */
function GoalRuler({ basal, target, expenditure }: { basal: number; target: number; expenditure: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const track: readonly [ColorValue, ColorValue] = [colors.surface2, colors.mint200];
  const min = Math.min(basal, target);
  const max = Math.max(expenditure, target);
  const position = (value: number) => (max === min ? 50 : ((value - min) / (max - min)) * 100);
  const stops = [
    { key: "basal", label: "Basal", value: basal },
    { key: "meta", label: "Meta", value: target },
    { key: "gasto", label: "Gasto", value: expenditure },
  ];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Basal ${fmtNumber(basal)} kcal, meta ${fmtNumber(target)} kcal, gasto estimado ${fmtNumber(expenditure)} kcal por dia.`}
      style={styles.ruler}
    >
      <LinearGradient colors={track} start={horizontal.start} end={horizontal.end} style={styles.rulerTrack} />
      {stops.map((stop) => (
        <View key={stop.key} style={[styles.rulerStop, { left: `${position(stop.value)}%` }]} {...HIDDEN}>
          <View style={[styles.rulerDot, stop.key === "meta" && { borderColor: colors.green600 }]} />
          <AppText size={fontSize.sm} weight={800} style={styles.tabular}>
            {fmtNumber(stop.value)}
          </AppText>
          <AppText size={fontSize["2xs"]} weight={600} color={colors.muted}>
            {stop.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  fill: { position: "absolute", top: 0, left: 0 },
  pressed: { opacity: 0.7 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flexShrink: 1, minWidth: 0 },
  originRow: { flexDirection: "row", alignItems: "center" },
  origin: { flexDirection: "row", alignItems: "center", gap: 6 },
  // (i) de 44 pt que não cresce a linha (o margin −4 −6 do web).
  howButton: { width: 44, height: 44, marginVertical: -8, marginLeft: -4, alignItems: "center", justifyContent: "center" },
  editTouch: { paddingVertical: EDIT_TOUCH, marginVertical: -EDIT_TOUCH },
  edit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 12,
    backgroundColor: colors.slate100,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: TILE_MIN,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface2,
  },
  energy: { width: 50, height: 50, alignItems: "center", justifyContent: "center" },
  drop: { width: 44, height: 50, alignItems: "center", justifyContent: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  macroBar: { flexDirection: "row", gap: 4, height: 10 },
  macroSegment: { flexBasis: 0, borderRadius: radius.pill },
  macroList: { flexDirection: "row", gap: 8 },
  macro: { flex: 1, minWidth: 0, gap: 4 },
  macroLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  how: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderStyle: "dashed", borderTopColor: colors.border },
  ruler: { height: 62, marginTop: 4, marginBottom: 4, marginHorizontal: 28 },
  rulerTrack: { position: "absolute", top: 10, left: 0, right: 0, height: 6, borderRadius: radius.pill },
  rulerStop: {
    position: "absolute",
    top: 0,
    width: STOP_WIDTH,
    marginLeft: -STOP_WIDTH / 2,
    alignItems: "center",
    paddingTop: 24,
  },
  rulerDot: {
    position: "absolute",
    top: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: colors.muted,
    backgroundColor: colors.surface,
  },
}));
