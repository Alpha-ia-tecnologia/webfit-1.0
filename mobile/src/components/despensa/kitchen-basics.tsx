import { Pressable, View } from "react-native";
import { plural } from "@shared/lib/format";
import { KITCHEN_BASICS, KITCHEN_BASICS_HELP, KITCHEN_BASICS_NONE_HINT } from "@shared/lib/kitchen-basics";
import type { KitchenBasicKey } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, TagPill } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const MIN_TOUCH = 44;

type Props = {
  selected: readonly KitchenBasicKey[];
  /** Indisponíveis durante uma ação: mudar os básicos no meio da geração faria o salvamento falhar. */
  disabled: boolean;
  onToggle: (key: KitchenBasicKey) => void;
};

/** Básicos da cozinha (IA-X4): o que a pessoa sempre tem; só os marcados entram nas receitas. */
export function KitchenBasics({ selected, disabled, onToggle }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const n = selected.length;
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <AppText heading size={fontSize.base} weight={700} accessibilityRole="header">
          Básicos da cozinha
        </AppText>
        <TagPill label={plural(n, "marcado", "marcados")} tone={n ? "emerald" : "neutral"} />
      </View>
      <AppText size={fontSize.sm} color={colors.muted}>
        {KITCHEN_BASICS_HELP}
      </AppText>
      {n === 0 && (
        <AppText size={fontSize.xs} color={colors.muted} testID="kitchen-basics-none">
          {KITCHEN_BASICS_NONE_HINT}
        </AppText>
      )}
      <View role="group" accessibilityLabel="Básicos da cozinha" testID="kitchen-basics" style={styles.chips}>
        {KITCHEN_BASICS.map(({ key, label, emoji }) => {
          const isOn = selected.includes(key);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isOn, disabled }}
              {...webAttrs({ "aria-pressed": isOn })}
              disabled={disabled}
              onPress={() => {
                selectionHaptic();
                onToggle(key);
              }}
              style={({ pressed }) => [styles.chip, isOn && styles.chipOn, pressed && styles.pressed, disabled && styles.disabled]}
            >
              <AppText size={fontSize.base} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
                {emoji}
              </AppText>
              <AppText size={fontSize.sm} weight={600} color={isOn ? colors.green800 : colors.text2}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.green600, backgroundColor: colors.mint50 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
}));
