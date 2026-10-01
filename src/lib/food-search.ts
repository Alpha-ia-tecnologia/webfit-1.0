import type { FoodItem } from "../types";

/**
 * Busca de alimentos compartilhada pelo web e pelo app. Os nomes da TACO aparecem como se
 * fala ("Arroz, integral, cozido" → "Arroz integral" + preparo "cozido"); os preparos de um
 * mesmo alimento viram um grupo; sinônimos populares ("macaxeira"), plural e gênero
 * ("cozido" encontra "cozida") e o próprio nome amigável também encontram o alimento.
 */

/** Minúsculas e sem acentos: "Feijão" → "feijao". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "com", "e", "em", "a", "o", "ao", "na", "no"]);

/** Palavras de busca: sem acento, sem pontuação e sem conectivos. */
function words(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9%]+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

/** Singular e sem gênero, dos dois lados da busca: "fritas" → "frit", "ovos" → "ovo". */
function stem(word: string): string {
  let w = word;
  if (w.length >= 4 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length >= 4 && /[ao]$/.test(w)) w = w.slice(0, -1);
  return w;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Palavra como aparece na TACO → formas populares que também a encontram. */
const SYNONYMS: Record<string, string[]> = {
  mandioca: ["aipim", "macaxeira"],
  tangerina: ["mexerica", "bergamota", "ponkan", "pokan"],
  mozarela: ["mussarela", "muçarela", "mozzarella"],
  mingnon: ["mignon"],
  abobora: ["jerimum"],
  baroa: ["mandioquinha"],
  macarrao: ["massa", "espaguete", "talharim"],
  instantaneo: ["miojo"],
  bovina: ["boi"],
  // "Bife" é corte de bife, não carne moída.
  patinho: ["bife"],
  alcatra: ["bife"],
  contra: ["bife"],
  picanha: ["bife"],
  maminha: ["bife"],
  frescal: ["branco"],
  infusao: ["coado"],
  cafe: ["cafezinho"],
  hamburguer: ["hamburger", "burger"],
  abacaxi: ["ananas"],
  iogurte: ["yogurte"],
  linguica: ["calabresa", "toscana"],
  toucinho: ["bacon"],
  biscoito: ["bolacha"],
  cola: ["coca"],
  estrogonofe: ["strogonoff", "strogonofe", "estrogonoff", "stroganoff"],
  achocolatado: ["nescau", "toddy"],
  amido: ["maisena", "maizena"],
  brasil: ["para"],
  pescados: ["peixe"],
};
const POPULAR_TO_TACO: [string, string][] = Object.entries(SYNONYMS).flatMap(
  ([taco, popular]) => popular.map((p): [string, string] => [normalize(p), taco]),
);

/** Último trecho do nome que descreve o preparo, com a prioridade de sugestão (pronto → cru). */
const PREPARATIONS: Record<string, number> = {
  cozido: 3, cozida: 3, cozidos: 3, cozidas: 3,
  grelhado: 3, grelhada: 3,
  assado: 3, assada: 3, assados: 3, assadas: 3,
  refogado: 3, refogada: 3,
  saute: 3,
  frito: 2, frita: 2, fritos: 2, fritas: 2,
  "a milanesa": 2,
  torrado: 2, torrada: 2,
  drenado: 1, drenada: 1,
  "em conserva": 1, enlatado: 1, enlatada: 1, "em calda": 1,
  congelado: 1, congelada: 1,
  "pre-cozido": 1, "pre-cozida": 1,
  cru: 0, crua: 0, crus: 0, cruas: 0,
};
const NO_PREP_RANK = 1;
/** "cozido/10minutos" (ovos da TACO) aparece e é pesquisado como "cozido". */
const cleanPrep = (text: string) => text.replace(/\/10minutos/gi, "");

/** Nomes da TACO reescritos à mão (chave: nome sem preparo, normalizado). */
const LABELS: Record<string, string> = {
  "arroz, tipo 1": "Arroz branco (tipo 1)",
  "arroz, tipo 2": "Arroz branco (tipo 2)",
  "pao, trigo, frances": "Pão francês",
  "pao, trigo, forma, integral": "Pão de forma integral",
  "pao, trigo, sovado": "Pão sovado",
  "pao, aveia, forma": "Pão de forma de aveia",
  "pao, gluten, forma": "Pão de forma de glúten",
  "pao, milho, forma": "Pão de forma de milho",
  "queijo, minas, frescal": "Queijo minas frescal",
  "queijo, minas, meia cura": "Queijo minas meia cura",
  "ovo, de galinha, inteiro": "Ovo inteiro",
  "ovo, de galinha, clara": "Clara de ovo",
  "ovo, de galinha, gema": "Gema de ovo",
  "ovo, de codorna, inteiro": "Ovo de codorna",
  "cafe, infusao 10%": "Café coado",
  "cha, mate, infusao 5%": "Chá mate",
  "cha, preto, infusao 5%": "Chá preto",
  "cha, erva-doce, infusao 5%": "Chá de erva-doce",
  "queijo, requeijao, cremoso": "Requeijão cremoso",
  "soja, queijo (tofu)": "Tofu",
  "soja, extrato soluvel, natural, fluido": "Leite de soja",
  "soja, extrato soluvel, po": "Leite de soja em pó",
  "leite, de vaca, integral, po": "Leite em pó integral",
  "leite, de vaca, desnatado, po": "Leite em pó desnatado",
  "batata, baroa": "Batata-baroa (mandioquinha)",
  "batata, frita, tipo chips, industrializada": "Batata chips (industrializada)",
  "carne, bovina, acem, moido": "Carne moída (acém)",
  "carne, bovina, file mingnon, sem gordura": "Filé-mignon sem gordura",
  "atum, conserva em oleo": "Atum em conserva no óleo",
  "sardinha, conserva em oleo": "Sardinha em conserva no óleo",
  "cerveja, pilsen 2": "Cerveja pilsen",
  "goiaba, doce em pasta": "Goiabada",
  "goiaba, doce, cascao": "Goiabada cascão",
  "banana, doce em barra": "Bananada",
  "curau, milho verde, mistura para": "Mistura para curau de milho verde",
  "macarrao, molho bolognesa": "Macarrão à bolonhesa",
  "pescada, file, molho escabeche": "Filé de pescada ao molho escabeche",
  "pacoca, amendoim": "Paçoca de amendoim",
  "pe-de-moleque, amendoim": "Pé-de-moleque de amendoim",
  "nhoque, batata": "Nhoque de batata",
  "pastel, massa": "Massa de pastel",
  "lasanha, massa fresca": "Massa fresca de lasanha",
  "torrada, pao frances": "Torrada de pão francês",
  "amendoim, grao": "Amendoim em grão",
  "margarina, com oleo hidrogenado, com sal (65% de lipideos)":
    "Margarina hidrogenada com sal (65% de gordura)",
  "margarina, com oleo hidrogenado, sem sal (80% de lipideos)":
    "Margarina hidrogenada sem sal (80% de gordura)",
  "margarina, com oleo interesterificado, com sal (65%de lipideos)":
    "Margarina interesterificada com sal (65% de gordura)",
  "margarina, com oleo interesterificado, sem sal (65% de lipideos)":
    "Margarina interesterificada sem sal (65% de gordura)",
};
const CHICKEN_CUTS = new Set(["peito", "coxa", "sobrecoxa", "asa", "file", "coracao"]);
const PORK_CUTS = new Set(["bisteca", "costela", "lombo", "pernil", "orelha", "rabo"]);
/** Cortes bovinos que sozinhos seriam ambíguos (frango, porco): levam o adjetivo. */
const BEEF_AMBIGUOUS: Record<string, string> = {
  costela: "bovina",
  peito: "bovino",
  figado: "bovino",
  lingua: "bovina",
  bucho: "bovino",
};
/** Trechos que viram complemento com "de": "Açaí, polpa" → "Polpa de açaí". */
const QUALIFIERS = new Set([
  "polpa", "suco", "extrato", "pure", "molho", "farinha", "broto", "amido", "fuba", "farofa",
]);
/** Trechos que pedem "em": "Café, pó" → "Café em pó". */
const IN_FORM: Record<string, string> = { po: "em pó", flocos: "em flocos" };

/** Alimentos do dia a dia sugeridos primeiro quando a busca é genérica ("arroz", "ovo"). */
const POPULAR = new Set([
  "arroz, tipo 1", "feijao, carioca", "feijao, preto", "ovo, de galinha, inteiro",
  "frango, peito, sem pele", "pao, trigo, frances", "pao, trigo, forma, integral",
  "banana, prata", "cafe, infusao 10%", "batata, inglesa", "carne, bovina, acem, moido",
  "alface, crespa", "tomate, com semente", "queijo, minas, frescal", "queijo, mozarela",
  "iogurte, natural", "aveia, flocos", "mamao, papaia", "cenoura", "brocolis", "mandioca",
  "maca, fuji, com casca", "laranja, pera", "laranja, pera, suco", "macarrao, trigo",
  "cuscuz, de milho, cozido com sal", "goiaba, vermelha, com casca", "linguica, porco",
  "soja, extrato soluvel, natural, fluido",
]);
const POPULAR_BONUS = 6;
const BOOST_PER_USE = 4;
const MAX_BOOSTED_USES = 5;
const DEFAULT_LIMIT = 30;
/** Pontos por palavra: igual, mesmo radical, começo de palavra, só na categoria. */
const EXACT_WORD = 4;
const SAME_STEM = 3;
const WORD_PREFIX = 2;
const CATEGORY_MATCH = 1;
const WORD_POINTS = 10;
const HEAD_BONUS = 40;
const START_BONUS = 30;
/** O sinônimo digitado inteiro ("coca") vale como o nome principal ("cola"). */
const SYNONYM_BONUS = 70;
/** Busca parcial: cada palavra digitada que o alimento não tem custa isto. */
const MISSING_WORD_PENALTY = 25;

function splitName(name: string) {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts.length > 1 ? cleanPrep(parts[parts.length - 1]) : "";
  const rank = PREPARATIONS[normalize(last)];
  return rank === undefined
    ? { parts, prep: null, rank: NO_PREP_RANK }
    : { parts: parts.slice(0, -1), prep: last, rank };
}

/** "Patinho" + ["sem gordura", "moído"] → "Patinho sem gordura, moído". */
function joinRest(first: string, rest: string[]): string {
  const [next, ...others] = rest.map((part) => IN_FORM[normalize(part)] ?? part);
  if (next === undefined) return first;
  return `${first} ${next}${others.map((p) => `, ${p}`).join("")}`;
}

function labelFor(parts: string[]): string {
  const override = LABELS[normalize(parts.join(", "))];
  if (override) return override;
  const [head, ...rest] = parts;
  const headKey = normalize(head);
  const firstKey = rest.length ? normalize(rest[0]) : "";
  if (headKey === "frango" && CHICKEN_CUTS.has(firstKey))
    return joinRest(`${cap(rest[0])} de frango`, rest.slice(1));
  if (headKey === "porco" && PORK_CUTS.has(firstKey))
    return joinRest(`${cap(rest[0])} de porco`, rest.slice(1));
  if (headKey === "linguica" && (firstKey === "frango" || firstKey === "porco"))
    return joinRest(`Linguiça de ${firstKey}`, rest.slice(1));
  if (headKey === "carne" && firstKey === "bovina" && rest.length > 1) {
    const cut = rest[1];
    const cutKey = normalize(cut);
    const name =
      cutKey === "seca"
        ? "Carne seca"
        : BEEF_AMBIGUOUS[cutKey]
          ? `${cap(cut)} ${BEEF_AMBIGUOUS[cutKey]}`
          : cap(cut);
    return joinRest(name, rest.slice(2));
  }
  // Nomes invertidos: "Coco, água de" → "Água de coco"; "Bolo, mistura para" → "Mistura para bolo".
  const dangling = rest.findIndex((p) => / (de|para)$/.test(p));
  if (dangling >= 0)
    return joinRest(
      `${cap(rest[dangling])} ${lowerFirst(head)}`,
      rest.filter((_, i) => i !== dangling),
    );
  // Qualificadores: "Açaí, polpa" → "Polpa de açaí"; "Tomate, molho industrializado" → "Molho de tomate industrializado".
  const qualifier = rest.findIndex((p) => QUALIFIERS.has(normalize(p.split(" ")[0])));
  if (qualifier >= 0) {
    const [word, ...detail] = rest[qualifier].split(" ");
    const others = rest.filter((_, i) => i !== qualifier);
    const base = `${cap(word)} de ${lowerFirst(head)}${detail.length ? ` ${detail.join(" ")}` : ""}`;
    return joinRest(base, others);
  }
  return joinRest(head, rest);
}

/** "Arroz, integral, cozido" → { label: "Arroz integral", prep: "cozido" }. */
export function friendlyName(name: string): { label: string; prep: string | null } {
  const { parts, prep } = splitName(name);
  return { label: labelFor(parts), prep };
}

/** Alimento da tabela TACO (os cadastrados pela pessoa têm outro id). */
export const isTacoFood = (food: Pick<FoodItem, "id">): boolean => food.id.startsWith("taco-");

interface Entry {
  key: string;
  label: string;
  rank: number;
  popular: boolean;
  /** Primeira palavra do nome da TACO e do nome amigável. */
  heads: string[];
  /** Radicais do nome da TACO (o tamanho do nome desempata). */
  stems: string[];
  /** Radicais do nome da TACO e do nome amigável, para casar palavras. */
  allStems: string[];
  /** Palavras inteiras (sem acento) do nome da TACO e do nome amigável. */
  words: Set<string>;
  extra: string[];
  /** Nomes em sequência para "começa com": o amigável substitui o da TACO quando reescrito à mão. */
  flats: string[];
}
const entries = new WeakMap<FoodItem, Entry>();

function entryOf(food: FoodItem): Entry {
  const cached = entries.get(food);
  if (cached) return cached;
  const { parts, prep, rank } = splitName(food.name);
  const base = normalize(parts.join(", "));
  const label = labelFor(parts);
  const nameWords = words(cleanPrep(food.name));
  const labelWords = words(`${label} ${prep ?? ""}`);
  const labelFlat = labelWords.join(" ");
  const entry: Entry = {
    // Alimentos cadastrados pela pessoa nunca se misturam aos da TACO no mesmo grupo.
    key: `${isTacoFood(food) ? "t" : "u"}:${base}`,
    label,
    rank,
    popular: POPULAR.has(base),
    heads: [stem(nameWords[0] ?? ""), stem(labelWords[0] ?? "")],
    stems: nameWords.map(stem),
    allStems: [...new Set([...nameWords, ...labelWords].map(stem))],
    words: new Set([...nameWords, ...labelWords]),
    extra: words(food.category).map(stem),
    flats: LABELS[base] ? [labelFlat] : [nameWords.join(" "), labelFlat],
  };
  entries.set(food, entry);
  return entry;
}

interface Form {
  norm: string;
  stem: string;
  /** Veio de um sinônimo digitado por inteiro ("coca" → "cola"). */
  exactSynonym: boolean;
}
/** Cada palavra digitada vira as formas aceitas: ela mesma e os nomes da TACO dos sinônimos. */
function queryForms(query: string): Form[][] {
  return words(query).map((word) => {
    const own: Form = { norm: word, stem: stem(word), exactSynonym: false };
    if (word.length < 3) return [own];
    const synonyms = new Map<string, boolean>();
    for (const [popular, taco] of POPULAR_TO_TACO)
      if (popular.startsWith(word)) synonyms.set(taco, synonyms.get(taco) || popular === word);
    return [
      own,
      ...[...synonyms].map(([norm, exact]) => ({ norm, stem: stem(norm), exactSynonym: exact })),
    ];
  });
}

function wordScore(entry: Entry, form: Form): number {
  if (entry.words.has(form.norm)) return EXACT_WORD;
  let best = 0;
  for (const w of entry.allStems)
    best = Math.max(best, w === form.stem ? SAME_STEM : w.startsWith(form.stem) ? WORD_PREFIX : 0);
  return best;
}

function scoreEntry(
  entry: Entry,
  forms: Form[][],
  flatQuery: string,
  allowMissing: boolean,
): number | null {
  let score = 0;
  let matched = 0;
  for (const alternatives of forms) {
    let best = 0;
    for (const form of alternatives) best = Math.max(best, wordScore(entry, form));
    if (!best && alternatives.some(({ stem: s }) => entry.extra.some((w) => w.startsWith(s))))
      best = CATEGORY_MATCH;
    if (!best) {
      if (!allowMissing) return null;
      score -= MISSING_WORD_PENALTY;
      continue;
    }
    matched += 1;
    score += best * WORD_POINTS;
  }
  if (!matched) return null;
  const first = forms[0];
  if (first.some(({ stem: s }) => entry.heads.some((h) => h.startsWith(s)))) score += HEAD_BONUS;
  if (first.some((f) => f.exactSynonym && entry.words.has(f.norm))) score += SYNONYM_BONUS;
  if (entry.flats.some((flat) => flat.startsWith(flatQuery))) score += START_BONUS;
  return score - entry.stems.length + (entry.popular ? POPULAR_BONUS : 0);
}

export interface FoodGroup {
  key: string;
  label: string;
  /** Preparos do mesmo alimento, do pronto ao cru. */
  variants: FoodItem[];
  /** Variação que melhor atende à busca: o preparo digitado ou, na falta, o pronto. */
  selected: FoodItem;
}

function rankGroups(
  foods: readonly FoodItem[],
  forms: Form[][],
  allowMissing: boolean,
  boost?: ReadonlyMap<string, number>,
): FoodGroup[] {
  const flatQuery = forms.map((f) => f[0].norm).join(" ");
  const found = new Map<
    string,
    { label: string; items: { food: FoodItem; rank: number; score: number | null }[] }
  >();
  for (const food of foods) {
    const entry = entryOf(food);
    const base = scoreEntry(entry, forms, flatQuery, allowMissing);
    const uses = Math.min(boost?.get(food.id) ?? 0, MAX_BOOSTED_USES);
    const score = base === null ? null : base + uses * BOOST_PER_USE;
    const group = found.get(entry.key) ?? { label: entry.label, items: [] };
    found.set(entry.key, { ...group, items: [...group.items, { food, rank: entry.rank, score }] });
  }
  const ranked = [...found.entries()].flatMap(([key, { label, items }]) => {
    const matched = items.filter((i) => i.score !== null);
    if (!matched.length) return [];
    const best = matched.reduce((a, b) =>
      b.score! > a.score! || (b.score === a.score && b.rank > a.rank) ? b : a,
    );
    const variants = items
      .map((item, index) => ({ ...item, index }))
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((i) => i.food);
    return [{ group: { key, label, variants, selected: best.food }, score: best.score! }];
  });
  // Array.prototype.sort é estável: empates mantêm a ordem da tabela.
  return ranked.sort((a, b) => b.score - a.score).map((r) => r.group);
}

/**
 * Grupos de alimentos que contêm todas as palavras digitadas (início de palavra, sem acento,
 * no nome da TACO ou no nome amigável), dos mais parecidos aos menos. Se nenhum tem todas
 * ("café com leite"), vêm os que têm parte delas, com `partial`. `boost` reforça alimentos já
 * usados (id → vezes).
 */
export function searchFoods(
  foods: readonly FoodItem[],
  query: string,
  options: { limit?: number; boost?: ReadonlyMap<string, number> } = {},
): { groups: FoodGroup[]; total: number; partial: boolean } {
  const forms = queryForms(query);
  if (!forms.length) return { groups: [], total: 0, partial: false };
  let sorted = rankGroups(foods, forms, false, options.boost);
  const partial = !sorted.length && forms.length > 1;
  if (partial) sorted = rankGroups(foods, forms, true, options.boost);
  return {
    groups: sorted.slice(0, options.limit ?? DEFAULT_LIMIT),
    total: sorted.length,
    partial,
  };
}

/** Quantos caracteres normalizados do início da palavra correspondem à busca. */
function matchedLength(word: string, forms: Form[][]): number {
  const n = normalize(word);
  const s = stem(n);
  let best = 0;
  for (const alternatives of forms)
    for (const form of alternatives) {
      if (n.startsWith(form.norm)) best = Math.max(best, form.norm.length);
      else if (s === form.stem) best = n.length;
      else if (s.startsWith(form.stem)) best = Math.max(best, form.stem.length);
    }
  return Math.min(best, n.length);
}

/** Converte um comprimento na forma normalizada para o comprimento no texto original. */
function originalLength(word: string, normalizedLength: number): number {
  let count = 0;
  let used = 0;
  for (const char of word) {
    if (count >= normalizedLength) break;
    count += normalize(char).length;
    used += char.length;
  }
  return used;
}

/** Trechos do texto marcando o início das palavras que correspondem à busca, para negrito. */
export function highlightMatches(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const forms = queryForms(query);
  if (!forms.length) return [{ text, match: false }];
  const pieces: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const found of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = found.index ?? 0;
    const word = found[0];
    const length = originalLength(word, matchedLength(word, forms));
    pieces.push(
      { text: text.slice(cursor, start), match: false },
      { text: word.slice(0, length), match: true },
      { text: word.slice(length), match: false },
    );
    cursor = start + word.length;
  }
  pieces.push({ text: text.slice(cursor), match: false });
  return pieces
    .filter((p) => p.text)
    .reduce<{ text: string; match: boolean }[]>((merged, piece) => {
      const last = merged[merged.length - 1];
      return last && last.match === piece.match
        ? [...merged.slice(0, -1), { text: last.text + piece.text, match: piece.match }]
        : [...merged, piece];
    }, []);
}

/** Regras testadas primeiro no nome principal e depois no nome todo; a primeira que casa vale. */
const EMOJI_RULES: [RegExp, string][] = [
  [/^(maria mole|cocada|bananada|goiabada)/, "🍬"],
  [/^bebida lactea/, "🥛"],
  [/^omelete/, "🥚"],
  [/^tapioca/, "🫓"],
  [/\barroz\b/, "🍚"],
  // "fruta-pão" não é pão.
  [/(^|[ ,])pao\b|torrada/, "🍞"],
  [/macarrao|lasanha|nhoque/, "🍝"],
  [/biscoito/, "🍪"],
  [/\bbolo\b/, "🍰"],
  [/pizza/, "🍕"],
  [/\bovo\b/, "🥚"],
  [/frango|\bperu\b/, "🍗"],
  [/porco|bacon|toucinho|linguica|salsicha|presunto|mortadela/, "🥓"],
  [/carne|bovin|hamburguer|almondega/, "🥩"],
  [/camarao|lagosta|siri|caranguejo/, "🦐"],
  [/atum|sardinha|salmao|tilapia|pescad|bacalhau|merluza|peixe|corvina|dourada|cacao|manjuba/, "🐟"],
  [/queijo|requeijao|ricota/, "🧀"],
  [/iogurte|leite|coalhada/, "🥛"],
  [/cafe|capuccino/, "☕"],
  [/\bcha\b/, "🍵"],
  [/cerveja/, "🍺"],
  [/vinho/, "🍷"],
  [/refrigerante|suco|refresco/, "🥤"],
  [/banana/, "🍌"],
  [/laranja|tangerina|mexerica/, "🍊"],
  [/limao/, "🍋"],
  [/\bmaca\b/, "🍎"],
  [/\bpera\b/, "🍐"],
  [/\buva\b/, "🍇"],
  [/morango/, "🍓"],
  [/abacaxi/, "🍍"],
  [/melancia/, "🍉"],
  [/\bmelao\b/, "🍈"],
  [/\bmanga\b/, "🥭"],
  [/pessego/, "🍑"],
  [/kiwi/, "🥝"],
  [/\bcoco\b/, "🥥"],
  [/abacate/, "🥑"],
  [/tomate/, "🍅"],
  [/cenoura/, "🥕"],
  [/batata/, "🥔"],
  [/milho|pipoca|fuba|canjica/, "🌽"],
  [/brocolis|couve-flor/, "🥦"],
  [/alface|couve|rucula|agriao|espinafre|acelga|repolho/, "🥬"],
  [/pepino|abobrinha|chuchu|jilo|quiabo|maxixe/, "🥒"],
  [/pimentao|pimenta/, "🫑"],
  [/cebola/, "🧅"],
  [/\balho\b/, "🧄"],
  [/berinjela/, "🍆"],
  [/cogumelo/, "🍄"],
  [/mandioca|aipim|inhame/, "🍠"],
  [/feijao|lentilha|grao-de-bico|ervilha|soja/, "🫘"],
  // Só no começo: "caqui chocolate" é fruta.
  [/^(chocolate|achocolatado)/, "🍫"],
  [/\bmel\b|melado/, "🍯"],
  // "Corvina de água doce" é peixe: "doce" conta só no começo ou como "doce em/de".
  [/^(acucar|doce|geleia)|doce (em|de)\b/, "🍬"],
  [/amendoim|castanha|nozes|amendoa/, "🥜"],
  [/azeite|oleo|azeitona/, "🫒"],
  [/manteiga|margarina/, "🧈"],
  // Só no começo: peixe "com farinha de trigo" continua peixe.
  [/^(aveia|granola|farinha|cereal|polvilho|fecula|amido)/, "🌾"],
];
const CATEGORY_EMOJI: Record<string, string> = {
  "Cereais e derivados": "🌾",
  "Verduras, hortaliças e derivados": "🥬",
  "Frutas e derivados": "🍎",
  "Gorduras e óleos": "🧈",
  "Pescados e frutos do mar": "🐟",
  "Carnes e derivados": "🥩",
  "Leite e derivados": "🥛",
  "Bebidas (alcoólicas e não alcoólicas)": "🥤",
  "Ovos e derivados": "🥚",
  "Produtos açucarados": "🍬",
  "Miscelâneas": "🧂",
  "Outros alimentos industrializados": "🥫",
  "Alimentos preparados": "🍲",
  "Leguminosas e derivados": "🫘",
  "Nozes e sementes": "🥜",
};
const FALLBACK_EMOJI = "🏷️";

/** Emoji do alimento: primeiro pelo nome principal, depois pelo nome todo e pela categoria. */
export function foodEmoji(food: Pick<FoodItem, "name" | "category">): string {
  const name = normalize(food.name);
  for (const target of [name.split(",")[0], name])
    for (const [pattern, emoji] of EMOJI_RULES) if (pattern.test(target)) return emoji;
  return CATEGORY_EMOJI[food.category] ?? FALLBACK_EMOJI;
}
