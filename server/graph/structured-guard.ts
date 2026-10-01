import {
  allergenIn,
  allergenTokens,
  normalizeText,
  type AllergenMode,
} from "../../src/lib/allergens";
import {
  MEDICATION_PATTERN,
  SENSITIVE_NUDGE_PATTERN,
  matchesPattern,
} from "../../src/lib/agent-blocks";
import type { FieldKind, StructuredField, StructuredSpec } from "../structured";
import {
  isUiSensitive,
  type Flags,
  type GraphState,
  type Issue,
  type Specialist,
} from "./state";

/**
 * Guarda determinística dos campos estruturados (roda com a guarda de texto): o texto
 * renderizado não mostra que "Frango com amendoim" é o nome de um prato nem que "Aplicar a
 * caneta" é um combinado a criar. No máximo um problema por regra e papel, todos "hard".
 */

export interface StructuredLintInput<T> {
  role: Specialist;
  value: T;
  spec: StructuredSpec<T>;
  flags: Flags;
  mode: GraphState["mode"];
}

type Found = Omit<Issue, "papel">;
const TRECHO_MAX = 200;
const hard = (codigo: Issue["codigo"], field: StructuredField, correcao: string): Found => ({
  codigo,
  trecho: field.text.slice(0, TRECHO_MAX),
  correcao,
  gravidade: "hard",
});

/** Como cada tipo de campo é lido na busca de alergênicos; cartão e combinado não entram. */
const ALLERGEN_MODE: Partial<Record<FieldKind, AllergenMode>> = {
  food: "food",
  name: "name",
  prose: "prose",
};
/** "0% gordura" é rótulo de produto (nome do estoque repetido no passo), não macro inventado. */
const NUTRITION_NUMBER =
  /\d[\d.,]*\s*(kcal|quilocalorias|calorias|cal)\b|\d[\d.,]*\s*g\s+de\s+(proteina|carboidrato|gordura|lipidio|fibra)|(?<![\d.,])(?!0\s*%)\d[\d.,]*\s*%\s*(de\s+)?(proteina|carboidrato|gordura|lipidio)/;
/** Texto corrido escrito pelo modelo nos modos em que ele não deve trazer números de nutrição. */
const PROSE_CHECKED_MODES: readonly GraphState["mode"][] = ["diet", "recipe"];

type Rule = (fields: StructuredField[], input: StructuredLintInput<unknown>) => Found | null;

const RULES: Rule[] = [
  (fields, { flags }) => {
    const tokens = allergenTokens(flags.allergyDetails);
    const hit = fields.find((f) => {
      const mode = ALLERGEN_MODE[f.kind];
      return mode !== undefined && allergenIn(f.text, tokens, mode) !== null;
    });
    return hit
      ? hard(
          "alergeno",
          hit,
          "Nunca sugira alimento que coincide com alergia declarada, nem no nome do prato nem como troca.",
        )
      : null;
  },
  (fields, { mode }) => {
    const hit = fields.find(
      (f) =>
        (f.kind !== "prose" || PROSE_CHECKED_MODES.includes(mode)) &&
        NUTRITION_NUMBER.test(normalizeText(f.text)),
    );
    return hit
      ? hard(
          "dado_inventado",
          hit,
          "Não informe calorias nem macronutrientes nos campos; o app estima pela TACO.",
        )
      : null;
  },
  (fields) => {
    const hit = fields.find(
      (f) => f.kind === "habit" && matchesPattern(f.text, MEDICATION_PATTERN),
    );
    return hit
      ? hard(
          "prescricao",
          hit,
          "Não proponha combinados sobre medicamentos, doses ou aplicações.",
        )
      : null;
  },
  (fields, { flags }) => {
    if (!isUiSensitive(flags)) return null;
    const hit = fields.find(
      (f) => f.kind === "habit" && matchesPattern(f.text, SENSITIVE_NUDGE_PATTERN),
    );
    return hit
      ? hard(
          "prescricao",
          hit,
          "Em perfil sensível, não proponha combinados de peso, calorias, jejum ou restrição.",
        )
      : null;
  },
];

/** Problemas dos campos estruturados de um papel (alergênico, número nutricional, medicamento, perfil sensível). */
export function lintStructured<T>(input: StructuredLintInput<T>): Issue[] {
  const fields = input.spec.fields(input.value);
  const generic = input as unknown as StructuredLintInput<unknown>;
  return RULES.flatMap((rule) => {
    const found = rule(fields, generic);
    return found ? [{ ...found, papel: input.role }] : [];
  });
}
