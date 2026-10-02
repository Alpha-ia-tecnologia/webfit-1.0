/**
 * Condições de saúde estruturadas da anamnese: lista fechada, rótulos, grupos, conversão do
 * rascunho (texto separado por vírgulas) e os cuidados que acompanham as metas automáticas.
 * Lógica pura, sem importar tipos do app (types.ts importa daqui), compartilhada entre web e app nativo.
 * Os cuidados nunca trazem números, dados do corpo nem dose.
 */

/** Permitem metas automáticas, com cuidados na alimentação. */
export const ALLOWED_CONDITION_TAGS = [
  "hipertensao",
  "pre_diabetes",
  "diabetes_tipo_2",
  "colesterol_triglicerides",
  "gordura_figado",
  "hipotireoidismo_tratado",
  "obesidade",
] as const;
/** Pedem avaliação individual antes de qualquer meta automática ("outra" inclusa). */
export const BLOCKING_CONDITION_TAGS = [
  "diabetes_tipo_1_insulina",
  "doenca_renal",
  "insuficiencia_cardiaca",
  "cancer_tratamento",
  "outra",
] as const;
/** Exclusiva: escolher "nenhuma" limpa as demais. */
export const NO_CONDITION_TAG = "nenhuma";
export const CONDITION_TAGS = [
  ...ALLOWED_CONDITION_TAGS,
  ...BLOCKING_CONDITION_TAGS,
  NO_CONDITION_TAG,
] as const;
export type ConditionTag = (typeof CONDITION_TAGS)[number];
export const MAX_CONDITION_TAGS = 12;

export const CONDITION_LABELS: Record<ConditionTag, string> = {
  hipertensao: "Hipertensão (pressão alta)",
  pre_diabetes: "Pré-diabetes",
  diabetes_tipo_2: "Diabetes tipo 2",
  colesterol_triglicerides: "Colesterol ou triglicerídeos altos",
  gordura_figado: "Gordura no fígado",
  hipotireoidismo_tratado: "Hipotireoidismo em tratamento",
  obesidade: "Obesidade",
  diabetes_tipo_1_insulina: "Diabetes tipo 1 ou uso de insulina",
  doenca_renal: "Doença renal",
  insuficiencia_cardiaca: "Insuficiência cardíaca",
  cancer_tratamento: "Câncer em tratamento",
  outra: "Outra",
  nenhuma: "Nenhuma",
};

export interface ConditionGroup {
  key: "ajustes" | "avaliacao" | "nenhuma";
  title: string;
  tags: readonly ConditionTag[];
}
/** Grupos para a pergunta da anamnese (web e app nativo). */
export const CONDITION_GROUPS: readonly ConditionGroup[] = [
  { key: "nenhuma", title: "Sem condições", tags: [NO_CONDITION_TAG] },
  { key: "ajustes", title: "Metas com cuidados", tags: ALLOWED_CONDITION_TAGS },
  {
    key: "avaliacao",
    title: "Pedem avaliação individual",
    tags: BLOCKING_CONDITION_TAGS,
  },
];

const TAG_SET: ReadonlySet<string> = new Set(CONDITION_TAGS);
const BLOCKING_SET: ReadonlySet<string> = new Set(BLOCKING_CONDITION_TAGS);
export const isConditionTag = (value: unknown): value is ConditionTag =>
  typeof value === "string" && TAG_SET.has(value);

/** Texto do rascunho ("a,b") ou lista → itens aparados, sem vazios nem repetidos (sem validar). */
export function splitConditionTags(value: unknown): unknown {
  const items =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : null;
  if (!items) return value;
  const trimmed = items.map((item) =>
    typeof item === "string" ? item.trim() : item,
  );
  return [...new Set(trimmed.filter((item) => item !== ""))];
}

/** Lista válida a partir do rascunho ou do perfil: ignora o que não está na lista fechada. */
export function parseConditionTags(value: unknown): ConditionTag[] {
  const items = splitConditionTags(value);
  return Array.isArray(items) ? items.filter(isConditionTag) : [];
}
/** Lista → texto do rascunho ("hipertensao,diabetes_tipo_2"). */
export const formatConditionTags = (tags: readonly ConditionTag[]) =>
  tags.join(",");

/** Marca ou desmarca uma condição; "nenhuma" é exclusiva nos dois sentidos. */
export function toggleConditionTag(
  tags: readonly ConditionTag[],
  tag: ConditionTag,
): ConditionTag[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  if (tag === NO_CONDITION_TAG) return [NO_CONDITION_TAG];
  return [...tags.filter((t) => t !== NO_CONDITION_TAG), tag];
}

export const hasBlockingCondition = (tags: readonly string[]) =>
  tags.some((tag) => BLOCKING_SET.has(tag));

/** Rótulos das condições declaradas, sem "Nenhuma". */
export const conditionLabels = (tags: readonly ConditionTag[]) =>
  tags.filter((t) => t !== NO_CONDITION_TAG).map((t) => CONDITION_LABELS[t]);

/** IMC = peso (kg) ÷ altura (m)²; null sem peso ou altura válidos. */
export function bmiOf(weight: number, heightCm: number): number | null {
  if (!(weight > 0) || !(heightCm > 0)) return null;
  const meters = heightCm / 100;
  return weight / (meters * meters);
}

// ---------- Cuidados que acompanham as metas (sem números) ----------
export const GLUCOSE_CARE_NOTE =
  "Glicose: distribua os carboidratos ao longo do dia, prefira integrais e fibras e combine com proteína.";
const CONDITION_CARE_NOTES: Partial<Record<ConditionTag, string>> = {
  hipertensao:
    "Pressão alta: prefira comida caseira, com menos sal, embutidos e ultraprocessados.",
  pre_diabetes: GLUCOSE_CARE_NOTE,
  diabetes_tipo_2: GLUCOSE_CARE_NOTE,
  colesterol_triglicerides:
    "Colesterol e triglicerídeos: priorize fibras, peixes e gorduras boas; evite frituras e açúcar.",
  gordura_figado:
    "Fígado: menos açúcar e bebida alcoólica; a perda de peso gradual ajuda.",
  hipotireoidismo_tratado:
    "Tireoide: mantenha o tratamento em dia; a meta considera a tireoide controlada.",
  obesidade:
    "A meta considera o seu IMC; a perda gradual é a mais sustentável.",
};
export const PEN_CARE_NOTE =
  "Caneta: o apetite tende a cair. Priorize a proteína em cada refeição, beba água e prefira refeições menores. Converse com quem prescreveu antes de qualquer mudança.";
/** O mesmo cuidado sem "beba água": restrição de líquidos informada ou ainda sem resposta. */
export const PEN_CARE_NOTE_NO_WATER =
  "Caneta: o apetite tende a cair. Priorize a proteína em cada refeição e prefira refeições menores. Converse com quem prescreveu antes de qualquer mudança.";
export const UNDERWEIGHT_CARE_NOTE =
  "Seu IMC já está abaixo do recomendado para perder peso; procure acompanhamento antes de buscar emagrecer.";
export const CARE_NOTES_CLOSING =
  "Confirme estas metas com quem acompanha você.";

export interface CareNotesInput {
  conditionTags: readonly ConditionTag[];
  usesPen: boolean;
  /** Água só entra no conselho com "nao" (sem restrição de líquidos), como nas dicas do ciclo. */
  fluidRestriction: string;
  /** Objetivo "perder" com IMC abaixo de 18,5 (sem déficit). */
  underweightForLoss: boolean;
}
/** Uma linha por cuidado (glicose uma vez só) e o fechamento quando algum se aplica. */
export function careNotesFor(input: CareNotesInput): string[] {
  const conditionNotes = input.conditionTags.flatMap((tag) => {
    const note = CONDITION_CARE_NOTES[tag];
    return note ? [note] : [];
  });
  const notes = [
    ...new Set(conditionNotes),
    ...(input.usesPen
      ? [input.fluidRestriction === "nao" ? PEN_CARE_NOTE : PEN_CARE_NOTE_NO_WATER]
      : []),
    ...(input.underweightForLoss ? [UNDERWEIGHT_CARE_NOTE] : []),
  ];
  return notes.length ? [...notes, CARE_NOTES_CLOSING] : [];
}
