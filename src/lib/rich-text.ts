/**
 * Interpreta o markdown leve das respostas do agente em blocos tipados, sem HTML,
 * para que web e app nativo desenhem títulos, listas, passos e metadados em vez de asteriscos.
 */
import { HIDDEN_CALORIES } from "./text";

export type RichInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "hidden" };
export type RichMeta = { label: string; value: RichInline[] };
export type RichBlock =
  | { kind: "heading"; inlines: RichInline[] }
  | { kind: "paragraph"; inlines: RichInline[] }
  | { kind: "bullets"; items: RichInline[][] }
  | { kind: "steps"; start: number; items: RichInline[][] }
  | { kind: "meta"; items: RichMeta[] };
export type RichSection = { title: RichInline[] | null; blocks: RichBlock[] };

const HEADING = /^(#{1,6})\s+(.+)$/;
const BOLD_LINE = /^\*\*([^*]+)\*\*:?$/;
const BULLET = /^[-*•]\s+(.+)$/;
const STEP = /^(\d{1,3})[.)]\s+(.+)$/;
/** Rótulo em negrito com dois-pontos dentro ou logo depois: "**Tempo:** 35 min" ou "**Tempo**: 35 min". */
const META_SEGMENT = /^\*\*([^*]+?)(?::\*\*|\*\*:)\s*(.+)$/;
/** Rótulo de metadado é curto e não é frase: "**Boa semana!** De 17 a 23…" continua parágrafo. */
const META_LABEL_MAX = 32;
const SENTENCE_END = /[.!?]$/;
const RULE = /^([-*_])\1{2,}$/;

/** Texto corrido de trechos inline, como um leitor de tela ou busca os veria. */
export function plainText(inlines: RichInline[]): string {
  return inlines
    .map((part) => (part.kind === "hidden" ? "calorias ocultas" : part.text))
    .join("");
}

function pushText(out: RichInline[], kind: "text" | "strong", text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) {
    out[out.length - 1] = { kind, text: last.text + text };
    return;
  }
  out.push({ kind, text });
}

/** Remove marcas de ênfase simples, links e código que sobraram sem par. */
function cleanMarks(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/\*{2,}|__/g, "");
}

/** Converte uma linha em trechos: negrito, calorias ocultas e texto limpo. */
export function parseInline(line: string): RichInline[] {
  const out: RichInline[] = [];
  // Negrito primeiro: assim "**Meta: [calorias ocultas] por dia**" mantém o negrito ao redor da pílula.
  line.split(/\*\*([^*]+)\*\*|__([^_]+)__/g).forEach((part, j) => {
    if (part === undefined) return;
    // split com dois grupos: posições 1 e 2 (mod 3) são os trechos em negrito.
    const kind = j % 3 === 0 ? "text" : "strong";
    part.split(HIDDEN_CALORIES).forEach((piece, index) => {
      if (index > 0) out.push({ kind: "hidden" });
      pushText(out, kind, kind === "text" ? cleanMarks(piece) : piece);
    });
  });
  const last = out[out.length - 1];
  if (last && last.kind !== "hidden") {
    const trimmed = last.text.trimEnd();
    if (trimmed) out[out.length - 1] = { ...last, text: trimmed };
    else out.pop();
  }
  return out;
}

/** "**Tempo:** 35 min · **Rendimento:** 3 porções" vira pares rótulo/valor; senão, null. */
function parseMeta(line: string): RichMeta[] | null {
  if (!line.startsWith("**")) return null;
  const items: RichMeta[] = [];
  for (const segment of line.split(/\s+[·|]\s+/)) {
    const match = META_SEGMENT.exec(segment.trim());
    const label = match?.[1].trim();
    if (!match || !label || label.length > META_LABEL_MAX || SENTENCE_END.test(label)) return null;
    items.push({ label, value: parseInline(match[2]) });
  }
  return items;
}

/** Divide o texto em seções (títulos # ou ##) com blocos de parágrafo, lista, passos e metadados. */
export function parseRichText(text: string): RichSection[] {
  const sections: RichSection[] = [{ title: null, blocks: [] }];
  const current = () => sections[sections.length - 1];
  const lastBlock = () => current().blocks[current().blocks.length - 1];

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || RULE.test(line)) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const inlines = parseInline(heading[2]);
      if (heading[1].length <= 2) {
        const section = current();
        if (section.title || section.blocks.length) sections.push({ title: inlines, blocks: [] });
        else section.title = inlines;
      } else current().blocks.push({ kind: "heading", inlines });
      continue;
    }
    const bold = BOLD_LINE.exec(line);
    if (bold) {
      current().blocks.push({ kind: "heading", inlines: parseInline(bold[1]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      const block = lastBlock();
      if (block?.kind === "bullets") block.items.push(parseInline(bullet[1]));
      else current().blocks.push({ kind: "bullets", items: [parseInline(bullet[1])] });
      continue;
    }
    const step = STEP.exec(line);
    if (step) {
      const block = lastBlock();
      if (block?.kind === "steps") block.items.push(parseInline(step[2]));
      else
        current().blocks.push({
          kind: "steps",
          start: Number(step[1]),
          items: [parseInline(step[2])],
        });
      continue;
    }
    const meta = parseMeta(line);
    if (meta) {
      current().blocks.push({ kind: "meta", items: meta });
      continue;
    }
    const inlines = parseInline(line);
    if (inlines.length) current().blocks.push({ kind: "paragraph", inlines });
  }
  return sections;
}
