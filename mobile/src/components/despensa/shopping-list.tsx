import { ListPlus, PackageCheck, Share2, Trash2, X } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { uid } from "@shared/lib/domain";
import {
  addShoppingItems,
  manualShoppingItem,
  removeShoppingItems,
  restoreShoppingItems,
  SHOPPING_COPY,
  shoppingGroups,
  shoppingShareText,
  shoppingSummary,
  toggleShoppingItem,
  type ShoppingPick,
} from "@shared/lib/shopping-list";
import { visiblePlainText } from "@shared/lib/text";
import type { ShoppingItem, ToastAction } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Empty, IconButton, OverflowMenu, SheetNotice, TextField, useSheetNotice } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { useSafeCommit } from "./safe-commit";
import { CheckBox, ShoppingSuggestSheet } from "./shopping-suggest-sheet";

/** Alvo real das linhas (o web ignora hitSlop). */
const MIN_TOUCH = 44;

/** A pessoa fechou a folha de compartilhar do sistema (no web, navigator.share rejeita com AbortError). */
const isCancel = (error: unknown) => error instanceof Error && error.name === "AbortError";

type RowProps = {
  item: ShoppingItem;
  hide: boolean;
  onToggle: (id: string) => void;
  onRemove: (item: ShoppingItem) => void;
};

/**
 * Uma linha da lista. Com memo e callbacks estáveis, marcar um item (ou qualquer outra gravação na
 * Despensa) redesenha só a linha que mudou, não as até 200 caixas animadas.
 */
const ShoppingRow = memo(function ShoppingRow({ item, hide, onToggle, onRemove }: RowProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const name = visiblePlainText(item.name, hide);
  const meta = [item.quantity ? visiblePlainText(item.quantity, hide) : "", item.note ? visiblePlainText(item.note, hide) : ""]
    .filter(Boolean)
    .join(" · ");
  const metaId = `shop-meta-${item.id}`;
  // O nome cobre o conteúdo da linha: quantidade e observação chegam como descrição (aria-describedby no
  // web, que o aparelho ignora; lá, a dica do leitor de tela).
  return (
    <View role="listitem" testID="shopping-row" style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={name}
        accessibilityHint={meta || undefined}
        accessibilityState={{ checked: item.checked }}
        {...webAttrs({ "aria-checked": item.checked })}
        {...(meta ? { "aria-describedby": metaId } : {})}
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [styles.check, pressed && styles.pressed]}
      >
        <CheckBox checked={item.checked} />
        <View style={styles.rowText}>
          <AppText
            size={fontSize.sm}
            weight={600}
            color={item.checked ? colors.muted : colors.text}
            style={item.checked ? styles.done : undefined}
          >
            {name}
          </AppText>
          {meta ? (
            <AppText nativeID={metaId} size={fontSize.xs} color={colors.muted}>
              {meta}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <IconButton icon={X} variant="small" accessibilityLabel={`Remover ${name} da lista`} onPress={() => onRemove(item)} />
    </View>
  );
});

type Props = {
  /** Durante uma ação da Despensa ou com a revisão aberta, "Guardar comprados" fica desligado. */
  isLocked: boolean;
  /** Leva os marcados para a revisão da despensa (nada é salvo sem "Confirmar e salvar itens"). */
  onStore: () => void;
};

/**
 * Lista de compras (AGENTE-08), na folha "Lista de compras" da Despensa (conceito 06; o título é o da folha): por
 * seção do mercado, marcar comprado, remover com "Desfazer", incluir à mão, compartilhar os pendentes em texto e
 * guardar os comprados na despensa depois da revisão. "Adicionar sugestões" abre a própria folha por cima (aninhada,
 * como o iOS exige). Fica só no aparelho.
 */
export function ShoppingList({ isLocked, onStore }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, notify } = useApp();
  const safeCommit = useSafeCommit();
  const [draft, setDraft] = useState("");
  const [isSuggesting, setSuggesting] = useState(false);
  const onSuggest = () => setSuggesting(true);
  // A lista mora numa folha: os avisos (com "Desfazer") aparecem nela, não no aviso coberto da janela principal.
  const sheetNotice = useSheetNotice(notify);
  const { show: showNotice, showLocal } = sheetNotice;
  const inSheet = useMemo(
    () => ({
      onSuccess: (message: string, action?: ToastAction) => showLocal(message, "success", action),
      onRefuse: (text: string) => showNotice(text, "warning"),
    }),
    [showLocal, showNotice],
  );
  const hide = state.profile?.hideCalories ?? true;
  const list = state.shoppingList;
  const summary = shoppingSummary(list);
  const pending = list.length - summary.checked;
  const toggle = useCallback(
    (id: string) => {
      selectionHaptic();
      void commit((s) => toggleShoppingItem(s, id));
    },
    [commit],
  );
  /** Tira os itens da lista; "Desfazer" devolve exatamente os que saíram, na ordem de inclusão. */
  const removeItems = useCallback(
    (ids: readonly string[], message: string) => {
      const removed = { items: [] as ShoppingItem[] };
      void safeCommit(
        (s) => {
          removed.items = s.shoppingList.filter((item) => ids.includes(item.id));
          return removeShoppingItems(s, ids);
        },
        message,
        { label: "Desfazer", onAction: () => void safeCommit((s) => restoreShoppingItems(s, removed.items)) },
        inSheet,
      );
    },
    [safeCommit, inSheet],
  );
  const removeRow = useCallback(
    (item: ShoppingItem) => removeItems([item.id], SHOPPING_COPY.removed(visiblePlainText(item.name, hide))),
    [removeItems, hide],
  );
  const addManual = async () => {
    let pick: ShoppingPick;
    try {
      pick = manualShoppingItem(draft);
    } catch (error) {
      showNotice((error as Error).message, "warning");
      return;
    }
    const ids: string[] = [];
    const saved = await safeCommit(
      (s) => {
        ids.length = 0;
        return addShoppingItems(s, [pick], new Date().toISOString(), () => {
          const id = uid();
          ids.push(id);
          return id;
        });
      },
      SHOPPING_COPY.added(1),
      { label: "Desfazer", onAction: () => void safeCommit((s) => removeShoppingItems(s, ids)) },
      inSheet,
    );
    if (saved) setDraft("");
  };
  const share = async () => {
    const text = shoppingShareText(list, hide);
    if (!text) return;
    try {
      await Share.share({ title: SHOPPING_COPY.title, message: text });
    } catch (error) {
      if (isCancel(error)) return;
      showNotice(SHOPPING_COPY.shareFail, "warning");
    }
  };
  const checkedIds = list.filter((item) => item.checked).map((item) => item.id);
  return (
    <View testID="shopping-list" style={styles.root}>
      <View style={styles.head}>
        <AppText size={fontSize.sm} color={colors.muted} testID="shopping-summary" style={styles.headCopy}>
          {summary.text}
        </AppText>
        <View style={styles.headActions}>
          <Button
            label={SHOPPING_COPY.share}
            accessibilityLabel={SHOPPING_COPY.shareLabel}
            icon={Share2}
            variant="secondary"
            size="sm"
            disabled={!pending}
            onPress={() => void share()}
          />
          <OverflowMenu
            label="Mais opções da lista"
            items={[
              { label: "Adicionar sugestões", icon: ListPlus, onSelect: onSuggest },
              {
                label: "Remover comprados",
                icon: Trash2,
                disabled: !checkedIds.length,
                onSelect: () => removeItems(checkedIds, SHOPPING_COPY.removedChecked(checkedIds.length)),
              },
            ]}
          />
        </View>
      </View>
      <SheetNotice notice={sheetNotice.notice} onDismiss={sheetNotice.clear} />
      {list.length ? (
        shoppingGroups(list).map((group) => (
          <View key={group.section} style={styles.group}>
            <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
              {group.label}
            </AppText>
            <View role="list" aria-label={group.label} style={styles.rows}>
              {group.items.map((item) => (
                <ShoppingRow key={item.id} item={item} hide={hide} onToggle={toggle} onRemove={removeRow} />
              ))}
            </View>
          </View>
        ))
      ) : (
        <Empty art="pantry" action={{ label: SHOPPING_COPY.build, onPress: onSuggest }}>
          {SHOPPING_COPY.empty}
        </Empty>
      )}
      <View style={styles.manual}>
        <TextField
          accessibilityLabel={SHOPPING_COPY.manualLabel}
          placeholder={SHOPPING_COPY.manualLabel}
          value={draft}
          maxLength={120}
          returnKeyType="done"
          onChangeText={setDraft}
          onSubmitEditing={() => void addManual()}
          style={styles.grow}
        />
        <Button label={SHOPPING_COPY.manualAdd} variant="secondary" onPress={() => void addManual()} />
      </View>
      {list.length ? (
        <Button label={SHOPPING_COPY.store} icon={PackageCheck} wide disabled={!summary.checked || isLocked} onPress={onStore} />
      ) : null}
      <ShoppingSuggestSheet visible={isSuggesting} onClose={() => setSuggesting(false)} onSuccess={inSheet.onSuccess} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  headCopy: { flexShrink: 1 },
  headActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  group: { gap: 4 },
  rows: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  check: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  pressed: { backgroundColor: colors.pressedInk },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  done: { textDecorationLine: "line-through" },
  manual: { flexDirection: "row", alignItems: "center", gap: 8 },
  grow: { flex: 1, width: "auto", minWidth: 0 },
}));
