import {
  kitchenBasicsSchema,
  type KitchenBasicKey,
} from "../src/lib/recipe-schema";

/**
 * Refs curtas da despensa (p1…pN) no lugar dos ids do estoque: o modelo nunca vê os ids, o
 * esquema estrito limita `ref` a um enum pequeno e o servidor devolve o id e o nome do item.
 * Fonte única do contexto compacto (prepare.ts) e do esquema das receitas (recipes.ts): a ref
 * é o índice da linha em context.pantry, e nenhuma linha é filtrada, então os dois não divergem.
 */

type Row = Record<string, unknown>;

export interface RecipeRefItem {
  id: string;
  name: string;
}
export interface RecipeRefs {
  /** Refs de itens com id e nome, na ordem de context.pantry. */
  refs: string[];
  byRef: ReadonlyMap<string, RecipeRefItem>;
  /** Básicos ligados, na ordem canônica. */
  basics: KitchenBasicKey[];
}

export const recipeRef = (index: number): string => `p${index + 1}`;

const isRow = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** context.pantry → { ref, name, quantity, unit, location, expiresOn, notes } (sem id, source e updatedAt). */
export function pantryRefRows(pantry: unknown): Row[] | undefined {
  if (!Array.isArray(pantry)) return undefined;
  return pantry.map((row, index) => {
    const item = isRow(row) ? row : {};
    return {
      ref: recipeRef(index),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expiresOn: item.expiresOn,
      notes: item.notes,
    };
  });
}

/** Básicos ligados do contexto: ausente (apps antigos) = []; chave desconhecida é descartada. */
export function recipeBasics(context: Row): KitchenBasicKey[] {
  return kitchenBasicsSchema.parse(context.kitchenBasics);
}

/** Leitura tolerante de context.pantry e context.kitchenBasics. */
export function recipeRefs(context: Row): RecipeRefs {
  const pantry: unknown[] = Array.isArray(context.pantry) ? context.pantry : [];
  const entries = pantry.flatMap((row, index): [string, RecipeRefItem][] => {
    const id = isRow(row) ? text(row.id) : null;
    const name = isRow(row) ? text(row.name) : null;
    return id && name ? [[recipeRef(index), { id, name }]] : [];
  });
  return {
    refs: entries.map(([ref]) => ref),
    byRef: new Map(entries),
    basics: recipeBasics(context),
  };
}
