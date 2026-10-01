import { Check, Info } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ringSegments } from "@shared/lib/charts";
import { dayVariety, FOOD_GROUP_TOTAL, FOOD_GROUPS, VARIETY_COPY, type FoodGroup } from "@shared/lib/food-groups";
import { circlePath } from "@/components/hoje/ring-path";
import { ICONS } from "@/components/refeicao/food-icon";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, IconButton, IconTile, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";

const RING = 88;
const RING_SMALL = 72;
const SMALL_BELOW_WIDTH = 360;
/** Tela larga: anel ao lado da legenda e da explicação; abaixo, anel e explicação lado a lado e a legenda em 2 colunas (web). */
const SIDE_BY_SIDE_WIDTH = 600;
const RADIUS = 34;
const STROKE = 10;
const GAP = 4;
/** Folga do traço depois de cada arco: maior que o círculo, para o padrão não se repetir. */
const DASH_REST = 1000;
const VIEWBOX = 88;

/** Anel de 7 partes iguais: grupo presente na cor do tom; ausente, na trilha neutra (nunca vermelho). */
function VarietyRing({ present, speech, size }: { present: ReadonlySet<string>; speech: string; size: number }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tones = themeDomainTone(scheme);
  const arcs = ringSegments(RADIUS, FOOD_GROUP_TOTAL, GAP);
  const d = circlePath(VIEWBOX / 2, RADIUS);
  return (
    <View
      style={[styles.ring, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={speech}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        {FOOD_GROUPS.map((group, i) => (
          <Path
            key={group.key}
            d={d}
            fill="none"
            stroke={present.has(group.key) ? tones[group.tone].fg : colors.surface2}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={`${arcs[i]!.length} ${DASH_REST}`}
            strokeDashoffset={arcs[i]!.offset}
          />
        ))}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <AppText heading size={fontSize["2xl"]} weight={800} lineHeight={26} style={styles.tabular}>
          {String(present.size)}
        </AppText>
        <AppText size={fontSize.xs} weight={700} color={colors.muted} lineHeight={14}>
          {`de ${FOOD_GROUP_TOTAL}`}
        </AppText>
      </View>
    </View>
  );
}

function LegendItem({ group, isPresent, isHalf }: { group: FoodGroup; isPresent: boolean; isHalf: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const Icon = ICONS[group.icon];
  return (
    <View role="listitem" style={[styles.item, isHalf && styles.itemHalf]} testID={isPresent ? "quality-present" : "quality-absent"}>
      {isPresent ? (
        <IconTile tone={group.tone} icon={Icon} size="sm" />
      ) : (
        <View style={styles.absentTile} aria-hidden>
          <Icon size={14} color={colors.muted} />
        </View>
      )}
      <AppText
        size={fontSize.xs}
        weight={isPresent ? 700 : 600}
        color={isPresent ? colors.text : colors.muted}
        lineHeight={16}
        style={styles.itemText}
      >
        {group.short}
        {isPresent ? null : (
          <AppText size={fontSize.xs} style={srOnly}>
            {VARIETY_COPY.absent}
          </AppText>
        )}
      </AppText>
      {isPresent ? <Check size={14} color={colors.green700} aria-hidden /> : null}
    </View>
  );
}

/**
 * "Qualidade do dia" (DIARIO-12): quantos dos 7 grupos do Guia Alimentar aparecem nas refeições
 * registradas no dia. Lê só os alimentos (nunca calorias), sem vermelho, sem comemoração e sem
 * sequência; igual para perfis calmos. Os ladrilhos crescem em grade (fibras e sódio depois).
 */
export function QualityCard({ date }: { date: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { state } = useApp();
  const { width } = useWindowDimensions();
  const [isInfoOpen, setInfoOpen] = useState(false);
  const variety = useMemo(() => dayVariety(state.diary, date), [state.diary, date]);
  const present = useMemo(() => new Set<string>(variety.present), [variety.present]);
  if (!variety.mealCount) return null;
  const isSideBySide = width >= SIDE_BY_SIDE_WIDTH;
  const ring = <VarietyRing present={present} speech={variety.speech} size={width < SMALL_BELOW_WIDTH ? RING_SMALL : RING} />;
  const caption = (
    <AppText size={fontSize.sm} color={colors.text2} lineHeight={20} style={styles.caption}>
      {VARIETY_COPY.caption}
    </AppText>
  );
  const legend = (
    <View role="list" aria-label={VARIETY_COPY.legend} style={styles.legend}>
      {FOOD_GROUPS.map((group) => (
        <LegendItem key={group.key} group={group} isPresent={present.has(group.key)} isHalf={!isSideBySide} />
      ))}
    </View>
  );
  return (
    <View style={styles.card} testID="diary-quality">
      <View style={styles.head}>
        <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.title}>
          {VARIETY_COPY.title}
        </AppText>
        <IconButton icon={Info} accessibilityLabel={VARIETY_COPY.info} expanded={isInfoOpen} onPress={() => setInfoOpen(true)} />
      </View>
      {isSideBySide ? (
        <View style={styles.row}>
          {ring}
          <View style={styles.side}>
            {legend}
            {caption}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            {ring}
            {caption}
          </View>
          {legend}
        </>
      )}
      <Sheet visible={isInfoOpen} title={VARIETY_COPY.infoTitle} onClose={() => setInfoOpen(false)}>
        <AppText size={fontSize.sm} lineHeight={21} color={colors.text2}>
          {VARIETY_COPY.infoText}
        </AppText>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    boxShadow: shadows.panel,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  side: { flex: 1, minWidth: 0, gap: 12 },
  caption: { flex: 1, minWidth: 0 },
  ring: { alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, alignSelf: "stretch", flexShrink: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28, paddingRight: 6 },
  itemHalf: { width: "50%" },
  itemText: { flexShrink: 1 },
  absentTile: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.slate300,
    alignItems: "center",
    justifyContent: "center",
  },
}));
