import { Camera, ShoppingBasket, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { plural } from "@shared/lib/format";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";

type ShortcutProps = {
  icon: LucideIcon;
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  children?: ReactNode;
};

/** Abaixo disto o texto quebra em duas linhas em vez de ser cortado (como o web a 359 px). */
const NARROW = 360;

function Shortcut({ icon: Icon, label, accessibilityLabel, disabled = false, onPress, children }: ShortcutProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View>
        <Icon size={20} color={colors.green700} />
      </View>
      <AppText heading size={fontSize.sm} weight={700} lineHeight={16} numberOfLines={width < NARROW ? 2 : 1} style={styles.text}>
        {label}
      </AppText>
      {children}
    </Pressable>
  );
}

/**
 * Dois atalhos logo abaixo do "Use primeiro" (conceito 06): a lista de compras (numa folha, com o que falta comprar
 * no selo) e "Adicionar foto" (abre a galeria; a foto cai na folha de adicionar). Cada um na largura do conteúdo.
 */
export function PantryShortcuts({
  pending,
  isPhotoDisabled,
  onShopping,
  onPhoto,
}: {
  /** Itens da lista ainda não comprados. */
  pending: number;
  isPhotoDisabled: boolean;
  onShopping: () => void;
  onPhoto: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const shoppingLabel = pending > 0 ? `Lista de compras, ${plural(pending, "item a comprar", "itens a comprar")}` : "Lista de compras";
  return (
    <View style={styles.row}>
      <Shortcut icon={ShoppingBasket} label="Lista de compras" accessibilityLabel={shoppingLabel} onPress={onShopping}>
        {pending > 0 ? (
          <View style={styles.badge} aria-hidden importantForAccessibility="no-hide-descendants">
            <AppText size={fontSize.xs} weight={800} color={colors.white} lineHeight={16}>
              {String(pending)}
            </AppText>
          </View>
        ) : null}
      </Shortcut>
      <Shortcut icon={Camera} label="Adicionar foto" accessibilityLabel="Adicionar foto" disabled={isPhotoDisabled} onPress={onPhoto} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", gap: 12 },
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  text: { flexShrink: 1, minWidth: 0 },
  badge: {
    minWidth: 22,
    height: 22,
    marginLeft: "auto",
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentFill,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
}));
