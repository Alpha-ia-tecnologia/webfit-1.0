/**
 * Estoque do frasco ou da caneta em uso (SERINGA-12): quanto resta pelas aplicações registradas desde
 * a abertura. Só conta o que foi registrado; dividir pela última dose registrada é uma contagem, nunca
 * uma sugestão. Sem mg em lugar nenhum. Em gestação ou amamentação (≠ "nao") não há contagem de doses:
 * o frasco mostra só o volume físico e as canetas, desde quando estão em uso. O aviso de "usar até"
 * vencido aparece sempre. Compartilhado pelo web e pelo app (sem DOM). ./domain não importa este módulo.
 */
import {
  dateSchema,
  treatmentStockSchema,
  type InjectionEntry,
  type InjectionMethod,
  type Profile,
  type TreatmentStock,
} from "../types";
import { plural } from "./format";
import { fmtMl } from "./injection";
import { lastInjection } from "./treatment";

export const VIAL_VIEW = { width: 48, height: 96, liquidTop: 24, liquidBottom: 86 } as const;
export const PEN_STOCK_VIEW = { width: 120, height: 28, fillX: 6, fillMax: 88 } as const;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Líquido do frasco: h = round1(62 × clamp01(level)), y = round1(86 − h). */
export function vialLiquid(level: number): { y: number; height: number } {
  const height = round1((VIAL_VIEW.liquidBottom - VIAL_VIEW.liquidTop) * clamp01(level));
  return { y: round1(VIAL_VIEW.liquidBottom - height), height };
}
/** Largura do preenchimento da caneta: round1(88 × clamp01(level)). */
export function penFill(level: number): number {
  return round1(PEN_STOCK_VIEW.fillMax * clamp01(level));
}

export const STOCK_TITLES: Record<InjectionMethod, string> = {
  frasco: "Frasco",
  caneta: "Caneta",
  dose_unica: "Canetas de dose única",
};
/** Textos da folha "Estoque do frasco ou caneta", iguais no web e no app. Nada de dose, nada de lembrete. */
export const STOCK_COPY = {
  title: "Estoque do frasco ou caneta",
  volumeLabel: "Volume do frasco (ml)",
  volumeHint: "Está no rótulo ou na caixa.",
  dosesLabel: (method: InjectionMethod): string =>
    method === "caneta" ? "Doses na caneta" : "Canetas na caixa",
  dosesHint: (method: InjectionMethod): string =>
    method === "caneta"
      ? "Quantas aplicações a caneta rende, pela bula ou pela farmácia."
      : "Canetas de dose única na caixa aberta.",
  openedLabel: "Aberto em",
  openedHint: "Aplicações registradas a partir desta data contam no estoque.",
  useByLabel: "Usar até (opcional)",
  useByHint: "A data informada na embalagem ou pela farmácia.",
  clearUseBy: "Limpar data de uso",
  save: "Salvar estoque",
  saving: "Salvando…",
  saved: "Estoque salvo.",
  /** "Desfazer" depois de salvar: volta o estoque que havia; no primeiro estoque, ele sai. */
  saveUndone: (hadStock: boolean): string =>
    hadStock ? "Estoque anterior restaurado." : "Estoque removido.",
  remove: "Remover estoque",
  removeTitle: "Remover estoque?",
  removeMessage: "O estoque informado sai do app. As aplicações registradas continuam.",
  removeOk: "Remover",
  removed: "Estoque removido.",
  restored: "Estoque restaurado.",
} as const;

export const NOTICE_USE_BY_PAST =
  "A data de uso informada já passou. Confira com a farmácia ou com quem prescreveu antes de usar.";
/** Avisos neutros quando resta 1 ou nenhuma dose pelas aplicações registradas (nunca em gestação). */
export const STOCK_NOTICES: Record<InjectionMethod, { one: string; none: string }> = {
  frasco: {
    one: "Pelas aplicações registradas, este frasco tem cerca de 1 dose igual à última. Se precisar de mais, organize a reposição com antecedência.",
    none: "Pelas aplicações registradas, o frasco pode ter acabado. Confira o frasco; ao abrir um novo, atualize o estoque.",
  },
  caneta: {
    one: "Pelas aplicações registradas, resta 1 dose nesta caneta. Se precisar de mais, organize a reposição com antecedência.",
    none: "Pelas aplicações registradas, as doses desta caneta acabaram. Ao abrir uma nova, atualize o estoque.",
  },
  dose_unica: {
    one: "Pelas aplicações registradas, resta 1 caneta. Se precisar de mais, organize a reposição com antecedência.",
    none: "Pelas aplicações registradas, as canetas acabaram. Ao abrir uma nova caixa, atualize o estoque.",
  },
};

export interface StockModel {
  method: InjectionMethod;
  title: string;
  amount: string;
  /** 0–1; null nas canetas em gestação (contorno sem nível). */
  level: number | null;
  /** Aplicações contadas: mesmo método, data em [abertura, hoje]. */
  counted: number;
  /** null sem aplicação de frasco para dividir ou em gestação (sem contagem). */
  dosesLeft: number | null;
  dosesChip: string | null;
  useByChip: string | null;
  isUseByPast: boolean;
  /** "Usar até" vencido primeiro, depois o aviso de dose. */
  notices: string[];
  /** pregnancy === "nao". */
  showsCounts: boolean;
  aria: string;
}

/** "15/10". */
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
/** Registros sem `method` (objetos crus antigos) contam como frasco. */
const methodOf = (e: InjectionEntry): InjectionMethod => e.method ?? "frasco";
/** UI da aplicação de frasco; sem UI, o volume registrado × 100; sem os dois, 0. */
const unitsOf = (e: InjectionEntry) =>
  e.units ?? (e.volumeMl != null ? Math.round(e.volumeMl * 100) : 0);

interface Quantity {
  amount: string;
  level: number | null;
  dosesLeft: number | null;
}

function vialQuantity(
  volumeMl: number,
  counted: readonly InjectionEntry[],
  injections: readonly InjectionEntry[],
  today: string,
): Quantity {
  const total = Math.round(volumeMl * 100);
  const used = counted.reduce((sum, e) => sum + unitsOf(e), 0);
  const remaining = Math.max(0, total - used);
  // A última aplicação de frasco até hoje, contada ou não: a contagem divide pela dose mais recente.
  const last = lastInjection(injections.filter((e) => methodOf(e) === "frasco"), today);
  const lastUnits = last ? unitsOf(last) : 0;
  return {
    amount: `${fmtMl(remaining / 100)} de ${fmtMl(volumeMl)}`,
    level: total > 0 ? remaining / total : 0,
    dosesLeft: lastUnits > 0 ? Math.floor(remaining / lastUnits) : null,
  };
}

function penQuantity(method: InjectionMethod, doses: number, counted: number): Quantity {
  const dosesLeft = Math.max(0, doses - counted);
  const unit = method === "caneta" ? plural(doses, "dose", "doses") : plural(doses, "caneta", "canetas");
  return { amount: `${dosesLeft} de ${unit}`, level: doses > 0 ? dosesLeft / doses : 0, dosesLeft };
}

function doseNotice(method: InjectionMethod, dosesLeft: number | null): string | null {
  if (dosesLeft === 1) return STOCK_NOTICES[method].one;
  return dosesLeft === 0 ? STOCK_NOTICES[method].none : null;
}

export function stockModel(
  stock: TreatmentStock,
  injections: readonly InjectionEntry[],
  p: Pick<Profile, "pregnancy">,
  today: string,
): StockModel {
  const { method } = stock;
  const title = STOCK_TITLES[method];
  const showsCounts = p.pregnancy === "nao";
  const counted = injections.filter(
    (e) => methodOf(e) === method && e.date >= stock.openedOn && e.date <= today,
  );
  const quantity =
    method === "frasco"
      ? vialQuantity(stock.volumeMl ?? 0, counted, injections, today)
      : penQuantity(method, stock.doses ?? 0, counted.length);
  const isPen = method !== "frasco";
  // Gestação: sem contagem de doses; o frasco segue com o volume, as canetas mostram desde quando estão em uso.
  const amount = !showsCounts && isPen ? `Em uso desde ${ddmm(stock.openedOn)}` : quantity.amount;
  const level = !showsCounts && isPen ? null : quantity.level;
  const dosesLeft = showsCounts ? quantity.dosesLeft : null;
  const dosesChip =
    !isPen && dosesLeft !== null && dosesLeft >= 1 ? `≈ ${plural(dosesLeft, "dose", "doses")}` : null;
  const isUseByPast = stock.useBy !== null && stock.useBy < today;
  const useByChip =
    stock.useBy === null
      ? null
      : isUseByPast
        ? `data de uso passou: ${ddmm(stock.useBy)}`
        : `usar até ${ddmm(stock.useBy)}`;
  const notice = doseNotice(method, dosesLeft);
  const about = dosesChip
    ? `, cerca de ${plural(dosesLeft ?? 0, "dose igual à última registrada", "doses iguais à última registrada")}`
    : "";
  return {
    method,
    title,
    amount,
    level,
    counted: counted.length,
    dosesLeft,
    dosesChip,
    useByChip,
    isUseByPast,
    notices: [...(isUseByPast ? [NOTICE_USE_BY_PAST] : []), ...(notice ? [notice] : [])],
    showsCounts,
    aria: `${title}: ${amount}${about}${useByChip ? `, ${useByChip}` : ""}.`,
  };
}

export interface StockDraftInput {
  method: InjectionMethod;
  volumeText: string;
  doses: number;
  openedOn: string;
  useBy: string | null;
  today: string;
}
export type StockDraft =
  | { ok: true; stock: TreatmentStock }
  | { ok: false; field: "volumeMl" | "doses" | "openedOn" | "useBy"; message: string };
type StockField = Extract<StockDraft, { ok: false }>["field"];

const VOLUME_TEXT = /^\d{1,2}([.,]\d{1,2})?$/;
const VOLUME_MAX_ML = 10;
const DOSES_MIN = 1;
const DOSES_MAX = 60;
const fail = (field: StockField, message: string): StockDraft => ({ ok: false, field, message });
const isDate = (value: string) => dateSchema.safeParse(value).success;

/** Volume digitado ("2", "2,4", "2.45") → ml; fora do formato ou fora de (0, 10] → null. */
function parseVolume(text: string): number | null {
  const value = text.trim();
  if (!VOLUME_TEXT.test(value)) return null;
  const ml = Number(value.replace(",", "."));
  return ml > 0 && ml <= VOLUME_MAX_ML ? ml : null;
}

/** Valida o formulário e devolve treatmentStockSchema.parse(...). */
export function stockDraft(input: StockDraftInput): StockDraft {
  const isVial = input.method === "frasco";
  const volumeMl = isVial ? parseVolume(input.volumeText) : null;
  if (isVial && volumeMl === null)
    return fail("volumeMl", "Informe o volume do frasco em ml (até 10 ml, com até 2 casas).");
  const isDosesValid =
    Number.isInteger(input.doses) && input.doses >= DOSES_MIN && input.doses <= DOSES_MAX;
  if (!isVial && !isDosesValid)
    return fail(
      "doses",
      input.method === "caneta" ? "Informe de 1 a 60 doses." : "Informe de 1 a 60 canetas.",
    );
  if (!isDate(input.openedOn)) return fail("openedOn", "Informe a data de abertura.");
  if (input.openedOn > input.today) return fail("openedOn", "A abertura não pode estar no futuro.");
  const useBy = input.useBy?.trim() || null;
  if (useBy !== null && !isDate(useBy)) return fail("useBy", "Informe uma data válida.");
  if (useBy !== null && useBy < input.openedOn)
    return fail("useBy", "A data de uso deve ser igual ou posterior à abertura.");
  const parsed = treatmentStockSchema.safeParse({
    method: input.method,
    volumeMl,
    doses: isVial ? null : input.doses,
    openedOn: input.openedOn,
    useBy,
  });
  if (parsed.success) return { ok: true, stock: parsed.data };
  // Inalcançável com as checagens acima; mantém o formulário com uma mensagem em vez de lançar.
  return fail(isVial ? "volumeMl" : "doses", parsed.error.issues[0]?.message ?? "Confira o estoque.");
}

const DEFAULT_DOSES = 4;
/** Tipo inicial: método da última aplicação (data ≤ today) ou "frasco"; doses 4; abertura today. */
export function stockDefaults(
  injections: readonly InjectionEntry[],
  today: string,
): { method: InjectionMethod; doses: number; openedOn: string } {
  const last = lastInjection(injections, today);
  return { method: last ? methodOf(last) : "frasco", doses: DEFAULT_DOSES, openedOn: today };
}
