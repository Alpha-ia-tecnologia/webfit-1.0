import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { BadgeCheck, Check, Pencil, Target } from "lucide-react-native";
import { useId } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { localDate } from "@shared/lib/domain";
import { anamneseCompletion, goalChip } from "@shared/lib/profile-summary";
import { heroFacts } from "@shared/lib/space";
import { AppText } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";

/** Anel de 82 pt: arco em degradê = quanto da anamnese está respondido (neutro, sem festa). */
const RING = 82;
const RING_STROKE = 4;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const DISC = 64;
const BADGE = 28;
/** Lápis de 36 pt à vista (conceito 11), com toque de 44. */
const EDIT = 36;
const EDIT_PAD = 4;
/** Chips de 30 pt à vista, com toque de 44. */
const CHIP_TOUCH = 7;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

const initialOf = (name: string) => Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?";

/** Fundo navy com o brilho azul em cima à direita e o verde embaixo à esquerda (os radial-gradient do web). */
function Glow() {
  const colors = useThemeColors();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" {...HIDDEN}>
      <Defs>
        <RadialGradient id={`${id}-sky`} cx="100" cy="0" rx="90" ry="80" fx="100" fy="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.sky600} stopOpacity={0.34} />
          <Stop offset="0.6" stopColor={colors.sky600} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-green`} cx="0" cy="100" rx="70" ry="80" fx="0" fy="100" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.green500} stopOpacity={0.26} />
          <Stop offset="0.62" stopColor={colors.green500} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100" height="100" fill={colors.navy} />
      <Rect width="100" height="100" fill={`url(#${id}-sky)`} />
      <Rect width="100" height="100" fill={`url(#${id}-green)`} />
    </Svg>
  );
}

/**
 * Topo do Meu espaço (conceito 11; ProfileHero do web): avatar com o anel da anamnese, nome, "34 anos · 165 cm",
 * lápis para revisar a anamnese e os chips "Anamnese 100%" (abre as seções no mosaico) e o objetivo (nunca em
 * perfil calmo). "Exportar meus dados" fica no cabeçalho.
 */
export function ProfileHero({ onOpenSections }: { onOpenSections: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const router = useRouter();
  const gradientId = `ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const p = state.profile!;
  const today = localDate();
  const done = anamneseCompletion(p, today);
  const goal = goalChip(p, today);
  const dash = (RING_C * done.percent) / 100;
  return (
    <View style={styles.hero} testID="profile-hero">
      <Glow />
      <View style={styles.top}>
        <View style={styles.avatar} {...HIDDEN}>
          <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.teal500} />
                <Stop offset="1" stopColor={colors.sky500} />
              </SvgGradient>
            </Defs>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke={colors.onFillOverlaySoft} strokeWidth={RING_STROKE} />
            {done.percent > 0 ? (
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RING_R}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${RING_C}`}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            ) : null}
          </Svg>
          <LinearGradient colors={[colors.teal600, colors.sky600]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.disc}>
            <AppText heading size={fontSize["5xl"]} weight={800} color={colors.white} lineHeight={fontSize["5xl"] + 4}>
              {initialOf(p.name)}
            </AppText>
          </LinearGradient>
          {done.isComplete ? (
            <View style={styles.badge}>
              <Check size={16} strokeWidth={3} color={colors.white} />
            </View>
          ) : null}
        </View>
        <View style={styles.identity}>
          <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02} color={colors.white} numberOfLines={1} accessibilityRole="header">
            {p.name}
          </AppText>
          <AppText size={fontSize.sm} color={colors.onFillSlate} style={styles.tabular}>
            {heroFacts(p, today)}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Revisar anamnese"
        onPress={() => router.push("/anamnese")}
        style={({ pressed }) => [styles.editTouch, pressed && styles.pressed]}
      >
        <View style={styles.edit}>
          <Pencil size={18} color={colors.white} />
        </View>
      </Pressable>
      <View style={styles.chips}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Anamnese ${done.percent}%: ver as seções`}
          onPress={onOpenSections}
          style={({ pressed }) => [styles.chipTouch, pressed && styles.pressed]}
        >
          <View style={styles.chip}>
            {/* Verde translúcido sobre o navy sem literal rgba: camadas com opacidade. */}
            <View style={[StyleSheet.absoluteFill, styles.anamneseFill]} {...HIDDEN} />
            <View style={[StyleSheet.absoluteFill, styles.anamneseRing]} {...HIDDEN} />
            <BadgeCheck size={18} color={colors.onFillMint} />
            <AppText size={fontSize.sm} weight={700} color={colors.onFillMint}>
              {`Anamnese ${done.percent}%`}
            </AppText>
          </View>
        </Pressable>
        {goal ? (
          <View style={[styles.chip, styles.goal]}>
            <Target size={18} color={colors.white} />
            <AppText size={fontSize.sm} weight={700} color={colors.white}>
              {goal}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: {
    gap: 16,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.navySoft,
    overflow: "hidden",
    boxShadow: shadows.float,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 16, paddingRight: 34 },
  avatar: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentFill,
    borderWidth: 3,
    borderColor: colors.navy,
  },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  editTouch: { position: "absolute", top: 16 - EDIT_PAD, right: 16 - EDIT_PAD, padding: EDIT_PAD },
  edit: {
    width: EDIT,
    height: EDIT,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.onFillOverlayFaint,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipTouch: { minHeight: 44, marginVertical: -CHIP_TOUCH, justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 30,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  anamneseFill: { backgroundColor: colors.green500, opacity: 0.16 },
  anamneseRing: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green500, opacity: 0.45 },
  goal: { backgroundColor: colors.onFillOverlayFaint, borderWidth: 1, borderColor: colors.onFillBorder },
  pressed: { opacity: 0.8 },
}));
