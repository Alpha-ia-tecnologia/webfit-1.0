import type { PantryItem } from "../types";
import { localDate, localTime, shiftDate } from "./dates";
import { foodEmoji } from "./food-search";
import { plural } from "./format";
import { kitchenBasic } from "./kitchen-basics";
import { availablePantry, expiryStatus } from "./pantry";
import {
  expiryPill,
  pantryEmoji,
  PANTRY_FALLBACK_GLYPH,
  type ExpiryPill,
} from "./pantry-view";
import type { KitchenBasicKey, RecipeCard, RecipeSet } from "./recipe-schema";
import { CALORIE_PATTERN, visibleText } from "./text";

/**
 * Receitas estruturadas (AGENTE-04): limpeza do texto do modelo, texto determinístico salvo,
 * chips, cobertura do estoque, selo de validade e rótulos. A IA devolve dados; o app desenha.
 */

export const RECIPE_STALE_NOTICE =
  "Seu plano ou seus alimentos mudaram. Gere novas receitas antes de usar esta versão como referência.";
export const RECIPE_QUESTIONS_HINT = "Complete essas informações na anamnese e gere de novo.";
export const RECIPE_ALL_HOME = "Você tem tudo em casa.";
/** Rótulos do item da casa que não está mais disponível na ficha da receita. */
export const RECIPE_EXPIRED_ITEM = "venceu — não use";
export const RECIPE_REMOVED_ITEM = "não está mais na despensa";

export interface RecipeCoverage {
  have: number;
  total: number;
  /** Itens da casa indisponíveis: removidos da despensa ou vencidos. */
  unavailableIds: string[];
  /** Parte de unavailableIds que ainda está na despensa, mas venceu. */
  expiredIds: string[];
}
export interface RecipeSeal {
  itemName: string;
  pill: ExpiryPill;
}

const LEADING_MARK = /^(?:#+\s*|[-*•>]\s+|\d{1,3}[.)]\s+)/;
const PARTIAL_MARKER = /\[[^\]]*$/;
/** Sem "g": search() não guarda estado entre chamadas. */
const CALORIE_MENTION = new RegExp(CALORIE_PATTERN.source, "i");
// Cada code point sai sozinho (ZWJ, tecla U+20E3, VS15/VS16): nenhum caractere combinado na classe.
// eslint-disable-next-line no-misleading-character-class -- remoção por code point, de propósito
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\u20E3\uFE0E\uFE0F]/gu;
const MISSING_PREVIEW = 2;
const FALLBACK_FOOD_EMOJI = "🏷️";

/** Repete a troca até estabilizar (remover "`" de "*`*" forma um novo "**"). */
function replaceAll(text: string, pattern: RegExp, by: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(pattern, by);
    if (next === current) return current;
    current = next;
  }
}

function clip(text: string, max: number): string {
  return text.slice(0, max).replace(PARTIAL_MARKER, "").trim();
}

/**
 * Texto do modelo em uma linha, sem markdown, com calorias mascaradas antes do recorte
 * (o marcador cresce o texto) e sem marcador cortado ao meio. Idempotente.
 */
export function cleanRecipeText(raw: string, max: number, hide = false): string {
  // Marcas antes dos espaços: tirar "`" de "a ` b" deixaria dois espaços seguidos.
  const flat = replaceAll(raw, /\*\*|__|`/g, "").replace(/\s+/g, " ");
  const text = replaceAll(flat.trim(), LEADING_MARK, "").trim();
  let out = clip(hide ? visibleText(text, true) : text, max);
  // O corte pode criar uma menção nova no fim ("300 calzone" → "300 cal"): corta antes dela.
  for (let at = hide ? out.search(CALORIE_MENTION) : -1; at >= 0; at = out.search(CALORIE_MENTION))
    out = clip(out, at);
  return out;
}

/** Remove emoji (e seletores de variação) e junta os espaços que sobrarem. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/** "20 min", "1 h", "1 h 10 min". */
export function fmtMinutes(min: number): string {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const portions = (n: number) => plural(n, "porção", "porções");

/** ["Almoço", "20 min", "2 porções"]. */
export function recipeChips(card: RecipeCard): string[] {
  return [card.refeicao, fmtMinutes(card.tempoMin), portions(card.porcoes)];
}

/** ["25 min", "200 °C"]: só o que o passo define. */
export function stepExtras(step: RecipeCard["passos"][number]): string[] {
  return [
    ...(step.timerMin !== null ? [fmtMinutes(step.timerMin)] : []),
    ...(step.temperaturaC !== null ? [`${step.temperaturaC} °C`] : []),
  ];
}

const withAmount = (name: string, amount: string | null) =>
  amount ? `${name} — ${amount}` : name;

function recipeLines(card: RecipeCard): string[] {
  return [
    `## ${card.nome}`,
    `**Refeição:** ${card.refeicao} · **Tempo:** ${fmtMinutes(card.tempoMin)} · **Rendimento:** ${portions(card.porcoes)}`,
    card.compatibilidade,
    "### Na sua cozinha",
    ...card.ingredientesCasa.map((i) => `- ${withAmount(i.nome, i.quantidade)}`),
    ...(card.basicos.length
      ? [
          "### Básicos da cozinha",
          ...card.basicos.map((b) => `- ${withAmount(kitchenBasic(b.basico).label, b.quantidade)}`),
        ]
      : []),
    ...(card.faltaComprar.length
      ? ["### Falta comprar", ...card.faltaComprar.map((f) => `- ${withAmount(f.nome, f.quantidade)}`)]
      : []),
    "### Modo de preparo",
    ...card.passos.map((step, i) => {
      const extras = stepExtras(step);
      return `${i + 1}. ${step.texto}${extras.length ? ` (${extras.join(" · ")})` : ""}`;
    }),
    ...(card.porcao ? ["### Porção", card.porcao] : []),
  ];
}

/**
 * Texto salvo e revisado das receitas: determinístico, compatível com parseRichText, sem ids,
 * refs, emoji ou chaves de básicos. Uma linha em branco separa receitas e antecede as perguntas.
 */
export function renderRecipeSetText(set: RecipeSet): string {
  const blocks = set.receitas.map((card) => recipeLines(card).join("\n"));
  if (set.perguntas.length)
    blocks.push(
      ["## Antes de sugerir receitas", ...set.perguntas.map((q) => `- ${q}`)].join("\n"),
    );
  return blocks.join("\n\n");
}

/**
 * "8 de 9 ingredientes em casa" (conceito 06): itens da casa ainda disponíveis mais os básicos que a
 * pessoa marcou, contra casa + básicos + falta comprar. Os básicos só entram na receita quando
 * marcados (IA-X4), então contam como em casa; um básico desmarcado depois conta como faltando.
 * Sem `basics`, todos os básicos da receita contam como em casa.
 */
export function recipeCoverage(
  card: RecipeCard,
  pantry: readonly PantryItem[],
  today = localDate(),
  basics: readonly KitchenBasicKey[] = card.basicos.map((b) => b.basico),
): RecipeCoverage {
  const ids = new Set(availablePantry(pantry, today).map((i) => i.id));
  const stocked = new Set(pantry.map((i) => i.id));
  const unavailableIds = card.ingredientesCasa
    .filter((i) => !ids.has(i.pantryItemId))
    .map((i) => i.pantryItemId);
  const marked = card.basicos.filter((b) => basics.includes(b.basico)).length;
  return {
    have: card.ingredientesCasa.length - unavailableIds.length + marked,
    total: card.ingredientesCasa.length + card.basicos.length + card.faltaComprar.length,
    unavailableIds,
    expiredIds: unavailableIds.filter((id) => stocked.has(id)),
  };
}

/** "8 de 9 ingredientes em casa" (o número vai em destaque na tela: coverageCount). */
export function coverageText(c: Pick<RecipeCoverage, "have" | "total">): string {
  return `${coverageCount(c)} ${c.total === 1 ? "ingrediente" : "ingredientes"} em casa`;
}

/** "8 de 9". */
export function coverageCount(c: Pick<RecipeCoverage, "have" | "total">): string {
  return `${c.have} de ${c.total}`;
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
const OPTIONAL_MARK = /\s*\((?:opcional|se quiser|se tiver)\)\s*$/i;

export interface RecipeMissingPill {
  /** "Falta: alecrim". */
  text: string;
  /** O primeiro item veio marcado "(opcional)": a pílula mostra "· opcional". */
  isOptional: boolean;
  /** Quantos itens a comprar além do primeiro ("+1"). */
  more: number;
}

/** Pílula do que falta comprar: "Falta: alecrim" (+ "· opcional", "+1"); null quando não falta nada. */
export function recipeMissingPill(card: RecipeCard): RecipeMissingPill | null {
  const [first, ...rest] = card.faltaComprar;
  if (!first) return null;
  const isOptional = OPTIONAL_MARK.test(first.nome);
  const name = lowerFirst(first.nome.replace(OPTIONAL_MARK, "").trim());
  return { text: `Falta: ${name}`, isOptional, more: rest.length };
}

/** Cortes que viram só o alimento no selo ("Peito de frango" → "frango"). */
const CUT_PREFIX = /^(?:peito|filé|file|coxa|sobrecoxa|lombo|posta|lata|pacote|caixa|pote|pé|maço) de (.+)$/;
/** Femininos que não terminam em "a" (o artigo do selo). */
const FEMININE = new Set(["carne", "alface", "couve", "vagem", "noz", "nozes", "ervilhas"]);

function articleFor(name: string): string {
  const head = name.split(/[\s-]/)[0] ?? name;
  if (FEMININE.has(head)) return head.endsWith("s") ? "as" : "a";
  if (/as$/.test(head)) return "as";
  if (/(?:os|es|ns)$/.test(head)) return "os";
  if (/(?:a|ã|ção|são|dade|agem)$/.test(head)) return "a";
  return "o";
}

/** Selo da receita (conceito 06): "Usa o frango", "Usa a abobrinha", "Usa os ovos". */
export function recipeSealLabel(itemName: string): string {
  const lower = itemName.trim().toLocaleLowerCase("pt-BR");
  const food = CUT_PREFIX.exec(lower)?.[1] ?? lower;
  return `Usa ${articleFor(food)} ${food}`;
}

/** "Falta comprar: cebola, alho +1"; null quando não falta nada. */
export function recipeMissingLine(card: RecipeCard): string | null {
  if (!card.faltaComprar.length) return null;
  const names = card.faltaComprar.slice(0, MISSING_PREVIEW).map((f) => lowerFirst(f.nome));
  const rest = card.faltaComprar.length - MISSING_PREVIEW;
  return `Falta comprar: ${names.join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

/** Selo "vence em breve": o item da casa ainda disponível que vence primeiro; senão null. */
export function recipeSeal(
  card: RecipeCard,
  pantry: readonly PantryItem[],
  today = localDate(),
): RecipeSeal | null {
  const byId = new Map(availablePantry(pantry, today).map((i) => [i.id, i]));
  let first: PantryItem | null = null;
  for (const ingredient of card.ingredientesCasa) {
    const item = byId.get(ingredient.pantryItemId);
    if (!item?.expiresOn || expiryStatus(item.expiresOn, today).tone !== "soon") continue;
    if (!first || item.expiresOn < first.expiresOn!) first = item;
  }
  return first ? { itemName: first.name, pill: expiryPill(first.expiresOn!, today) } : null;
}

/** Emoji do prato pelo nome; senão o do primeiro item da casa; senão o prato genérico. */
export function recipeEmoji(card: RecipeCard): string {
  const byName = foodEmoji({ name: card.nome, category: "" });
  if (byName !== FALLBACK_FOOD_EMOJI) return byName;
  const first = card.ingredientesCasa[0];
  return first ? pantryEmoji(first.nome) : PANTRY_FALLBACK_GLYPH;
}

/** "Criadas hoje às 14:32", "Criadas ontem às 09:05", "Criadas em 20/09[/2025] às 18:40". */
export function recipeGeneratedLabel(createdAt: string, now = new Date()): string {
  const date = new Date(createdAt);
  const day = localDate(date);
  const today = localDate(now);
  const time = localTime(date);
  if (day === today) return `Criadas hoje às ${time}`;
  if (day === shiftDate(today, -1)) return `Criadas ontem às ${time}`;
  const [yyyy, mm, dd] = day.split("-");
  const year = date.getFullYear() === now.getFullYear() ? "" : `/${yyyy}`;
  return `Criadas em ${dd}/${mm}${year} às ${time}`;
}
