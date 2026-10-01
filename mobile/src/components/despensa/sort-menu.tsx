import { Check, ChevronDown } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { PANTRY_SORT_LABEL, type PantrySort } from "@shared/lib/pantry-view";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";

const SORTS: PantrySort[] = ["validade", "nome"];
const MENU_GAP = 4;
const EDGE = 12;
const MENU_MIN_WIDTH = 180;
/** Duas opções de 44 px (+2 de espaço) e o respiro do menu: sem espaço embaixo, o menu abre acima do gatilho. */
const MENU_HEIGHT = SORTS.length * 46 + 12;

/**
 * "Por validade ⌄" no cabeçalho do primeiro local (o select do web): abre um menu ancorado com "Por validade" e
 * "Por nome" (um grupo de rádios). O alvo tem 44 px, mas não aumenta a linha do título (margens negativas).
 */
export function SortMenu({ value, onChange }: { value: PantrySort; onChange: (sort: PantrySort) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const anchor = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const open = () =>
    anchor.current?.measureInWindow((x, y, w, h) => {
      const below = y + h + MENU_GAP;
      const top = below + MENU_HEIGHT > height - EDGE ? Math.max(EDGE, y - MENU_GAP - MENU_HEIGHT) : below;
      setPosition({ top, right: Math.max(EDGE, width - (x + w)) });
    });
  const close = () => setPosition(null);
  return (
    <>
      <View ref={anchor} collapsable={false} style={styles.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ordenar alimentos: ${PANTRY_SORT_LABEL[value]}`}
          accessibilityState={{ expanded: !!position }}
          {...webAttrs({ "aria-expanded": !!position })}
          onPress={position ? close : open}
          style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        >
          <AppText size={fontSize.xs} weight={600} color={colors.muted}>
            {PANTRY_SORT_LABEL[value]}
          </AppText>
          <ChevronDown size={14} color={colors.muted} />
        </Pressable>
      </View>
      <Modal visible={!!position} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Fechar menu" />
        {position && (
          <View role="radiogroup" accessibilityLabel="Ordenar alimentos" style={[styles.menu, position]}>
            {SORTS.map((sort) => {
              const isOn = sort === value;
              return (
                <Pressable
                  key={sort}
                  role="radio"
                  accessibilityLabel={PANTRY_SORT_LABEL[sort]}
                  accessibilityState={{ checked: isOn }}
                  {...webAttrs({ "aria-checked": isOn })}
                  onPress={() => {
                    close();
                    if (isOn) return;
                    selectionHaptic();
                    onChange(sort);
                  }}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <View style={styles.mark}>{isOn ? <Check size={16} color={colors.green700} /> : null}</View>
                  <AppText size={fontSize.sm} weight={600}>
                    {PANTRY_SORT_LABEL[sort]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  anchor: { marginLeft: "auto", marginVertical: -8 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: 6, paddingRight: 2 },
  pressed: { opacity: 0.7 },
  menu: {
    position: "absolute",
    minWidth: MENU_MIN_WIDTH,
    padding: 6,
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.float,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.sm },
  itemPressed: { backgroundColor: colors.surface2 },
  mark: { width: 16, alignItems: "center" },
}));
