import {
  pantryDraftSchema,
  pantryItemSchema,
  recipeSchema,
  type AgentMode,
  type AgentReply,
  type AppState,
  type KitchenBasicKey,
  type PantryDraft,
  type PantryItem,
  type RecipeSet,
  type SavedRecipe,
} from "../types";
import { agentContext, ageAt, localDate, shiftDate, uid } from "./domain";
import { fmtExpiry } from "./format";
import { dietProfileSignature, isDietPlanStale } from "./diet";
import { visiblePlainText } from "./text";
import { USE_FIRST_DAYS } from "./use-first";

export const PANTRY_LOCATIONS = {
  despensa: "Despensa",
  geladeira: "Geladeira",
} as const;
export const PANTRY_UNITS = {
  un: "unidade(s)",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  pacote: "pacote(s)",
} as const;
export const RECIPE_REQUEST =
  "Sugira duas receitas saudáveis para aproveitar meus alimentos disponíveis, de acordo com minha dieta estabelecida. Mostre ingredientes, quantidades sugeridas, rendimento, tempo de preparo, passos e a refeição da dieta em que cada receita se encaixa. Os itens cadastrados a partir da lista de compras já foram comprados. Separe ingredientes que faltam sem presumir que estão disponíveis. Use apenas os básicos de cozinha marcados; tudo o que faltar vai em 'Falta comprar'.";
/**
 * "Criar receitas com eles" (AGENTE-13): o mesmo pedido, priorizando o que vence logo. Sem nomes
 * de alimentos no texto: os nomes só viajam no contexto da despensa (mascarado e revisado).
 */
export const RECIPE_USE_FIRST_REQUEST = `${RECIPE_REQUEST} Priorize os alimentos que vencem nos próximos ${USE_FIRST_DAYS} dias (validade informada pela pessoa) e use pelo menos um deles em cada receita quando combinar com a dieta.`;
export const emptyPantryDraft = (
  location: PantryDraft["location"] = "despensa",
): PantryDraft => ({
  name: "",
  quantity: null,
  unit: "un",
  location,
  expiresOn: null,
  notes: "",
});
export const isExpired = (item: PantryDraft, today = localDate()) =>
  !!item.expiresOn && item.expiresOn < today;
export const availablePantry = (
  items: readonly PantryItem[],
  today = localDate(),
): PantryItem[] => items.filter((i) => !isExpired(i, today));

/** Até quantos dias antes a validade ganha o tom de atenção ("vence em 2 dias"). */
export const EXPIRY_SOON_DAYS = 3;

/**
 * Validade em linguagem de app (SIS-05): "Vence em 2 dias", "Venceu ontem — não usado nas receitas".
 * O tom vai para atenção perto do fim e depois de vencido; nunca vermelho.
 */
export function expiryStatus(
  expiresOn: string,
  today = localDate(),
): { label: string; tone: "expired" | "soon" | "ok" } {
  const text = fmtExpiry(expiresOn, today);
  const label = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  if (expiresOn < today) return { label: `${label} — não usado nas receitas`, tone: "expired" };
  const soon = shiftDate(today, EXPIRY_SOON_DAYS);
  return { label, tone: expiresOn <= soon ? "soon" : "ok" };
}

/** Operação explícita de confirmação: nunca chamada automaticamente após reconhecer uma foto. */
export function savePantryDrafts(
  state: AppState,
  drafts: PantryDraft[],
  source: PantryItem["source"],
  editingId?: string,
): AppState {
  if (!drafts.length || (editingId && drafts.length !== 1))
    throw new Error("Inclua ao menos um alimento antes de salvar.");
  if (editingId && !state.pantry.some((i) => i.id === editingId))
    throw new Error("Este item foi removido. Reabra o cadastro.");
  const stamp = new Date().toISOString();
  const items = drafts.map((draft) =>
    pantryItemSchema.parse({
      ...pantryDraftSchema.parse(draft),
      id: editingId ?? uid(),
      source,
      updatedAt: stamp,
    }),
  );
  const pantry = [...state.pantry.filter((i) => i.id !== editingId), ...items];
  if (pantry.length > 500)
    throw new Error(
      "Limite de 500 itens. Remova itens antigos antes de adicionar novos.",
    );
  return { ...state, pantry };
}

/**
 * Assinatura do estoque disponível (e dos básicos marcados) usada para saber se uma receita
 * salva ainda corresponde ao que há em casa. Sem básicos, o hash é idêntico ao das versões
 * anteriores: receitas já salvas não aparecem como "Estoque alterado".
 */
export function pantrySignature(
  items: readonly PantryItem[],
  basics: readonly KitchenBasicKey[] = [],
): string {
  const value = JSON.stringify(
    availablePantry(items)
      .map(({ id, name, quantity, unit, location, expiresOn, notes }) => ({
        id,
        name,
        quantity,
        unit,
        location,
        expiresOn,
        notes,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const input = basics.length
    ? `${value}|basicos:${[...basics].sort().join(",")}`
    : value;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++)
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function recipeContext(state: AppState) {
  if (!state.profile || !state.dietPlan)
    throw new Error("Crie sua dieta antes de pedir receitas personalizadas.");
  if (isDietPlanStale(state.dietPlan, state.profile))
    throw new Error(
      "Atualize sua dieta para considerar a anamnese atual antes de gerar receitas.",
    );
  const pantry = availablePantry(state.pantry);
  if (!pantry.length)
    throw new Error(
      "Cadastre alimentos disponíveis na despensa ou geladeira. Itens vencidos não entram nas receitas.",
    );
  // Seleção explícita: o plano estruturado (dietPlan.structured) não vai para o prompt de receitas.
  const { id, text, meta, createdAt, profileSignature } = state.dietPlan;
  return {
    ...agentContext(state),
    dietPlan: { id, text, meta, createdAt, profileSignature },
    currentProfileSignature: dietProfileSignature(state.profile),
    pantry,
    kitchenBasics: state.kitchenBasics,
  };
}

/** Receitas estruturadas da resposta do agente, quando vieram (AGENTE-04); senão null. */
export function recipeSetOf(reply: AgentReply): RecipeSet | null {
  return reply.structured?.kind === "recipes" ? reply.structured.set : null;
}

/** Todo item da casa ainda está disponível e todo básico usado continua marcado. */
export function recipeSetMatchesStock(
  set: RecipeSet,
  state: AppState,
  today = localDate(),
): boolean {
  const ids = new Set(availablePantry(state.pantry, today).map((i) => i.id));
  return set.receitas.every(
    (card) =>
      card.ingredientesCasa.every((i) => ids.has(i.pantryItemId)) &&
      card.basicos.every((b) => state.kitchenBasics.includes(b.basico)),
  );
}

export function saveRecipe(
  state: AppState,
  reply: AgentReply,
  snapshot: AppState,
): AppState {
  recipeContext(state);
  if (
    !state.profile?.consentAi ||
    state.userId !== snapshot.userId ||
    state.dietPlan?.id !== snapshot.dietPlan?.id ||
    dietProfileSignature(state.profile) !==
      dietProfileSignature(snapshot.profile!) ||
    pantrySignature(state.pantry, state.kitchenBasics) !==
      pantrySignature(snapshot.pantry, snapshot.kitchenBasics)
  )
    throw new Error(
      "Sua dieta ou seus alimentos mudaram durante a geração. Tente novamente.",
    );
  if (reply.meta.urgency === "imediata") throw new Error(reply.text);
  if (!reply.meta.reviewed || !reply.meta.specialists.includes("nutricionista"))
    throw new Error(
      "O agente não concluiu uma receita revisada. Tente novamente.",
    );
  const set = recipeSetOf(reply);
  const recipe = recipeSchema.parse({
    id: uid(),
    text: reply.text,
    meta: reply.meta,
    createdAt: new Date().toISOString(),
    dietPlanId: state.dietPlan!.id,
    profileSignature: dietProfileSignature(state.profile),
    pantrySignature: pantrySignature(state.pantry, state.kitchenBasics),
    // Só guarda a versão estruturada quando ela corresponde ao estoque; o texto sempre vale.
    ...(set && recipeSetMatchesStock(set, state) ? { recipeSet: set } : {}),
  });
  return { ...state, recipes: [...state.recipes.slice(-29), recipe] };
}

export type RecipeStatus = "current" | "diet_changed" | "stock_changed";

/** Situação de uma receita salva diante da dieta, da anamnese e do estoque atuais (web e app). */
export function recipeStatus(recipe: SavedRecipe, state: AppState): RecipeStatus {
  if (
    !state.profile ||
    recipe.dietPlanId !== state.dietPlan?.id ||
    recipe.profileSignature !== dietProfileSignature(state.profile)
  )
    return "diet_changed";
  return recipe.pantrySignature !== pantrySignature(state.pantry, state.kitchenBasics)
    ? "stock_changed"
    : "current";
}

const SCAN_NAME_MAX = 120;
const SCAN_NOTES_MAX = 500;

/**
 * Rascunhos do reconhecimento por foto com calorias ocultas (regra de saúde): nome e
 * observações passam pela máscara ao chegar, e é isso que a pessoa vê, edita e salva.
 */
export function visibleScanDrafts(
  items: readonly PantryDraft[],
  hide: boolean,
): PantryDraft[] {
  if (!hide) return [...items];
  return items.map((item) => ({
    ...item,
    name: visiblePlainText(item.name, true).slice(0, SCAN_NAME_MAX),
    notes: visiblePlainText(item.notes, true).slice(0, SCAN_NOTES_MAX),
  }));
}

/** Respostas da anamnese que a descrição de refeição usa: alergias, evitados, padrão, sinais de segurança e exibição. */
const MEAL_TEXT_ANSWERS = [
  "allergies",
  "allergyDetails",
  "avoidedFoods",
  "diet",
  "pregnancy",
  "eatingDisorder",
  "fluidRestriction",
  "hideCalories",
  "hideBodyNumbers",
] as const;

/**
 * Descrição de refeição (DIARIO-07): só o necessário para listar o que a pessoa comeu com segurança
 * (idade para o sinal de menor, alergias e sinais). Sem medicamentos, exames, medidas, diário nem metas.
 */
function mealTextContext(state: AppState, date = localDate()) {
  if (!state.profile) throw new Error("Conclua a anamnese primeiro.");
  const profile = state.profile;
  return {
    date,
    age: ageAt(profile.birthDate, date),
    anamnese: Object.fromEntries(MEAL_TEXT_ANSWERS.map((key) => [key, profile[key]])),
    missingInformation: [],
  };
}

export function agentRequestContext(
  state: AppState,
  mode: AgentMode,
  location?: PantryDraft["location"],
) {
  // Rótulo (INJECAO-X2): só a foto vai ao agente; nenhum dado da anamnese, do diário ou do histórico.
  if (mode === "rotulo") return {};
  if (mode === "meal_text") return mealTextContext(state);
  if (mode === "pantry_photo" || mode === "shopping_photo")
    return { location: location ?? "despensa" };
  return mode === "recipe" ? recipeContext(state) : agentContext(state);
}
export function recipeBlockReason(state: AppState): string {
  try {
    recipeContext(state);
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}
