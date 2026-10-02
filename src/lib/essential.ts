/**
 * Cartão "Essencial" (ESPACO-08): alergias, condições, medicamentos, cuidados e profissionais,
 * para mostrar numa consulta ou emergência. Lógica pura (web, app e relatório). Medicamentos
 * aparecem só pelo nome: dose e frequência nunca saem daqui. Transtorno alimentar nunca é listado.
 */
import { parseChoices } from "../components/anamnese/inputs";
import { CHOICE_FIELDS } from "../data/anamneseOptions";
import type { AppState, Appointment, Profile } from "../types";
import { normalizeText } from "./allergens";
import { conditionLabels, parseConditionTags, type ConditionTag } from "./conditions";
import { plural } from "./format";

export type EssentialKey =
  "alergias" | "condicoes" | "medicamentos" | "cuidados" | "profissionais";
export interface EssentialGroup {
  key: EssentialKey;
  title: string;
  chips: string[];
  note?: string;
}
export interface EssentialSummary {
  groups: EssentialGroup[];
  /** "2 alergias · 2 condições · 3 medicamentos", ou ESSENTIAL_COPY.empty. */
  summary: string;
  /** Nenhum grupo para mostrar (nem cuidados nem profissionais). */
  isEmpty: boolean;
}

export const ESSENTIAL_COPY = {
  title: "Essencial",
  sub: "Para mostrar numa consulta ou emergência",
  show: "Mostrar detalhes",
  hide: "Ocultar detalhes",
  edit: "Editar na anamnese",
  report: "Relatório para consulta",
  medsNote: "Informativo, como você informou na anamnese; sem doses.",
  empty: "Nenhuma alergia, condição ou medicamento informado",
} as const;

const GROUP_TITLE: Record<EssentialKey, string> = {
  alergias: "Alergias",
  condicoes: "Condições",
  medicamentos: "Medicamentos",
  cuidados: "Cuidados",
  profissionais: "Profissionais",
};
const CHIP_MAX_CHARS = 40;
const CHIPS_MAX = 8;
const PROFESSIONALS_MAX = 3;
const UNKNOWN_PEN = "Não sei o nome";
const UNKNOWN_PEN_CHIP = "Caneta para emagrecer (nome não informado)";
const ALLERGIES_NO_DETAILS = "Alergias informadas, sem detalhes";
const OTHER_TAG: ConditionTag = "outra";
const OTHER_CONDITION_CHIP = "Outra condição";
/**
 * Do primeiro número solto em diante, inclusive entre parênteses: "Losartana 50 mg 1x ao dia" e
 * "Sertralina (50mg)" → só o nome; o número colado ao nome ("Vitamina B12") fica.
 */
const DOSE_TAIL = /\s*\(?\s*(?<![\p{L}\p{N}])\d.*$/u;
/** Unidade de dose sem número ("UI conforme glicemia"): dali em diante sai. */
const DOSE_UNIT_TAIL = /\s*\(?\s*(?<![\p{L}\p{N}])(?:mg|mcg|ml|ui|unidades?)(?![\p{L}\p{N}]).*$/iu;
/** Frequência e horário ("uma vez ao dia", "à noite", "em jejum"): dali em diante sai. */
const FREQUENCY_TAIL =
  /\s*(?<![\p{L}\p{N}])(?:(?:uma|duas|tr[eê]s|quatro)\s+vez(?:es)?|diariamente|semanalmente|(?:ao|por|todo|toda)\s+(?:dia|semana|m[eê]s)|de\s+manh[ãa]|[àa]\s+noite|[àa]\s+tarde|em\s+jejum|ao\s+deitar|a\s+cada)(?![\p{L}\p{N}]).*$/iu;
const TRAILING_PUNCT = /[\s:;,.–(-]+$/;

const capitalize = (s: string) =>
  s ? `${s[0]!.toLocaleUpperCase("pt-BR")}${s.slice(1)}` : s;
function clipChip(s: string): string {
  const chars = Array.from(s);
  return chars.length > CHIP_MAX_CHARS
    ? `${chars
        .slice(0, CHIP_MAX_CHARS - 1)
        .join("")
        .trimEnd()}…`
    : s;
}

/** Rótulos do próprio app: não passam pelo recorte de 40 caracteres do texto digitado. */
const FIXED_CHIPS: ReadonlySet<string> = new Set([
  UNKNOWN_PEN_CHIP,
  ALLERGIES_NO_DETAILS,
  OTHER_CONDITION_CHIP,
]);

/** Apara, tira vazios, junta repetidos sem caixa nem acento, primeira letra maiúscula, até 8. */
function cleanChips(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    const chip = FIXED_CHIPS.has(trimmed)
      ? trimmed
      : clipChip(capitalize(trimmed));
    const key = normalizeText(chip);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push(chip);
  }
  return chips.slice(0, CHIPS_MAX);
}

/** Opções marcadas (sem as excludentes: "Nenhuma", "Não uso…", "Prefiro não…") e o texto livre. */
function choiceParts(
  value: string,
  key: "conditions" | "medications" | "allergyDetails",
): string[] {
  const config = CHOICE_FIELDS[key];
  if (!config) return [];
  const none = new Set(
    config.options.filter((o) => o.none).map((o) => o.value),
  );
  const { selected, other } = parseChoices(value, config);
  return [...selected.filter((v) => !none.has(v)), ...other.split(", ")];
}

/** Só o nome de um medicamento: tira dose, unidade e frequência (parte só de dose vira ""). */
const medicationName = (text: string): string =>
  text
    .replace(DOSE_TAIL, "")
    .replace(DOSE_UNIT_TAIL, "")
    .replace(FREQUENCY_TAIL, "")
    .replace(TRAILING_PUNCT, "")
    .trim();

/** Só os nomes dos medicamentos: dose e frequência ficam de fora ("Losartana, 50 mg, 1x ao dia" → ["Losartana"]). */
export function medicationNames(text: string): string[] {
  return cleanChips(choiceParts(text, "medications").map(medicationName));
}

/** Chip da caneta: o nome sem dose; sem nome (ou só a dose) vira "nome não informado". */
function penChip(name: string): string {
  const trimmed = name.trim();
  const clean = trimmed === UNKNOWN_PEN ? "" : medicationName(trimmed);
  return clean || UNKNOWN_PEN_CHIP;
}

function allergyGroup(p: Profile): EssentialGroup | null {
  if (p.allergies === "nao") return null;
  if (p.allergies === "nao_sei") return group("alergias", ["A confirmar"]);
  const chips = cleanChips(choiceParts(p.allergyDetails, "allergyDetails"));
  return group("alergias", chips.length ? chips : [ALLERGIES_NO_DETAILS]);
}

/**
 * Condições: as marcadas na lista fechada (sem "Nenhuma") e os detalhes do texto livre. "Outra"
 * vira os próprios detalhes; sem detalhes, fica o chip "Outra condição".
 */
function conditionGroup(p: Profile): EssentialGroup | null {
  const tags = parseConditionTags(p.conditionTags);
  const details = choiceParts(p.conditions, "conditions");
  const hasDetails = details.some((d) => d.trim() !== "");
  const labels = conditionLabels(tags.filter((t) => t !== OTHER_TAG));
  const other = tags.includes(OTHER_TAG) && !hasDetails ? [OTHER_CONDITION_CHIP] : [];
  return group("condicoes", cleanChips([...labels, ...other, ...details]));
}

function medicationGroup(p: Profile): EssentialGroup | null {
  const pen = p.weightLossPen === "sim" ? [penChip(p.weightLossPenName)] : [];
  const chips = cleanChips([...medicationNames(p.medications), ...pen]);
  return chips.length
    ? {
        key: "medicamentos",
        title: GROUP_TITLE.medicamentos,
        chips,
        note: ESSENTIAL_COPY.medsNote,
      }
    : null;
}

function careChips(p: Profile): string[] {
  return [
    ...(p.pregnancy === "gestacao" ? ["Gestação"] : []),
    ...(p.pregnancy === "amamentacao" ? ["Amamentação"] : []),
    ...(p.fluidRestriction === "sim" ? ["Restrição de líquidos"] : []),
  ];
}

/** Profissionais das consultas, da mais recente para a mais antiga, sem repetir o nome; até 3. */
function professionalChips(appointments: readonly Appointment[]): string[] {
  const seen = new Set<string>();
  return [...appointments]
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .filter((a) => {
      const key = normalizeText(a.professional.trim());
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, PROFESSIONALS_MAX)
    .map((a) => {
      const registration = a.registration.trim();
      return registration
        ? `${a.professional.trim()} · ${registration}`
        : a.professional.trim();
    });
}

function group(key: EssentialKey, chips: string[]): EssentialGroup | null {
  return chips.length ? { key, title: GROUP_TITLE[key], chips } : null;
}

function summaryText(p: Profile, groups: readonly EssentialGroup[]): string {
  const chipsOf = (key: EssentialKey) =>
    groups.find((g) => g.key === key)?.chips ?? [];
  const count = (key: EssentialKey) => chipsOf(key).length;
  const named = chipsOf("alergias").filter(
    (c) => c !== ALLERGIES_NO_DETAILS,
  ).length;
  const allergies =
    p.allergies === "nao_sei"
      ? "alergias a confirmar"
      : p.allergies === "sim"
        ? named
          ? plural(named, "alergia", "alergias")
          : "alergias informadas"
        : null;
  const parts = [
    allergies,
    count("condicoes")
      ? plural(count("condicoes"), "condição", "condições")
      : null,
    count("medicamentos")
      ? plural(count("medicamentos"), "medicamento", "medicamentos")
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : ESSENTIAL_COPY.empty;
}

/** Grupos do cartão, na ordem fixa, e o resumo da face (sem nomes de condições nem remédios). */
export function essentialSummary(
  state: Pick<AppState, "profile" | "appointments">,
): EssentialSummary {
  const p = state.profile;
  if (!p) return { groups: [], summary: ESSENTIAL_COPY.empty, isEmpty: true };
  const groups = [
    allergyGroup(p),
    conditionGroup(p),
    medicationGroup(p),
    group("cuidados", careChips(p)),
    group("profissionais", professionalChips(state.appointments)),
  ].filter((g): g is EssentialGroup => g !== null);
  return {
    groups,
    summary: summaryText(p, groups),
    isEmpty: groups.length === 0,
  };
}
