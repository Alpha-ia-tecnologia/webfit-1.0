import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentContextChips,
  chatDayLabel,
  chatSuggestions,
  describeAgentMetaFull,
  describeAgentMetaShort,
  messageViews,
  PROFILE_ANALYSIS_PREFIX,
  PROFILE_ANALYSIS_REQUEST,
  PROFILE_REPORT_TITLES,
  profileReport,
  providerLabel,
  replyViews,
  visibleProfileReport,
} from "../src/lib/agent-presentation";
import type { ChatSection } from "../src/lib/agent-blocks";
import { DAILY_COMMENT_REQUEST } from "../src/lib/daily-comment";
import { DIET_PLAN_REQUEST } from "../src/lib/diet";
import type { ChatMessage } from "../src/types";
import { stateFixture } from "./fixtures";

const list = (titulo: string | null, itens: string[]) => ({
  tipo: "lista" as const,
  titulo,
  ordenada: false,
  itens,
});
const text = (texto: string) => ({ tipo: "texto" as const, texto });
/** Resposta ao pedido de análise na estrutura pedida (uma seção, como o servidor costuma devolver). */
const REPORT_SECTIONS: ChatSection[] = [
  {
    papel: null,
    blocos: [
      text("**Boa constância** nos registros; vale um ajuste no lanche."),
      list(PROFILE_REPORT_TITLES.well, ["Registros em 6 de 7 dias", "- Água perto da meta"]),
      list(PROFILE_REPORT_TITLES.attention, ["Proteína baixa no café", "Sono curto em 3 noites"]),
      list(PROFILE_REPORT_TITLES.suggestions, ["Ovos ou iogurte no café", "Feijão e frango no almoço"]),
      list(PROFILE_REPORT_TITLES.talk, ["Cansaço à tarde", "  "]),
      { tipo: "sugestoes" as const, itens: ["Quero ideias de café", "Como dormir melhor?"] },
    ],
  },
];

const msg = (
  id: string,
  sender: ChatMessage["sender"],
  text: string,
  status: ChatMessage["status"] = "sent",
): ChatMessage => ({
  id,
  sender,
  text,
  status,
  timestamp: "2026-09-24T10:00:00.000Z",
});

test("pedido de dieta vira aviso e a resposta seguinte vira cartão; o resto é texto", () => {
  const views = messageViews([
    msg("1", "user", "Oi"),
    msg("2", "ai", "Olá!"),
    msg("3", "user", DIET_PLAN_REQUEST),
    msg("4", "ai", "Café da manhã às 8h: fruta."),
    msg("5", "user", DIET_PLAN_REQUEST),
    msg("6", "ai", "falhou", "error"),
  ]);
  assert.equal(views.get("1"), undefined);
  assert.equal(views.get("3"), "diet-request");
  assert.equal(views.get("4"), "diet-plan");
  assert.equal(views.get("5"), "diet-request");
  assert.equal(
    views.get("6"),
    undefined,
    "resposta com erro continua como texto",
  );
});

test("separador de data: Hoje, Ontem e data curta", () => {
  const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();
  assert.equal(chatDayLabel(at("2026-09-24"), "2026-09-24"), "Hoje");
  assert.equal(chatDayLabel(at("2026-09-23"), "2026-09-24"), "Ontem");
  assert.match(chatDayLabel(at("2026-09-20"), "2026-09-24"), /^Dom, 20 set$/);
  assert.equal(chatDayLabel("inválida", "2026-09-24"), "");
});

test("chips de contexto contam o que realmente vai para a IA", () => {
  const chips = agentContextChips(stateFixture());
  assert.deepEqual(
    chips.map((c) => c.key),
    ["anamnese", "diario", "medidas", "combinados", "doses", "exames"],
  );
  const diary = chips.find((c) => c.key === "diario")!;
  assert.equal(diary.active, false);
  assert.equal(diary.detail, "Sem registros");
  assert.equal(chips.find((c) => c.key === "exames")!.detail, "Nenhum exame");
  assert.equal(chips[0].active, true);
});

test("provedor descrito sem expor chaves", () => {
  assert.equal(
    providerLabel({ deepseek: true, openai: true }),
    "DeepSeek, com a OpenAI como alternativa",
  );
  assert.equal(providerLabel({ deepseek: false, openai: true }), "OpenAI");
  assert.equal(providerLabel(null), "o provedor configurado no servidor");
});

test("atalhos do chat: dieta primeiro, refeição do horário, água quando atrasada", () => {
  const morning = chatSuggestions({
    time: "08:10",
    hasPlan: true,
    waterBehind: false,
    missingInformation: 0,
  });
  assert.deepEqual(
    morning.map((s) => s.label),
    ["Minha dieta", "Ideias de café da manhã", "Revisar meus registros"],
  );
  const evening = chatSuggestions({
    time: "19:30",
    hasPlan: false,
    waterBehind: true,
    missingInformation: 2,
  });
  assert.deepEqual(
    evening.map((s) => s.label),
    ["Criar minha dieta", "Sugira um jantar", "Bater a meta de água", "Completar anamnese"],
  );
  for (const s of [...morning, ...evening])
    assert.doesNotMatch(
      s.label + ("prompt" in s ? s.prompt : ""),
      /kcal|calori|proteína/i,
    );
});

test("resposta com blocos vira 'blocks'; com erro ou após pedido de dieta, não", () => {
  const blocks = [
    { papel: null, blocos: [{ tipo: "texto" as const, texto: "Oi" }] },
  ];
  const views = messageViews([
    msg("1", "user", "Ideias de jantar?"),
    { ...msg("2", "ai", "Oi"), blocks },
    { ...msg("3", "ai", "falhou", "error"), blocks },
    msg("4", "user", DIET_PLAN_REQUEST),
    { ...msg("5", "ai", "Plano"), blocks },
    { ...msg("6", "ai", "Sem blocos"), blocks: [] },
    msg("7", "ai", "Texto"),
  ]);
  assert.equal(views.get("2"), "blocks");
  assert.equal(views.get("3"), undefined);
  assert.equal(views.get("5"), "diet-plan");
  assert.equal(views.get("6"), undefined);
  assert.equal(views.get("7"), undefined);
});

test("linha de revisão: curta sob a resposta; a frase inteira diz que não há revisão humana", () => {
  const meta = {
    specialists: ["nutricionista" as const],
    reviewed: true,
    revisions: 0,
    urgency: "nenhuma" as const,
    notes: [],
    llmCalls: 3,
  };
  assert.equal(describeAgentMetaShort(meta), "Revisada automaticamente · apoio educativo");
  assert.match(describeAgentMetaFull(meta), /sem revisão humana/);
  assert.equal(
    describeAgentMetaShort({ ...meta, reviewed: false }),
    "Sem revisão automática · apoio educativo",
  );
  assert.equal(
    describeAgentMetaShort({ ...meta, urgency: "imediata" as const }),
    "Mensagem automática de segurança",
  );
  assert.match(describeAgentMetaFull({ ...meta, urgency: "imediata" as const }), /sem revisão humana/);
});

test("pedido de análise do perfil vira aviso (também o pedido antigo, pelo prefixo); a resposta em texto segue como texto", () => {
  const legacy = `${PROFILE_ANALYSIS_PREFIX}, cruzando a minha anamnese. Organize em: 1) o que está indo bem.`;
  const views = messageViews([
    msg("1", "user", PROFILE_ANALYSIS_REQUEST),
    msg("2", "ai", "1) O que está indo bem: ..."),
    msg("3", "user", PROFILE_ANALYSIS_REQUEST, "error"),
    msg("4", "user", legacy),
    msg("5", "user", `Minha dúvida: ${PROFILE_ANALYSIS_REQUEST}`),
  ]);
  assert.equal(views.get("1"), "profile-request");
  assert.equal(views.get("2"), undefined, "a análise em texto continua como texto");
  assert.equal(views.get("3"), undefined, "pedido que falhou fica como texto, com o reenvio");
  assert.equal(views.get("4"), "profile-request", "conversas antigas continuam com o aviso");
  assert.equal(views.get("5"), undefined, "só o início fixo identifica o pedido");
});

test("pedido de análise do perfil cruza anamnese, registros e preferências e dita os blocos do cartão, sem números ou dose", () => {
  for (const topic of [
    /anamnese/,
    /condições de saúde/,
    /caneta/,
    /atividade/,
    /sono/,
    /estresse/,
    /diário/,
    /medidas/,
    /aplicações/,
    /sintomas/,
    /favoritos e evitados/,
    /rotina/,
    /tempo para cozinhar/,
    /orçamento/,
    /metas do app como estão/,
    /1 bloco "texto" com uma síntese de até 120 caracteres/,
    /exatamente 4 blocos "lista"/,
    /2 a 3 itens de até 80 caracteres/,
    /sem markdown e sem números de dose/,
    /por fim 1 bloco "sugestoes"/,
  ])
    assert.match(PROFILE_ANALYSIS_REQUEST, topic);
  for (const title of Object.values(PROFILE_REPORT_TITLES))
    assert.ok(PROFILE_ANALYSIS_REQUEST.includes(`"${title}"`), `pede o título literal "${title}"`);
  assert.match(PROFILE_ANALYSIS_REQUEST, /não comente nem sugira doses/);
  assert.doesNotMatch(PROFILE_ANALYSIS_REQUEST, /kcal|caloria/i);
});

test("relatório: síntese sem markdown, 4 seções na ordem do cartão com tom, itens limpos e sugestões", () => {
  const report = profileReport(REPORT_SECTIONS);
  assert.ok(report);
  assert.equal(report.summary, "Boa constância nos registros; vale um ajuste no lanche.");
  assert.deepEqual(
    report.sections.map((s) => [s.key, s.title, s.tone]),
    [
      ["well", "Indo bem", "habit"],
      ["attention", "Atenção", "water"],
      ["suggestions", "Sugestões", "food"],
      ["talk", "Para conversar", "neutral"],
    ],
  );
  assert.deepEqual(report.sections[0].items, ["Registros em 6 de 7 dias", "Água perto da meta"]);
  assert.deepEqual(report.sections[3].items, ["Cansaço à tarde"], "item em branco sai");
  assert.deepEqual(report.suggestions, ["Quero ideias de café", "Como dormir melhor?"]);
});

test("relatório aceita títulos numerados, com dois-pontos ou variantes, em qualquer ordem", () => {
  const report = profileReport([
    {
      papel: "nutricionista",
      blocos: [
        list("4. O que conversar com o profissional:", ["Enjoo após o almoço"]),
        list("**Pontos de atenção**", ["Pouca água"]),
        text("Semana regular."),
        list("3) Sugestões práticas de refeições", ["Sopa de legumes no jantar"]),
        list("1) O que está indo bem", ["Registros em dia"]),
      ],
    },
  ]);
  assert.ok(report);
  assert.deepEqual(
    report.sections.map((s) => [s.key, s.items[0]]),
    [
      ["well", "Registros em dia"],
      ["attention", "Pouca água"],
      ["suggestions", "Sopa de legumes no jantar"],
      ["talk", "Enjoo após o almoço"],
    ],
  );
  assert.deepEqual(report.suggestions, []);
});

test("sem a estrutura pedida, a resposta não é relatório", () => {
  const [section] = REPORT_SECTIONS;
  const blocks = section.blocos;
  const withBlocks = (blocos: ChatSection["blocos"]) => [{ papel: null, blocos }];
  assert.equal(profileReport(withBlocks(blocks.slice(0, 4))), null, "faltou uma lista");
  assert.equal(profileReport(withBlocks([text("Outra frase."), ...blocks])), null, "dois textos");
  assert.equal(profileReport(withBlocks(blocks.slice(1))), null, "sem síntese");
  assert.equal(
    profileReport(withBlocks([...blocks, { tipo: "grafico", metrica: "agua_7d" }])),
    null,
    "bloco de outro tipo",
  );
  assert.equal(
    profileReport(withBlocks([...blocks.slice(0, 4), list(PROFILE_REPORT_TITLES.well, ["De novo"])])),
    null,
    "título repetido",
  );
  assert.equal(
    profileReport(withBlocks([...blocks.slice(0, 4), list("Outra coisa", ["x"])])),
    null,
    "título fora da lista",
  );
  assert.equal(
    profileReport(withBlocks([...blocks.slice(0, 4), list(PROFILE_REPORT_TITLES.talk, [" "])])),
    null,
    "lista sem itens",
  );
  assert.equal(profileReport([]), null);
});

test("replyViews: relatório após o pedido de análise na estrutura, recado após o comentário do dia; erros e texto, não", () => {
  const views = replyViews([
    msg("1", "user", PROFILE_ANALYSIS_REQUEST),
    { ...msg("2", "ai", "Boa constância..."), blocks: REPORT_SECTIONS },
    msg("3", "user", PROFILE_ANALYSIS_REQUEST),
    msg("4", "ai", "Análise em texto corrido."),
    msg("5", "user", `${DAILY_COMMENT_REQUEST} O que o app observou: Água abaixo.`),
    msg("6", "ai", "Inclua uma fruta no lanche da tarde."),
    msg("7", "user", DAILY_COMMENT_REQUEST, "error"),
    msg("8", "ai", "Resposta solta."),
    msg("9", "user", PROFILE_ANALYSIS_REQUEST),
    { ...msg("10", "ai", "falhou", "error"), blocks: REPORT_SECTIONS },
    { ...msg("11", "ai", "Sem pedido antes"), blocks: REPORT_SECTIONS },
  ]);
  assert.equal(views.get("2"), "report");
  assert.equal(views.get("4"), undefined, "sem a estrutura, segue o desenho normal");
  assert.equal(views.get("6"), "daily");
  assert.equal(views.get("8"), undefined, "pedido que falhou não ganha recado");
  assert.equal(views.get("10"), undefined, "resposta com erro");
  assert.equal(views.get("11"), undefined, "só logo depois do pedido");
  assert.equal(views.size, 2);
});

test("relatório visível: calorias e números do corpo ocultos nos itens; perfil sensível perde a sugestão de peso", () => {
  const sections: ChatSection[] = [
    {
      papel: null,
      blocos: [
        text("Média de 1.800 kcal por dia e peso em 72 kg."),
        list(PROFILE_REPORT_TITLES.well, ["Registros em dia"]),
        list(PROFILE_REPORT_TITLES.attention, ["Jantar perto de 900 kcal"]),
        list(PROFILE_REPORT_TITLES.suggestions, ["Sopa de legumes no jantar"]),
        list(PROFILE_REPORT_TITLES.talk, ["Peso em 72 kg há 3 semanas"]),
        { tipo: "sugestoes" as const, itens: ["Como perder peso rápido?", "Quero ideias de lanche"] },
      ],
    },
  ];
  const hidden = visibleProfileReport(sections, {
    sensitive: false,
    allergyDetails: "",
    hideCalories: true,
    hideBodyNumbers: true,
  });
  assert.ok(hidden);
  assert.equal(hidden.summary, "Média de calorias ocultas por dia e peso em número oculto.");
  assert.deepEqual(hidden.sections[1].items, ["Jantar perto de calorias ocultas"]);
  assert.deepEqual(hidden.sections[3].items, ["Peso em número oculto há 3 semanas"]);
  assert.doesNotMatch(JSON.stringify(hidden), /kcal|72 kg/);
  const sensitive = visibleProfileReport(sections, {
    sensitive: true,
    allergyDetails: "",
    hideCalories: false,
    hideBodyNumbers: false,
  });
  assert.deepEqual(sensitive?.suggestions, ["Quero ideias de lanche"]);
  assert.equal(
    visibleProfileReport([{ papel: null, blocos: [text("Só texto.")] }], {
      sensitive: false,
      allergyDetails: "",
      hideCalories: false,
      hideBodyNumbers: false,
    }),
    null,
  );
});

test("pedido do comentário automático do dia vira aviso, com sinais e ajuste no fim do texto", () => {
  const views = messageViews([
    msg("1", "user", `${DAILY_COMMENT_REQUEST} O que o app observou nos últimos dias: Alguns dias acima da meta.`),
    msg("2", "ai", "Você tem registrado com constância. Hoje, inclua uma fruta no lanche."),
    msg("3", "user", DAILY_COMMENT_REQUEST, "error"),
    msg("4", "user", `Pergunta minha: ${DAILY_COMMENT_REQUEST}`),
  ]);
  assert.equal(views.get("1"), "daily-request");
  assert.equal(views.get("2"), undefined, "o comentário em si continua como texto");
  assert.equal(views.get("3"), undefined, "pedido que falhou fica como texto");
  assert.equal(views.get("4"), undefined, "só o início fixo identifica o pedido automático");
});
