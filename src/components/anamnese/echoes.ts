import { CHOICE_FIELDS } from "../../data/anamneseOptions";
import { isSensitiveDraft } from "../../lib/anamnese-flow";
import type { Draft } from "../../types";
import { parseChoices } from "./inputs";

/**
 * Ecos acolhedores: uma frase curta depois de respostas-chave, dizendo o que muda para a pessoa.
 * Só descrevem o que o app e o agente fazem de fato (metas, sugestões, lembretes); nunca orientam
 * tratamento, dose ou meta. Os textos de gestação e transtorno alimentar devem passar por revisão
 * de um profissional de saúde antes de qualquer mudança de sentido.
 */
type Echo = (answers: Draft) => string | null;

const CAREFUL = "Tudo bem. Por cuidado, o app não vai estimar metas automáticas.";
/** Acima disso, a lista de alergias vira "suas alergias" para caber em uma ou duas linhas. */
const MAX_LIST_CHARS = 60;
const NOT_DETAILED = "Prefiro não detalhar";

const DIET_ECHOES: Record<string, string> = {
  Vegetariana: "O agente vai montar sugestões vegetarianas, sem carnes.",
  Vegana: "O agente vai montar sugestões sem ingredientes de origem animal.",
  "Sem glúten": "O agente vai montar sugestões sem glúten.",
  "Sem lactose": "O agente vai montar sugestões sem lactose.",
};

// Mudanças de peso não aparecem nos ecos de quem relatou transtorno alimentar ou gestação (isSensitiveDraft).

/** "a", "a e b", "a, b e c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

const lowerFirst = (text: string) =>
  text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);

function allergyEcho(answers: Draft): string | null {
  const config = CHOICE_FIELDS.allergyDetails;
  const { selected, other } = parseChoices(
    String(answers.allergyDetails ?? ""),
    config,
  );
  const items = [...selected.filter((item) => item !== NOT_DETAILED), other]
    .map((item) => item.trim())
    .filter(Boolean)
    .map(lowerFirst);
  if (!items.length) return null;
  const list = joinList(items);
  return list.length > MAX_LIST_CHARS
    ? "O agente vai deixar suas alergias fora das sugestões."
    : `O agente vai deixar ${list} fora das sugestões.`;
}

function goalEcho(answers: Draft): string | null {
  if (answers.goal === "organizar")
    return "O foco fica na rotina, nos horários e nas escolhas do dia a dia.";
  if (isSensitiveDraft(answers)) return null;
  if (answers.goal === "manter")
    return "O plano busca sustentar seu peso com equilíbrio.";
  if (answers.goal === "perder")
    return "Vamos com calma: a meta busca uma redução gradual, sem extremos.";
  if (answers.goal === "ganhar")
    return "Vamos com calma: a meta busca um ganho gradual, sem extremos.";
  return null;
}

const ECHOES: Record<string, Echo> = {
  sex: (a) =>
    a.sex === "nao_informado"
      ? "Tudo bem. Metas de energia podem ser informadas por você ou por um profissional."
      : null,
  weightLossPen: (a) =>
    a.weightLossPen === "sim"
      ? "O agente leva a caneta em conta, mas nunca orienta dose nem uso."
      : a.weightLossPen === "nao_informado"
        ? "Tudo bem. O agente não vai presumir uso nem ausência."
        : null,
  pregnancy: (a) =>
    a.pregnancy === "gestacao" || a.pregnancy === "amamentacao"
      ? "Anotado. Nesta fase o app não estima metas: vale a orientação de quem acompanha você."
      : a.pregnancy === "nao_informado"
        ? CAREFUL
        : null,
  fluidRestriction: (a) =>
    a.fluidRestriction === "sim"
      ? "Anotado. O app não vai sugerir beber mais água por conta própria."
      : null,
  eatingDisorder: (a) =>
    a.eatingDisorder === "sim"
      ? "Obrigado por confiar. Sem metas automáticas de calorias: o foco fica no seu bem-estar."
      : a.eatingDisorder === "nao_informado"
        ? CAREFUL
        : null,
  allergyDetails: allergyEcho,
  diet: (a) => {
    const [pattern] = parseChoices(
      String(a.diet ?? ""),
      CHOICE_FIELDS.diet,
    ).selected;
    return (pattern && DIET_ECHOES[pattern]) ?? null;
  },
  goal: goalEcho,
  hideCalories: (a) =>
    a.hideCalories === true
      ? "Pronto. As calorias ficam ocultas nas telas e nas respostas do agente."
      : null,
};

/** Perguntas que têm eco: a região aria-live delas fica sempre no DOM para anunciar a mudança. */
export const ECHO_KEYS: ReadonlySet<string> = new Set(Object.keys(ECHOES));

/** Frase de eco para a resposta atual da pergunta, ou null quando não há o que ecoar. */
export function echoFor(key: string, answers: Draft): string | null {
  return ECHOES[key]?.(answers) ?? null;
}
