/**
 * Alergênicos declarados na anamnese (texto livre) e a busca deles em textos do agente.
 * Módulo folha, sem imports: usado pelo cliente (cartões, fichas) e pelo servidor (guarda).
 */

const STOPWORDS = new Set([
  "tenho",
  "tem",
  "sou",
  "alergia",
  "alergias",
  "alergico",
  "alergica",
  "intolerancia",
  "intolerante",
  "com",
  "sem",
  "para",
  "por",
  "uma",
  "uns",
  "umas",
  "dos",
  "das",
  "nao",
  "que",
  "mais",
  "leve",
  "forte",
  "grave",
]);
const MIN_TOKEN_LENGTH = 3;

/** Sem acentos e em minúsculas (a mesma regra do normalize da busca de alimentos). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Singular de um plural comum, sobre texto normalizado: "camaroes"/"paes" → "…ao",
 * "amendoins" → "amendoim", "nozes"/"flores" → "noz"/"flor", "ovos"/"castanhas" → "ovo"/"castanha".
 * Com a busca por prefixo, o singular cobre as duas formas.
 */
function singularOf(token: string): string | null {
  if (/[ao]es$/.test(token)) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("ns")) return `${token.slice(0, -2)}m`;
  if (/[rsz]es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s")) return token.slice(0, -1);
  return null;
}

const isToken = (t: string) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t);

/** Tokens de alergênicos a partir do texto livre da anamnese ("Tenho alergia a camarão e ovo"). */
export function allergenTokens(details: string): string[] {
  const words = normalizeText(details).split(/[^a-z0-9]+/).filter(isToken);
  const singulars = words.map(singularOf).filter((t): t is string => t !== null && isToken(t));
  return [...new Set([...words, ...singulars])];
}

/** Menções de alerta ("evite", "sem", "contém"…): o texto apenas avisa sobre o alergênico. */
export const NEGATION_SOURCE =
  "(evit|sem |em vez de|substitu|troque|n[aã]o |nunca |cont[eé]m|cuidado|aten[cç][aã]o|risco|alerg)";
const NEGATION = new RegExp(NEGATION_SOURCE, "i");
/** Em nomes de prato, "sem amendoim" ou "livre de leite" não sugerem o alergênico. */
const NAME_NEGATION = /(?:\bsem|\bzero|\blivre de)\s+$/;

export type AllergenMode = "food" | "name" | "prose";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function occursIn(text: string, token: string, mode: AllergenMode): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(token)}`, "g");
  for (const match of text.matchAll(pattern)) {
    if (mode !== "name") return true;
    if (!NAME_NEGATION.test(text.slice(0, match.index ?? 0))) return true;
  }
  return false;
}

/**
 * Primeiro token de alergênico presente no texto, ou null.
 * - food (padrão): qualquer ocorrência conta (alimento, troca, termo de busca).
 * - name: ignora a ocorrência logo depois de "sem ", "zero " ou "livre de ".
 * - prose: texto com negação ou alerta ("Evite amendoim") não conta.
 */
export function allergenIn(
  text: string,
  tokens: readonly string[],
  mode: AllergenMode = "food",
): string | null {
  if (!tokens.length) return null;
  const normalized = normalizeText(text);
  if (mode === "prose" && NEGATION.test(normalized)) return null;
  return tokens.find((token) => occursIn(normalized, token, mode)) ?? null;
}
