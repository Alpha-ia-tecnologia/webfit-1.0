import {
  BLOCK_MEALS,
  CHAT_METRICS,
  TEXT_BLOCK_MAX,
  TIME_PATTERN,
  chatOutputSchema,
  renderChatText,
  sanitizeBlocks,
  type ChatOutput,
  type PlannedItem,
} from "../../src/lib/agent-blocks";
import {
  DIET_SLOTS,
  dietPlanV2Schema,
  renderDietText,
  sanitizeDietPlan,
  type DietPlanV2,
} from "../../src/lib/diet-plan";
import {
  DATE_PATTERN,
  EXAM_ILLEGIBLE_MAX,
  EXAM_NOTES_MAX,
  EXAM_QUESTIONS_MAX,
  EXAM_ROWS_MAX,
  examResultSchema,
  renderExamText,
  sanitizeExamResult,
  type ExamResult,
} from "../../src/lib/exam-result";
import {
  LABEL_CANDIDATES_MAX,
  LABEL_PROBLEMS,
  labelReadSchema,
  renderLabelText,
  sanitizeLabelRead,
  type LabelRead,
} from "../../src/lib/label-read";
import {
  MEAL_TEXT_DOUBTS_MAX,
  MEAL_TEXT_ITEMS_MAX,
  MEAL_TEXT_UNITS,
  mealTextSchema,
  renderMealText,
  sanitizeMealText,
  type MealText,
} from "../../src/lib/meal-text";
import {
  CONFIDENCE,
  platePhotoSchema,
  renderPhotoText,
  type PlatePhoto,
} from "../../src/lib/plate-photo";
import type { StructuredReply } from "../../src/lib/structured";
import type { RoleResult, StructuredField, StructuredSpec } from "../structured";
import { recipeStructuredSpec } from "../recipes";
import {
  CHAT_JSON_ADDENDUM,
  DIET_JSON_ADDENDUM,
  EXAM_JSON_ADDENDUM,
  MEAL_TEXT_JSON_ADDENDUM,
  PHOTO_JSON_ADDENDUM,
  ROTULO_JSON_ADDENDUM,
} from "./prompts";
import { isUiSensitive, type Flags, type GraphState } from "./state";

/**
 * Esquemas estritos (OpenAI strict / validação DeepSeek) e especificações da saída estruturada
 * por modo. Todo objeto tem additionalProperties:false e required completo; opcional = tipo com
 * "null"; sem maxLength (o recorte fica no zod). Os esquemas são constantes: o validador do
 * DeepSeek é guardado por identidade do objeto.
 */

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const time = { type: "string", pattern: TIME_PATTERN };
const stringArray = (minItems: number, maxItems: number) => ({
  type: "array",
  ...(minItems ? { minItems } : {}),
  maxItems,
  items: str,
});
const plannedItemProps = {
  alimento: str,
  medidaCaseira: str,
  gramas: { type: ["number", "null"] },
};
const plannedItem = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(plannedItemProps),
  properties: plannedItemProps,
};
const plannedItems = { type: "array", minItems: 1, maxItems: 8, items: plannedItem };
const meal = { type: "string", enum: [...BLOCK_MEALS] };
const block = (tipo: string, props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["tipo", ...Object.keys(props)],
  properties: { tipo: { type: "string", enum: [tipo] }, ...props },
});
const mealOption = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "emoji", "minutos", "itens"],
  properties: {
    nome: str,
    emoji: str,
    minutos: { type: ["integer", "null"] },
    itens: plannedItems,
  },
};

/** Esquema do chat com as métricas de gráfico permitidas (perfil sensível: sem peso_8s). */
export function chatJsonSchema(metrics: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["blocos"],
    properties: {
      blocos: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          anyOf: [
            block("texto", { texto: str }),
            block("lista", {
              titulo: nullableStr,
              ordenada: { type: "boolean" },
              itens: stringArray(1, 8),
            }),
            block("opcoes_refeicao", {
              titulo: nullableStr,
              refeicao: meal,
              opcoes: { type: "array", minItems: 1, maxItems: 3, items: mealOption },
            }),
            block("grafico", { metrica: { type: "string", enum: [...metrics] } }),
            block("acao", {
              acao: { type: "string", enum: ["criar_habito"] },
              titulo: str,
              horario: time,
            }),
            block("acao", {
              acao: { type: "string", enum: ["registrar_refeicao"] },
              refeicao: meal,
              itens: plannedItems,
            }),
            block("sugestoes", { itens: stringArray(1, 3) }),
          ],
        },
      },
    },
  };
}
export const CHAT_JSON_SCHEMA = chatJsonSchema(CHAT_METRICS);
export const CHAT_JSON_SCHEMA_SENSITIVE = chatJsonSchema(
  CHAT_METRICS.filter((m) => m !== "peso_8s"),
);

const dietItemProps = { ...plannedItemProps, trocas: stringArray(0, 3) };
export const DIET_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "refeicoes", "dicas", "perguntas"],
  properties: {
    resumo: {
      type: "object",
      additionalProperties: false,
      required: ["destaques"],
      properties: { destaques: stringArray(1, 3) },
    },
    refeicoes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "horario", "itens"],
        properties: {
          slot: { type: "string", enum: [...DIET_SLOTS] },
          horario: { type: ["string", "null"], pattern: TIME_PATTERN },
          itens: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: Object.keys(dietItemProps),
              properties: dietItemProps,
            },
          },
        },
      },
    },
    dicas: stringArray(0, 4),
    perguntas: stringArray(0, 3),
  },
};

export const PHOTO_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items", "uncertainties"],
  properties: {
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "searchTerms", "confidence", "allergyMatch"],
        properties: {
          name: str,
          searchTerms: stringArray(1, 3),
          confidence: { type: "string", enum: [...CONFIDENCE] },
          allergyMatch: { type: "boolean" },
        },
      },
    },
    uncertainties: stringArray(0, 4),
  },
};

const examRowProps = {
  grupo: nullableStr,
  nome: str,
  valor: str,
  unidade: nullableStr,
  referencia: nullableStr,
  marcacao: nullableStr,
};
export const EXAM_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["data", "resultados", "ilegiveis", "perguntas", "observacoes"],
  properties: {
    data: { type: ["string", "null"], pattern: DATE_PATTERN },
    resultados: {
      type: "array",
      maxItems: EXAM_ROWS_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(examRowProps),
        properties: examRowProps,
      },
    },
    ilegiveis: stringArray(0, EXAM_ILLEGIBLE_MAX),
    perguntas: stringArray(0, EXAM_QUESTIONS_MAX),
    observacoes: stringArray(0, EXAM_NOTES_MAX),
  },
};

/** Descrição de refeição (DIARIO-07): itens citados; quantidade só quando dita (o zod anula o resto). */
export const MEAL_TEXT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items", "uncertainties"],
  properties: {
    items: {
      type: "array",
      maxItems: MEAL_TEXT_ITEMS_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "searchTerms", "quantityText", "quantity", "unit", "allergyMatch"],
        properties: {
          name: str,
          searchTerms: stringArray(1, 3),
          quantityText: nullableStr,
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"], enum: [...MEAL_TEXT_UNITS, null] },
          allergyMatch: { type: "boolean" },
        },
      },
    },
    uncertainties: stringArray(0, MEAL_TEXT_DOUBTS_MAX),
  },
};

export const LABEL_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "candidatos", "problemas"],
  properties: {
    nome: nullableStr,
    candidatos: {
      type: "array",
      maxItems: LABEL_CANDIDATES_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mg", "ml", "trecho", "confianca"],
        properties: {
          mg: { type: "number" },
          ml: { type: "number" },
          trecho: str,
          confianca: { type: "string", enum: [...CONFIDENCE] },
        },
      },
    },
    problemas: { type: "array", maxItems: LABEL_PROBLEMS.length, items: { type: "string", enum: [...LABEL_PROBLEMS] } },
  },
};

const field = (text: string, kind: StructuredField["kind"]): StructuredField => ({ text, kind });
const plannedFields = (items: readonly PlannedItem[]) =>
  items.flatMap((i) => [field(i.alimento, "food"), field(i.medidaCaseira, "card")]);

/** Campos do chat que a guarda examina (texto corrido e sugestões ficam com a guarda de texto e a limpeza). */
function chatFields(value: ChatOutput): StructuredField[] {
  return value.blocos.flatMap((b): StructuredField[] => {
    if (b.tipo === "opcoes_refeicao")
      return [
        ...(b.titulo ? [field(b.titulo, "name")] : []),
        ...b.opcoes.flatMap((o) => [field(o.nome, "name"), ...plannedFields(o.itens)]),
      ];
    if (b.tipo === "acao")
      return b.acao === "criar_habito" ? [field(b.titulo, "habit")] : plannedFields(b.itens);
    if (b.tipo === "lista")
      return [
        ...(b.titulo ? [field(b.titulo, "prose")] : []),
        ...b.itens.map((item) => field(item, "prose")),
      ];
    return [];
  });
}

/** Seções do chat: papel só com mais de um especialista; papel em texto vira um bloco "texto". */
function chatReply(results: readonly RoleResult<ChatOutput>[]): StructuredReply | null {
  if (!results.some((r) => r.value)) return null;
  if (results.some((r) => !r.value && r.draft.length > TEXT_BLOCK_MAX)) return null;
  return {
    kind: "chat",
    sections: results.map((r) => ({
      papel: results.length > 1 ? r.role : null,
      blocos: r.value?.blocos ?? [{ tipo: "texto", texto: r.draft }],
    })),
  };
}

function chatSpec(jsonSchema: Record<string, unknown>): StructuredSpec<ChatOutput> {
  return {
    kind: "chat",
    name: "chat_blocos",
    jsonSchema,
    schema: chatOutputSchema,
    addendum: CHAT_JSON_ADDENDUM,
    sanitize: (value, ctx) => {
      const blocos = sanitizeBlocks(value.blocos, {
        role: ctx.role,
        sensitive: isUiSensitive(ctx.flags),
        allergyDetails: ctx.flags.allergyDetails,
      });
      return blocos ? { blocos } : null;
    },
    render: (value) => renderChatText(value.blocos),
    fields: chatFields,
    toReply: chatReply,
  };
}
export const CHAT_SPEC = chatSpec(CHAT_JSON_SCHEMA);
export const CHAT_SPEC_SENSITIVE = chatSpec(CHAT_JSON_SCHEMA_SENSITIVE);

const nutritionistValue = <T>(results: readonly RoleResult<T>[]): T | null =>
  results.find((r) => r.role === "nutricionista")?.value ?? null;

export const DIET_SPEC: StructuredSpec<DietPlanV2> = {
  kind: "diet",
  name: "dieta_v2",
  jsonSchema: DIET_JSON_SCHEMA,
  schema: dietPlanV2Schema,
  addendum: DIET_JSON_ADDENDUM,
  sanitize: (value, ctx) => sanitizeDietPlan(value, { sensitive: isUiSensitive(ctx.flags) }),
  render: renderDietText,
  fields: (plan) => [
    ...plan.resumo.destaques.map((d) => field(d, "prose")),
    ...plan.refeicoes.flatMap((m) =>
      m.itens.flatMap((i) => [
        field(i.alimento, "food"),
        field(i.medidaCaseira, "card"),
        ...i.trocas.map((t) => field(t, "food")),
      ]),
    ),
    ...plan.dicas.map((d) => field(d, "prose")),
    ...plan.perguntas.map((p) => field(p, "prose")),
  ],
  toReply: (results) => {
    const plan = nutritionistValue(results);
    return plan ? { kind: "diet", plan } : null;
  },
};

export const PHOTO_SPEC: StructuredSpec<PlatePhoto> = {
  kind: "photo",
  name: "foto_itens",
  jsonSchema: PHOTO_JSON_SCHEMA,
  schema: platePhotoSchema,
  addendum: PHOTO_JSON_ADDENDUM,
  render: renderPhotoText,
  fields: (draft) => [
    ...draft.items.flatMap((item) => [
      field(item.name, "card"),
      ...item.searchTerms.map((t) => field(t, "card")),
    ]),
    ...draft.uncertainties.map((u) => field(u, "card")),
  ],
  toReply: (results) => {
    const draft = nutritionistValue(results);
    return draft ? { kind: "photo", draft } : null;
  },
};

export const EXAM_SPEC: StructuredSpec<ExamResult> = {
  kind: "exam",
  name: "exame_resultados",
  jsonSchema: EXAM_JSON_SCHEMA,
  schema: examResultSchema,
  addendum: EXAM_JSON_ADDENDUM,
  sanitize: (value) => sanitizeExamResult(value),
  render: renderExamText,
  // Transcrição do laudo: a guarda de texto (sobre o texto renderizado) e o revisor com o arquivo
  // conferem tudo; as regras de alergênico e de número nutricional dariam falso positivo
  // ("IgE amendoim", "Proteínas totais").
  fields: () => [],
  toReply: (results) => {
    const result = results.find((r) => r.role === "analista_exames")?.value ?? null;
    return result ? { kind: "exam", result } : null;
  },
};

export const MEAL_TEXT_SPEC: StructuredSpec<MealText> = {
  kind: "meal_text",
  name: "refeicao_texto",
  jsonSchema: MEAL_TEXT_JSON_SCHEMA,
  schema: mealTextSchema,
  addendum: MEAL_TEXT_JSON_ADDENDUM,
  sanitize: (value) => sanitizeMealText(value),
  render: renderMealText,
  // O que a pessoa já comeu: alérgeno relatado não é sugestão (a tela marca "Possível alérgeno" e desmarca);
  // "card" dispensa a regra de alergênico, mas números de calorias/macros continuam barrados.
  fields: (d) => [
    ...d.items.flatMap((i) => [
      field(i.name, "card"),
      ...i.searchTerms.map((t) => field(t, "card")),
      ...(i.quantityText ? [field(i.quantityText, "card")] : []),
    ]),
    ...d.uncertainties.map((u) => field(u, "card")),
  ],
  toReply: (results) => {
    const draft = nutritionistValue(results);
    return draft ? { kind: "meal_text", draft } : null;
  },
};

export const ROTULO_SPEC: StructuredSpec<LabelRead> = {
  kind: "rotulo",
  name: "rotulo_leitura",
  jsonSchema: LABEL_JSON_SCHEMA,
  schema: labelReadSchema,
  addendum: ROTULO_JSON_ADDENDUM,
  sanitize: (value) => sanitizeLabelRead(value),
  render: renderLabelText,
  // Transcrição do rótulo: a limpeza exige os números no trecho e o revisor confere tudo contra a foto.
  fields: () => [],
  toReply: (results) => {
    const label = results.find((r) => r.role === "analista_exames")?.value ?? null;
    return label ? { kind: "rotulo", label } : null;
  },
};

/** Especificação sem o tipo do valor: o valor sempre vem de spec.schema, então render/fields o aceitam. */
export type AnyStructuredSpec = StructuredSpec<unknown>;
export const eraseSpec = <T>(spec: StructuredSpec<T>): AnyStructuredSpec =>
  spec as unknown as AnyStructuredSpec;

/** Monta a especificação do modo; `context` é o contexto do pedido (ex.: receitas com a despensa). */
export type SpecFactory = (
  flags: Flags,
  context: Record<string, unknown>,
) => AnyStructuredSpec | null;

/**
 * Modos com saída estruturada: chat, dieta, foto do prato, receitas, laudo de exame (Onda 3 ·
 * Lote 2), descrição de refeição (Onda 4 · L4) e leitura de rótulo (Onda 4 · Lote 3). Despensa
 * por foto segue só em texto.
 * Receitas (Lote 7) montam o esquema com a despensa e os básicos do pedido; sem despensa
 * válida não há especificação e o especialista responde em texto.
 * Números do corpo ocultos (ESPACO-13) usam o esquema do chat sem o gráfico de peso.
 */
export const STRUCTURED_SPECS: Partial<Record<GraphState["mode"], SpecFactory>> = {
  chat: (flags) =>
    eraseSpec(isUiSensitive(flags) || flags.hideBodyNumbers ? CHAT_SPEC_SENSITIVE : CHAT_SPEC),
  diet: () => eraseSpec(DIET_SPEC),
  photo: () => eraseSpec(PHOTO_SPEC),
  exam: () => eraseSpec(EXAM_SPEC),
  meal_text: () => eraseSpec(MEAL_TEXT_SPEC),
  rotulo: () => eraseSpec(ROTULO_SPEC),
  recipe: (flags, context) => {
    const spec = recipeStructuredSpec(flags, context);
    return spec ? eraseSpec(spec) : null;
  },
};

/** Especificação estruturada do modo, ou null (o especialista responde só em texto). */
export function specFor(
  mode: GraphState["mode"],
  flags: Flags,
  context: Record<string, unknown> = {},
): AnyStructuredSpec | null {
  return STRUCTURED_SPECS[mode]?.(flags, context) ?? null;
}
