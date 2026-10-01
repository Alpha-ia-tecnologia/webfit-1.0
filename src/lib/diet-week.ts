import type { DiaryEntry, FoodItem, MealItem, PantryItem } from "../types";
import type { BlockMeal } from "./agent-blocks";
import { allergenIn, allergenTokens, normalizeText } from "./allergens";
import { localDate, shiftDate, WEEKDAYS, weekdayOf } from "./dates";
import { mealCategoryOf } from "./diary-day";
import {
  SLOT_CATEGORY,
  SLOT_LABEL,
  type DietItem,
  type DietMeal,
  type DietPlanV2,
  type DietSlot,
} from "./diet-plan";
import { fmtNumber, fmtShortDate, plural } from "./format";
import { matchTaco, plannedPreset, resolvePlanned } from "./taco-match";
import { expiringSoon } from "./use-first";

/**
 * Semana do plano (IA-X5) e ações por refeição (AGENTE-09), sem IA: cada dia gira as trocas já
 * revisadas do plano. O dia 0 da rotação é o dia em que o plano foi criado (mostra o plano como
 * foi revisado). Trocas que coincidem com alergia declarada nunca entram na rotação. Funções
 * puras, compartilhadas por web e app; nunca mutam o plano.
 */

export const PLAN_WEEK_DAYS = 7;

export interface SwapMark {
  item: number;
  replaces: string;
}
export interface DayMealInfo {
  index: number;
  swaps: SwapMark[];
  /** algum item tem ≥ 2 opções seguras */
  canSwap: boolean;
}
export interface DayPlan {
  date: string;
  offset: number;
  plan: DietPlanV2;
  meals: DayMealInfo[];
  hasVariation: boolean;
}
export interface WeekDay {
  date: string;
  letter: string;
  day: string;
  isToday: boolean;
  hasVariation: boolean;
  aria: string;
}
export interface PlanDayStatus {
  /** Horário do registro que marca cada refeição (índices de plan.refeicoes); null = sem registro. */
  registeredAt: (string | null)[];
  done: number;
  total: number;
  text: string;
}
export type PlanMealAction =
  | { kind: "log"; category: BlockMeal; items: MealItem[] }
  | { kind: "review"; category: BlockMeal; preset: { category: string; items: MealItem[]; note: string } };

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const sameFood = (a: string, b: string) => normalizeText(a).trim() === normalizeText(b).trim();
/** "a", "a e b", "a, b e c". */
const joinList = (names: readonly string[]) =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
const lower = (text: string) => text.toLocaleLowerCase("pt-BR");

/**
 * Alergênico declarado no nome ou no alimento da TACO ligado a ele (mesma regra de
 * resolvePlanned): "pão francês" liga a "Pão, trigo, francês" e conta para alergia a trigo.
 * Também usado pela lista de compras.
 */
export function isAllergenFood(name: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return false;
  return !!allergenIn(`${name} ${matchTaco(name)?.name ?? ""}`, tokens, "food");
}

/** Dia local de criação do plano: o dia 0 da rotação (mostra o plano como foi revisado). */
export function planAnchor(createdAt: string): string {
  return localDate(new Date(createdAt));
}

/** ((dias entre anchor e date) mod 7 + 7) mod 7, por Date.UTC (sem fuso). Data inválida → 0 (plano original). */
export function dayOffset(anchor: string, date: string): number {
  const diff = Math.round(dayNumber(date) - dayNumber(anchor));
  if (!Number.isFinite(diff)) return 0;
  return ((diff % PLAN_WEEK_DAYS) + PLAN_WEEK_DAYS) % PLAN_WEEK_DAYS;
}

/** Segunda a domingo da semana de `today`. */
export function weekOf(today: string): string[] {
  const monday = shiftDate(today, -((weekdayOf(today) + 6) % 7));
  return Array.from({ length: PLAN_WEEK_DAYS }, (_, i) => shiftDate(monday, i));
}

/** [alimento, ...trocas sem alergênico declarado, sem repetir por normalizeText]. O original fica sempre. */
export function itemOptions(item: DietItem, tokens: readonly string[]): string[] {
  const safe = item.trocas.filter(
    (troca, i) =>
      normalizeText(troca).trim() !== "" &&
      !sameFood(troca, item.alimento) &&
      item.trocas.findIndex((other) => sameFood(other, troca)) === i &&
      !isAllergenFood(troca, tokens),
  );
  return [item.alimento, ...safe];
}

/**
 * Item i usa opts[step % opts.length]; trocado → { alimento: pick, medidaCaseira: "", gramas: null,
 * trocas: [original.alimento, ...original.trocas] sem o pick }. step % n = 0 → o próprio objeto original.
 * Sem nenhuma troca, devolve a própria refeição (mesmo objeto).
 */
export function variantMeal(
  meal: DietMeal,
  step: number,
  tokens: readonly string[],
): { meal: DietMeal; swaps: SwapMark[] } {
  const picked = meal.itens.map((item, index) => {
    const opts = itemOptions(item, tokens);
    const k = ((step % opts.length) + opts.length) % opts.length;
    if (k === 0) return { item, swap: null };
    const pick = opts[k];
    const swapped: DietItem = {
      alimento: pick,
      medidaCaseira: "",
      gramas: null,
      trocas: [item.alimento, ...item.trocas].filter((name) => !sameFood(name, pick)),
    };
    return { item: swapped, swap: { item: index, replaces: item.alimento } };
  });
  const swaps = picked.flatMap((p) => (p.swap ? [p.swap] : []));
  if (!swaps.length) return { meal, swaps: [] };
  return { meal: { ...meal, itens: picked.map((p) => p.item) }, swaps };
}

/**
 * step da refeição i = dayOffset(anchor, date) + (extra[i] ?? 0). resumo/dicas/perguntas iguais.
 * Sem troca → plan original (identidade).
 */
export function planForDay(
  plan: DietPlanV2,
  opts: {
    anchor: string;
    date: string;
    allergyDetails: string;
    extra?: Readonly<Record<number, number>>;
  },
): DayPlan {
  const tokens = allergenTokens(opts.allergyDetails);
  const offset = dayOffset(opts.anchor, opts.date);
  const variants = plan.refeicoes.map((meal, index) =>
    variantMeal(meal, offset + (opts.extra?.[index] ?? 0), tokens),
  );
  const meals = plan.refeicoes.map((meal, index) => ({
    index,
    swaps: variants[index].swaps,
    canSwap: meal.itens.some((item) => itemOptions(item, tokens).length >= 2),
  }));
  const hasVariation = variants.some((v, index) => v.meal !== plan.refeicoes[index]);
  return {
    date: opts.date,
    offset,
    plan: hasVariation ? { ...plan, refeicoes: variants.map((v) => v.meal) } : plan,
    meals,
    hasVariation,
  };
}

/** 7 dias de weekOf(today); letter = WEEKDAYS[weekdayOf].short; day = número sem zero; aria como em §1.2. */
export function planWeek(
  plan: DietPlanV2,
  opts: { anchor: string; today: string; allergyDetails: string },
): WeekDay[] {
  return weekOf(opts.today).map((date) => {
    const { hasVariation } = planForDay(plan, {
      anchor: opts.anchor,
      date,
      allergyDetails: opts.allergyDetails,
    });
    const isToday = date === opts.today;
    const aria = `${fmtShortDate(date)}${isToday ? ", hoje" : ""}, ${hasVariation ? "com variação" : "plano original"}`;
    return {
      date,
      letter: WEEKDAYS[weekdayOf(date)].short,
      day: String(Number(date.slice(8, 10))),
      isToday,
      hasVariation,
      aria,
    };
  });
}

/** Refeições do plano em ordem de horário; sem horário ao fim, na ordem do plano (sort estável). */
function mealsByTime(plan: DietPlanV2): { meal: DietMeal; index: number }[] {
  const rank = (meal: DietMeal) => (meal.horario === null ? 1 : 0);
  return plan.refeicoes
    .map((meal, index) => ({ meal, index }))
    .sort(
      (a, b) =>
        rank(a.meal) - rank(b.meal) || (a.meal.horario ?? "").localeCompare(b.meal.horario ?? ""),
    );
}

/**
 * Regra de contagem igual a nextPlannedMeal: refeições em ordem de horário (sem horário ao fim,
 * na ordem do plano); a k-ésima refeição registrada em `date` de uma categoria (mealCategoryOf,
 * por horário) marca a k-ésima do plano.
 */
export function planDayStatus(
  plan: DietPlanV2,
  diary: readonly DiaryEntry[],
  date: string,
): PlanDayStatus {
  const logged = diary
    .filter((entry) => entry.date === date && entry.type === "refeicao")
    .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({ category: mealCategoryOf(entry), time: entry.time }));
  const ordered = mealsByTime(plan);
  const marks = new Map(
    ordered.map(({ meal, index }, position) => {
      const category = SLOT_CATEGORY[meal.slot];
      const earlier = ordered
        .slice(0, position)
        .filter((other) => SLOT_CATEGORY[other.meal.slot] === category).length;
      const entry = logged.filter((e) => e.category === category)[earlier];
      return [index, entry?.time ?? null] as const;
    }),
  );
  const registeredAt = plan.refeicoes.map((_, index) => marks.get(index) ?? null);
  const done = registeredAt.filter((time) => time !== null).length;
  const total = plan.refeicoes.length;
  return { registeredAt, done, total, text: PLAN_DAY_COPY.progress(done, total) };
}

/**
 * Estado de cada refeição do plano hoje (fidelidade visual da Dieta): done = registrada (recolhida,
 * "Feita"); next = a próxima (aberta, em destaque); past = sem registro e antes da próxima na ordem
 * de horário, ou, sem próxima, com o horário já passado (recolhida, sem cobrança); future = o resto
 * e as sem horário (abertas). Nunca "atrasada".
 */
export type PlanMealState = "done" | "past" | "next" | "future";

export function planMealStates(
  plan: DietPlanV2,
  registeredAt: readonly (string | null)[],
  nextIndex: number | null,
  now: string,
): PlanMealState[] {
  const ordered = mealsByTime(plan);
  const position = new Map(ordered.map(({ index }, rank) => [index, rank]));
  const nextRank = nextIndex === null ? null : (position.get(nextIndex) ?? null);
  return plan.refeicoes.map((meal, index): PlanMealState => {
    if (registeredAt[index]) return "done";
    if (index === nextIndex) return "next";
    if (!meal.horario) return "future";
    if (nextRank !== null) return (position.get(index) ?? 0) < nextRank ? "past" : "future";
    return meal.horario <= now ? "past" : "future";
  });
}

/** Números de uma refeição do plano, só da TACO (macroEstimate). */
export interface MealNumbers {
  kcal: number | null;
  protein: number | null;
  grams: { protein: number; carbs: number; fat: number } | null;
  isPartial: boolean;
}

/**
 * Textos de kcal e proteína de uma refeição do plano: "≈ 180 kcal" (≈ quando algum item ficou fora
 * da TACO) e "9 g proteína" (curto: "9 g prot."). Calorias ocultas: sem kcal; perfil sensível: nada.
 */
export function mealEstimateText(
  numbers: MealNumbers,
  opts: { hideCalories: boolean; sensitive: boolean; compact?: boolean },
): { kcal: string | null; protein: string | null } {
  if (opts.sensitive) return { kcal: null, protein: null };
  const approx = numbers.isPartial ? "≈ " : "";
  const kcal =
    numbers.kcal !== null && !opts.hideCalories ? `${approx}${fmtNumber(numbers.kcal)} kcal` : null;
  const protein =
    numbers.protein !== null
      ? `${approx}${fmtNumber(numbers.protein)} g ${opts.compact ? "prot." : "proteína"}`
      : null;
  return { kcal, protein };
}

/** Legenda da barra da refeição em gramas: "P 9 · C 21 · G 7 g". */
export function macroGramsText(grams: { protein: number; carbs: number; fat: number }): string {
  return `P ${fmtNumber(grams.protein)} · C ${fmtNumber(grams.carbs)} · G ${fmtNumber(grams.fat)} g`;
}

/** Nome acessível da barra: "Estimativa TACO: proteínas 9 g, carboidratos 21 g, gorduras 7 g". */
export function macroGramsLabel(grams: { protein: number; carbs: number; fat: number }): string {
  return `Estimativa TACO: proteínas ${fmtNumber(grams.protein)} g, carboidratos ${fmtNumber(grams.carbs)} g, gorduras ${fmtNumber(grams.fat)} g`;
}

/** Tipo de uma dica do plano (texto livre do agente), para o ícone do atalho "Para facilitar". */
export type TipKind = "water" | "pantry" | "label" | "shopping" | "cooking" | "other";

const TIP_RULES: readonly [RegExp, TipKind][] = [
  [/\b(agua|beba|hidrat)/, "water"],
  [/\b(despensa|use primeiro|vence|geladeira)/, "pantry"],
  [/\brotulo/, "label"],
  [/\b(compra|lista|mercado|feira)/, "shopping"],
  [/\b(proteina|cozinh|marmit|prepar|congel)/, "cooking"],
];

export function tipKind(tip: string): TipKind {
  const text = normalizeText(tip);
  return TIP_RULES.find(([rule]) => rule.test(text))?.[1] ?? "other";
}

/** Atalho "Despensa" da Dieta: "2 vencem logo" (ponto âmbar) ou quantos alimentos há. */
export function pantryTileText(
  items: readonly PantryItem[],
  today: string,
): { text: string; isSoon: boolean } {
  const soon = expiringSoon(items, today).length;
  if (soon > 0) return { text: plural(soon, "vence logo", "vencem logo"), isSoon: true };
  if (!items.length) return { text: "Cadastre seus alimentos", isSoon: false };
  return { text: plural(items.length, "alimento", "alimentos"), isSoon: false };
}

/** Atalho "Compras" da Dieta: "3 itens na lista" ou o convite para montar a lista. */
export function shoppingTileText(count: number): string {
  return count > 0 ? plural(count, "item na lista", "itens na lista") : "Monte pelo plano";
}

/** "log" só quando todo item é ok na TACO (sem ausente nem alergênico); senão "review" com plannedPreset. */
export function planMealAction(
  meal: DietMeal,
  opts: { allergyDetails: string; foods?: readonly FoodItem[] },
): PlanMealAction {
  const category = SLOT_CATEGORY[meal.slot];
  const resolved = resolvePlanned(meal.itens, opts);
  const preset = plannedPreset(category, resolved);
  const allOk = resolved.every((r) => r.status === "ok" && r.food !== null);
  return allOk && preset.items.length
    ? { kind: "log", category, items: preset.items }
    : { kind: "review", category, preset };
}

/** "Almoço com trocas: arroz integral cozido e lentilha cozida." | "Almoço como no plano original." */
export function swapStatus(meal: DietMeal, swaps: readonly SwapMark[]): string {
  const label = SLOT_LABEL[meal.slot];
  const names = swaps.flatMap((s) => {
    const name = meal.itens[s.item]?.alimento;
    return name ? [name] : [];
  });
  return names.length
    ? `${label} com trocas: ${joinList(names)}.`
    : `${label} como no plano original.`;
}

export const PLAN_DAY_COPY = {
  week: "Semana do plano",
  /** Título da faixa da semana, depois da linha do tempo (o grupo continua "Semana do plano"). */
  otherDays: "Outros dias do plano",
  legend: "Dias com ponto usam as trocas revisadas do seu plano.",
  preview: (date: string) => `Prévia de ${lower(fmtShortDate(date))}: registre no próprio dia.`,
  swapTag: (original: string) => `no lugar de ${original}`,
  /** "2 de 5 refeições hoje" (cabeçalho do dia; perfis calmos não veem). */
  progress: (done: number, total: number) =>
    `${fmtNumber(done)} de ${plural(total, "refeição", "refeições")} hoje`,
  eat: "Registrar",
  eatLabel: (s: DietSlot) => `Registrar ${SLOT_LABEL[s]}`,
  adjust: "Ajustar e registrar",
  adjustLabel: (s: DietSlot) => `Ajustar e registrar: ${SLOT_LABEL[s]}`,
  moreLabel: (s: DietSlot) => `Mais opções: ${SLOT_LABEL[s]}`,
  swap: "Trocar refeição",
  swapLabel: (s: DietSlot) => `Trocar refeição: ${lower(SLOT_LABEL[s])}`,
  itemSwap: "Trocar",
  itemSwapLabel: (food: string, count: number) =>
    `Trocar ${food}: ${count} ${count === 1 ? "opção" : "opções"}`,
  ask: "Pedir outra opção",
  askLabel: (s: DietSlot) => `Pedir outra opção: ${SLOT_LABEL[s]}`,
  askPrompt: (s: DietSlot) =>
    `Sugira outra opção de ${lower(SLOT_LABEL[s])} para o meu plano, respeitando minhas alergias e o que eu evito.`,
  next: "Próxima",
  done: "Feita",
  registered: (time: string) => `Feita às ${time}`,
  logged: (s: DietSlot, time: string) => `Refeição registrada: ${SLOT_LABEL[s]}, hoje às ${time}.`,
} as const;
