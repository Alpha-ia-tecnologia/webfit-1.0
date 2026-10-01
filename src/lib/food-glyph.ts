/**
 * Emoji de alimentos e refeições (fidelidade visual: Hoje, Diário, Registrar refeição, Dieta, Despensa).
 * Só enfeite: o texto ao lado sempre diz o que é, então `null` vira o ícone lucide da refeição.
 * Leve de propósito (sem a Tabela TACO): o Hoje e o Diário importam daqui no primeiro desenho.
 */
import type { FoodItem, MealItem } from "../types";
import { foodEmoji } from "./food-search";

/** O que foodEmoji devolve quando nada casa (etiqueta genérica): aqui vira null. */
const GENERIC_EMOJI = "🏷️";
/** Palavras curtas ("de", "com", "pão") não bastam para achar o alimento por palavra solta. */
const MIN_WORD_LENGTH = 4;

const known = (emoji: string) => (emoji === GENERIC_EMOJI ? null : emoji);

/** Emoji de um alimento da TACO (ou da pessoa): pelo nome, depois pela categoria; null sem nenhum. */
export function glyphForFood(food: Pick<FoodItem, "name" | "category">): string | null {
  return known(foodEmoji(food));
}

/**
 * Emoji de um nome livre (despensa, plano, sugestão do agente): o nome inteiro e, sem acerto,
 * cada palavra no singular ("Ovos caipiras" → 🥚). null quando nada casa.
 */
export function glyphForName(name: string): string | null {
  const direct = known(foodEmoji({ name, category: "" }));
  if (direct) return direct;
  for (const word of name.split(/[^\p{L}]+/u)) {
    if (word.length < MIN_WORD_LENGTH) continue;
    const emoji = known(foodEmoji({ name: word.replace(/s$/i, ""), category: "" }));
    if (emoji) return emoji;
  }
  return null;
}

/** Energia do item (kcal), para achar o alimento principal da refeição. */
const energyOf = (item: MealItem) => (item.grams * item.food.caloriesPer100g) / 100;

/** Bebidas que representam o café da manhã (conceito do Hoje: a xícara, não o pão). */
const BREAKFAST_DRINKS = ["☕", "🥛", "🍵"];

/**
 * Emoji da refeição = o do item de maior energia (o "prato principal"); se ele não tiver emoji,
 * o do próximo. No café da manhã, a bebida típica (café, leite ou chá) vem antes, como no conceito.
 * null sem itens (registro só com descrição) ou sem nenhum emoji.
 */
export function mealGlyph(items: readonly MealItem[] | undefined, category?: string): string | null {
  if (category && /^caf[eé] da manh[aã]/i.test(category)) {
    for (const item of items ?? []) {
      const glyph = glyphForFood(item.food);
      if (glyph && BREAKFAST_DRINKS.includes(glyph)) return glyph;
    }
  }
  const ranked = [...(items ?? [])].sort((a, b) => energyOf(b) - energyOf(a));
  for (const item of ranked) {
    const glyph = glyphForFood(item.food);
    if (glyph) return glyph;
  }
  return null;
}
