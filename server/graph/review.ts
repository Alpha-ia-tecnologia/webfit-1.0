import { Send, type LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  NEGATION_SOURCE,
  allergenTokens as tokensFromDetails,
  normalizeText,
} from "../../src/lib/allergens";
import { CALORIE_PATTERN, maskBodyNumbers } from "../../src/lib/text";
import type { ModelPart } from "../model";
import { mediaPart } from "../agent";
import {
  AgentError,
  MAX_REVISIONS,
  MAX_TOKENS,
  REVIEW_FILE_MS,
  REVIEW_MS,
  REVISION_MIN_REMAINING_MS,
  isSensitive,
  reviewOutputSchema,
  type Flags,
  type GraphState,
  type GraphUpdate,
  type Issue,
  type Review,
  type Specialist,
} from "./state";
import {
  DIET_REVIEW_ADDENDUM,
  RECIPE_REVIEW_ADDENDUM,
  EXAM_REVIEW_ADDENDUM,
  MEAL_TEXT_REVIEW_ADDENDUM,
  PHOTO_REVIEW_ADDENDUM,
  REVIEW_INSTRUCTIONS,
  ROTULO_REVIEW_ADDENDUM,
  REVIEW_JSON_SCHEMA,
  STRUCTURED_REVIEW_NOTE,
  renderFlags,
} from "./prompts";
import { wrapData } from "./prepare";
import { callJson, type GraphDeps } from "./specialists";
import { lintStructured } from "./structured-guard";
import { specFor } from "./structured-specs";

export interface LintInput {
  role: Specialist;
  draft: string;
  flags: Flags;
  mode: GraphState["mode"];
  urgency: GraphState["urgency"];
  previousFeedback: string[];
}
type Found = Omit<Issue, "papel">;
type Rule = (input: LintInput) => Found | null;
const MAX_TEXT = 20_000;

const found = (
  codigo: Issue["codigo"],
  match: RegExpMatchArray | string | null | undefined,
  correcao: string,
  gravidade: Issue["gravidade"] = "hard",
): Found | null =>
  match
    ? {
        codigo,
        trecho: (typeof match === "string" ? match : match[0]).slice(0, 200),
        correcao,
        gravidade,
      }
    : null;

const normalize = normalizeText;

/** Tokens de alergênicos a partir do texto livre da anamnese ("Tenho alergia a camarão e ovo"). */
export function allergenTokens(flags: Flags): string[] {
  return tokensFromDetails(flags.allergyDetails);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SUGGEST =
  "(sugiro|experimente|inclua|adicione|troque por|op[cç][aã]o|pode comer|consuma|prefira|aposte em|escolha)";
const NEGATION = NEGATION_SOURCE;
export const BODY_NUMBERS_CORRECTION =
  "A pessoa ocultou os números do corpo: não cite peso, altura, IMC, medidas nem gordura corporal.";

/** Primeiro número do corpo do rascunho (com a palavra ao lado), ou null. */
function firstBodyNumber(draft: string): string | null {
  const masked = maskBodyNumbers(draft);
  if (masked === draft) return null;
  let at = 0;
  while (at < draft.length && draft[at] === masked[at]) at += 1;
  return draft.slice(Math.max(0, at - 20), at + 20);
}

const SENSITIVE_PLAN =
  /\b\d{3,4}\s*(kcal|calorias)\b|jejum[^.]{0,25}\d+\s*h|d[ée]ficit cal[óo]rico|perder \d+[.,]?\d*\s*kg|corte (de )?calorias|restri[cç][aã]o cal[óo]rica/i;

const RULES: Rule[] = [
  ({ draft, flags }) =>
    flags.hideCalories
      ? found(
          "calorias_ocultas",
          draft.match(CALORIE_PATTERN),
          "Remova números de calorias; a pessoa optou por ocultá-los.",
          "soft",
        )
      : null,
  // Como as calorias: o finalizador mascara em código (buildReply/structuredReply); aqui só o alerta ao revisor.
  ({ draft, flags }) =>
    flags.hideBodyNumbers
      ? found(
          "outro",
          firstBodyNumber(draft),
          BODY_NUMBERS_CORRECTION,
          "soft",
        )
      : null,
  ({ draft }) =>
    found(
      "afirmou_salvar",
      draft.match(
        /\b(salvei|registrei|anotei|gravei|adicionei ao (seu )?di[aá]rio|foi salvo|atualizei (seu|o|a) (perfil|di[aá]rio|meta))\b/i,
      ),
      "O agente não grava dados; diga que a pessoa pode registrar no diário.",
    ),
  ({ draft }) =>
    found(
      "identificador_pessoal",
      draft.match(
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|[\w.+-]+@[\w-]+\.[\w.]+|(?<![\d-])\(?\d{2}\)?\s?9?\d{4}-\d{4}(?![\d-])/,
      ),
      "Remova identificadores pessoais.",
    ),
  ({ draft }) =>
    found(
      "alegacao_indevida",
      draft.match(
        /(protocolo|plano|m[ée]todo)[^.]{0,30}validad|supervis[ãa]o cl[íi]nica|clinicamente (aprovad|validad)|(?<!n[ãa]o (existe |h[áa] |prometo |promete |tem )?|sem |nenhum\w* \w+ )\bcura\b|(?<!n[ãa]o |nenhum\w* \w+ |nada )acelera\w* o metabolismo|\bgarant(o|ido|ia)\b|criptografia (de )?ponta a ponta/i,
      ),
      "Remova promessas, alegações de validação clínica, supervisão ou conformidade.",
    ),
  ({ draft }) =>
    found(
      "diagnostico",
      draft.match(
        /\bvoc[êe] (tem|est[áa] com|[ée]|apresenta) (um quadro de |uma? )?(diabetes|hipertens[ãa]o|anemia|obesidade|desnutri[çc][ãa]o|hipotireoidismo|resist[êe]ncia [àa] insulina|transtorno)/i,
      ),
      "Não diagnostique; descreva o relato e encaminhe a um profissional.",
    ),
  ({ draft }) =>
    found(
      "prescricao",
      draft.match(
        /(?<!n[ãa]o |nunca |jamais )\b(suspenda|interrompa|aumente|reduza|troque|dobre|pare de tomar) (a|o)? ?(dose|medica[çc][ãa]o|rem[ée]dio)/i,
      ),
      "Não altere medicamentos; oriente a conversar com quem prescreveu.",
    ),
  ({ draft, flags }) =>
    isSensitive(flags)
      ? found(
          "prescricao",
          draft.match(SENSITIVE_PLAN),
          "A anamnese indica condição sensível: não forneça metas numéricas de restrição, jejum ou perda de peso.",
        )
      : null,
  ({ draft }) =>
    found(
      "dado_inventado",
      draft.match(
        /\d+\s*%\s*de gordura|gordura corporal (estimada|aproximada)/i,
      ),
      "Não estime gordura corporal.",
    ),
  ({ draft, mode }) =>
    mode === "photo"
      ? found(
          "dado_inventado",
          draft.match(
            /(?<!por |valores por |r[óo]tulo (de |da |do )?|embalagem (de |da |do )?|cat[áa]logo[^.]{0,20})\b\d+[.,]?\d*\s*(g|gramas|ml|kcal|calorias)\b/i,
          ),
          "Na análise de foto não estime porções nem valores nutricionais.",
        )
      : null,
  ({ draft, flags }) =>
    found(
      "alergeno",
      allergenTokens(flags).find((t) =>
        new RegExp(
          `${SUGGEST}(?![^.]{0,80}${NEGATION})[^.]{0,80}\\b${escapeRegex(t)}`,
          "i",
        ).test(normalize(draft)),
      ),
      "Nunca sugira alimento que coincide com alergia declarada.",
    ),
  ({ draft, flags }) =>
    found(
      "alergeno",
      allergenTokens(flags).find((t) =>
        new RegExp(`\\b${escapeRegex(t)}`, "i").test(normalize(draft)),
      ),
      "Confirme que o alimento aparece apenas como alerta, nunca como sugestão.",
      "soft",
    ),
  ({ draft, urgency }) =>
    urgency === "atencao" &&
    !/profissional|nutricionista|m[ée]dic|atendimento|caps|cvv/i.test(draft)
      ? found(
          "urgencia_ignorada",
          draft.slice(0, 80),
          "A triagem sinalizou atenção: oriente avaliação por profissional.",
        )
      : null,
  ({ draft }) =>
    !draft.trim() || draft.length > MAX_TEXT
      ? found(
          "outro",
          draft.slice(0, 40) || "(vazio)",
          "Produza uma resposta não vazia com até 20.000 caracteres.",
        )
      : null,
  ({ draft, previousFeedback }) =>
    found(
      "outro",
      previousFeedback
        .map((line) => line.match(/: "(.+?)" → /)?.[1] ?? "")
        .filter((t) => t.length >= 20)
        .find((t) => draft.includes(t)),
      "O trecho apontado na revisão anterior continua presente.",
    ),
];

/** Verificações determinísticas do rascunho de um especialista (uma ocorrência por regra). */
export function lintDraft(input: LintInput): Issue[] {
  return RULES.flatMap((rule) => {
    const issue = rule(input);
    return issue ? [{ ...issue, papel: input.role }] : [];
  });
}

export function canRevise(state: GraphState, now: () => number): boolean {
  return (
    state.revisions < MAX_REVISIONS &&
    state.deadline - now() >= REVISION_MIN_REMAINING_MS
  );
}

export const feedbackFor = (issues: Issue[]) =>
  issues.reduce<Partial<Record<Specialist, string[]>>>((acc, i) => {
    const line = `${i.codigo}: "${i.trecho}" → ${i.correcao}`;
    return { ...acc, [i.papel]: [...(acc[i.papel] ?? []), line] };
  }, {});

/** Problemas dos campos estruturados de cada papel que terminou em JSON validado. */
function structuredLint(state: GraphState): Issue[] {
  const spec = specFor(state.mode, state.flags!, state.context);
  if (!spec) return [];
  return (Object.entries(state.structured) as [Specialist, unknown][]).flatMap(
    ([role, value]) =>
      value === null || value === undefined
        ? []
        : lintStructured({
            role,
            value,
            spec,
            flags: state.flags!,
            mode: state.mode,
          }),
  );
}

/** Guarda determinística: roda antes do revisor e após cada revisão. */
export function createGuardNode(deps: GraphDeps) {
  const now = deps.now ?? Date.now;
  return (state: GraphState): GraphUpdate => {
    const lint = [
      ...(Object.entries(state.drafts) as [Specialist, string][]).flatMap(
        ([role, draft]) =>
          lintDraft({
            role,
            draft,
            flags: state.flags!,
            mode: state.mode,
            urgency: state.urgency,
            previousFeedback: state.feedback[role] ?? [],
          }),
      ),
      ...structuredLint(state),
    ];
    const hard = lint.filter((i) => i.gravidade === "hard");
    const revise = hard.length > 0 && canRevise(state, now);
    return {
      lint,
      review: null,
      feedback: revise ? feedbackFor(hard) : {},
      revisions: revise ? state.revisions + 1 : state.revisions,
      trace: [revise ? "guarda:revisao" : "guarda"],
    };
  };
}

const sendsFor = (state: GraphState) =>
  (Object.keys(state.feedback) as Specialist[]).map(
    (role) => new Send(role, state),
  );

export function afterGuard(state: GraphState) {
  if (Object.keys(state.feedback).length) return sendsFor(state);
  return state.lint.some((i) => i.gravidade === "hard")
    ? "finalizar"
    : "revisor";
}

function reviewText(state: GraphState): string {
  const drafts = (Object.entries(state.drafts) as [Specialist, string][])
    .map(([role, draft]) =>
      wrapData(state.nonce, `RASCUNHO_${role.toUpperCase()}`, draft),
    )
    .join("\n\n");
  const hints = state.lint.length
    ? `ALERTAS DA VERIFICAÇÃO AUTOMÁTICA:\n- ${state.lint.map((i) => `${i.papel}/${i.codigo}: ${i.trecho}`).join("\n- ")}`
    : "ALERTAS DA VERIFICAÇÃO AUTOMÁTICA: nenhum.";
  return [
    `SINAIS DA ANAMNESE:\n${renderFlags(state.flags!)}`,
    state.dataBlock,
    `FATOS DERIVADOS EM CÓDIGO:\n- ${state.facts.join("\n- ")}`,
    `URGÊNCIA DETECTADA: ${state.urgency}`,
    `SOLICITAÇÃO DA PESSOA (${state.mode}):\n${state.text}`,
    drafts,
    hints,
  ].join("\n\n");
}

/** Foto, laudo e rótulo vão ao revisor: sem o anexo, a descrição do que está na imagem pareceria dado inventado. */
const reviewerGetsFile = (state: GraphState): boolean =>
  (state.mode === "photo" || state.mode === "exam" || state.mode === "rotulo") && !!state.file;

function reviewParts(state: GraphState): ModelPart[] {
  const parts: ModelPart[] = [{ type: "text", text: reviewText(state) }];
  if (reviewerGetsFile(state))
    parts.push(mediaPart(state.file!, state.mode === "exam" ? "exam" : "photo"));
  return parts;
}

/** Só estes códigos justificam bloqueio definitivo; o resto ganha uma reescrita. */
export const BLOCKING_CODES: ReadonlySet<Issue["codigo"]> = new Set([
  "alergeno",
  "prescricao",
  "diagnostico",
  "instrucao_injetada",
  "identificador_pessoal",
]);

/**
 * Normaliza o veredito do modelo: papel desconhecido é reatribuído quando há um único rascunho;
 * calorias ocultas são mascaradas em código (não geram revisão); bloqueio sem código bloqueante
 * vira revisar; veredito negativo sem problema aproveitável vira uma revisão genérica.
 */
export function normalizeVerdict(
  value: Review,
  drafts: GraphState["drafts"],
): Review {
  const roles = Object.keys(drafts) as Specialist[];
  const problemas = value.problemas
    .map((p) =>
      p.papel in drafts || roles.length !== 1 ? p : { ...p, papel: roles[0]! },
    )
    .filter((p) => p.papel in drafts && p.codigo !== "calorias_ocultas");
  if (value.veredito === "aprovado")
    return { ...value, veredito: "aprovado", problemas: [] };
  if (!problemas.length && !value.problemas.length)
    return {
      ...value,
      veredito: "revisar",
      problemas: roles.map((papel) => ({
        papel,
        codigo: "outro" as const,
        trecho: "",
        correcao:
          value.observacao.trim() ||
          "Revise o rascunho conforme as regras do agente.",
        gravidade: "hard" as const,
      })),
    };
  if (!problemas.length) return { ...value, veredito: "aprovado", problemas };
  if (
    value.veredito === "revisar" &&
    problemas.every((p) => p.gravidade === "soft")
  )
    return { ...value, veredito: "aprovado", problemas };
  const blocking = problemas.some((p) => BLOCKING_CODES.has(p.codigo));
  return {
    ...value,
    veredito:
      value.veredito === "bloquear" && !blocking ? "revisar" : value.veredito,
    problemas,
  };
}

/** Instruções do revisor: adendo do modo e, se algum rascunho veio de JSON, a nota estruturada. */
function reviewInstructions(state: GraphState, exam: boolean): string {
  const base = exam
    ? `${REVIEW_INSTRUCTIONS}\n\n${EXAM_REVIEW_ADDENDUM}`
    : state.mode === "photo"
      ? `${REVIEW_INSTRUCTIONS}\n\n${PHOTO_REVIEW_ADDENDUM}`
      : state.mode === "rotulo"
        ? `${REVIEW_INSTRUCTIONS}\n\n${ROTULO_REVIEW_ADDENDUM}`
        : state.mode === "diet"
        ? `${REVIEW_INSTRUCTIONS}\n\n${DIET_REVIEW_ADDENDUM}`
        : state.mode === "recipe"
          ? `${REVIEW_INSTRUCTIONS}\n\n${RECIPE_REVIEW_ADDENDUM}`
          : state.mode === "meal_text"
            ? `${REVIEW_INSTRUCTIONS}\n\n${MEAL_TEXT_REVIEW_ADDENDUM}`
            : REVIEW_INSTRUCTIONS;
  const structured = Object.values(state.structured).some(
    (value) => value !== null && value !== undefined,
  );
  return structured ? `${base}\n\n${STRUCTURED_REVIEW_NOTE}` : base;
}

export function createReviewerNode(deps: GraphDeps) {
  const now = deps.now ?? Date.now;
  return async (
    state: GraphState,
    config: LangGraphRunnableConfig,
  ): Promise<GraphUpdate> => {
    const exam = state.mode === "exam" && !!state.file;
    const { value, calls } = await callJson(
      deps,
      state,
      config,
      {
        purpose: "revisor",
        tier: "main",
        instructions: reviewInstructions(state, exam),
        history: [],
        parts: reviewParts(state),
        maxOutputTokens: MAX_TOKENS.review,
        jsonSchema: { name: "revisao", schema: REVIEW_JSON_SCHEMA },
      },
      // Com anexo (foto, laudo ou rótulo), o mesmo orçamento que o especialista reservou para o revisor.
      reviewerGetsFile(state) ? REVIEW_FILE_MS : REVIEW_MS,
      reviewOutputSchema,
    );
    const review = normalizeVerdict(value, state.drafts);
    const revise =
      review.veredito === "revisar" &&
      review.problemas.length > 0 &&
      canRevise(state, now);
    return {
      review,
      feedback: revise ? feedbackFor(review.problemas) : {},
      revisions: revise ? state.revisions + 1 : state.revisions,
      llmCalls: calls,
      trace: [revise ? "revisor:revisao" : `revisor:${review.veredito}`],
    };
  };
}

export function afterReview(state: GraphState) {
  return Object.keys(state.feedback).length ? sendsFor(state) : "finalizar";
}

export const ISSUE_LABELS: Record<Issue["codigo"], string> = {
  diagnostico: "diagnóstico",
  prescricao: "alteração de medicamento ou restrição indevida",
  alergeno: "alergênico sugerido",
  calorias_ocultas: "calorias ocultas",
  afirmou_salvar: "afirmação de gravação",
  identificador_pessoal: "identificador pessoal",
  dado_inventado: "dado inventado",
  instrucao_injetada: "instrução injetada",
  alegacao_indevida: "alegação indevida",
  urgencia_ignorada: "urgência ignorada",
  fora_do_papel: "fora do papel",
  outro: "outro critério",
};

/** Erro padronizado quando a revisão não aprova; nunca ecoa trechos do texto. */
export function reviewFailure(codes: Issue["codigo"][]): AgentError {
  const reasons = [...new Set(codes.map((c) => ISSUE_LABELS[c]))].join(", ");
  return new AgentError(
    "review_failed",
    `A resposta gerada não passou na revisão automática de segurança${reasons ? ` (motivos: ${reasons})` : ""}. Nada foi exibido. Reformule a pergunta ou converse com um profissional.`,
  );
}
