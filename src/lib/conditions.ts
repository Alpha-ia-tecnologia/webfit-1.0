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
  { key: "ajustes", title: "Com ajustes nas metas", tags: ALLOWED_CONDITION_TAGS },
  {
    key: "avaliacao",
    title: "Com orientação individual",
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

// ---------- Cuidados que acompanham as metas (sem números, dados do corpo nem dose) ----------
/** Ícones dos cuidados: nomes do lucide (lucide-react no web, lucide-react-native no app). */
export type CareIconKey =
  | "heartPulse"
  | "droplet"
  | "testTube"
  | "activity"
  | "gauge"
  | "scale"
  | "syringe"
  | "shieldCheck"
  | "stethoscope";
export type CareKey =
  | "pressao"
  | "glicose"
  | "colesterol"
  | "figado"
  | "tireoide"
  | "imc"
  | "caneta"
  | "imc_baixo"
  | "outro";
/**
 * Um cuidado do perfil: o chip (rótulo de 1–2 palavras + ícone) e a frase da folha
 * "Cuidados do seu perfil". `text` ("Rótulo: frase") é o que vai em Goals.careNotes e ao agente.
 */
export interface CareItem {
  key: CareKey;
  /** 1–2 palavras para o chip ("Pressão alta", "Glicose", "Caneta", "IMC baixo"). */
  label: string;
  icon: CareIconKey;
  /** A frase da folha, com inicial maiúscula; sem números, dados do corpo ou dose. */
  body: string;
  /** A linha completa ("Rótulo: frase"), de até CARE_TEXT_MAX caracteres. */
  text: string;
}
/** Cada linha de cuidado cabe em duas linhas a 390 px, com o ícone ao lado. */
export const CARE_TEXT_MAX = 90;
export const CARE_SHEET_TITLE = "Cuidados do seu perfil";
export const CARE_BUTTON_LABEL = "Cuidados";
export const CARE_NOTES_CLOSING =
  "Confirme estas metas com quem acompanha você.";

const lowerFirst = (s: string) =>
  s.charAt(0).toLocaleLowerCase("pt-BR") + s.slice(1);
const careItem = (
  key: CareKey,
  label: string,
  icon: CareIconKey,
  body: string,
): CareItem => ({ key, label, icon, body, text: `${label}: ${lowerFirst(body)}` });

const PRESSURE_CARE = careItem(
  "pressao",
  "Pressão alta",
  "heartPulse",
  "Prefira comida caseira, com menos sal, embutidos e ultraprocessados.",
);
const GLUCOSE_CARE = careItem(
  "glicose",
  "Glicose",
  "droplet",
  "Distribua os carboidratos no dia, com integrais, fibras e proteína.",
);
const LIPIDS_CARE = careItem(
  "colesterol",
  "Colesterol",
  "testTube",
  "Priorize fibras, peixes e gorduras boas; evite frituras e açúcar.",
);
const LIVER_CARE = careItem(
  "figado",
  "Fígado",
  "activity",
  "Menos açúcar e bebida alcoólica; a perda de peso gradual ajuda.",
);
const THYROID_CARE = careItem(
  "tireoide",
  "Tireoide",
  "gauge",
  "Mantenha o tratamento em dia; a meta considera a tireoide controlada.",
);
/** Obesidade: a meta já segue a faixa de IMC; só a palavra, nunca o valor. */
const BMI_CARE = careItem(
  "imc",
  "IMC",
  "scale",
  "A meta já considera a sua faixa; a perda gradual é a mais sustentável.",
);
const PEN_CARE = careItem(
  "caneta",
  "Caneta",
  "syringe",
  "O apetite tende a cair; proteína em cada refeição, água e porções menores.",
);
/** O mesmo cuidado sem água: restrição de líquidos informada ou sem resposta (como canSuggestWater). */
const PEN_CARE_NO_WATER = careItem(
  "caneta",
  "Caneta",
  "syringe",
  "O apetite tende a cair; proteína em cada refeição e porções menores.",
);
const UNDERWEIGHT_CARE = careItem(
  "imc_baixo",
  "IMC baixo",
  "shieldCheck",
  "Sem déficit na meta; procure acompanhamento antes de buscar emagrecer.",
);
const CONDITION_CARE: Partial<Record<ConditionTag, CareItem>> = {
  hipertensao: PRESSURE_CARE,
  pre_diabetes: GLUCOSE_CARE,
  diabetes_tipo_2: GLUCOSE_CARE,
  colesterol_triglicerides: LIPIDS_CARE,
  gordura_figado: LIVER_CARE,
  hipotireoidismo_tratado: THYROID_CARE,
  obesidade: BMI_CARE,
};
const CARE_BY_TEXT: ReadonlyMap<string, CareItem> = new Map(
  [
    PRESSURE_CARE,
    GLUCOSE_CARE,
    LIPIDS_CARE,
    LIVER_CARE,
    THYROID_CARE,
    BMI_CARE,
    PEN_CARE,
    PEN_CARE_NO_WATER,
    UNDERWEIGHT_CARE,
  ].map((item) => [item.text, item]),
);

/** As linhas completas (as mesmas de Goals.careNotes), para o agente e os testes. */
export const GLUCOSE_CARE_NOTE = GLUCOSE_CARE.text;
export const PEN_CARE_NOTE = PEN_CARE.text;
export const PEN_CARE_NOTE_NO_WATER = PEN_CARE_NO_WATER.text;
export const UNDERWEIGHT_CARE_NOTE = UNDERWEIGHT_CARE.text;

export interface CareNotesInput {
  conditionTags: readonly ConditionTag[];
  usesPen: boolean;
  /** Água só entra no conselho com "nao" (sem restrição de líquidos), como nas dicas do ciclo. */
  fluidRestriction: string;
  /** Objetivo "perder" com IMC abaixo de 18,5 (sem déficit). */
  underweightForLoss: boolean;
}
/** Os cuidados, um por chave (glicose uma vez só), na ordem: condições, caneta, IMC baixo. */
export function careItemsFor(input: CareNotesInput): CareItem[] {
  const items = [
    ...input.conditionTags.flatMap((tag) => {
      const item = CONDITION_CARE[tag];
      return item ? [item] : [];
    }),
    ...(input.usesPen
      ? [input.fluidRestriction === "nao" ? PEN_CARE : PEN_CARE_NO_WATER]
      : []),
    ...(input.underweightForLoss ? [UNDERWEIGHT_CARE] : []),
  ];
  return items.filter(
    (item, index) => items.findIndex((other) => other.key === item.key) === index,
  );
}
/** Uma linha por cuidado e o fechamento quando algum se aplica (Goals.careNotes, contexto do agente). */
export function careNotesFor(input: CareNotesInput): string[] {
  const notes = careItemsFor(input).map((item) => item.text);
  return notes.length ? [...notes, CARE_NOTES_CLOSING] : [];
}
/**
 * Os cuidados por trás de Goals.careNotes (o fechamento sai): as telas só recebem as frases.
 * Uma frase desconhecida vira um cuidado genérico, para nunca sumir.
 */
export function careItemsOf(notes: readonly string[]): CareItem[] {
  return notes
    .filter((note) => note !== CARE_NOTES_CLOSING)
    .map(
      (note) =>
        CARE_BY_TEXT.get(note) ?? {
          key: "outro",
          label: "Cuidado",
          icon: "stethoscope",
          body: note,
          text: note,
        },
    );
}
