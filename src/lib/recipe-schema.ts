import { z } from "zod";

/**
 * Receitas estruturadas (AGENTE-04) e básicos de cozinha (IA-X4). Módulo folha (só zod):
 * types.ts reexporta, e structured.ts usa sem criar ciclo com types.ts.
 */

/** Básicos de cozinha (IA-X4): a ordem é a canônica dos chips e do estado. */
export const KITCHEN_BASIC_KEYS = [
  "sal",
  "azeite",
  "oleo",
  "alho",
  "cebola",
  "limao",
  "pimenta",
  "vinagre",
  "manteiga",
  "farinha",
  "oregano",
  "cheiro_verde",
] as const;
export const kitchenBasicSchema = z.enum(KITCHEN_BASIC_KEYS);
export type KitchenBasicKey = z.infer<typeof kitchenBasicSchema>;
/**
 * Tolerante: chave desconhecida (app mais novo, backup de outra versão) ou valor inválido
 * é descartado em vez de recusar o estado; sem duplicatas e na ordem canônica.
 */
export const kitchenBasicsSchema = z
  .array(z.string().max(40))
  .max(50)
  .catch([])
  .transform((keys): KitchenBasicKey[] => KITCHEN_BASIC_KEYS.filter((k) => keys.includes(k)));

/** Limites das receitas estruturadas: fonte única para zod, JSON Schema do servidor e recorte. */
export const RECIPE_LIMITS = {
  receitas: 2,
  perguntas: 3,
  casa: 12,
  basicos: 12,
  compras: 10,
  passos: 10,
  nome: 80,
  compatibilidade: 240,
  itemNome: 120,
  compraNome: 60,
  quantidade: 40,
  passo: 280,
  porcao: 240,
  pergunta: 240,
  porcoes: [1, 12],
  tempoMin: [1, 600],
  timerMin: [1, 240],
  temperaturaC: [30, 300],
} as const;
/** Refeições das receitas: iguais a MEAL_CATEGORIES (src/lib/meals.ts); teste garante. */
export const RECIPE_MEALS = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"] as const;
const L = RECIPE_LIMITS;
const SINGLE_LINE = /^[^\r\n]*$/;
const recipeText = (max: number) => z.string().trim().min(1).max(max).regex(SINGLE_LINE);
const recipeAmount = recipeText(L.quantidade).nullable();
const recipeInt = ([min, max]: readonly [number, number]) => z.number().int().min(min).max(max);

export const recipeCardSchema = z
  .object({
    nome: recipeText(L.nome),
    refeicao: z.enum(RECIPE_MEALS),
    porcoes: recipeInt(L.porcoes),
    tempoMin: recipeInt(L.tempoMin),
    compatibilidade: recipeText(L.compatibilidade),
    ingredientesCasa: z
      .array(
        z.object({
          pantryItemId: z.string().min(1).max(100),
          /** Nome do item no momento da geração (do estoque, nunca do modelo). */
          nome: recipeText(L.itemNome),
          quantidade: recipeAmount,
        }),
      )
      .min(1)
      .max(L.casa),
    basicos: z
      .array(z.object({ basico: kitchenBasicSchema, quantidade: recipeAmount }))
      .max(L.basicos),
    faltaComprar: z
      .array(z.object({ nome: recipeText(L.compraNome), quantidade: recipeAmount }))
      .max(L.compras),
    passos: z
      .array(
        z.object({
          texto: recipeText(L.passo),
          timerMin: recipeInt(L.timerMin).nullable(),
          temperaturaC: recipeInt(L.temperaturaC).nullable(),
        }),
      )
      .min(1)
      .max(L.passos),
    porcao: z.string().trim().max(L.porcao).regex(SINGLE_LINE),
  })
  .superRefine((card, ctx) => {
    const ids = card.ingredientesCasa.map((i) => i.pantryItemId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", path: ["ingredientesCasa"], message: "Item repetido." });
    const basics = card.basicos.map((b) => b.basico);
    if (new Set(basics).size !== basics.length)
      ctx.addIssue({ code: "custom", path: ["basicos"], message: "Básico repetido." });
  });

export const recipeSetSchema = z
  .object({
    version: z.literal(2),
    receitas: z.array(recipeCardSchema).max(L.receitas),
    perguntas: z.array(recipeText(L.pergunta)).max(L.perguntas),
  })
  .superRefine((set, ctx) => {
    if (!set.receitas.length && !set.perguntas.length)
      ctx.addIssue({ code: "custom", path: ["receitas"], message: "Receitas ou perguntas." });
  });
export type RecipeSet = z.infer<typeof recipeSetSchema>;
export type RecipeCard = RecipeSet["receitas"][number];
