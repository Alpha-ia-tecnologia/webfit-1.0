import {
  maskStructured,
  structuredReplySchema,
  type StructuredReply,
} from "../../src/lib/structured";
import { hasBodyNumbers, visibleText } from "../../src/lib/text";
import {
  ANAMNESIS_LABELS,
  NOTES_MAX,
  NOTE_MAX_CHARS,
  SPECIALISTS,
  type AgentReply,
  type GraphState,
  type GraphUpdate,
  type Issue,
  type Specialist,
} from "./state";
import { SPECIALIST_TITLES, describeUrgency, urgencyText } from "./prompts";
import { detectUrgency, urgencyKind } from "./prepare";
import { reviewFailure } from "./review";
import { specFor } from "./structured-specs";

const isHard = (i: Issue) => i.gravidade === "hard";
const EXAM_NOTE =
  "Transcrição automática do laudo: confira cada valor com o documento original e discuta a interpretação com um profissional.";

/** Problemas que impedem a entrega: lint "hard" ou qualquer veredito não aprovado. */
export function blockingCodes(state: GraphState): Issue["codigo"][] {
  const fromLint = state.lint.filter(isHard).map((i) => i.codigo);
  if (!state.review) return [...fromLint, "outro"];
  if (state.review.veredito === "aprovado") return fromLint;
  return [...fromLint, ...state.review.problemas.map((i) => i.codigo)];
}

/** Avisos sempre curtos e em número limitado, mesmo que a triagem devolva muito texto. */
export function boundNotes(notes: string[]): string[] {
  return notes
    .map((n) => n.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX_CHARS))
    .filter(Boolean)
    .slice(0, NOTES_MAX);
}

/** Última barreira: decide se a resposta pode ser entregue e registra avisos honestos. */
export function finalizeNode(state: GraphState): GraphUpdate {
  if (state.urgency === "imediata") return { trace: ["finalizar"] };
  const blocking = blockingCodes(state);
  if (blocking.length) throw reviewFailure(blocking);
  const notes: string[] = [];
  if (state.mode === "exam") notes.push(EXAM_NOTE);
  if (state.lint.some((i) => i.codigo === "calorias_ocultas"))
    notes.push(
      "Números de calorias foram ocultados automaticamente conforme sua preferência.",
    );
  if (state.flags?.hideBodyNumbers && Object.values(state.drafts).some(hasBodyNumbers))
    notes.push("Números do corpo foram ocultados automaticamente conforme sua preferência.");
  const urgencyNote = describeUrgency(state.urgency);
  if (urgencyNote) notes.push(urgencyNote);
  if (state.triage?.injecaoSuspeita)
    notes.push(
      "Parte do conteúdo enviado continha instruções que foram ignoradas pelo agente.",
    );
  const missing = (state.triage?.faltamDados ?? [])
    .slice(0, 3)
    .map((key) => ANAMNESIS_LABELS[key] ?? key);
  if (missing.length)
    notes.push(
      `Informações da anamnese que ajudariam a responder melhor: ${missing.join("; ")}.`,
    );
  return { notes: boundNotes(notes), trace: ["finalizar"] };
}

export function orderedSpecialists(state: GraphState): Specialist[] {
  return SPECIALISTS.filter((role) => role in state.drafts);
}

export function mergeDrafts(state: GraphState): string {
  const roles = orderedSpecialists(state);
  if (roles.length <= 1) return state.drafts[roles[0]!] ?? "";
  return roles
    .map((role) => `**${SPECIALIST_TITLES[role]}**\n\n${state.drafts[role]}`)
    .join("\n\n");
}

/**
 * Envelope estruturado da resposta, já com calorias ocultas quando pedido. Só sai se validar:
 * qualquer falha devolve undefined e a resposta segue apenas com o texto.
 */
export function structuredReply(state: GraphState): StructuredReply | undefined {
  if (!state.flags) return undefined;
  const spec = specFor(state.mode, state.flags, state.context);
  if (!spec) return undefined;
  const results = orderedSpecialists(state).map((role) => ({
    role,
    value: state.structured[role] ?? null,
    draft: state.drafts[role] ?? "",
  }));
  const reply = spec.toReply(results);
  if (!reply) return undefined;
  const parsed = structuredReplySchema.safeParse(
    maskStructured(reply, state.flags.hideCalories, {
      hideBodyNumbers: state.flags.hideBodyNumbers,
    }),
  );
  return parsed.success ? parsed.data : undefined;
}

/** Monta a resposta final a partir do estado; pura e usada pelo executor do grafo. */
export function buildReply(state: GraphState): AgentReply {
  const urgent = state.urgency === "imediata";
  // Se a urgência veio da triagem (o detector determinístico não disparou), a causa é
  // desconhecida: inclui sempre o CVV.
  const kind =
    detectUrgency(state.text) === "imediata" ? urgencyKind(state.text) : "vida";
  const text = urgent
    ? urgencyText(kind)
    : visibleText(
        mergeDrafts(state),
        state.flags?.hideCalories ?? false,
        state.flags?.hideBodyNumbers ?? false,
      );
  const structured = urgent ? undefined : structuredReply(state);
  return {
    text,
    ...(structured ? { structured } : {}),
    meta: {
      specialists: urgent ? [] : orderedSpecialists(state),
      reviewed: !urgent && state.review?.veredito === "aprovado",
      revisions: state.revisions,
      urgency: state.urgency,
      notes: boundNotes(state.notes),
      llmCalls: state.llmCalls,
    },
  };
}
