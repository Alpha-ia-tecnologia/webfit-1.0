import { z } from "zod";
import { clip } from "./agent-blocks";
import { normalizeText } from "./allergens";
import { fmtNumber, plural } from "./format";
import type { MeasureId } from "./household-measures";

/**
 * Descrição de refeição em texto (DIARIO-07, modo estruturado "meal_text"). Módulo folha: em tempo
 * de execução importa só zod, ./agent-blocks, ./allergens e ./format (household-measures só como tipo), então
 * src/lib/structured.ts e o servidor (server/graph/structured-specs.ts, server/agent.ts) o usam sem
 * ciclo com types.ts. O modelo lista o que a pessoa disse; a quantidade só vale quando foi dita, e
 * as gramas saem das medidas caseiras da TACO no app. Nunca há kcal aqui.
 */

export const MEAL_TEXT_MAX_CHARS = 600;
export const MEAL_TEXT_ITEMS_MAX = 12;
export const MEAL_TEXT_DOUBTS_MAX = 3;
/** Teto de colheres, conchas, unidades… ditas para um item. */
export const MEAL_TEXT_MEASURE_MAX = 40;
/** Teto em g ou ml (= MAX_ITEM_GRAMS de meals.ts; um teste garante). */
export const MEAL_TEXT_MASS_MAX = 5000;
/** g, ml e todas as medidas caseiras: fonte única para zod e para o JSON Schema do servidor. */
export const MEAL_TEXT_UNITS = [
  "g",
  "ml",
  "colher-sopa",
  "colher-cha",
  "escumadeira",
  "concha",
  "copo",
  "xicara",
  "unidade",
  "fatia",
  "pote",
  "file",
  "bife",
  "folha",
] as const satisfies readonly (MeasureId | "g" | "ml")[];
export type MealTextUnit = (typeof MEAL_TEXT_UNITS)[number];

/** Leitura tolerante: quantidade, unidade ou trecho inválidos viram null (o item continua). */
export const mealTextItemSchema = z.object({
  name: clip(80),
  searchTerms: z.array(clip(60)).min(1).max(3),
  /** Trecho exato da descrição que diz a quantidade; null quando a pessoa não disse. */
  quantityText: clip(60).nullable().catch(null),
  quantity: z
    .number()
    .positive()
    .max(MEAL_TEXT_MASS_MAX)
    .nullable()
    .catch(null),
  unit: z.enum(MEAL_TEXT_UNITS).nullable().catch(null),
  allergyMatch: z.boolean(),
});
export const mealTextSchema = z.object({
  items: z.array(mealTextItemSchema).max(MEAL_TEXT_ITEMS_MAX),
  uncertainties: z.array(clip(200)).max(MEAL_TEXT_DOUBTS_MAX),
});
export type MealTextItem = z.infer<typeof mealTextItemSchema>;
export type MealText = z.infer<typeof mealTextSchema>;

/** Chave de comparação: sem acentos, minúsculas e espaços colapsados. */
const normKey = (s: string): string =>
  normalizeText(s).replace(/\s+/g, " ").trim();

const NO_AMOUNT = { quantity: null, unit: null } as const;

/** Quantidade só quando foi dita e cabe no teto da unidade; sem unidade vale o teto de massa. */
function statedAmount(
  quantityText: string | null,
  quantity: number | null,
  unit: MealTextUnit | null,
): Pick<MealTextItem, "quantity" | "unit"> {
  if (quantityText === null || quantity === null || !(quantity > 0))
    return NO_AMOUNT;
  const max =
    unit === null || unit === "g" || unit === "ml"
      ? MEAL_TEXT_MASS_MAX
      : MEAL_TEXT_MEASURE_MAX;
  return quantity <= max ? { quantity, unit } : NO_AMOUNT;
}

function uniqueTrimmed(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim())
    .filter((v) => {
      const key = normKey(v);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Limpeza no servidor e no app (pura, nunca muta): apara, tira itens sem nome, completa os termos
 * de busca com o nome, zera quantidade não dita ou fora do teto (o trecho dito fica para a tela),
 * junta repetidos (mesmo nome e mesmo trecho) e limpa as dúvidas. null = nada aproveitável.
 */
export function sanitizeMealText(v: MealText): MealText | null {
  const seen = new Set<string>();
  const items: MealTextItem[] = [];
  for (const raw of v.items) {
    const name = raw.name.trim();
    if (!name) continue;
    const quantityText = raw.quantityText?.trim() || null;
    const key = `${normKey(name)}|${normKey(quantityText ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const terms = raw.searchTerms.map((t) => t.trim()).filter(Boolean);
    items.push({
      name,
      searchTerms: terms.length ? terms : [name],
      quantityText,
      ...statedAmount(quantityText, raw.quantity, raw.unit),
      allergyMatch: raw.allergyMatch,
    });
  }
  const uncertainties = uniqueTrimmed(v.uncertainties);
  return items.length || uncertainties.length ? { items, uncertainties } : null;
}

const NO_ITEMS = "Nenhum alimento reconhecido na descrição.";

const itemLine = (item: MealTextItem): string =>
  `- ${item.name} · ${item.quantityText ? `quantidade dita: ${item.quantityText}` : "quantidade não dita"} · procurar: ${item.searchTerms.join("; ")}${item.allergyMatch ? " · possível alérgeno declarado" : ""}`;

/**
 * Texto determinístico do rascunho (guarda, revisor e histórico). Não acrescenta números: só
 * repete o trecho que a pessoa disse.
 */
export function renderMealText(v: MealText): string {
  const items = v.items.length
    ? ["**Itens descritos**", ...v.items.map(itemLine)].join("\n")
    : NO_ITEMS;
  return v.uncertainties.length
    ? `${items}\n\n**Dúvidas**\n${v.uncertainties.map((u) => `- ${u}`).join("\n")}`
    : items;
}

const WORD_CHAR = /[a-z0-9]/;
/** Um lado do trecho está numa fronteira de palavra ("4 colheres" não vale dentro de "14 colheres"). */
const edgeOk = (
  outside: string | undefined,
  inside: string | undefined,
): boolean =>
  !(outside && inside && WORD_CHAR.test(outside) && WORD_CHAR.test(inside));

/**
 * Garantia do app de que a quantidade foi mesmo dita: o trecho aparece na descrição, comparado sem
 * acentos, sem caixa e com espaços colapsados, em fronteira de palavra. Paráfrase do modelo → false
 * (o item entra com a medida padrão e "Falta porção", a direção segura).
 */
export function quantityStated(
  item: Pick<MealTextItem, "quantityText">,
  source: string,
): boolean {
  const said = normKey(item.quantityText ?? "");
  if (!said) return false;
  const text = normKey(source);
  for (
    let at = text.indexOf(said);
    at !== -1;
    at = text.indexOf(said, at + 1)
  ) {
    const end = at + said.length;
    if (
      edgeOk(text[at - 1], said[0]) &&
      edgeOk(text[end], said[said.length - 1])
    )
      return true;
  }
  return false;
}

const AMOUNT_TOLERANCE = 1e-9;
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  uma: 1,
  um: 1,
  duas: 2,
  dois: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  meia: 0.5,
  meio: 0.5,
};
const FRACTIONS: Readonly<Record<string, number>> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
/** "2", "1,5", "1.5", "1½", "1 1/2", "1/2", "½", "duas", "meia"; nunca pedaço de outro número ou palavra. */
const AMOUNT = String.raw`(?<![a-z0-9.,/])(\d+\s*[½¼¾]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾]|(?:${Object.keys(NUMBER_WORDS).join("|")})(?![a-z]))`;
/** "uma xícara e meia" = 1,5. */
const AND_HALF = String.raw`(\s+e\s+(?:meia|meio)(?![a-z]))?`;

/** Palavras de cada unidade (texto sem acento) e o fator para a unidade do item (1 kg = 1000 g). */
const UNIT_WORDS: Readonly<Record<MealTextUnit, readonly { re: string; factor: number }[]>> = {
  g: [
    { re: "g|gr|grs|gramas?", factor: 1 },
    { re: "kg|quilos?|kilos?", factor: 1000 },
  ],
  ml: [
    { re: "ml|mililitros?", factor: 1 },
    { re: "l|litros?", factor: 1000 },
  ],
  // "colher" sozinha é de sopa; de chá só quando dita.
  "colher-sopa": [{ re: String.raw`colher(?:es)?(?:\s+(?:de\s+)?sopa)?(?!\s+(?:de\s+)?(?:cha|cafe))`, factor: 1 }],
  "colher-cha": [{ re: String.raw`colher(?:es|inhas?)?\s+(?:de\s+)?cha`, factor: 1 }],
  escumadeira: [{ re: "escumadeiras?", factor: 1 }],
  concha: [{ re: "conchas?", factor: 1 }],
  copo: [{ re: "copos?", factor: 1 }],
  xicara: [{ re: "xicaras?", factor: 1 }],
  unidade: [{ re: "unidades?|un|und", factor: 1 }],
  fatia: [{ re: "fatias?", factor: 1 }],
  pote: [{ re: "potes?|potinhos?", factor: 1 }],
  file: [{ re: "files?", factor: 1 }],
  bife: [{ re: "bifes?", factor: 1 }],
  folha: [{ re: "folhas?", factor: 1 }],
};
const OTHER_UNIT_WORD = new RegExp(
  String.raw`(?<![a-z])(?:${MEAL_TEXT_UNITS.filter((u) => u !== "unidade")
    .flatMap((u) => UNIT_WORDS[u].map((w) => w.re))
    .join("|")})(?![a-z])`,
);

/** Valor de um número dito ("1,5", "1½", "1 1/2", "½", "duas"); "1.500" é milhar em pt-BR. */
function amountValue(raw: string): number | null {
  const text = raw.replace(/\s+/g, " ").trim();
  const word = NUMBER_WORDS[text] ?? FRACTIONS[text];
  if (word !== undefined) return word;
  const mixed = /^(\d+) ?([½¼¾])$/.exec(text);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]!]!;
  const fraction = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const denominator = Number(fraction[3]);
    return denominator ? Number(fraction[1] ?? 0) + Number(fraction[2]) / denominator : null;
  }
  const plain = /^\d+\.\d{3}$/.test(text) ? text.replace(".", "") : text.replace(",", ".");
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

/** Números ditos junto de uma palavra (o número de "2 conchas" é 2; "e meia" soma ½). */
function amountsBefore(text: string, unitRe: string): number[] {
  const pair = new RegExp(String.raw`${AMOUNT}\s*(?:${unitRe})(?![a-z])${AND_HALF}`, "g");
  return [...text.matchAll(pair)].flatMap((m) => {
    const value = amountValue(m[1]!);
    return value === null ? [] : [value + (m[2] ? 0.5 : 0)];
  });
}

/**
 * A quantidade e a unidade do modelo saem do trecho dito: o número junto da palavra da unidade é a
 * quantidade ("2 conchas" → 2 conchas; "meio quilo" → 500 g; "uma xícara e meia" → 1,5). g e ml
 * exigem a palavra; "unidade" vale para "uma paçoca" quando o trecho não cita outra medida.
 * Número ou unidade diferentes → false (o item entra com "Falta porção", a direção segura).
 */
export function quantityMatchesText(
  item: Pick<MealTextItem, "quantityText" | "quantity" | "unit">,
): boolean {
  const { quantity, unit } = item;
  const text = normKey(item.quantityText ?? "");
  if (!text || quantity === null || unit === null) return false;
  const matches = (value: number) => Math.abs(value - quantity) <= AMOUNT_TOLERANCE * Math.max(1, quantity);
  const said = UNIT_WORDS[unit].some((w) =>
    amountsBefore(text, w.re).some((value) => matches(value * w.factor)),
  );
  if (said || unit !== "unidade" || OTHER_UNIT_WORD.test(text)) return said;
  return amountsBefore(text, "[a-z]+").some(matches);
}

/** Ditado no aparelho (RN): só com o idioma pt-BR instalado ("pt-BR" ou "pt_BR"). */
export const isPtBrLocale = (tag: string): boolean =>
  /^pt[-_]br$/i.test(tag.trim());

const ORGANIZE = "Organizar itens";
const MISSING = "Falta porção";

/** "Arroz", "Arroz e Feijão", "Arroz, Feijão e Frango". */
const joinNames = (names: readonly string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

/**
 * Textos de "Descrever refeição" iguais no web e no app (folha, rascunho, bandeja e atalho). O que
 * é só do ditado no aparelho fica no app (mobile/src/components/refeicao/dictation-button.tsx).
 */
export const MEAL_TEXT_COPY = {
  title: "Descrever refeição",
  field: "O que você comeu?",
  organize: ORGANIZE,
  busy: "Organizando os itens",
  draft: "Itens da descrição",
  missing: MISSING,
  keep: "Manter porção",
  confirmTitle: "Salvar com a porção padrão?",
  confirmOk: "Salvar assim",
  confirmCancel: "Conferir porções",
  /** Atalho acima da busca. */
  tile: "Descrever",
  tileSub: (aiAvailable: boolean): string =>
    aiAvailable ? "o agente organiza os itens" : "requer o agente",
  placeholder: "Ex.: 4 colheres de arroz, uma concha de feijão e frango grelhado",
  hint: "Diga a quantidade quando souber. O que não tiver porção entra com a medida caseira padrão para você conferir.",
  keyboardHint: "Para ditar, use o microfone do teclado do aparelho.",
  privacy: `O texto vai para o agente só quando você toca em ${ORGANIZE}.`,
  blocked:
    "Organizar a descrição requer conexão com o agente e sua autorização em Meu espaço.",
  /** Resposta só em texto (sem itens para conferir). */
  textOnly: "Confira os alimentos e busque cada um abaixo antes de salvar.",
  back: "Voltar ao texto",
  draftHint:
    "Confira cada item e o alimento da TACO. O que não tiver porção dita entra com a medida caseira padrão para você conferir no prato.",
  noItems: `${NO_ITEMS} Volte ao texto ou busque os itens na tela.`,
  noMatch: "Sem correspondência na TACO.",
  doubts: "Dúvidas",
  include: (name: string): string => `Incluir ${name} no prato`,
  tacoFor: (name: string): string => `Alimento da TACO para ${name}`,
  search: (name: string): string => `Buscar ${name}`,
  /** "Porção dita: 4 colheres de sopa ≈ 100 g". */
  stated: (portion: string): string => `Porção dita: ${portion}`,
  /** O trecho dito não vale para o alimento escolhido: a porção fica para conferir no prato. */
  saidCheck: (said: string): string => `Você disse “${said}”: confira a porção no prato`,
  missingDefault: `${MISSING}: entra com a medida caseira padrão`,
  addCount: (count: number): string => `Adicionar ${count} ao prato`,
  /** Complemento do nome falado do item na bandeja. */
  pendingSpoken: " (sem porção dita)",
  /** "Falta porção em 2 itens" (resumo da bandeja). */
  trayMissing: (count: number): string => `${MISSING} em ${plural(count, "item", "itens")}`,
  /** "3 itens adicionados ao prato. Falta porção em 1: confira." / "1 item adicionado ao prato. Confira a porção." */
  added: (count: number, missing: number): string => {
    const added = `${plural(count, "item adicionado", "itens adicionados")} ao prato.`;
    if (!missing) return added;
    return count === 1 ? `${added} Confira a porção.` : `${added} ${MISSING} em ${fmtNumber(missing)}: confira.`;
  },
  /** Pergunta antes de salvar com itens sem porção dita. */
  confirmMessage: (names: readonly string[]): string =>
    `${MISSING} em ${joinNames(names)}. Eles entram com a medida caseira padrão; você pode ajustar antes.`,
} as const;
