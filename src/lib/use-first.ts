import type { AppState, PantryItem } from "../types";
import { shiftDate } from "./dates";
import { fmtExpiry, plural } from "./format";
import { visiblePlainText } from "./text";

/**
 * "Use primeiro" (AGENTE-13): o que vence nos próximos dias, para a Despensa, o Hoje e o lembrete
 * das 10:00. Módulo folha (dates, format, text e tipos): domain.ts e reminder-plan.ts importam daqui
 * sem ciclo. A validade é a informada pela pessoa; o tom é "confira antes de usar", nunca alarme.
 */

/** Igual a EXPIRY_SOON_DAYS (pantry.ts); um teste garante. */
export const USE_FIRST_DAYS = 3;
export const USE_FIRST_KEY = "despensa";
export const USE_FIRST_TIME = "10:00";
export const USE_FIRST_REMINDER = {
  title: "Use primeiro",
  body: "Alguns alimentos vencem nos próximos dias. Confira antes de usar.",
} as const;

/** Id do aviso do dia (lembrete e cartão do Hoje): "2026-09-28:despensa".
 *  Sem o prefixo "use": o ESLint (react-hooks) trataria como hook. */
export const firstUseId = (date: string) => `${date}:${USE_FIRST_KEY}`;

const byName = (a: PantryItem, b: PantryItem) =>
  a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/** Não vencidos com validade entre `date` e `date + days`, do que vence antes; empate pelo nome. */
export function expiringSoon(
  items: readonly PantryItem[],
  date: string,
  days = USE_FIRST_DAYS,
): PantryItem[] {
  const last = shiftDate(date, days);
  return items
    .filter((i) => i.expiresOn !== null && i.expiresOn >= date && i.expiresOn <= last)
    .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!) || byName(a, b));
}

/** O cartão do Hoje foi dispensado (ou o lembrete lido) neste dia. */
export const isUseFirstDismissed = (state: Pick<AppState, "readNotifications">, date: string) =>
  state.readNotifications.includes(firstUseId(date));

// ---------- Cartão "Use primeiro" (Despensa e Hoje) ----------

export interface UseFirstChip {
  id: string;
  name: string;
  /** Validade informada (AAAA-MM-DD): a pílula "2 dias" do cartão da Despensa sai daqui. */
  expiresOn: string;
  /** "vence hoje" | "vence amanhã" | "vence em 2 d". */
  short: string;
  /** "Iogurte, vence em 2 dias, 30/09". */
  aria: string;
}
export interface UseFirstModel {
  chips: UseFirstChip[];
  /** Quantos ficaram fora dos chips ("+1"). */
  more: number;
  total: number;
  lead: string;
}
export const USE_FIRST_CHIPS = 3;
export const USE_FIRST_COPY = {
  listLabel: "Vencem em breve",
  recipes: "Receitas com eles",
  create: "Criar receitas com eles",
  dismiss: "Agora não",
  dismissLabel: "Agora não: ocultar Use primeiro até amanhã",
  dismissed: "Use primeiro oculto até amanhã.",
  restored: "Use primeiro de volta.",
  note: "A validade é a que você informou.",
  /** Subtítulo do cartão da Despensa (conceito 06). */
  window: `Vencem em até ${USE_FIRST_DAYS} dias`,
  more: (n: number) => `+${n}`,
  moreLabel: (n: number) => `e mais ${n}`,
} as const;

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

function shortExpiry(expiresOn: string, today: string): string {
  const days = Math.round(dayNumber(expiresOn) - dayNumber(today));
  if (days <= 0) return "vence hoje";
  return days === 1 ? "vence amanhã" : `vence em ${days} d`;
}

/**
 * Chips do "Use primeiro": null quando nada vence nos próximos dias. Nomes mascarados com as
 * calorias ocultas (o nome vem da pessoa: "Barra 200 kcal"); a validade é a informada.
 * Sem o prefixo "use" (como firstUseId): o ESLint (react-hooks) trataria como hook.
 */
export function firstUseModel(
  items: readonly PantryItem[],
  today: string,
  hide: boolean,
  max = USE_FIRST_CHIPS,
): UseFirstModel | null {
  const soon = expiringSoon(items, today);
  if (!soon.length) return null;
  const chips = soon.slice(0, Math.max(0, max)).map((item) => {
    const name = visiblePlainText(item.name, hide);
    const expiresOn = item.expiresOn!;
    const [, mm, dd] = expiresOn.split("-");
    return {
      id: item.id,
      name,
      expiresOn,
      short: shortExpiry(expiresOn, today),
      aria: `${name}, ${fmtExpiry(expiresOn, today)}, ${dd}/${mm}`,
    };
  });
  const lead = `${plural(soon.length, "alimento vence", "alimentos vencem")} nos próximos ${USE_FIRST_DAYS} dias. Confira antes de usar.`;
  return { chips, more: soon.length - chips.length, total: soon.length, lead };
}

/** "Agora não": marca o aviso do dia como lido (o mesmo id do lembrete), sem repetir. */
export function dismissUseFirst(state: AppState, today: string): AppState {
  const id = firstUseId(today);
  if (state.readNotifications.includes(id)) return state;
  return { ...state, readNotifications: [...state.readNotifications, id] };
}

/** Desfazer do "Agora não": tira o id do dia. */
export function restoreUseFirst(state: AppState, today: string): AppState {
  const id = firstUseId(today);
  if (!state.readNotifications.includes(id)) return state;
  return { ...state, readNotifications: state.readNotifications.filter((read) => read !== id) };
}
