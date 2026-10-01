import { useRouter } from "expo-router";
import { History } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import foodsJson from "@shared/data/foods.json";
import { localDate, localTime, uid } from "@shared/lib/domain";
import { ALL_CATEGORIES, categoriesIn, filterByCategory } from "@shared/lib/food-categories";
import { friendlyName, isTacoFood, searchFoods, type FoodGroup } from "@shared/lib/food-search";
import { fmtNumber, fmtRelDate, plural } from "@shared/lib/format";
import { defaultPortion, inferUnit, measureById, type PortionUnit } from "@shared/lib/household-measures";
import {
  addMealItem,
  cloneMealItems,
  defaultMealCategory,
  dishesFrom,
  frequentFoods,
  mealDraftFrom,
  mealEntry,
  mergeMealItems,
  recentMeals,
  saveMealFavorite,
  MAX_SAVED_MEALS,
  type Dish,
  type MealEntryProblem,
} from "@shared/lib/meals";
import { maskStructured } from "@shared/lib/structured";
import { visiblePlainText } from "@shared/lib/text";
import type { FoodItem, MealItem } from "@shared/types";
import { Screen } from "@/components/layout/screen";
import { CaptureTiles, PhotoCard } from "@/components/refeicao/capture-tiles";
import { CategoryChips } from "@/components/refeicao/category-chips";
import { useBusy, useKeyboardOpen } from "@/components/refeicao/composer-hooks";
import { DishCards } from "@/components/refeicao/dish-cards";
import { FavoriteForm } from "@/components/refeicao/favorite-form";
import { FoodRow } from "@/components/refeicao/food-row";
import { FoodSection, SectionTitle, TacoHead } from "@/components/refeicao/food-section";
import { MergeSheet, TacoInfoSheet } from "@/components/refeicao/info-sheets";
import { LabelFoodSheet } from "@/components/refeicao/label-food-sheet";
import { MealPill } from "@/components/refeicao/meal-pill";
import { MealSearch, type Announcement } from "@/components/refeicao/meal-search";
import { MealTextSheet } from "@/components/refeicao/meal-text-sheet";
import { MealTray } from "@/components/refeicao/meal-tray";
import { useMealText, type PlatePortion } from "@/components/refeicao/use-meal-text";
import { usePhotoAnalysis } from "@/components/refeicao/use-photo-analysis";
import { AppText, Button, Empty, IconButton, Notice, Sheet } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const TACO_FOODS = foodsJson as FoodItem[];
const TACO_PAGE = 20;
const FREQUENT_IN_SEARCH = 5;
const MINE_WHEN_IDLE = 6;
const BOOST_POOL = 50;
/** A contagem de resultados é anunciada depois de uma pausa na digitação. */
const ANNOUNCE_DELAY_MS = 600;
/** Espaço entre a bandeja e o aviso ("Desfazer") que aparece acima dela. */
const TOAST_GAP = 16;
/** Folga acima do título do prato ao rolar até ele (a busca fixa fica por cima). */
const PLATE_SCROLL_MARGIN = 4;
const LOADED_MESSAGE = "Itens no prato. Confira as porções e toque em Salvar refeição.";
const PARTIAL_HINT =
  "Nenhum alimento tem todas essas palavras. Estes têm parte delas: adicione um de cada vez.";
const MINE_TITLE = "Seus alimentos cadastrados";
/** Alimento que representa o grupo no filtro de categoria. */
const groupFood = (group: FoodGroup) => group.selected;
const UNDO_GONE =
  "Não dá mais para desfazer depois de sair da tela. Se quiser, adicione o alimento de novo.";
const PROBLEM_MESSAGES: Record<MealEntryProblem, string> = {
  items: "Confira as porções: cada alimento precisa ter mais de 0 g.",
  future: "A data da refeição não pode estar no futuro.",
  when: "Não foi possível salvar. Confira a data, o horário e os itens.",
};

const unitsFor = (items: readonly MealItem[]): Record<string, PortionUnit> =>
  Object.fromEntries(items.map((i) => [i.food.id, inferUnit(i.food, i.grams)]));

/**
 * Registrar refeição. A tela é recriada quando a refeição em edição muda ou chega um atalho novo
 * ("+ Jantar", "Foto do prato"): abrir uma refeição nova enquanto outra está em edição começa do
 * prato vazio (como o key do web).
 */
export function RefeicaoScreen() {
  const { editingMeal, mealPreset } = useApp();
  return <MealComposer key={editingMeal?.id ?? mealPreset?.id ?? "nova"} />;
}

/**
 * Registrar refeição com a busca primeiro: tipo, data e hora numa pílula; foto e rótulo como
 * atalhos; "Seus pratos" para repetir; busca com nomes amigáveis, preparos e medidas caseiras;
 * e a bandeja fixa com o total e o botão de salvar.
 */
function MealComposer() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, date, setDate, editingMeal, mealPreset, commit, notify, aiReady, aiBusy, setToastBottom } = useApp();
  // Atalhos ("+ Jantar", "Foto do prato") só valem para uma refeição nova.
  const preset = editingMeal ? null : mealPreset;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isKeyboardOpen = useKeyboardOpen();
  const profile = state.profile!;
  const hideCalories = profile.hideCalories;
  const today = localDate();
  // "Conferir e registrar" (plano, chat) já chega com os itens encontrados na TACO e um aviso.
  const [items, setItems] = useState<MealItem[]>(() => cloneMealItems(editingMeal?.items ?? preset?.items ?? []));
  const [units, setUnits] = useState(() => unitsFor(editingMeal?.items ?? preset?.items ?? []));
  const [time, setTime] = useState(() => editingMeal?.time ?? localTime());
  const [category, setCategory] = useState(
    () => editingMeal?.categoryTag ?? preset?.category ?? defaultMealCategory(time, profile),
  );
  const [day, setDay] = useState(editingMeal?.date ?? date);
  // A foto do registro rápido (ou do "+" do chat) já chega reduzida por pickPhoto, com o mesmo limite daqui.
  const { photo, attach: attachPhoto, remove: removePhoto, analysis, analyze } = usePhotoAnalysis({
    initialPhoto: editingMeal?.imageUrl ?? preset?.photo ?? "",
    autoAnalyze: !!preset?.analyze,
  });
  const photoDraft = useMemo(
    () => (analysis?.draft ? maskStructured(analysis.draft, hideCalories, { plain: true }) : null),
    [analysis, hideCalories],
  );
  const presetNote = preset?.note ? visiblePlainText(preset.note, hideCalories) : "";
  const [query, setQuery] = useState("");
  const [categoryKey, setCategoryKey] = useState(ALL_CATEGORIES);
  const [announced, setAnnounced] = useState("");
  // Aviso da tela para o leitor de tela; o contador faz a mesma frase ser anunciada de novo.
  const [announcement, setAnnouncement] = useState<Announcement>(() => ({
    text: presetNote,
    count: presetNote ? 1 : 0,
  }));
  /** Pede o foco em "Seu prato" depois de adicionar os itens da foto. */
  const [plateFocusTick, setPlateFocusTick] = useState(0);
  const [tacoShown, setTacoShown] = useState(TACO_PAGE);
  const [prepChoice, setPrepChoice] = useState<Record<string, string>>({});
  const [isLabelOpen, setLabelOpen] = useState(false);
  const [isTacoInfoOpen, setTacoInfoOpen] = useState(false);
  const [pendingDish, setPendingDish] = useState<Dish | null>(null);
  /** Histórico do cabeçalho: "Seus pratos" num painel, também durante a busca. */
  const [isDishesOpen, setDishesOpen] = useState(false);
  /** Alimento recém-adicionado (ou restaurado) cujo "Aumentar" deve receber o foco. */
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  /** Prato favorito restaurado pelo "Desfazer", cujo cartão recebe o foco. */
  const [focusDishId, setFocusDishId] = useState<string | null>(null);
  const [busy, busyRef, markBusy] = useBusy();
  const [favoriteBusy, favoriteBusyRef, markFavoriteBusy] = useBusy();
  const [error, setError] = useState("");
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [quickStatus, setQuickStatus] = useState(presetNote);
  const [trayHeight, setTrayHeight] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const plateTitle = useRef<View>(null);
  const plateY = useRef<number | null>(null);
  const searchHeight = useRef(0);
  const scrollToPlate = useRef(false);
  const mounted = useRef(false);
  // Valores atuais para ações que terminam depois (desfazer, gravação).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const allFoods = useMemo(() => [...state.foods, ...TACO_FOODS], [state.foods]);
  const frequent = useMemo(() => frequentFoods(state.diary, category, today), [state.diary, category, today]);
  const boost = useMemo(
    () => new Map(frequentFoods(state.diary, category, today, BOOST_POOL).map((f) => [f.food.id, f.count])),
    [state.diary, category, today],
  );
  const results = useMemo(
    () => searchFoods(allFoods, query, { limit: Number.POSITIVE_INFINITY, boost }),
    [allFoods, query, boost],
  );
  const categories = useMemo(() => categoriesIn(results.groups, groupFood), [results.groups]);
  const shownGroups = filterByCategory(results.groups, categoryKey, groupFood);
  const dishes = useMemo(
    () => dishesFrom(state.savedMeals, recentMeals(state.diary), today),
    [state.savedMeals, state.diary, today],
  );
  const trimmed = query.trim();
  // Busca apagada: o filtro volta a "Todos" para a próxima.
  useEffect(() => {
    if (!trimmed) setCategoryKey(ALL_CATEGORIES);
  }, [trimmed]);
  const isTrayShown = items.length > 0 && !isKeyboardOpen;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // "12 resultados" só depois de uma pausa na digitação, para o leitor de tela não repetir a cada letra.
  useEffect(() => {
    const timer = setTimeout(
      () => setAnnounced(trimmed ? plural(shownGroups.length, "resultado", "resultados") : ""),
      ANNOUNCE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [trimmed, shownGroups.length]);
  // O aviso ("Desfazer") aparece acima da bandeja, sem cobrir "Ver prato" nem o salvar.
  useEffect(() => {
    if (!isTrayShown || !trayHeight) return;
    setToastBottom(trayHeight + TOAST_GAP + insets.bottom);
    return () => setToastBottom(null);
  }, [isTrayShown, trayHeight, insets.bottom, setToastBottom]);

  const itemOf = (id: string) => items.find((i) => i.food.id === id);
  const unitOf = (item: MealItem) => units[item.food.id] ?? inferUnit(item.food, item.grams);
  const clearPendingFocus = useCallback(() => setPendingFocus(null), []);
  const clearDishFocus = useCallback(() => setFocusDishId(null), []);
  /** O prato mudou: some o aviso de "carregado" e o erro antigo de salvar. */
  const plateChanged = () => {
    setError("");
    setQuickStatus("");
  };

  const add = (food: FoodItem, grams: number, unit: PortionUnit) => {
    const existing = itemOf(food.id);
    setItems((current) => addMealItem(current, food, grams));
    setUnits((current) => ({ ...current, [food.id]: existing ? unitOf(existing) : unit }));
    setPendingFocus(food.id);
    plateChanged();
    selectionHaptic();
  };
  const change = (food: FoodItem, grams: number, unit: PortionUnit) => {
    setItems((current) => current.map((i) => (i.food.id === food.id ? { ...i, grams } : i)));
    setUnits((current) => ({ ...current, [food.id]: unit }));
    mealText.clearPending(food.id);
    plateChanged();
  };
  const remove = (food: FoodItem) => {
    const index = items.findIndex((i) => i.food.id === food.id);
    const removed = items[index];
    if (!removed) return;
    const removedUnit = unitOf(removed);
    mealText.clearPending(food.id);
    setItems((current) => current.filter((i) => i.food.id !== food.id));
    plateChanged();
    notify(`Item removido do prato: ${friendlyName(food.name).label}.`, "info", {
      label: "Desfazer",
      onAction: () => {
        // O prato vive só nesta tela: depois de sair dela, não há o que restaurar. O aviso sai
        // depois que o atual fecha (o toque em "Desfazer" fecha o aviso logo em seguida).
        if (!mounted.current) {
          setTimeout(() => notify(UNDO_GONE, "info"), 0);
          return;
        }
        // Já foi adicionado de novo: nada a restaurar (e a medida escolhida fica).
        if (itemsRef.current.some((i) => i.food.id === food.id)) return;
        setItems((current) => [...current.slice(0, index), removed, ...current.slice(index)]);
        setUnits((current) => ({ ...current, [food.id]: removedUnit }));
        setPendingFocus(food.id);
      },
    });
  };

  /**
   * Troca o preparo de um item da bandeja (cozido ↔ cru) mantendo os gramas; a medida continua quando o novo
   * preparo também a tem (senão, a medida que combina com os gramas).
   */
  const swapPrep = (from: FoodItem, to: FoodItem) => {
    const current = itemOf(from.id);
    if (!current || from.id === to.id || itemOf(to.id)) return;
    const unit = unitOf(current);
    // Volta ao preparo de antes (cru → cozido): a medida que ele tinha; senão a atual, se o novo preparo a tiver.
    const remembered = units[to.id];
    const fits = (u: PortionUnit | undefined): u is PortionUnit => !!u && (u === "g" || !!measureById(to, u));
    const nextUnit = fits(remembered) ? remembered : fits(unit) ? unit : inferUnit(to, current.grams);
    setItems((list) => list.map((i) => (i.food.id === from.id ? { ...i, food: to } : i)));
    // A medida do preparo que saiu fica guardada para quando ele voltar.
    setUnits((map) => ({ ...map, [from.id]: unit, [to.id]: nextUnit }));
    mealText.clearPending(from.id);
    plateChanged();
  };

  /**
   * Itens dos rascunhos (foto, descrição) entram de uma vez com a porção decidida (os que já
   * estavam no prato mantêm a medida), o aviso é anunciado e o foco vai para "Seu prato".
   */
  const addPortions = (portions: readonly PlatePortion[], message: string) => {
    if (!portions.length) return;
    setItems((current) => portions.reduce((plate, { food, grams }) => addMealItem(plate, food, grams), current));
    setUnits((current) => ({
      ...current,
      ...Object.fromEntries(portions.filter(({ food }) => !itemOf(food.id)).map(({ food, unit }) => [food.id, unit])),
    }));
    setError("");
    setQuickStatus(message);
    setAnnouncement((current) => ({ text: message, count: current.count + 1 }));
    setPendingFocus(null);
    selectionHaptic();
    Keyboard.dismiss();
    // "Seu prato" só existe sem busca; o foco chega quando ele estiver na tela (onLayout ou quadro seguinte).
    scrollToPlate.current = true;
    setQuery("");
    setPlateFocusTick((n) => n + 1);
  };
  /** Foto: todos na medida caseira padrão. */
  const addFromPhoto = (foods: readonly FoodItem[]) =>
    addPortions(
      foods.map((food) => ({ food, ...defaultPortion(food) })),
      foods.length === 1
        ? "1 item adicionado ao prato. Confira a porção."
        : `${foods.length} itens adicionados ao prato. Confira as porções.`,
    );
  const mealText = useMealText(items, addPortions);
  /** "Buscar {item}" dos rascunhos da foto e da descrição: a busca já traz o nome sugerido. */
  const searchFor = (name: string) => {
    mealText.close();
    setQuery(name);
    setTacoShown(TACO_PAGE);
    setPendingFocus(null);
  };

  /** Carrega um prato; a foto anexada é desta refeição e fica, mesmo ao substituir os itens. */
  const load = (dish: Dish, mode: "replace" | "merge") => {
    const draft = mealDraftFrom(dish.source);
    const next = mode === "merge" ? mergeMealItems(items, draft.items) : draft.items;
    setItems(next);
    // Ao juntar, os itens que já estavam no prato mantêm a medida escolhida.
    setUnits(
      Object.fromEntries(
        next.map((i) => {
          const kept = mode === "merge" ? itemOf(i.food.id) : undefined;
          return [i.food.id, kept ? unitOf(kept) : inferUnit(i.food, i.grams)];
        }),
      ),
    );
    setPendingDish(null);
    setQuery("");
    setError("");
    setQuickStatus(LOADED_MESSAGE);
    setAnnouncement((current) => ({ text: LOADED_MESSAGE, count: current.count + 1 }));
  };
  const logNow = async (dish: Dish) => {
    if (busyRef.current) return;
    const id = uid();
    const result = mealEntry({
      id,
      userId: state.userId,
      date: day,
      time,
      category,
      items: cloneMealItems(dish.items),
      now: new Date().toISOString(),
      today,
    });
    if (!result.success) {
      notify(PROBLEM_MESSAGES[result.reason], "warning");
      return;
    }
    markBusy(true);
    let saved = false;
    try {
      saved = await commit(
        (s) => ({ ...s, diary: [...s.diary, result.entry] }),
        `Refeição registrada: ${category}, ${fmtRelDate(day, today)} às ${time}.`,
        {
          label: "Desfazer",
          onAction: () =>
            void commit((s) => ({ ...s, diary: s.diary.filter((d) => d.id !== id) }), "Registro desfeito."),
        },
      );
    } finally {
      markBusy(false);
    }
    if (saved && !itemsRef.current.length && mounted.current) {
      // O diário abre no dia do registro, mesmo quando ele é de outro dia.
      setDate(result.entry.date);
      router.replace("/diario");
    }
  };
  const removeFavorite = async (dish: Dish) => {
    if (favoriteBusyRef.current) return;
    const index = state.savedMeals.findIndex((m) => m.id === dish.id);
    const meal = state.savedMeals[index];
    if (!meal) return;
    markFavoriteBusy(true);
    try {
      await commit((s) => ({ ...s, savedMeals: s.savedMeals.filter((m) => m.id !== meal.id) }), "Favorito removido.", {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              s.savedMeals.some((m) => m.id === meal.id)
                ? s
                : { ...s, savedMeals: [...s.savedMeals.slice(0, index), meal, ...s.savedMeals.slice(index)] },
            "Favorito restaurado.",
          ).then((restored) => {
            if (restored && mounted.current) setFocusDishId(meal.id);
          }),
      });
    } finally {
      markFavoriteBusy(false);
    }
  };
  const favorite = async () => {
    if (favoriteBusyRef.current) return;
    setFavoriteError("");
    markFavoriteBusy(true);
    try {
      const input = { id: uid(), name: favoriteName, categoryTag: category, items };
      saveMealFavorite(state, input);
      if (await commit((s) => saveMealFavorite(s, input), "Prato guardado em Seus pratos. A refeição ainda precisa ser salva."))
        setFavoriteName("");
    } catch (err) {
      setFavoriteError((err as Error).message);
    } finally {
      markFavoriteBusy(false);
    }
  };
  const save = async () => {
    if (busyRef.current) return;
    // Porção não dita na descrição: salva só com o aceite; "Cancelar" leva ao prato para conferir.
    if (!(await mealText.confirmPending())) return showPlate();
    setError("");
    const result = mealEntry({
      id: editingMeal?.id ?? uid(),
      userId: state.userId,
      date: day,
      time,
      category,
      items,
      now: new Date().toISOString(),
      today,
      createdAt: editingMeal?.createdAt,
      imageUrl: photo,
      satiety: editingMeal?.satiety,
    });
    if (!result.success) {
      // O motivo aparece na bandeja, junto do botão de salvar.
      setError(PROBLEM_MESSAGES[result.reason]);
      return;
    }
    markBusy(true);
    let saved = false;
    try {
      saved = await commit(
        (s) => ({ ...s, diary: [...s.diary.filter((d) => d.id !== result.entry.id), result.entry] }),
        "Refeição salva.",
      );
    } finally {
      markBusy(false);
    }
    if (saved && mounted.current) {
      // O diário abre no dia da refeição salva, mesmo quando ela é de outro dia.
      setDate(result.entry.date);
      router.replace("/diario");
    }
  };

  /** Rola até "Seu prato" (logo abaixo da busca fixa) e leva o foco ao título. */
  const revealPlate = () => {
    const y = plateY.current;
    if (y === null) return;
    scroller.current?.scrollTo({
      y: Math.max(0, y - searchHeight.current - PLATE_SCROLL_MARGIN),
      animated: Platform.OS !== "web",
    });
    focusNode(plateTitle.current);
  };
  const showPlate = () => {
    Keyboard.dismiss();
    setPendingFocus(null);
    if (!query) {
      revealPlate();
      return;
    }
    // A seção do prato só existe sem busca: rola quando ela aparecer (onLayout).
    scrollToPlate.current = true;
    setQuery("");
  };
  const onPlateLayout = (event: LayoutChangeEvent) => {
    plateY.current = event.nativeEvent.layout.y;
    if (!scrollToPlate.current) return;
    scrollToPlate.current = false;
    requestAnimationFrame(revealPlate);
  };
  // Itens da foto num prato que já estava na tela: o onLayout pode não disparar de novo.
  useEffect(() => {
    if (!plateFocusTick) return;
    const frame = requestAnimationFrame(() => {
      if (!scrollToPlate.current || plateY.current === null) return;
      scrollToPlate.current = false;
      revealPlate();
    });
    return () => cancelAnimationFrame(frame);
    // revealPlate só lê refs; o efeito roda uma vez por pedido de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateFocusTick]);

  const rowProps = (food: FoodItem) => {
    const item = itemOf(food.id);
    return {
      hideCalories,
      item,
      unit: item && unitOf(item),
      shouldFocusEditor: pendingFocus === food.id,
      needsPortion: !!item && mealText.pending.has(food.id),
      onKeepPortion: () => mealText.clearPending(food.id),
      onEditorFocused: clearPendingFocus,
      onAdd: add,
      onChange: change,
      onRemove: remove,
    };
  };
  const groupRow = (group: FoodGroup) => {
    const inPlate = group.variants.find((v) => itemOf(v.id));
    const chosen = group.variants.find((v) => v.id === prepChoice[group.key]);
    const selected = inPlate ?? chosen ?? group.selected;
    return (
      <FoodRow
        key={group.key}
        {...rowProps(selected)}
        label={group.label}
        variants={group.variants}
        selected={selected}
        query={query}
        onSelect={(food) => {
          if (inPlate) swapPrep(inPlate, food);
          setPrepChoice((c) => ({ ...c, [group.key]: food.id }));
        }}
      />
    );
  };
  const foodRow = (food: FoodItem, suggestion?: number) => (
    <FoodRow
      key={food.id}
      {...rowProps(food)}
      label={friendlyName(food.name).label}
      variants={[food]}
      selected={food}
      suggestion={suggestion}
    />
  );

  const frequentGroups = shownGroups
    .filter((g) => g.variants.some((v) => boost.has(v.id)))
    .slice(0, FREQUENT_IN_SEARCH);
  const shownKeys = new Set(frequentGroups.map((g) => g.key));
  const otherGroups = shownGroups.filter((g) => !shownKeys.has(g.key));
  const mineGroups = otherGroups.filter((g) => !isTacoFood(g.selected));
  const tacoGroups = otherGroups.filter((g) => isTacoFood(g.selected));
  const idleFrequent = frequent.filter((f) => !itemOf(f.food.id));
  const frequentIds = new Set(idleFrequent.map((f) => f.food.id));
  const idleMine = state.foods
    .slice(-MINE_WHEN_IDLE)
    .reverse()
    .filter((f) => !itemOf(f.id) && !frequentIds.has(f.id));

  const searchSections = !results.total ? (
    <View style={styles.empty}>
      <AppText size={fontSize.base} color={colors.muted} align="center">
        Nada encontrado para “{query}”.
      </AppText>
      <Button label="Cadastrar alimento do rótulo" variant="secondary" onPress={() => setLabelOpen(true)} />
    </View>
  ) : (
    <>
      {results.partial && (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19} style={styles.hint}>
          {PARTIAL_HINT}
        </AppText>
      )}
      {frequentGroups.length > 0 && (
        <FoodSection title="Seus frequentes" withHistory>
          {frequentGroups.map(groupRow)}
        </FoodSection>
      )}
      {mineGroups.length > 0 && <FoodSection title={MINE_TITLE}>{mineGroups.map(groupRow)}</FoodSection>}
      {/* Conceito 02: os frequentes vêm logo sob a busca; o filtro fica acima da Tabela TACO e só aparece quando a
          lista passa de uma página (ou já está filtrada, para poder voltar a "Todos"). */}
      {categories.length > 1 && (results.total > TACO_PAGE || categoryKey !== ALL_CATEGORIES) && (
        <CategoryChips
          categories={categories}
          value={categoryKey}
          onChange={(key) => {
            setCategoryKey(key);
            setTacoShown(TACO_PAGE);
          }}
        />
      )}
      {tacoGroups.length > 0 && (
        <FoodSection
          title="Tabela TACO"
          head={
            <TacoHead
              count={plural(tacoGroups.length, "resultado", "resultados")}
              onInfo={() => setTacoInfoOpen(true)}
            />
          }
        >
          {tacoGroups.slice(0, tacoShown).map(groupRow)}
          {tacoGroups.length > tacoShown && (
            <Button
              label={`Mostrar mais (${fmtNumber(tacoGroups.length - tacoShown)})`}
              variant="secondary"
              onPress={() => setTacoShown((n) => n + TACO_PAGE)}
              style={styles.more}
            />
          )}
        </FoodSection>
      )}
    </>
  );

  const idleSections = (
    <>
      {quickStatus ? (
        <Notice>
          <AppText size={fontSize.sm} lineHeight={22} color={colors.green800}>
            {quickStatus}
          </AppText>
        </Notice>
      ) : null}
      {items.length > 0 && (
        <View style={styles.section} onLayout={onPlateLayout}>
          <SectionTitle isPlate titleRef={plateTitle}>
            {`Seu prato · ${plural(items.length, "item", "itens")}`}
          </SectionTitle>
          <View style={styles.list} role="list" aria-label="Seu prato">
            {items.map((item) => foodRow(item.food))}
          </View>
          <FavoriteForm
            name={favoriteName}
            busy={favoriteBusy}
            isFull={state.savedMeals.length >= MAX_SAVED_MEALS}
            error={favoriteError}
            onChangeName={(name) => {
              setFavoriteName(name);
              setFavoriteError("");
            }}
            onSave={() => void favorite()}
          />
        </View>
      )}
      {idleFrequent.length > 0 && (
        <FoodSection title="Seus frequentes" withHistory>
          {idleFrequent.map((f) => foodRow(f.food, f.grams))}
        </FoodSection>
      )}
      {idleMine.length > 0 && <FoodSection title={MINE_TITLE}>{idleMine.map((food) => foodRow(food))}</FoodSection>}
      {!items.length && !idleFrequent.length && !idleMine.length && (
        <Empty art="search">Busque pelo nome, como arroz, frango ou banana.</Empty>
      )}
    </>
  );

  const canRepeat = !editingMeal;
  const dishCards = (inSheet: boolean) => (
    <DishCards
      dishes={dishes}
      hideCalories={hideCalories}
      busy={busy || favoriteBusy}
      focusId={inSheet ? null : focusDishId}
      onFocused={clearDishFocus}
      showTitle={!inSheet}
      layout={inSheet ? "grid" : "scroll"}
      onLoad={(dish) => {
        setDishesOpen(false);
        if (items.length) setPendingDish(dish);
        else load(dish, "replace");
      }}
      onLogNow={(dish) => {
        setDishesOpen(false);
        void logNow(dish);
      }}
      onRemoveFavorite={(dish) => void removeFavorite(dish)}
    />
  );
  // Cabeçalho do conceito 02: a pílula "Jantar ⌄ │ Hoje, 19:30" no centro (o título fica para o leitor de tela) e
  // o histórico ("Seus pratos") à direita, no lugar do sino.
  const pill = (
    <MealPill
      category={category}
      day={day}
      time={time}
      onChange={(next) => {
        if (next.category !== undefined) setCategory(next.category);
        if (next.day !== undefined) setDay(next.day);
        if (next.time !== undefined) setTime(next.time);
        setError("");
      }}
    />
  );
  const history = canRepeat ? (
    <IconButton icon={History} variant="headerRound" accessibilityLabel="Seus pratos e recentes" expanded={isDishesOpen} onPress={() => setDishesOpen(true)} />
  ) : undefined;

  return (
    <Screen
      header={{
        variant: "default",
        title: editingMeal ? "Editar refeição" : "Registrar refeição",
        backTo: "/diario",
        center: pill,
        actions: history,
        hideBell: true,
      }}
      scroll={false}
    >
      <ScrollView
        ref={scroller}
        style={styles.fill}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <CaptureTiles
            hasPhoto={Boolean(photo)}
            aiAvailable={aiReady && profile.consentAi}
            onPhoto={(source) => void attachPhoto(source)}
            onLabel={() => setLabelOpen(true)}
            onDescribe={mealText.open}
          />
          {photo ? (
            <PhotoCard
              photo={photo}
              analysis={analysis?.text ?? ""}
              draft={photoDraft}
              draftKey={analysis?.id ?? 0}
              allergyDetails={profile.allergyDetails}
              canAnalyze={aiReady && profile.consentAi}
              analyzing={aiBusy}
              aiBlocked={!aiReady || !profile.consentAi}
              onAnalyze={() => void analyze()}
              onRemove={removePhoto}
              onAddFoods={addFromPhoto}
              onSearch={searchFor}
            />
          ) : null}
        </View>
        <MealSearch
          query={query}
          announcement={announced}
          status={announcement}
          onChange={(next) => {
            setQuery(next);
            setTacoShown(TACO_PAGE);
            // Um foco pendente nunca tira o cursor da busca no meio da digitação.
            setPendingFocus(null);
          }}
          onLayout={(event) => {
            searchHeight.current = event.nativeEvent.layout.height;
          }}
        />
        {trimmed ? (
          searchSections
        ) : (
          <>
            {canRepeat && dishes.length > 0 && dishCards(false)}
            {idleSections}
          </>
        )}
      </ScrollView>
      {isTrayShown && (
        <MealTray
          items={items}
          unitOf={unitOf}
          hideCalories={hideCalories}
          busy={busy}
          error={error}
          saveLabel={busy ? "Salvando…" : editingMeal ? "Salvar alterações" : "Salvar refeição"}
          onSave={() => void save()}
          onShowPlate={showPlate}
          onLayout={(event) => setTrayHeight(event.nativeEvent.layout.height)}
          pendingIds={mealText.pending}
        />
      )}
      {mealText.isOpen && (
        <MealTextSheet
          allergyDetails={profile.allergyDetails}
          hideCalories={hideCalories}
          onAdd={mealText.addFromText}
          onSearch={searchFor}
          onClose={mealText.close}
        />
      )}
      {isLabelOpen && (
        <LabelFoodSheet
          hideCalories={hideCalories}
          onClose={() => setLabelOpen(false)}
          onSaved={(food) => {
            // Sem busca, o novo alimento aparece em "Seu prato" e o "Aumentar" dele recebe o foco.
            setQuery("");
            add(food, 100, "g");
            setLabelOpen(false);
          }}
        />
      )}
      <MergeSheet
        title={pendingDish?.title ?? null}
        count={items.length}
        hasPhoto={Boolean(photo)}
        onMerge={() => pendingDish && load(pendingDish, "merge")}
        onReplace={() => pendingDish && load(pendingDish, "replace")}
        onClose={() => setPendingDish(null)}
      />
      <Sheet visible={isDishesOpen} title="Seus pratos" onClose={() => setDishesOpen(false)}>
        {isDishesOpen && dishCards(true)}
      </Sheet>
      <TacoInfoSheet visible={isTacoInfoOpen} total={TACO_FOODS.length} onClose={() => setTacoInfoOpen(false)} />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 16 },
  top: { gap: 16 },
  section: { gap: 10 },
  list: { gap: 10 },
  hint: { marginHorizontal: 4 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 12 },
  more: { alignSelf: "center" },
}));
