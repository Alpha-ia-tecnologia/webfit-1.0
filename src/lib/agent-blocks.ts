import { z } from "zod";
import { fmtNumber } from "./format";
import { allergenIn, allergenTokens, normalizeText } from "./allergens";
import { glyphForName } from "./food-glyph";

/**
 * Blocos visuais do chat (SIS-02). Módulo folha: importa só zod, ./format, ./text, ./allergens e
 * ./food-glyph (que só importa tipos), nunca src/types.ts em tempo de execução (types.ts depende
 * deste arquivo).
 * O modelo devolve dados; o app desenha e recalcula todo número de nutrição pela TACO.
 */

export const CHAT_ROLES = ["nutricionista", "rotina", "analista_exames"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];
/** Igual a MEAL_CATEGORIES (src/lib/meals.ts); um teste garante. */
export const BLOCK_MEALS = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"] as const;
export type BlockMeal = (typeof BLOCK_MEALS)[number];
/**
 * Sem métricas de kcal. Perfil sensível: sem peso_8s. semana_7d = cartão da semana (registros,
 * proteína, água e sono), desenhado só com os registros locais.
 */
export const CHAT_METRICS = ["agua_7d", "refeicoes_7d", "peso_8s", "semana_7d"] as const;
export type ChatMetric = (typeof CHAT_METRICS)[number];
export const TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
export const TIME_RE = new RegExp(TIME_PATTERN);
export const TEXT_BLOCK_MAX = 4000;
/** 33.000 unidades UTF-16 ≤ 100.000 bytes em UTF-8: a checagem da migração nunca falha. */
export const SECTIONS_MAX_CHARS = 33_000;

/** Fragmento final de marcador aberto ("… [caloria") que só um recorte produz. */
const PARTIAL_MARKER = /\s*\[[^\]]*$/;

/**
 * Leitura tolerante: recorta por ponto de código (nunca parte um par substituto). Quando recorta,
 * tira o marcador cortado ao meio: a máscara de calorias cresce o texto e o servidor revalida.
 */
export const clip = (max: number) =>
  z.string().transform((s) => {
    const chars = Array.from(s.trim());
    if (chars.length <= max) return chars.join("");
    return chars.slice(0, max).join("").replace(PARTIAL_MARKER, "").trim();
  });

/** "Tomar"/"tome" seguido do que não é remédio: bebida, banho, sol, ar, cuidado (com quantidade opcional). */
const TAKE_ALLOWED =
  "(?:(?:um|uma|mais|meio|meia|o|a|seu|sua|\\d+)\\s+)?(?:(?:copos?|xicaras?|garrafas?|canecas?|goles?|litros?|ml)\\s+(?:de\\s+)?)?" +
  "(?:agua|cafe|cha|banho|sol|ar|suco|leite|iogurte|vitamina\\s+de|caldo|sopa|cuidado|nota|conta)\\b";
/** Testados sobre normalizeText (sem acentos, minúsculas). "vitamina de banana" é bebida: só letra de vitamina conta. */
export const MEDICATION_PATTERN = new RegExp(
  [
    /\bcanetas?\b|aplicac|\baplicar\b|injec|injet|\bdoses?\b|\bmc?g\b|\bui\b|remedio|medicament|medicac|comprimido|capsula/.source,
    /semaglut|tirzepat|liraglut|ozempic|mounjaro|wegovy|saxenda|rybelsus|victoza|trulicity|zepbound|insulin|suplement/.source,
    /metformin|levotiroxin|anticoncepc|orlistat|sibutramin|multivitamin|polivitamin|\bvitaminas?\s+(?:[a-e]\d?|b\d{1,2}|k\d?)\b/.source,
    `\\btom(?:ar|e)\\s+(?!${TAKE_ALLOWED})\\w+`,
  ].join("|"),
);
export const SENSITIVE_NUDGE_PATTERN =
  /\bpes(o|os|e|ar|agem|ando)\b|balanca|calori|kcal|jejum|emagre|perder peso|perda de peso|restricao (cal|alim)|restring|cintura|\bimc\b|comer menos|pular (o |a )?(cafe|almoco|jantar|lanche|refeic)|protein|proteic|\bmetas?\b|gordura corporal|queimar gordura|\bsecar\b/;
export const matchesPattern = (text: string, re: RegExp) => re.test(normalizeText(text));

export const plannedItemSchema = z.object({
  alimento: clip(80),
  medidaCaseira: clip(60),
  gramas: z.number().positive().max(2000).nullable().catch(null),
});
export type PlannedItem = z.infer<typeof plannedItemSchema>;

const mealOptionSchema = z.object({
  nome: clip(80),
  emoji: clip(8),
  minutos: z.number().int().min(1).max(240).nullable().catch(null),
  itens: z.array(plannedItemSchema).min(1).max(8),
});
export type MealOption = z.infer<typeof mealOptionSchema>;

export const chatBlockSchema = z.union([
  z.object({ tipo: z.literal("texto"), texto: clip(TEXT_BLOCK_MAX) }),
  z.object({
    tipo: z.literal("lista"),
    titulo: clip(80).nullable(),
    ordenada: z.boolean(),
    itens: z.array(clip(200)).min(1).max(8),
  }),
  z.object({
    tipo: z.literal("opcoes_refeicao"),
    titulo: clip(80).nullable(),
    refeicao: z.enum(BLOCK_MEALS),
    opcoes: z.array(mealOptionSchema).min(1).max(3),
  }),
  z.object({ tipo: z.literal("grafico"), metrica: z.enum(CHAT_METRICS) }),
  z.object({
    tipo: z.literal("acao"),
    acao: z.literal("criar_habito"),
    titulo: clip(60),
    horario: z.string().regex(TIME_RE),
  }),
  z.object({
    tipo: z.literal("acao"),
    acao: z.literal("registrar_refeicao"),
    refeicao: z.enum(BLOCK_MEALS),
    itens: z.array(plannedItemSchema).min(1).max(8),
  }),
  z.object({ tipo: z.literal("sugestoes"), itens: z.array(clip(60)).min(1).max(3) }),
]);
export type ChatBlock = z.infer<typeof chatBlockSchema>;
type SuggestionsBlock = Extract<ChatBlock, { tipo: "sugestoes" }>;
export const chatOutputSchema = z.object({ blocos: z.array(chatBlockSchema).min(1).max(6) });
export type ChatOutput = z.infer<typeof chatOutputSchema>;
export const chatSectionSchema = z.object({
  papel: z.enum(CHAT_ROLES).nullable(),
  blocos: z.array(chatBlockSchema).min(1).max(6),
});
export const chatSectionsSchema = z
  .array(chatSectionSchema)
  .min(1)
  .max(3)
  .refine((s) => JSON.stringify(s).length <= SECTIONS_MAX_CHARS);
export type ChatSection = z.infer<typeof chatSectionSchema>;

/** Rótulo de cada seção na tela ("hábitos" fica de fora do app: o termo é "combinados"). */
export const SECTION_LABEL: Record<ChatRole, string> = {
  nutricionista: "Alimentação e hidratação",
  rotina: "Rotina, sono e combinados",
  analista_exames: "Sobre os exames",
};
export const METRIC_LABEL: Record<ChatMetric, string> = {
  agua_7d: "água nos últimos 7 dias",
  refeicoes_7d: "refeições registradas nos últimos 7 dias",
  peso_8s: "peso nas últimas 8 semanas",
  semana_7d: "resumo da semana com registros, proteína, água e sono",
};
/** Quantas sugestões de próxima pergunta aparecem, no máximo. */
export const SUGGESTIONS_MAX = 3;

export function optionsTitle(b: { titulo: string | null; refeicao: BlockMeal }): string {
  return b.titulo?.trim() || `Opções de ${b.refeicao.toLowerCase()}`;
}

/** Faixas de pictogramas aceitas (sem \p{…}, que o Hermes pode não ter). */
const EMOJI_RANGES: readonly [number, number][] = [
  [0x1f300, 0x1faff],
  [0x2600, 0x27bf],
];
const VARIATION_SELECTOR = 0xfe0f;

/** Primeiro emoji do texto, se for um pictograma; sequências com ZWJ ficam só no primeiro. */
export function safeEmoji(value: string): string | null {
  const [first, second] = Array.from(value.trim());
  const code = first?.codePointAt(0);
  if (code === undefined || !EMOJI_RANGES.some(([min, max]) => code >= min && code <= max))
    return null;
  return second?.codePointAt(0) === VARIATION_SELECTOR ? `${first}${second}` : first;
}

const SUMMARY_ITEMS = 3;

/** Resumo de uma linha da opção: os 3 primeiros alimentos ("Tortilha integral, frango, alface"). */
export function optionSummary(option: Pick<MealOption, "itens">): string {
  return option.itens
    .slice(0, SUMMARY_ITEMS)
    .map((item, index) => {
      const name = item.alimento.trim();
      return index === 0 ? name : name.toLowerCase();
    })
    .filter(Boolean)
    .join(", ");
}

const MEAL_PREP: Record<BlockMeal, string> = {
  "Café da manhã": "no café da manhã",
  Almoço: "no almoço",
  Lanche: "no lanche",
  Jantar: "no jantar",
  Ceia: "na ceia",
};

/** "no jantar", "na ceia": o fim do botão "Registrar no jantar". */
export function mealPrep(meal: BlockMeal): string {
  return MEAL_PREP[meal];
}

export interface ConsideredChip {
  kind: "allergen" | "goal";
  text: string;
}
/** Até 2 alergias viram "Sem amendoim"; mais que isso não cabe na linha. */
const CONSIDERED_ALLERGENS_MAX = 2;

/**
 * "O que considerei" sobre as opções, só com dados locais: as alergias declaradas ("Sem
 * amendoim", com a grafia da pessoa) e a meta de energia ("Meta 1.645 kcal") quando a tela pode
 * mostrar calorias (nem calorias ocultas, nem perfil calmo: quem chama decide `kcalGoal`).
 */
export function consideredChips(input: {
  allergyDetails: string;
  kcalGoal: number | null;
}): ConsideredChip[] {
  const tokens = new Set(allergenTokens(input.allergyDetails));
  const seen = new Set<string>();
  const allergens = input.allergyDetails
    .split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/)
    .filter((word) => {
      const key = normalizeText(word);
      const known = tokens.has(key) || tokens.has(key.replace(/s$/, ""));
      if (!known || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, CONSIDERED_ALLERGENS_MAX)
    .map((word): ConsideredChip => ({ kind: "allergen", text: `Sem ${word.toLowerCase()}` }));
  const goal: ConsideredChip[] =
    input.kcalGoal && input.kcalGoal > 0
      ? [{ kind: "goal", text: `Meta ${fmtNumber(input.kcalGoal)} kcal` }]
      : [];
  return [...allergens, ...goal];
}

/** Palavras curtas ("de", "com") não bastam para dizer que a sugestão cita uma opção. */
const MIN_NAME_WORD = 4;
const nameWords = (text: string) =>
  normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= MIN_NAME_WORD);

/**
 * Emoji decorativo de uma resposta rápida: o da opção que ela cita ("Receita do wrap" → 🌯),
 * senão o do primeiro alimento citado ("Usar o espinafre que vence" → 🥬), senão nenhum.
 */
export function suggestionEmoji(
  text: string,
  options: readonly Pick<MealOption, "nome" | "emoji">[] = [],
): string | null {
  const words = new Set(nameWords(text));
  for (const option of options) {
    const emoji = safeEmoji(option.emoji);
    if (emoji && nameWords(option.nome).some((word) => words.has(word))) return emoji;
  }
  return glyphForName(text);
}

const itemText = (i: PlannedItem) =>
  `${i.alimento} — ${i.medidaCaseira}${i.gramas ? ` (≈ ${fmtNumber(i.gramas)} g)` : ""}`;

/** Texto determinístico de um bloco: é o que a guarda, o revisor e o histórico leem. */
export function renderBlock(block: ChatBlock): string {
  switch (block.tipo) {
    case "texto":
      return block.texto.trim();
    case "lista":
      return [
        ...(block.titulo ? [`**${block.titulo}**`] : []),
        ...block.itens.map((item, i) => (block.ordenada ? `${i + 1}. ${item}` : `- ${item}`)),
      ].join("\n");
    case "opcoes_refeicao":
      return [
        `**${optionsTitle(block)}**`,
        ...block.opcoes.map((o, i) => {
          const emoji = safeEmoji(o.emoji);
          const minutes = o.minutos ? ` (${o.minutos} min)` : "";
          return `${i + 1}. ${emoji ? `${emoji} ` : ""}${o.nome}${minutes}: ${o.itens.map(itemText).join("; ")}`;
        }),
      ].join("\n");
    case "grafico":
      return `[Gráfico do app: ${METRIC_LABEL[block.metrica]}]`;
    case "acao":
      return block.acao === "criar_habito"
        ? `[Proposta de combinado para a pessoa confirmar no app: ${block.titulo}, às ${block.horario}]`
        : `[Proposta de registro para a pessoa conferir no app: ${block.refeicao} com ${block.itens.map(itemText).join("; ")}]`;
    case "sugestoes":
      return `Sugestões de próxima pergunta: ${block.itens.join(" · ")}`;
  }
}

export function renderChatText(blocks: readonly ChatBlock[]): string {
  return blocks
    .map(renderBlock)
    .filter(Boolean)
    .join("\n\n");
}

/** Igual ao mergeDrafts do servidor quando cada rascunho é um renderChatText. */
export function renderChatSections(
  sections: readonly ChatSection[],
  titles: Record<ChatRole, string>,
): string {
  return sections
    .map((s) =>
      s.papel ? `**${titles[s.papel]}**\n\n${renderChatText(s.blocos)}` : renderChatText(s.blocos),
    )
    .join("\n\n");
}

export interface SanitizeContext {
  role: ChatRole | null;
  sensitive: boolean;
  allergyDetails: string;
}

/** Blocos que cada papel pode usar ("acao" separado pelo tipo de ação). */
const ROLE_BLOCKS: Record<ChatRole, readonly string[]> = {
  nutricionista: ["texto", "lista", "opcoes_refeicao", "grafico", "acao:registrar_refeicao", "sugestoes"],
  rotina: ["texto", "lista", "grafico", "acao:criar_habito", "sugestoes"],
  analista_exames: ["texto", "lista", "sugestoes"],
};
const blockKind = (b: ChatBlock) => (b.tipo === "acao" ? `acao:${b.acao}` : b.tipo);

const withoutGrams = (items: readonly PlannedItem[]): PlannedItem[] =>
  items.map((i) => ({ ...i, gramas: null }));

/** Perfil sensível: porções só em medida caseira (as gramas não chegam à tela nem à estimativa). */
function sensitiveBlock(b: ChatBlock): ChatBlock {
  if (b.tipo === "opcoes_refeicao")
    return { ...b, opcoes: b.opcoes.map((o) => ({ ...o, itens: withoutGrams(o.itens) })) };
  if (b.tipo === "acao" && b.acao === "registrar_refeicao")
    return { ...b, itens: withoutGrams(b.itens) };
  return b;
}

const hasContent = (b: ChatBlock) =>
  b.tipo === "texto" ? !!b.texto.trim() : b.tipo === "lista" ? b.itens.length > 0 : true;

const uniqueText = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Sugestões de próxima pergunta seguras: sem medicamento, sem incentivo sensível, sem alergênico.
 * O alergênico usa a regra de nome ("Receitas sem amendoim" passa; "sem glúten com amendoim", não).
 */
function safeSuggestions(items: readonly string[], ctx: SanitizeContext, tokens: string[]): string[] {
  return uniqueText(
    items.filter(
      (item) =>
        !matchesPattern(item, MEDICATION_PATTERN) &&
        !(ctx.sensitive && matchesPattern(item, SENSITIVE_NUDGE_PATTERN)) &&
        !allergenIn(item, tokens, "name"),
    ),
  ).slice(0, SUGGESTIONS_MAX);
}

/**
 * Limpeza determinística dos blocos (servidor antes de renderizar; cliente em layoutSections):
 * papel, gráfico de peso e gramas em perfil sensível, blocos vazios e sugestões (só a última,
 * no fim). Devolve null quando só restam sugestões. Não mexe em criar_habito (guarda/cliente).
 */
export function sanitizeBlocks(
  blocks: readonly ChatBlock[],
  ctx: SanitizeContext,
): ChatBlock[] | null {
  const allowed = ctx.role ? ROLE_BLOCKS[ctx.role] : null;
  const kept = blocks
    .filter((b) => !allowed || allowed.includes(blockKind(b)))
    .filter((b) => !(ctx.sensitive && b.tipo === "grafico" && b.metrica === "peso_8s"))
    .map((b) => (ctx.sensitive ? sensitiveBlock(b) : b))
    .map((b) => (b.tipo === "lista" ? { ...b, itens: b.itens.filter((i) => i.trim()) } : b))
    .filter(hasContent);
  const content = kept.filter((b) => b.tipo !== "sugestoes");
  if (!content.length) return null;
  const last = kept.filter((b): b is SuggestionsBlock => b.tipo === "sugestoes").at(-1);
  const chips = last ? safeSuggestions(last.itens, ctx, allergenTokens(ctx.allergyDetails)) : [];
  return chips.length ? [...content, { tipo: "sugestoes", itens: chips }] : content;
}

const unsafeHabit = (title: string, sensitive: boolean) =>
  matchesPattern(title, MEDICATION_PATTERN) ||
  (sensitive && matchesPattern(title, SENSITIVE_NUDGE_PATTERN));

/**
 * Como o cliente desenha as seções: blocos limpos, sem combinados sobre medicamento (ou peso e
 * restrição em perfil sensível) e com as sugestões reunidas no fim da mensagem. Seções vazias
 * saem; resultado vazio = a tela mostra o texto.
 */
export function layoutSections(
  sections: readonly ChatSection[],
  ctx: { sensitive: boolean; allergyDetails: string },
): { sections: ChatSection[]; suggestions: string[] } {
  const cleaned = sections.flatMap((section) => {
    const blocks = sanitizeBlocks(section.blocos, { ...ctx, role: null });
    if (!blocks) return [];
    const visible = blocks.filter(
      (b) => !(b.tipo === "acao" && b.acao === "criar_habito" && unsafeHabit(b.titulo, ctx.sensitive)),
    );
    return [{ papel: section.papel, blocos: visible }];
  });
  const suggestions = cleaned.flatMap((s) =>
    s.blocos.flatMap((b) => (b.tipo === "sugestoes" ? b.itens : [])),
  );
  return {
    sections: foldWeekCharts(
      cleaned.map((s) => ({ ...s, blocos: s.blocos.filter((b) => b.tipo !== "sugestoes") })),
    ).filter((s) => s.blocos.length > 0),
    suggestions: uniqueText(suggestions).slice(0, SUGGESTIONS_MAX),
  };
}

type ChartBlock = Extract<ChatBlock, { tipo: "grafico" }>;
const WEEK_PARTS: readonly ChatMetric[] = ["refeicoes_7d", "agua_7d"];

/**
 * Uma mensagem com as barras de refeições E de água (o resumo da semana de antes) vira um cartão
 * só (semana_7d), no lugar do primeiro gráfico; um gráfico sozinho continua como está. Mais de um
 * semana_7d na mesma mensagem fica só o primeiro.
 */
function foldWeekCharts(sections: readonly ChatSection[]): ChatSection[] {
  const metrics = new Set(
    sections.flatMap((s) => s.blocos.flatMap((b) => (b.tipo === "grafico" ? [b.metrica] : []))),
  );
  const isFolded = WEEK_PARTS.every((metric) => metrics.has(metric));
  let isPlaced = false;
  return sections.map((section) => ({
    ...section,
    blocos: section.blocos.flatMap((block): ChatBlock[] => {
      if (block.tipo !== "grafico") return [block];
      const isWeek =
        block.metrica === "semana_7d" || (isFolded && WEEK_PARTS.includes(block.metrica));
      if (!isWeek) return [block];
      if (isPlaced) return [];
      isPlaced = true;
      const week: ChartBlock = { tipo: "grafico", metrica: "semana_7d" };
      return [week];
    }),
  }));
}

export type HabitBlock = Extract<ChatBlock, { tipo: "acao"; acao: "criar_habito" }>;
/** Título do cartão da semana quando o texto que o abre não serve de título. */
export const WEEK_TITLE_FALLBACK = "Sua semana";
const WEEK_TITLE_MAX = 32;

/** Uma frase curta ("Boa semana!") vira o título do cartão; o resto fica como texto acima dele. */
function weekTitle(block: ChatBlock | undefined): string | null {
  if (block?.tipo !== "texto") return null;
  const text = block.texto.replace(/\*\*/g, "").trim();
  if (!text || text.length > WEEK_TITLE_MAX || /\n/.test(text)) return null;
  return /[.!?]./.test(text) ? null : text;
}

export interface WeekCardView {
  /** Índice da seção e do bloco do cartão (depois de tirar o título e os combinados). */
  section: number;
  title: string;
  /** Combinados propostos na mensagem: viram chips "+ Garrafa de 1 L às 15h" no cartão. */
  habits: HabitBlock[];
  /** Próximas perguntas da mensagem: chips no fim do cartão (não na fila de respostas rápidas). */
  suggestions: string[];
}

export interface ChatLayout {
  sections: ChatSection[];
  suggestions: string[];
}

/**
 * Como a tela desenha uma mensagem com o cartão da semana: o texto curto que abre a seção vira o
 * título, os combinados e as sugestões da mensagem vão para os chips do cartão e seções que
 * ficaram vazias saem. Sem semana_7d, devolve o layout como veio e `week` null.
 */
export function weekCardLayout(layout: ChatLayout): ChatLayout & { week: WeekCardView | null } {
  const index = layout.sections.findIndex((s) =>
    s.blocos.some((b) => b.tipo === "grafico" && b.metrica === "semana_7d"),
  );
  if (index < 0) return { ...layout, week: null };
  const habits = layout.sections.flatMap((s) =>
    s.blocos.filter((b): b is HabitBlock => b.tipo === "acao" && b.acao === "criar_habito"),
  );
  const title = weekTitle(layout.sections[index]?.blocos[0]);
  const sections = layout.sections.map((section, i) => ({
    ...section,
    blocos: section.blocos
      .filter((b, j) => !(i === index && j === 0 && title))
      .filter((b) => !(b.tipo === "acao" && b.acao === "criar_habito")),
  }));
  const kept = sections.filter((s, i) => i === index || s.blocos.length > 0);
  return {
    sections: kept,
    suggestions: [],
    week: {
      section: kept.indexOf(sections[index]!),
      title: title ?? WEEK_TITLE_FALLBACK,
      habits,
      suggestions: layout.suggestions,
    },
  };
}
