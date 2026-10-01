import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_OFFLINE,
  AGENT_STAGES,
  MAX_LINE_CHARS,
  createLineSplitter,
  createStreamCollector,
  parseJsonSafe,
  parseStreamLine,
  readAgentStream,
  stageForNode,
  stageLabel,
  stageMode,
  type AgentProgress,
} from "../src/lib/agent-stream";

const line = (event: unknown) => `${JSON.stringify(event)}\n`;
const reply = { text: "Olá", meta: { reviewed: true } };

test("divide o fluxo em linhas mesmo com pedaços cortados no meio", () => {
  const lines: string[] = [];
  const splitter = createLineSplitter((l) => lines.push(l));
  splitter.push('{"a":');
  splitter.push('1}\n{"b"');
  splitter.push(":2}\n\n");
  splitter.push('{"c":3}');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  splitter.end();
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}']);
});

test("linhas inválidas ou fora do contrato são ignoradas", () => {
  assert.equal(parseStreamLine("não é json"), null);
  assert.equal(
    parseStreamLine(JSON.stringify({ type: "stage", stage: "outra", attempt: 1 })),
    null,
  );
  assert.equal(
    parseStreamLine(JSON.stringify({ type: "error", status: 200, error: "x" })),
    null,
  );
  assert.deepEqual(
    parseStreamLine(JSON.stringify({ type: "stage", stage: "revisao", attempt: 1 })),
    { type: "stage", stage: "revisao", attempt: 1 },
  );
});

test("coleta etapas na ordem e devolve o result bruto", () => {
  const seen: AgentProgress[] = [];
  const collector = createStreamCollector((p) => seen.push(p));
  collector.push(line({ type: "stage", stage: "contexto", attempt: 1 }));
  collector.push(line({ type: "stage", stage: "especialista", attempt: 1 }));
  collector.push(line({ type: "result", reply }));
  collector.push(line({ type: "stage", stage: "revisao", attempt: 1 }));
  assert.deepEqual(collector.finish(), reply);
  assert.deepEqual(
    seen.map((p) => p.stage),
    ["contexto", "especialista"],
    "nada depois do result é considerado",
  );
});

test("erro do servidor vira exceção com a mensagem segura; fluxo sem result também falha", () => {
  const failing = createStreamCollector(() => undefined);
  failing.push(line({ type: "error", status: 504, error: "Tempo esgotado." }));
  assert.throws(() => failing.finish(), /Tempo esgotado\./);
  const empty = createStreamCollector(() => undefined);
  empty.push(line({ type: "stage", stage: "contexto", attempt: 1 }));
  assert.throws(() => empty.finish(), /formato inesperado/);
});

test("lê um ReadableStream com caracteres acentuados divididos entre pedaços", async () => {
  const bytes = new TextEncoder().encode(
    line({ type: "stage", stage: "seguranca", attempt: 1 }) +
      line({ type: "result", reply: { text: "Refeição pronta" } }),
  );
  const cut = bytes.indexOf(0xc3) + 1; // no meio do "ç"
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
  const seen: AgentProgress[] = [];
  const result = await readAgentStream(body, (p) => seen.push(p));
  assert.deepEqual(result, { text: "Refeição pronta" });
  assert.deepEqual(seen, [{ stage: "seguranca", attempt: 1 }]);
});

test("nós do grafo viram etapas; nós internos não aparecem", () => {
  assert.equal(stageForNode("preparar"), "contexto");
  assert.equal(stageForNode("triagem"), "contexto");
  assert.equal(stageForNode("rotina"), "especialista");
  assert.equal(stageForNode("guarda"), "seguranca");
  assert.equal(stageForNode("revisor"), "revisao");
  assert.equal(stageForNode("urgencia"), null);
  assert.equal(stageForNode("finalizar"), null);
});

test("rótulos das etapas são curtos, mudam na reescrita e nunca citam calorias", () => {
  assert.equal(stageLabel("especialista", "diet"), "Montando suas refeições");
  assert.equal(stageLabel("especialista", "chat", 2), "Ajustando após a revisão");
  assert.equal(stageLabel("contexto", "diet"), "Lendo sua anamnese");
  for (const mode of ["diet", "chat", "exam", "recipe"] as const)
    for (const stage of AGENT_STAGES)
      assert.doesNotMatch(stageLabel(stage, mode), /kcal|calori/i);
});

test("linha sem fim acima do teto interrompe a leitura em vez de crescer na memória", () => {
  const splitter = createLineSplitter(() => undefined);
  assert.throws(
    () => splitter.push("x".repeat(MAX_LINE_CHARS + 1)),
    /formato inesperado/,
  );
});

/** Corpo com os pedaços dados; `failAfter` simula a rede caindo depois deles. */
const streamOf = (chunks: string[], failAfter = false) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!failAfter) controller.close();
    },
    pull(controller) {
      if (failAfter) controller.error(new TypeError("network error"));
    },
  });
};

test("parseJsonSafe devolve o JSON válido e null para HTML ou corpo vazio", () => {
  assert.deepEqual(parseJsonSafe('{"error":"Limite atingido."}'), {
    error: "Limite atingido.",
  });
  assert.equal(parseJsonSafe("<!doctype html><title>502</title>"), null);
  assert.equal(parseJsonSafe(""), null);
});

test("queda de rede no meio do corpo vira a mensagem de conexão", async () => {
  const seen: AgentProgress[] = [];
  const body = streamOf(
    [line({ type: "stage", stage: "contexto", attempt: 1 })],
    true,
  );
  await assert.rejects(
    readAgentStream(body, (p) => seen.push(p)),
    { message: AGENT_OFFLINE },
  );
  assert.deepEqual(seen, [{ stage: "contexto", attempt: 1 }]);
});

test("teto de linha e erro do servidor mantêm as próprias mensagens na leitura", async () => {
  const tooLong = streamOf(["x".repeat(MAX_LINE_CHARS + 1)]);
  await assert.rejects(
    readAgentStream(tooLong, () => undefined),
    { message: "Resposta do servidor em formato inesperado." },
  );
  const failed = streamOf([
    line({ type: "error", status: 504, error: "Tempo esgotado." }),
  ]);
  await assert.rejects(
    readAgentStream(failed, () => undefined),
    { message: "Tempo esgotado." },
  );
});

test("descrição de refeição: etapa própria, rótulos de itens e sem calorias", () => {
  assert.equal(stageMode("meal_text"), "meal_text");
  assert.equal(stageLabel("especialista", "meal_text"), "Organizando os itens");
  assert.equal(stageLabel("revisao", "meal_text"), "Conferindo os itens");
  assert.equal(stageLabel("contexto", "meal_text"), "Lendo seu contexto");
  for (const stage of AGENT_STAGES) assert.doesNotMatch(stageLabel(stage, "meal_text"), /kcal|calori/i);
});
