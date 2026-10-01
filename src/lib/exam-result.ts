import { z } from "zod";
import { clip } from "./agent-blocks";
import { normalizeText } from "./allergens";
import { fmtDateBr, fmtNumber, plural } from "./format";
import { classifiesResult } from "./result-classification";

/**
 * Resultados estruturados do laudo (ESPACO-05). Módulo folha: importa só zod, ./agent-blocks,
 * ./allergens, ./format e ./result-classification, nunca src/types.ts (types.ts depende deste arquivo).
 * O modelo transcreve; o app nunca classifica: referência e marcação são copiadas do laudo, a
 * barra só aparece quando valor e referência impressos são números simples e sem faixa por grupo.
 */

export const DATE_PATTERN = "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$";
const DATE_RE = new RegExp(DATE_PATTERN);
export const EXAM_ROWS_MAX = 60;
export const EXAM_ILLEGIBLE_MAX = 10;
export const EXAM_QUESTIONS_MAX = 6;
export const EXAM_NOTES_MAX = 4;
/** 30.000 unidades UTF-16 (+ espaços do jsonb) ≤ 100.000 bytes: a checagem da 0009 nunca falha. */
export const EXAM_RESULT_MAX_CHARS = 30_000;
/** Texto renderizado sempre abaixo dos 20.000 da guarda (review.ts) e de examSchema.analysis. */
export const EXAM_TEXT_MAX = 19_000;

export const biomarkerSchema = z.object({
  grupo: clip(50).nullable().catch(null),
  nome: clip(80),
  /** Exatamente como impresso ("5,7", "Negativo", "< 0,5"). */
  valor: clip(30),
  unidade: clip(20).nullable().catch(null),
  /** Copiada do laudo; null = o laudo não imprime referência para o resultado. */
  referencia: clip(120).nullable().catch(null),
  /** Marca do próprio laboratório ("H", "*"); nunca do app. */
  marcacao: clip(20).nullable().catch(null),
});
export const examResultSchema = z
  .object({
    /** Data da coleta impressa (AAAA-MM-DD); outro formato vira null. */
    data: z.string().regex(DATE_RE).nullable().catch(null),
    resultados: z.array(biomarkerSchema).max(EXAM_ROWS_MAX),
    ilegiveis: z.array(clip(160)).max(EXAM_ILLEGIBLE_MAX),
    perguntas: z.array(clip(200)).max(EXAM_QUESTIONS_MAX),
    observacoes: z.array(clip(200)).max(EXAM_NOTES_MAX),
  })
  .refine((v) => JSON.stringify(v).length <= EXAM_RESULT_MAX_CHARS);
export type Biomarker = z.infer<typeof biomarkerSchema>;
export type ExamResult = z.infer<typeof examResultSchema>;

/** Textos fixos dos resultados (web e app usam os mesmos). */
export const EXAM_COPY = {
  heading: "Resultados transcritos",
  otherGroup: "Outros resultados",
  none: "Nenhum resultado legível foi transcrito.",
  illegible: "Não foi possível ler",
  notes: "Observações da leitura",
  questions: "Perguntas para levar ao profissional",
  ref: "referência do laudo",
  noRef: "não impressa",
  mark: "marcação do laudo",
  /** Rótulo visível da referência na linha do resultado. */
  refLabel: "Referência do laudo",
  /** Etiqueta neutra da marca impressa pelo laboratório ("Laudo: H"). */
  labMark: (mark: string) => `Laudo: ${mark}`,
  countersLabel: "Resumo da análise",
  showResults: (n: number) => `Ver resultados (${n})`,
  hideResults: "Ocultar resultados",
  questionsLegend: "Perguntas para levar à consulta",
  textToggle: "Ver análise em texto",
  hint: "Transcrição automática: confira cada valor no laudo original e converse com um profissional sobre os resultados, principalmente os marcados pelo laboratório.",
} as const;

export interface ExamGroup {
  title: string | null;
  rows: Biomarker[];
}

const groupKey = (title: string) => normalizeText(title).trim();

/**
 * Grupos na ordem do laudo. Sem nenhum grupo impresso: um só grupo sem título. Com grupos, os
 * resultados sem grupo vão para "Outros resultados", no fim. Sem resultados: lista vazia.
 */
export function examGroups(r: ExamResult): ExamGroup[] {
  if (!r.resultados.length) return [];
  if (!r.resultados.some((row) => row.grupo))
    return [{ title: null, rows: r.resultados }];
  const otherKey = groupKey(EXAM_COPY.otherGroup);
  const order: string[] = [];
  const groups = new Map<string, ExamGroup>();
  const add = (key: string, title: string, row: Biomarker) => {
    const group = groups.get(key);
    if (group) {
      groups.set(key, { ...group, rows: [...group.rows, row] });
      return;
    }
    groups.set(key, { title, rows: [row] });
    order.push(key);
  };
  for (const row of r.resultados) if (row.grupo) add(groupKey(row.grupo), row.grupo, row);
  for (const row of r.resultados) if (!row.grupo) add(otherKey, EXAM_COPY.otherGroup, row);
  return order.map((key) => groups.get(key)!);
}

const rowLine = (row: Biomarker) =>
  `- ${row.nome}: ${row.valor}${row.unidade ? ` ${row.unidade}` : ""} · ${EXAM_COPY.ref}: ${row.referencia ?? EXAM_COPY.noRef}${row.marcacao ? ` · ${EXAM_COPY.mark}: ${row.marcacao}` : ""}`;

const listBlock = (title: string, items: readonly string[]) =>
  items.length ? [`**${title}**\n${items.map((item) => `- ${item}`).join("\n")}`] : [];

/**
 * Texto exato e estável (o que a guarda, o revisor e a dieta veem). Só copia o que foi transcrito:
 * nenhuma palavra que classifique um resultado.
 */
export function renderExamText(r: ExamResult): string {
  const header = r.data
    ? `**${EXAM_COPY.heading} · coleta em ${fmtDateBr(r.data)}**`
    : `**${EXAM_COPY.heading}**`;
  const groups = examGroups(r);
  const body = groups.length
    ? groups.map((g) => {
        const lines = g.rows.map(rowLine).join("\n");
        return g.title ? `### ${g.title}\n${lines}` : lines;
      })
    : [EXAM_COPY.none];
  return [
    header,
    ...body,
    ...listBlock(EXAM_COPY.illegible, r.ilegiveis),
    ...listBlock(EXAM_COPY.notes, r.observacoes),
    ...listBlock(EXAM_COPY.questions, r.perguntas),
  ].join("\n\n");
}

const trimOrNull = (value: string | null) => {
  const text = value?.trim() ?? "";
  return text ? text : null;
};

/**
 * O app nunca classifica: perguntas, observações e trechos ilegíveis que classificam um resultado
 * ("a glicose está alta?", "acima da referência", "normal") são descartados; o mesmo termo em outro
 * sentido fica ("atividade de alta intensidade"). Regras em ./result-classification. A marcação do
 * laboratório (copiada do laudo) nunca passa aqui.
 */
export { classifiesResult };

/**
 * Apara, tira vazios, repetidos (sem diferenciar maiúsculas) e os que classificam resultados;
 * `names` são os nomes e grupos do mesmo laudo.
 */
function uniqueTexts(items: readonly string[], names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key) || classifiesResult(text, names)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Duas linhas repetidas divergem quando ambas trazem referência ou marca, com textos diferentes. */
function conflicts(a: Biomarker, b: Biomarker): boolean {
  const differs = (x: string | null, y: string | null) =>
    x !== null && y !== null && x.toLowerCase() !== y.toLowerCase();
  return differs(a.referencia, b.referencia) || differs(a.marcacao, b.marcacao);
}

/**
 * Limpeza no servidor antes de renderizar (pura, nunca muta): apara, tira linhas sem nome ou valor,
 * junta repetidas, limpa as listas (sem textos que classifiquem resultados). null = inválido (a análise cai para a reserva em texto): sem
 * resultado e sem trecho ilegível, ou texto renderizado acima de EXAM_TEXT_MAX.
 */
export function sanitizeExamResult(r: ExamResult): ExamResult | null {
  const firstAt = new Map<string, number>();
  const resultados: Biomarker[] = [];
  for (const row of r.resultados) {
    const clean: Biomarker = {
      grupo: trimOrNull(row.grupo),
      nome: row.nome.trim(),
      valor: row.valor.trim(),
      unidade: trimOrNull(row.unidade),
      referencia: trimOrNull(row.referencia),
      marcacao: trimOrNull(row.marcacao),
    };
    if (!clean.nome || !clean.valor) continue;
    const key = [clean.grupo ?? "", clean.nome, clean.valor, clean.unidade ?? ""]
      .join("|")
      .toLowerCase();
    const at = firstAt.get(key);
    const kept = at === undefined ? undefined : resultados[at];
    // Repetida junta com a primeira e completa referência ou marca vazias; se as duas trazem
    // textos diferentes do laudo, ficam as duas linhas (nada impresso pelo laboratório se perde).
    if (at !== undefined && kept && !conflicts(kept, clean)) {
      resultados[at] = {
        ...kept,
        referencia: kept.referencia ?? clean.referencia,
        marcacao: kept.marcacao ?? clean.marcacao,
      };
      continue;
    }
    if (at === undefined) firstAt.set(key, resultados.length);
    resultados.push(clean);
  }
  const names = resultados.flatMap((row) => (row.grupo ? [row.nome, row.grupo] : [row.nome]));
  const result: ExamResult = {
    data: r.data,
    resultados,
    ilegiveis: uniqueTexts(r.ilegiveis, names),
    perguntas: uniqueTexts(r.perguntas, names),
    observacoes: uniqueTexts(r.observacoes, names),
  };
  if (!result.resultados.length && !result.ilegiveis.length) return null;
  if (renderExamText(result).length > EXAM_TEXT_MAX) return null;
  return result;
}

const THOUSANDS_DOT = /^[1-9]\d{0,2}(\.\d{3})+$/;
const THOUSANDS_DOT_DECIMAL_COMMA = /^\d{1,3}(\.\d{3})+,\d+$/;

/**
 * Número impresso no laudo ("5,4", "6.500", "1.234,5", "−2"); null para tudo que não é um número
 * simples ("< 0,5", "Negativo", "1/40"). "6.500" é milhar; "0.500" e "1.5" são decimais.
 */
export function parseLabNumber(text: string): number | null {
  const s = text.replace(/\s+/g, "").replace(/−/g, "-");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const hasDot = body.includes(".");
  const hasComma = body.includes(",");
  let plain: string;
  if (hasDot && hasComma) {
    if (!THOUSANDS_DOT_DECIMAL_COMMA.test(body)) return null;
    plain = body.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    if (!/^\d+,\d+$/.test(body)) return null;
    plain = body.replace(",", ".");
  } else if (hasDot) {
    if (THOUSANDS_DOT.test(body)) plain = body.replace(/\./g, "");
    else if (/^\d+\.\d+$/.test(body)) plain = body;
    else return null;
  } else {
    if (!/^\d+$/.test(body)) return null;
    plain = body;
  }
  const n = Number(plain);
  if (!Number.isFinite(n)) return null;
  const value = negative ? -n : n;
  return Object.is(value, -0) ? 0 : value;
}

export interface LabReference {
  min: number | null;
  max: number | null;
}

/** Referências que dependem de sexo, idade, fase ou meta: só texto, nunca barra. */
const TIERED =
  /\b(homens?|mulheres?|masculin\w*|feminin\w*|crianc\w*|adult\w*|idade|anos|desejavel|limitrofe|otimo|risco|fase|gestant\w*|trimestre|jejum|pos[- ]prandial|folicular|lutea|menopausa)\b/;
const NUMBER = "(-?\\d[\\d.,]*)";
const RANGE_RE = new RegExp(`^${NUMBER}\\s*(?:a|ate|-|–|—)\\s*${NUMBER}$`);
const UPPER_RE = new RegExp(`^(?:<|<=|≤|inferior a|menor que|abaixo de|ate)\\s*${NUMBER}$`);
const LOWER_RE = new RegExp(`^(?:>|>=|≥|superior a|maior que|acima de)\\s*${NUMBER}$`);

/**
 * Faixa impressa em uma das três formas simples ("70 a 99", "< 5,7", "> 40"), com a unidade da
 * linha removida. Conservadora: qualquer dúvida devolve null e a tela mostra só o texto (unidade
 * diferente, faixa por sexo/idade/meta, mais de dois números, mínimo ≥ máximo).
 */
export function parseReference(text: string | null, unit: string | null): LabReference | null {
  if (!text) return null;
  let s = normalizeText(text).trim();
  if (/[;\n\r]/.test(s)) return null;
  if ((s.match(/\d+(?:[.,]\d+)*/g) ?? []).length > 2) return null;
  if (TIERED.test(s)) return null;
  const unitText = normalizeText(unit ?? "").trim();
  if (unitText) s = s.split(unitText).join(" ");
  s = s.replace(/\s+/g, " ").trim();
  const range = RANGE_RE.exec(s);
  if (range) {
    const min = parseLabNumber(range[1]!);
    const max = parseLabNumber(range[2]!);
    return min !== null && max !== null && min < max ? { min, max } : null;
  }
  const upper = UPPER_RE.exec(s);
  if (upper) {
    const max = parseLabNumber(upper[1]!);
    return max === null ? null : { min: null, max };
  }
  const lower = LOWER_RE.exec(s);
  if (lower) {
    const min = parseLabNumber(lower[1]!);
    return min === null ? null : { min, max: null };
  }
  return null;
}

export interface BiomarkerScale {
  /** Início e fim da faixa impressa, em % da barra. */
  zoneStart: number;
  zoneEnd: number;
  /** Posição do valor, em % (grampeada em 0–100). */
  dot: number;
  /** O valor passa da barra desenhada (seta neutra), sem rótulo. */
  beyond: "below" | "above" | null;
}

const round1 = (n: number) => {
  const value = Math.round(n * 10) / 10;
  return Object.is(value, -0) ? 0 : value;
};

/** Só aritmética sobre os números impressos; null sem valor numérico ou referência simples. */
export function biomarkerScale(row: Biomarker): BiomarkerScale | null {
  const value = parseLabNumber(row.valor);
  const ref = parseReference(row.referencia, row.unidade);
  if (value === null || !ref) return null;
  const { min, max } = ref;
  let lo: number;
  let hi: number;
  if (min !== null && max !== null) {
    const span = max - min;
    lo = min - span / 2;
    hi = max + span / 2;
  } else if (max !== null) {
    lo = Math.min(0, value, max);
    hi = max + (max - lo) / 2;
  } else if (min !== null) {
    lo = Math.min(0, value, min);
    hi = min + (min - lo);
  } else return null;
  if (!(hi > lo)) return null;
  const pct = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const raw = pct(value);
  return {
    zoneStart: min === null ? 0 : round1(pct(min)),
    zoneEnd: max === null ? 100 : round1(pct(max)),
    dot: Math.min(100, Math.max(0, round1(raw))),
    beyond: raw < 0 ? "below" : raw > 100 ? "above" : null,
  };
}

/** Mesmo exame em laudos diferentes: nome e unidade sem acentos nem maiúsculas. */
export function biomarkerKey(row: Pick<Biomarker, "nome" | "unidade">): string {
  const part = (s: string) => normalizeText(s).replace(/\s+/g, " ").trim();
  return `${part(row.nome)}|${part(row.unidade ?? "")}`;
}

export interface HistoryPoint {
  date: string;
  value: number;
}

/**
 * Valores do mesmo resultado (nome e unidade) nos laudos com análise estruturada, em ordem de
 * data (a da coleta, ou a do exame); uma data repetida fica com o último. Desenhar só com ≥ 2.
 */
export function biomarkerHistory(
  exams: readonly { date: string; analysisStructured?: ExamResult }[],
  row: Pick<Biomarker, "nome" | "unidade">,
): HistoryPoint[] {
  const key = biomarkerKey(row);
  const byDate = new Map<string, number>();
  for (const exam of exams) {
    const result = exam.analysisStructured;
    if (!result) continue;
    for (const item of result.resultados) {
      if (biomarkerKey(item) !== key) continue;
      const value = parseLabNumber(item.valor);
      if (value === null) continue;
      byDate.set(result.data ?? exam.date, value);
      break;
    }
  }
  return [...byDate]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** "5 resultados", "1 marcado pelo laboratório", "1 trecho ilegível": só contagens. */
export function examCounters(r: ExamResult): string[] {
  const marked = r.resultados.filter((row) => row.marcacao).length;
  const illegible = r.ilegiveis.length;
  return [
    plural(r.resultados.length, "resultado", "resultados"),
    marked > 0 ? plural(marked, "marcado pelo laboratório", "marcados pelo laboratório") : null,
    illegible > 0 ? plural(illegible, "trecho ilegível", "trechos ilegíveis") : null,
  ].filter((item): item is string => item !== null);
}

/** Leitura da linha para leitor de tela (rótulo acessível no app). */
export function biomarkerSpeech(row: Biomarker): string {
  const unit = row.unidade ? ` ${row.unidade}` : "";
  const mark = row.marcacao ? ` Marcação do laudo: ${row.marcacao}.` : "";
  return `${row.nome}: ${row.valor}${unit}. ${EXAM_COPY.refLabel}: ${row.referencia ?? EXAM_COPY.noRef}.${mark}`;
}

/** "Histórico nos seus exames: 95 mg/dL em 12/03/2026; 102 mg/dL em 10/08/2026." */
export function historySpeech(points: readonly HistoryPoint[], unit: string | null): string {
  const suffix = unit ? ` ${unit}` : "";
  const items = points.map((p) => `${fmtNumber(p.value, 2)}${suffix} em ${fmtDateBr(p.date)}`);
  return `Histórico nos seus exames: ${items.join("; ")}.`;
}
