import { MoreHorizontal, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { IconButton } from "./icon-button";
import { AppText } from "./text";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

const MENU_GAP = 6;
const EDGE = 12;
const MENU_MIN_WIDTH = 200;
/** Altura de cada item (44 px + 2 de espaço) e o respiro do menu: sem espaço embaixo, o menu abre acima do "⋯". */
const ITEM_HEIGHT = 46;
const MENU_PADDING = 12;
/** Espera o fade do Modal sumir antes de devolver o foco (com ele aberto o foco fica preso). */
const REFOCUS_DELAY_MS = 350;

/**
 * Menu "⋯" de ações secundárias, ancorado ao botão: fecha ao escolher, ao tocar fora
 * ou com o botão voltar do Android.
 */
export function OverflowMenu({
  label,
  items,
  variant = "default",
}: {
  label: string;
  items: MenuItem[];
  /**
   * default = o ⋯ de sempre; ghost = só o ⋯ cinza, sem fundo nem borda (linhas do Diário e da Despensa), alvo de
   * 44 px; header = o quadrado de 44 px das ações do cabeçalho (o ⋯ da Minha dieta); soft = círculo cinza de 36 px
   * (o ⋯ dos combinados no Hoje).
   */
  variant?: "default" | "ghost" | "header" | "soft";
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const anchor = useRef<View>(null);
  const trigger = useRef<View>(null);
  const refocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  useEffect(
    () => () => {
      if (refocusTimer.current) clearTimeout(refocusTimer.current);
    },
    [],
  );
  /** Leva o leitor de tela de volta ao "⋯", como o menu web faz com o foco do teclado. */
  const focusAnchor = () => {
    try {
      const node = findNodeHandle(trigger.current ?? anchor.current);
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    } catch {
      // Âncora já desmontada (ex.: a ação navegou): o sistema decide o foco.
    }
  };
  const close = () => {
    setPosition(null);
    // No web o Modal do react-native-web já devolve o foco ao elemento anterior.
    if (Platform.OS === "web") return;
    if (refocusTimer.current) clearTimeout(refocusTimer.current);
    refocusTimer.current = setTimeout(focusAnchor, REFOCUS_DELAY_MS);
  };
  const open = () =>
    anchor.current?.measureInWindow((x, y, w, h) => {
      const menuHeight = items.length * ITEM_HEIGHT + MENU_PADDING;
      const below = y + h + MENU_GAP;
      // Perto da borda de baixo (a última linha da Despensa, do Diário), o menu abre acima do "⋯".
      const top = below + menuHeight > height - EDGE ? Math.max(EDGE, y - MENU_GAP - menuHeight) : below;
      setPosition({ top, right: Math.max(EDGE, width - (x + w)) });
    });
  return (
    <>
      <View ref={anchor} collapsable={false}>
        <IconButton
          ref={trigger}
          icon={MoreHorizontal}
          variant={variant}
          accessibilityLabel={label}
          active={!!position}
          expanded={!!position}
          onPress={position ? close : open}
        />
      </View>
      <Modal
        visible={!!position}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Fechar menu"
        />
        {position && (
          <View
            role="menu"
            accessibilityLabel={label}
            style={[styles.menu, position]}
          >
            {items.map(({ label: itemLabel, icon: Icon, disabled = false, onSelect }) => (
              <Pressable
                key={itemLabel}
                role="menuitem"
                accessibilityLabel={itemLabel}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  close();
                  onSelect();
                }}
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.itemPressed,
                  disabled && styles.itemDisabled,
                ]}
              >
                {Icon ? <Icon size={16} color={colors.green700} /> : null}
                <AppText size={fontSize.sm} weight={600} color={colors.text}>
                  {itemLabel}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
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
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  itemPressed: { backgroundColor: colors.surface2 },
  itemDisabled: { opacity: 0.45 },
}));
