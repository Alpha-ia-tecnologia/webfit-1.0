import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Plus, Search } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, type LayoutChangeEvent, type ScrollView, type View } from "react-native";
import { COOK_COPY } from "@shared/lib/cook-timer";
import { DESPENSA_TITLE } from "@shared/lib/copy";
import { localDate } from "@shared/lib/dates";
import { toggleKitchenBasic } from "@shared/lib/kitchen-basics";
import {
  emptyPantryDraft,
  recipeBlockReason,
  RECIPE_REQUEST,
  RECIPE_USE_FIRST_REQUEST,
  savePantryDrafts,
  saveRecipe,
  visibleScanDrafts,
} from "@shared/lib/pantry";
import { applyDeduction, deductRows, undoDeduction, type DeductRow } from "@shared/lib/pantry-deduct";
import { stepPantryQuantity, type PantrySort } from "@shared/lib/pantry-view";
import { SHOPPING_COPY, shoppingSummary, storeCheckedDrafts, storeShoppingPurchase } from "@shared/lib/shopping-list";
import { visiblePlainText } from "@shared/lib/text";
import { firstUseModel } from "@shared/lib/use-first";
import {
  pantryDraftSchema,
  type KitchenBasicKey,
  type PantryDraft,
  type PantryItem,
  type RecipeCard,
} from "@shared/types";
import { AddPantry } from "@/components/despensa/add-pantry";
import { DeductSheet } from "@/components/despensa/deduct-sheet";
import { focusWithin } from "@/components/despensa/focus";
import { PantryInventory } from "@/components/despensa/pantry-inventory";
import { PantryReview } from "@/components/despensa/pantry-review";
import { PantryShortcuts } from "@/components/despensa/pantry-shortcuts";
import { RecipeActionsContext, type RecipeActions } from "@/components/despensa/recipe-actions";
import { RecipesSection } from "@/components/despensa/recipes-section";
import { useSafeCommit } from "@/components/despensa/safe-commit";
import { ShoppingList } from "@/components/despensa/shopping-list";
import type {
  PantryBusy,
  PantryError,
  PantryErrorArea,
  PantryLocation,
  PhotoMode,
} from "@/components/despensa/types";
import { UseFirstCard } from "@/components/despensa/use-first-card";
import { Screen } from "@/components/layout/screen";
import { IconButton, Sheet } from "@/components/ui";
import { successHaptic } from "@/lib/haptics";
import { pickPhoto } from "@/lib/storage";
import { useTimeouts } from "@/lib/timeouts";
import { useApp } from "@/state/app-context";

/** Atalho "Receitas com eles" (Hoje): o título do "Use primeiro" recebe o foco; "Ver lista" (Dieta) abre a lista. */
const SECTION_FOCUS_MS = 400;
/** Folga acima do cartão pedido ao rolar até ele no aparelho. */
const SECTION_SCROLL_GAP = 8;
/** Depois de descontar: espera os painéis fecharem antes de mover o foco. */
const AFTER_SHEET_MS = 450;
const ADD_PANTRY_TITLE = "Adicionar alimentos";

/** No export web, foca "Modo preparo: …" se ainda existe; senão o título "Meus alimentos". */
function focusAfterDeduct(name: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const button = Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).find(
    (el) => el.getAttribute("aria-label") === `Modo preparo: ${name}`,
  );
  if (button) return button.focus();
  const heading = Array.from(document.querySelectorAll<HTMLElement>('[role="heading"]')).find(
    (el) => el.textContent === "Meus alimentos",
  );
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

type Deduct = { card: RecipeCard; name: string; rows: DeductRow[] };

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const CANCELLED = "Solicitação cancelada. Você pode tentar novamente.";
const qtyText = (quantity: number | null) => (quantity === null ? "" : String(quantity));

/**
 * Despensa (conceito 06): "Use primeiro" no topo, atalhos da lista e da foto, receitas em carrossel e os alimentos por
 * local. Adicionar (e revisar), a lista de compras e os básicos das receitas abrem em folhas. O contêiner guarda o
 * estado e as ações (AGENTE-04, AGENTE-06, AGENTE-10, IA-X4); cada andamento e erro aparece onde a ação começou.
 */
export function DespensaScreen() {
  const { state, commit, aiRequest, aiReady, aiBusy, cancelAi } = useApp();
  const router = useRouter();
  const safeCommit = useSafeCommit();
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const [drafts, setDrafts] = useState<PantryDraft[] | null>(null);
  /** Itens da lista de compras na revisão (saem da lista ao salvar). */
  const [shoppingIds, setShoppingIds] = useState<string[]>([]);
  const [deduct, setDeduct] = useState<Deduct | null>(null);
  const [isAdding, setAdding] = useState(false);
  const [isShopping, setShopping] = useState(false);
  const [sort, setSort] = useState<PantrySort>("validade");
  const [isSearching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const useFirstHeading = useRef<View>(null);
  const shoppingTitle = useRef<View>(null);
  const focusedSection = useRef<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  const useFirstY = useRef<number | undefined>(undefined);
  /** iOS: a folha de adicionar só abre depois que a da lista terminou de sair (onDismiss). */
  const afterShopping = useRef<(() => void) | null>(null);
  const later = useTimeouts();
  // Texto digitado de cada quantidade ("0,5" antes de virar número) e a chave estável de cada linha.
  const [quantities, setQuantities] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<string>();
  const [source, setSource] = useState<PantryItem["source"]>("manual");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("pantry_photo");
  const [location, setLocation] = useState<PantryLocation>("despensa");
  const [photo, setPhoto] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<PantryBusy>("");
  const [error, setError] = useState<PantryError | null>(null);
  const run = useRef(0),
    own = useRef(false),
    rowSeq = useRef(0);
  useEffect(
    () => () => {
      run.current++;
      if (own.current) cancelAi();
    },
    [cancelAi],
  );
  // "Receitas com eles" (Hoje): o título do "Use primeiro" recebe o foco, uma vez (no aparelho a tela rola até ele,
  // o foco do leitor de tela não rola). "Ver lista" (Dieta): a folha da lista abre com o foco no título.
  useEffect(() => {
    if (!secao || focusedSection.current === secao) return;
    focusedSection.current = secao;
    if (secao === "compras") {
      setShopping(true);
      const id = setTimeout(() => focusWithin(shoppingTitle.current, '[role="heading"]'), SECTION_FOCUS_MS);
      return () => clearTimeout(id);
    }
    if (secao !== "usar-primeiro") return;
    const id = setTimeout(() => {
      const y = useFirstY.current;
      if (Platform.OS !== "web" && y !== undefined)
        scroller.current?.scrollTo({ y: Math.max(0, y - SECTION_SCROLL_GAP), animated: true });
      focusWithin(useFirstHeading.current, '[role="heading"]');
    }, SECTION_FOCUS_MS);
    return () => clearTimeout(id);
  }, [secao]);
  const recipeActions = useMemo<RecipeActions>(
    () => ({
      deduct: (card, name) => setDeduct({ card, name, rows: deductRows(card, state.pantry, localDate()) }),
    }),
    [state.pantry],
  );
  if (!state.profile) return <Redirect href="/anamnese" />;
  const hide = state.profile.hideCalories;
  const today = localDate();
  const useFirst = firstUseModel(state.pantry, today, hide);
  const canAi = state.profile.consentAi && aiReady && !aiBusy && !busy;
  const reason = recipeBlockReason(state);
  const isReviewing = drafts !== null;
  const shopping = shoppingSummary(state.shoppingList);
  const blocked = !state.profile.consentAi
    ? "Para criar receitas, autorize o agente em Meu espaço."
    : reason || (isReviewing ? "Confirme ou descarte a revisão antes de gerar receitas." : "");
  const fail = (area: PantryErrorArea, e: unknown) => setError({ text: (e as Error).message, area });
  const errorIn = (area: PantryErrorArea) => (error?.area === area ? visiblePlainText(error.text, hide) : null);

  const openDrafts = (items: PantryDraft[]) => {
    setDrafts(items);
    setQuantities(items.map((i) => qtyText(i.quantity)));
    setKeys(items.map(() => `row-${++rowSeq.current}`));
  };
  const patch = (index: number, value: Partial<PantryDraft>) =>
    setDrafts((ds) => ds!.map((d, i) => (i === index ? { ...d, ...value } : d)));
  const setQuantityText = (index: number, text: string) =>
    setQuantities((q) => q.map((v, i) => (i === index ? text : v)));
  const clearDrafts = () => {
    setDrafts(null);
    setEditing(undefined);
    setNotes("");
    setPhoto("");
    setError(null);
    setShoppingIds([]);
  };
  /** "Descartar revisão": no cadastro volta ao formulário (a folha fica); na edição e nas compras a folha fecha. */
  const discard = () => {
    const isAdd = source !== "shopping_list" && !editing;
    clearDrafts();
    if (!isAdd) setAdding(false);
  };
  /** "Guardar comprados na despensa": os marcados vão para a revisão de sempre, na folha de adicionar. */
  const startStore = () => {
    const { drafts: bought, ids } = storeCheckedDrafts(state.shoppingList);
    if (!bought.length) return;
    setEditing(undefined);
    setSource("shopping_list");
    openDrafts(visibleScanDrafts(bought, hide));
    setShoppingIds(ids);
    setNotes("");
    setError(null);
    setShopping(false);
    if (Platform.OS === "ios") afterShopping.current = () => setAdding(true);
    else setAdding(true);
  };
  const startManual = () => {
    setEditing(undefined);
    setSource("manual");
    openDrafts([emptyPantryDraft(location)]);
    setError(null);
  };
  const startEdit = (item: PantryItem) => {
    setEditing(item.id);
    setSource(item.source);
    // Calorias ocultas: o campo mostra (e salva) o nome e a observação mascarados, como na lista e no reconhecimento.
    openDrafts(visibleScanDrafts([item], hide));
    setNotes("");
    setError(null);
    setAdding(true);
  };
  const attach = async (kind: "camera" | "library") => {
    const attempt = ++run.current;
    setBusy("photo");
    setError(null);
    try {
      const file = await pickPhoto(kind, PHOTO_MAX_BYTES);
      if (file && attempt === run.current) setPhoto(file.dataUrl);
    } catch (e) {
      if (attempt === run.current) fail("add", e);
    } finally {
      if (attempt === run.current) setBusy("");
    }
  };
  /** "Adicionar foto": a galeria abre primeiro; a folha de adicionar abre com a foto (ou o aviso) quando ela fecha. */
  const addPhoto = async () => {
    setPhotoMode("pantry_photo");
    await attach("library");
    setAdding(true);
  };
  const cancel = () => {
    const area: PantryErrorArea = busy === "recipe" ? "recipes" : "add";
    run.current++;
    own.current = false;
    cancelAi();
    setBusy("");
    setError({ text: CANCELLED, area });
  };
  const scan = async () => {
    if (!canAi || !photo) return;
    const attempt = ++run.current;
    setBusy("scan");
    setError(null);
    own.current = true;
    try {
      const reply = await aiRequest(
        photoMode,
        "Identifique os alimentos para revisão manual. A lista representa compras já realizadas.",
        photo,
        location,
      );
      if (attempt !== run.current) return;
      if (!reply.inventoryDraft) throw new Error("O agente não retornou os itens. Tente outra foto.");
      // Calorias ocultas: nome e observações chegam mascarados (é isso que se vê, edita e salva).
      openDrafts(visibleScanDrafts(reply.inventoryDraft.items.map((i) => ({ ...i, location })), hide));
      setEditing(undefined);
      setSource(photoMode);
      setNotes(`${reply.text} ${reply.inventoryDraft.notes}`);
      // A leitura pode terminar com a folha fechada: a revisão abre nela.
      setAdding(true);
    } catch (e) {
      if (attempt === run.current) fail("add", e);
    } finally {
      if (attempt === run.current) {
        setBusy("");
        own.current = false;
      }
    }
  };
  const save = async () => {
    if (!drafts?.length || busy) return;
    if (drafts.some((i) => !pantryDraftSchema.safeParse(i).success)) {
      setError({ text: "Confira os nomes, quantidades positivas e validades antes de salvar.", area: "review" });
      return;
    }
    setBusy("saving_items");
    setError(null);
    if (source === "shopping_list") {
      // Salva os comprados revisados e os tira da lista, numa só gravação; uma recusa (limite) vira aviso.
      const stored = await safeCommit((s) => {
        if (s.userId !== state.userId) throw new Error("Os dados mudaram. Reabra a despensa.");
        return storeShoppingPurchase(s, drafts, shoppingIds);
      }, SHOPPING_COPY.stored);
      setBusy("");
      if (!stored) {
        setError({ text: "Não foi possível salvar. Sua revisão foi preservada.", area: "review" });
        return;
      }
      successHaptic();
      clearDrafts();
      setAdding(false);
      return;
    }
    const ok = await commit((s) => {
      if (s.userId !== state.userId) throw new Error("Os dados mudaram. Reabra a despensa.");
      return savePantryDrafts(s, drafts, source, editing);
    }, "Alimentos salvos.");
    setBusy("");
    if (!ok) {
      setError({ text: "Não foi possível salvar. Sua revisão foi preservada.", area: "review" });
      return;
    }
    successHaptic();
    clearDrafts();
    setAdding(false);
  };
  const generate = async (request = RECIPE_REQUEST) => {
    if (!canAi || reason || isReviewing) return;
    const attempt = ++run.current,
      snapshot = state;
    setBusy("recipe");
    setError(null);
    own.current = true;
    try {
      const reply = await aiRequest("recipe", request);
      if (attempt !== run.current) return;
      own.current = false;
      setBusy("saving_recipe");
      // Sem vibração nem comemoração nas receitas (perfis sensíveis inclusive): só o aviso.
      if (!(await commit((s) => saveRecipe(s, reply, snapshot), "Receitas salvas.")))
        throw new Error("Não foi possível salvar. Confira se sua dieta ou estoque mudou e tente novamente.");
    } catch (e) {
      if (attempt === run.current) fail("recipes", e);
    } finally {
      if (attempt === run.current) {
        setBusy("");
        own.current = false;
      }
    }
  };
  // Remover é imediato e pode ser desfeito pelo aviso (sem diálogo).
  const remove = (item: PantryItem) =>
    commit((s) => ({ ...s, pantry: s.pantry.filter((i) => i.id !== item.id) }), `${visiblePlainText(item.name, hide)} removido.`, {
      label: "Desfazer",
      onAction: () =>
        void commit(
          (s) => (s.pantry.some((i) => i.id === item.id) ? s : { ...s, pantry: [...s.pantry, item] }),
          "Item restaurado.",
        ),
    });
  const toggleBasic = (key: KitchenBasicKey) => void commit((s) => toggleKitchenBasic(s, key));
  /** "Atualizar despensa": uma gravação; "Desfazer" devolve exatamente os itens que mudaram. */
  const confirmDeduct = async () => {
    if (!deduct) return;
    const { rows, name } = deduct;
    const before = { items: [] as PantryItem[] };
    const saved = await commit(
      (s) => {
        const result = applyDeduction(s, rows, new Date().toISOString());
        before.items = result.before;
        return result.state;
      },
      COOK_COPY.deducted,
      {
        label: "Desfazer",
        onAction: () => void safeCommit((s) => undoDeduction(s, before.items), COOK_COPY.deductUndone),
      },
    );
    if (!saved) return;
    setDeduct(null);
    later(() => focusAfterDeduct(name), AFTER_SHEET_MS);
  };
  const closeSearch = () => {
    setSearching(false);
    setSearch("");
  };
  const header = {
    variant: "default" as const,
    title: DESPENSA_TITLE,
    align: "start" as const,
    hideBell: true,
    actions: (
      <>
        <IconButton
          icon={Search}
          variant="header"
          accessibilityLabel="Buscar alimentos"
          active={isSearching}
          expanded={isSearching}
          onPress={isSearching ? closeSearch : () => setSearching(true)}
        />
        <IconButton icon={Plus} variant="header" tone="primary" accessibilityLabel={ADD_PANTRY_TITLE} onPress={() => setAdding(true)} />
      </>
    ),
  };
  // Sem backTo: "Voltar" retorna à tela de origem (Dieta, Agente), não a Hoje.
  return (
    <RecipeActionsContext.Provider value={recipeActions}>
      <Screen header={header} scrollRef={scroller}>
        {useFirst ? (
          <UseFirstCard
            model={useFirst}
            today={today}
            headingRef={useFirstHeading}
            onLayout={(event: LayoutChangeEvent) => {
              useFirstY.current = event.nativeEvent.layout.y;
            }}
            canCreate={canAi && !isReviewing}
            reason={blocked}
            onCreate={() => void generate(RECIPE_USE_FIRST_REQUEST)}
          />
        ) : null}
        <PantryShortcuts
          pending={shopping.total - shopping.checked}
          isPhotoDisabled={!!busy}
          onShopping={() => setShopping(true)}
          onPhoto={() => void addPhoto()}
        />
        <RecipesSection
          state={state}
          hide={hide}
          today={today}
          busy={busy}
          reason={reason}
          canAi={canAi}
          isReviewing={isReviewing}
          error={errorIn("recipes")}
          onToggleBasic={toggleBasic}
          onGenerate={() => void generate()}
          onCancel={cancel}
          onOpenDiet={() => router.push("/dieta")}
        />
        <PantryInventory
          items={state.pantry}
          hide={hide}
          today={today}
          isLocked={!!busy || isReviewing}
          sort={sort}
          onSort={setSort}
          isSearching={isSearching}
          search={search}
          onSearch={setSearch}
          onCloseSearch={closeSearch}
          onEdit={startEdit}
          onRemove={remove}
        />
        <Sheet visible={isAdding} title={editing ? "Editar alimento" : ADD_PANTRY_TITLE} onClose={() => setAdding(false)}>
          {drafts === null ? (
            <AddPantry
              consentAi={state.profile.consentAi}
              aiReady={aiReady}
              canAi={canAi}
              busy={busy}
              error={errorIn("add")}
              photoMode={photoMode}
              onPhotoMode={setPhotoMode}
              location={location}
              onLocation={setLocation}
              photo={photo}
              onAttach={(kind) => void attach(kind)}
              onScan={() => void scan()}
              onCancel={cancel}
              onManual={startManual}
              onOpenEspaco={() => {
                setAdding(false);
                router.push("/espaco");
              }}
            />
          ) : (
            <PantryReview
              drafts={drafts}
              quantities={quantities}
              keys={keys}
              isEditing={!!editing}
              busy={busy}
              hide={hide}
              notes={notes}
              error={errorIn("review")}
              onPatch={patch}
              onQuantityText={(index, text) => {
                setQuantityText(index, text);
                patch(index, { quantity: text.trim() === "" ? null : Number(text.replace(",", ".")) });
              }}
              onStep={(index, direction) => {
                const draft = drafts[index]!;
                const current = draft.quantity !== null && Number.isFinite(draft.quantity) ? draft.quantity : null;
                const quantity = stepPantryQuantity(current, draft.unit, direction);
                // Mesma convenção de openDrafts: o campo mostra String(q) ou fica vazio.
                setQuantityText(index, qtyText(quantity));
                patch(index, { quantity });
              }}
              onRemove={(index) => {
                setDrafts((ds) => ds!.filter((_, i) => i !== index));
                setQuantities((q) => q.filter((_, i) => i !== index));
                setKeys((k) => k.filter((_, i) => i !== index));
              }}
              onAdd={() => {
                setDrafts((ds) => [...ds!, emptyPantryDraft(location)]);
                setQuantities((q) => [...q, ""]);
                setKeys((k) => [...k, `row-${++rowSeq.current}`]);
              }}
              onSave={() => void save()}
              onDiscard={discard}
            />
          )}
        </Sheet>
        <Sheet
          visible={isShopping}
          title={SHOPPING_COPY.title}
          titleRef={shoppingTitle}
          onClose={() => setShopping(false)}
          onDismiss={() => {
            const open = afterShopping.current;
            afterShopping.current = null;
            open?.();
          }}
        >
          <ShoppingList isLocked={!!busy || isReviewing} onStore={startStore} />
        </Sheet>
        <DeductSheet
          visible={deduct !== null}
          rows={deduct?.rows ?? []}
          hide={hide}
          onRows={(rows) => setDeduct((current) => (current ? { ...current, rows } : current))}
          onConfirm={() => void confirmDeduct()}
          onClose={() => setDeduct(null)}
        />
      </Screen>
    </RecipeActionsContext.Provider>
  );
}
