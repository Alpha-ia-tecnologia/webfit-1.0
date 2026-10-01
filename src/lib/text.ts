/** Padrão compartilhado entre cliente e servidor para localizar menções a calorias. */
export const CALORIE_PATTERN =
  /\b\d[\d.,]*(?:\s*mil)?(?:\s*[-–a]\s*\d[\d.,]*(?:\s*mil)?)?\s*(?:kcal|quilocalorias|calorias|cal)\b(?:\/dia)?/gi;

/** Marcador que substitui as calorias; os renderizadores de texto rico o desenham como pílula. */
export const HIDDEN_CALORIES = "[calorias ocultas]";

/**
 * "Ocultar números do corpo" (ESPACO-13) no texto do agente: troca por texto corrido (sem marcador,
 * então qualquer renderizador o mostra sem mudança).
 */
export const HIDDEN_BODY_NUMBER = "número oculto";

const NUM = String.raw`(?<![\d.,])\d+(?:[.,]\d+)?`;
const WEIGHT_NUM = String.raw`(?<![\d.,])\d{2,3}(?:[.,]\d{1,2})?`;
const KG = String.raw`(?:kg|quilos?|quilogramas?)\b`;
/** Até 20 caracteres sem número, vírgula nem fim de frase entre a palavra e o número ("IMC está em 26"). */
const GAP = String.raw`[^.,;!?\d\n]{0,20}`;
const MEASURE_WORD = String.raw`(?:cintura|quadril|circunfer[êe]ncia|abd[ôo]men|pesco[çc]o|bra[çc]o|coxa|panturrilha|busto|t[óo]rax)`;
const CM = String.raw`\s*(?:cm|cent[íi]metros?)\b`;

/**
 * Números do corpo no texto: peso (kg, exceto "1 kg de arroz"), variação de peso, IMC, medidas com
 * cm, cintura/quadril e relação cintura-quadril, altura ("1,70 m", "170 cm") e gordura corporal.
 * Heurística de propósito estreita: quantidades de comida, treino e água ficam.
 */
const BODY_NUMBER_PATTERNS: readonly RegExp[] = [
  // "72 kg", "3 kg", "27 kg/m²"; "1 kg de frango" fica (só "de peso/massa/gordura" é do corpo).
  new RegExp(String.raw`${NUM}\s*${KG}(?!\s+de\s+(?!peso|massa|gordura|m[úu]sculo))`, "gi"),
  // Primeiro número de uma faixa de peso: "de 74 a 72 kg".
  new RegExp(String.raw`${WEIGHT_NUM}(?=\s*(?:kg\s*)?(?:a|at[ée]|para|e|-|–|/)\s*\d{2,3}(?:[.,]\d{1,2})?\s*${KG})`, "gi"),
  // "peso caiu de 74,0", "pesa 72".
  new RegExp(String.raw`(?<=\bpes(?:o|a|ava|ando)\b${GAP})${WEIGHT_NUM}(?!\d|[.,]\d|\s*(?:g|gr|gramas?|ml|mililitros?|%)(?![a-z]))`, "gi"),
  // "IMC 27,3", "índice de massa corporal de 27"; "27 de IMC".
  // \b é ASCII e não vale antes de "í": fronteira por letra Unicode.
  new RegExp(String.raw`(?<=(?<!\p{L})(?:imc|[íi]ndice de massa corporal)(?!\p{L})${GAP})${NUM}`, "giu"),
  new RegExp(String.raw`${NUM}(?=\s*(?:de\s+)?imc\b)`, "gi"),
  // Cintura, quadril e relação cintura-quadril com ou sem unidade: "cintura de 84 cm", "quadril 102".
  new RegExp(String.raw`(?<=\b(?:cintura|quadril|rcq)\b${GAP})${NUM}(?:${CM})?`, "gi"),
  // Outras medidas só com cm: "braço 32 cm", "84 cm de cintura".
  new RegExp(String.raw`(?<=\b${MEASURE_WORD}\b${GAP})${NUM}${CM}`, "gi"),
  new RegExp(String.raw`${NUM}${CM}(?=\s+de\s+${MEASURE_WORD}\b)`, "gi"),
  // Altura: "1,70 m", "1.65 metro", "170 cm".
  new RegExp(String.raw`(?<![\d.,])[12][.,]\d{2}\s*(?:m|metros?)\b`, "gi"),
  new RegExp(String.raw`(?<![\d.,])1\d{2}\s*cm\b`, "gi"),
  new RegExp(
    String.raw`(?<=\b(?:altura|estatura)\b${GAP})(?:${NUM}\s*(?:m|metros?|cm)\b|(?<![\d.,])(?:[12][.,]\d{1,2}|1\d{2})(?![\d.,]))`,
    "gi",
  ),
  // Gordura corporal: "28% de gordura corporal", "gordura corporal: 28%", "percentual de gordura 30".
  new RegExp(String.raw`${NUM}\s*%(?=\s*(?:de\s+)?gordura\s+corporal)`, "gi"),
  new RegExp(String.raw`(?<=\b(?:gordura corporal|percentual de gordura|porcentagem de gordura)\b${GAP})${NUM}\s*%?`, "gi"),
];

/** Trechos [início, fim) de números do corpo no texto original, ordenados e sem sobreposição. */
function bodyNumberRanges(text: string): [number, number][] {
  const found = BODY_NUMBER_PATTERNS.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((m): [number, number] => [m.index, m.index + m[0].length]),
  ).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  return found.reduce<[number, number][]>((merged, [start, end]) => {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) return [...merged.slice(0, -1), [last[0], Math.max(last[1], end)]];
    return [...merged, [start, end]];
  }, []);
}

/** Troca os números do corpo por "número oculto" (todas as regras sobre o texto original). */
export function maskBodyNumbers(text: string): string {
  const ranges = bodyNumberRanges(text);
  if (!ranges.length) return text;
  const pieces = ranges.map(([start], i) => text.slice(i ? ranges[i - 1]![1] : 0, start));
  return pieces.join(HIDDEN_BODY_NUMBER) + HIDDEN_BODY_NUMBER + text.slice(ranges[ranges.length - 1]![1]);
}

/** O texto cita algum número do corpo (mesma regra de maskBodyNumbers)? */
export const hasBodyNumbers = (text: string): boolean => bodyNumberRanges(text).length > 0;

/**
 * Substitui menções numéricas a calorias quando o usuário optou por ocultá-las e, com `hideBody`,
 * também os números do corpo (padrão false: chamadas antigas não mudam).
 */
export function visibleText(text: string, hide: boolean, hideBody = false) {
  const body = hideBody ? maskBodyNumbers(text) : text;
  return hide ? body.replace(CALORIE_PATTERN, HIDDEN_CALORIES) : body;
}

/** Para texto corrido (avisos, notas, erros), sem o marcador entre colchetes da pílula. */
export function visiblePlainText(text: string, hide: boolean, hideBody = false) {
  return visibleText(text, hide, hideBody).split(HIDDEN_CALORIES).join("calorias ocultas");
}
