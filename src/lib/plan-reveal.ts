/**
 * Revelação do plano ao fim da anamnese (ANAM-04): variante (completo, prato ou de rotina),
 * as linhas que citam as respostas, o que foi considerado (chips), gasto estimado × meta (o basal
 * fica em "Como calculamos"), a estratégia, água e a linha do dia.
 * Perfis sensíveis e menores de idade recebem só o plano de rotina, sem números de peso ou energia.
 */
import { CHOICE_FIELDS } from "../data/anamneseOptions";
import { questionnaire } from "../data/questionnaire";
import { parseChoices } from "../components/anamnese/inputs";
import type { Goals, Profile } from "../types";
import { relativeHeights } from "./charts";
import { isSensitive } from "./day";
import { DAY_POINTS, type DayPointKey } from "./day-timeline";
import { ageAt } from "./domain";
import { glyphForName } from "./food-glyph";
import { fmtKcal, fmtWater, plural } from "./format";
import { goalRuler } from "./space";

export type PlanVariant = "completo" | "prato" | "habitos";
const ADULT_AGE = 18;

export function planVariant(p: Profile, goals: Goals, today: string): PlanVariant {
  if (isSensitive(p) || ageAt(p.birthDate, today) < ADULT_AGE || goals.calories === null)
    return "habitos";
  return p.hideCalories ? "prato" : "completo";
}

export const PLAN_TITLES: Record<PlanVariant, string> = {
  completo: "Seu plano inicial",
  prato: "Seu plano inicial",
  habitos: "Seu plano de hábitos",
};
export const PLAN_LOADER_TEXT = "Montando seu plano inicial…";
/** 4 linhas → 2,4 s. */
export const PLAN_LOADER_STEP_MS = 600;
export const HABITS_TEXT =
  "Seu plano começa pela rotina: horários, água e refeições registradas, sem metas de números.";
export const PLATE_TEXT =
  "Metade do prato com vegetais, um quarto com proteínas e um quarto com cereais, raízes ou tubérculos.";
export const PLATE_ARIA =
  "Prato de referência: metade vegetais, um quarto proteínas, um quarto cereais";
export const HIDE_CALORIES_COPY = {
  title: "Ocultar números de calorias",
  hint: "Mostra porções e combinados no lugar",
} as const;

/** Folha "Ajustar" do fim da anamnese (web e app nativo). */
export const ADJUST_TITLE = "Ajustar respostas";
/** Aviso final: vai na legenda do plano e no topo da folha "Ajustar". */
export const REVIEW_DISCLAIMER =
  "As respostas podem ser atualizadas em Meu espaço. Estimativas não substituem a avaliação individual de um profissional.";

/** Textos da "Projeção segura" do plano (web e app nativo). Faixa de meses, nunca uma data. */
export const PROJECTION_COPY = {
  title: "Projeção segura",
  why: "Exibido porque seu perfil permite",
  estimate: "Estimativa, não promessa.",
  pen: " Com caneta, o ritmo pode variar.",
} as const;

/** Legenda antes do rodapé: o que acontece ao começar. */
export const planIntro = (isAiReady: boolean) =>
  isAiReady
    ? "Ao começar, o agente monta sua dieta."
    : "Sua anamnese ficará salva. Você poderá criar sua dieta em Minha dieta quando autorizar e conectar o agente.";

/** Primeiro nome para o título ("Seu plano inicial, Ana"); vazio sem nome. */
export const planFirstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Estratégia da meta, sem números: "Déficit moderado", "Superávit leve"… (null sem meta). */
export function strategyLabel(goals: Pick<Goals, "strategy">): string | null {
  switch (goals.strategy) {
    case "deficit":
      return "Déficit moderado";
    case "superavit":
      return "Superávit leve";
    case "manutencao":
      return "Manutenção";
    case "manual":
      return "Meta informada";
    default:
      return null;
  }
}

const MAX_CHOICE_CHARS = 40;
const NOT_DETAILED = "Prefiro não detalhar";

const lowerFirst = (text: string) =>
  text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
const shorten = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Primeira escolha reconhecida do campo de chips; senão o começo do texto livre. */
function firstChoice(value: string, key: string, skip: string[] = []): string {
  const config = CHOICE_FIELDS[key];
  const parsed = config
    ? parseChoices(value, config)
    : { selected: [] as string[], other: value };
  const chosen = parsed.selected.find((item) => !skip.includes(item));
  return (chosen ?? parsed.other.split(",")[0] ?? "").trim();
}

function goalLabel(goal: Profile["goal"]): string {
  const field = questionnaire
    .flatMap((step) => step.fields)
    .find((f) => f.key === "goal");
  return field?.options?.find(([value]) => value === goal)?.[1] ?? goal;
}

/** Tempo para cozinhar em poucas palavras ("30 min para cozinhar"). */
const COOKING_SHORT: Record<string, string> = {
  "Quase nenhum, uso pratos prontos": "Pratos prontos",
  "Até 15 minutos por dia": "15 min para cozinhar",
  "30 minutos por dia": "30 min para cozinhar",
  "1 hora ou mais por dia": "1 h para cozinhar",
  "Cozinho em lote no fim de semana": "Cozinha em lote",
  "Outra pessoa cozinha para mim": "Outra pessoa cozinha",
};
const MAX_CONSIDERED = 3;
const MAX_CONSIDERED_CHARS = 28;

export interface ConsideredItem {
  emoji: string;
  text: string;
}

/**
 * "Considerado:" do plano (até 3 chips): a alergia, a caneta (nunca a dose), o tempo para cozinhar
 * e, se sobrar espaço, o padrão alimentar. Só texto das respostas, sem números de peso ou energia.
 */
export function planConsidered(p: Profile): ConsideredItem[] {
  const items: ConsideredItem[] = [];
  const allergy =
    p.allergies === "sim"
      ? firstChoice(p.allergyDetails, "allergyDetails", [NOT_DETAILED])
      : "";
  if (allergy) {
    const option = CHOICE_FIELDS.allergyDetails?.options.find(
      (o) => o.value === allergy,
    );
    items.push({
      emoji: option?.emoji ?? glyphForName(allergy) ?? "⚠️",
      text: shorten(`Alergia a ${lowerFirst(allergy)}`, MAX_CONSIDERED_CHARS),
    });
  }
  if (p.weightLossPen === "sim") items.push({ emoji: "💉", text: "Caneta GLP-1" });
  const cooking = firstChoice(p.cookingTime, "cookingTime");
  if (cooking)
    items.push({
      emoji: "⏱️",
      text: COOKING_SHORT[cooking] ?? shorten(cooking, MAX_CONSIDERED_CHARS),
    });
  const diet = firstChoice(p.diet, "diet");
  if (diet)
    items.push({ emoji: "🥗", text: shorten(diet.split(",")[0]!, MAX_CONSIDERED_CHARS) });
  return items.slice(0, MAX_CONSIDERED);
}

/** 4 linhas que citam as respostas; o plano de rotina não cita objetivo nem peso. */
export function planChecklist(p: Profile, v: PlanVariant): string[] {
  const routine = shorten(firstChoice(p.occupation, "occupation"), MAX_CHOICE_CHARS);
  const diet = firstChoice(p.diet, "diet");
  const allergy =
    p.allergies === "sim"
      ? firstChoice(p.allergyDetails, "allergyDetails", [NOT_DETAILED])
      : "";
  return [
    `Rotina: ${lowerFirst(routine)}`,
    `Horários: acorda às ${p.wakeTime} e dorme às ${p.sleepTime}`,
    `Alimentação: ${lowerFirst(diet)}${allergy ? `, sem ${lowerFirst(allergy)}` : ""}`,
    v === "habitos"
      ? "Cuidados: considerados nas sugestões"
      : `Objetivo: ${lowerFirst(goalLabel(p.goal))}`,
  ];
}

export interface CascadeRow {
  key: "basal" | "gasto" | "meta";
  label: string;
  value: string;
  detail: string;
  widthPercent: number;
}
const ACTIVITY_TEXT: Record<Profile["activityLevel"], string> = {
  sedentario: "sedentária",
  leve: "leve",
  moderado: "moderada",
  intenso: "intensa",
};
/** Largura mínima das barras da cascata (%). */
const CASCADE_MIN_WIDTH = 16;

function metaDetail(goals: Goals, expenditure: number, target: number): string {
  if (goals.strategy === "manual") return "informada por você";
  if (goals.strategy === "deficit")
    return `${fmtKcal(expenditure - target)} a menos por dia`;
  if (goals.strategy === "superavit")
    return `${fmtKcal(target - expenditure)} a mais por dia`;
  return "igual ao gasto";
}

/**
 * Cascata basal → gasto → meta; null sem estimativa. A tela mostra "Gasto estimado" e "Sua meta"
 * com barras; "Em repouso" (basal) fica em "Como calculamos".
 */
export function planCascade(p: Profile, goals: Goals): CascadeRow[] | null {
  const ruler = goalRuler(goals);
  if (!ruler) return null;
  const { basal, expenditure, target } = ruler;
  const widths = relativeHeights([basal, expenditure, target], CASCADE_MIN_WIDTH);
  return [
    {
      key: "basal",
      label: "Em repouso",
      value: fmtKcal(basal),
      detail: "o que seu corpo gasta parado",
      widthPercent: widths[0],
    },
    {
      key: "gasto",
      label: "Gasto estimado",
      value: fmtKcal(expenditure),
      detail: `atividade ${ACTIVITY_TEXT[p.activityLevel]}`,
      widthPercent: widths[1],
    },
    {
      key: "meta",
      label: "Sua meta",
      value: fmtKcal(target),
      detail: metaDetail(goals, expenditure, target),
      widthPercent: widths[2],
    },
  ];
}

const GLASS_ML = 250;
/** Meta de água em copos de 250 ml; null sem meta. */
export function planWater(
  goals: Pick<Goals, "water">,
): { glasses: number; label: string; aria: string } | null {
  if (goals.water === null || goals.water <= 0) return null;
  const glasses = Math.round(goals.water / GLASS_ML);
  const count = plural(glasses, "copo", "copos");
  return {
    glasses,
    label: `${count} de 250 ml`,
    aria: `Meta de água: ${count} de 250 ml, ${fmtWater(goals.water)} por dia`,
  };
}

/** Linha do dia (só leitura): "Seu dia: acordar 07:00, café da manhã 08:00, …". */
export function dayLine(p: Pick<Profile, DayPointKey>): {
  items: { key: DayPointKey; label: string; time: string }[];
  aria: string;
} {
  const items = DAY_POINTS.map((point) => ({
    key: point.key,
    label: point.label,
    time: p[point.key],
  }));
  return {
    items,
    aria: `Seu dia: ${items.map((i) => `${lowerFirst(i.label)} ${i.time}`).join(", ")}`,
  };
}

export const planRingAria = (calories: number) =>
  `Meta de ${fmtKcal(calories)} por dia`;
