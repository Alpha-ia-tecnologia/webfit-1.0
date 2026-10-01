import { questionnaire, type Question } from "../../data/questionnaire";
import type { Draft } from "../../types";
import {
  flowHidden,
  hasFlowMarker,
  LEGACY_STEP_MAP,
} from "../../lib/anamnese-flow";
import { formatDate, localDate } from "../../lib/domain";
import { intervalLabel, penIntervalDays } from "../../lib/injection";
import { toNumber } from "./inputs";

/** Marcos que viram um aviso acolhedor; o confete fica só na revelação do plano. */
export const MILESTONES = [50, 100] as const;
export type Milestone = (typeof MILESTONES)[number];
/** Tempo médio por pergunta visível: a maioria é de toque (chips, cartões, réguas). */
const SECONDS_PER_QUESTION = 12;

export function isAnswered(answers: Draft, field: Question): boolean {
  const value = answers[field.key];
  return typeof value === "boolean" ? value : String(value ?? "").trim() !== "";
}

const ALL_FIELDS = questionnaire.slice(0, -1).flatMap((step) => step.fields);

/**
 * Uma pergunta condicional só existe quando a resposta da qual depende tem o valor esperado;
 * o fluxo também esconde perguntas que não se aplicam (flowHidden).
 */
export function isShown(
  answers: Draft,
  field: Question,
  today = localDate(),
): boolean {
  return (
    (!field.showWhen || answers[field.showWhen[0]] === field.showWhen[1]) &&
    !flowHidden(answers, field.key, today)
  );
}

/** Campos que pontuam: obrigatórios visíveis e o consentimento local. */
export function essentialFields(
  answers: Draft,
  fields: Question[] = ALL_FIELDS,
  today = localDate(),
): Question[] {
  return fields.filter(
    (field) =>
      isShown(answers, field, today) &&
      (field.key === "consentLocal" ||
        (!field.optional && field.type !== "checkbox")),
  );
}

/** Cada widget conta uma vez, na primeira chave visível. */
function firstOfWidget(fields: Question[]): Question[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (!field.widget) return true;
    if (seen.has(field.widget)) return false;
    seen.add(field.widget);
    return true;
  });
}

/** Campos desenhados: sem os do cartão "O que você já contou" e com cada widget só na primeira chave visível. */
export function renderableFields(
  fields: Question[],
  answers: Draft,
  skip: readonly string[] = [],
  today = localDate(),
): Question[] {
  return firstOfWidget(
    fields.filter(
      (field) => isShown(answers, field, today) && !skip.includes(field.key),
    ),
  );
}

/** Chaves visíveis cobertas pelo mesmo widget de `field` (para o selo "Bloco respondido" e o foco de erro). */
export function widgetKeys(
  field: Question,
  fields: Question[],
  answers: Draft,
): string[] {
  if (!field.widget) return [field.key];
  return fields
    .filter((f) => f.widget === field.widget && isShown(answers, f))
    .map((f) => f.key);
}

const LAST_STEP = questionnaire.length - 1;

/** Primeira etapa (antes da revisão) com resposta essencial visível em branco; null se todas estão completas. */
export function firstIncompleteStep(
  answers: Draft,
  today = localDate(),
): number | null {
  const index = questionnaire
    .slice(0, LAST_STEP)
    .findIndex((step) =>
      essentialFields(answers, step.fields, today).some(
        (field) => !isAnswered(answers, field),
      ),
    );
  return index === -1 ? null : index;
}

const clampStep = (step: number) =>
  Math.min(LAST_STEP, Math.max(0, Number.isFinite(step) ? Math.trunc(step) : 0));

/**
 * Etapa ao abrir a anamnese. Rascunho do fluxo atual: a etapa salva. Rascunho antigo (sem marca):
 * a etapa correspondente no fluxo novo, sem passar da primeira etapa incompleta.
 */
export function initialStep(
  draft: Draft | null,
  draftStep: number,
  today = localDate(),
): number {
  if (!draft) return 0;
  const step = clampStep(draftStep);
  if (hasFlowMarker(draft)) return step;
  return Math.min(
    LEGACY_STEP_MAP[step] ?? LAST_STEP,
    firstIncompleteStep(draft, today) ?? LAST_STEP,
  );
}

const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);

/** Texto da resposta na revisão (web e app usam o mesmo). */
export function answerText(field: Question, value: Draft[string]): string {
  if (field.key === "weightLossPenPerMonth") {
    const perMonth = toNumber(value);
    if (perMonth !== null)
      return `${capitalize(intervalLabel(penIntervalDays(perMonth)))} (${perMonth} por mês)`;
  }
  if (field.key === "penWeekday" && String(value ?? "").trim() === "")
    return "Varia";
  if (typeof value === "boolean")
    return (
      field.options?.find(([option]) => option === String(value))?.[1] ??
      (value ? "Sim" : "Não")
    );
  const text = String(value ?? "");
  if (!text) return "Não informado";
  if (field.type === "date") return formatDate(text);
  return field.options?.find(([option]) => option === text)?.[1] ?? text;
}

export interface Completion {
  answered: number;
  total: number;
  percent: number;
}

/** Progresso do perfil inteiro, não só da etapa atual. */
export function completion(answers: Draft): Completion {
  const fields = essentialFields(answers);
  const answered = fields.filter((field) => isAnswered(answers, field)).length;
  const percent = fields.length
    ? Math.round((answered / fields.length) * 100)
    : 0;
  return { answered, total: fields.length, percent };
}

/** Respostas essenciais de uma etapa: preenchem o segmento atual da barra de etapas. */
export function stepProgress(
  answers: Draft,
  fields: Question[],
): { answered: number; total: number } {
  const essential = essentialFields(answers, fields);
  return {
    answered: essential.filter((field) => isAnswered(answers, field)).length,
    total: essential.length,
  };
}

/** Minutos estimados para uma etapa, pelas perguntas visíveis (cada widget conta uma vez; mínimo de 1). */
export function stepMinutes(answers: Draft, fields: Question[]): number {
  const visible = renderableFields(fields, answers).length;
  return Math.max(1, Math.round((visible * SECONDS_PER_QUESTION) / 60));
}

/** Maior marco cruzado ao subir de `previous` para `current`; null se nenhum. */
export function reachedMilestone(
  previous: number,
  current: number,
): Milestone | null {
  const crossed = MILESTONES.filter((m) => previous < m && current >= m);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export const MILESTONE_MESSAGES: Record<Milestone, string> = {
  50: "Metade do caminho. O agente já conhece o essencial sobre você.",
  100: "Tudo respondido. Revise com calma e entre no seu espaço.",
};

const PENDING_PREVIEW = 3;
/** Texto do aviso ao tentar avançar com respostas obrigatórias em branco: quantidade e até três rótulos. */
export function pendingMessage(labels: string[]): string {
  const count = labels.length;
  if (!count) return "";
  const shown = labels
    .slice(0, PENDING_PREVIEW)
    .map((label) => label.replace(/[.:?]\s*$/, ""));
  const rest = count - shown.length;
  const list =
    shown.length === 1
      ? shown[0]
      : `${shown.slice(0, -1).join(", ")} e ${shown[shown.length - 1]}`;
  const head = count === 1 ? "Falta 1 resposta" : `Faltam ${count} respostas`;
  return `${head}: ${list}${rest > 0 ? ` e mais ${rest}` : ""}.`;
}
