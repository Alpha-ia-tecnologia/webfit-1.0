import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentContextChips,
  chatDayLabel,
  chatSuggestions,
  describeAgentMetaFull,
  describeAgentMetaShort,
  messageViews,
  PROFILE_ANALYSIS_REQUEST,
  providerLabel,
} from "../src/lib/agent-presentation";
import { DAILY_COMMENT_REQUEST } from "../src/lib/daily-comment";
import { DIET_PLAN_REQUEST } from "../src/lib/diet";
import type { ChatMessage } from "../src/types";
import { stateFixture } from "./fixtures";

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

test("pedido de análise do perfil vira aviso; a resposta segue como texto ou blocos", () => {
  const views = messageViews([
    msg("1", "user", PROFILE_ANALYSIS_REQUEST),
    msg("2", "ai", "1) O que está indo bem: ..."),
    msg("3", "user", PROFILE_ANALYSIS_REQUEST, "error"),
  ]);
  assert.equal(views.get("1"), "profile-request");
  assert.equal(views.get("2"), undefined, "a análise em si continua como texto");
  assert.equal(views.get("3"), undefined, "pedido que falhou fica como texto, com o reenvio");
});

test("pedido de análise do perfil cruza anamnese, registros e preferências sem pedir números ou dose", () => {
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
    /1\) o que está indo bem/,
    /2\) pontos de atenção/,
    /3\) sugestões práticas de refeições/,
    /4\) o que conversar com o meu profissional de saúde/,
  ])
    assert.match(PROFILE_ANALYSIS_REQUEST, topic);
  assert.match(PROFILE_ANALYSIS_REQUEST, /não comente nem sugira doses/);
  assert.doesNotMatch(PROFILE_ANALYSIS_REQUEST, /kcal|caloria/i);
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
