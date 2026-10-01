import { Pencil, Trash2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import { expiryStatus } from "@shared/lib/pantry";
import { expiryPill, fmtPantryQuantity, pantryEmoji } from "@shared/lib/pantry-view";
import { visiblePlainText } from "@shared/lib/text";
import type { PantryItem } from "@shared/types";
import { AppText, OverflowMenu } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ExpiryPill } from "./expiry-pill";
import { focusWithin, ROW_MENU_SELECTOR } from "./focus";

/** Emoji, texto e "⋯" numa linha de 48 px (o conceito 06). */
const GLYPH = 38;
/** Abaixo disto a pílula fica ao lado da quantidade e o nome ganha a largura toda (como o web a 359 px). */
const NARROW = 360;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** "Atualizar" / "Remover" da linha vencida: 28 px à vista, alvo de 44 px (margens negativas, sem crescer a linha). */
function RowAction({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.actionTarget}
    >
      {({ pressed }) => (
        <View style={[styles.action, pressed && styles.actionPressed, disabled && styles.disabled]}>
          <AppText size={fontSize.sm} weight={700}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

type Props = {
  item: PantryItem;
  hide: boolean;
  today: string;
  /** Editar e Remover ficam indisponíveis durante uma ação ou com a revisão aberta. */
  isLocked: boolean;
  /** Última linha do local: sem o fio de baixo. */
  isLast: boolean;
  onEdit: (item: PantryItem) => void;
  onRemove: (item: PantryItem) => void;
  /** Registra como levar o foco a esta linha (o "⋯" no web; o texto no leitor de tela do aparelho). */
  onRegister: (id: string, focus: (() => boolean) | null) => void;
};

/**
 * Linha do inventário (conceito 06): emoji, nome, quantidade e a pílula da validade à direita; o local vem do grupo.
 * Vencido: pílula rosa ("Venceu ontem — não usado nas receitas" para o leitor de tela) e "Ainda está bom?" com
 * Atualizar / Remover. Editar e Remover também no "⋯" discreto.
 */
export function PantryRow({ item, hide, today, isLocked, isLast, onEdit, onRemove, onRegister }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const row = useRef<View>(null);
  const text = useRef<View>(null);
  useEffect(() => {
    onRegister(item.id, () =>
      Platform.OS === "web" ? focusWithin(row.current, ROW_MENU_SELECTOR) : focusWithin(text.current),
    );
    return () => onRegister(item.id, null);
  }, [item.id, onRegister]);
  const { width } = useWindowDimensions();
  const isNarrow = width < NARROW;
  const name = visiblePlainText(item.name, hide);
  const pill = item.expiresOn ? expiryPill(item.expiresOn, today) : null;
  const isExpired = pill?.tone === "expired";
  const pillView = pill ? (
    isExpired ? (
      <ExpiryPill pill={pill} testID="pantry-expired-pill" label={expiryStatus(item.expiresOn!, today).label} />
    ) : (
      <ExpiryPill pill={pill} />
    )
  ) : null;
  const quantity = (
    <AppText size={fontSize.sm} color={colors.muted} lineHeight={18} numberOfLines={1} style={styles.quantity}>
      {fmtPantryQuantity(item.quantity, item.unit)}
    </AppText>
  );
  return (
    <View ref={row} role="listitem" testID="pantry-row" style={[styles.row, isLast && styles.last]}>
      <View style={styles.line}>
        <View style={styles.glyph} {...HIDDEN}>
          <AppText size={fontSize.xl} lineHeight={24} maxFontSizeMultiplier={1}>
            {pantryEmoji(item.name)}
          </AppText>
        </View>
        <View ref={text} accessible={Platform.OS !== "web"} style={styles.text}>
          <AppText size={fontSize.md} weight={600} lineHeight={20} numberOfLines={1} accessibilityRole="header">
            {name}
          </AppText>
          {isNarrow && pillView ? (
            <View style={styles.sub}>
              {quantity}
              {pillView}
            </View>
          ) : (
            quantity
          )}
        </View>
        {isNarrow ? null : pillView}
        <View style={styles.menu}>
          <OverflowMenu
            label={`Mais ações: ${name}`}
            variant="ghost"
            items={[
              { label: "Editar", icon: Pencil, disabled: isLocked, onSelect: () => onEdit(item) },
              { label: "Remover", icon: Trash2, disabled: isLocked, onSelect: () => onRemove(item) },
            ]}
          />
        </View>
      </View>
      {isExpired ? (
        <View style={styles.check} testID="pantry-expired-meta">
          <AppText size={fontSize.sm} color={colors.muted} style={styles.ask}>
            Ainda está bom?
          </AppText>
          <RowAction label="Atualizar" accessibilityLabel={`Atualizar ${name}`} disabled={isLocked} onPress={() => onEdit(item)} />
          <RowAction label="Remover" accessibilityLabel={`Remover ${name}`} disabled={isLocked} onPress={() => onRemove(item)} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    gap: 6,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  last: { borderBottomWidth: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: GLYPH },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  sub: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 },
  quantity: { flexShrink: 1 },
  /** O "⋯" de 44 px ocupa 38 × 36 na linha (o alvo passa 3 px acima e abaixo e 4 para cada lado), como no web. */
  menu: { marginVertical: -3, marginHorizontal: -4 },
  check: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 6,
    rowGap: 4,
    marginLeft: GLYPH + 12,
    marginBottom: 2,
  },
  ask: { marginRight: "auto" },
  actionTarget: { minHeight: 44, marginVertical: -8, justifyContent: "center" },
  action: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: { backgroundColor: colors.surface3 },
  disabled: { opacity: 0.45 },
}));
