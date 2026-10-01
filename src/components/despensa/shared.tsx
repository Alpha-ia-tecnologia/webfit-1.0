import { visiblePlainText } from "../../lib/text";
import type { PantryItem } from "../../types";
import type { Segment } from "../SegmentedControl";

/** O que está em andamento na tela; cada tipo aparece no cartão da ação que o iniciou. */
export type PantryBusy = "" | "photo" | "scan" | "saving_items" | "recipe" | "saving_recipe";
export type PantryArea = "add" | "review" | "recipes";
/** Um único erro na tela, mostrado no cartão da área que falhou (no máximo um role="alert"). */
export interface PantryError {
  text: string;
  area: PantryArea;
}
export type PhotoMode = "pantry_photo" | "shopping_photo";

export const LOCATION_SEGMENTS: Segment<PantryItem["location"]>[] = [
  { value: "despensa", label: "Despensa" },
  { value: "geladeira", label: "Geladeira" },
];

type Running = Exclude<PantryBusy, "">;
const BUSY: Record<Running, { area: PantryArea; text: string; isCancellable: boolean }> = {
  photo: { area: "add", text: "Preparando foto…", isCancellable: false },
  scan: { area: "add", text: "Reconhecendo os alimentos da foto…", isCancellable: true },
  saving_items: { area: "review", text: "Salvando…", isCancellable: false },
  recipe: { area: "recipes", text: "Criando e revisando suas receitas…", isCancellable: true },
  saving_recipe: { area: "recipes", text: "Salvando…", isCancellable: false },
};

/** Área (cartão) em que um trabalho em andamento aparece; o cancelamento cai na mesma área. */
export function busyArea(busy: PantryBusy): PantryArea | null {
  return busy ? BUSY[busy].area : null;
}

/** "Reconhecendo…", "Salvando…" ao lado da ação que os iniciou, com "Cancelar" quando cabe. */
export function AreaStatus({
  area,
  busy,
  onCancel,
}: {
  area: PantryArea;
  busy: PantryBusy;
  onCancel: () => void;
}) {
  if (!busy || BUSY[busy].area !== area) return null;
  const { text, isCancellable } = BUSY[busy];
  return (
    <div role="status" className="pantry-status">
      <span>{text}</span>
      {isCancellable && (
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancelar solicitação
        </button>
      )}
    </div>
  );
}

export function AreaAlert({
  area,
  error,
  hide,
}: {
  area: PantryArea;
  error: PantryError | null;
  hide: boolean;
}) {
  if (!error || error.area !== area) return null;
  return (
    <p role="alert" className="notice">
      {visiblePlainText(error.text, hide)}
    </p>
  );
}
