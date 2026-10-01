import { Info, Plus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { fmtNumber } from "@shared/lib/format";
import { describePortion, measureById, qtyFor } from "@shared/lib/household-measures";
import { MEAL_TEXT_COPY, type MealText } from "@shared/lib/meal-text";
import {
  linkMealTextItems,
  mealTextPortion,
  type LinkedMealTextItem,
  type StatedPortion,
} from "@shared/lib/taco-match";
import type { FoodItem } from "@shared/types";
import { AllergenBadge } from "@/components/dieta/planned-items";
import { AppText, Button, Notice } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { Candidate, CheckBox } from "./photo-draft";

/** Escolha do rascunho: o alimento da TACO e a porção dita (null = medida padrão e "Falta porção"). */
export interface MealTextSelection {
  food: FoodItem;
  portion: StatedPortion | null;
}

/** "4 colheres de sopa ≈ 100 g" ou "150 g": gramas só das medidas caseiras da TACO. */
function portionText(food: FoodItem, portion: StatedPortion): string {
  const measure = measureById(food, portion.unit);
  const grams = `${fmtNumber(portion.grams, 1)} g`;
  return measure ? `${describePortion(qtyFor(portion.grams, measure), measure)} ≈ ${grams}` : grams;
}

/** Linha da porção: dita e mapeada (neutra) ou o ponto âmbar de "Falta porção" (nunca vermelho). */
function PortionLine({ linked, food }: { linked: LinkedMealTextItem; food: FoodItem }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const portion = mealTextPortion(linked, food);
  if (portion)
    return (
      <AppText size={fontSize.xs} color={colors.text2} lineHeight={18} style={styles.indent}>
        {MEAL_TEXT_COPY.stated(portionText(food, portion))}
      </AppText>
    );
  const text = linked.statedText ? MEAL_TEXT_COPY.saidCheck(linked.statedText) : MEAL_TEXT_COPY.missingDefault;
  return (
    <View style={[styles.flag, styles.indent]}>
      <View style={styles.flagDot} />
      <AppText size={fontSize.xs} weight={600} color={colors.amber900} lineHeight={18} style={styles.shrink}>
        {text}
      </AppText>
    </View>
  );
}

type ItemProps = {
  linked: LinkedMealTextItem;
  checked: boolean;
  choice: FoodItem | null;
  onToggle: () => void;
  onChoose: (foodId: string) => void;
  onSearch: (name: string) => void;
};

function DraftItem({ linked, checked, choice, onToggle, onChoose, onSearch }: ItemProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { item, candidates, allergy } = linked;
  return (
    <View role="listitem" style={styles.item}>
      <CheckBox
        label={MEAL_TEXT_COPY.include(item.name)}
        name={item.name}
        checked={checked}
        disabled={!candidates.length}
        onToggle={onToggle}
      />
      {allergy ? (
        <View style={[styles.tags, styles.indent]}>
          <AllergenBadge />
        </View>
      ) : null}
      {candidates.length && choice ? (
        <>
          <View role="radiogroup" accessibilityLabel={MEAL_TEXT_COPY.tacoFor(item.name)} style={[styles.candidates, styles.indent]}>
            {candidates.map((food) => (
              <Candidate key={food.id} food={food} selected={choice.id === food.id} onSelect={() => onChoose(food.id)} />
            ))}
          </View>
          <PortionLine linked={linked} food={choice} />
        </>
      ) : (
        <View style={[styles.missing, styles.indent]}>
          <AppText size={fontSize.sm} color={colors.muted}>
            {MEAL_TEXT_COPY.noMatch}
          </AppText>
          <Button label={MEAL_TEXT_COPY.search(item.name)} variant="text" onPress={() => onSearch(item.name)} />
        </View>
      )}
    </View>
  );
}

type Props = {
  /** Rascunho já mascarado (calorias ocultas) na entrada. */
  draft: MealText;
  /** O texto enviado: a quantidade só vale quando o trecho está nele. */
  source: string;
  allergyDetails: string;
  onAdd: (selections: MealTextSelection[]) => void;
  onBack: () => void;
  onSearch: (name: string) => void;
};

/**
 * "Itens da descrição" (DIARIO-07): cada alimento citado ligado à TACO. Entram marcados só os
 * com correspondência e sem alergia (o alérgeno fica à vista, desmarcado: a pessoa já comeu). As
 * gramas saem das medidas caseiras; sem porção dita, o item entra na medida padrão com "Falta porção".
 */
export function MealTextDraft({ draft, source, allergyDetails, onAdd, onBack, onSearch }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const linked = useMemo(() => linkMealTextItems(draft, source, allergyDetails), [draft, source, allergyDetails]);
  const [checked, setChecked] = useState<readonly boolean[]>(() => linked.map((l) => l.defaultChecked));
  const [choices, setChoices] = useState<readonly (string | null)[]>(() => linked.map((l) => l.candidates[0]?.id ?? null));
  const chosen = (index: number): FoodItem | null => {
    const l = linked[index];
    if (!l?.candidates.length) return null;
    return l.candidates.find((food) => food.id === choices[index]) ?? l.candidates[0]!;
  };
  const selections = linked.flatMap((l, i) => {
    const food = chosen(i);
    return checked[i] && food ? [{ food, portion: mealTextPortion(l, food) }] : [];
  });
  const toggle = (index: number) => {
    selectionHaptic();
    setChecked((current) => current.map((value, i) => (i === index ? !value : value)));
  };
  const choose = (index: number, foodId: string) => {
    selectionHaptic();
    setChoices((current) => current.map((value, i) => (i === index ? foodId : value)));
  };

  return (
    <View testID="meal-text-draft" style={styles.root}>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        {MEAL_TEXT_COPY.draft}
      </AppText>
      {draft.items.length ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {MEAL_TEXT_COPY.draftHint}
        </AppText>
      ) : (
        <Notice>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
            {MEAL_TEXT_COPY.noItems}
          </AppText>
        </Notice>
      )}
      {draft.items.length ? (
        <View role="list" aria-label={MEAL_TEXT_COPY.draft} style={styles.list}>
          {linked.map((l, index) => (
            <DraftItem
              key={`${index}-${l.item.name}`}
              linked={l}
              checked={checked[index] ?? false}
              choice={chosen(index)}
              onToggle={() => toggle(index)}
              onChoose={(foodId) => choose(index, foodId)}
              onSearch={onSearch}
            />
          ))}
        </View>
      ) : null}
      {draft.uncertainties.length ? (
        <Notice tone="attention">
          <View style={styles.doubts}>
            <View style={styles.doubtsHead}>
              <Info size={15} color={colors.amber700} />
              <AppText size={fontSize.sm} weight={700} color={colors.amber700}>
                {MEAL_TEXT_COPY.doubts}
              </AppText>
            </View>
            {draft.uncertainties.map((doubt) => (
              <AppText key={doubt} size={fontSize.sm} lineHeight={20} color={colors.amber900}>
                {`• ${doubt}`}
              </AppText>
            ))}
          </View>
        </Notice>
      ) : null}
      <View style={styles.actions}>
        {draft.items.length ? (
          <Button
            label={MEAL_TEXT_COPY.addCount(selections.length)}
            icon={Plus}
            wide
            disabled={!selections.length}
            onPress={() => selections.length && onAdd(selections)}
          />
        ) : null}
        <Button label={MEAL_TEXT_COPY.back} variant="secondary" wide onPress={onBack} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12 },
  list: { gap: 12 },
  item: {
    gap: 6,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  indent: { paddingLeft: 32 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  candidates: { flexDirection: "row", flexWrap: "wrap", columnGap: 8 },
  flag: { flexDirection: "row", alignItems: "center", gap: 6 },
  flagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber500 },
  shrink: { flexShrink: 1 },
  missing: { gap: 2 },
  doubts: { gap: 4 },
  doubtsHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { gap: 10 },
}));
