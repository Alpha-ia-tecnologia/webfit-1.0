import type { PantryDraft } from "@shared/types";

/** Ação em andamento na Despensa; cada uma mostra o andamento no cartão que a iniciou. */
export type PantryBusy = "" | "photo" | "scan" | "saving_items" | "recipe" | "saving_recipe";
/** Cartão onde o erro aparece: adicionar (foto), revisão ou receitas. */
export type PantryErrorArea = "add" | "review" | "recipes";
export interface PantryError {
  text: string;
  area: PantryErrorArea;
}
export type PhotoMode = "pantry_photo" | "shopping_photo";
export type PantryLocation = PantryDraft["location"];

/** Local dos itens na ordem dos botões (Despensa, Geladeira). */
export const LOCATION_OPTIONS = [
  ["despensa", "Despensa"],
  ["geladeira", "Geladeira"],
] as const satisfies readonly (readonly [PantryLocation, string])[];

/** Texto do andamento de cada ação (o mesmo do web). */
export const BUSY_TEXT: Record<Exclude<PantryBusy, "">, string> = {
  photo: "Preparando foto…",
  scan: "Reconhecendo os alimentos da foto…",
  saving_items: "Salvando…",
  recipe: "Criando e revisando suas receitas…",
  saving_recipe: "Salvando…",
};
