import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_MEALS,
  CHAT_METRICS,
  MEDICATION_PATTERN,
  SENSITIVE_NUDGE_PATTERN,
  TEXT_BLOCK_MAX,
  chatBlockSchema,
  chatSectionsSchema,
  clip,
  consideredChips,
  layoutSections,
  matchesPattern,
  mealPrep,
  optionSummary,
  renderChatSections,
  renderChatText,
  safeEmoji,
  sanitizeBlocks,
  suggestionEmoji,
  weekCardLayout,
  WEEK_TITLE_FALLBACK,
  type ChatBlock,
  type ChatSection,
} from "../src/lib/agent-blocks";
import { MEAL_CATEGORIES } from "../src/lib/meals";
import { maskStructured, stringLeaves, structuredReplySchema } from "../src/lib/structured";
import { chatSchema } from "../src/types";
import { SPECIALIST_TITLES } from "../server/graph/prompts";
import { CHAT_OUTPUT } from "./structured-fixtures";

const texto = (t: string): ChatBlock => ({ tipo: "texto", texto: t });
const chips = (...itens: string[]): ChatBlock => ({ tipo: "sugestoes", itens });
const habit = (titulo: string): ChatBlock => ({
  tipo: "acao",
  acao: "criar_habito",
  titulo,
  horario: "07:00",
});
const register: ChatBlock = {
  tipo: "acao",
  acao: "registrar_refeicao",
  refeicao: "Almoço",
  itens: [{ alimento: "arroz cozido", medidaCaseira: "4 colheres de sopa", gramas: 100 }],
};
const list: ChatBlock = {
  tipo: "lista",
  titulo: "Para a semana",
  ordenada: true,
  itens: ["Cozinhe o feijão no domingo", "Congele em porções"],
};
const ctx = { role: null, sensitive: false, allergyDetails: "Amendoim" } as const;
const kinds = (blocks: readonly ChatBlock[] | null) =>
  blocks?.map((b) => (b.tipo === "acao" ? `acao:${b.acao}` : b.tipo)) ?? null;

test("renderChatText: texto exato e estável dos blocos", () => {
  const text = renderChatText(CHAT_OUTPUT.blocos);
  assert.equal(
    text,
    [
      "Aqui vão duas ideias de jantar rápidas, com o que costuma ter em casa.",
      "",
      "**Opções de jantar**",
      "1. 🍗 Frango com arroz e salada (20 min): frango grelhado — 1 filé (≈ 100 g); arroz cozido — 4 colheres de sopa (≈ 100 g); alface — 3 folhas (≈ 30 g)",
      "2. 🍳 Cuscuz com ovo (15 min): cuscuz — 1 pedaço médio (≈ 120 g); ovo cozido — 1 unidade (≈ 50 g)",
      "",
      "[Gráfico do app: água nos últimos 7 dias]",
      "",
      "[Proposta de combinado para a pessoa confirmar no app: Beber água ao acordar, às 07:00]",
      "",
      "Sugestões de próxima pergunta: Quero ideias de lanche · Como organizar o almoço?",
    ].join("\n"),
  );
  assert.equal(renderChatText(CHAT_OUTPUT.blocos), text);
  assert.equal(
    renderChatText([list, register]),
    "**Para a semana**\n1. Cozinhe o feijão no domingo\n2. Congele em porções\n\n[Proposta de registro para a pessoa conferir no app: Almoço com arroz cozido — 4 colheres de sopa (≈ 100 g)]",
  );
  assert.equal(
    renderChatText([{ tipo: "lista", titulo: null, ordenada: false, itens: ["a", "b"] }]),
    "- a\n- b",
  );
});

test("cobertura da guarda: todo texto dos blocos aparece no texto renderizado", () => {
  const blocks: ChatBlock[] = [
    ...CHAT_OUTPUT.blocos,
    list,
    register,
    { tipo: "grafico", metrica: "peso_8s" },
  ];
  const text = renderChatText(blocks);
  // Chaves que não são conteúdo: o tipo, a ação, a métrica (vira rótulo) e o emoji (filtrado).
  const content = JSON.parse(
    JSON.stringify(blocks, (key, value) =>
      ["tipo", "acao", "metrica", "emoji", "papel"].includes(key) ? undefined : value,
    ),
  );
  const meals = new Set<string>(BLOCK_MEALS);
  for (const leaf of stringLeaves(content))
    assert.ok(
      text.includes(leaf) ||
        (meals.has(leaf) && text.toLowerCase().includes(leaf.toLowerCase())),
      `"${leaf}" não aparece no texto`,
    );
  assert.equal(CHAT_METRICS.length, 4);
});

test("renderChatSections: mesmo formato de seções do texto do servidor", () => {
  const sections: ChatSection[] = [
    { papel: "nutricionista", blocos: [texto("Texto do nutricionista.")] },
    { papel: "rotina", blocos: [texto("Texto da rotina.")] },
  ];
  assert.match(
    renderChatSections(sections, SPECIALIST_TITLES),
    /^\*\*Alimentação e hidratação\*\*\n\nTexto do nutricionista\.\n\n\*\*Rotina, sono e hábitos\*\*\n\nTexto da rotina\.$/,
  );
  assert.equal(
    renderChatSections([{ papel: null, blocos: [texto("Só um.")] }], SPECIALIST_TITLES),
    "Só um.",
  );
});

test("sanitizeBlocks: blocos permitidos por papel", () => {
  const all: ChatBlock[] = [...CHAT_OUTPUT.blocos.slice(0, 4), list, register, chips("Oi?")];
  assert.deepEqual(kinds(sanitizeBlocks(all, { ...ctx, role: "nutricionista" })), [
    "texto",
    "opcoes_refeicao",
    "grafico",
    "lista",
    "acao:registrar_refeicao",
    "sugestoes",
  ]);
  assert.deepEqual(kinds(sanitizeBlocks(all, { ...ctx, role: "rotina" })), [
    "texto",
    "grafico",
    "acao:criar_habito",
    "lista",
    "sugestoes",
  ]);
  assert.deepEqual(kinds(sanitizeBlocks(all, { ...ctx, role: "analista_exames" })), [
    "texto",
    "lista",
    "sugestoes",
  ]);
  assert.equal(sanitizeBlocks(all, ctx)!.length, all.length);
});

test("sanitizeBlocks: perfil sensível perde o gráfico de peso e as gramas", () => {
  const weight: ChatBlock = { tipo: "grafico", metrica: "peso_8s" };
  const blocks = [...CHAT_OUTPUT.blocos, weight, register];
  assert.ok(sanitizeBlocks(blocks, ctx)!.includes(weight));
  const sensitive = sanitizeBlocks(blocks, { ...ctx, sensitive: true })!;
  assert.ok(!sensitive.some((b) => b.tipo === "grafico" && b.metrica === "peso_8s"));
  const grams = sensitive.flatMap((b) =>
    b.tipo === "opcoes_refeicao"
      ? b.opcoes.flatMap((o) => o.itens.map((i) => i.gramas))
      : b.tipo === "acao" && b.acao === "registrar_refeicao"
        ? b.itens.map((i) => i.gramas)
        : [],
  );
  assert.equal(grams.length, 6);
  assert.ok(grams.every((g) => g === null));
  // A entrada nunca é alterada.
  assert.ok(
    CHAT_OUTPUT.blocos[1]!.tipo === "opcoes_refeicao" &&
      CHAT_OUTPUT.blocos[1]!.opcoes[0]!.itens[0]!.gramas === 100,
  );
});

test("sanitizeBlocks: sugestões seguras, só a última, no fim e sem repetir", () => {
  const medication = "Qual dose da caneta devo usar?";
  const nudge = "Como perder peso rápido?";
  const blocks = [
    chips("Primeira lista"),
    texto("Oi"),
    chips(medication, nudge, "Quero ideias com amendoim"),
  ];
  assert.deepEqual(sanitizeBlocks(blocks, ctx)!.at(-1), chips(nudge));
  assert.deepEqual(sanitizeBlocks(blocks, { ...ctx, sensitive: true }), [texto("Oi")]);
  assert.deepEqual(
    sanitizeBlocks([chips("Receitas sem amendoim"), texto("Oi")], ctx),
    [texto("Oi"), chips("Receitas sem amendoim")],
  );
  assert.deepEqual(
    sanitizeBlocks([texto("Oi"), chips("Quero X", "quero x ", "Outra")], ctx),
    [texto("Oi"), chips("Quero X", "Outra")],
  );
});

test("sanitizeBlocks: blocos vazios saem e só sugestões viram null", () => {
  assert.equal(sanitizeBlocks([chips("Quero ideias")], ctx), null);
  assert.equal(sanitizeBlocks([texto("  "), chips("Quero ideias")], ctx), null);
  assert.equal(sanitizeBlocks([habit("Beber água")], { ...ctx, role: "nutricionista" }), null);
  assert.deepEqual(
    sanitizeBlocks(
      [texto("Oi"), { tipo: "lista", titulo: null, ordenada: false, itens: [" ", ""] }],
      ctx,
    ),
    [texto("Oi")],
  );
  // criar_habito não é filtrado aqui (a guarda e o cliente cuidam).
  assert.deepEqual(kinds(sanitizeBlocks([habit("Aplicar a caneta 0,5 mg")], ctx)), [
    "acao:criar_habito",
  ]);
});

test("layoutSections: combinados de medicamento (sempre) e de peso (sensível) saem da tela", () => {
  const sections: ChatSection[] = [
    { papel: "nutricionista", blocos: [texto("Oi"), chips("Quero ideias de lanche")] },
    {
      papel: "rotina",
      blocos: [habit("Aplicar a caneta 0,5 mg"), habit("Pesar-se toda manhã"), chips("Quero ideias de lanche", "Como dormir melhor?")],
    },
  ];
  const plain = layoutSections(sections, { sensitive: false, allergyDetails: "" });
  assert.deepEqual(plain.sections, [
    { papel: "nutricionista", blocos: [texto("Oi")] },
    { papel: "rotina", blocos: [habit("Pesar-se toda manhã")] },
  ]);
  assert.deepEqual(plain.suggestions, ["Quero ideias de lanche", "Como dormir melhor?"]);
  const sensitive = layoutSections(sections, { sensitive: true, allergyDetails: "" });
  assert.deepEqual(sensitive.sections, [{ papel: "nutricionista", blocos: [texto("Oi")] }]);
  const nothing = layoutSections(
    [{ papel: null, blocos: [habit("Aplicar a caneta 0,5 mg"), chips("Oi?")] }],
    { sensitive: false, allergyDetails: "" },
  );
  assert.deepEqual(nothing, { sections: [], suggestions: ["Oi?"] });
  assert.deepEqual(
    layoutSections([{ papel: null, blocos: [chips("Oi?")] }], { sensitive: false, allergyDetails: "" }),
    { sections: [], suggestions: [] },
  );
});

test("safeEmoji e clip: só pictogramas e nunca meio par substituto", () => {
  assert.equal(safeEmoji("🍗"), "🍗");
  assert.equal(safeEmoji(" 🍽️ prato"), "🍽️");
  assert.equal(safeEmoji("abc"), null);
  assert.equal(safeEmoji(""), null);
  assert.equal(safeEmoji("🧑‍🍳"), "🧑");
  const cut = clip(2).parse("🍗🍗🍗");
  assert.equal(cut, "🍗🍗");
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
});

test("clip: recorte nunca deixa o marcador de calorias pela metade", () => {
  // 3.991 + " 300 kcal" = 4.000; mascarado vira " [calorias ocultas]" e passa do limite.
  const texto4000 = `${"a".repeat(TEXT_BLOCK_MAX - 9)} 300 kcal`;
  assert.equal(texto4000.length, TEXT_BLOCK_MAX);
  const reply = { kind: "chat", sections: [{ papel: null, blocos: [texto(texto4000)] }] };
  const masked = maskStructured(reply, true);
  const parsed = structuredReplySchema.parse(masked);
  assert.ok(parsed.kind === "chat");
  const [block] = parsed.sections[0].blocos;
  assert.ok(block.tipo === "texto");
  assert.ok(block.texto.length <= TEXT_BLOCK_MAX);
  assert.doesNotMatch(block.texto, /\[[^\]]*$/);
  assert.equal(block.texto, "a".repeat(TEXT_BLOCK_MAX - 9));
  // Sem recorte, o marcador inteiro fica; com recorte, só o pedaço aberto sai.
  assert.equal(clip(40).parse("Veja [calorias ocultas]"), "Veja [calorias ocultas]");
  assert.equal(clip(12).parse("Veja [calorias ocultas]"), "Veja");
  assert.equal(clip(10).parse("[a] b c d e f"), "[a] b c d");
});

test("MEDICATION_PATTERN: remédios e marcas comuns; tomar água, café ou banho não", () => {
  const med = (text: string) => matchesPattern(text, MEDICATION_PATTERN);
  for (const text of [
    "Tomar metformina após o almoço",
    "Posso tomar Rybelsus antes do café?",
    "Victoza ou Trulicity?",
    "Comecei o Zepbound",
    "Levotiroxina em jejum",
    "Anticoncepcional e dieta",
    "Tomar vitamina D pela manhã",
    "Multivitamínico no café",
    "Orlistat ajuda?",
    "Sibutramina tem efeito?",
    "Tomar o comprimido às 8h",
    "Tome o antialérgico antes de dormir",
  ])
    assert.equal(med(text), true, text);
  for (const text of [
    "Tomar água ao acordar",
    "Tomar café da manhã sem pressa",
    "Tomar um copo de água ao acordar",
    "Tomar 2 litros de água por dia",
    "Tomar chá de camomila à noite",
    "Tomar banho morno antes de dormir",
    "Tomar sol pela manhã",
    "Tome cuidado com o sal",
    "Vitamina de banana com aveia",
    "Tomar vitamina de mamão no lanche",
    "Salada de tomate",
  ])
    assert.equal(med(text), false, text);
});

test("sugestões: proteína e metas saem só no perfil sensível", () => {
  const protein = "Incluir proteína em todas as refeições";
  const goal = "Como bater minha meta de proteína?";
  const sleep = "Como dormir melhor?";
  for (const text of [protein, goal, "Queimar gordura rápido", "Como secar a barriga?", "Qual minha gordura corporal?"])
    assert.equal(matchesPattern(text, SENSITIVE_NUDGE_PATTERN), true, text);
  assert.equal(matchesPattern(sleep, SENSITIVE_NUDGE_PATTERN), false);
  const blocks = [texto("Oi"), chips(protein, goal, sleep)];
  assert.deepEqual(sanitizeBlocks(blocks, { ...ctx, allergyDetails: "" })!.at(-1), chips(protein, goal, sleep));
  assert.deepEqual(sanitizeBlocks(blocks, { ...ctx, allergyDetails: "", sensitive: true })!.at(-1), chips(sleep));
});

test("sugestões: alergênico pela regra de nome e plural declarado", () => {
  const allergic = { ...ctx, allergyDetails: "amendoim" };
  assert.deepEqual(
    sanitizeBlocks([texto("Oi"), chips("Receitas sem glúten com amendoim", "Receitas sem amendoim")], allergic),
    [texto("Oi"), chips("Receitas sem amendoim")],
  );
  assert.deepEqual(
    sanitizeBlocks([texto("Oi"), chips("Omelete de ovo cozido?", "Receitas sem ovo", "Lanches rápidos")], {
      ...ctx,
      allergyDetails: "Ovos",
    }),
    [texto("Oi"), chips("Receitas sem ovo", "Lanches rápidos")],
  );
});

test("limites: texto recortado em 4.000 e seções acima do teto recusadas", () => {
  const long = chatBlockSchema.parse({ tipo: "texto", texto: "a".repeat(5000) });
  assert.equal(long.tipo === "texto" && long.texto.length, TEXT_BLOCK_MAX);
  const big = Array.from({ length: 3 }, () => ({
    papel: null,
    blocos: Array.from({ length: 3 }, () => texto("a".repeat(TEXT_BLOCK_MAX))),
  }));
  assert.equal(chatSectionsSchema.safeParse(big).success, false);
  assert.equal(chatSectionsSchema.safeParse(big.slice(0, 2)).success, true);
});

test("refeições dos blocos são as mesmas do diário", () => {
  assert.deepEqual([...BLOCK_MEALS], MEAL_CATEGORIES);
});

test("chatSchema: mensagem sem blocos continua igual; blocos inválidos são descartados", () => {
  const message = {
    id: "1",
    sender: "ai" as const,
    text: "Olá",
    timestamp: "2026-09-24T10:00:00.000Z",
    status: "sent" as const,
  };
  assert.deepStrictEqual(chatSchema.parse(JSON.parse(JSON.stringify(message))), message);
  const withBlocks = { ...message, blocks: [{ papel: null, blocos: CHAT_OUTPUT.blocos }] };
  assert.deepStrictEqual(chatSchema.parse(JSON.parse(JSON.stringify(withBlocks))), withBlocks);
  const invalid = chatSchema.parse({ ...message, blocks: [{ papel: null, blocos: [{ tipo: "foo" }] }] });
  assert.equal(invalid.blocks, undefined);
  assert.equal(invalid.text, "Olá");
});

// ---------- Fidelidade visual do agente (conceito 05) ----------

const chart = (metrica: "agua_7d" | "refeicoes_7d" | "peso_8s" | "semana_7d"): ChatBlock => ({
  tipo: "grafico",
  metrica,
});
const noCtx = { sensitive: false, allergyDetails: "" };

test("layoutSections: refeições + água na mesma mensagem viram um semana_7d no lugar do primeiro", () => {
  const folded = layoutSections(
    [
      { papel: "nutricionista", blocos: [texto("Boa semana!"), chart("refeicoes_7d"), texto("Destaques"), chart("agua_7d")] },
      { papel: "rotina", blocos: [texto("Sono bom."), chart("agua_7d")] },
    ],
    noCtx,
  );
  assert.deepEqual(folded.sections, [
    { papel: "nutricionista", blocos: [texto("Boa semana!"), chart("semana_7d"), texto("Destaques")] },
    { papel: "rotina", blocos: [texto("Sono bom.")] },
  ]);
  // Um gráfico sozinho continua como está (barras do dia).
  const single = layoutSections([{ papel: null, blocos: [texto("Água"), chart("agua_7d")] }], noCtx);
  assert.deepEqual(single.sections[0]?.blocos, [texto("Água"), chart("agua_7d")]);
  // semana_7d repetido fica só uma vez; peso não entra no cartão.
  const twice = layoutSections(
    [{ papel: null, blocos: [chart("semana_7d"), chart("peso_8s"), chart("semana_7d")] }],
    noCtx,
  );
  assert.deepEqual(twice.sections[0]?.blocos, [chart("semana_7d"), chart("peso_8s")]);
});

test("weekCardLayout: título curto, combinados e sugestões vão para o cartão; seção vazia sai", () => {
  const layout = layoutSections(
    [
      { papel: "nutricionista", blocos: [texto("Boa semana!"), chart("semana_7d")] },
      { papel: "rotina", blocos: [habit("Garrafa de 1 L"), chips("Ovos ou iogurte no café")] },
    ],
    noCtx,
  );
  const view = weekCardLayout(layout);
  assert.deepEqual(view.sections, [{ papel: "nutricionista", blocos: [chart("semana_7d")] }]);
  assert.deepEqual(view.suggestions, []);
  assert.deepEqual(view.week, {
    section: 0,
    title: "Boa semana!",
    habits: [habit("Garrafa de 1 L")],
    suggestions: ["Ovos ou iogurte no café"],
  });
  // Texto longo (mais de uma frase ou > 32 caracteres) fica acima do cartão; o título é o padrão.
  const long = weekCardLayout(
    layoutSections(
      [{ papel: null, blocos: [texto("De 17 a 23 você registrou bem. Continue assim!"), chart("semana_7d")] }],
      noCtx,
    ),
  );
  assert.equal(long.week?.title, WEEK_TITLE_FALLBACK);
  assert.equal(long.sections[0]?.blocos[0]?.tipo, "texto");
  // Sem o cartão da semana, nada muda.
  const plain = layoutSections([{ papel: null, blocos: [texto("Oi"), habit("Beber água")] }], noCtx);
  assert.deepEqual(weekCardLayout(plain), { ...plain, week: null });
});

test("optionSummary e mealPrep: resumo de uma linha e o fim do botão Registrar", () => {
  const option = {
    itens: [
      { alimento: "Tortilha integral", medidaCaseira: "1", gramas: 40 },
      { alimento: "Frango", medidaCaseira: "1", gramas: 100 },
      { alimento: "Folhas Verdes", medidaCaseira: "1", gramas: 30 },
      { alimento: "Iogurte", medidaCaseira: "1", gramas: 40 },
    ],
  };
  assert.equal(optionSummary(option), "Tortilha integral, frango, folhas verdes");
  assert.equal(mealPrep("Jantar"), "no jantar");
  assert.equal(mealPrep("Ceia"), "na ceia");
  assert.equal(mealPrep("Café da manhã"), "no café da manhã");
});

test("suggestionEmoji: o da opção citada, senão o do alimento, senão nenhum", () => {
  const options = [
    { nome: "Wrap de frango", emoji: "🌯" },
    { nome: "Peixe na frigideira", emoji: "🐟" },
  ];
  assert.equal(suggestionEmoji("Receita do wrap", options), "🌯");
  assert.equal(suggestionEmoji("Usar o espinafre que vence", options), "🥬");
  assert.equal(suggestionEmoji("Como manter a caminhada?", options), null);
});

test("consideredChips: alergias com a grafia da pessoa (até 2) e a meta só quando pedida", () => {
  assert.deepEqual(consideredChips({ allergyDetails: "Amendoim", kcalGoal: 1645 }), [
    { kind: "allergen", text: "Sem amendoim" },
    { kind: "goal", text: "Meta 1.645 kcal" },
  ]);
  assert.deepEqual(
    consideredChips({ allergyDetails: "Tenho alergia a camarão, amendoim e nozes", kcalGoal: null }),
    [
      { kind: "allergen", text: "Sem camarão" },
      { kind: "allergen", text: "Sem amendoim" },
    ],
  );
  assert.deepEqual(consideredChips({ allergyDetails: "", kcalGoal: null }), []);
});
