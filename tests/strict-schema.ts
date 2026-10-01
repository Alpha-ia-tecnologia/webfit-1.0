import { z } from "zod";

/**
 * Ajudantes de teste para esquemas JSON estritos (OpenAI strict / DeepSeek). Não é arquivo de
 * teste: os testes de saída estruturada (e os do Lote 7) importam daqui.
 */

type Json = Record<string, unknown>;
const FORBIDDEN = ["maxLength", "minLength", "default", "oneOf", "allOf", "$ref"];

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);
const typesOf = (node: Json): unknown[] =>
  Array.isArray(node.type) ? node.type : [node.type];

function walk(node: unknown, path: string): string[] {
  if (!isObject(node)) return [];
  const forbidden = FORBIDDEN.filter((key) => key in node).map(
    (key) => `${path}: "${key}" não é aceito no modo estrito`,
  );
  const types = typesOf(node);
  const properties = isObject(node.properties) ? node.properties : {};
  const objectProblems = types.includes("object")
    ? [
        ...(node.additionalProperties === false
          ? []
          : [`${path}: objeto sem additionalProperties:false`]),
        ...(JSON.stringify(Object.keys(properties).sort()) ===
        JSON.stringify([...((node.required as string[] | undefined) ?? [])].sort())
          ? []
          : [`${path}: required deve listar exatamente as propriedades`]),
      ]
    : [];
  const arrayProblems =
    types.includes("array") && !("items" in node) ? [`${path}: array sem items`] : [];
  const children: [string, unknown][] = [
    ...Object.entries(properties).map(([key, value]): [string, unknown] => [
      `${path}.${key}`,
      value,
    ]),
    ...("items" in node ? [[`${path}[]`, node.items] as [string, unknown]] : []),
    ...(Array.isArray(node.anyOf) ? node.anyOf : []).map(
      (value, i): [string, unknown] => [`${path}|${i}`, value],
    ),
  ];
  return [
    ...forbidden,
    ...objectProblems,
    ...arrayProblems,
    ...children.flatMap(([childPath, child]) => walk(child, childPath)),
  ];
}

/**
 * Problemas que o modo estrito recusaria: raiz que não é objeto, objeto sem
 * additionalProperties:false, required diferente das chaves, array sem items e palavras-chave
 * não aceitas (maxLength, minLength, default, oneOf, allOf, $ref). Vazio = esquema estrito.
 */
export function strictProblems(schema: Json): string[] {
  const root = schema.type === "object" ? [] : ['$: a raiz deve ter type "object"'];
  return [...root, ...walk(schema, "$")];
}

export interface ParityResult {
  sample: unknown;
  /** O validador gerado do esquema JSON (como o DeepSeek valida) aceita a amostra. */
  json: boolean;
  /** O esquema zod de leitura aceita a amostra. */
  zod: boolean;
}

/** Compara, amostra a amostra, o esquema JSON (via z.fromJSONSchema) e o zod de leitura. */
export function parity(
  jsonSchema: Json,
  schema: z.ZodType,
  samples: readonly unknown[],
): ParityResult[] {
  const validator = z.fromJSONSchema(
    jsonSchema as Parameters<typeof z.fromJSONSchema>[0],
  );
  return samples.map((sample) => ({
    sample,
    json: validator.safeParse(sample).success,
    zod: schema.safeParse(sample).success,
  }));
}
