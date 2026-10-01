import { useState } from "react";
import { useApp } from "../../lib/context";
import { emptyPantryDraft, savePantryDrafts, visibleScanDrafts } from "../../lib/pantry";
import { SHOPPING_COPY, storeCheckedDrafts, storeShoppingPurchase } from "../../lib/shopping-list";
import { readPantryPhoto } from "../../lib/storage";
import { pantryDraftSchema, type PantryDraft, type PantryItem } from "../../types";
import type { PhotoMode } from "./shared";
import { useKitchenCommit } from "./useKitchenCommit";
import type { PantryRun } from "./usePantryRun";

const SCAN_REQUEST =
  "Identifique os alimentos desta foto para revisão manual. A lista de compras representa itens já comprados.";

/**
 * Entrada de alimentos na Despensa: foto ou digitar → revisão (rascunhos) → salvar. Com "Ocultar
 * calorias", nomes e observações chegam mascarados à revisão; é isso que a pessoa revisa e salva.
 */
export function usePantryIntake(run: PantryRun) {
  const { state } = useApp();
  const hide = state.profile?.hideCalories ?? false;
  /** Itens da lista de compras que a revisão aberta vai guardar ("Guardar comprados"). */
  const [shoppingIds, setShoppingIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<PantryDraft[] | null>(null);
  const [editing, setEditing] = useState<string>();
  const [source, setSource] = useState<PantryItem["source"]>("manual");
  const [photoMode, setPhotoMode] = useState<PhotoMode>("pantry_photo");
  const [location, setLocation] = useState<PantryDraft["location"]>("despensa");
  const [photo, setPhoto] = useState("");
  const [scanNotes, setScanNotes] = useState("");
  /** Abre a revisão com estes rascunhos (o aviso de erro anterior sai). */
  const open = (
    next: PantryDraft[],
    from: PantryItem["source"],
    options: { editing?: string; notes?: string; shoppingIds?: string[] } = {},
  ) => {
    setSource(from);
    setEditing(options.editing);
    setScanNotes(options.notes ?? "");
    run.setError(null);
    if (options.shoppingIds) setShoppingIds(options.shoppingIds);
    setDrafts(next);
  };
  const discard = () => {
    setDrafts(null);
    setEditing(undefined);
    setPhoto("");
    setScanNotes("");
    run.setError(null);
    setShoppingIds([]);
  };
  /** "Guardar comprados na despensa": os marcados viram rascunhos da revisão de sempre. */
  const startStore = () => {
    const { drafts: bought, ids } = storeCheckedDrafts(state.shoppingList);
    if (!ids.length) return;
    open(visibleScanDrafts(bought, hide), "shopping_list", { shoppingIds: ids });
  };
  const startManual = () => open([emptyPantryDraft(location)], "manual");
  const startEdit = (item: PantryItem) => {
    const { name, quantity, unit, location: place, expiresOn, notes } = item;
    open(visibleScanDrafts([{ name, quantity, unit, location: place, expiresOn, notes }], hide), item.source, {
      editing: item.id,
    });
  };
  const updateDrafts = (update: (current: PantryDraft[]) => PantryDraft[]) =>
    setDrafts((current) => (current ? update(current) : current));
  return {
    drafts,
    editing,
    source,
    photoMode,
    location,
    photo,
    scanNotes,
    shoppingIds,
    setPhotoMode,
    setLocation,
    setPhoto,
    open,
    discard,
    startStore,
    startManual,
    startEdit,
    updateDrafts,
  };
}

export type PantryIntakeState = ReturnType<typeof usePantryIntake>;

/** Foto da despensa ou da compra: prepara a imagem e pede a leitura ao agente (só com autorização). */
export function usePantryScan(run: PantryRun, intake: PantryIntakeState) {
  const { state, aiRequest } = useApp();
  const hide = state.profile?.hideCalories ?? false;
  const attach = async (file?: File) => {
    if (!file) return;
    const attempt = run.begin("photo");
    try {
      const data = await readPantryPhoto(file);
      if (run.isCurrent(attempt)) intake.setPhoto(data);
    } catch (e) {
      if (run.isCurrent(attempt)) run.fail("add", e);
    } finally {
      run.settle(attempt);
    }
  };
  const scan = async () => {
    const { photo, photoMode, location } = intake;
    if (!run.canAi || !photo) return;
    const attempt = run.begin("scan", true);
    try {
      const reply = await aiRequest(photoMode, SCAN_REQUEST, photo, location);
      if (!run.isCurrent(attempt)) return;
      if (!reply.inventoryDraft)
        throw new Error("O agente não retornou uma lista de itens. Tente outra foto.");
      const items = reply.inventoryDraft.items.map((i) => ({ ...i, location }));
      intake.open(visibleScanDrafts(items, hide), photoMode, {
        notes: [reply.text, reply.inventoryDraft.notes].filter(Boolean).join(" "),
      });
    } catch (e) {
      if (run.isCurrent(attempt)) run.fail("add", e);
    } finally {
      run.settle(attempt);
    }
  };
  return { attach, scan };
}

/**
 * Salvar a revisão: na despensa, ou (compras) guardar e tirar da lista numa só mudança. Devolve
 * true quando salvou (a folha "Adicionar alimentos" fecha).
 */
export function usePantrySave(run: PantryRun, intake: PantryIntakeState) {
  const { state, commit } = useApp();
  const kitchenCommit = useKitchenCommit();
  return async (): Promise<boolean> => {
    const { drafts, source, editing, shoppingIds } = intake;
    if (!drafts?.length || run.busy) return false;
    if (drafts.some((i) => !pantryDraftSchema.safeParse(i).success)) {
      run.setError({
        text: "Confira os nomes, quantidades positivas e datas dos itens antes de salvar.",
        area: "review",
      });
      return false;
    }
    run.setBusy("saving_items");
    run.setError(null);
    if (source === "shopping_list") {
      // Limite estourado vira aviso (âmbar) e a revisão continua aberta.
      const stored = await kitchenCommit((s) => {
        if (s.userId !== state.userId) throw new Error("Os dados foram alterados. Reabra a despensa.");
        return storeShoppingPurchase(s, drafts, shoppingIds);
      }, SHOPPING_COPY.stored);
      run.setBusy("");
      if (stored) intake.discard();
      return stored;
    }
    const ok = await commit((s) => {
      if (s.userId !== state.userId) throw new Error("Os dados foram alterados. Reabra a despensa.");
      return savePantryDrafts(s, drafts, source, editing);
    }, "Alimentos salvos.");
    run.setBusy("");
    if (ok) intake.discard();
    else
      run.setError({
        text: "Não foi possível salvar. Seus itens para revisão foram preservados.",
        area: "review",
      });
    return ok;
  };
}
