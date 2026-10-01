/**
 * Mapa de rodízio (SERINGA-04): últimas aplicações com local e lado, sugestão do próximo ponto
 * e contagem por local. Tudo sugere, nada bloqueia; registros sem lado nunca ganham um lado inventado.
 * Compartilhado pelo web e pelo app (sem DOM). Importa ./injection; ./injection nunca importa este módulo.
 */
import type { InjectionEntry, InjectionSide, InjectionSite } from "../types";
import { shiftDate } from "./dates";
import {
  SITES,
  daysAgoLabel,
  daysBetween,
  injectionSummary,
  shortSpotLabel,
  siteLabel,
  sortInjections,
  spotLabel,
} from "./injection";

export type BodyFace = "frente" | "costas";
/** Abdômen e coxa se veem de frente; o braço (parte posterior) nas costas. */
export const SITE_FACE: Record<InjectionSite, BodyFace> = {
  abdomen: "frente",
  coxa: "frente",
  braco: "costas",
};
export const FACE_LABEL: Record<BodyFace, string> = { frente: "Frente", costas: "Costas" };
export const ROTATION_MARKS = 3;
export const SITE_WINDOW_DAYS = 90;

export interface Spot {
  site: InjectionSite;
  side: InjectionSide | null;
}
export interface RotationMark extends Spot {
  /** 1 = a aplicação mais recente. */
  rank: number;
  id: string;
  date: string;
  daysAgo: number;
}

/** As `limit` aplicações mais recentes com data ≤ today (sortInjections), rank 1 = a mais nova. */
export function recentMarks(
  list: readonly InjectionEntry[],
  today: string,
  limit = ROTATION_MARKS,
): RotationMark[] {
  if (limit <= 0) return [];
  const past = sortInjections(list.filter((e) => e.date <= today));
  return past
    .slice(-limit)
    .reverse()
    .map((e, index) => ({
      rank: index + 1,
      id: e.id,
      date: e.date,
      daysAgo: daysBetween(e.date, today),
      site: e.site,
      side: e.side ?? null,
    }));
}

/** "1, Abdômen à esquerda, há 2 dias" | "3, Braço, lado não informado, há 16 dias". */
export function markText(mark: RotationMark): string {
  const spot = mark.side
    ? spotLabel(mark.site, mark.side)
    : `${siteLabel(mark.site)}, lado não informado`;
  return `${mark.rank}, ${spot}, ${daysAgoLabel(mark.daysAgo)}`;
}

export interface RotationModel {
  suggested: Spot;
  marks: RotationMark[];
  aria: string;
}

/** `Mapa de rodízio. Sugerido: …` com as últimas aplicações ou "Nenhuma aplicação registrada ainda." */
export function rotationAria(model: Omit<RotationModel, "aria">): string {
  const head = `Mapa de rodízio. Sugerido: ${spotLabel(model.suggested.site, model.suggested.side)}.`;
  return model.marks.length
    ? `${head} Últimas aplicações: ${model.marks.map(markText).join("; ")}.`
    : `${head} Nenhuma aplicação registrada ainda.`;
}

/** Sugestão = local e lado do resumo (injectionSummary); marcas = as 3 últimas aplicações. */
export function rotationModel(list: readonly InjectionEntry[], today: string): RotationModel {
  const summary = injectionSummary(list, today);
  const base = {
    suggested: { site: summary.suggestedSite, side: summary.suggestedSide },
    marks: recentMarks(list, today),
  };
  return { ...base, aria: rotationAria(base) };
}

/* Cartão "Rodízio de locais" da receita (conceito 10): o estado de cada ponto recente e a sugestão. */
/** Menos de 14 dias desde a aplicação: o ponto ainda é "recente". */
export const ROTATION_RECENT_DAYS = 14;
export type SpotStatus = "ultima" | "recente" | "livre";
const STATUS_WORD: Record<SpotStatus, string> = { ultima: "última", recente: "recente", livre: "livre" };

/** rank 1 = "ultima"; menos de ROTATION_RECENT_DAYS dias = "recente"; senão "livre". */
export function spotStatus(mark: Pick<RotationMark, "rank" | "daysAgo">): SpotStatus {
  if (mark.rank === 1) return "ultima";
  return mark.daysAgo < ROTATION_RECENT_DAYS ? "recente" : "livre";
}

export interface RotationCallout extends Spot {
  rank: number;
  status: SpotStatus;
  daysAgo: number;
  /** "Braço esq." */
  label: string;
  /** "livre · há 16 dias" */
  detail: string;
}
export interface RotationCallouts {
  suggested: Spot;
  /** "Coxa direita" */
  suggestedLabel: string;
  /** Um por ponto (vale a aplicação mais recente nele), da mais recente para a mais antiga. */
  callouts: RotationCallout[];
  /** Aplicações consideradas (até ROTATION_MARKS): "Últimas 3 aplicações". */
  count: number;
  aria: string;
}
/** Legendas das últimas aplicações (sem lado inventado) e a sugestão do rodízio; só leitura. */
export function rotationCallouts(list: readonly InjectionEntry[], today: string): RotationCallouts {
  const model = rotationModel(list, today);
  const seen = new Set<string>();
  const callouts: RotationCallout[] = [];
  for (const mark of model.marks) {
    const key = `${mark.site}:${mark.side ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = spotStatus(mark);
    callouts.push({
      site: mark.site,
      side: mark.side,
      rank: mark.rank,
      status,
      daysAgo: mark.daysAgo,
      label: shortSpotLabel(mark.site, mark.side),
      detail: `${STATUS_WORD[status]} · ${daysAgoLabel(mark.daysAgo)}`,
    });
  }
  return {
    suggested: model.suggested,
    suggestedLabel: spotLabel(model.suggested.site, model.suggested.side),
    callouts,
    count: model.marks.length,
    aria: model.aria,
  };
}

export interface SiteCount {
  site: InjectionSite;
  label: string;
  count: number;
}

/** Aplicações por local nos últimos `days` dias (inclui hoje), na ordem de SITES.
 *  aria: "Locais nos últimos 90 dias: Abdômen 3, Coxa 3, Braço 2" | "Locais nos últimos 90 dias: nenhuma aplicação". */
export function siteCounts(
  list: readonly InjectionEntry[],
  today: string,
  days = SITE_WINDOW_DAYS,
): { counts: SiteCount[]; total: number; aria: string } {
  const since = shiftDate(today, -(Math.max(1, days) - 1));
  const recent = list.filter((e) => e.date >= since && e.date <= today);
  const counts = SITES.map((s) => ({
    site: s.key,
    label: s.label,
    count: recent.filter((e) => e.site === s.key).length,
  }));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const head = `Locais nos últimos ${days} dias:`;
  return {
    counts,
    total,
    aria: total
      ? `${head} ${counts.map((c) => `${c.label} ${c.count}`).join(", ")}`
      : `${head} nenhuma aplicação`,
  };
}
