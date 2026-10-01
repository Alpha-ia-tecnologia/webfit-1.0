import { Check, Info } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { friendlyName } from "@shared/lib/food-search";
import { CONFIDENCE_LABEL, type PhotoItem, type PlatePhoto } from "@shared/lib/plate-photo";
import { linkPhotoItems, type LinkedPhotoItem } from "@shared/lib/taco-match";
import type { FoodItem } from "@shared/types";
import { AllergenBadge } from "@/components/dieta/planned-items";
import { AppText, Button, Notice } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, type ThemeColors } from "@/theme/tokens";
import { webAttrs } from "./web-a11y";

/** Confiança em cor neutra ou positiva; baixa fica cinza (nunca vermelho). */
const confidenceColors = (colors: ThemeColors): Record<PhotoItem["confidence"], string> => ({
  high: colors.green600,
  medium: colors.amber500,
  low: colors.slate400,
});
const MIN_TOUCH = 44;

/** Caixa de marcação de 44 px (rascunhos da foto e da descrição). */
export function CheckBox({ label, name, checked, disabled, onToggle }: { label: string; name: string; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      {...webAttrs({ "aria-checked": checked })}
      disabled={disabled}
      onPress={onToggle}
      style={[styles.check, disabled && styles.disabled]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={15} color={colors.white} /> : null}</View>
      <AppText heading size={fontSize.md} weight={700} style={styles.name}>
        {name}
      </AppText>
    </Pressable>
  );
}

/** Um alimento da TACO para escolher (rádio com nome amigável e preparo). */
export function Candidate({ food, selected, onSelect }: { food: FoodItem; selected: boolean; onSelect: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { label, prep } = friendlyName(food.name);
  return (
    <Pressable
      role="radio"
      accessibilityLabel={prep ? `${label}, ${prep}` : label}
      accessibilityState={{ checked: selected }}
      {...webAttrs({ "aria-checked": selected })}
      onPress={onSelect}
      style={styles.radioTarget}
    >
      {({ pressed }) => (
        <View style={[styles.radio, selected && styles.radioOn, pressed && styles.pressed]}>
          <View style={[styles.dot, selected && styles.dotOn]} />
          <AppText size={fontSize.sm} weight={600} color={selected ? colors.green800 : colors.text2} style={styles.shrink}>
            {label}
            {prep ? (
              <AppText size={fontSize.xs} color={colors.muted}>
                {` · ${prep}`}
              </AppText>
            ) : null}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

type ItemProps = {
  linked: LinkedPhotoItem;
  checked: boolean;
  choice: string | null;
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
        label={`Incluir ${item.name}`}
        name={item.name}
        checked={checked}
        disabled={!candidates.length}
        onToggle={onToggle}
      />
      <View style={styles.tags}>
        <View style={styles.confidence}>
          <View style={[styles.confidenceDot, { backgroundColor: confidenceColors(colors)[item.confidence] }]} />
          <AppText size={fontSize.xs} weight={600} color={colors.text2}>
            {CONFIDENCE_LABEL[item.confidence]}
          </AppText>
        </View>
        {allergy ? <AllergenBadge /> : null}
      </View>
      {candidates.length ? (
        <View role="radiogroup" accessibilityLabel={`Alimento da TACO para ${item.name}`} style={styles.candidates}>
          {candidates.map((food) => (
            <Candidate key={food.id} food={food} selected={choice === food.id} onSelect={() => onChoose(food.id)} />
          ))}
        </View>
      ) : (
        <View style={styles.missing}>
          <AppText size={fontSize.sm} color={colors.muted}>
            Sem correspondência na TACO.
          </AppText>
          <Button label={`Buscar ${item.name}`} variant="text" onPress={() => onSearch(item.name)} />
        </View>
      )}
    </View>
  );
}

type Props = {
  /** Rascunho já mascarado (calorias ocultas) na entrada. */
  draft: PlatePhoto;
  allergyDetails: string;
  onAddFoods: (foods: FoodItem[]) => void;
  onSearch: (name: string) => void;
};

/**
 * Itens que o agente viu na foto (DIARIO-04), cada um ligado a alimentos da TACO para escolher.
 * Só entram marcados os seguros (com correspondência, sem alergia e sem confiança baixa); nada
 * vai para o prato sem o toque em "Adicionar", e as porções começam na medida caseira padrão.
 */
export function PhotoDraft({ draft, allergyDetails, onAddFoods, onSearch }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const linked = useMemo(() => linkPhotoItems(draft, allergyDetails), [draft, allergyDetails]);
  const [checked, setChecked] = useState<readonly boolean[]>(() => linked.map((l) => l.defaultChecked));
  const [choices, setChoices] = useState<readonly (string | null)[]>(() => linked.map((l) => l.candidates[0]?.id ?? null));
  const [isAdded, setAdded] = useState(false);
  const selected = linked.flatMap((l, i) => {
    if (!checked[i] || !l.candidates.length) return [];
    return [l.candidates.find((food) => food.id === choices[i]) ?? l.candidates[0]!];
  });
  const toggle = (index: number) => {
    selectionHaptic();
    setChecked((current) => current.map((value, i) => (i === index ? !value : value)));
  };
  const choose = (index: number, foodId: string) => {
    selectionHaptic();
    setChoices((current) => current.map((value, i) => (i === index ? foodId : value)));
  };
  const add = () => {
    if (!selected.length) return;
    setAdded(true);
    onAddFoods(selected);
  };

  if (isAdded)
    return (
      <View testID="photo-draft">
        <Notice>Itens da foto adicionados ao prato.</Notice>
      </View>
    );
  return (
    <View testID="photo-draft" style={styles.root}>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        Itens na foto
      </AppText>
      {draft.items.length ? (
        <>
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
            Confira cada item. Eles entram na medida caseira padrão e você ajusta as porções no prato.
          </AppText>
          <View role="list" aria-label="Itens na foto" style={styles.list}>
            {linked.map((l, index) => (
              <DraftItem
                key={`${index}-${l.item.name}`}
                linked={l}
                checked={checked[index] ?? false}
                choice={choices[index] ?? null}
                onToggle={() => toggle(index)}
                onChoose={(foodId) => choose(index, foodId)}
                onSearch={onSearch}
              />
            ))}
          </View>
        </>
      ) : (
        <AppText size={fontSize.sm} color={colors.text2}>
          Nenhum alimento identificado com segurança. Busque os itens abaixo.
        </AppText>
      )}
      {draft.uncertainties.length ? (
        <Notice tone="attention">
          <View style={styles.doubts}>
            <View style={styles.doubtsHead}>
              <Info size={15} color={colors.amber700} />
              <AppText size={fontSize.sm} weight={700} color={colors.amber700}>
                Incertezas
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
      {draft.items.length ? (
        <Button
          label={`Adicionar ${selected.length} à refeição`}
          wide
          disabled={!selected.length}
          onPress={add}
        />
      ) : null}
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
  check: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: MIN_TOUCH, alignSelf: "stretch" },
  disabled: { opacity: 0.6 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate400,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.green600, borderColor: colors.green600 },
  name: { flex: 1, minWidth: 0 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingLeft: 32 },
  confidence: { flexDirection: "row", alignItems: "center", gap: 6 },
  confidenceDot: { width: 8, height: 8, borderRadius: 4 },
  candidates: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, paddingLeft: 32 },
  radioTarget: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center", maxWidth: "100%" },
  radio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radioOn: { borderColor: colors.green600, backgroundColor: colors.mint50 },
  pressed: { transform: [{ scale: 0.97 }] },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.slate400 },
  dotOn: { borderColor: colors.green600, backgroundColor: colors.green600 },
  shrink: { flexShrink: 1 },
  missing: { gap: 2, paddingLeft: 32 },
  doubts: { gap: 4 },
  doubtsHead: { flexDirection: "row", alignItems: "center", gap: 6 },
}));
