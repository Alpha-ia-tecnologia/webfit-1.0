/**
 * Verificação manual dos esquemas estritos na OpenAI (Onda 2 · Lote 6; laudo na Onda 3 · Lote 2;
 * rótulo na Onda 4 · Lote 3).
 * NÃO faz parte do `npm test`: faz 7 chamadas pagas à Responses API e só roda com OK explícito.
 *
 *   node --import tsx scripts/strict-schema-smoke.ts
 *
 * Lê OPENAI_API_KEY e OPENAI_MODEL de .env.local (a chave nunca é impressa) e manda um pedido
 * mínimo por esquema com `strict: true`. Imprime só "nome: ok" ou "nome: <status> <código>".
 * Enquanto não rodar, a reserva em texto (erro "provider") mantém chat, dieta, foto, laudo e rótulo funcionando.
 */
import { config } from "dotenv";
import OpenAI from "openai";
import {
  CHAT_JSON_SCHEMA,
  CHAT_JSON_SCHEMA_SENSITIVE,
  DIET_JSON_SCHEMA,
  PHOTO_JSON_SCHEMA,
  EXAM_JSON_SCHEMA,
  MEAL_TEXT_JSON_SCHEMA,
  LABEL_JSON_SCHEMA,
} from "../server/graph/structured-specs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/** Rótulo impresso, nome enviado em json_schema.name (o de produção) e o esquema. */
const CASES: [string, string, Record<string, unknown>][] = [
  ["chat_blocos", "chat_blocos", CHAT_JSON_SCHEMA],
  ["chat_blocos (sensível)", "chat_blocos", CHAT_JSON_SCHEMA_SENSITIVE],
  ["dieta_v2", "dieta_v2", DIET_JSON_SCHEMA],
  ["foto_itens", "foto_itens", PHOTO_JSON_SCHEMA],
  ["exame_resultados", "exame_resultados", EXAM_JSON_SCHEMA],
  ["refeicao_texto", "refeicao_texto", MEAL_TEXT_JSON_SCHEMA],
  ["rotulo_leitura", "rotulo_leitura", LABEL_JSON_SCHEMA],
];
/** Modelos com raciocínio contam os tokens internos neste teto. */
const MAX_OUTPUT_TOKENS = 4000;
const TIMEOUT_MS = 60_000;

async function check(
  client: OpenAI,
  model: string,
  [label, name, schema]: [string, string, Record<string, unknown>],
): Promise<boolean> {
  try {
    const response = await client.responses.create(
      {
        model,
        instructions:
          "Teste técnico de formato: responda apenas com um exemplo mínimo e válido do JSON do esquema, em português.",
        input: "Gere o menor exemplo válido.",
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Como no app (server/model.ts): o provedor não guarda as respostas.
        store: false,
        text: { format: { type: "json_schema", name, strict: true, schema } },
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
    if (response.status !== "completed") {
      console.log(`${label}: ${response.status} ${response.incomplete_details?.reason ?? ""}`.trim());
      return false;
    }
    console.log(`${label}: ok`);
    return true;
  } catch (error) {
    const e = error as { status?: number; code?: string | null };
    console.log(`${label}: ${e.status ?? "erro"} ${e.code ?? "sem código"}`);
    return false;
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || apiKey.startsWith("MY_") || !model) {
    console.log("OPENAI_API_KEY e OPENAI_MODEL precisam estar em .env.local.");
    process.exitCode = 1;
    return;
  }
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  let ok = true;
  for (const item of CASES) ok = (await check(client, model, item)) && ok;
  process.exitCode = ok ? 0 : 1;
}

await main();
