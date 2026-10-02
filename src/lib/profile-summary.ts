/**
 * Hub "Seu perfil de saúde" (ANAMNESE-X1): um cartão por etapa da anamnese, as respostas de cada
 * etapa, os avisos "Precisa de atenção" e o editor de uma seção só. Lógica pura, igual no web e
 * no app. As seções são encontradas pelo campo-âncora no questionário atual (nunca por posição),
 * então uma etapa reordenada continua no cartão certo.
 * Na face dos cartões nunca aparece número de peso, peso desejado, condição, medicamento,
 * transtorno alimentar nem gestação; perfil calmo (sensível ou menor de idade) vê "Objetivo definido".
 */
import { CHOICE_FIELDS, type GroupIcon } from "../data/anamneseOptions";
import { questionnaire, type Question } from "../data/questionnaire";
import { parseChoices } from "../components/anamnese/inputs";
import {
  completion,
  essentialFields,
  isAnswered,
  answerText as reviewAnswerText,
  isShown,
} from "../components/anamnese/progress";
import type { Domain } from "../design/tokens";
import { profileSchema, type AppState, type Draft, type Measurement, type Profile } from "../types";
import { AI_CONSENT_VERSION } from "./consent";
import { ageAt, goalsFor, localDate, updateProfile } from "./domain";
import { essentialSummary, medicationNames } from "./essential";
import { fmtDateBr, fmtNumber, fmtRelDate, plural } from "./format";
import { fmtMg } from "./injection";
import { goalOrigin, isCalmProfile } from "./space";
import { lastInjection } from "./treatment";

/** Ícones do kit (GroupIcon da anamnese): web e app já traduzem cada um. */
export type SectionIcon = GroupIcon;
export interface ProfileSectionCard {
  /** Índice da etapa no questionário (o mesmo de openAnamneseSection). */
  index: number;
  anchor: string;
  title: string;
  icon: SectionIcon;
  tone: Domain;
  highlights: string[];
  answered: number;
  total: number;
}
export interface SectionAnswer {
  key: string;
  label: string;
  value: string;
}

export const PROFILE_HUB_COPY = {
  title: "Perfil de saúde",
  reviewAll: "Revisar tudo",
  attention: "Precisa de atenção",
  editSection: "Editar esta seção",
  details: "Toque para ver os detalhes",
} as const;

export const SECTION_EDIT_COPY = {
  barLabel: "Editar seção",
  save: "Salvar alterações",
  saving: "Salvando…",
  cancel: "Cancelar",
  back: "Voltar para Meu espaço",
  discardTitle: "Descartar alterações?",
  discardMessage: "As mudanças desta seção ainda não foram salvas.",
  discardConfirm: "Descartar",
  saved: (title: string) => `Alterações salvas: ${title}.`,
  outside: (labels: string[]) =>
    `Esta alteração depende de outra resposta: ${labels.join(", ")}. Revise também em Revisar tudo.`,
} as const;

/** Etapa onde o campo está no questionário atual; -1 se não existe. */
export function sectionIndexOf(anchor: string): number {
  return questionnaire.findIndex((s) => s.fields.some((f) => f.key === anchor));
}

/** Ícone e tom de cada seção, pelo campo-âncora (a primeira âncora presente na etapa vale). */
const SECTION_META: readonly { anchor: string; icon: SectionIcon; tone: Domain }[] = [
  { anchor: "name", icon: "user", tone: "neutral" },
  { anchor: "conditions", icon: "shield", tone: "medication" },
  { anchor: "weight", icon: "ruler", tone: "body" },
  { anchor: "medications", icon: "heart", tone: "medication" },
  { anchor: "allergies", icon: "leaf", tone: "food" },
  { anchor: "sleepHours", icon: "moon", tone: "mind" },
  { anchor: "manualCalories", icon: "target", tone: "habit" },
];
const FALLBACK_META = { icon: "clipboard" as SectionIcon, tone: "neutral" as Domain };

/** Seções com dado de saúde íntimo: a face do cartão só mostra quantas respostas há. */
const PRIVATE_KEYS: ReadonlySet<string> = new Set([
  "conditionTags",
  "conditions",
  "medications",
  "pregnancy",
  "eatingDisorder",
  "weightLossPen",
  "supplements",
  "surgeries",
  "familyHistory",
]);

const HIGHLIGHT_MAX = 3;
const HIGHLIGHT_CHARS = 40;
const IGNORED_CHOICES: ReadonlySet<string> = new Set([
  "Prefiro não informar",
  "Não sei",
  "Nenhum",
  "Nenhuma",
]);
const GOAL_TEXT: Record<Profile["goal"], string> = {
  organizar: "Organizar a rotina",
  manter: "Manter o peso",
  perder: "Reduzir o peso",
  ganhar: "Ganhar peso ou massa",
};
const ALLERGY_TEXT: Record<Profile["allergies"], string> = {
  nao: "Sem alergias",
  sim: "Alergias informadas",
  nao_sei: "Alergias: não sabe",
};
const ACTIVITY_TEXT: Record<Profile["activityLevel"], string> = {
  sedentario: "Pouco movimento",
  leve: "Atividade leve",
  moderado: "Atividade moderada",
  intenso: "Atividade intensa",
};

const toDraft = (p: Profile): Draft => p as unknown as Draft;

/** Primeira opção reconhecida de um campo de chips, sem "Prefiro não informar", "Não sei" e "Nenhum(a)". */
function firstChoice(p: Profile, key: string): string | null {
  const config = CHOICE_FIELDS[key];
  if (!config) return null;
  const { selected } = parseChoices(String(toDraft(p)[key] ?? ""), config);
  return selected.find((value) => !IGNORED_CHOICES.has(value)) ?? null;
}

interface HighlightContext {
  calm: boolean;
  today: string;
  measurements: readonly Measurement[];
}
type Rule = [key: string, text: (p: Profile, c: HighlightContext) => string | null];
/**
 * Destaques na ordem em que aparecem: cada seção usa os das chaves que contém (até 3), então
 * mover uma pergunta de etapa leva o destaque junto.
 */
const HIGHLIGHT_RULES: readonly Rule[] = [
  ["birthDate", (p, c) => `${ageAt(p.birthDate, c.today)} anos`],
  ["goal", (p, c) => (c.calm ? "Objetivo definido" : GOAL_TEXT[p.goal])],
  ["routine", (p) => firstChoice(p, "routine")],
  ["measurementDate", (p, c) => `Medido ${fmtRelDate(p.measurementDate, c.today)}`],
  ["weight", (_p, c) => plural(c.measurements.length, "medição", "medições")],
  ["allergies", (p) => ALLERGY_TEXT[p.allergies]],
  ["diet", (p) => firstChoice(p, "diet")],
  ["sleepHours", (p) => `${fmtNumber(p.sleepHours, 1)} h de sono`],
  ["activityLevel", (p) => ACTIVITY_TEXT[p.activityLevel]],
  ["exerciseDays", (p) => `${plural(p.exerciseDays, "dia", "dias")} de exercício`],
  ["mealsPerDay", (p) => `${plural(p.mealsPerDay, "refeição", "refeições")} por dia`],
  ["manualCalories", (p, c) => goalOrigin(p, goalsFor(p, c.today)).label],
  ["hideCalories", (p) => (p.hideCalories ? "Calorias ocultas" : null)],
  ["remindersEnabled", (p) => (p.remindersEnabled ? "Lembretes ligados" : "Lembretes desligados")],
  ["consentAi", (p) => (p.consentAi ? "IA autorizada" : "IA desativada")],
  ["cookingTime", (p) => firstChoice(p, "cookingTime")],
];

function clipText(text: string): string {
  const chars = Array.from(text.trim());
  return chars.length > HIGHLIGHT_CHARS
    ? `${chars.slice(0, HIGHLIGHT_CHARS - 1).join("").trimEnd()}…`
    : chars.join("");
}

/** Resposta dada: booleano (as duas posições são escolhas) ou texto/número não vazio. */
const hasAnswer = (value: unknown) =>
  typeof value === "boolean" || String(value ?? "").trim() !== "";

/** Texto de uma resposta salva: datas "15/06/1992", números "72,4", opções pelo rótulo. */
export function answerText(field: Question, value: unknown): string {
  if (field.type === "date" && typeof value === "string" && value) return fmtDateBr(value);
  if (typeof value === "number" && !field.options && field.key !== "weightLossPenPerMonth")
    return fmtNumber(value, 1);
  if (value === undefined) return reviewAnswerText(field, null);
  return reviewAnswerText(field, value as Draft[string]);
}

/** Um cartão por etapa (sem a revisão), com até 3 destaques de até 40 caracteres. */
export function profileSections(
  profile: Profile,
  measurements: readonly Measurement[],
  today = localDate(),
): ProfileSectionCard[] {
  const answers = toDraft(profile);
  const context: HighlightContext = { calm: isCalmProfile(profile, today), today, measurements };
  return questionnaire.flatMap((section, index) => {
    if (index === questionnaire.length - 1 || !section.fields.length) return [];
    const keys = new Set(section.fields.map((f) => f.key));
    const meta = SECTION_META.find((m) => keys.has(m.anchor));
    const shown = section.fields.filter((f) => isShown(answers, f, today));
    const answered = shown.filter((f) => hasAnswer(answers[f.key])).length;
    const count = `${answered} de ${shown.length} respostas`;
    const isPrivate = [...keys].some((key) => PRIVATE_KEYS.has(key));
    const fromRules = HIGHLIGHT_RULES.filter(([key]) => keys.has(key))
      .map(([, text]) => text(profile, context))
      .filter((text): text is string => !!text && !!text.trim())
      .map(clipText);
    const unique = [...new Set(fromRules)].slice(0, HIGHLIGHT_MAX);
    const highlights = isPrivate
      ? [count, PROFILE_HUB_COPY.details]
      : unique.length
        ? unique
        : [count];
    return [
      {
        index,
        anchor: meta?.anchor ?? section.fields[0]!.key,
        title: section.title,
        icon: meta?.icon ?? FALLBACK_META.icon,
        tone: meta?.tone ?? FALLBACK_META.tone,
        highlights,
        answered,
        total: shown.length,
      },
    ];
  });
}

// ---------- Meu espaço, conceito 11: anel da anamnese, objetivo e mosaico do perfil ----------

export interface AnamneseCompletion {
  /** Respostas essenciais dadas, em % (a mesma conta da barra da anamnese). */
  percent: number;
  answered: number;
  total: number;
  /** Etapas do hub (7) e quantas estão com todas as respostas essenciais. */
  sections: number;
  completeSections: number;
  isComplete: boolean;
  /** "Anamnese completa · 7 seções" ou "Anamnese · 5 de 7 seções" (linha que abre as seções). */
  label: string;
}

/** Quanto da anamnese está respondido: indicador neutro (sem festa), igual no web e no app. */
export function anamneseCompletion(profile: Profile, today = localDate()): AnamneseCompletion {
  const answers = toDraft(profile);
  const { answered, total, percent } = completion(answers);
  const steps = questionnaire.slice(0, -1).filter((step) => step.fields.length);
  const completeSections = steps.filter((step) =>
    essentialFields(answers, step.fields, today).every((field) => isAnswered(answers, field)),
  ).length;
  const sections = steps.length;
  const isComplete = percent === 100 && completeSections === sections;
  return {
    percent,
    answered,
    total,
    sections,
    completeSections,
    isComplete,
    label: isComplete
      ? `Anamnese completa · ${plural(sections, "seção", "seções")}`
      : `Anamnese · ${completeSections} de ${plural(sections, "seção", "seções")}`,
  };
}

/** Chip do objetivo no topo do Meu espaço ("Reduzir o peso"); null em perfil calmo. */
export function goalChip(profile: Profile, today = localDate()): string | null {
  return isCalmProfile(profile, today) ? null : GOAL_TEXT[profile.goal];
}

/** Rótulos curtos da rotina no mosaico ("Escritório", "30 min cozinha"). */
const OCCUPATION_SHORT: Record<string, string> = {
  "Trabalho em escritório": "Escritório",
  "Trabalho em casa": "Home office",
  "Trabalho em pé ou em movimento": "Em pé ou em movimento",
  "Trabalho físico pesado": "Trabalho físico",
  "Turnos ou escalas variáveis": "Turnos ou escalas",
  Estudante: "Estudante",
  "Cuido da casa e da família": "Cuido da casa",
  "Aposentado(a)": "Aposentado(a)",
  "Sem ocupação fixa no momento": "Sem ocupação fixa",
};
const COOKING_SHORT: Record<string, string> = {
  "Quase nenhum, uso pratos prontos": "Pratos prontos",
  "Até 15 minutos por dia": "15 min cozinha",
  "30 minutos por dia": "30 min cozinha",
  "1 hora ou mais por dia": "1 h+ cozinha",
  "Cozinho em lote no fim de semana": "Cozinha em lote",
  "Outra pessoa cozinha para mim": "Outra pessoa cozinha",
};
const MOSAIC_CHIP_CHARS = 22;
/** "Medicamento para emagrecer" (anamnese) é a própria caneta: não conta como outro remédio. */
const PEN_MEDICATION_CHOICE = "Medicamento para emagrecer";

function mosaicClip(text: string): string {
  const chars = Array.from(text.trim());
  return chars.length > MOSAIC_CHIP_CHARS
    ? `${chars.slice(0, MOSAIC_CHIP_CHARS - 1).join("").trimEnd()}…`
    : chars.join("");
}

/** Escolhas de um campo de chips sem as excludentes ("Nada em especial", "Prefiro não informar") + o texto livre. */
function choiceValues(p: Profile, key: string): string[] {
  const config = CHOICE_FIELDS[key];
  if (!config) return [];
  const none = new Set(config.options.filter((o) => o.none).map((o) => o.value));
  const { selected, other } = parseChoices(String(toDraft(p)[key] ?? ""), config);
  return [...selected.filter((v) => !none.has(v)), ...other.split(",")]
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface HealthMosaic {
  /** Alergias como informadas ("Amendoim"); "A confirmar" com "não sei"; [] sem alergias. */
  allergies: string[];
  /** Alimentos que evita ("Camarão"); [] sem nada em especial. */
  avoided: string[];
  medication: {
    /** "GLP-1" para quem usa a caneta (declarou ou já registrou aplicação). */
    tags: string[];
    /** Nome da caneta como a pessoa a chama ("Mounjaro", sem o parêntese); sem ele, o da última aplicação. */
    name: string | null;
    /** Dose da última aplicação registrada ("2,50 mg"), só o que já foi registrado; nunca sugere. */
    dose: string | null;
    /** Outros medicamentos da anamnese: só a contagem aparece na face. */
    extraCount: number;
  };
  /** Rótulos curtos da ocupação e do tempo de cozinha ("Escritório", "30 min cozinha"). */
  routine: string[];
}

/**
 * Face do mosaico "Perfil de saúde": alergias e alimentos evitados (segurança alimentar, já usados
 * pelo app todo), a caneta pelo último registro e a rotina. Condições nunca aparecem; os demais
 * medicamentos da anamnese só como contagem.
 */
export function healthMosaic(
  state: Pick<AppState, "profile" | "appointments" | "injections">,
  today = localDate(),
): HealthMosaic {
  const p = state.profile;
  if (!p)
    return {
      allergies: [],
      avoided: [],
      medication: { tags: [], name: null, dose: null, extraCount: 0 },
      routine: [],
    };
  const allergyGroup = essentialSummary(state).groups.find((g) => g.key === "alergias");
  const last = lastInjection(state.injections, today);
  const usesPen = p.weightLossPen === "sim" || state.injections.length > 0;
  const penName = p.weightLossPenName.replace(/\s*\(.*$/, "").trim();
  const knownPen = p.weightLossPen === "sim" && penName && penName !== "Não sei o nome" ? penName : null;
  const name = knownPen ?? last?.medication ?? null;
  const extras = medicationNames(p.medications).filter(
    (med) =>
      med !== PEN_MEDICATION_CHOICE && med !== name && med !== penName && med !== last?.medication,
  );
  const occupation = choiceValues(p, "occupation")[0];
  const cooking = choiceValues(p, "cookingTime")[0];
  return {
    allergies: (allergyGroup?.chips ?? []).map(mosaicClip),
    avoided: choiceValues(p, "avoidedFoods").map(mosaicClip),
    medication: {
      tags: usesPen ? ["GLP-1"] : [],
      name: name ? mosaicClip(name) : null,
      dose: last ? fmtMg(last.doseMg) : null,
      extraCount: extras.length,
    },
    routine: [
      occupation ? (OCCUPATION_SHORT[occupation] ?? mosaicClip(occupation)) : null,
      cooking ? (COOKING_SHORT[cooking] ?? mosaicClip(cooking)) : null,
    ].filter((text): text is string => !!text),
  };
}

/** Números do corpo (ESPACO-13): com "Ocultar números do corpo" o valor vira "Oculto". */
const BODY_KEYS: ReadonlySet<string> = new Set([
  "weight",
  "height",
  "targetWeight",
  "waist",
  "hip",
  "bodyFat",
]);
export const HIDDEN_ANSWER = "Oculto";

/**
 * Respostas da etapa, na ordem, só das perguntas que se aplicam (sem meta calórica com calorias
 * ocultas; números do corpo como "Oculto" quando a pessoa os ocultou).
 */
export function sectionAnswers(profile: Profile, index: number, today = localDate()): SectionAnswer[] {
  const section = questionnaire[index];
  if (!section) return [];
  const answers = toDraft(profile);
  return section.fields
    .filter((f) => isShown(answers, f, today))
    .filter((f) => !(profile.hideCalories && f.key === "manualCalories"))
    .map((f) => ({
      key: f.key,
      label: f.label,
      value:
        profile.hideBodyNumbers && BODY_KEYS.has(f.key)
          ? HIDDEN_ANSWER
          : answerText(f, answers[f.key]),
    }));
}

export const MEASURE_STALE_DAYS = 60;
export interface AttentionItem {
  key: "allergies" | "fluid" | "measure";
  text: string;
  actionLabel: string;
  actionAria: string;
  target: { kind: "section"; index: number } | { kind: "measure" };
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000;
};

/**
 * "Precisa de atenção": alergias e restrição de líquidos como "não sei" e medição com mais de
 * 60 dias (nunca em perfil calmo). Nunca pede para revelar transtorno alimentar ou gestação.
 */
export function attentionItems(profile: Profile, today = localDate()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const allergies = sectionIndexOf("allergies");
  if (profile.allergies === "nao_sei" && allergies >= 0)
    items.push({
      key: "allergies",
      text: "Alergias estão como “não sei”. Confirmar ajuda o agente a evitar sugestões de risco.",
      actionLabel: "Revisar",
      actionAria: "Revisar alergias",
      target: { kind: "section", index: allergies },
    });
  const fluid = sectionIndexOf("fluidRestriction");
  if (profile.fluidRestriction === "nao_sei" && fluid >= 0)
    items.push({
      key: "fluid",
      text: "Restrição de líquidos está como “não sei”. Quando souber, atualize com a orientação do seu médico.",
      actionLabel: "Revisar",
      actionAria: "Revisar restrição de líquidos",
      target: { kind: "section", index: fluid },
    });
  if (
    !isCalmProfile(profile, today) &&
    dayNumber(today) - dayNumber(profile.measurementDate) > MEASURE_STALE_DAYS
  )
    items.push({
      key: "measure",
      text: `Última medição ${fmtRelDate(profile.measurementDate, today)}.`,
      actionLabel: "Registrar medidas",
      actionAria: "Registrar medidas na Evolução",
      target: { kind: "measure" },
    });
  return items;
}

const sectionKeys = (index: number) => questionnaire[index]?.fields.map((f) => f.key) ?? [];

/** Alguma resposta da etapa mudou em relação ao perfil salvo. */
export function isSectionDirty(profile: Profile, answers: Draft, index: number): boolean {
  const saved = toDraft(profile);
  return sectionKeys(index).some(
    (key) => String(answers[key] ?? "") !== String(saved[key] ?? ""),
  );
}

const labelOf = (key: string) =>
  questionnaire.flatMap((s) => s.fields).find((f) => f.key === key)?.label ?? key;

/**
 * Validação do editor de seção: erros das chaves da etapa (a primeira mensagem de cada) e, à
 * parte, os rótulos de outras etapas que a mudança invalida (ex.: nascimento depois da medição).
 */
export function sectionIssues(
  answers: Draft,
  index: number,
): { fields: Record<string, string>; outside: string[] } {
  const parsed = profileSchema.safeParse({ ...answers, aiConsentVersion: AI_CONSENT_VERSION });
  if (parsed.success) return { fields: {}, outside: [] };
  const keys = new Set(sectionKeys(index));
  const fields: Record<string, string> = {};
  const outside: string[] = [];
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (keys.has(key)) {
      if (!(key in fields)) fields[key] = issue.message;
      continue;
    }
    const label = labelOf(key);
    if (!outside.includes(label)) outside.push(label);
  }
  return { fields, outside };
}

/**
 * Prévia da meta ao editar: calorias (ou proteína, com calorias ocultas). null se a resposta é
 * inválida, se o perfil é calmo antes ou depois, se nada muda ou se a meta manual prevalece.
 */
export function goalChangePreview(before: Profile, answers: Draft, date = localDate()): string | null {
  const parsed = profileSchema.safeParse({ ...answers, aiConsentVersion: AI_CONSENT_VERSION });
  if (!parsed.success) return null;
  const after = parsed.data;
  if (isCalmProfile(before, date) || isCalmProfile(after, date)) return null;
  const from = goalsFor(before, date);
  const to = goalsFor(after, date);
  if (before.hideCalories || after.hideCalories) {
    if (from.protein === null || to.protein === null || from.protein === to.protein) return null;
    return `Sua meta de proteína passa de ${fmtNumber(from.protein)} g para ${fmtNumber(to.protein)} g por dia.`;
  }
  if (from.calories === null || to.calories === null || from.calories === to.calories) return null;
  return `Sua meta passa de ${fmtNumber(from.calories)} para ${fmtNumber(to.calories)} kcal por dia.`;
}

/**
 * Salva a seção como a anamnese completa salva (medição na data, metas do dia). Um rascunho do
 * fluxo completo ("Revisar tudo") nunca se perde: recebe as respostas da seção e mantém a etapa.
 */
export function saveSection(state: AppState, answers: Draft, index: number): AppState {
  if (!state.profile) throw new Error("Conclua a anamnese antes de editar uma seção.");
  const profile = profileSchema.parse({ ...answers, aiConsentVersion: AI_CONSENT_VERSION });
  const next = updateProfile(state, profile);
  if (!state.draft) return next;
  const picked = Object.fromEntries(
    sectionKeys(index)
      .filter((key) => answers[key] !== undefined)
      .map((key) => [key, answers[key] as Draft[string]]),
  );
  return { ...next, draft: { ...state.draft, ...picked }, draftStep: state.draftStep };
}
