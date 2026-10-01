/**
 * "Editar Hoje" (HOJE-01): ordem e visibilidade das seções abaixo dos anéis do dia.
 * Guardado em profile.homeLayout como "water,-mood,meals": vírgulas separam, "-" oculta.
 * A semana, os anéis e o próximo passo ficam sempre no topo e não entram aqui.
 * Padrão (conceito do Hoje): refeições, combinados, medicação, dieta e despensa; bem-estar e água
 * começam ocultos (a água do topo registra em um toque; o bem-estar fica no "+" e na caneta).
 */

export const HOME_SECTIONS = [
  { key: "meals", label: "Refeições de hoje" },
  { key: "habits", label: "Combinados" },
  { key: "injection", label: "Medicação injetável" },
  { key: "diet", label: "Plano alimentar" },
  { key: "pantry", label: "Despensa" },
  { key: "mood", label: "Bem-estar" },
  { key: "water", label: "Água" },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];
export interface HomeSection {
  key: HomeSectionKey;
  label: string;
  isHidden: boolean;
}

/** Seções que começam ocultas quando a pessoa ainda não mexeu nelas; "Editar Hoje" as reativa. */
export const DEFAULT_HIDDEN: ReadonlySet<HomeSectionKey> = new Set<HomeSectionKey>(["mood", "water"]);

const KEYS = new Set<string>(HOME_SECTIONS.map((s) => s.key));
const labelOf = (key: HomeSectionKey) => HOME_SECTIONS.find((s) => s.key === key)!.label;

/**
 * Lê o texto salvo: ignora chaves desconhecidas ou repetidas e acrescenta as que faltam no fim,
 * com a visibilidade padrão (bem-estar e água ocultos).
 */
export function parseHomeLayout(value: string | undefined): HomeSection[] {
  const seen = new Set<string>();
  const sections: HomeSection[] = [];
  for (const raw of (value ?? "").split(",")) {
    const token = raw.trim();
    const key = token.replace(/^-/, "");
    if (!KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    sections.push({ key: key as HomeSectionKey, label: labelOf(key as HomeSectionKey), isHidden: token.startsWith("-") });
  }
  for (const { key, label } of HOME_SECTIONS)
    if (!seen.has(key)) sections.push({ key, label, isHidden: DEFAULT_HIDDEN.has(key) });
  return sections;
}

/** Texto para salvar; a ordem e a visibilidade padrão viram "" (sem preferência). */
export function serializeHomeLayout(sections: HomeSection[]): string {
  const isDefault =
    sections.length === HOME_SECTIONS.length &&
    sections.every((s, i) => s.key === HOME_SECTIONS[i]?.key && s.isHidden === DEFAULT_HIDDEN.has(s.key));
  return isDefault ? "" : sections.map((s) => `${s.isHidden ? "-" : ""}${s.key}`).join(",");
}

/** Move uma seção uma posição para cima (-1) ou para baixo (+1); nas pontas, nada muda. */
export function moveHomeSection(sections: HomeSection[], key: HomeSectionKey, delta: -1 | 1): HomeSection[] {
  const from = sections.findIndex((s) => s.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sections.length) return sections;
  const next = [...sections];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function toggleHomeSection(sections: HomeSection[], key: HomeSectionKey): HomeSection[] {
  return sections.map((s) => (s.key === key ? { ...s, isHidden: !s.isHidden } : s));
}

// ---------- Grade do desktop (SIS-12) ----------

export type HomeSectionSize = "wide" | "narrow" | "half";
/** Peso de cada seção na grade do desktop (SIS-12). */
export const HOME_SECTION_SIZE: Record<HomeSectionKey, HomeSectionSize> = {
  mood: "narrow",
  water: "narrow",
  meals: "wide",
  habits: "narrow",
  injection: "half",
  diet: "wide",
  pantry: "narrow",
};

/**
 * Altura típica de cada cartão na grade (px a 1365 px, no estado comum do dia; combinados ainda
 * vazios). Serve só para escolher os grupos: alturas parecidas lado a lado, sem cartão esticado e vazio.
 */
export const HOME_SECTION_HEIGHT: Record<HomeSectionKey, number> = {
  mood: 140,
  water: 420,
  meals: 260,
  habits: 380,
  injection: 290,
  // Linhas compactas de 72 px (mais o "Use primeiro" da despensa, quando houver).
  diet: 88,
  pantry: 88,
};
/**
 * Custo de a seção ficar sozinha na linha inteira, na mesma régua (px de sobra): baixo para quem tem
 * versão em faixa (dieta, despensa, medicação, bem-estar e água), alto para listas longas.
 */
export const HOME_SECTION_ALONE_COST: Record<HomeSectionKey, number> = {
  mood: 40,
  water: 60,
  meals: 80,
  habits: 120,
  injection: 40,
  diet: 30,
  pantry: 30,
};
/** Combinados com a lista (2 a 4 itens): mais baixo que o estado vazio, com as sugestões. */
const HABITS_LISTED_HEIGHT = 290;
/** Espaço entre os cartões da grade (o mesmo `gap` do CSS). */
const BENTO_GAP = 16;

/** O que muda a forma de um cartão a ponto de mudar a grade: combinados vazios × com a lista. */
export interface BentoHints {
  hasHabits?: boolean;
}
type Heights = Record<HomeSectionKey, number>;

/** Colunas de 12: largo + estreito, metade + metade e a linha inteira. */
export type BentoSpan = 5 | 6 | 7 | 12;
/** Uma célula da grade: colunas ocupadas e se o cartão desce por duas linhas (ao lado de dois empilhados). */
export interface BentoCell {
  span: BentoSpan;
  rows: 1 | 2;
}
const BENTO_WIDE: BentoSpan = 7;
const BENTO_NARROW: BentoSpan = 5;
const BENTO_HALF: BentoSpan = 6;
const BENTO_FULL: BentoSpan = 12;

const isWide = (key: HomeSectionKey) => HOME_SECTION_SIZE[key] === "wide";

function pairSpans(first: HomeSectionKey, second: HomeSectionKey): [BentoSpan, BentoSpan] {
  const a = HOME_SECTION_SIZE[first];
  const b = HOME_SECTION_SIZE[second];
  if (a === "wide" && b === "narrow") return [BENTO_WIDE, BENTO_NARROW];
  if (a === "narrow" && b === "wide") return [BENTO_NARROW, BENTO_WIDE];
  return [BENTO_HALF, BENTO_HALF];
}

/** Diferença (px) entre os lados de uma pilha a partir da qual o lado mais alto ganha a coluna larga. */
const STACK_BALANCE = 40;

/**
 * Colunas do cartão alto de uma pilha; os dois empilhados ficam com o resto das 12. Cartão mais
 * largo fica mais baixo: com lados desiguais, o mais alto ganha 7 colunas; parecidos, vale o peso.
 */
function tallSpan(tall: HomeSectionKey, stacked: readonly [HomeSectionKey, HomeSectionKey], excess: number): BentoSpan {
  if (excess > STACK_BALANCE) return BENTO_WIDE;
  if (excess < -STACK_BALANCE) return BENTO_NARROW;
  const isStackWide = stacked.some(isWide);
  if (isWide(tall) && !isStackWide) return BENTO_WIDE;
  if (HOME_SECTION_SIZE[tall] === "narrow" && isStackWide) return BENTO_NARROW;
  return BENTO_HALF;
}

type BentoGroup = { cost: number; cells: [HomeSectionKey, BentoCell][] };

function stackGroup(
  heights: Heights,
  tall: HomeSectionKey,
  stacked: readonly [HomeSectionKey, HomeSectionKey],
  order: HomeSectionKey[],
): BentoGroup {
  const excess = heights[tall] - (heights[stacked[0]] + BENTO_GAP + heights[stacked[1]]);
  const span = tallSpan(tall, stacked, excess);
  const cellOf = (key: HomeSectionKey): BentoCell =>
    key === tall ? { span, rows: 2 } : { span: (BENTO_FULL - span) as BentoSpan, rows: 1 };
  return { cost: Math.abs(excess), cells: order.map((key) => [key, cellOf(key)]) };
}

/** Grupos possíveis a partir de `keys[i]`, na ordem de preferência em caso de empate. */
function groupsAt(heights: Heights, keys: readonly HomeSectionKey[], i: number): BentoGroup[] {
  const [a, b, c] = [keys[i]!, keys[i + 1], keys[i + 2]];
  const groups: BentoGroup[] = [];
  if (b !== undefined) {
    const [spanA, spanB] = pairSpans(a, b);
    groups.push({
      cost: Math.abs(heights[a] - heights[b]),
      cells: [
        [a, { span: spanA, rows: 1 }],
        [b, { span: spanB, rows: 1 }],
      ],
    });
  }
  if (b !== undefined && c !== undefined) {
    // Alto à esquerda, dois empilhados à direita; ou alto no meio, à direita, com o 1º e o 3º empilhados.
    groups.push(stackGroup(heights, a, [b, c], [a, b, c]));
    groups.push(stackGroup(heights, b, [a, c], [a, b, c]));
  }
  groups.push({ cost: HOME_SECTION_ALONE_COST[a], cells: [[a, { span: BENTO_FULL, rows: 1 }]] });
  return groups;
}

/**
 * Grade do Hoje no desktop (SIS-12), sempre na ordem da pessoa (ordem do DOM = ordem visual).
 * Cada linha é um grupo que preenche as 12 colunas: um par (largo + estreito → 7 + 5; os outros
 * 6 + 6), uma pilha (um cartão alto por duas linhas ao lado de dois baixos empilhados) ou uma seção
 * sozinha na linha inteira. Entre as divisões possíveis, fica a de menor sobra somada — as alturas
 * típicas de cada lado do grupo mais parecidas —, para nenhum cartão esticar vazio. Só os combinados
 * mudam de altura típica (vazios ou com lista); o resto da grade não depende dos registros do dia.
 */
export function bentoLayout(
  keys: readonly HomeSectionKey[],
  hints: BentoHints = {},
): Partial<Record<HomeSectionKey, BentoCell>> {
  const heights: Heights = { ...HOME_SECTION_HEIGHT, ...(hints.hasHabits ? { habits: HABITS_LISTED_HEIGHT } : {}) };
  const best: { cost: number; group?: BentoGroup }[] = Array.from({ length: keys.length + 1 }, () => ({
    cost: Infinity,
  }));
  best[keys.length] = { cost: 0 };
  for (let i = keys.length - 1; i >= 0; i--)
    for (const group of groupsAt(heights, keys, i)) {
      const cost = group.cost + best[i + group.cells.length]!.cost;
      if (cost < best[i]!.cost) best[i] = { cost, group };
    }
  const layout: Partial<Record<HomeSectionKey, BentoCell>> = {};
  for (let i = 0; i < keys.length; ) {
    const cells = best[i]!.group!.cells;
    for (const [key, cell] of cells) layout[key] = cell;
    i += cells.length;
  }
  return layout;
}
