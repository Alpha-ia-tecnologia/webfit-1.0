import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History } from "lucide-react";
import foodsJson from "../data/foods.json";
import type { FoodItem, MealItem } from "../types";
import { useApp } from "../lib/context";
import { localDate, localTime, uid } from "../lib/domain";
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
} from "../lib/meals";
import { friendlyName, searchFoods, type FoodGroup } from "../lib/food-search";
import { ALL_CATEGORIES, categoriesIn, filterByCategory } from "../lib/food-categories";
import { defaultPortion, inferUnit, measureById, type PortionUnit } from "../lib/household-measures";
import { maskStructured } from "../lib/structured";
import { visiblePlainText } from "../lib/text";
import { fmtRelDate, plural } from "../lib/format";
import { Empty, Modal, Page } from "./UI";
import { MealPill } from "./refeicao/MealPill";
import { CaptureTiles, PhotoCard } from "./refeicao/CaptureTiles";
import { DishCards } from "./refeicao/DishCards";
import { FoodRow } from "./refeicao/FoodRow";
import { FoodSearchResults } from "./refeicao/FoodSearchResults";
import { IdleSections } from "./refeicao/IdleSections";
import { MealTray } from "./refeicao/MealTray";
import { LabelFoodModal } from "./refeicao/LabelFoodModal";
import { MealTextSheet } from "./refeicao/MealTextSheet";
import { TacoInfoModal } from "./refeicao/TacoInfoModal";
import { useMealText } from "./refeicao/useMealText";
import { usePhotoAnalysis } from "./refeicao/usePhotoAnalysis";
import "./refeicao/Refeicao.css";
import { SearchField } from "./SearchField";
import { useFocusAfterBusy } from "./useFocusAfterBusy";

const TACO_FOODS = foodsJson as FoodItem[];
const TACO_PAGE = 20;
const ANNOUNCE_DELAY_MS = 600;
const BOOST_POOL = 50;
/** Alimento que representa o grupo no filtro de categoria. */
const groupFood = (group: FoodGroup) => group.selected;
const LOADED_MESSAGE = "Itens no prato. Confira as porções e toque em Salvar refeição.";
const PROBLEM_MESSAGES: Record<MealEntryProblem, string> = {
  items: "Confira as porções: cada alimento precisa ter mais de 0 g.",
  future: "A data da refeição não pode estar no futuro.",
  when: "Não foi possível salvar. Confira a data, o horário e os itens.",
};

const unitsFor = (items: readonly MealItem[]): Record<string, PortionUnit> =>
  Object.fromEntries(items.map((i) => [i.food.id, inferUnit(i.food, i.grams)]));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Registrar refeição com a busca primeiro: tipo, data e hora numa pílula; foto e rótulo como
 * atalhos; "Seus pratos" para repetir; busca com nomes amigáveis, preparos e medidas caseiras;
 * e a bandeja fixa com o total e o botão de salvar assim que o prato tem um item.
 */
export function ScreenAdicionarRefeicao() {
  const {
    state,
    date,
    setDate,
    editingMeal,
    mealPreset,
    commit,
    navigate,
    aiReady,
    aiBusy,
    notify,
  } = useApp();
  // Atalhos ("+ Jantar", "Foto do prato", "Conferir e registrar") só valem para uma refeição nova.
  const preset = editingMeal ? null : mealPreset;
  const profile = state.profile!;
  const hideCalories = profile.hideCalories;
  const today = localDate();
  const startItems = editingMeal?.items ?? preset?.items ?? [];
  const [items, setItems] = useState<MealItem[]>(() => cloneMealItems(startItems));
  const [units, setUnits] = useState(() => unitsFor(startItems));
  const [time, setTime] = useState(() => editingMeal?.time ?? localTime());
  const [category, setCategory] = useState(
    () => editingMeal?.categoryTag ?? preset?.category ?? defaultMealCategory(time, profile),
  );
  const [day, setDay] = useState(editingMeal?.date ?? date);
  const {
    photo,
    attach: attachPhoto,
    remove: removePhoto,
    analysis,
    analyze,
  } = usePhotoAnalysis(editingMeal?.imageUrl ?? "", preset);
  // O rascunho da foto é mascarado uma vez (texto puro): nomes, rótulos e avisos sem calorias.
  const photoDraft = useMemo(
    () => (analysis?.draft ? maskStructured(analysis.draft, hideCalories, { plain: true }) : null),
    [analysis, hideCalories],
  );
  const presetNote = preset?.note ? visiblePlainText(preset.note, hideCalories) : "";
  const [query, setQuery] = useState("");
  const [categoryKey, setCategoryKey] = useState(ALL_CATEGORIES);
  const [tacoShown, setTacoShown] = useState(TACO_PAGE);
  const [revealFrom, setRevealFrom] = useState<number | null>(null);
  const [prepChoice, setPrepChoice] = useState<Record<string, string>>({});
  const [labelOpen, setLabelOpen] = useState(false);
  const [tacoInfo, setTacoInfo] = useState(false);
  const [pendingDish, setPendingDish] = useState<Dish | null>(null);
  const [isDishesOpen, setDishesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  // Prato vindo do plano ou do chat: o aviso (itens fora do prato, alergia) aparece e é anunciado.
  const [quickStatus, setQuickStatus] = useState(presetNote);
  // Anúncio para leitor de tela; o contador faz a mesma frase ser anunciada de novo.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  /** Alimento recém-adicionado (ou restaurado) cujo "Aumentar" deve receber o foco. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Prato favorito restaurado pelo "Desfazer", cujo cartão recebe o foco. */
  const [focusDishId, setFocusDishId] = useState<string | null>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");
  const plateRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tacoListRef = useRef<HTMLUListElement>(null);
  const mounted = useRef(true);
  // Travas síncronas: o estado "busy" só muda no próximo render, e um duplo toque rápido gravaria
  // dois registros (cada um com o seu uid()). A ref vale já no segundo toque.
  const busyRef = useRef(false);
  const favoriteBusyRef = useRef(false);
  const favoriteButton = useRef<HTMLButtonElement>(null);
  useFocusAfterBusy(favoriteBusy, favoriteButton);
  // Valores atuais para ações que terminam depois (desfazer).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const clearFocus = useCallback(() => setFocusId(null), []);
  const clearDishFocus = useCallback(() => setFocusDishId(null), []);
  const announce = (text: string) =>
    setAnnouncement((current) => ({ text, count: current.count + 1 }));
  // O aviso do prato pré-preenchido vai para a região de status depois de montada (senão não é lido).
  useEffect(() => {
    if (presetNote) setAnnouncement((current) => ({ text: presetNote, count: current.count + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura da tela: o aviso é do atalho que a abriu
  }, []);

  const allFoods = useMemo(() => [...state.foods, ...TACO_FOODS], [state.foods]);
  const frequent = useMemo(
    () => frequentFoods(state.diary, category, today),
    [state.diary, category, today],
  );
  const boost = useMemo(
    () =>
      new Map(
        frequentFoods(state.diary, category, today, BOOST_POOL).map((f) => [f.food.id, f.count]),
      ),
    [state.diary, category, today],
  );
  const results = useMemo(
    () => searchFoods(allFoods, query, { limit: Number.POSITIVE_INFINITY, boost }),
    [allFoods, query, boost],
  );
  const categories = useMemo(() => categoriesIn(results.groups, groupFood), [results.groups]);
  const shownGroups = filterByCategory(results.groups, categoryKey, groupFood);
  // Busca apagada: o filtro volta a "Todos" para a próxima.
  useEffect(() => {
    if (!query.trim()) setCategoryKey(ALL_CATEGORIES);
  }, [query]);
  const dishes = useMemo(
    () => dishesFrom(state.savedMeals, recentMeals(state.diary), today),
    [state.savedMeals, state.diary, today],
  );

  const itemOf = (id: string) => items.find((i) => i.food.id === id);
  const unitOf = (item: MealItem) => units[item.food.id] ?? inferUnit(item.food, item.grams);
  /** O prato mudou: some o aviso de "carregado" e o erro antigo de salvar. */
  const plateChanged = () => {
    setSaveError("");
    setQuickStatus("");
  };

  const add = (food: FoodItem, grams: number, unit: PortionUnit) => {
    const existing = itemOf(food.id);
    setItems((current) => addMealItem(current, food, grams));
    setUnits((current) => ({ ...current, [food.id]: existing ? unitOf(existing) : unit }));
    setFocusId(food.id);
    plateChanged();
  };
  /** Itens vindos da foto ou da descrição: o aviso é anunciado e o foco vai para "Seu prato". */
  const itemsAdded = (message: string) => {
    setFocusId(null);
    setQuery("");
    setQuickStatus(message);
    announce(message);
    requestAnimationFrame(() => plateRef.current?.focus());
  };
  const mealText = useMealText({ items, add, onAdded: itemsAdded, plateRef });
  const change = (food: FoodItem, grams: number, unit: PortionUnit) => {
    setItems((current) => current.map((i) => (i.food.id === food.id ? { ...i, grams } : i)));
    setUnits((current) => ({ ...current, [food.id]: unit }));
    mealText.clearPending(food.id);
    plateChanged();
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
  const remove = (food: FoodItem) => {
    const index = items.findIndex((i) => i.food.id === food.id);
    const removed = items[index];
    if (!removed) return;
    const removedUnit = unitOf(removed);
    setItems((current) => current.filter((i) => i.food.id !== food.id));
    mealText.clearPending(food.id);
    plateChanged();
    notify(`Item removido do prato: ${friendlyName(food.name).label}.`, "info", {
      label: "Desfazer",
      onAction: () => {
        // O prato vive só nesta tela: depois de sair dela, não há o que restaurar.
        if (!mounted.current) {
          notify(
            "Não dá mais para desfazer depois de sair da tela. Se quiser, adicione o alimento de novo.",
            "info",
          );
          return;
        }
        // Já foi adicionado de novo: nada a restaurar (e a medida escolhida fica).
        if (itemsRef.current.some((i) => i.food.id === food.id)) return;
        setItems((current) => [...current.slice(0, index), removed, ...current.slice(index)]);
        setUnits((current) => ({ ...current, [food.id]: removedUnit }));
        setFocusId(food.id);
      },
    });
  };

  /** Itens escolhidos no rascunho da foto: medida caseira padrão; o foco vai para "Seu prato". */
  const addFromPhoto = (foods: FoodItem[]) => {
    if (!foods.length) return;
    for (const food of foods) {
      const portion = defaultPortion(food);
      add(food, portion.grams, portion.unit);
    }
    itemsAdded(
      foods.length === 1
        ? "1 item adicionado ao prato. Confira a porção."
        : `${foods.length} itens adicionados ao prato. Confira as porções.`,
    );
  };
  /** "Buscar {item}" de um item da foto sem correspondência: a busca já vem preenchida. */
  const searchFor = (name: string) => {
    setQuery(name);
    setTacoShown(TACO_PAGE);
    setFocusId(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  /** Carrega um prato; a foto anexada é desta refeição e fica, mesmo ao substituir os itens. */
  const load = (dish: Dish, mode: "replace" | "merge") => {
    const draft = mealDraftFrom(dish.source);
    const next = mode === "merge" ? mergeMealItems(items, draft.items) : draft.items;
    setItems(next);
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
    setSaveError("");
    setQuickStatus(LOADED_MESSAGE);
    announce(LOADED_MESSAGE);
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
    busyRef.current = true;
    setBusy(true);
    const saved = await commit(
      (s) => ({ ...s, diary: [...s.diary, result.entry] }),
      `Refeição registrada: ${category}, ${fmtRelDate(day, today)} às ${time}.`,
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) => ({ ...s, diary: s.diary.filter((d) => d.id !== id) }),
            "Registro desfeito.",
          ),
      },
    ).finally(() => {
      busyRef.current = false;
    });
    setBusy(false);
    if (saved && !items.length) {
      setDate(result.entry.date);
      navigate("diario");
    }
  };
  const removeFavorite = async (dish: Dish) => {
    if (favoriteBusyRef.current) return;
    const index = state.savedMeals.findIndex((m) => m.id === dish.id);
    const meal = state.savedMeals[index];
    if (!meal) return;
    favoriteBusyRef.current = true;
    setFavoriteBusy(true);
    await commit(
      (s) => ({ ...s, savedMeals: s.savedMeals.filter((m) => m.id !== meal.id) }),
      "Favorito removido.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              s.savedMeals.some((m) => m.id === meal.id)
                ? s
                : {
                    ...s,
                    savedMeals: [
                      ...s.savedMeals.slice(0, index),
                      meal,
                      ...s.savedMeals.slice(index),
                    ],
                  },
            "Favorito restaurado.",
          ).then((restored) => {
            if (restored && mounted.current) setFocusDishId(meal.id);
          }),
      },
    ).finally(() => {
      favoriteBusyRef.current = false;
    });
    setFavoriteBusy(false);
  };
  const favorite = async () => {
    if (favoriteBusyRef.current) return;
    favoriteBusyRef.current = true;
    setFavoriteError("");
    setFavoriteBusy(true);
    try {
      const input = { id: uid(), name: favoriteName, categoryTag: category, items };
      saveMealFavorite(state, input);
      if (
        await commit(
          (s) => saveMealFavorite(s, input),
          "Prato guardado em Seus pratos. A refeição ainda precisa ser salva.",
        )
      )
        setFavoriteName("");
    } catch (err) {
      setFavoriteError((err as Error).message);
    } finally {
      favoriteBusyRef.current = false;
      setFavoriteBusy(false);
    }
  };
  const save = async () => {
    if (busyRef.current) return;
    // Sem porção dita (Descrever refeição): pergunta antes; nada entra com um palpite silencioso.
    // A trava vale já durante a pergunta: um duplo toque não passa enquanto ela é respondida.
    busyRef.current = true;
    const isConfirmed = await mealText.confirmPending().finally(() => {
      busyRef.current = false;
    });
    if (!isConfirmed) return;
    setSaveError("");
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
      setSaveError(PROBLEM_MESSAGES[result.reason]);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const saved = await commit(
      (s) => ({
        ...s,
        diary: [...s.diary.filter((d) => d.id !== result.entry.id), result.entry],
      }),
      "Refeição salva.",
    ).finally(() => {
      busyRef.current = false;
    });
    setBusy(false);
    if (saved) {
      // O diário abre no dia da refeição salva, mesmo quando ela é de outro dia.
      setDate(result.entry.date);
      navigate("diario");
    }
  };
  const showPlate = () => {
    setQuery("");
    setFocusId(null);
    requestAnimationFrame(() => {
      plateRef.current?.scrollIntoView({
        behavior: reducedMotion() ? "auto" : "smooth",
        block: "start",
      });
      plateRef.current?.focus({ preventScroll: true });
    });
  };
  const clearSearch = () => {
    setQuery("");
    setFocusId(null);
    searchRef.current?.focus();
  };
  const showMoreTaco = () => {
    setRevealFrom(tacoShown);
    setTacoShown((n) => n + TACO_PAGE);
  };
  // "Mostrar mais": o foco vai para o primeiro resultado revelado (o botão pode sumir).
  useEffect(() => {
    if (revealFrom === null) return;
    tacoListRef.current?.children[revealFrom]?.querySelector<HTMLElement>("button")?.focus();
    setRevealFrom(null);
  }, [revealFrom]);

  const onKeepPortion = (food: FoodItem) => mealText.clearPending(food.id);
  const rowProps = { hideCalories, onAdd: add, onChange: change, onRemove: remove, onKeepPortion };
  const groupRow = (group: FoodGroup) => {
    const inPlate = group.variants.find((v) => itemOf(v.id));
    const chosen = group.variants.find((v) => v.id === prepChoice[group.key]);
    const selected = inPlate ?? chosen ?? group.selected;
    const item = itemOf(selected.id);
    return (
      <FoodRow
        key={group.key}
        {...rowProps}
        label={group.label}
        variants={group.variants}
        selected={selected}
        query={query}
        item={item}
        unit={item && unitOf(item)}
        focusPlus={focusId === selected.id}
        needsPortion={mealText.pending.has(selected.id)}
        onFocused={clearFocus}
        onSelect={(food) => {
          if (inPlate) swapPrep(inPlate, food);
          setPrepChoice((c) => ({ ...c, [group.key]: food.id }));
        }}
      />
    );
  };
  const foodRow = (food: FoodItem, suggestion?: number) => {
    const item = itemOf(food.id);
    return (
      <FoodRow
        key={food.id}
        {...rowProps}
        label={friendlyName(food.name).label}
        variants={[food]}
        selected={food}
        suggestion={suggestion}
        item={item}
        unit={item && unitOf(item)}
        focusPlus={focusId === food.id}
        needsPortion={mealText.pending.has(food.id)}
        onFocused={clearFocus}
      />
    );
  };

  // A contagem de resultados é anunciada quando a digitação pausa, não a cada tecla.
  useEffect(() => {
    const text = query.trim() ? plural(shownGroups.length, "resultado", "resultados") : "";
    const timer = window.setTimeout(() => setResultsAnnouncement(text), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, shownGroups.length]);

  const searchSections = (
    <FoodSearchResults
      query={query}
      total={results.total}
      isPartial={results.partial}
      // Conceito 02: filtro só quando a lista passa de uma página (ou já está filtrada, para poder voltar a "Todos").
      categories={results.total > TACO_PAGE || categoryKey !== ALL_CATEGORIES ? categories : []}
      categoryKey={categoryKey}
      onCategory={(key) => {
        setCategoryKey(key);
        setTacoShown(TACO_PAGE);
      }}
      groups={shownGroups}
      boost={boost}
      tacoShown={tacoShown}
      tacoListRef={tacoListRef}
      renderGroup={groupRow}
      onLabel={() => setLabelOpen(true)}
      onTacoInfo={() => setTacoInfo(true)}
      onMoreTaco={showMoreTaco}
    />
  );
  const idleSections = (
    <IdleSections
      notice={quickStatus}
      items={items}
      plateRef={plateRef}
      frequent={frequent}
      foods={state.foods}
      renderFood={foodRow}
      favorite={{
        name: favoriteName,
        error: favoriteError,
        isBusy: favoriteBusy,
        isFull: state.savedMeals.length >= MAX_SAVED_MEALS,
        buttonRef: favoriteButton,
        onName: (name) => {
          setFavoriteName(name);
          setFavoriteError("");
        },
        onSave: () => void favorite(),
      }}
    />
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
  // Cabeçalho do conceito 02: a pílula "Jantar ⌄ │ Hoje, 19:30" no centro (o h1 fica para leitores de
  // tela) e o histórico ("Seus pratos") à direita, no lugar do sino.
  const header = {
    hideBell: true,
    center: (
      <MealPill
        category={category}
        day={day}
        time={time}
        onChange={(next) => {
          if (next.category !== undefined) setCategory(next.category);
          if (next.day !== undefined) setDay(next.day);
          if (next.time !== undefined) setTime(next.time);
          setSaveError("");
        }}
      />
    ),
    actions: canRepeat ? (
      <button
        type="button"
        className="icon-btn"
        aria-label="Seus pratos e recentes"
        aria-haspopup="dialog"
        onClick={() => setDishesOpen(true)}
      >
        <History size={20} aria-hidden="true" />
      </button>
    ) : undefined,
  };

  return (
    <Page title={editingMeal ? "Editar refeição" : "Registrar refeição"} header={header}>
      <div className="meal-screen">
        <CaptureTiles
          hasPhoto={Boolean(photo)}
          aiAvailable={aiReady && profile.consentAi}
          onPhoto={(file) => void attachPhoto(file)}
          onLabel={() => setLabelOpen(true)}
          onDescribe={mealText.open}
        />
        {photo && (
          <PhotoCard
            photo={photo}
            analysis={analysis?.text ?? ""}
            draft={photoDraft}
            draftId={analysis?.id ?? 0}
            allergyDetails={profile.allergyDetails}
            canAnalyze={aiReady && profile.consentAi}
            analyzing={aiBusy}
            aiBlocked={!aiReady || !profile.consentAi}
            onAnalyze={() => void analyze()}
            onRemove={removePhoto}
            onAddFoods={addFromPhoto}
            onSearch={searchFor}
          />
        )}
        <div className="meal-search" role="search">
          <SearchField
            label="Buscar alimento"
            placeholder="Buscar alimento: arroz, frango…"
            size="lg"
            inputRef={searchRef}
            value={query}
            onChange={(next) => {
              setQuery(next);
              setTacoShown(TACO_PAGE);
              // Um foco pendente nunca tira o cursor da busca no meio da digitação.
              setFocusId(null);
            }}
            onClear={clearSearch}
          />
          <p className="sr-only" aria-live="polite">
            {resultsAnnouncement}
          </p>
          <p className="sr-only" role="status">
            {announcement.text}
            {announcement.count % 2 ? " " : ""}
          </p>
        </div>
        {query.trim() ? (
          searchSections
        ) : (
          <>
            {canRepeat && dishes.length > 0 && dishCards(false)}
            {idleSections}
          </>
        )}
        <MealTray
          items={items}
          unitOf={unitOf}
          hideCalories={hideCalories}
          busy={busy}
          error={saveError}
          pendingIds={mealText.pending}
          saveLabel={busy ? "Salvando…" : editingMeal ? "Salvar alterações" : "Salvar refeição"}
          onSave={() => void save()}
          onShowPlate={showPlate}
        />
      </div>
      {labelOpen && (
        <LabelFoodModal
          hideCalories={hideCalories}
          onClose={() => setLabelOpen(false)}
          onSaved={(food) => {
            // Sem busca, o novo alimento aparece em "Seu prato" e recebe o foco.
            setQuery("");
            add(food, 100, "g");
            setLabelOpen(false);
          }}
        />
      )}
      {pendingDish && (
        <Modal title="Juntar ou substituir?" onClose={() => setPendingDish(null)}>
          <p>
            Seu prato já tem {plural(items.length, "item", "itens")}. Quer juntar “
            {pendingDish.title}” ao que já está no prato ou substituir os itens?
            {photo && " A foto anexada continua."}
          </p>
          <div className="merge-actions">
            <button type="button" className="btn" onClick={() => load(pendingDish, "merge")}>
              Juntar aos itens
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => load(pendingDish, "replace")}
            >
              Substituir itens
            </button>
          </div>
        </Modal>
      )}
      {tacoInfo && (
        <TacoInfoModal foodCount={TACO_FOODS.length} onClose={() => setTacoInfo(false)} />
      )}
      {isDishesOpen && (
        <Modal title="Seus pratos e recentes" onClose={() => setDishesOpen(false)}>
          {dishes.length > 0 ? (
            dishCards(true)
          ) : (
            <Empty art="search">
              Seus pratos favoritos e as refeições recentes aparecem aqui para repetir em um toque.
            </Empty>
          )}
        </Modal>
      )}
      {mealText.isOpen && (
        <MealTextSheet
          onClose={mealText.close}
          onAdd={mealText.addFromText}
          onSearch={(name) => {
            mealText.close();
            searchFor(name);
          }}
        />
      )}
    </Page>
  );
}
