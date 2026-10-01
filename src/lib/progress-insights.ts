/**
 * Destaques calculados dos mini gráficos da Evolução (EVOL-06, fase 1) e o texto único de
 * "Como calculamos". Tudo local e determinístico, compartilhado pelo web e pelo app:
 * sem calorias com hideCalories, sem proteína nem porcentagem calórica em perfil calmo e sem
 * porcentagem de água com restrição hídrica. Acima de 100% fica neutro (sem teto e sem cor).
 */
import type { Profile } from "../types";
import type { DayPoint } from "./evolution";
import { fmtNumber, fmtPct, fmtRange, plural } from "./format";
import { isCalmProfile } from "./space";

export type InsightTone = "water" | "food" | "habit" | "body" | "mind" | "neutral";
export interface InsightChip {
  key: string;
  /** Texto visível do chip ("94% da meta"). */
  text: string;
  /** Leitura completa para leitor de tela ("Média de 94% da meta de água nos dias com registro"). */
  aria: string;
  tone: InsightTone;
}
export interface SeriesInsight {
  chips: InsightChip[];
  /** Arias dos chips unidas por "; "; vazio sem chips. */
  aria: string;
  /**
   * Meta vigente depois de "média/dia" no mini gráfico compacto: "meta 1.645" (calorias) ou
   * "meta 2,5 L" (água). null quando a privacidade esconde a meta (calorias ocultas, perfil calmo
   * nas calorias, restrição hídrica na água), sem meta ou para proteína e refeições.
   */
  goalText: string | null;
}
export type SeriesKind = "water" | "calories" | "meals" | "protein";
export interface InsightPrivacy {
  calm: boolean;
  hideCalories: boolean;
  fluidRestriction: boolean;
}

/** A porcentagem da meta só aparece com pelo menos 2 dias registrados que tinham meta. */
export const MIN_DAYS_FOR_PERCENT = 2;

/** calm = isCalmProfile(p, today) (sensível ou menor de 18); fluidRestriction = p.fluidRestriction === "sim". */
export function insightPrivacy(profile: Profile, today: string): InsightPrivacy {
  return {
    calm: isCalmProfile(profile, today),
    hideCalories: profile.hideCalories === true,
    fluidRestriction: profile.fluidRestriction === "sim",
  };
}

const TONES: Record<SeriesKind, InsightTone> = {
  water: "water",
  calories: "food",
  protein: "food",
  meals: "neutral",
};
/** Complemento do aria da porcentagem; só água e calorias têm meta. */
const GOAL_ARIA: Partial<Record<SeriesKind, string>> = {
  water: "da meta de água",
  calories: "da meta calórica",
};

const noInsight = (goalText: string | null = null): SeriesInsight => ({ chips: [], aria: "", goalText });

/** "meta 1.645" / "meta 2,5 L": a meta mais recente do período, só onde a porcentagem também pode aparecer. */
function goalTextFor(kind: SeriesKind, points: readonly DayPoint[], privacy: InsightPrivacy): string | null {
  if (!canShowPercent(kind, privacy)) return null;
  const goal = [...points].reverse().find((p) => p.goal !== null && p.goal > 0)?.goal ?? null;
  if (goal === null) return null;
  return kind === "water" ? `meta ${fmtNumber(goal / 1000, 1)} L` : `meta ${fmtNumber(goal)}`;
}

/** Água: sem restrição hídrica. Calorias: fora do perfil calmo e sem calorias ocultas. */
function canShowPercent(kind: SeriesKind, privacy: InsightPrivacy): boolean {
  if (kind === "water") return !privacy.fluidRestriction;
  if (kind === "calories") return !privacy.calm && !privacy.hideCalories;
  return false;
}

/** Σ registrado nos dias com registro e meta ÷ Σ das metas desses dias (a meta vigente em cada data). */
function goalChip(
  kind: SeriesKind,
  recorded: readonly DayPoint[],
  privacy: InsightPrivacy,
): InsightChip | null {
  const label = GOAL_ARIA[kind];
  if (!label || !canShowPercent(kind, privacy)) return null;
  const withGoal = recorded.filter((p) => p.goal !== null && p.goal > 0);
  if (withGoal.length < MIN_DAYS_FOR_PERCENT) return null;
  const value = withGoal.reduce((sum, p) => sum + p.value, 0);
  const goal = withGoal.reduce((sum, p) => sum + (p.goal ?? 0), 0);
  const pct = fmtPct(Math.round((value / goal) * 100));
  return {
    key: "goal",
    text: `${pct} da meta`,
    aria: `Média de ${pct} ${label} nos dias com registro`,
    tone: TONES[kind],
  };
}

/** Faixa de proteína (1,2 a 1,6 g/kg): "Referência 86–115 g". */
function referenceChip(reference: { min: number; max: number }): InsightChip {
  const low = fmtNumber(Math.min(reference.min, reference.max));
  const high = fmtNumber(Math.max(reference.min, reference.max));
  return {
    key: "reference",
    text: `Referência ${fmtRange(reference.min, reference.max, "g", 0)}`,
    aria: low === high ? `Referência de ${low} g por dia` : `Referência de ${low} a ${high} g por dia`,
    tone: "food",
  };
}

/**
 * Chips de um mini gráfico: porcentagem da meta (água, calorias) ou referência (proteína) e os
 * dias com registro. Dia registrado = valor > 0; sem dia registrado, nenhum chip (o cartão já
 * mostra o texto de vazio). Calorias com hideCalories e proteína em perfil calmo: sempre vazio.
 */
export function seriesInsight(
  kind: SeriesKind,
  points: readonly DayPoint[],
  privacy: InsightPrivacy,
  reference: { min: number; max: number } | null = null,
): SeriesInsight {
  if (kind === "calories" && privacy.hideCalories) return noInsight();
  if (kind === "protein" && privacy.calm) return noInsight();
  const goalText = goalTextFor(kind, points, privacy);
  const recorded = points.filter((p) => p.value > 0);
  if (!recorded.length) return noInsight(goalText);
  const total = plural(points.length, "dia", "dias");
  const days: InsightChip = {
    key: "days",
    text: `${fmtNumber(recorded.length)} de ${total}`,
    aria: `${fmtNumber(recorded.length)} de ${total} com registro`,
    tone: TONES[kind],
  };
  const lead =
    kind === "protein"
      ? reference
        ? referenceChip(reference)
        : null
      : goalChip(kind, recorded, privacy);
  const chips = lead ? [lead, days] : [days];
  return { chips, aria: chips.map((c) => c.aria).join("; "), goalText };
}

export type HowKey =
  | "medias"
  | "meta"
  | "dias"
  | "tendencia"
  | "ritmo"
  | "proteina"
  | "bem_estar"
  | "semana";
export interface HowSection {
  key: HowKey;
  title: string;
  paragraphs: string[];
}

/**
 * Seções de "Como calculamos" (uma folha para toda a Evolução), na ordem da tela. Perfil calmo
 * não vê tendência, ritmo nem proteína; nenhuma seção fala de energia (vale com hideCalories).
 */
export function howWeCalculate(privacy: InsightPrivacy): HowSection[] {
  const waterPercent = !privacy.fluidRestriction;
  const caloriePercent = !privacy.calm && !privacy.hideCalories;
  const body = !privacy.calm;
  const sections: (HowSection | null)[] = [
    {
      key: "medias",
      title: "Médias",
      paragraphs: [
        "As médias usam só os dias com registro no período. Um dia sem registro não entra como zero.",
      ],
    },
    waterPercent || caloriePercent
      ? {
          key: "meta",
          title: caloriePercent ? "Porcentagem da meta" : "Porcentagem da meta de água",
          paragraphs: [
            "Somamos o que foi registrado nos dias com registro e dividimos pela soma das metas desses mesmos dias. Vale a meta que estava definida em cada data.",
          ],
        }
      : null,
    {
      key: "dias",
      title: "Dias com registro",
      paragraphs: [
        "Um dia conta quando há qualquer registro no diário ou um combinado cumprido.",
        "Ausência de registro não significa ausência de consumo.",
      ],
    },
    body
      ? {
          key: "tendencia",
          title: "Peso de tendência",
          paragraphs: [
            "Cada pesagem puxa a linha aos poucos: é uma média que dá mais valor às pesagens recentes (constante de 10 dias). Assim, a oscilação de um dia não esconde a direção.",
          ],
        }
      : null,
    body
      ? {
          key: "ritmo",
          title: "Ritmo",
          paragraphs: [
            "Inclinação da linha de tendência nas últimas 4 semanas, em kg por semana. Aparece com pelo menos duas pesagens com 7 dias ou mais entre elas.",
          ],
        }
      : null,
    body
      ? {
          key: "proteina",
          title: "Proteína",
          paragraphs: [
            "A faixa de referência vai de 1,2 a 1,6 g por kg do seu peso mais recente. É uma referência geral, não uma meta individual.",
          ],
        }
      : null,
    {
      key: "bem_estar",
      title: "Bem-estar e sono",
      paragraphs: [
        "Cada dia usa o último humor registrado (de 1, muito mal, a 5, muito bem) e o último sono informado.",
        "A leitura cruzada aparece com 4 dias com humor e sono. Separamos esses dias pela mediana do seu sono e comparamos o humor médio de cada grupo. É uma descrição dos seus registros, sem relação de causa.",
      ],
    },
    {
      key: "semana",
      title: "Sua semana",
      paragraphs: [
        "O resumo usa a última semana completa, de segunda a domingo, e aparece quando há registros em pelo menos 2 dias. Mostra só o que foi registrado, sem comparar com outras semanas.",
      ],
    },
  ];
  return sections.filter((s): s is HowSection => s !== null);
}
