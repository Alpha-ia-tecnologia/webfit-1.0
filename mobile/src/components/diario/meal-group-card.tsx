import { Apple, Coffee, CookingPot, Pencil, Plus, Repeat2, Sandwich, Trash2, type LucideIcon } from "lucide-react-native";
import type { Ref } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { addToLabel, macroShare, mealCategoryOf, mealSummary, type MealGroup } from "@shared/lib/diary-day";
import { mealGlyph } from "@shared/lib/food-glyph";
import { fmtKcal } from "@shared/lib/format";
import type { Tone } from "@shared/lib/today";
import type { DiaryEntry } from "@shared/types";
import { AppText, FoodGlyph, KcalStat, MacroBar, MealCard, mealCardTone, OverflowMenu } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { SatietyLine } from "./satiety-line";

/** Ícone de cada refeição (café, almoço, lanche, jantar/ceia), no tom dela. */
export const MEAL_ICONS: Record<Tone, LucideIcon> = {
  amber: Coffee,
  emerald: Sandwich,
  sky: Apple,
  teal: CookingPot,
};
/** Largura da barra P/C/G sob o horário (conceito 03); encolhe até 48 px quando "Como ficou?" divide a linha. */
const ROW_BAR_WIDTH = 112;
const ROW_BAR_MIN = 48;
/** Abaixo desta largura o nome do grupo ("Café da manhã") quebra em 2 linhas em vez de reticências. */
const GROUP_TITLE_WRAP_BELOW = 360;

type RowActions = {
  hideCalories: boolean;
  /** "Repetir agora" no dia de hoje; "Repetir hoje" em dias anteriores. */
  repeatLabel: string;
  highlightId: string | null;
  /** Recebe a linha destacada por um resultado da busca (para rolar até ela). */
  highlightRef: Ref<View>;
  onEdit: (entry: DiaryEntry) => void;
  onRepeat: (entry: DiaryEntry) => void;
  onRemove: (entry: DiaryEntry) => void;
};

/**
 * Registro dentro do grupo (MealRow do web, conceito 03): foto ou emoji do prato, a refeição em frase ("Pão
 * integral com ovo e café"), o horário, a barra P/C/G e "Como ficou?" na mesma linha. Tocar abre a edição; o
 * "⋯" edita, repete ou exclui. kcal na linha só quando o grupo tem 2 ou mais registros (com um, o subtotal já diz).
 */
function MealRow({ entry, tone, showKcal, ...actions }: RowActions & { entry: DiaryEntry; tone: Tone; showKcal: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const summary = mealSummary(entry);
  const kcal = fmtKcal(entry.calories ?? 0);
  const isHighlighted = actions.highlightId === entry.id;
  const title = summary.sentence || entry.title;
  return (
    <View
      ref={isHighlighted ? actions.highlightRef : undefined}
      style={[styles.row, isHighlighted && styles.highlight]}
      testID={`diary-entry-${entry.id}`}
    >
      {/* A linha inteira abre a edição; o texto deixa o toque passar e "Como ficou?" e o "⋯" ficam por cima. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${entry.title}`}
        accessibilityHint={`${entry.time}, ${summary.text}${actions.hideCalories ? "" : `, ${kcal}`}`}
        onPress={() => actions.onEdit(entry)}
        style={({ pressed }) => [StyleSheet.absoluteFill, styles.hit, pressed && styles.hitPressed]}
      />
      <View pointerEvents="none" style={styles.raised}>
        {entry.imageUrl ? (
          <Image source={{ uri: entry.imageUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
        ) : (
          <FoodGlyph glyph={mealGlyph(entry.items, mealCategoryOf(entry))} icon={MEAL_ICONS[tone]} size={40} />
        )}
      </View>
      <View style={[styles.copy, styles.raised]} pointerEvents="box-none">
        <View pointerEvents="none">
          <AppText size={fontSize.md} weight={700} numberOfLines={1}>
            {title}
          </AppText>
        </View>
        <View style={styles.meta} pointerEvents="box-none">
          <View pointerEvents="none">
            <AppText size={fontSize.sm} weight={600} color={colors.muted} style={styles.tabular}>
              {entry.time}
            </AppText>
          </View>
          <View pointerEvents="none" style={styles.bar}>
            <MacroBar share={macroShare(entry.macros)} size="sm" testID="macro-split" />
          </View>
          <SatietyLine entry={entry} />
        </View>
      </View>
      {showKcal && !actions.hideCalories && (
        <View pointerEvents="none" style={styles.raised}>
          <AppText heading size={fontSize.sm} weight={800} color={colors.text2} style={styles.tabular}>
            {kcal}
          </AppText>
        </View>
      )}
      <View style={styles.raised}>
        <OverflowMenu
          variant="ghost"
          label={`Mais ações: ${entry.title} das ${entry.time}`}
          items={[
            { label: "Editar", icon: Pencil, onSelect: () => actions.onEdit(entry) },
            { label: actions.repeatLabel, icon: Repeat2, onSelect: () => actions.onRepeat(entry) },
            { label: "Excluir", icon: Trash2, onSelect: () => actions.onRemove(entry) },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Grupo de um tipo de refeição (MealGroupCard do web, conceito 03): bloco com o ícone no tom da refeição, o
 * subtotal sempre (sem número com as calorias ocultas) e o "+" que adiciona outro registro ao grupo.
 */
export function MealGroupCard({
  group,
  onAdd,
  ...actions
}: RowActions & { group: MealGroup; onAdd: (category: string) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const titleLines = useWindowDimensions().width < GROUP_TITLE_WRAP_BELOW ? 2 : 1;
  const trailing = (
    <>
      {group.showSubtotal && !actions.hideCalories && <KcalStat value={group.calories} layout="inline" testID="diary-subtotal" />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={addToLabel(group.category)}
        onPress={() => onAdd(group.category)}
        style={styles.addHit}
      >
        {({ pressed }) => (
          <View style={[styles.add, pressed && styles.addPressed]}>
            <Plus size={18} strokeWidth={2.5} color={colors.green700} />
          </View>
        )}
      </Pressable>
    </>
  );
  return (
    <View testID="diary-group">
      <MealCard
        variant="group"
        title={group.category}
        icon={MEAL_ICONS[group.tone]}
        tone={mealCardTone(group.tone)}
        trailing={trailing}
        titleLines={titleLines}
      >
        <View style={styles.rows} role="list">
          {group.entries.map((entry) => (
            <View key={entry.id} role="listitem">
              <MealRow entry={entry} tone={group.tone} showKcal={group.showRowKcal} {...actions} />
            </View>
          ))}
        </View>
      </MealCard>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  rows: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 2, borderRadius: 14 },
  highlight: { backgroundColor: colors.mint50, boxShadow: `0px 0px 0px 2px ${colors.mint200}` },
  /** O toque da linha (abaixo do texto): passa 4–6 px das bordas, como o .diary-row-hit do web. */
  hit: { top: -4, bottom: -4, left: -6, right: -6, borderRadius: 16, zIndex: 1 },
  hitPressed: { backgroundColor: colors.pressedInk },
  raised: { zIndex: 2 },
  thumb: { width: 40, height: 40, borderRadius: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  bar: { width: ROW_BAR_WIDTH, minWidth: ROW_BAR_MIN, flexShrink: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  /** "+" do grupo: quadrado menta de 36 px dentro de um alvo de 44. */
  addHit: { width: 44, height: 44, marginVertical: -4, marginRight: -6, alignItems: "center", justifyContent: "center" },
  add: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
    alignItems: "center",
    justifyContent: "center",
  },
  addPressed: { backgroundColor: colors.mint100 },
}));
