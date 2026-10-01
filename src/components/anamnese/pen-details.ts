/**
 * Resumo do bloco "Caneta e dose" da anamnese (web e app): o que a pessoa informou, em uma linha
 * ("Mounjaro · 2,5 mg · semanal"). Nunca sugere dose: só repete a resposta. Sem React.
 */
import { penFrequencyOf } from "../../lib/pen-setup";
import type { Draft } from "../../types";
import { toNumber } from "./inputs";

/** Perguntas que moram dentro do bloco "Caneta e dose" (a frequência cobre o dia da aplicação). */
export const PEN_DETAIL_KEYS: readonly string[] = [
  "weightLossPenName",
  "weightLossPenDose",
  "weightLossPenPerMonth",
];
export const PEN_DETAILS_TITLE = "Caneta e dose";
export const PEN_DETAILS_EMPTY = "Qual caneta, a dose e a frequência";

const UNKNOWN = /^n[aã]o sei/i;
const MAX_NAME = 24;
const text = (value: unknown) => String(value ?? "").trim();

/** "Mounjaro (tirzepatida)" → "Mounjaro"; "Não sei o nome" some; texto livre encurtado. */
function penName(value: unknown): string {
  const name = text(value);
  if (!name || UNKNOWN.test(name)) return "";
  const brand = name.replace(/\s*\(.*\)\s*$/, "");
  return brand.length > MAX_NAME ? `${brand.slice(0, MAX_NAME - 1).trimEnd()}…` : brand;
}

function frequencyText(perMonth: unknown): string {
  const frequency = penFrequencyOf(perMonth);
  if (frequency === "semanal") return "semanal";
  if (frequency === "diaria") return "diária";
  const n = toNumber(perMonth);
  return frequency === "outra" && n !== null ? `${n}× por mês` : "";
}

/** "Mounjaro · 2,5 mg · semanal"; null quando nada foi informado ainda. */
export function penDetailsSummary(answers: Draft): string | null {
  const dose = text(answers.weightLossPenDose);
  const parts = [
    penName(answers.weightLossPenName),
    UNKNOWN.test(dose) ? "" : dose,
    frequencyText(answers.weightLossPenPerMonth),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** As três respostas do bloco estão dadas ("Não sei" também conta como resposta). */
export function penDetailsComplete(answers: Draft): boolean {
  return (
    text(answers.weightLossPenName) !== "" &&
    text(answers.weightLossPenDose) !== "" &&
    toNumber(answers.weightLossPenPerMonth) !== null
  );
}
