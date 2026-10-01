/**
 * Conferência da leitura do rótulo (INJECAO-X2): o que a folha mostra antes de a pessoa confirmar.
 * Reaplica a limpeza sobre o valor do servidor, calcula a concentração no app (mg ÷ ml, 2 casas,
 * arredondamento sempre explicado) e avisa quando o nome impresso é de outro medicamento da
 * calculadora. Nada entra na calculadora sem a confirmação da pessoa; a dose nunca é sugerida.
 * Compartilhado pelo web e pelo app (sem DOM).
 */
import {
  LABEL_PROBLEM_TEXT,
  sanitizeLabelRead,
  type LabelCandidate,
  type LabelRead,
} from "./label-read";
import { fmtConcentration, medication, medicationFor, type MedicationKey } from "./injection";
import { CONFIDENCE_LABEL } from "./plate-photo";

export interface LabelChoice {
  id: string;
  concentration: number;
  text: string;
  printed: string;
  isRounded: boolean;
  roundedNote: string | null;
  confidence: string;
  radioLabel: string;
}
export interface LabelReviewModel {
  state: "single" | "multiple" | "none";
  title: string;
  choices: LabelChoice[];
  preselected: string | null;
  /** "Sim, usar 5 mg/ml" | "Usar a concentração escolhida" | "". */
  confirmLabel: string;
  nameLine: string | null;
  medicationWarning: string | null;
  problems: string[];
}

const ROUNDING_TOLERANCE = 1e-9;
const UNKNOWN_NAME = /n[aã]o sei/i;
const fmtLabelNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function choiceOf(c: LabelCandidate, index: number): LabelChoice {
  const exact = c.mg / c.ml;
  const concentration = Math.round(exact * 100) / 100;
  const text = fmtConcentration(concentration);
  const isRounded = Math.abs(exact - concentration) > ROUNDING_TOLERANCE;
  return {
    id: `c${index}`,
    concentration,
    text,
    printed: c.trecho,
    isRounded,
    roundedNote: isRounded
      ? `Valor arredondado: ${fmtLabelNumber(c.mg)} mg em ${fmtLabelNumber(c.ml)} ml ≈ ${text}.`
      : null,
    confidence: CONFIDENCE_LABEL[c.confianca],
    radioLabel: `${text}, no rótulo “${c.trecho}”`,
  };
}

/** Aviso só quando o nome impresso aponta outro medicamento da calculadora (nunca troca sozinho). */
function medicationWarning(nome: string | null, current: MedicationKey): string | null {
  if (!nome || UNKNOWN_NAME.test(nome)) return null;
  const printed = medicationFor(nome);
  if (printed === "personalizado" || printed === current) return null;
  const calculator = current === "personalizado" ? "Personalizado" : medication(current).label;
  return `O nome no rótulo parece ser ${medication(printed).label}, e a calculadora está em ${calculator}. Confira antes de usar.`;
}

/** Recebe o valor do servidor, reaplica sanitizeLabelRead; concentration = round(mg/ml, 2); text = fmtConcentration;
 *  ids "c0", "c1"…; aviso só quando medicationFor(nome) ≠ "personalizado" e ≠ current (nome vazio ou "não sei" → sem aviso). */
export function labelReview(read: LabelRead | null, current: MedicationKey): LabelReviewModel {
  const clean = read ? sanitizeLabelRead(read) : null;
  const choices = (clean?.candidatos ?? []).map(choiceOf);
  const nome = clean?.nome ?? null;
  const base = {
    choices,
    nameLine: nome ? `Nome no rótulo: ${nome}` : null,
    medicationWarning: medicationWarning(nome, current),
    problems: (clean?.problemas ?? []).map((p) => LABEL_PROBLEM_TEXT[p]),
  };
  const [first] = choices;
  if (!first)
    return { ...base, state: "none", title: "Não encontrei a concentração", preselected: null, confirmLabel: "" };
  if (choices.length === 1)
    return {
      ...base,
      state: "single",
      title: `Confira: ${first.text}?`,
      preselected: first.id,
      confirmLabel: `Sim, usar ${first.text}`,
    };
  return {
    ...base,
    state: "multiple",
    title: "Qual concentração está no seu frasco?",
    preselected: null,
    confirmLabel: "Usar a concentração escolhida",
  };
}
