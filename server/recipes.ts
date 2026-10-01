import { z } from "zod";
import {
  allergenIn,
  allergenTokens,
  type AllergenMode,
} from "../src/lib/allergens";
import { kitchenBasic } from "../src/lib/kitchen-basics";
import {
  KITCHEN_BASIC_KEYS,
  RECIPE_LIMITS,
  RECIPE_MEALS,
  recipeSetSchema,
  type KitchenBasicKey,
  type RecipeCard,
  type RecipeSet,
} from "../src/lib/recipe-schema";
import {
  cleanRecipeText,
  renderRecipeSetText,
  stripEmoji,
} from "../src/lib/recipe-set";
import type { StructuredField, StructuredSpec } from "./structured";
import { RECIPE_JSON_ADDENDUM, RECIPE_JSON_SENSITIVE } from "./graph/prompts";
import { isUiSensitive, type Flags } from "./graph/state";
import { recipeRefs, type RecipeRefs } from "./recipe-refs";

/**
 * Receitas estruturadas (AGENTE-04) com básicos de cozinha (IA-X4). O esquema estrito é montado
 * por pedido: `ref` só aceita as refs da despensa enviada e `basico` só os básicos ligados. A
 * leitura repara o que dá para reparar (texto, números, repetições, listas longas) e mascara
 * calorias antes de recortar; recusa ref desconhecida, básico desligado, alergênico e resultado
 * vazio. O valor guardado no grafo ainda usa refs (é o RASCUNHO_ANTERIOR de uma revisão, sem ids
 * do estoque); ids e nomes do estoque entram só na resposta.
 */

type Json = Record<string, unknown>;
type Amount = string | null;
const L = RECIPE_LIMITS;

export const RECIPE_SCHEMA_NAME = "receitas";
/** Nome de item que a limpeza esvaziou (ex.: "##"): nunca mostra a ref. */
const STOCK_FALLBACK_NAME = "Item da despensa";

export interface RecipeDraftCard {
  nome: string;
  refeicao: RecipeCard["refeicao"];
  porcoes: number;
  tempoMin: number;
  compatibilidade: string;
  ingredientesCasa: { ref: string; quantidade: Amount }[];
  basicos: { basico: KitchenBasicKey; quantidade: Amount }[];
  faltaComprar: { nome: string; quantidade: Amount }[];
  passos: RecipeCard["passos"];
  porcao: string;
}
/** Saída do modelo reparada e validada, ainda com refs no lugar dos ids do estoque. */
export interface RecipeDraft {
  receitas: RecipeDraftCard[];
  perguntas: string[];
}

const str: Json = { type: "string" };
const nullableStr: Json = { type: ["string", "null"] };
const nullableInt: Json = { type: ["integer", "null"] };
const choice = (values: readonly string[]): Json => ({ type: "string", enum: [...values] });
const closed = (properties: Record<string, Json>): Json => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const list = (items: Json, maxItems: number, minItems = 0): Json => ({
  type: "array",
  ...(minItems ? { minItems } : {}),
  maxItems,
  items,
});

/** Esquema estrito (OpenAI strict; DeepSeek valida o mesmo objeto). Sem básicos ligados, basicos tem maxItems 0. */
export function recipeJsonSchema(refs: RecipeRefs): Json {
  // Um enum não pode ser vazio: sem básicos ligados vai a lista completa, travada por maxItems 0.
  const basics = refs.basics.length ? refs.basics : KITCHEN_BASIC_KEYS;
  const card = closed({
    nome: str,
    refeicao: choice(RECIPE_MEALS),
    porcoes: { type: "integer" },
    tempoMin: { type: "integer" },
    compatibilidade: str,
    ingredientesCasa: list(closed({ ref: choice(refs.refs), quantidade: nullableStr }), L.casa, 1),
    basicos: list(
      closed({ basico: choice(basics), quantidade: nullableStr }),
      Math.min(refs.basics.length, L.basicos),
    ),
    faltaComprar: list(closed({ nome: str, quantidade: nullableStr }), L.compras),
    passos: list(
      closed({ texto: str, timerMin: nullableInt, temperaturaC: nullableInt }),
      L.passos,
      1,
    ),
    porcao: str,
  });
  return closed({ receitas: list(card, L.receitas), perguntas: list(str, L.perguntas) });
}

/** Leitura tolerante do JSON cru: tipos frouxos, listas opcionais; só refs e básicos ligados passam. */
function rawSchema(refs: RecipeRefs) {
  const amount = z.string().nullish();
  const whole = z.number().nullish();
  const ref = z.string().refine((r) => refs.byRef.has(r), "Item fora da despensa enviada.");
  const basico = z.custom<KitchenBasicKey>(
    (key) => typeof key === "string" && (refs.basics as readonly string[]).includes(key),
    "Básico de cozinha não marcado.",
  );
  const card = z.object({
    nome: z.string(),
    refeicao: z.enum(RECIPE_MEALS),
    porcoes: z.number(),
    tempoMin: z.number(),
    compatibilidade: z.string(),
    ingredientesCasa: z.array(z.object({ ref, quantidade: amount })),
    basicos: z.array(z.object({ basico, quantidade: amount })).default([]),
    faltaComprar: z.array(z.object({ nome: z.string(), quantidade: amount })).default([]),
    passos: z.array(z.object({ texto: z.string(), timerMin: whole, temperaturaC: whole })),
    porcao: z.string().nullish(),
  });
  return z.object({
    receitas: z.array(card).default([]),
    perguntas: z.array(z.string()).default([]),
  });
}
type RawCard = z.output<ReturnType<typeof rawSchema>>["receitas"][number];

const clamp = (n: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, Math.round(n)));
const inRange = (
  n: number | null | undefined,
  [min, max]: readonly [number, number],
): number | null => {
  if (n === null || n === undefined) return null;
  const value = Math.round(n);
  return value >= min && value <= max ? value : null;
};
/** Primeira ocorrência de cada chave, na ordem original. */
const unique = <T>(items: readonly T[], key: (item: T) => string): T[] =>
  items.filter((item, i) => items.findIndex((other) => key(other) === key(item)) === i);

function repairCard(raw: RawCard, hide: boolean): RecipeDraftCard {
  const clean = (text: string, max: number) => cleanRecipeText(text, max, hide);
  const amount = (q: string | null | undefined): Amount =>
    q ? clean(q, L.quantidade) || null : null;
  return {
    nome: clean(stripEmoji(raw.nome), L.nome),
    refeicao: raw.refeicao,
    porcoes: clamp(raw.porcoes, L.porcoes),
    tempoMin: clamp(raw.tempoMin, L.tempoMin),
    compatibilidade: clean(raw.compatibilidade, L.compatibilidade),
    ingredientesCasa: unique(raw.ingredientesCasa, (i) => i.ref)
      .slice(0, L.casa)
      .map((i) => ({ ref: i.ref, quantidade: amount(i.quantidade) })),
    basicos: unique(raw.basicos, (b) => b.basico)
      .slice(0, L.basicos)
      .map((b) => ({ basico: b.basico, quantidade: amount(b.quantidade) })),
    faltaComprar: raw.faltaComprar
      .map((f) => ({ nome: clean(stripEmoji(f.nome), L.compraNome), quantidade: amount(f.quantidade) }))
      .filter((f) => f.nome)
      .slice(0, L.compras),
    passos: raw.passos
      .map((p) => ({
        texto: clean(p.texto, L.passo),
        timerMin: inRange(p.timerMin, L.timerMin),
        temperaturaC: inRange(p.temperaturaC, L.temperaturaC),
      }))
      .filter((p) => p.texto)
      .slice(0, L.passos),
    porcao: clean(raw.porcao ?? "", L.porcao),
  };
}

/** Ids e nomes do estoque no lugar das refs; nomes limpos e com calorias ocultas quando pedido. */
export function recipeSetFromDraft(draft: RecipeDraft, refs: RecipeRefs, hide = false): RecipeSet {
  return {
    version: 2,
    receitas: draft.receitas.map((card) => ({
      ...card,
      ingredientesCasa: card.ingredientesCasa.map(({ ref, quantidade }) => {
        const item = refs.byRef.get(ref);
        return {
          pantryItemId: item?.id ?? "",
          nome: (item && cleanRecipeText(item.name, L.itemNome, hide)) || STOCK_FALLBACK_NAME,
          quantidade,
        };
      }),
    })),
    perguntas: draft.perguntas,
  };
}

/** Textos em que um alergênico declarado recusa a saída (nome do prato tolera "sem amendoim"). */
function allergenTargets(card: RecipeDraftCard, refs: RecipeRefs): [string, AllergenMode][] {
  return [
    [card.nome, "name"],
    ...card.ingredientesCasa.map((i): [string, AllergenMode] => [refs.byRef.get(i.ref)?.name ?? "", "food"]),
    ...card.basicos.map((b): [string, AllergenMode] => [kitchenBasic(b.basico).label, "food"]),
    ...card.faltaComprar.map((f): [string, AllergenMode] => [f.nome, "food"]),
    ...card.passos.map((p): [string, AllergenMode] => [p.texto, "food"]),
  ];
}

function recipeProblems(draft: RecipeDraft, refs: RecipeRefs, flags: Flags): string[] {
  const tokens = allergenTokens(flags.allergyDetails);
  const allergen = draft.receitas.some((card) =>
    allergenTargets(card, refs).some(([text, mode]) => allergenIn(text, tokens, mode) !== null),
  );
  // O contrato cobre listas vazias, receita sem item da casa ou sem passo e textos que a limpeza esvaziou.
  const contract = recipeSetSchema.safeParse(recipeSetFromDraft(draft, refs, flags.hideCalories));
  return [
    ...(allergen ? ["Alergênico declarado na receita."] : []),
    ...(contract.success ? [] : ["Receitas fora do contrato."]),
  ];
}

/** JSON cru do modelo → rascunho reparado (com refs). Falha = formato inválido (vai para o texto). */
export function recipeDraftSchema(refs: RecipeRefs, flags: Flags): z.ZodType<RecipeDraft> {
  const hide = flags.hideCalories;
  return rawSchema(refs)
    .transform(
      (raw): RecipeDraft => ({
        receitas: raw.receitas.slice(0, L.receitas).map((card) => repairCard(card, hide)),
        perguntas: raw.perguntas
          .map((q) => cleanRecipeText(q, L.pergunta, hide))
          .filter(Boolean)
          .slice(0, L.perguntas),
      }),
    )
    .superRefine((draft, ctx) => {
      for (const message of recipeProblems(draft, refs, flags))
        ctx.addIssue({ code: "custom", message });
    });
}

/** JSON cru do modelo → RecipeSet v2 validado (ids e nomes do estoque). */
export function recipeOutputSchema(refs: RecipeRefs, flags: Flags): z.ZodType<RecipeSet> {
  return recipeDraftSchema(refs, flags)
    .transform((draft) => recipeSetFromDraft(draft, refs, flags.hideCalories))
    .pipe(recipeSetSchema);
}

/** Adendo das tentativas em JSON; perfil sensível (regra de tela do cliente) ganha a cautela extra. */
export function recipeJsonAddendum(flags: Flags): string {
  return isUiSensitive(flags)
    ? `${RECIPE_JSON_ADDENDUM}\n${RECIPE_JSON_SENSITIVE}`
    : RECIPE_JSON_ADDENDUM;
}

const field = (text: string, kind: StructuredField["kind"]): StructuredField => ({ text, kind });
const amountFields = (items: readonly { quantidade: Amount }[]): StructuredField[] =>
  items.flatMap((i) => (i.quantidade ? [field(i.quantidade, "card")] : []));

/**
 * Campos que a guarda estruturada examina: só o que o modelo escreveu. Nomes do estoque são dados
 * da pessoa ("Iogurte 0% gordura" não vira dado inventado) e ficam de fora; o alergênico neles já
 * foi recusado, com a regra estrita, na leitura do JSON. Quantidades entram como "card" (número de
 * nutrição conferido, alergênico não).
 */
export function recipeFields(draft: RecipeDraft): StructuredField[] {
  return [
    ...draft.receitas.flatMap((card) => [
      field(card.nome, "name"),
      field(card.compatibilidade, "prose"),
      ...amountFields(card.ingredientesCasa),
      ...card.basicos.map((b) => field(kitchenBasic(b.basico).label, "food")),
      ...amountFields(card.basicos),
      ...card.faltaComprar.map((f) => field(f.nome, "food")),
      ...amountFields(card.faltaComprar),
      ...card.passos.map((p) => field(p.texto, "prose")),
      ...(card.porcao ? [field(card.porcao, "prose")] : []),
    ]),
    ...draft.perguntas.map((q) => field(q, "prose")),
  ];
}

/**
 * Especificação estruturada do modo receita, montada com a despensa e os básicos do pedido.
 * Sem item válido na despensa não há enum de refs possível: null (o especialista responde em texto).
 */
export function recipeStructuredSpec(
  flags: Flags,
  context: Record<string, unknown>,
): StructuredSpec<RecipeDraft> | null {
  const refs = recipeRefs(context);
  if (!refs.refs.length) return null;
  const toSet = (draft: RecipeDraft) => recipeSetFromDraft(draft, refs, flags.hideCalories);
  return {
    kind: "recipes",
    name: RECIPE_SCHEMA_NAME,
    jsonSchema: recipeJsonSchema(refs),
    schema: recipeDraftSchema(refs, flags),
    addendum: recipeJsonAddendum(flags),
    render: (draft) => renderRecipeSetText(toSet(draft)),
    fields: recipeFields,
    toReply: (results) => {
      const draft = results.find((r) => r.role === "nutricionista")?.value;
      return draft ? { kind: "recipes", set: toSet(draft) } : null;
    },
  };
}
