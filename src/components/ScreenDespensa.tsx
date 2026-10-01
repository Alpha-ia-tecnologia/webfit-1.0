import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useApp } from "../lib/context";
import { DESPENSA_TITLE } from "../lib/copy";
import { localDate } from "../lib/dates";
import { recipeBlockReason, RECIPE_USE_FIRST_REQUEST } from "../lib/pantry";
import type { PantrySort } from "../lib/pantry-view";
import { shoppingSummary } from "../lib/shopping-list";
import { Page } from "./UI";
import { ADD_PANTRY_TITLE, AddPantrySheet } from "./despensa/AddPantrySheet";
import { DeductSheet } from "./despensa/DeductSheet";
import { PantryInventory } from "./despensa/PantryInventory";
import { PantryShortcuts } from "./despensa/PantryShortcuts";
import { RecipeActionsContext } from "./despensa/recipe-actions";
import { RecipesCard } from "./despensa/RecipesCard";
import { ShoppingListSheet } from "./despensa/ShoppingListSheet";
import { UseFirstCard } from "./despensa/UseFirstCard";
import { useDeductFlow } from "./despensa/useDeductFlow";
import { usePantryItemActions, useRecipeGenerator } from "./despensa/usePantryActions";
import { usePantryIntake, usePantrySave, usePantryScan } from "./despensa/usePantryIntake";
import { usePantryRun } from "./despensa/usePantryRun";
import "./Despensa.css";

/**
 * Atalhos "Receitas com eles" (Hoje) e "Ver lista" (Dieta): o título do "Use primeiro" recebe o
 * foco; a lista de compras abre na sua folha (que foca o próprio título).
 */
function useSectionFocus(onShopping: () => void) {
  const { despensaSection, clearDespensaSection } = useApp();
  const useFirstHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!despensaSection) return;
    const frame = requestAnimationFrame(() => {
      if (despensaSection === "compras") onShopping();
      else useFirstHeading.current?.focus();
      clearDespensaSection();
    });
    return () => cancelAnimationFrame(frame);
  }, [despensaSection, clearDespensaSection, onShopping]);
  return useFirstHeading;
}

/** Busca da lupa do cabeçalho: abre o campo em "Meus alimentos"; Esc ou a lupa de novo fecham. */
function usePantrySearch() {
  const [isSearching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isSearching) field.current?.focus();
  }, [isSearching]);
  const close = () => {
    setSearching(false);
    setSearch("");
    toggle.current?.focus();
  };
  return { isSearching, search, setSearch, toggle, field, open: () => setSearching(true), close };
}

/**
 * Despensa (conceito 06): "Use primeiro" no topo, atalhos da lista e da foto, receitas em carrossel
 * e os alimentos por local. Adicionar, a lista de compras e os básicos das receitas abrem em folhas.
 * Este contêiner junta o estado e as ações (hooks em despensa/).
 */
export function ScreenDespensa() {
  const { state, navigate } = useApp();
  const run = usePantryRun();
  const intake = usePantryIntake(run);
  const { attach, scan } = usePantryScan(run, intake);
  const save = usePantrySave(run, intake);
  const reason = recipeBlockReason(state);
  const generate = useRecipeGenerator(run, reason);
  const { remove, toggleBasic } = usePantryItemActions();
  const deduct = useDeductFlow();
  const search = usePantrySearch();
  const [isAdding, setAdding] = useState(false);
  const [isShopping, setShopping] = useState(false);
  const [sort, setSort] = useState<PantrySort>("validade");
  const openShopping = useCallback(() => setShopping(true), []);
  const useFirstHeading = useSectionFocus(openShopping);
  const hide = state.profile?.hideCalories ?? false;
  const today = localDate();
  const isReviewing = intake.drafts !== null;
  const shopping = shoppingSummary(state.shoppingList);
  const canGenerate = run.canAi && !reason && !isReviewing;
  // Uma revisão que começa com a folha fechada (a leitura da foto terminou) abre a folha.
  const [wasReviewing, setWasReviewing] = useState(isReviewing);
  if (wasReviewing !== isReviewing) {
    setWasReviewing(isReviewing);
    if (isReviewing) setAdding(true);
  }
  const closeAdd = () => setAdding(false);
  /** Descartar: na edição (ou nas compras) a folha fecha; no cadastro, volta ao formulário. */
  const discard = () => {
    const isAdd = intake.source !== "shopping_list" && !intake.editing;
    intake.discard();
    if (!isAdd) closeAdd();
  };
  const blocked = !state.profile?.consentAi
    ? "Para criar receitas, autorize o agente em Meu espaço."
    : reason || (isReviewing ? "Confirme ou descarte a revisão antes de gerar receitas." : "");
  return (
    <Page
      title={DESPENSA_TITLE}
      header={{
        align: "start",
        hideBell: true,
        actions: (
          <>
            <button
              ref={search.toggle}
              type="button"
              className="icon-btn"
              aria-label="Buscar alimentos"
              aria-expanded={search.isSearching}
              onClick={search.isSearching ? search.close : search.open}
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn is-primary"
              aria-label={ADD_PANTRY_TITLE}
              onClick={() => setAdding(true)}
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </>
        ),
      }}
    >
      <RecipeActionsContext.Provider value={deduct.recipeActions}>
        <UseFirstCard
          variant="hero"
          items={state.pantry}
          today={today}
          hide={hide}
          headingRef={useFirstHeading}
          canGenerate={canGenerate}
          disabledReason={blocked}
          onCreate={() => void generate(RECIPE_USE_FIRST_REQUEST)}
        />
        <PantryShortcuts
          pending={shopping.total - shopping.checked}
          isPhotoDisabled={!!run.busy}
          onShopping={openShopping}
          onPhoto={(file) => {
            intake.setPhotoMode("pantry_photo");
            setAdding(true);
            void attach(file);
          }}
        />
        <RecipesCard
          state={state}
          hide={hide}
          reason={reason}
          canGenerate={canGenerate}
          isReviewing={isReviewing}
          busy={run.busy}
          error={run.error}
          onGenerate={() => void generate()}
          onCancel={run.cancel}
          onToggleBasic={toggleBasic}
          onDiet={() => navigate("dieta")}
        />
        <PantryInventory
          items={state.pantry}
          sort={sort}
          onSort={setSort}
          isSearching={search.isSearching}
          search={search.search}
          onSearch={search.setSearch}
          onCloseSearch={search.close}
          searchRef={search.field}
          hide={hide}
          isLocked={!!run.busy || isReviewing}
          onEdit={(item) => {
            intake.startEdit(item);
            setAdding(true);
          }}
          onRemove={remove}
        />
      </RecipeActionsContext.Provider>
      {isAdding && (
        <AddPantrySheet
          run={run}
          intake={intake}
          onAttach={(file) => void attach(file)}
          onScan={() => void scan()}
          onSave={() =>
            void save().then((ok) => {
              if (ok) closeAdd();
            })
          }
          onDiscard={discard}
          onOpenEspaco={() => navigate("espaco")}
          onClose={closeAdd}
        />
      )}
      {isShopping && (
        <ShoppingListSheet
          list={state.shoppingList}
          hide={hide}
          isLocked={!!run.busy || isReviewing}
          onStore={() => {
            setShopping(false);
            intake.startStore();
            setAdding(true);
          }}
          onClose={() => setShopping(false)}
        />
      )}
      {deduct.deducting && (
        <DeductSheet
          rows={deduct.deducting.rows}
          hide={hide}
          isBusy={deduct.isSaving}
          onConfirm={(rows) => void deduct.confirm(rows)}
          onClose={deduct.close}
        />
      )}
    </Page>
  );
}
