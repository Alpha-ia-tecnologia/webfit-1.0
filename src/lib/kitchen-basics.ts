import type { AppState } from "../types";
import { KITCHEN_BASIC_KEYS, type KitchenBasicKey } from "./recipe-schema";

/**
 * Básicos de cozinha (IA-X4): o que a pessoa sempre tem e que as receitas podem presumir.
 * Ficam fora da despensa (não contam como alimentos, não vencem, não entram no limite de itens).
 */
export interface KitchenBasic {
  key: KitchenBasicKey;
  label: string;
  emoji: string;
}

/** Na ordem canônica de KITCHEN_BASIC_KEYS (chips, estado e prompts). */
export const KITCHEN_BASICS: readonly KitchenBasic[] = [
  { key: "sal", label: "Sal", emoji: "🧂" },
  { key: "azeite", label: "Azeite", emoji: "🫒" },
  { key: "oleo", label: "Óleo", emoji: "🌻" },
  { key: "alho", label: "Alho", emoji: "🧄" },
  { key: "cebola", label: "Cebola", emoji: "🧅" },
  { key: "limao", label: "Limão", emoji: "🍋" },
  { key: "pimenta", label: "Pimenta-do-reino", emoji: "🫙" },
  { key: "vinagre", label: "Vinagre", emoji: "🍶" },
  { key: "manteiga", label: "Manteiga", emoji: "🧈" },
  { key: "farinha", label: "Farinha de trigo", emoji: "🌾" },
  { key: "oregano", label: "Orégano", emoji: "🌿" },
  { key: "cheiro_verde", label: "Cheiro-verde", emoji: "🌱" },
];

const BY_KEY = new Map(KITCHEN_BASICS.map((basic) => [basic.key, basic]));

export function kitchenBasic(key: KitchenBasicKey): KitchenBasic {
  const basic = BY_KEY.get(key);
  if (!basic) throw new Error(`Básico de cozinha desconhecido: ${key}`);
  return basic;
}

/** Liga/desliga um básico; devolve novo estado com a lista na ordem canônica. */
export function toggleKitchenBasic(state: AppState, key: KitchenBasicKey): AppState {
  const on = state.kitchenBasics.includes(key);
  const kitchenBasics = KITCHEN_BASIC_KEYS.filter((k) =>
    k === key ? !on : state.kitchenBasics.includes(k),
  );
  return { ...state, kitchenBasics };
}

/** "sal=Sal, azeite=Azeite, …" para os prompts (fonte única das chaves). */
export function kitchenBasicsLegend(): string {
  return KITCHEN_BASICS.map((basic) => `${basic.key}=${basic.label}`).join(", ");
}

export const KITCHEN_BASICS_HELP =
  "Marque o que você sempre tem. Só os básicos marcados entram nas receitas, e eles não contam como alimentos da despensa.";
export const KITCHEN_BASICS_NONE_HINT =
  "Nenhum básico marcado: sal, azeite e temperos entram em “Falta comprar”.";
