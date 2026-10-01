import { Check } from "lucide-react-native";
import { useEffect, useId, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { isDietPlanStale } from "@shared/lib/diet";
import { planAnchor } from "@shared/lib/diet-week";
import { localDate, uid } from "@shared/lib/domain";
import {
  addShoppingItems,
  dietShoppingSuggestions,
  mergeSuggestions,
  recipeShoppingSuggestions,
  removeShoppingItems,
  SECTION_LABEL,
  SHOPPING_COPY,
  type ShoppingSuggestion,
} from "@shared/lib/shopping-list";
import { SHOPPING_SECTIONS, type ToastAction } from "@shared/types";
import { useStructuredPlan } from "@/components/dieta/use-planned-meal";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Sheet, SheetNotice, TagPill, useSheetNotice } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { useSafeCommit } from "./safe-commit";

/** Alvo real das linhas com caixa de marcação (o web ignora hitSlop). */
const MIN_TOUCH = 44;
/** Traço do "✓" ao marcar (0 com movimento reduzido). */
const CHECK_MS = 240;

/** Caixa de marcação desenhada; o "✓" aparece com um traço curto (sem animação em movimento reduzido). */
export function CheckBox({ checked }: { checked: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isReduced = useReducedMotion();
  const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    progress.value = isReduced ? (checked ? 1 : 0) : withTiming(checked ? 1 : 0, { duration: CHECK_MS });
  }, [checked, isReduced, progress]);
  const mark = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + 0.4 * progress.value }],
  }));
  return (
    <View style={[styles.box, checked && styles.boxOn]} aria-hidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={mark}>
        <Check size={15} strokeWidth={3} color={colors.white} />
      </Animated.View>
    </View>
  );
}

/**
 * Uma sugestão com caixa de marcação: nome, de onde veio e "Já tem na despensa". O nome "Incluir X"
 * cobre o conteúdo; quantidade, origem e "Já tem na despensa" (o porquê de vir desmarcada) chegam ao
 * leitor de tela como descrição: aria-describedby no web, dica (accessibilityHint) no aparelho.
 */
function SuggestionRow({ item, checked, onToggle }: { item: ShoppingSuggestion; checked: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const baseId = useId();
  const meta = [item.quantity, item.note].filter(Boolean).join(" · ");
  const metaId = `${baseId}-meta`;
  const pantryId = `${baseId}-pantry`;
  const describedBy = [meta ? metaId : "", item.inPantry ? pantryId : ""].filter(Boolean).join(" ");
  const hint = [meta, item.inPantry ? SHOPPING_COPY.inPantry : ""].filter(Boolean).join(". ");
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Incluir ${item.name}`}
      accessibilityHint={hint || undefined}
      accessibilityState={{ checked }}
      {...webAttrs({ "aria-checked": checked })}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      testID="shopping-suggestion"
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <CheckBox checked={checked} />
      <View style={styles.rowText}>
        <AppText size={fontSize.sm} weight={600}>
          {item.name}
        </AppText>
        {meta ? (
          <AppText nativeID={metaId} size={fontSize.xs} color={colors.muted}>
            {meta}
          </AppText>
        ) : null}
        {item.inPantry ? (
          <View nativeID={pantryId} style={styles.tag}>
            <TagPill label={SHOPPING_COPY.inPantry} tone="neutral" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Só estas sugestões (o "+ Lista" de uma receita); o retrato é tirado quando a folha abre. */
  preset?: readonly ShoppingSuggestion[];
  /** Aberta sobre outra folha (a lista de compras): o aviso "N itens incluídos" com "Desfazer" vai para ela. */
  onSuccess?: (message: string, action?: ToastAction) => void;
};

/**
 * "Montar lista de compras" (AGENTE-08), na Dieta e na Despensa: o plano dos próximos 7 dias (com a
 * rotação das trocas revisadas) e o "Falta comprar" das receitas atuais, por seção do mercado. O que
 * já está na despensa vem desmarcado; alergênicos, básicos marcados e o que já está na lista ficam
 * de fora. Nada entra na lista sem "Adicionar"; o aviso traz "Desfazer". Cada abertura monta a folha
 * de novo (chave nova, como a MeasurementSheet): marcações e aviso já nascem certos no primeiro quadro.
 */
export function ShoppingSuggestSheet({ visible, onClose, preset, onSuccess }: Props) {
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }
  return <SuggestSheetBody key={session} visible={visible} onClose={onClose} preset={preset} onSuccess={onSuccess} />;
}

function SuggestSheetBody({ visible, onClose, preset, onSuccess }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, clock, notify } = useApp();
  const safeCommit = useSafeCommit();
  // A recusa (limite de 200 itens) aparece dentro da folha, que continua aberta.
  const sheetNotice = useSheetNotice(notify);
  const view = useStructuredPlan();
  const profile = state.profile;
  const hide = profile?.hideCalories ?? true;
  const today = localDate(clock);
  const plan = state.dietPlan;
  const isCurrent = !!plan && !!profile && !isDietPlanStale(plan, profile);
  // O retrato do "+ Lista": a lista não se rearruma enquanto a pessoa marca.
  const [snapshot] = useState(() => (visible && preset ? [...preset] : null));
  const suggestions = useMemo(() => {
    if (!visible) return [];
    if (snapshot) return snapshot;
    const diet =
      view && plan && isCurrent
        ? dietShoppingSuggestions(view, {
            anchor: planAnchor(plan.createdAt),
            from: today,
            allergyDetails: profile?.allergyDetails ?? "",
            pantry: state.pantry,
            basics: state.kitchenBasics,
            today,
          })
        : [];
    return mergeSuggestions(state.shoppingList, [diet, recipeShoppingSuggestions(state, today, hide)]);
  }, [visible, snapshot, view, plan, isCurrent, today, profile?.allergyDetails, state, hide]);
  // Cada abertura começa com as marcações sugeridas (o que já está na despensa vem desmarcado).
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(suggestions.filter((s) => s.defaultChecked).map((s) => s.key)),
  );
  const chosen = suggestions.filter((s) => picked.has(s.key));
  const toggle = (key: string) => {
    selectionHaptic();
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const add = async () => {
    if (!chosen.length) return;
    const ids: string[] = [];
    const picks = chosen.map(({ name, quantity, section, origin, note }) => ({ name, quantity, section, origin, note }));
    const saved = await safeCommit(
      (s) => {
        ids.length = 0;
        return addShoppingItems(s, picks, new Date().toISOString(), () => {
          const id = uid();
          ids.push(id);
          return id;
        });
      },
      SHOPPING_COPY.added(picks.length),
      { label: "Desfazer", onAction: () => void safeCommit((s) => removeShoppingItems(s, ids)) },
      { onRefuse: (text) => sheetNotice.show(text, "warning"), onSuccess },
    );
    if (saved) onClose();
  };
  const groups = SHOPPING_SECTIONS.flatMap((section) => {
    const items = suggestions.filter((s) => s.section === section);
    return items.length ? [{ section, items }] : [];
  });
  // Sem sugestões, só o "Fechar" do painel.
  const footer = suggestions.length ? (
    <View style={styles.footerStack}>
      <SheetNotice notice={sheetNotice.notice} />
      <View style={styles.footer}>
        <Button label={SHOPPING_COPY.add(chosen.length)} disabled={!chosen.length} onPress={() => void add()} style={styles.grow} />
        <Button label="Cancelar" variant="secondary" onPress={onClose} />
      </View>
    </View>
  ) : undefined;
  return (
    <Sheet visible={visible} title={SHOPPING_COPY.sheet} onClose={onClose} footer={footer}>
      <View testID="shopping-suggest" style={styles.content}>
        {groups.length ? (
          groups.map(({ section, items }) => (
            <View key={section} style={styles.group}>
              <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
                {SECTION_LABEL[section]}
              </AppText>
              <View style={styles.rows}>
                {items.map((item) => (
                  <SuggestionRow key={item.key} item={item} checked={picked.has(item.key)} onToggle={() => toggle(item.key)} />
                ))}
              </View>
            </View>
          ))
        ) : (
          <AppText size={fontSize.sm} color={colors.muted}>
            {SHOPPING_COPY.none}
          </AppText>
        )}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { gap: 16 },
  group: { gap: 6 },
  rows: { gap: 2 },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  pressed: { backgroundColor: colors.pressedInk },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  tag: { alignSelf: "flex-start", marginTop: 2 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate300,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.green600, borderColor: colors.green600 },
  footerStack: { gap: 10 },
  footer: { flexDirection: "row", gap: 8, alignItems: "center" },
  grow: { flex: 1 },
}));
