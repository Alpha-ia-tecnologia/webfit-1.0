/** Registro de bem-estar (HOJE-07): sono em chips, marcadores opcionais e a folha "Agora ▸ alterar". */
import { localDate } from "./dates";
import { isCalmOn } from "./day";
import { fmtNumber } from "./format";
import type { Profile } from "../types";

/** Horas de sono mais comuns; outros valores (inclusive meias horas) entram por "Outro valor". */
export const SLEEP_CHIPS = [5, 6, 7, 8, 9] as const;

/** Marcadores neutros, sem julgamento; náusea e intestino ajudam quem usa caneta GLP-1. */
export const WELLBEING_TAGS = [
  "Disposição",
  "Calma",
  "Cansaço",
  "Estresse",
  "Ansiedade",
  "Fome",
  "Saciedade",
  "Náusea",
  "Dor de cabeça",
  "Intestino preso",
] as const;

export const MAX_WELLBEING_TAGS = 8;

/** Liga ou desliga um marcador, sem passar do limite do registro. */
export function toggleTag(tags: readonly string[], tag: string): string[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  return tags.length >= MAX_WELLBEING_TAGS ? [...tags] : [...tags, tag];
}

/** "Sono 7 h", "Sono 7,5 h". */
export const sleepLabel = (hours: number) => `Sono ${fmtNumber(hours, 1)} h`;

/** Dia legível para a linha "Hoje · agora ▸ alterar": "Hoje", "Ontem" ou "22/09". */
export function whenDayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return "Hoje";
  if (day === yesterday) return "Ontem";
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/**
 * Celebração gentil (brilho ao bater a meta de água ou fechar os combinados).
 * Desligada em perfil calmo (transtorno alimentar, gestação, amamentação ou menor de idade): sem
 * reforço de metas nesses perfis.
 */
export function canCelebrate(
  profile: Pick<Profile, "eatingDisorder" | "pregnancy" | "birthDate">,
  today = localDate(),
): boolean {
  return !isCalmOn(profile, today);
}
