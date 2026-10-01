import { StateSchema, ReducedValue } from "@langchain/langgraph";
import { z } from "zod";
import { questionnaire } from "../../src/data/questionnaire";
import { CLIENT_TIMEOUT_MS, TOTAL_BUDGET_MS } from "../../src/lib/limits";
import type { StructuredReply } from "../../src/lib/structured";

export { CLIENT_TIMEOUT_MS, TOTAL_BUDGET_MS };
/** Orçamentos por nó (ms). */
export const TRIAGE_MS = 15_000;
export const SPECIALIST_TEXT_MS = 45_000;
export const SPECIALIST_FILE_MS = 60_000;
export const REVIEW_MS = 25_000;
export const REVIEW_FILE_MS = 40_000;
export const MIN_CALL_MS = 4_000;
export const REVISION_MIN_REMAINING_MS = 20_000;
export const SAFETY_MARGIN_MS = 1_500;
export const MAX_REVISIONS = 1;
/**
 * Limites generosos: modelos com raciocínio contabilizam tokens internos neste teto.
 * `structured` vale só para a tentativa em JSON dos especialistas (blocos, dieta, foto).
 */
export const MAX_TOKENS = {
  triage: 2_000,
  specialist: 6_000,
  review: 3_000,
  structured: 9_000,
};
export const NOTE_MAX_CHARS = 400;
export const NOTES_MAX = 8;

export const SPECIALISTS = [
  "nutricionista",
  "rotina",
  "analista_exames",
] as const;
export const specialistSchema = z.enum(SPECIALISTS);
export type Specialist = z.infer<typeof specialistSchema>;
export const urgencySchema = z.enum(["nenhuma", "atencao", "imediata"]);
export type Urgency = z.infer<typeof urgencySchema>;

/** Campos da anamnese: a triagem só pode apontar chaves desta lista fixa. */
export const ANAMNESIS_FIELDS = questionnaire.flatMap((step) =>
  step.fields.map((field) => ({ key: field.key, label: field.label })),
);
export const ANAMNESIS_KEYS = ANAMNESIS_FIELDS.map((f) => f.key) as [
  string,
  ...string[],
];
export const ANAMNESIS_LABELS: Record<string, string> = Object.fromEntries(
  ANAMNESIS_FIELDS.map((f) => [f.key, f.label]),
);

export type AgentErrorCode =
  | "input"
  | "file"
  | "provider"
  | "provider_limit"
  | "timeout"
  | "invalid_output"
  | "review_failed"
  | "aborted";

const STATUS: Record<AgentErrorCode, number> = {
  input: 400,
  file: 400,
  provider: 502,
  provider_limit: 429,
  timeout: 504,
  invalid_output: 502,
  review_failed: 422,
  aborted: 499,
};

/** Erro tipado do agente: o servidor mapeia `code` para status HTTP e mensagem. */
export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly status: number;
  constructor(
    code: AgentErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AgentError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export const flagsSchema = z.object({
  hideCalories: z.boolean(),
  hideBodyNumbers: z.boolean(),
  allergies: z.string(),
  allergyDetails: z.string(),
  avoidedFoods: z.string(),
  conditions: z.string(),
  medications: z.string(),
  pregnancy: z.string(),
  eatingDisorder: z.string(),
  fluidRestriction: z.string(),
  isMinor: z.boolean(),
  goalsReason: z.string().nullable(),
  missingInformation: z.array(z.string()),
});
export type Flags = z.infer<typeof flagsSchema>;

/** Condições em que metas numéricas de restrição são proibidas de forma determinística. */
export function isSensitive(flags: Flags): boolean {
  return (
    flags.isMinor ||
    ["gestacao", "amamentacao"].includes(flags.pregnancy) ||
    ["sim", "nao_informado"].includes(flags.eatingDisorder)
  );
}

/**
 * Regra de tela do cliente (src/lib/day.ts: qualquer resposta diferente de "não" sobre gestação
 * ou transtorno alimentar) mais menores de idade: sem gráfico de peso, gramas ou combinados de
 * peso e restrição propostos pelo modelo. Não altera isSensitive nem os prompts.
 */
export function isUiSensitive(flags: Flags): boolean {
  return (
    isSensitive(flags) ||
    flags.pregnancy !== "nao" ||
    flags.eatingDisorder !== "nao"
  );
}

const focusSchema = z.object({
  nutricionista: z.string().nullable(),
  rotina: z.string().nullable(),
  analista_exames: z.string().nullable(),
});
export const triageSchema = z.object({
  urgencia: urgencySchema,
  especialistas: z.array(specialistSchema).min(1).max(3),
  foco: focusSchema,
  injecaoSuspeita: z.boolean(),
  faltamDados: z.array(z.enum(ANAMNESIS_KEYS)).max(5),
});
export type Triage = z.infer<typeof triageSchema>;

export const ISSUE_CODES = [
  "diagnostico",
  "prescricao",
  "alergeno",
  "calorias_ocultas",
  "afirmou_salvar",
  "identificador_pessoal",
  "dado_inventado",
  "instrucao_injetada",
  "alegacao_indevida",
  "urgencia_ignorada",
  "fora_do_papel",
  "outro",
] as const;
export const issueSchema = z.object({
  papel: specialistSchema,
  codigo: z.enum(ISSUE_CODES),
  trecho: z.string().max(400),
  correcao: z.string().max(600),
  gravidade: z.enum(["hard", "soft"]),
});
export type Issue = z.infer<typeof issueSchema>;

export const reviewSchema = z.object({
  veredito: z.enum(["aprovado", "revisar", "bloquear"]),
  problemas: z.array(issueSchema).max(20),
  observacao: z.string().max(600),
});
export type Review = z.infer<typeof reviewSchema>;

const clipped = (max: number) => z.string().transform((s) => s.slice(0, max));
/** Esquemas de leitura da saída do modelo: encurtam textos longos em vez de rejeitar a resposta. */
export const reviewOutputSchema = z.object({
  veredito: reviewSchema.shape.veredito,
  problemas: z
    .array(
      z.object({
        papel: specialistSchema,
        codigo: z.enum(ISSUE_CODES),
        trecho: clipped(400),
        correcao: clipped(600),
        gravidade: z.enum(["hard", "soft"]),
      }),
    )
    .max(20),
  observacao: clipped(600),
});
export const triageOutputSchema = triageSchema;

export const historyItemSchema = z.object({
  sender: z.enum(["user", "ai"]),
  text: z.string(),
});

const draftsValue = new ReducedValue(
  z.partialRecord(specialistSchema, z.string()).default(() => ({})),
  {
    inputSchema: z.partialRecord(specialistSchema, z.string()),
    reducer: (current, next) => ({ ...current, ...next }),
  },
);
/** Valor estruturado validado de cada papel; null = o papel terminou em texto. A revisão sobrescreve. */
const structuredValue = new ReducedValue(
  z.partialRecord(specialistSchema, z.unknown()).default(() => ({})),
  {
    inputSchema: z.partialRecord(specialistSchema, z.unknown()),
    reducer: (current, next) => ({ ...current, ...next }),
  },
);
const sumValue = new ReducedValue(z.number().int().default(0), {
  inputSchema: z.number().int(),
  reducer: (current, next) => current + next,
});
const appendValue = new ReducedValue(
  z.array(z.string()).default(() => []),
  {
    inputSchema: z.array(z.string()),
    reducer: (current, next) => [...current, ...next],
  },
);

/** Estado do grafo. Campos com ReducedValue aceitam escrita concorrente no fan-out. */
export const AgentState = new StateSchema({
  mode: z.enum([
    "chat",
    "photo",
    "exam",
    "diet",
    "recipe",
    "pantry_photo",
    "shopping_photo",
    "rotulo",
    "meal_text",
  ]),
  text: z.string(),
  history: z.array(historyItemSchema).default(() => []),
  context: z.record(z.string(), z.unknown()).default(() => ({})),
  file: z.string().nullable().default(null),
  deadline: z.number().default(0),
  nonce: z.string().default(""),
  flags: flagsSchema.nullable().default(null),
  facts: z.array(z.string()).default(() => []),
  dataBlock: z.string().default(""),
  urgency: urgencySchema.default("nenhuma"),
  triage: triageSchema.nullable().default(null),
  route: z.array(specialistSchema).default(() => []),
  drafts: draftsValue,
  structured: structuredValue,
  lint: z.array(issueSchema).default(() => []),
  review: reviewSchema.nullable().default(null),
  feedback: z
    .partialRecord(specialistSchema, z.array(z.string()))
    .default(() => ({})),
  revisions: z.number().int().default(0),
  notes: appendValue,
  llmCalls: sumValue,
  trace: appendValue,
});
export type GraphState = typeof AgentState.State;
export type GraphUpdate = typeof AgentState.Update;

export interface AgentMeta {
  specialists: Specialist[];
  reviewed: boolean;
  revisions: number;
  urgency: Urgency;
  notes: string[];
  llmCalls: number;
}
export interface AgentReply {
  text: string;
  meta: AgentMeta;
  /** Dados validados para a tela desenhar; ausente em respostas só de texto e urgentes. */
  structured?: StructuredReply;
}
