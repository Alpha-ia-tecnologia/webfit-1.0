/**
 * Pergunta "Tem algum diagnóstico de saúde?" (condições estruturadas): as 13 opções de
 * lib/conditions viram pílulas, o rascunho guarda os códigos ("hipertensao,diabetes_tipo_2") e o
 * texto livre `conditions` passa a ser "detalhes / outra condição" (obrigatório com "Outra").
 * Lógica pura, compartilhada entre web e app nativo.
 */
import {
  CONDITION_GROUPS,
  CONDITION_LABELS,
  CONDITION_TAGS,
  formatConditionTags,
  isConditionTag,
  NO_CONDITION_TAG,
  parseConditionTags,
  type ConditionTag,
} from "../../lib/conditions";
import type { Draft, Profile } from "../../types";
import {
  CHOICE_SEPARATOR,
  parseChoices,
  type ChoiceConfig,
  type ChoiceIconKey,
} from "./inputs";

export const CONDITION_TAGS_KEY = "conditionTags";
export const CONDITION_DETAILS_KEY = "conditions";
/** Código que torna os detalhes obrigatórios. */
export const OTHER_CONDITION_TAG: ConditionTag = "outra";

export const CONDITION_COPY = {
  required: "Escolha uma opção. Se não tiver nenhuma condição, marque “Nenhuma”.",
  detailsLabel: "Detalhes ou outra condição",
  detailsPlaceholder: "Qual é a outra condição? Conte o que achar importante.",
  detailsOptionalPlaceholder: "Ex.: há quanto tempo, como está o acompanhamento.",
  detailsRequired: "Obrigatório com “Outra”: conte qual é a condição.",
  detailsOptional: "Opcional. Detalhes que ajudem a entender suas condições.",
} as const;

/** Ícone decorativo de cada condição (pílulas). */
const CONDITION_ICONS: Record<ConditionTag, ChoiceIconKey> = {
  hipertensao: "heartPulse",
  pre_diabetes: "droplets",
  diabetes_tipo_2: "droplet",
  colesterol_triglicerides: "testTube",
  gordura_figado: "activity",
  hipotireoidismo_tratado: "gauge",
  obesidade: "scale",
  diabetes_tipo_1_insulina: "syringe",
  doenca_renal: "bean",
  insuficiencia_cardiaca: "heartCrack",
  cancer_tratamento: "ribbon",
  outra: "plus",
  nenhuma: "circleSlash",
};

const labelOf = (tag: ConditionTag) => CONDITION_LABELS[tag];

/**
 * Pílulas da pergunta: o valor de cada opção é o rótulo em português (texto visível e nome
 * acessível); "Nenhuma" é excludente e, abaixo de "ou marque o que se aplica", todas ficam à vista, nos
 * grupos de lib/conditions; sem "Outros" livre (a "Outra" da lista abre os detalhes).
 */
export const CONDITION_CHOICES: ChoiceConfig = {
  mode: "multi",
  options: CONDITION_TAGS.map((tag) => ({
    value: labelOf(tag),
    icon: CONDITION_ICONS[tag],
    ...(tag === NO_CONDITION_TAG ? { none: true } : {}),
  })),
  hideOther: true,
  divider: "ou marque o que se aplica",
  sections: CONDITION_GROUPS.filter((group) => group.key !== "nenhuma").map(
    (group) => ({ title: group.title, values: group.tags.map(labelOf) }),
  ),
};

const TAG_BY_LABEL = new Map<string, ConditionTag>(
  CONDITION_TAGS.map((tag) => [labelOf(tag), tag]),
);

/** Rascunho (texto "a,b") ou perfil (lista) → texto das pílulas ("Rótulo A, Rótulo B"), na ordem da lista. */
export function tagsToChoices(value: unknown): string {
  const tags = parseConditionTags(value);
  return CONDITION_TAGS.filter((tag) => tags.includes(tag))
    .map(labelOf)
    .join(CHOICE_SEPARATOR);
}

/** Texto das pílulas → texto do rascunho, na ordem da lista fechada. */
export function choicesToTags(text: string): string {
  const { selected } = parseChoices(text, CONDITION_CHOICES);
  const tags = selected
    .map((label) => TAG_BY_LABEL.get(label))
    .filter(isConditionTag);
  return formatConditionTags(CONDITION_TAGS.filter((tag) => tags.includes(tag)));
}

/** "Outra" marcada: os detalhes passam a ser obrigatórios. */
export const isOtherConditionOn = (answers: Draft) =>
  parseConditionTags(answers[CONDITION_TAGS_KEY]).includes(OTHER_CONDITION_TAG);

/**
 * Os detalhes aparecem com qualquer condição marcada além de "Nenhuma" (opcionais; obrigatórios só
 * com "Outra"), com um texto já salvo (perfis antigos) ou com um aviso pendente.
 */
export function showsConditionDetails(
  answers: Draft,
  hasSavedText: boolean,
  hasError: boolean,
): boolean {
  const tags = parseConditionTags(answers[CONDITION_TAGS_KEY]);
  return tags.some((tag) => tag !== NO_CONDITION_TAG) || hasSavedText || hasError;
}

/** Dica e exemplo do campo: "Outra" pede a condição; nas demais, os detalhes são opcionais. */
export const conditionDetailsCopy = (isOther: boolean) =>
  isOther
    ? { hint: CONDITION_COPY.detailsRequired, placeholder: CONDITION_COPY.detailsPlaceholder }
    : { hint: CONDITION_COPY.detailsOptional, placeholder: CONDITION_COPY.detailsOptionalPlaceholder };

/** Rótulos das condições marcadas, para a revisão ("Não informado" sem nenhuma). */
export function conditionTagsText(value: unknown): string {
  const labels = parseConditionTags(value).map(labelOf);
  return labels.length ? labels.join(CHOICE_SEPARATOR) : "Não informado";
}

/**
 * Erros da pergunta somados aos do perfil: sem nenhuma condição marcada, pede a escolha (perfis
 * antigos, só com texto livre, também precisam escolher) e o aviso do texto livre sai, porque vinha
 * da falta de escolha. "Outra" sem detalhes continua com o aviso do perfil.
 */
export function withConditionIssues(
  answers: Draft,
  fields: Record<string, string>,
  stepKeys: readonly string[],
): Record<string, string> {
  if (!stepKeys.includes(CONDITION_TAGS_KEY)) return fields;
  if (parseConditionTags(answers[CONDITION_TAGS_KEY]).length) return fields;
  const rest = Object.entries(fields).filter(
    ([key]) => key !== CONDITION_DETAILS_KEY,
  );
  return {
    ...Object.fromEntries(rest),
    [CONDITION_TAGS_KEY]: CONDITION_COPY.required,
  };
}

/** Perfil salvo como rascunho da anamnese: as condições viram o texto "a,b" (o rascunho só guarda texto). */
export function profileToDraft(profile: Profile): Draft {
  return {
    ...(profile as unknown as Draft),
    [CONDITION_TAGS_KEY]: formatConditionTags(
      parseConditionTags(profile.conditionTags),
    ),
  };
}
