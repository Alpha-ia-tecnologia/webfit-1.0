import {
  dietPlanSchema,
  type AgentReply,
  type DietPlan,
  type Profile,
} from "../types";
import { normalizeText } from "./allergens";
import { localDate, uid } from "./domain";
import { fmtKg } from "./format";
import { parseRichText, plainText, type RichSection } from "./rich-text";
import { bodyNumbers } from "./space";
import { visibleText } from "./text";

export const DIET_PLAN_REQUEST =
  "Crie minha dieta personalizada com base na anamnese: um breve resumo, refeições para um dia com horários, alimentos e porções sugeridas, substituições e orientações práticas. Considere meu objetivo, alergias, alimentos evitados, preferências, rotina, orçamento e tempo para cozinhar. Respeite meu plano profissional e as limitações de saúde informadas.";

/**
 * Perfis salvos antes das condições estruturadas não tinham conditionTags; ao carregar, o esquema
 * acrescenta []. A lista vazia fica fora da assinatura (dietas salvas continuam atuais) e só uma
 * lista marcada (inclusive "nenhuma") muda a assinatura.
 */
function signedAnswers(
  answers: Record<string, unknown>,
  conditionTags: readonly string[] | undefined,
): Record<string, unknown> {
  return conditionTags?.length ? { ...answers, conditionTags } : answers;
}

/** Identifica mudanças no contexto alimentar sem duplicar as respostas no plano. */
export function dietProfileSignature(profile: Profile): string {
  /* eslint-disable @typescript-eslint/no-unused-vars -- campos tirados de propósito; só o resto entra na assinatura */
  const {
    name,
    consentAi,
    aiConsentVersion,
    consentLocal,
    hideCalories,
    // Preferência de exibição, não muda a dieta.
    hideBodyNumbers,
    remindersEnabled,
    quietStart,
    quietEnd,
    hydrationInterval,
    // Dia da aplicação da caneta: não muda o conteúdo alimentar nem invalida dietas salvas.
    penWeekday,
    // Condições estruturadas: só entram quando marcadas (ver signedAnswers).
    conditionTags,
    ...answers
  } = profile;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const value = JSON.stringify(
    Object.entries(signedAnswers(answers, conditionTags)).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  let first = 2166136261;
  let second = 5381;
  for (let i = 0; i < value.length; i++) {
    first = Math.imul(first ^ value.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(i);
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

export function isDietPlanStale(plan: DietPlan, profile: Profile): boolean {
  return plan.profileSignature !== dietProfileSignature(profile);
}

export function createDietPlan(reply: AgentReply, profile: Profile): DietPlan {
  if (reply.meta.urgency === "imediata") throw new Error(reply.text);
  if (
    !reply.meta.reviewed ||
    !reply.meta.specialists.includes("nutricionista")
  ) {
    throw new Error(
      "O agente não concluiu uma dieta revisada. Tente novamente.",
    );
  }
  return dietPlanSchema.parse({
    id: uid(),
    text: reply.text,
    meta: reply.meta,
    createdAt: new Date().toISOString(),
    profileSignature: dietProfileSignature(profile),
    ...(reply.structured?.kind === "diet" ? { structured: reply.structured.plan } : {}),
  });
}

export interface DietChip {
  kind: "goal" | "allergy" | "pattern" | "time" | "professional";
  label: string;
}
const GOAL_LABEL: Record<Profile["goal"], string> = {
  organizar: "Organizar a rotina",
  manter: "Manter o peso",
  perder: "Reduzir o peso",
  ganhar: "Ganhar massa",
};
const PATTERNS: [RegExp, string][] = [
  [/vegan/i, "Vegana"],
  [/vegetarian/i, "Vegetariana"],
  [/sem gl[uú]ten|cel[ií]ac/i, "Sem glúten"],
  [/sem lactose|intoler[aâ]ncia [aà] lactose/i, "Sem lactose"],
];
const NO_PLAN = /^\s*$|n[aã]o (tenho|fa[cç]o|sigo)|nenhum/i;
const firstItem = (text: string) =>
  text
    .split(/[,;\n]|\se\s/)[0]
    .trim()
    .toLowerCase()
    .slice(0, 22);

/**
 * Personalização da dieta em chips curtos, a partir da anamnese. Perfis calmos (transtorno
 * alimentar, gestação, inclusive "prefiro não informar", ou menores) e quem ocultou os números
 * do corpo não veem pesos.
 */
export function dietChips(profile: Profile, today = localDate()): DietChip[] {
  const chips: DietChip[] = [];
  const target =
    bodyNumbers(profile, today) === "full" && profile.goal !== "organizar"
      ? profile.goal === "manter"
        ? profile.weight
        : profile.targetWeight
      : null;
  chips.push({
    kind: "goal",
    label: target
      ? `${profile.goal === "manter" ? "Manter" : "Meta de"} ${fmtKg(target)}`
      : GOAL_LABEL[profile.goal],
  });
  const allergy = firstItem(profile.allergyDetails);
  if (profile.allergies === "sim" && allergy)
    chips.push({ kind: "allergy", label: `Sem ${allergy}` });
  const pattern = PATTERNS.find(([test]) => test.test(profile.diet));
  if (pattern) chips.push({ kind: "pattern", label: pattern[1] });
  const cooking = /(\d{1,3})\s*(min|h)/i.exec(profile.cookingTime);
  if (cooking)
    chips.push({
      kind: "time",
      label: `${cooking[1]} ${cooking[2].toLowerCase() === "h" ? "h" : "min"} para cozinhar`,
    });
  if (!NO_PLAN.test(profile.professionalPlan))
    chips.push({ kind: "professional", label: "Segue plano profissional" });
  return chips.slice(0, 4);
}

const MEAL_LINE =
  /^(caf[eé]|desjejum|lanche|almo[cç]o|jantar|ceia|cola[cç][aã]o|pr[eé]-treino|p[oó]s-treino)/i;
const clip = (text: string, max = 64) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const DAY_SECTION = "seu dia de alimentacao";

/** Títulos das refeições ("### Almoço · 12:00") da seção "Seu dia de alimentação", se houver. */
function dayHeadings(sections: RichSection[]): string[] {
  const day = sections.find(
    (section) =>
      section.title !== null &&
      normalizeText(plainText(section.title)).trim() === DAY_SECTION &&
      section.blocks.some((block) => block.kind === "heading"),
  );
  if (!day) return [];
  const headings = day.blocks.flatMap((block) =>
    block.kind === "heading" ? [clip(plainText(block.inlines).trim())] : [],
  );
  return [...new Set(headings)].filter(Boolean);
}

/**
 * Até `max` destaques do plano (refeições e horários) para o cartão-resumo do chat. Planos com
 * refeições em títulos (o texto da dieta estruturada) usam esses títulos; os demais, a heurística.
 */
export function dietHighlights(
  text: string,
  hideCalories: boolean,
  max = 5,
  hideBodyNumbers = false,
): string[] {
  const sections = parseRichText(visibleText(text, hideCalories, hideBodyNumbers));
  const headings = dayHeadings(sections);
  if (headings.length) return headings.slice(0, max);
  const lines: string[] = [];
  for (const section of sections) {
    if (section.title) lines.push(plainText(section.title));
    for (const block of section.blocks) {
      if (block.kind === "heading" || block.kind === "paragraph")
        lines.push(plainText(block.inlines));
      else if (block.kind === "bullets" || block.kind === "steps")
        lines.push(...block.items.map(plainText));
      else
        lines.push(
          ...block.items.map((m) => `${m.label}: ${plainText(m.value)}`),
        );
    }
  }
  const meals = lines
    .map((line) => line.trim())
    .filter((line) => MEAL_LINE.test(line))
    .map((line) => clip(line.split(/:\s|\s[—–-]\s/)[0].replace(/[:.]$/, "")));
  const unique = [...new Set(meals)];
  return (unique.length ? unique : lines.slice(0, 3).map((l) => clip(l)))
    .filter(Boolean)
    .slice(0, max);
}
