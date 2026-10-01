import { z } from "zod";
import { clip } from "./agent-blocks";
import { CONFIDENCE, CONFIDENCE_LABEL } from "./plate-photo";

/**
 * Leitura do rótulo do frasco por foto (INJECAO-X2). Módulo folha: importa só zod, ./agent-blocks e
 * ./plate-photo, nunca src/types.ts nem ./injection em tempo de execução (types.ts → structured.ts →
 * este arquivo). O modelo só transcreve o que está impresso (mg, ml, trecho, nome); o app confere que
 * o trecho contém os números, calcula a concentração e a pessoa confirma no frasco antes de qualquer uso.
 * A foto nunca é gravada: nada aqui guarda imagem.
 */

export const LABEL_PROBLEMS = [
  "reflexo",
  "cortado",
  "desfocado",
  "varias_concentracoes",
  "nao_e_rotulo",
] as const;
export type LabelProblem = (typeof LABEL_PROBLEMS)[number];
export const LABEL_CANDIDATES_MAX = 3;
/**
 * Falhas ao preparar a foto no aparelho, iguais no web e no app (no web, a redução da foto é a mesma
 * da despensa: src/lib/storage.ts readPantryPhoto).
 */
export const LABEL_PHOTO_ERRORS = {
  prepare: "Não foi possível preparar a foto. Tente de novo.",
  open: "Não foi possível abrir a foto.",
} as const;
/** Pedido fixo do modo rótulo: a pessoa não digita nada, e o servidor ignora o texto que chegar e usa este. */
export const LABEL_REQUEST_TEXT = "Leia a concentração impressa neste rótulo.";
/** Iguais a CONCENTRATION_MIN/MAX (./injection); um teste garante. */
export const LABEL_CONC_MIN = 0.1;
export const LABEL_CONC_MAX = 50;
export const LABEL_MG_MAX = 1000;
export const LABEL_ML_MAX = 10;

export const labelCandidateSchema = z.object({
  mg: z.number(),
  ml: z.number(),
  trecho: clip(60),
  confianca: z.enum(CONFIDENCE),
});
export const labelReadSchema = z.object({
  nome: clip(60).nullable(),
  candidatos: z.array(labelCandidateSchema).max(LABEL_CANDIDATES_MAX),
  problemas: z.array(z.enum(LABEL_PROBLEMS)).max(LABEL_PROBLEMS.length),
});
export type LabelRead = z.infer<typeof labelReadSchema>;
export type LabelCandidate = z.infer<typeof labelCandidateSchema>;

export const LABEL_PROBLEM_TEXT: Record<LabelProblem, string> = {
  reflexo: "Há reflexo sobre o rótulo.",
  cortado: "Parte do rótulo ficou fora da foto.",
  desfocado: "A foto ficou desfocada.",
  varias_concentracoes: "O rótulo mostra mais de uma concentração.",
  nao_e_rotulo: "A foto não parece ser do rótulo de um frasco.",
};

const TOLERANCE = 1e-9;
/** Número inteiro, sem pegar pedaço de outro ("2.5" nunca vira "5"). */
const NUM = String.raw`(?<![\d.])(\d+(?:\.\d+)?)`;
/** "10 mg/2 ml", "5mg/ml", "5 mg por ml", "2.5 mg em 0.5 ml": o número antes de "mg" é o mg, o número antes de "ml" é o ml. */
const MG_PER_ML = new RegExp(
  String.raw`${NUM}\s*mg\s*(?:\/|por|em|a cada|cada)\s*${NUM}?\s*ml(?![a-z])`,
  "g",
);
/** "cada ml contém 5 mg", "cada 0.5 ml contém 2.5 mg". */
const EACH_ML = new RegExp(String.raw`cada\s*${NUM}?\s*ml(?![a-z])[^0-9]{0,20}?${NUM}\s*mg(?![a-z])`, "g");
const CONFIDENCE_RANK: Record<LabelCandidate["confianca"], number> = { high: 0, medium: 1, low: 2 };

/** Minúsculas e vírgula decimal como ponto ("2,5 mg/0,5 mL" → "2.5 mg/0.5 ml"). */
const normalizeTrecho = (text: string) => text.toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
const same = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

/** Pares (mg, ml) impressos no trecho; ml sem número impresso vale 1. */
function printedPairs(text: string): { mg: number; ml: number }[] {
  const perMl = [...text.matchAll(MG_PER_ML)].map((m) => ({ mg: Number(m[1]), ml: Number(m[2] ?? 1) }));
  const eachMl = [...text.matchAll(EACH_ML)].map((m) => ({ mg: Number(m[2]), ml: Number(m[1] ?? 1) }));
  return [...perMl, ...eachMl];
}

/** O trecho confirma os números: normaliza (minúsculas, "d,d" → "d.d") e exige um par impresso em que o número junto de
 *  "mg" é o mg e o número junto de "ml" é o ml (sem número ⇒ 1). Troca de valores, ml diferente do impresso e "mcg" não
 *  passam. Tolerância 1e-9. */
export function trechoMatches(c: LabelCandidate): boolean {
  return printedPairs(normalizeTrecho(c.trecho)).some((p) => same(p.mg, c.mg) && same(p.ml, c.ml));
}

const concentrationKey = (c: LabelCandidate) => Math.round((c.mg / c.ml) * 10_000) / 10_000;

function isPlausible(c: LabelCandidate): boolean {
  if (!Number.isFinite(c.mg) || !Number.isFinite(c.ml)) return false;
  if (c.mg <= 0 || c.mg > LABEL_MG_MAX || c.ml <= 0 || c.ml > LABEL_ML_MAX) return false;
  const concentration = c.mg / c.ml;
  return concentration >= LABEL_CONC_MIN && concentration <= LABEL_CONC_MAX && trechoMatches(c);
}

/** Um candidato por concentração (round(mg/ml, 4)): fica o de maior confiança, na posição do primeiro. */
function uniqueCandidates(list: readonly LabelCandidate[]): LabelCandidate[] {
  const kept: LabelCandidate[] = [];
  for (const candidate of list) {
    const at = kept.findIndex((k) => concentrationKey(k) === concentrationKey(candidate));
    if (at === -1) kept.push(candidate);
    else if (CONFIDENCE_RANK[candidate.confianca] < CONFIDENCE_RANK[kept[at].confianca])
      kept[at] = candidate;
  }
  return kept;
}

/** Nunca null: nome aparado ou null; candidatos finitos com 0 < mg ≤ 1000, 0 < ml ≤ 10, trechoMatches e mg/ml em [0,1; 50];
 *  sem repetir round(mg/ml, 4) (fica o de maior confiança); ordem high > medium > low (estável); problemas únicos na ordem de LABEL_PROBLEMS. */
export function sanitizeLabelRead(read: LabelRead): LabelRead {
  const nome = read.nome?.trim() || null;
  const plausible = read.candidatos
    .map((c) => ({ ...c, trecho: c.trecho.trim() }))
    .filter(isPlausible);
  // sort é estável: empates de confiança ficam na ordem do modelo.
  const candidatos = uniqueCandidates(plausible)
    .sort((a, b) => CONFIDENCE_RANK[a.confianca] - CONFIDENCE_RANK[b.confianca])
    .slice(0, LABEL_CANDIDATES_MAX);
  const problemas = LABEL_PROBLEMS.filter((p) => read.problemas.includes(p));
  return { nome, candidatos, problemas };
}

const fmtLabelNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Texto determinístico para guarda, revisor e histórico (sem a concentração calculada). */
export function renderLabelText(read: LabelRead): string {
  const lines = ["**Leitura do rótulo** (confira no frasco)"];
  if (read.nome) lines.push(`- Nome impresso: ${read.nome}`);
  if (read.candidatos.length)
    for (const c of read.candidatos)
      lines.push(
        `- No rótulo: "${c.trecho}" (mg ${fmtLabelNumber(c.mg)}; ml ${fmtLabelNumber(c.ml)}; ${CONFIDENCE_LABEL[c.confianca].toLowerCase()})`,
      );
  else lines.push("- Nenhuma concentração legível na foto.");
  if (read.problemas.length)
    lines.push(`- Observações: ${read.problemas.map((p) => LABEL_PROBLEM_TEXT[p]).join(" ")}`);
  return lines.join("\n");
}
