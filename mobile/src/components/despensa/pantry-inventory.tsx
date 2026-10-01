import { Package, Refrigerator } from "lucide-react-native";
import { useCallback, useRef } from "react";
import { View } from "react-native";
import { plural } from "@shared/lib/format";
import {
  groupByLocation,
  PANTRY_EMPTY_TEXT,
  PANTRY_FILTER_EMPTY_TEXT,
  type PantrySort,
} from "@shared/lib/pantry-view";
import type { PantryItem } from "@shared/types";
import { AppText, Empty, IconTile, SearchField } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { AFTER_MENU_MS, focusWithin } from "./focus";
import { PantryRow } from "./pantry-row";
import { SortMenu } from "./sort-menu";

const GROUP_ICON = {
  geladeira: { icon: Refrigerator, tone: "water" },
  despensa: { icon: Package, tone: "warn" },
} as const;

type Props = {
  items: PantryItem[];
  hide: boolean;
  today: string;
  isLocked: boolean;
  sort: PantrySort;
  onSort: (sort: PantrySort) => void;
  /** A busca abre pela lupa do cabeçalho; fechada, o campo não aparece. */
  isSearching: boolean;
  search: string;
  onSearch: (search: string) => void;
  /** Fecha a busca (limpa o texto). */
  onCloseSearch: () => void;
  onEdit: (item: PantryItem) => void;
  /** Remove (com "Desfazer" no aviso); resolve true quando gravou. */
  onRemove: (item: PantryItem) => Promise<boolean>;
};

/** Meus alimentos (conceito 06): um cartão por local, vencidos no topo, ordem por validade ou nome. */
export function PantryInventory({ items, hide, today, isLocked, sort, onSort, isSearching, search, onSearch, onCloseSearch, onEdit, onRemove }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const title = useRef<View>(null);
  const rows = useRef(new Map<string, () => boolean>());
  const register = useCallback((id: string, focus: (() => boolean) | null) => {
    if (focus) rows.current.set(id, focus);
    else rows.current.delete(id);
  }, []);
  const groups = groupByLocation(items, sort, today, isSearching ? search : "");
  /** Depois de remover: o "⋯" da linha que ocupa a mesma posição, senão o da anterior, senão o título. */
  const remove = async (item: PantryItem, list: PantryItem[], index: number) => {
    if (!(await onRemove(item))) return;
    const candidates = [list[index + 1], list[index - 1]].filter((i): i is PantryItem => !!i);
    setTimeout(() => {
      for (const next of candidates) if (rows.current.get(next.id)?.()) return;
      focusWithin(title.current, '[role="heading"]');
    }, AFTER_MENU_MS);
  };
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View ref={title} accessible accessibilityRole="header" tabIndex={-1}>
          <AppText heading size={fontSize.lg} weight={800}>
            Meus alimentos
          </AppText>
        </View>
        {items.length > 0 ? (
          <AppText size={fontSize.sm} color={colors.muted} style={styles.count}>
            {plural(items.length, "item", "itens")}
          </AppText>
        ) : null}
      </View>
      {isSearching ? (
        <SearchField
          label="Buscar nos meus alimentos"
          placeholder="Ex.: arroz, tomate…"
          value={search}
          onChange={onSearch}
          onClear={onCloseSearch}
          autoFocus
        />
      ) : null}
      {!items.length ? (
        <Empty art="pantry">{PANTRY_EMPTY_TEXT}</Empty>
      ) : !groups.length ? (
        <Empty art="search" action={{ label: "Limpar busca", onPress: onCloseSearch }}>
          {PANTRY_FILTER_EMPTY_TEXT}
        </Empty>
      ) : (
        groups.map((group, g) => {
          const { icon, tone } = GROUP_ICON[group.location];
          return (
            <View key={group.location} testID={`pantry-group-${group.location}`} style={styles.group}>
              <View style={styles.groupHead}>
                <IconTile icon={icon} tone={tone} size="md" style={styles.groupTile} />
                <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
                  {group.label}
                </AppText>
                <View style={styles.groupCount} aria-hidden importantForAccessibility="no-hide-descendants">
                  <AppText size={fontSize.xs} weight={700} color={colors.muted} lineHeight={16}>
                    {String(group.items.length)}
                  </AppText>
                </View>
                {g === 0 ? <SortMenu value={sort} onChange={onSort} /> : null}
              </View>
              <View role="list" accessibilityLabel={group.label}>
                {group.items.map((item, index) => (
                  <PantryRow
                    key={item.id}
                    item={item}
                    hide={hide}
                    today={today}
                    isLocked={isLocked}
                    isLast={index === group.items.length - 1}
                    onEdit={onEdit}
                    onRemove={(i) => void remove(i, group.items, index)}
                    onRegister={register}
                  />
                ))}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 14 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { fontVariant: ["tabular-nums"] },
  group: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  groupTile: { width: 28, height: 28, borderRadius: 9 },
  groupCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
}));
