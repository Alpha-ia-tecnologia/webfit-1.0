import { Droplet, Moon, Pencil, Plus, Syringe, Trash2 } from "lucide-react-native";
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { MOOD_LABELS } from "@shared/lib/day";
import { moodEmoji, waterGlasses, waterLiters, waterSpoken, waterTimes, wellbeingTitle } from "@shared/lib/diary-day";
import { fmtMl, fmtNumber } from "@shared/lib/format";
import { injectionDetail, injectionTitle } from "@shared/lib/injection";
import { SYMPTOM_LABELS, symptomText } from "@shared/lib/symptoms";
import type { DiaryEntry, InjectionEntry, Symptom } from "@shared/types";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, FoodGlyph, OverflowMenu, SegmentMeter } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, radius, shadows, themeDomainTone } from "@/theme/tokens";

/** Volume do "+" da linha de água. */
export const WATER_QUICK_ML = 250;
/** Copo de 20 × 24 px com a boca mais larga que o fundo (o clip-path do web). */
const GLASS_W = 20;
const GLASS_H = 24;
const GLASS_OUTER = "M0 0H20L17.2 24H2.8Z";
/** Miolo do copo vazio (1,5 px de contorno) e o brilho de 3 px na boca do copo cheio. */
const GLASS_INNER = "M1.7 1.5H18.3L15.9 22.5H4.1Z";
const GLASS_SHINE = "M0 0H20L19.65 3H0.35Z";
const GLASS_GRADIENT = "wf-diary-glass";
/** Barra de 5 do humor em 72 px (conceito 03): cabe com o horário e o chip do sono na mesma linha. */
const MOOD_METER_WIDTH = 72;
const INTENSITY_DOTS = [1, 2, 3] as const;

function Highlightable({
  isHighlighted,
  highlightRef,
  style,
  testID,
  children,
}: {
  isHighlighted: boolean;
  highlightRef: Ref<View>;
  style: object;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View ref={isHighlighted ? highlightRef : undefined} style={[style, isHighlighted && styles.highlight]} testID={testID}>
      {children}
    </View>
  );
}

/** Editar e excluir de uma linha no "⋯" (como o web). */
function RowMenu({ label, onEdit, onRemove }: { label: string; onEdit: () => void; onRemove: () => void }) {
  return (
    <OverflowMenu
      variant="ghost"
      label={`Mais ações: ${label}`}
      items={[
        { label: "Editar", icon: Pencil, onSelect: onEdit },
        { label: "Excluir", icon: Trash2, onSelect: onRemove },
      ]}
    />
  );
}

/** Um copo: cheio no gradiente azul com o brilho da boca; vazio só com o contorno. */
function Glass({ isFull }: { isFull: boolean }) {
  const colors = useThemeColors();
  const [top, bottom] = gradients.water;
  return (
    <Svg width={GLASS_W} height={GLASS_H} viewBox={`0 0 ${GLASS_W} ${GLASS_H}`}>
      {isFull ? (
        <>
          <Defs>
            <LinearGradient id={GLASS_GRADIENT} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="1" stopColor={bottom} />
            </LinearGradient>
          </Defs>
          <Path d={GLASS_OUTER} fill={`url(#${GLASS_GRADIENT})`} />
          <Path d={GLASS_SHINE} fill={colors.surface} fillOpacity={0.7} />
        </>
      ) : (
        <>
          <Path d={GLASS_OUTER} fill={colors.border} />
          <Path d={GLASS_INNER} fill={colors.surface} />
        </>
      )}
    </Svg>
  );
}

/**
 * A água do dia em copos (WaterGlasses do web, conceito 03): a meta dividida em 10 copos; sem meta, copos de
 * 250 ml. Só exibição (o "+ 250 ml" ao lado registra). Acima da meta todos ficam cheios, sem alerta.
 */
function WaterGlasses({ totalMl, goalMl }: { totalMl: number; goalMl: number | null }) {
  const styles = useStyles();
  const { filled, total } = waterGlasses(totalMl, goalMl);
  return (
    <View style={styles.glasses} accessible accessibilityRole="image" accessibilityLabel={`${filled} de ${total} copos, ${waterSpoken(totalMl, goalMl)}`}>
      {Array.from({ length: total }, (_, i) => (
        <Glass key={i} isFull={i < filled} />
      ))}
    </View>
  );
}

/**
 * A água do dia num cartão (WaterLine do web, conceito 03): gota, os horários, "1,75 / 2,5 L", 10 copos e
 * "+ 250 ml". Tocar no cabeçalho abre os registros, cada um com o "⋯" (Editar, Excluir).
 */
export function WaterLine({
  totalMl,
  goalMl,
  entries,
  highlightId,
  highlightRef,
  onAdd,
  onEdit,
  onRemove,
}: {
  totalMl: number;
  goalMl: number | null;
  entries: DiaryEntry[];
  highlightId: string | null;
  highlightRef: Ref<View>;
  onAdd: () => void;
  onEdit: (entry: DiaryEntry) => void;
  onRemove: (id: string) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  const isExpanded = isOpen && entries.length > 0;
  const times = waterTimes(entries);
  // Um resultado da busca que é de água abre a lista para mostrar o registro.
  useEffect(() => {
    if (highlightId && entries.some((e) => e.id === highlightId)) setOpen(true);
  }, [highlightId, entries]);
  return (
    <View style={[styles.card, styles.water]}>
      <View style={styles.waterHead}>
        {/* O cabeçalho inteiro abre a lista dos registros (o botão fica por trás do texto). */}
        {entries.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Registros de água (${entries.length})`}
            accessibilityState={{ expanded: isExpanded }}
            {...webAttrs({ "aria-expanded": isExpanded })}
            onPress={() => setOpen(!isOpen)}
            style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
          />
        )}
        <View pointerEvents="none" style={styles.raised}>
          <FoodGlyph icon={Droplet} size={40} tone="sky" bordered />
        </View>
        <View pointerEvents="none" style={[styles.copy, styles.raised]}>
          <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
            Água
          </AppText>
          {times ? (
            <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
              {times}
            </AppText>
          ) : null}
        </View>
        <View pointerEvents="none" style={styles.raised}>
          <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
            <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} testID="diary-water-total">
              {waterLiters(totalMl)}
            </AppText>
            {goalMl !== null && goalMl > 0 ? ` / ${waterLiters(goalMl)} L` : " L"}
          </AppText>
        </View>
      </View>
      <View style={styles.waterRow}>
        <WaterGlasses totalMl={totalMl} goalMl={goalMl} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Adicionar ${WATER_QUICK_ML} ml de água`}
          onPress={onAdd}
          style={({ pressed }) => [styles.waterAdd, pressed && styles.pressed]}
        >
          <Plus size={16} strokeWidth={2.5} color={colors.sky700} />
          <AppText size={fontSize.md} weight={800} color={colors.sky700}>
            {WATER_QUICK_ML} ml
          </AppText>
        </Pressable>
      </View>
      {isExpanded && (
        <View style={styles.waterList}>
          {entries.map((e) => (
            <Highlightable
              key={e.id}
              isHighlighted={highlightId === e.id}
              highlightRef={highlightRef}
              style={styles.waterItem}
              testID={`diary-entry-${e.id}`}
            >
              <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
                {e.time}
              </AppText>
              <AppText size={fontSize.sm} weight={600} style={styles.waterAmount}>
                {fmtMl(e.amountMl ?? 0)}
              </AppText>
              <RowMenu label={`${e.title} das ${e.time}`} onEdit={() => onEdit(e)} onRemove={() => onRemove(e.id)} />
            </Highlightable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Efeito percebido (SERINGA-07): nome à vista, três bolinhas da intensidade e o texto completo para leitores de tela. */
function SymptomChip({ symptom }: { symptom: Symptom }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.chip, styles.symptomChip]} testID="diary-symptom-chip">
      <AppText size={fontSize.xs} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
        {SYMPTOM_LABELS[symptom.key]}
      </AppText>
      <View style={styles.symptomDots} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {INTENSITY_DOTS.map((level) => (
          <View key={level} style={[styles.symptomDot, level <= symptom.intensity && styles.symptomDotOn]} />
        ))}
      </View>
      <AppText style={srOnly}>{symptomText(symptom)}</AppText>
    </View>
  );
}

/**
 * Bem-estar num cartão (WellbeingRow do web, conceito 03): o rosto da nota, a anotação (ou "Bem"), a barra de 5
 * do humor, o horário e o sono num chip; efeitos e marcadores seguem como chips. Editar e excluir no "⋯".
 */
export function WellbeingRow({
  entry,
  isHighlighted,
  highlightRef,
  onEdit,
  onRemove,
}: {
  entry: DiaryEntry;
  isHighlighted: boolean;
  highlightRef: Ref<View>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const rating = entry.rating;
  return (
    <Highlightable isHighlighted={isHighlighted} highlightRef={highlightRef} style={[styles.card, styles.row]} testID={`diary-entry-${entry.id}`}>
      <FoodGlyph glyph={moodEmoji(rating)} size={40} tone="mind" />
      <View style={styles.copy}>
        <AppText heading size={fontSize.lg} weight={800} numberOfLines={1}>
          {wellbeingTitle(entry)}
        </AppText>
        <View style={styles.meta}>
          {rating ? (
            <View style={styles.meter}>
              <SegmentMeter
                value={rating}
                total={5}
                tone="mind"
                size="md"
                label={`Humor ${rating} de 5, ${MOOD_LABELS[Math.min(5, Math.max(1, rating)) - 1]}`}
              />
            </View>
          ) : null}
          <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
            {entry.time}
          </AppText>
          {entry.sleepHours !== undefined && (
            <View style={[styles.sleep, { backgroundColor: themeDomainTone(scheme).body.bg }]}>
              <Moon size={14} color={colors.indigo700} />
              <AppText size={fontSize.sm} weight={800} color={colors.indigo700}>
                {fmtNumber(entry.sleepHours, 1)} h
                <AppText style={srOnly}> de sono</AppText>
              </AppText>
            </View>
          )}
          {entry.symptoms?.map((symptom) => <SymptomChip key={symptom.key} symptom={symptom} />)}
          {entry.tags?.map((tag) => (
            <View key={tag} style={[styles.chip, styles.tagChip]}>
              <AppText size={fontSize.xs} weight={700} color={colors.text2}>
                {tag}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <RowMenu label={`${entry.title} das ${entry.time}`} onEdit={onEdit} onRemove={onRemove} />
    </Highlightable>
  );
}

/** Aplicação de injetável registrada na calculadora de seringa e dose (InjectionRow do web); editar e excluir no "⋯". */
export function InjectionRow({
  entry,
  isHighlighted,
  highlightRef,
  onEdit,
  onRemove,
}: {
  entry: InjectionEntry;
  isHighlighted: boolean;
  highlightRef: Ref<View>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const title = injectionTitle(entry);
  return (
    <Highlightable isHighlighted={isHighlighted} highlightRef={highlightRef} style={[styles.card, styles.row]} testID={`diary-entry-${entry.id}`}>
      <FoodGlyph icon={Syringe} size={40} tone="indigo" bordered />
      <View style={styles.copy}>
        <AppText heading size={fontSize.md} weight={700} numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        <View style={styles.meta}>
          <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
            {entry.time}
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted} style={styles.flexText}>
            {injectionDetail(entry)}
          </AppText>
        </View>
        {entry.notes ? (
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
            {entry.notes}
          </AppText>
        ) : null}
      </View>
      <RowMenu label={`aplicação ${title}`} onEdit={onEdit} onRemove={onRemove} />
    </Highlightable>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  /** Cartões de água, bem-estar e aplicação (conceito 03): brancos, raio 24, sombra, sem borda. */
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  highlight: { backgroundColor: colors.mint50, boxShadow: `0px 0px 0px 2px ${colors.mint200}` },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 6 },
  tabular: { fontVariant: ["tabular-nums"] },
  flexText: { flexShrink: 1 },
  raised: { zIndex: 2 },
  water: { gap: 12 },
  waterHead: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  /** Toque do cabeçalho (6–8 px além das bordas, por trás do texto), como o .diary-water-toggle do web. */
  toggle: { position: "absolute", top: -6, bottom: -6, left: -8, right: -8, zIndex: 1, borderRadius: 16 },
  togglePressed: { backgroundColor: colors.pressedInk },
  waterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  glasses: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "nowrap", gap: 4, overflow: "hidden" },
  waterAdd: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.sky100,
    backgroundColor: colors.sky50,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  waterList: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  waterItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 52, borderRadius: 12 },
  waterAmount: { flex: 1 },
  meter: { width: MOOD_METER_WIDTH },
  sleep: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  /** Efeito percebido: neutro (nunca vermelho ou âmbar), com as bolinhas da intensidade em ardósia. */
  symptomChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border },
  symptomDots: { flexDirection: "row", gap: 2 },
  symptomDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: colors.slate300 },
  symptomDotOn: { borderColor: colors.text2, backgroundColor: colors.text2 },
  /** Marcador de bem-estar: rosa do tom "mente", sem julgamento. */
  tagChip: { borderWidth: 1, borderColor: themeDomainTone(scheme).mind.border, backgroundColor: themeDomainTone(scheme).mind.bg },
}));
