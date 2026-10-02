/**
 * Regras do fluxo da anamnese (Onda 3 · Lote 1): versão do rascunho, o que o fluxo esconde,
 * respostas derivadas (sono, silêncio, dia da caneta) e o filtro de cuidado no rascunho.
 * Lógica pura, compartilhada entre web e app nativo.
 */
import type { Draft } from "../types";
import { parseConditionTags, type ConditionTag } from "./conditions";
import {
  ageAt,
  localDate,
  needsIndividualCare,
  type CareInput,
} from "./domain";
import { sleepDurationHours, toMinutes } from "./day-timeline";
import { isWeeklyDraft, PEN_ENTRY_KEYS, PEN_KEYS, weekdayOf } from "./pen-setup";

/** Rascunhos gravados por este fluxo levam a marca; os antigos não. */
export const FLOW_KEY = "anamneseFlow";
export const FLOW_VERSION = 2;
/** Etapa antiga → etapa nova (a antiga 2, onde ficava a triagem, vira "Cuidados importantes"). */
export const LEGACY_STEP_MAP = [0, 2, 1, 4, 5, 6, 6, 7] as const;
export const withFlowMarker = (answers: Draft): Draft => ({
  ...answers,
  [FLOW_KEY]: FLOW_VERSION,
});
export const hasFlowMarker = (draft: Draft | null) =>
  draft?.[FLOW_KEY] === FLOW_VERSION;

/** Rascunho ou perfil salvo: as regras abaixo só leem campos de texto. */
type DraftLike = Readonly<Record<string, unknown>>;

/** Mesmo critério de isSensitive, no rascunho: resposta vazia conta como sensível (sem triagem = cautela). */
export const isSensitiveDraft = (a: DraftLike) =>
  a.eatingDisorder !== "nao" || a.pregnancy !== "nao";

/** Os campos do filtro de cuidado como texto (vazio quando não respondidos); condições em "a,b". */
export function careInput(a: Draft): CareInput {
  const text = (value: Draft[string] | undefined) => String(value ?? "");
  return {
    birthDate: text(a.birthDate),
    sex: text(a.sex),
    pregnancy: text(a.pregnancy),
    eatingDisorder: text(a.eatingDisorder),
    conditions: text(a.conditions),
    conditionTags: text(a.conditionTags),
  };
}

/**
 * Condições do rascunho: lá ficam como texto "hipertensao,diabetes_tipo_2" (o rascunho só guarda
 * texto, número ou sim/não); na conclusão, profileSchema as converte na lista validada
 * (parseConditionTags/formatConditionTags em lib/conditions fazem as duas direções).
 */
export const draftConditionTags = (a: Draft): ConditionTag[] =>
  parseConditionTags(a.conditionTags);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ADULT_AGE = 18;

/** Idade na data; null sem data de nascimento válida. */
export function draftAge(a: DraftLike, today: string): number | null {
  const birthDate = String(a.birthDate ?? "");
  return DATE_PATTERN.test(birthDate) ? ageAt(birthDate, today) : null;
}
/** IMC e peso desejado: adulto (≥ 18) e perfil não sensível. */
export const canShowBodyNumbers = (a: DraftLike, today: string) =>
  !isSensitiveDraft(a) && (draftAge(a, today) ?? 0) >= ADULT_AGE;
/** Projeção: objetivo perder/ganhar e nenhum motivo de avaliação individual (inclui condições e sexo não informado). */
export const canShowProjection = (a: Draft, today: string) =>
  (a.goal === "perder" || a.goal === "ganhar") &&
  !needsIndividualCare(careInput(a), today);

const REMINDER_KEYS: ReadonlySet<string> = new Set([
  "quietStart",
  "quietEnd",
  "hydrationInterval",
]);

/** Campos que o fluxo esconde (e que não entram na revisão nem no progresso). */
export function flowHidden(
  a: Draft,
  key: string,
  today = localDate(),
): boolean {
  if (key === "targetWeight")
    return (
      !(a.goal === "perder" || a.goal === "ganhar") ||
      !canShowBodyNumbers(a, today)
    );
  if (key === "manualCalories") return a.hideCalories === true;
  if (REMINDER_KEYS.has(key)) return a.remindersEnabled !== true;
  if (key === "penWeekday") return !isWeeklyDraft(a);
  return false;
}

const GOALS: ReadonlySet<string> = new Set([
  "organizar",
  "manter",
  "perder",
  "ganhar",
]);
/** Chaves que já chegam respondidas do primeiro acesso e viram o cartão "O que você já contou" (só etapa 0). */
export function prefilledKeys(a: Draft): ("goal" | "consentLocal")[] {
  const keys: ("goal" | "consentLocal")[] = [];
  if (typeof a.goal === "string" && GOALS.has(a.goal)) keys.push("goal");
  if (a.consentLocal === true) keys.push("consentLocal");
  return keys;
}

/** Os padrões de emptyDraft para o silêncio dos lembretes. */
export const DEFAULT_QUIET = { start: "22:00", end: "07:00" } as const;
/** O silêncio acompanha o sono enquanto for igual a ele ou ainda estiver nos padrões. */
export const isQuietLinked = (a: Draft) =>
  (a.quietStart === a.sleepTime && a.quietEnd === a.wakeTime) ||
  (a.quietStart === DEFAULT_QUIET.start && a.quietEnd === DEFAULT_QUIET.end);

const SLEEP_KEYS: ReadonlySet<string> = new Set(["sleepTime", "wakeTime"]);
const PEN_ENTRY: ReadonlySet<string> = new Set(PEN_ENTRY_KEYS);
const isValidDate = (value: unknown): value is string =>
  typeof value === "string" &&
  DATE_PATTERN.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00`));

/** Aplica uma resposta e o que depende dela, sem efeitos colaterais. */
export function applyAnswer(
  a: Draft,
  key: string,
  value: string | boolean,
): Draft {
  let next: Draft = { ...a, [key]: value };
  if (SLEEP_KEYS.has(key)) {
    const hours = sleepDurationHours(next.sleepTime, next.wakeTime);
    if (hours !== null) next = { ...next, sleepHours: String(hours) };
    const bothValid =
      toMinutes(next.sleepTime) !== null && toMinutes(next.wakeTime) !== null;
    if (isQuietLinked(a) && bothValid)
      next = { ...next, quietStart: next.sleepTime, quietEnd: next.wakeTime };
  }
  // Ao ligar os lembretes, o silêncio ainda ligado ao sono (ou nos padrões) passa a ser o sono
  // (igual no web e no app: antes era uma regra só da tela do web).
  if (
    key === "remindersEnabled" &&
    value === true &&
    isQuietLinked(a) &&
    toMinutes(next.sleepTime) !== null &&
    toMinutes(next.wakeTime) !== null
  )
    next = { ...next, quietStart: next.sleepTime, quietEnd: next.wakeTime };
  if (PEN_ENTRY.has(key)) next = { ...next, [PEN_KEYS.confirmed]: false };
  // Dia da aplicação sugerido pela data da última aplicação: visível e editável, nunca sobrescreve.
  if (
    key === PEN_KEYS.date &&
    isWeeklyDraft(next) &&
    String(next.penWeekday ?? "") === "" &&
    isValidDate(value)
  )
    next = { ...next, penWeekday: String(weekdayOf(value)) };
  return next;
}

const isEmpty = (value: Draft[string] | undefined) =>
  String(value ?? "").trim() === "";
/** As três refeições principais da linha do dia. */
const DEFAULT_MEALS = "3";

/** No "Salvar e continuar": preenche o que a linha do dia deriva e ainda está vazio, só para chaves da etapa enviada. */
export function withDerivedDefaults(
  a: Draft,
  stepKeys: readonly string[],
): Draft {
  let next = a;
  if (stepKeys.includes("mealsPerDay") && isEmpty(a.mealsPerDay))
    next = { ...next, mealsPerDay: DEFAULT_MEALS };
  const hours = sleepDurationHours(a.sleepTime, a.wakeTime);
  if (stepKeys.includes("sleepHours") && isEmpty(a.sleepHours) && hours !== null)
    next = { ...next, sleepHours: String(hours) };
  return next;
}

/**
 * Ao concluir (e ao salvar uma seção): penWeekday só vale para caneta semanal, e o peso desejado
 * escondido pelo fluxo (objetivo sem perder/ganhar, perfil sensível ou menor de 18) é apagado, para
 * uma meta antiga não alimentar o caminho e o ritmo da Evolução.
 */
export function finalizeAnswers(a: Draft, today = localDate()): Draft {
  let next = a;
  if (!isWeeklyDraft(next) && next.penWeekday !== "")
    next = { ...next, penWeekday: "" };
  if (flowHidden(next, "targetWeight", today) && !isEmpty(next.targetWeight))
    next = { ...next, targetWeight: "" };
  return next;
}
