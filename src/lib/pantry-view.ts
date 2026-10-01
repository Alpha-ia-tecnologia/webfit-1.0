import type { PantryItem } from "../types";
import { localDate } from "./dates";
import { glyphForName } from "./food-glyph";
import { normalize } from "./food-search";
import { fmtNumber, plural } from "./format";
import { expiryStatus, isExpired, PANTRY_UNITS } from "./pantry";

/**
 * Inventário visual da despensa (AGENTE-06): resumo, ordem "Use primeiro", filtros, pílula de
 * validade, quantidades e emoji. Funções puras, sem DOM, compartilhadas por web e app.
 */

export type PantryStatusFilter = "available" | "soon" | "expired";
export type PantryLocationFilter = "todos" | PantryItem["location"];
export interface PantryFilter {
  status: PantryStatusFilter | null;
  location: PantryLocationFilter;
  search: string;
}
export interface PantrySummary {
  total: number;
  available: number;
  soon: number;
  expired: number;
}
export interface PantryGroups {
  usable: PantryItem[];
  expired: PantryItem[];
}
export interface ExpiryPill {
  tone: "expired" | "soon" | "ok";
  short: string;
  /** Pílula da linha (conceito 06): "hoje", "amanhã", "2 dias", "3 meses", "Venceu ontem". */
  compact: string;
  full: string;
}
/** Ordem dentro de cada local: pela validade (padrão) ou pelo nome; vencidos sempre no topo. */
export type PantrySort = "validade" | "nome";
export interface PantryLocationGroup {
  location: PantryItem["location"];
  label: string;
  items: PantryItem[];
}

export const PANTRY_FALLBACK_GLYPH = "🍽️";
export const PANTRY_QTY_STEP: Record<PantryItem["unit"], number> = {
  un: 1,
  pacote: 1,
  g: 50,
  ml: 50,
  kg: 0.5,
  l: 0.5,
};
/** Atalhos de validade na revisão: "+3 d" e "+7 d". */
export const EXPIRY_SHORTCUTS = [3, 7] as const;
export const PANTRY_EMPTY_TEXT =
  "Nenhum alimento cadastrado ainda. Fotografe ou digite os alimentos que você tem.";
export const PANTRY_FILTER_EMPTY_TEXT = "Nenhum alimento com esse filtro.";
export const EXPIRED_GROUP_LABEL = "Vencidos · fora das receitas";
export const USE_FIRST_HINT = "Use primeiro: o que vence antes fica no topo.";

const MAX_QUANTITY = 100000;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
/** Até aqui a distância fica em dias; depois, em meses. */
const MAX_DAYS_LABEL = 45;

const isSoon = (item: PantryItem, today: string) =>
  !!item.expiresOn && expiryStatus(item.expiresOn, today).tone === "soon";
const byName = (a: PantryItem, b: PantryItem) =>
  a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function dayDiff(date: string, today: string): number {
  const day = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(day(date) - day(today));
}

/** Contagens do resumo; "disponíveis" são os que entram nas receitas (sem validade contam). */
export function pantrySummary(
  items: readonly PantryItem[],
  today = localDate(),
): PantrySummary {
  const expired = items.filter((i) => isExpired(i, today)).length;
  const soon = items.filter((i) => !isExpired(i, today) && isSoon(i, today)).length;
  return { total: items.length, available: items.length - expired, soon, expired };
}

/**
 * "Use primeiro": o que vence antes no topo, depois os sem validade em ordem alfabética;
 * vencidos num grupo separado ao fim (mais antigo primeiro), nunca no topo.
 */
export function orderUseFirst(
  items: readonly PantryItem[],
  today = localDate(),
): PantryGroups {
  const usable = items
    .filter((i) => !isExpired(i, today))
    .sort((a, b) => {
      if (a.expiresOn && b.expiresOn)
        return a.expiresOn.localeCompare(b.expiresOn) || byName(a, b);
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return byName(a, b);
    });
  const expired = items
    .filter((i) => isExpired(i, today))
    .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!) || byName(a, b));
  return { usable, expired };
}

/** Filtros do inventário (situação, local e busca sem acento), mantendo a ordem "Use primeiro". */
export function filterPantry(
  items: readonly PantryItem[],
  filter: PantryFilter,
  today = localDate(),
): PantryGroups {
  const query = normalize(filter.search.trim());
  const groups = orderUseFirst(
    items.filter(
      (i) =>
        (filter.location === "todos" || i.location === filter.location) &&
        (!query || normalize(i.name).includes(query)),
    ),
    today,
  );
  switch (filter.status) {
    case "available":
      return { usable: groups.usable, expired: [] };
    case "soon":
      return { usable: groups.usable.filter((i) => isSoon(i, today)), expired: [] };
    case "expired":
      return { usable: [], expired: groups.expired };
    default:
      return groups;
  }
}

const months = (days: number) => {
  const n = Math.round(days / DAYS_PER_MONTH);
  return n === 1 ? "1 mês" : `${n} meses`;
};

function shortExpiry(n: number): string {
  if (n < -DAYS_PER_YEAR) return "Venceu há mais de 1 ano";
  if (n < -MAX_DAYS_LABEL) return `Venceu há ${months(-n)}`;
  if (n < -1) return `Venceu há ${-n} d`;
  if (n === -1) return "Venceu ontem";
  if (n === 0) return "Vence hoje";
  if (n === 1) return "Vence amanhã";
  if (n <= MAX_DAYS_LABEL) return `Vence em ${n} d`;
  if (n <= DAYS_PER_YEAR) return `Vence em ${months(n)}`;
  return "Vence em mais de 1 ano";
}

function compactFromDays(n: number): string {
  if (n < -DAYS_PER_YEAR) return "Venceu há mais de 1 ano";
  if (n < -MAX_DAYS_LABEL) return `Venceu há ${months(-n)}`;
  if (n < -1) return `Venceu há ${-n} dias`;
  if (n === -1) return "Venceu ontem";
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n <= MAX_DAYS_LABEL) return `${n} dias`;
  if (n <= DAYS_PER_YEAR) return months(n);
  return "+1 ano";
}

/** Distância curta da pílula da linha: "hoje", "amanhã", "5 dias", "3 meses"; vencido: "Venceu ontem". */
export function compactExpiry(expiresOn: string, today = localDate()): string {
  return compactFromDays(dayDiff(expiresOn, today));
}

/** Pílula de validade: texto curto visível e texto completo para leitores de tela (nunca vermelho). */
export function expiryPill(expiresOn: string, today = localDate()): ExpiryPill {
  const status = expiryStatus(expiresOn, today);
  const [, mm, dd] = expiresOn.split("-");
  const days = dayDiff(expiresOn, today);
  return {
    tone: status.tone,
    short: shortExpiry(days),
    compact: compactFromDays(days),
    full: `${status.label} · ${dd}/${mm}`,
  };
}

const LOCATION_ORDER: PantryItem["location"][] = ["geladeira", "despensa"];
const LOCATION_LABEL: Record<PantryItem["location"], string> = {
  geladeira: "Geladeira",
  despensa: "Despensa",
};
export const PANTRY_SORT_LABEL: Record<PantrySort, string> = {
  validade: "Por validade",
  nome: "Por nome",
};

/**
 * Inventário por local (conceito 06): Geladeira e Despensa, cada um com os vencidos no topo (para a
 * pessoa conferir), depois pela validade e os sem data pelo nome; "nome" ordena o resto pelo nome.
 * A busca (sem acento) filtra os dois; local sem itens não aparece.
 */
export function groupByLocation(
  items: readonly PantryItem[],
  sort: PantrySort = "validade",
  today = localDate(),
  search = "",
): PantryLocationGroup[] {
  const query = normalize(search.trim());
  const shown = query ? items.filter((i) => normalize(i.name).includes(query)) : items;
  return LOCATION_ORDER.flatMap((location) => {
    const here = shown.filter((i) => i.location === location);
    if (!here.length) return [];
    const { usable, expired } = orderUseFirst(here, today);
    const rest = sort === "nome" ? [...usable].sort(byName) : usable;
    return [{ location, label: LOCATION_LABEL[location], items: [...expired, ...rest] }];
  });
}

/** "0,5 kg", "1 unidade", "2 pacotes", "Quantidade não informada". */
export function fmtPantryQuantity(
  quantity: number | null,
  unit: PantryItem["unit"],
): string {
  if (quantity === null) return "Quantidade não informada";
  const value = fmtNumber(quantity, 3);
  if (unit === "un") return `${value} ${quantity === 1 ? "unidade" : "unidades"}`;
  if (unit === "pacote") return `${value} ${quantity === 1 ? "pacote" : "pacotes"}`;
  return `${value} ${PANTRY_UNITS[unit]}`;
}

/** Emoji do item: pelo nome, depois por palavra no singular ("Ovos" → 🥚), senão o prato. */
export function pantryEmoji(name: string): string {
  return glyphForName(name) ?? PANTRY_FALLBACK_GLYPH;
}

/** Passo do "−"/"+" da quantidade; nunca chega a zero nem passa do limite do esquema. */
export function stepPantryQuantity(
  quantity: number | null,
  unit: PantryItem["unit"],
  direction: 1 | -1,
): number | null {
  const step = PANTRY_QTY_STEP[unit];
  if (quantity === null) return direction === 1 ? step : null;
  const next = Math.min(round3(quantity + direction * step), MAX_QUANTITY);
  return next <= 0 ? quantity : next;
}

export function canDecreaseQuantity(
  quantity: number | null,
  unit: PantryItem["unit"],
): boolean {
  return quantity !== null && round3(quantity - PANTRY_QTY_STEP[unit]) > 0;
}

/** Nome acessível dos blocos do resumo: "3 disponíveis", "1 vence em breve", "2 vencidos". */
export function summaryTileLabel(kind: PantryStatusFilter, n: number): string {
  if (kind === "available") return plural(n, "disponível", "disponíveis");
  if (kind === "soon") return plural(n, "vence em breve", "vencem em breve");
  return plural(n, "vencido", "vencidos");
}

/** Texto do cartão da despensa (Hoje e Dieta). */
export function pantryCardText(items: readonly PantryItem[], today = localDate()): string {
  if (!items.length) return "Cadastre seus alimentos ou fotografe suas compras realizadas.";
  const { available, expired } = pantrySummary(items, today);
  const base = `${plural(available, "alimento disponível", "alimentos disponíveis")} para suas receitas.`;
  return expired > 0
    ? `${base} ${plural(expired, "vencido fica", "vencidos ficam")} de fora.`
    : base;
}
