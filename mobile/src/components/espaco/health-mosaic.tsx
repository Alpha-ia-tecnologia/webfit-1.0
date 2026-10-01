import { useRouter } from "expo-router";
import { Briefcase, ChevronRight, FishOff, NutOff, Syringe, type LucideIcon } from "lucide-react-native";
import { useState, type Ref } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { localDate } from "@shared/lib/domain";
import { anamneseCompletion, healthMosaic, PROFILE_HUB_COPY, sectionIndexOf } from "@shared/lib/profile-summary";
import { shouldShowTreatment } from "@shared/lib/treatment";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card, IconTile } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type Domain } from "@/theme/tokens";
import { EssentialSheet } from "./essential-card";
import { ProfileAttention, ProfileSectionList } from "./profile-hub";
import { ProfileSectionSheet } from "./profile-section-sheet";
import { TreatmentSheet } from "./treatment-card";

/** Abaixo disto (320–370 pt) as linhas empilham os chips embaixo do título (o @media do web). */
const NARROW_WIDTH = 370;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

type SheetKind = { kind: "essential" } | { kind: "treatment" } | { kind: "section"; index: number };
type ChipTone = "attention" | "medication" | "neutral";
interface Chip {
  text: string;
  tone: ChipTone;
  srText?: string;
}

/** Chip do mosaico (26 pt): âmbar nas alergias, violeta na medicação e neutro no resto (texto escuro, sem borda). */
function MosaicChip({ chip }: { chip: Chip }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme);
  const palette =
    chip.tone === "attention"
      ? { fg: colors.amber900, bg: colors.amber100, border: colors.amber200 }
      : chip.tone === "medication"
        ? tone.medication
        : { fg: colors.text, bg: tone.neutral.bg, border: "transparent" };
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <AppText size={fontSize.sm} weight={600} color={palette.fg} numberOfLines={1} lineHeight={17}>
        {chip.text}
      </AppText>
      {chip.srText ? <AppText style={srOnly}>{` ${chip.srText}`}</AppText> : null}
    </View>
  );
}

/** Uma célula ou linha do mosaico: botão de 44 pt+ com nome = título; os chips descrevem. */
function MosaicItem({
  title,
  icon,
  tone,
  chips,
  layout,
  isNarrow,
  onOpen,
}: {
  title: string;
  icon: LucideIcon;
  tone: Domain;
  chips: Chip[];
  layout: "cell" | "row";
  isNarrow: boolean;
  onOpen: () => void;
}) {
  const styles = useStyles();
  const isRow = layout === "row" && !isNarrow;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={chips.map((c) => (c.srText ? `${c.text} ${c.srText}` : c.text)).join(", ")}
      {...webAttrs({ "aria-haspopup": "dialog" })}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.item,
        layout === "cell" ? styles.cell : isRow ? styles.row : styles.rowStacked,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.itemHead}>
        <IconTile tone={tone} size="md" icon={icon} style={styles.icon} />
        <AppText size={fontSize.sm} weight={700}>
          {title}
        </AppText>
      </View>
      <View style={[styles.chips, isRow && styles.chipsEnd]} {...HIDDEN}>
        {chips.map((chip) => (
          <MosaicChip key={chip.text} chip={chip} />
        ))}
      </View>
    </Pressable>
  );
}

const none = (text: string): Chip[] => [{ text, tone: "neutral" }];

type Props = {
  isHubOpen: boolean;
  onHubToggle: () => void;
  /** A linha "Anamnese completa": o chip do topo rola até ela. */
  hubToggleRef?: Ref<View>;
};

/**
 * "Perfil de saúde" em mosaico (conceito 11; HealthMosaic do web): alergias e o que evita lado a lado, a medicação
 * pelo último registro ("GLP-1" + nome e dose já registrados; os remédios da anamnese só como contagem; condições
 * nunca), a rotina e a linha "Anamnese completa · 7 seções", que abre as etapas. "Precisa de atenção" fica acima do
 * cartão quando há o que revisar.
 */
export function HealthMosaic({ isHubOpen, onHubToggle, hubToggleRef }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const p = state.profile;
  if (!p) return null;
  const today = localDate();
  const mosaic = healthMosaic(state, today);
  const done = anamneseCompletion(p, today);
  const [hubMain, hubRest] = done.label.split(" · ");
  const isNarrow = width <= NARROW_WIDTH;
  const med = mosaic.medication;
  const medChips: Chip[] = [
    ...med.tags.map((tag) => ({ text: tag, tone: "medication" as const })),
    ...(med.name ? [{ text: [med.name, med.dose].filter(Boolean).join(" "), tone: "neutral" as const }] : []),
    ...(med.extraCount
      ? [
          med.tags.length || med.name
            ? { text: `+${med.extraCount}`, tone: "neutral" as const, srText: "outros medicamentos" }
            : { text: med.extraCount === 1 ? "1 informado" : `${med.extraCount} informados`, tone: "neutral" as const },
        ]
      : []),
  ];
  const openSection = (anchor: string) => {
    const index = sectionIndexOf(anchor);
    setSheet(index >= 0 ? { kind: "section", index } : { kind: "essential" });
  };
  const close = () => setSheet(null);
  return (
    <View style={styles.section} role="region" aria-label={PROFILE_HUB_COPY.title}>
      <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} accessibilityRole="header">
        {PROFILE_HUB_COPY.title}
      </AppText>
      <ProfileAttention />
      <Card style={styles.card} testID="health-mosaic">
        <View style={styles.pair}>
          <View style={styles.pairCell}>
            <MosaicItem
              layout="cell"
              title="Alergias"
              icon={NutOff}
              tone="attention"
              isNarrow={isNarrow}
              chips={mosaic.allergies.length ? mosaic.allergies.map((text) => ({ text, tone: "attention" as const })) : none("Nenhuma")}
              onOpen={() => setSheet({ kind: "essential" })}
            />
          </View>
          <View style={[styles.pairCell, styles.pairDivider]}>
            <MosaicItem
              layout="cell"
              title="Evita"
              icon={FishOff}
              tone="neutral"
              isNarrow={isNarrow}
              chips={mosaic.avoided.length ? mosaic.avoided.map((text) => ({ text, tone: "neutral" as const })) : none("Nada em especial")}
              onOpen={() => openSection("avoidedFoods")}
            />
          </View>
        </View>
        <MosaicItem
          layout="row"
          title="Medicação"
          icon={Syringe}
          tone="medication"
          isNarrow={isNarrow}
          chips={medChips.length ? medChips : none("Nenhuma")}
          onOpen={() => setSheet({ kind: shouldShowTreatment(p, state.injections) ? "treatment" : "essential" })}
        />
        <MosaicItem
          layout="row"
          title="Rotina"
          icon={Briefcase}
          tone="water"
          isNarrow={isNarrow}
          chips={mosaic.routine.length ? mosaic.routine.map((text) => ({ text, tone: "neutral" as const })) : none("Não informada")}
          onOpen={() => openSection("routine")}
        />
        <Pressable
          ref={hubToggleRef}
          accessibilityRole="button"
          accessibilityState={{ expanded: isHubOpen }}
          {...webAttrs({ "aria-expanded": isHubOpen })}
          onPress={onHubToggle}
          style={({ pressed }) => [styles.hubToggle, pressed && styles.pressed]}
          testID="health-hub-toggle"
        >
          <View style={[styles.hubRing, done.isComplete && styles.hubRingComplete]} {...HIDDEN} />
          <AppText size={fontSize.sm} style={styles.grow}>
            <AppText size={fontSize.sm} weight={700}>
              {hubMain}
            </AppText>
            {hubRest ? (
              <AppText size={fontSize.sm} color={colors.muted}>
                {` · ${hubRest}`}
              </AppText>
            ) : null}
          </AppText>
          <View style={isHubOpen ? styles.chevronOpen : undefined} {...HIDDEN}>
            <ChevronRight size={20} color={colors.muted} />
          </View>
        </Pressable>
        {isHubOpen ? (
          <View style={styles.hubPanel}>
            <ProfileSectionList />
          </View>
        ) : null}
      </Card>
      {sheet?.kind === "essential" ? <EssentialSheet onClose={close} /> : null}
      {sheet?.kind === "treatment" ? <TreatmentSheet onClose={close} /> : null}
      {sheet?.kind === "section" ? (
        <ProfileSectionSheet
          index={sheet.index}
          onClose={close}
          onEdit={(index) => {
            close();
            router.push({ pathname: "/anamnese", params: { secao: String(index) } });
          }}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  card: { padding: 0, gap: 0, overflow: "hidden" },
  pair: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  pairCell: { flex: 1, minWidth: 0 },
  pairDivider: { borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
  item: { gap: 10, padding: 14 },
  cell: { alignItems: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  // 320–370 pt: os chips descem para baixo do título.
  rowStacked: { alignItems: "flex-start", minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  pressed: { backgroundColor: colors.surface2 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  icon: { width: 32, height: 32, borderRadius: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, minWidth: 0, flexShrink: 1 },
  chipsEnd: { justifyContent: "flex-end" },
  chip: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    maxWidth: "100%",
  },
  hubToggle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingLeft: 18, paddingRight: 14 },
  hubRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderStyle: "dashed", borderColor: colors.slate400 },
  hubRingComplete: { borderStyle: "solid", borderColor: colors.green500 },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  hubPanel: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
}));
