import { z } from "zod";

/**
 * Lista de compras (AGENTE-08). Módulo folha (só zod): types.ts reexporta. Fica no aparelho, como a
 * despensa e as receitas (sem tabela no banco).
 */
export const SHOPPING_SECTIONS = ["hortifruti", "acougue", "laticinios", "padaria", "mercearia", "bebidas", "outros"] as const;
export type ShoppingSection = (typeof SHOPPING_SECTIONS)[number];
export const SHOPPING_ORIGINS = ["dieta", "receita", "manual"] as const;
export type ShoppingOrigin = (typeof SHOPPING_ORIGINS)[number];
export const SHOPPING_LIMITS = { items: 200, name: 120, quantity: 40, note: 80 } as const;
const L = SHOPPING_LIMITS;

export const shoppingItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(L.name),
  /** Texto livre ("2 unidades", "3 refeições na semana"); null quando não há quantidade. */
  quantity: z.string().trim().min(1).max(L.quantity).nullable().catch(null),
  section: z.enum(SHOPPING_SECTIONS).catch("outros"),
  origin: z.enum(SHOPPING_ORIGINS).catch("manual"),
  /** De onde veio, só para mostrar ("Almoço · Jantar", "Receita: Arroz com tomate"). */
  note: z.string().trim().max(L.note).catch(""),
  checked: z.boolean().catch(false),
  addedAt: z.string().datetime(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export const shoppingListSchema = z.array(shoppingItemSchema).max(L.items);
